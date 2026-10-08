import { NextRequest, NextResponse } from "next/server";
import { AIProvider } from "@/types/ai.types";
import { resolveAIKey, getEnvKey } from "@/lib/ai/env-keys";

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

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ChatRequestPayload;
    const { message, history = [], context = {}, provider = "GROQ", model, customEndpoint } = body;

    // Resolução resiliente da Chave de API (prioriza Render Environment Variables se o cliente não passou chave)
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

    const systemPrompt = `Você é a OdontoIA, copiloto técnico operacional especialista em odontologia digital, impressão 3D (SLA/DLP/LCD) do laboratório OdontoPrint.
Você fala português brasileiro com clareza, simpatia profissional, objetividade e precisão técnica de prótese dentária.
Suas funções:
1. Localizar e informar a situação de pacientes e modelos da equipe técnica.
2. Auxiliar operadores técnicos com dúvidas de calibração de resinas (tempos de exposição 405nm, camadas de base, lift speed, lavagem em álcool isopropílico e pós-cura UV).
3. Auxiliar no diagnóstico de falhas de impressão (descolamento de mesa, delaminação, quebra de suportes).
4. Fornecer respostas diretas, úteis e concisas.`;

    // 1. Processamento GROQ
    const executeGroq = async (key: string, selectedModel?: string) => {
      const groqModel = selectedModel || "llama-3.3-70b-versatile";
      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: groqModel,
          messages: [
            { role: "system", content: systemPrompt + "\n" + labContextSummary },
            ...history.slice(-6),
            { role: "user", content: message },
          ],
          temperature: 0.4,
          max_tokens: 800,
        }),
      });

      if (!groqRes.ok) {
        const errData = await groqRes.json().catch(() => ({}));
        throw new Error(errData?.error?.message || `Erro na API Groq (Status ${groqRes.status})`);
      }

      const data = await groqRes.json();
      const reply = data.choices?.[0]?.message?.content || "Desculpe, não consegui gerar uma resposta.";
      return { reply, provider: "GROQ", model: groqModel, source };
    };

    // 2. Processamento GEMINI
    const executeGemini = async (key: string, selectedModel?: string) => {
      const geminiModel = selectedModel?.startsWith("gemini") ? selectedModel : "gemini-1.5-flash";
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${key}`;

      const contents = [
        ...history.slice(-6).map((h) => ({
          role: h.role === "assistant" ? "model" : "user",
          parts: [{ text: h.content }],
        })),
        { role: "user", parts: [{ text: message }] },
      ];

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

      // Se falhar com modelo 2.0 ou system_instruction, tenta formato universal com gemini-1.5-flash
      if (!geminiRes.ok && geminiModel !== "gemini-1.5-flash") {
        const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
        geminiRes = await fetch(fallbackUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              { role: "user", parts: [{ text: `[INSTRUÇÕES DO SISTEMA]\n${systemPrompt}\n${labContextSummary}\n[FIM INSTRUÇÕES]` }] },
              { role: "model", parts: [{ text: "Entendido. Atuarei como o copiloto OdontoIA do laboratório." }] },
              ...contents,
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
        throw new Error(errData?.error?.message || `Erro na API Google Gemini (Status ${geminiRes.status})`);
      }

      const data = await geminiRes.json();
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "Desculpe, não consegui gerar uma resposta.";
      return { reply, provider: "GEMINI", model: geminiModel, source };
    };

    // 3. Execução com Resiliência e Fallback entre Groq e Gemini
    if (apiKey || (activeProvider === "OPENAI_COMPATIBLE" && customEndpoint)) {
      if (activeProvider === "GROQ") {
        try {
          const result = await executeGroq(apiKey, model);
          return NextResponse.json(result);
        } catch (groqErr: any) {
          console.warn("Groq falhou:", groqErr?.message);
          // Fallback para Gemini se disponível no Render
          const geminiBackupKey = getEnvKey("GEMINI");
          if (geminiBackupKey) {
            try {
              const geminiResult = await executeGemini(geminiBackupKey);
              return NextResponse.json(geminiResult);
            } catch {
              // segue com o erro original
            }
          }
          throw groqErr;
        }
      }

      if (activeProvider === "GEMINI") {
        try {
          const result = await executeGemini(apiKey, model);
          return NextResponse.json(result);
        } catch (geminiErr: any) {
          console.warn("Gemini falhou:", geminiErr?.message);
          // Fallback para Groq se disponível no Render
          const groqBackupKey = getEnvKey("GROQ");
          if (groqBackupKey) {
            try {
              const groqResult = await executeGroq(groqBackupKey);
              return NextResponse.json(groqResult);
            } catch {
              // segue com o erro original
            }
          }
          throw geminiErr;
        }
      }

      if (activeProvider === "OPENAI") {
        const openaiModel = model || "gpt-4o-mini";
        const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: openaiModel,
            messages: [
              { role: "system", content: systemPrompt + "\n" + labContextSummary },
              ...history.slice(-6),
              { role: "user", content: message },
            ],
            temperature: 0.4,
            max_tokens: 800,
          }),
        });

        if (!openaiRes.ok) {
          const errData = await openaiRes.json().catch(() => ({}));
          throw new Error(errData?.error?.message || `Erro na API OpenAI (Status ${openaiRes.status})`);
        }

        const data = await openaiRes.json();
        const reply = data.choices?.[0]?.message?.content || "Desculpe, não consegui gerar uma resposta.";
        return NextResponse.json({ reply, provider: "OPENAI", model: openaiModel, source });
      }

      if (activeProvider === "MISTRAL") {
        const mistralModel = model || "mistral-large-latest";
        const mistralRes = await fetch("https://api.mistral.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: mistralModel,
            messages: [
              { role: "system", content: systemPrompt + "\n" + labContextSummary },
              ...history.slice(-6),
              { role: "user", content: message },
            ],
            temperature: 0.4,
            max_tokens: 800,
          }),
        });

        if (!mistralRes.ok) {
          const errData = await mistralRes.json().catch(() => ({}));
          throw new Error(errData?.error?.message || `Erro na API Mistral (Status ${mistralRes.status})`);
        }

        const data = await mistralRes.json();
        const reply = data.choices?.[0]?.message?.content || "Desculpe, não consegui gerar uma resposta.";
        return NextResponse.json({ reply, provider: "MISTRAL", model: mistralModel, source });
      }

      if (activeProvider === "OPENAI_COMPATIBLE") {
        const targetUrl = customEndpoint?.trim() || "http://localhost:11434/v1/chat/completions";
        const compatUrl = targetUrl.includes("/chat/completions")
          ? targetUrl
          : targetUrl.replace(/\/+$/, "") + "/chat/completions";
        const compatModel = model || "llama3";

        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (apiKey) {
          headers["Authorization"] = `Bearer ${apiKey}`;
        }

        const compatRes = await fetch(compatUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: compatModel,
            messages: [
              { role: "system", content: systemPrompt + "\n" + labContextSummary },
              ...history.slice(-6),
              { role: "user", content: message },
            ],
            temperature: 0.4,
            max_tokens: 800,
          }),
        });

        if (!compatRes.ok) {
          const errData = await compatRes.json().catch(() => ({}));
          throw new Error(errData?.error?.message || `Erro no servidor compatível OpenAI (Status ${compatRes.status})`);
        }

        const data = await compatRes.json();
        const reply = data.choices?.[0]?.message?.content || "Desculpe, não consegui gerar uma resposta.";
        return NextResponse.json({ reply, provider: "OPENAI_COMPATIBLE", model: compatModel, source });
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
      const inQueue = (context.queue || []).filter((q: any) => q.patient_code === pCode);
      localReply = `🔍 **Status do Trabalho ${pCode} (${matchedCase.patient_name || "Paciente"}):**\n\n`;
      if (inQueue.length > 0) {
        localReply += `📋 **Fila de Impressão 3D (FIFO)**: Existem **${inQueue.length} modelo(s)** aguardando fatiamento e envio para as impressoras.`;
      } else {
        localReply += `O caso está registrado no sistema com status **${matchedCase.status || "Ativo"}**.`;
      }
    } else if (lower.includes("impressora") || lower.includes("maquina") || lower.includes("manuten")) {
      const printers = context.printers || [];
      const av = printers.filter((p: any) => p.calculated_status === "DISPONIVEL");
      const bl = printers.filter((p: any) => p.calculated_status !== "DISPONIVEL");
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

    localReply += `\n\n*(💡 Modo Local Ativo. Para ativar o motor generativo em tempo real via Groq ou Gemini, configure a chave no Render como GROQ_API_KEY ou GEMINI_API_KEY).*`;

    return NextResponse.json({ reply: localReply, provider: "LOCAL_FALLBACK" });
  } catch (error: any) {
    console.error("Erro na rota AI Chat:", error);
    return NextResponse.json(
      { error: error?.message || "Erro ao processar mensagem com a IA." },
      { status: 500 }
    );
  }
}
