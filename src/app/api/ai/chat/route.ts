import { NextRequest, NextResponse } from "next/server";
import { AIProvider } from "@/types/ai.types";
import { resolveAIKey, getEnvKey, maskApiKey } from "@/lib/ai/env-keys";
import {
  cascadeModels,
  normalizeModel,
  AI_SERVER_TIMEOUT_MS,
  AI_MAX_MESSAGE_CHARS,
  AI_MAX_HISTORY_TURNS,
} from "@/lib/ai/models";

export const dynamic = "force-dynamic";

interface ChatRequestPayload {
  message: string;
  history?: { role: "user" | "assistant" | "system"; content: string }[];
  context?: {
    cases?: any[];
    queue?: any[];
    milling?: any[];
    finishing?: any[];
    printers?: any[];
    resins?: any[];
  };
  provider?: AIProvider;
  apiKey?: string;
  model?: string;
}

/**
 * Sanitiza o histórico para o formato estrito do Google Gemini:
 * 1. Ignora mensagens 'system' (vão via system_instruction).
 * 2. Converte 'assistant' para 'model'.
 * 3. Mescla turnos consecutivos do mesmo autor (Gemini exige alternância estrita user -> model -> user).
 * 4. Garante que a primeira mensagem seja 'user'.
 */
function formatGeminiContents(
  history: { role: "user" | "assistant" | "system"; content: string }[],
  userMessage: string
) {
  const rawTurns: { role: "user" | "model"; text: string }[] = [];
  for (const h of history.slice(-AI_MAX_HISTORY_TURNS)) {
    if (h.role === "system") continue;
    const role: "user" | "model" = h.role === "assistant" ? "model" : "user";
    const text = typeof h.content === "string" ? h.content.trim().slice(0, 2000) : "";
    if (text) {
      rawTurns.push({ role, text });
    }
  }
  rawTurns.push({ role: "user", text: userMessage.trim() });

  const contents: { role: "user" | "model"; parts: { text: string }[] }[] = [];
  for (const turn of rawTurns) {
    const last = contents[contents.length - 1];
    if (last && last.role === turn.role) {
      last.parts[0].text += "\n" + turn.text;
    } else {
      contents.push({ role: turn.role, parts: [{ text: turn.text }] });
    }
  }

  if (contents.length > 0 && contents[0].role !== "user") {
    contents.shift();
  }

  return contents;
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  try {
    const body = (await req.json()) as ChatRequestPayload;
    const {
      message,
      history = [],
      context = {},
      provider = "GEMINI",
      model,
    } = body;

    // Validação de entrada (evita chamadas vazias ou gigantescas)
    const cleanMessage = typeof message === "string" ? message.trim() : "";
    if (!cleanMessage) {
      return NextResponse.json(
        { error: "Mensagem vazia. Digite sua dúvida para a OdontoIA." },
        { status: 400 }
      );
    }
    if (cleanMessage.length > AI_MAX_MESSAGE_CHARS) {
      return NextResponse.json(
        { error: `Mensagem muito longa (máx. ${AI_MAX_MESSAGE_CHARS} caracteres). Resuma sua dúvida.` },
        { status: 413 }
      );
    }

    // Resolução resiliente da Chave de API (prioriza GEMINI e depois GROQ)
    const { apiKey, activeProvider, source } = resolveAIKey(provider, body.apiKey);

    // Contexto condensado do laboratório para alimentar o System Prompt
    const labContextSummary = `
CONTEXTO ATUAL DO LABORATÓRIO ODONTOPRINT:
- Trabalhos Cadastrados: ${JSON.stringify(
      (context.cases || []).map((c: any) => ({
        paciente: c.patient_code,
        nome: c.patient_name,
        status: c.status,
        itens: c.items_count,
      }))
    )}
- Itens na Fila de Impressão 3D: ${JSON.stringify(
      (context.queue || []).map((q: any) => ({
        paciente: q.patient_code,
        nome: q.patient_name,
        modelo: q.file_type,
        reimpressao: q.is_retry,
      }))
    )}
- Parque de Impressoras 3D: ${JSON.stringify(
      (context.printers || []).map((p: any) => ({
        nome: p.name,
        marca: p.brand,
        modelo: p.model,
        status: p.calculated_status,
        dias_desde_manutencao: p.days_since_maintenance,
      }))
    )}
- Lotes de Resina Calibrados: ${JSON.stringify(
      (context.resins || []).map((r: any) => ({
        marca: r.brand,
        tipo: r.resin_type,
        lote: r.lot,
        status: r.status,
      }))
    )}
`;

    const systemPrompt = `Você é a OdontoIA, copiloto técnico operacional especialista em odontologia digital e impressão 3D (SLA/DLP/LCD) do laboratório OdontoPrint.
Você fala português brasileiro com clareza, simpatia profissional, objetividade e precisão técnica de prótese dentária.
Suas funções:
1. Localizar e informar a situação de pacientes e modelos da equipe técnica.
2. Auxiliar operadores técnicos com dúvidas de calibração de resinas (tempos de exposição 405nm, camadas de base, lift speed, lavagem em álcool isopropílico e pós-cura UV).
3. Auxiliar no diagnóstico de falhas de impressão (descolamento de mesa, delaminação, quebra de suportes).
4. Fornecer respostas diretas, úteis e concisas.`;

    // 1. Processamento GEMINI — cascata entre modelos reais (3.8 -> 3.5 -> 2.5)
    const executeGemini = async (key: string, selectedModel?: string) => {
      const modelsToTry = cascadeModels("GEMINI", selectedModel);
      let lastErr = "";

      for (const geminiModel of modelsToTry) {
        const contents = formatGeminiContents(history, cleanMessage);
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${key}`;

        try {
          let geminiRes = await fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              system_instruction: {
                parts: [{ text: systemPrompt + "\n" + labContextSummary }],
              },
              contents,
              generationConfig: {
                temperature: 0.4,
                maxOutputTokens: 800,
              },
            }),
            signal: AbortSignal.timeout(AI_SERVER_TIMEOUT_MS),
          });

          // Se falhar formato com system_instruction, tenta formato universal
          if (!geminiRes.ok) {
            geminiRes = await fetch(geminiUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [
                  {
                    role: "user",
                    parts: [
                      {
                        text: `[INSTRUÇÕES DO SISTEMA]\n${systemPrompt}\n${labContextSummary}\n[FIM INSTRUÇÕES]\n\n${cleanMessage}`,
                      },
                    ],
                  },
                ],
                generationConfig: {
                  temperature: 0.4,
                  maxOutputTokens: 800,
                },
              }),
              signal: AbortSignal.timeout(AI_SERVER_TIMEOUT_MS),
            });
          }

          if (geminiRes.ok) {
            const data = await geminiRes.json();
            const reply =
              data.candidates?.[0]?.content?.parts?.[0]?.text ||
              "Desculpe, não consegui gerar uma resposta.";
            return {
              reply,
              provider: "GEMINI",
              model: geminiModel,
              source,
              latency: Date.now() - startTime,
            };
          }

          const errData = await geminiRes.json().catch(() => ({}));
          const rawMsg = errData?.error?.message || `HTTP ${geminiRes.status}`;
          const code = errData?.error?.code || geminiRes.status;
          lastErr = `[${geminiModel}] ${rawMsg}`;

          // Erro de chave/cota não adianta trocar de modelo: propaga direto
          if (
            rawMsg.includes("API key not valid") ||
            rawMsg.includes("API_KEY_INVALID")
          ) {
            throw new Error("Chave de API do Google Gemini inválida ou não autorizada. Verifique no console https://aistudio.google.com/app/apikey.");
          } else if (code === 429 || rawMsg.includes("RESOURCE_EXHAUSTED") || rawMsg.includes("quota")) {
            throw new Error("Cota de requisições temporariamente esgotada (Rate Limit) no Google Gemini. Aguarde 1 minuto.");
          }
        } catch (e: any) {
          if (e?.message?.includes("Chave de API") || e?.message?.includes("Cota de requisições")) throw e;
          lastErr = `[${geminiModel}] ${e?.name === "TimeoutError" ? "Tempo esgotado (25s)" : e?.message || String(e)}`;
        }
      }

      throw new Error(`Erro no Google Gemini: ${lastErr}`);
    };

    // 2. Processamento GROQ — cascata entre modelos de produção
    const executeGroq = async (key: string, selectedModel?: string) => {
      const normalized = normalizeModel("GROQ", selectedModel);
      const modelsToTry = cascadeModels("GROQ", normalized);

      // Histórico sanitizado: sem 'system' no meio, sem conteúdos vazios
      const cleanHistory = history
        .filter((h) => h.role === "user" || h.role === "assistant")
        .slice(-AI_MAX_HISTORY_TURNS)
        .map((h) => ({
          role: h.role,
          content: typeof h.content === "string" ? h.content.slice(0, 2000) : "",
        }))
        .filter((h) => h.content.trim());

      let lastGroqError = "";

      for (const m of modelsToTry) {
        try {
          const groqRes = await fetch(
            "https://api.groq.com/openai/v1/chat/completions",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${key}`,
              },
              body: JSON.stringify({
                model: m,
                messages: [
                  {
                    role: "system",
                    content: systemPrompt + "\n" + labContextSummary,
                  },
                  ...cleanHistory,
                  { role: "user", content: cleanMessage },
                ],
                temperature: 0.4,
                max_tokens: 800,
              }),
              signal: AbortSignal.timeout(AI_SERVER_TIMEOUT_MS),
            }
          );

          if (groqRes.ok) {
            const data = await groqRes.json();
            const reply =
              data.choices?.[0]?.message?.content ||
              "Desculpe, não consegui gerar uma resposta.";
            return {
              reply,
              provider: "GROQ",
              model: m,
              source,
              latency: Date.now() - startTime,
            };
          } else {
            const errData = await groqRes.json().catch(() => ({}));
            lastGroqError = `[${m}] ${errData?.error?.message || `HTTP ${groqRes.status}`}`;
          }
        } catch (e: any) {
          lastGroqError = `[${m}] ${e?.name === "TimeoutError" ? "Tempo esgotado (25s)" : e?.message || String(e)}`;
        }
      }

      throw new Error(`Erro na API Groq: ${lastGroqError}`);
    };

    // 3. Execução da IA com Fallback Cruzado Resiliente
    if (apiKey) {
      if (activeProvider === "GEMINI") {
        try {
          const result = await executeGemini(apiKey, model);
          return NextResponse.json(result);
        } catch (geminiErr: any) {
          console.warn("Google Gemini falhou:", geminiErr?.message);

          // Fallback automático para Groq se houver chave no Render
          const groqBackupKey = getEnvKey("GROQ");
          if (groqBackupKey) {
            try {
              const groqResult = await executeGroq(groqBackupKey, model);
              return NextResponse.json({
                ...groqResult,
                note: `Google Gemini 3.8 indisponível (${geminiErr?.message}). Resposta atendida via Groq Cloud (${groqResult.model}).`,
              });
            } catch (groqErr: any) {
              const diagnosticMessage = `❌ Falha ao conectar com os Provedores de IA:\n• Google Gemini 3.8: ${geminiErr?.message}\n• Groq Fallback: ${groqErr?.message}\n• Chave testada: ${maskApiKey(apiKey)}`;
              return NextResponse.json(
                { error: "Falha na conexão com Google Gemini 3.8", details: diagnosticMessage },
                { status: 500 }
              );
            }
          }

          const diagnosticMessage = `❌ Falha ao conectar com o Google Gemini 3.8:\n• Motivo: ${geminiErr?.message}\n• Chave testada: ${maskApiKey(apiKey)} (${source === "render" ? "Render Environment Variables" : "Painel Local"})\n• Dica: Verifique se sua chave no Google AI Studio está ativa.`;
          return NextResponse.json(
            { error: "Falha na conexão com Google Gemini 3.8", details: diagnosticMessage },
            { status: 500 }
          );
        }
      }

      if (activeProvider === "GROQ") {
        try {
          const result = await executeGroq(apiKey, model);
          return NextResponse.json(result);
        } catch (groqErr: any) {
          console.warn("Groq falhou:", groqErr?.message);

          // Fallback automático para Gemini se houver chave no Render
          const geminiBackupKey = getEnvKey("GEMINI");
          if (geminiBackupKey) {
            try {
              const geminiResult = await executeGemini(geminiBackupKey, model);
              return NextResponse.json({
                ...geminiResult,
                note: `Groq indisponível (${groqErr?.message}). Resposta atendida via Google Gemini 3.8.`,
              });
            } catch (geminiErr: any) {
              const diagnosticMessage = `❌ Falha ao conectar com os Provedores de IA:\n• Groq Cloud: ${groqErr?.message}\n• Google Gemini Fallback: ${geminiErr?.message}\n• Chave testada: ${maskApiKey(apiKey)}`;
              return NextResponse.json(
                { error: "Falha na conexão com Groq", details: diagnosticMessage },
                { status: 500 }
              );
            }
          }

          const diagnosticMessage = `❌ Falha ao conectar com Groq Cloud:\n• Motivo: ${groqErr?.message}\n• Chave testada: ${maskApiKey(apiKey)}`;
          return NextResponse.json(
            { error: "Falha na conexão com Groq", details: diagnosticMessage },
            { status: 500 }
          );
        }
      }
    }

    // 4. MODO LOCAL INTELIGENTE (Quando nenhuma chave foi configurada nem no Render nem localmente)
    const lower = cleanMessage.toLowerCase();
    let localReply = "";

    const allCases = context.cases || [];
    const matchedCase = allCases.find(
      (c: any) =>
        lower.includes(c.patient_code?.toLowerCase()) ||
        (c.patient_name && lower.includes(c.patient_name.toLowerCase()))
    );

    if (matchedCase) {
      const pCode = matchedCase.patient_code;
      const inQueue = (context.queue || []).filter(
        (q: any) => q.patient_code === pCode
      );
      localReply = `🔍 **Status do Trabalho ${pCode} (${matchedCase.patient_name || "Paciente"}):**\n\n`;
      if (inQueue.length > 0) {
        localReply += `📋 **Fila de Impressão 3D (FIFO)**: Existem **${inQueue.length} modelo(s)** aguardando fatiamento e envio para as impressoras.`;
      } else {
        localReply += `O caso está registrado no sistema com status **${matchedCase.status || "Ativo"}**.`;
      }
    } else if (
      lower.includes("impressora") ||
      lower.includes("maquina") ||
      lower.includes("manuten")
    ) {
      const printers = context.printers || [];
      const av = printers.filter(
        (p: any) => p.calculated_status === "DISPONIVEL"
      );
      const bl = printers.filter(
        (p: any) => p.calculated_status !== "DISPONIVEL"
      );
      localReply = `🖨️ **Parque de Impressoras 3D:**\n- **${av.length} impressora(s) liberada(s)** para impressão com manutenção em dia.\n`;
      if (bl.length > 0) {
        localReply += `- **${bl.length} impressora(s) bloqueada(s)**: ${bl.map((b: any) => `${b.name} (${b.calculated_status})`).join(", ")}.\n`;
      }
    } else if (lower.includes("fila") || lower.includes("quantos")) {
      const q = context.queue || [];
      localReply = `📋 **Situação da Fila de Impressão:**\nAtualmente temos **${q.length} modelo(s) aguardando** na fila prioritária FIFO para envio ao Fatiador.`;
    } else if (lower.includes("resina") || lower.includes("calibr")) {
      localReply = `🧪 **Calibração de Resinas:**\nO protocolo OdontoPrint exige calibração técnica de teste com medição do hexágono entre **9.99mm e 10.01mm**.`;
    } else {
      localReply = `Olá! Sou a **OdontoIA**, copiloto do laboratório OdontoPrint. Posso te ajudar com status de pacientes, fila de impressão 3D e calibração de resinas.`;
    }

    localReply += `\n\n*(💡 Modo Local Ativo. Para respostas avançadas com IA em tempo real, configure sua chave do Google Gemini como GEMINI_API_KEY no Render).*`;

    return NextResponse.json({
      reply: localReply,
      provider: "LOCAL_FALLBACK",
      latency: Date.now() - startTime,
    });
  } catch (error: any) {
    console.error("Erro na rota AI Chat:", error);
    return NextResponse.json(
      {
        error: error?.message || "Erro ao processar mensagem com a IA.",
        details: `[DIAGNÓSTICO TÉCNICO]\nErro: ${error?.message || "Erro desconhecido"}`,
      },
      { status: 500 }
    );
  }
}
