import { NextRequest, NextResponse } from "next/server";
import { AIProvider } from "@/types/ai.types";
import { resolveAIKey, getEnvKey, maskApiKey } from "@/lib/ai/env-keys";

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
  customEndpoint?: string;
}

/**
 * Sanitiza o histórico para o formato estrito do Google Gemini:
 * 1. Converte 'assistant' para 'model'.
 * 2. Mescla turnos consecutivos do mesmo autor (Gemini exige alternância estrita user -> model -> user).
 * 3. Garante que a primeira mensagem seja 'user'.
 */
function formatGeminiContents(
  history: { role: "user" | "assistant" | "system"; content: string }[],
  userMessage: string
) {
  const rawTurns: { role: "user" | "model"; text: string }[] = [];
  for (const h of history.slice(-6)) {
    const role: "user" | "model" = h.role === "assistant" ? "model" : "user";
    const text = typeof h.content === "string" ? h.content.trim() : "";
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
    // GEMINI É O PROVEDOR PRINCIPAL PRIORIZADO
    const {
      message,
      history = [],
      context = {},
      provider = "GEMINI",
      model,
      customEndpoint,
    } = body;

    // Resolução resiliente da Chave de API (prioriza GEMINI e Render Environment Variables)
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

    // 1. Processamento GEMINI (PRIORIDADE #1)
    const executeGemini = async (key: string, selectedModel?: string) => {
      const geminiModel = selectedModel?.startsWith("gemini")
        ? selectedModel
        : "gemini-1.5-flash";
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${key}`;

      const contents = formatGeminiContents(history, message);

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
      });

      // Se falhar e não estava usando gemini-1.5-flash, tenta formato universal com gemini-1.5-flash
      if (!geminiRes.ok && geminiModel !== "gemini-1.5-flash") {
        const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
        geminiRes = await fetch(fallbackUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: `[INSTRUÇÕES DO SISTEMA]\n${systemPrompt}\n${labContextSummary}\n[FIM INSTRUÇÕES]\n\n${message}`,
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.4,
              maxOutputTokens: 800,
            },
          }),
        });
      }

      if (!geminiRes.ok) {
        const errData = await geminiRes.json().catch(() => ({}));
        const rawMsg = errData?.error?.message || `HTTP ${geminiRes.status}`;
        const code = errData?.error?.code || geminiRes.status;
        const status = errData?.error?.status || "";

        let explanation = "";
        if (
          rawMsg.includes("API key not valid") ||
          rawMsg.includes("API_KEY_INVALID")
        ) {
          explanation =
            "Chave de API do Google Gemini inválida ou não autorizada. Verifique no console https://aistudio.google.com/app/apikey.";
        } else if (
          code === 429 ||
          rawMsg.includes("RESOURCE_EXHAUSTED") ||
          rawMsg.includes("quota")
        ) {
          explanation =
            "Cota de requisições temporariamente esgotada (Rate Limit) no Google Gemini. Aguarde 1 minuto.";
        } else if (code === 404 || rawMsg.includes("not found")) {
          explanation = `Modelo Gemini "${geminiModel}" não encontrado na versão v1beta.`;
        } else {
          explanation = `Erro retornado pelo Google Gemini (${status || code}): ${rawMsg}`;
        }

        throw new Error(explanation);
      }

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
    };

    // 2. Processamento GROQ
    const executeGroq = async (key: string, selectedModel?: string) => {
      const groqModel = selectedModel || "llama-3.3-70b-versatile";
      const groqRes = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: groqModel,
            messages: [
              {
                role: "system",
                content: systemPrompt + "\n" + labContextSummary,
              },
              ...history.slice(-6),
              { role: "user", content: message },
            ],
            temperature: 0.4,
            max_tokens: 800,
          }),
        }
      );

      if (!groqRes.ok) {
        const errData = await groqRes.json().catch(() => ({}));
        const rawMsg = errData?.error?.message || `HTTP ${groqRes.status}`;
        throw new Error(`Erro na API Groq (${groqRes.status}): ${rawMsg}`);
      }

      const data = await groqRes.json();
      const reply =
        data.choices?.[0]?.message?.content ||
        "Desculpe, não consegui gerar uma resposta.";
      return {
        reply,
        provider: "GROQ",
        model: groqModel,
        source,
        latency: Date.now() - startTime,
      };
    };

    // 3. EXECUÇÃO COM PRIORIDADE GEMINI E FALLBACK RESILIENTE
    if (apiKey || (activeProvider === "OPENAI_COMPATIBLE" && customEndpoint)) {
      if (activeProvider === "GEMINI") {
        try {
          const result = await executeGemini(apiKey, model);
          return NextResponse.json(result);
        } catch (geminiErr: any) {
          console.warn("Google Gemini falhou:", geminiErr?.message);

          // Fallback automático para Groq se disponível no Render
          const groqBackupKey = getEnvKey("GROQ");
          if (groqBackupKey) {
            try {
              const groqResult = await executeGroq(groqBackupKey);
              return NextResponse.json({
                ...groqResult,
                note: `Google Gemini indisponível (${geminiErr?.message}). Resposta atendida automaticamente via Groq Cloud.`,
              });
            } catch (groqErr: any) {
              const diagnosticMessage = `❌ Falha ao conectar com os Provedores de IA:\n• Google Gemini: ${geminiErr?.message}\n• Groq Fallback: ${groqErr?.message}\n• Chave Gemini testada: ${maskApiKey(apiKey)} (${source === "render" ? "Render Environment Variables" : "Painel Local"})`;
              return NextResponse.json(
                {
                  error: "Falha na conexão com Google Gemini",
                  details: diagnosticMessage,
                },
                { status: 500 }
              );
            }
          }

          const diagnosticMessage = `❌ Falha ao conectar com o Google Gemini:\n• Motivo: ${geminiErr?.message}\n• Chave testada: ${maskApiKey(apiKey)} (${source === "render" ? "Render Environment Variables" : "Painel Local"})\n• Dica: Verifique se sua chave no Google AI Studio está ativa.`;
          return NextResponse.json(
            {
              error: "Falha na conexão com Google Gemini",
              details: diagnosticMessage,
            },
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
          // Fallback para Gemini
          const geminiBackupKey = getEnvKey("GEMINI");
          if (geminiBackupKey) {
            try {
              const geminiResult = await executeGemini(geminiBackupKey);
              return NextResponse.json({
                ...geminiResult,
                note: `Groq indisponível (${groqErr?.message}). Resposta atendida automaticamente via Google Gemini.`,
              });
            } catch (geminiErr: any) {
              const diagnosticMessage = `❌ Falha ao conectar com os Provedores de IA:\n• Groq Cloud: ${groqErr?.message}\n• Google Gemini Fallback: ${geminiErr?.message}\n• Chave testada: ${maskApiKey(apiKey)}`;
              return NextResponse.json(
                {
                  error: "Falha na conexão com Groq",
                  details: diagnosticMessage,
                },
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

      if (activeProvider === "OPENAI") {
        const openaiModel = model || "gpt-4o-mini";
        const openaiRes = await fetch(
          "https://api.openai.com/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: openaiModel,
              messages: [
                {
                  role: "system",
                  content: systemPrompt + "\n" + labContextSummary,
                },
                ...history.slice(-6),
                { role: "user", content: message },
              ],
              temperature: 0.4,
              max_tokens: 800,
            }),
          }
        );

        if (!openaiRes.ok) {
          const errData = await openaiRes.json().catch(() => ({}));
          const errMsg = errData?.error?.message || `HTTP ${openaiRes.status}`;
          return NextResponse.json(
            {
              error: "Falha na conexão com OpenAI",
              details: `Erro na API OpenAI: ${errMsg}`,
            },
            { status: 500 }
          );
        }

        const data = await openaiRes.json();
        const reply =
          data.choices?.[0]?.message?.content ||
          "Desculpe, não consegui gerar uma resposta.";
        return NextResponse.json({
          reply,
          provider: "OPENAI",
          model: openaiModel,
          source,
          latency: Date.now() - startTime,
        });
      }

      if (activeProvider === "MISTRAL") {
        const mistralModel = model || "mistral-large-latest";
        const mistralRes = await fetch(
          "https://api.mistral.ai/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: mistralModel,
              messages: [
                {
                  role: "system",
                  content: systemPrompt + "\n" + labContextSummary,
                },
                ...history.slice(-6),
                { role: "user", content: message },
              ],
              temperature: 0.4,
              max_tokens: 800,
            }),
          }
        );

        if (!mistralRes.ok) {
          const errData = await mistralRes.json().catch(() => ({}));
          const errMsg = errData?.error?.message || `HTTP ${mistralRes.status}`;
          return NextResponse.json(
            {
              error: "Falha na conexão com Mistral",
              details: `Erro na API Mistral: ${errMsg}`,
            },
            { status: 500 }
          );
        }

        const data = await mistralRes.json();
        const reply =
          data.choices?.[0]?.message?.content ||
          "Desculpe, não consegui gerar uma resposta.";
        return NextResponse.json({
          reply,
          provider: "MISTRAL",
          model: mistralModel,
          source,
          latency: Date.now() - startTime,
        });
      }

      if (activeProvider === "OPENAI_COMPATIBLE") {
        const targetUrl =
          customEndpoint?.trim() || "http://localhost:11434/v1/chat/completions";
        const compatUrl = targetUrl.includes("/chat/completions")
          ? targetUrl
          : targetUrl.replace(/\/+$/, "") + "/chat/completions";
        const compatModel = model || "llama3";

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (apiKey) {
          headers["Authorization"] = `Bearer ${apiKey}`;
        }

        const compatRes = await fetch(compatUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: compatModel,
            messages: [
              {
                role: "system",
                content: systemPrompt + "\n" + labContextSummary,
              },
              ...history.slice(-6),
              { role: "user", content: message },
            ],
            temperature: 0.4,
            max_tokens: 800,
          }),
        });

        if (!compatRes.ok) {
          const errData = await compatRes.json().catch(() => ({}));
          const errMsg = errData?.error?.message || `HTTP ${compatRes.status}`;
          return NextResponse.json(
            {
              error: "Falha na conexão com servidor compatível",
              details: `Erro no servidor compatível: ${errMsg}`,
            },
            { status: 500 }
          );
        }

        const data = await compatRes.json();
        const reply =
          data.choices?.[0]?.message?.content ||
          "Desculpe, não consegui gerar uma resposta.";
        return NextResponse.json({
          reply,
          provider: "OPENAI_COMPATIBLE",
          model: compatModel,
          source,
          latency: Date.now() - startTime,
        });
      }
    }

    // 4. MODO LOCAL / FALLBACK INTELIGENTE (Quando nenhuma chave foi configurada nem no Render nem localmente)
    const lower = message.toLowerCase();
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

    localReply += `\n\n*(💡 Modo Local Ativo. Para ativar o motor generativo em tempo real via Google Gemini, configure a chave no Render como GEMINI_API_KEY).*`;

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
        details: `[DIAGNÓSTICO TÉCNICO]\nErro: ${error?.message || "Erro desconhecido"}\nStack: ${error?.stack || "N/A"}`,
      },
      { status: 500 }
    );
  }
}
