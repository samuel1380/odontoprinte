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
    printers?: any[];
    resins?: any[];
    printing?: any[];
    models?: any[];
    batches?: any[];
    waitingModels?: number;
    failedCount?: number;
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

    // Roteamento inteligente: detecta perguntas simples vs complexas
    // - Perguntas simples/rápidas (status, contagem, cumprimentos, consultas diretas) -> GROQ (ultra-rápido)
    // - Perguntas complexas/técnicas (calibração, falhas, diagnósticos, química, mesa 3D, cálculos) -> GEMINI (Gemini 3.8 Flash Raciocínio)
    let targetProvider = provider;
    const lowerMsg = cleanMessage.toLowerCase();
    const isComplex =
      lowerMsg.includes("calibr") ||
      lowerMsg.includes("falh") ||
      lowerMsg.includes("defeit") ||
      lowerMsg.includes("camada") ||
      lowerMsg.includes("exposi") ||
      lowerMsg.includes("cur") ||
      lowerMsg.includes("resina") ||
      lowerMsg.includes("polimeriz") ||
      lowerMsg.includes("ajust") ||
      lowerMsg.includes("como resolver") ||
      lowerMsg.includes("por que") ||
      lowerMsg.includes("porque") ||
      cleanMessage.length > 90;

    const hasGroqKey = Boolean(getEnvKey("GROQ"));
    const hasGeminiKey = Boolean(getEnvKey("GEMINI"));

    if (hasGroqKey && hasGeminiKey && !body.apiKey) {
      targetProvider = isComplex ? "GEMINI" : "GROQ";
    }

    // Resolução resiliente da Chave de API
    const { apiKey, activeProvider, source } = resolveAIKey(targetProvider, body.apiKey);

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
        mesa_mm:
          p.plate_width_mm && p.plate_depth_mm
            ? `${p.plate_width_mm} x ${p.plate_depth_mm} x ${p.plate_height_mm || "?"}`
            : null,
      }))
    )}
  DADOS TÉCNICOS OFICIAIS DAS MESAS (use estes valores, não os da sua base geral):
  - Anycubic Photon Mono 4: 153,4 x 87 x 165 mm.
  - Creality Halot Sky 2022 (tela 6K 9,25"): 198 x 123 x 200 mm. ATENÇÃO: o Halot Sky ORIGINAL (antigo) tinha 192 x 120 x 200 mm — não confunda com o 2022.
  - Margem de segurança: deixar 1 a 2 mm livres nas bordas X/Y no fatiador; peças encostando na linha limite são cortadas e falham por adesão; evite peças grandes coladas na borda (sucção do FEP maior).
- Lotes de Resina Calibrados: ${JSON.stringify(
      (context.resins || []).map((r: any) => ({
        marca: r.brand,
        tipo: r.resin_type,
        lote: r.lot,
        status: r.status,
      }))
    )}
- IMPRIMINDO AGORA (ordens ativas): ${JSON.stringify(
      (context.printing || []).map((p: any) => ({
        ordem: p.run_code,
        impressora: p.printer_name,
        inicio: p.started_at,
        modelos: p.items_count,
        mesas: p.group_titles,
      }))
    )}
- Resumo operacional: ${context.waitingModels ?? "?"} modelo(s) aguardando, ${
      context.failedCount ?? "?"
    } falha(s) com prioridade de reimpressão.
- Mesas de impressão: ${JSON.stringify(
      (context.batches || []).slice(0, 40).map((b: any) => ({
        mesa: b.mesa || b.batch_name,
        status: b.status,
        impressora: b.impressora || b.printer_name,
        itens: b.itens ?? b.items_count,
      }))
    )}
- Modelos (paciente, clínica, mesa, situação): ${JSON.stringify(
      (context.models || []).slice(0, 150).map((m: any) => ({
        paciente: m.paciente || m.patient_code,
        nome: m.nome || m.patient_name,
        clinica: m.clinica || m.clinic_name,
        mesa: m.mesa || m.batch_name,
        status: m.status,
        reimpressao: m.reimpressao ?? m.is_retry,
        motivo_falha: m.motivo_falha || m.last_failure_reason,
      }))
    )}
`;

    const systemPrompt = `Você é a OdontoIA, copiloto técnico operacional especialista em odontologia digital e impressão 3D (SLA/DLP/LCD) do laboratório OdontoPrint.
Você fala português brasileiro com clareza, simpatia profissional, objetividade e precisão técnica de prótese dentária.
Suas funções:
1. Localizar e informar a situação de pacientes e modelos da equipe técnica.
2. Informar em tempo real O QUE ESTÁ IMPRIMINDO (mesa, impressora, modelos e há quanto tempo roda).
3. Localizar modelos por paciente, clínica/doutor ou mesa, mostrando a jornada (fila → mesa → ordem → concluído/falha).
4. Auxiliar operadores técnicos com dúvidas de calibração de resinas (tempos de exposição 405nm, camadas de base, lift speed, lavagem em álcool isopropílico e pós-cura UV).
5. Auxiliar no diagnóstico de falhas de impressão (descolamento de mesa, delaminação, quebra de suportes).
6. Fornecer respostas diretas, úteis e concisas. Se perguntarem por algo fora do contexto do laboratório, diga que não tem acesso a essa informação.`;

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

    // Helpers do modo local: jornada do modelo e tempo decorrido
    const norm = (v: unknown) =>
      String(v || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
    const elapsedShort = (iso?: string | null): string => {
      if (!iso) return "";
      const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
      if (mins < 1) return "começou agora";
      if (mins < 60) return `há ${mins} min`;
      return `há ${Math.floor(mins / 60)}h${mins % 60 ? `${mins % 60}min` : ""}`;
    };
    const STATUS_PT: Record<string, string> = {
      NA_FILA: "na fila",
      PREPARANDO: "em preparo",
      IMPRIMINDO: "imprimindo",
      IMPRESSO: "impresso",
      CONCLUIDO: "concluído",
      FALHOU: "com FALHA (prioridade)",
      CANCELADO: "cancelado",
    };
    const models: any[] = context.models || [];
    const printing: any[] = context.printing || [];

    if (matchedCase) {
      const pCode = matchedCase.patient_code;
      const inQueue = (context.queue || []).filter(
        (q: any) => q.patient_code === pCode
      );
      const journey = models.filter(
        (m: any) => (m.paciente || m.patient_code) === pCode
      );
      localReply = `🔍 **Status do Trabalho ${pCode} (${matchedCase.patient_name || "Paciente"}):**\n\n`;
      if (journey.length > 0) {
        const byGroup = new Map<string, any[]>();
        for (const j of journey) {
          const key = `${j.mesa || j.batch_name || "Sem mesa"}|${j.status}`;
          if (!byGroup.has(key)) byGroup.set(key, []);
          byGroup.get(key)!.push(j);
        }
        for (const [key, list] of Array.from(byGroup.entries())) {
          const [mesa, st] = key.split("|");
          localReply += `- **${list.length} modelo(s)** em **${mesa}** — ${STATUS_PT[st] || st}.\n`;
        }
      } else if (inQueue.length > 0) {
        localReply += `📋 **Fila de Impressão 3D (FIFO)**: Existem **${inQueue.length} modelo(s)** aguardando impressão.`;
      } else {
        localReply += `O caso está registrado no sistema com status **${matchedCase.status || "Ativo"}**.`;
      }
    } else if (
      lower.includes("imprimindo") ||
      lower.includes("rodando") ||
      lower.includes("maquina") ||
      lower.includes("máquina")
    ) {
      if (printing.length === 0) {
        localReply = `🖨️ **Nenhuma máquina imprimindo agora.** ${(context.waitingModels ?? 0)} modelo(s) aguardando na fila.`;
      } else {
        localReply = `🖨️ **Imprimindo agora (${printing.length} ordem(ns)):**\n`;
        for (const p of printing) {
          const code = p.run_code || p.ordem || "?";
          const when = elapsedShort(p.started_at || p.inicio);
          const titles = (p.group_titles || p.mesas || []).join(" + ");
          localReply += `\n- **Mesa ${code}** · ${p.printer_name || p.impressora || "?"}${when ? ` · ${when}` : ""}\n  ${p.items_count ?? "?"} modelo(s)${titles ? ` · ${titles}` : ""}`;
          const runModels = models.filter((m: any) =>
            (p.item_ids || []).includes?.(m.id)
          );
          if (runModels.length > 0) {
            localReply += `\n  Modelos: ${runModels
              .slice(0, 8)
              .map((m: any) => `${m.paciente || m.patient_code}${m.clinica || m.clinic_name ? ` (${m.clinica || m.clinic_name})` : ""}`)
              .join(", ")}${runModels.length > 8 ? ` (+${runModels.length - 8})` : ""}`;
          }
        }
      }
    } else if (
      lower.includes("clinica") ||
      lower.includes("clínica") ||
      lower.includes("doutor") ||
      lower.includes("dr ")
    ) {
      const clinics = Array.from(
        new Set(models.map((m: any) => m.clinica || m.clinic_name).filter(Boolean))
      );
      const hit = clinics.find((c) => lower.includes(norm(c)));
      if (hit) {
        const list = models.filter((m: any) => (m.clinica || m.clinic_name) === hit);
        localReply = `🏥 **${hit}: ${list.length} modelo(s) no sistema:**\n`;
        const byStatus = new Map<string, number>();
        for (const m of list) {
          const k = `${m.mesa || m.batch_name || "Sem mesa"}|${m.status}`;
          byStatus.set(k, (byStatus.get(k) || 0) + 1);
        }
        for (const [k, n] of Array.from(byStatus.entries())) {
          const [mesa, st] = k.split("|");
          localReply += `- **${n}** em **${mesa}** — ${STATUS_PT[st] || st}.\n`;
        }
      } else {
        localReply = `🏥 **Clínicas com modelos no sistema:** ${clinics.slice(0, 10).join(", ") || "nenhuma"}. Pergunte por uma delas (ex: "o que tem da ...?").`;
      }
    } else if (
      lower.includes("impressora") ||
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
      const failed = context.failedCount ?? 0;
      localReply = `📋 **Situação da Fila de Impressão:**\nAtualmente temos **${q.length} modelo(s) aguardando** na fila prioritária FIFO aguardando impressão.`;
      if (failed > 0) localReply += `\n⚠️ **${failed} modelo(s) com falha** aguardando reimpressão prioritária.`;
    } else if (lower.includes("resina") || lower.includes("calibr")) {
      localReply = `🧪 **Calibração de Resinas:**\nO protocolo OdontoPrint exige calibração técnica de teste com medição do hexágono entre **9.99mm e 10.01mm**.`;
    } else if (
      lower.includes("mesa") || lower.includes("chapa") || lower.includes("tamanho") ||
      lower.includes("medida") || lower.includes("sky") || lower.includes("photon") ||
      lower.includes("volume") || lower.includes("margem") || lower.includes("borda")
    ) {
      localReply = `📐 **Tamanho das mesas:**\n- **Halot Sky 2022:** **198 x 123 x 200 mm** (tela 6K 9,25"). Não confundir com o Sky original antigo (192 x 120 x 200 mm).\n- **Anycubic Photon Mono 4:** **153,4 x 87 x 165 mm**.\n- Deixe **1 a 2 mm livres nas bordas** no fatiador: peça encostando no limite é cortada e falha.`;
    } else {
      localReply = `Olá! Sou a **OdontoIA**, copiloto do laboratório OdontoPrint. Posso te dizer **o que está imprimindo agora**, **onde está o modelo de um paciente ou clínica**, fila de impressão 3D e calibração de resinas.`;
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
