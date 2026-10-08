import { NextRequest, NextResponse } from "next/server";
import { AIProvider } from "@/types/ai.types";

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

    const apiKey =
      body.apiKey?.trim() ||
      (provider === "GROQ"
        ? process.env.GROQ_API_KEY
        : provider === "GEMINI"
        ? (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)
        : provider === "MISTRAL"
        ? process.env.MISTRAL_API_KEY
        : (process.env.OPENAI_API_KEY || process.env.AI_API_KEY));

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
- Peças na Fila de Fresagem CNC: ${JSON.stringify(
      (context.milling || []).map((m: any) => ({
        paciente: m.patient_code,
        material: m.material,
        status: m.status,
      }))
    )}
- Modelos na Bancada de Acabamento & Maquiagem: ${JSON.stringify(
      (context.finishing || []).map((f: any) => ({
        paciente: f.patient_code,
        tem_furos_para_dentes: f.has_sockets,
        dentes_encaixados: f.teeth_inserted,
        maquiagem_glaze: f.glaze_applied,
        status: f.status,
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

    const systemPrompt = `Você é a OdontoIA, assistente virtual inteligente e copiloto operacional especialista em odontologia digital, impressão 3D (SLA/DLP/LCD) e fresagem CNC do laboratório OdontoPrint.
Você fala português brasileiro com clareza, simpatia profissional, objetividade e precisão técnica de prótese dentária.

Suas responsabilidades:
1. Localizar e informar a situação de pacientes e modelos da equipe (ex: "O modelo da Vanessa já foi enviado?"):
   - Verifique os dados em tempo real no contexto fornecido acima.
   - Explique exatamente em que estágio está: se está aguardando na Fila 3D, se está fatiado, imprimindo na máquina, na Fresadora CNC usinando zircônia/PMMA, ou se já está na Bancada de Acabamento & Maquiagem tendo os dentes encaixados nos furos do modelo e recebendo glaze, ou pronto no CQ.
2. Auxiliar operadores técnicos com dúvidas de calibração de resinas (tempos de exposição 405nm, camadas de base, lift speed, lavagem em álcool isopropílico e pós-cura UV).
3. Auxiliar no diagnóstico de falhas de impressão (descolamento de mesa, delaminação, quebra de suportes).
4. Fornecer respostas diretas, úteis e concisas, ideais para leitura rápida na bancada do laboratório.`;

    // Processamento com Provedor de IA Externo se chave fornecida (ou se compatível local sem chave)
    if (apiKey || (provider === "OPENAI_COMPATIBLE" && customEndpoint)) {
      if (provider === "GROQ") {
        const groqModel = model || "llama-3.3-70b-versatile";
        const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
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
        return NextResponse.json({ reply, provider: "GROQ", model: groqModel });
      }

      if (provider === "GEMINI") {
        const geminiModel = model || "gemini-2.0-flash";
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;
        const contents = [
          ...history.slice(-6).map((h) => ({
            role: h.role === "assistant" ? "model" : "user",
            parts: [{ text: h.content }],
          })),
          { role: "user", parts: [{ text: message }] },
        ];

        const geminiRes = await fetch(geminiUrl, {
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

        if (!geminiRes.ok) {
          const errData = await geminiRes.json().catch(() => ({}));
          throw new Error(errData?.error?.message || `Erro na API Google Gemini (Status ${geminiRes.status})`);
        }

        const data = await geminiRes.json();
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "Desculpe, não consegui gerar uma resposta.";
        return NextResponse.json({ reply, provider: "GEMINI", model: geminiModel });
      }

      if (provider === "OPENAI") {
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
        return NextResponse.json({ reply, provider: "OPENAI", model: openaiModel });
      }

      if (provider === "MISTRAL") {
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
        return NextResponse.json({ reply, provider: "MISTRAL", model: mistralModel });
      }

      if (provider === "OPENAI_COMPATIBLE") {
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
        return NextResponse.json({ reply, provider: "OPENAI_COMPATIBLE", model: compatModel });
      }
    }

    // MODO LOCAL / FALLBACK INTELIGENTE (Quando o laboratório ainda não colocou chave de API)
    // Permite que qualquer um pergunte sobre pacientes, status de impressoras ou resinas e receba resposta real baseada no banco!
    const lower = message.toLowerCase();
    let localReply = "";

    // 1. Pergunta sobre paciente específico (ex: "vanessa", "carlos", "pac-100")
    const allCases = context.cases || [];
    const matchedCase = allCases.find(
      (c: any) =>
        lower.includes(c.patient_code?.toLowerCase()) ||
        (c.patient_name && lower.includes(c.patient_name.toLowerCase()))
    );

    if (matchedCase) {
      const pCode = matchedCase.patient_code;
      const inQueue = (context.queue || []).filter((q: any) => q.patient_code === pCode);
      const inMilling = (context.milling || []).filter((m: any) => m.patient_code === pCode);
      const inFinishing = (context.finishing || []).filter((f: any) => f.patient_code === pCode);

      localReply = `🔍 **Status do Trabalho ${pCode} (${matchedCase.patient_name || "Paciente"}):**\n\n`;

      if (inFinishing.length > 0) {
        const item = inFinishing[0];
        localReply += `✨ **Bancada de Acabamento & Maquiagem**: O modelo já foi fabricado e está na bancada! `;
        if (item.status === "APROVADO_CQ") {
          localReply += `Já foi **Aprovado no Controle de Qualidade** e está pronto para entrega/expedição!`;
        } else if (item.teeth_inserted && item.glaze_applied) {
          localReply += `Os dentes foram encaixados nos furos do modelo e a maquiagem/glaze foi aplicada. Aguarda liberação de CQ.`;
        } else if (item.teeth_inserted) {
          localReply += `Dentes encaixados nos furos do modelo. Aguarda aplicação de maquiagem/glaze.`;
        } else {
          localReply += `Aguardando assentamento dos dentes/troqueis nos alvéolos do modelo de trabalho.`;
        }
      } else if (inMilling.length > 0) {
        const m = inMilling[0];
        localReply += `⚙️ **Setor de Fresagem CNC**: A peça está com status **${m.status}** (Material: ${m.material}). Assim que a usinagem for finalizada, seguirá para a bancada de acabamento.`;
      } else if (inQueue.length > 0) {
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
      localReply = `🧪 **Calibração de Resinas:**\nO protocolo OdontoPrint exige calibração técnica de teste com medição do hexágono entre **9.99mm e 10.01mm**. Você pode usar a ferramenta de Nova Calibração para registrar os testes com validação automática.`;
    } else {
      localReply = `Olá! Sou a **OdontoIA**, copiloto do laboratório OdontoPrint. 
Posso te ajudar a localizar o status de qualquer paciente (ex: *"Onde está o trabalho da Vanessa?"*), verificar a fila de impressão 3D, fresadoras CNC ou status das impressoras e resinas.`;
    }

    localReply += `\n\n*(💡 Modo Local Ativo. Para ativar o motor generativo em tempo real via Groq ou Mistral, insira sua chave gratuita em Administração > Parâmetros do Sistema).*`;

    return NextResponse.json({ reply: localReply, provider: "LOCAL_FALLBACK" });
  } catch (error: any) {
    console.error("Erro na rota AI Chat:", error);
    return NextResponse.json(
      { error: error?.message || "Erro ao processar mensagem com a IA." },
      { status: 500 }
    );
  }
}
