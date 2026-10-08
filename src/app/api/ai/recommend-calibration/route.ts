import { NextRequest, NextResponse } from "next/server";
import { AIProvider } from "@/types/ai.types";
import { resolveAIKey, getEnvKey } from "@/lib/ai/env-keys";

export const dynamic = "force-dynamic";

interface CalibrationRecommendationPayload {
  printer_name: string;
  printer_model?: string;
  resin_brand: string;
  resin_type: string;
  layer_height?: number;
  provider?: AIProvider;
  apiKey?: string;
  model?: string;
  customEndpoint?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CalibrationRecommendationPayload;
    const {
      printer_name,
      printer_model = "",
      resin_brand,
      resin_type,
      layer_height = 0.05,
      provider = "GEMINI",
      model,
      customEndpoint,
    } = body;

    const { apiKey, activeProvider } = resolveAIKey(provider, body.apiKey);

    const prompt = `Você é um engenheiro químico e técnico especialista em fotopolimerização 405nm de resinas odontológicas e calibração de impressoras 3D LCD/MSLA/DLP.
Analise a seguinte combinação técnica:
- Impressora 3D: "${printer_name} ${printer_model}"
- Resina Odontológica: "${resin_brand} (Tipo/Finalidade: ${resin_type})"
- Altura de camada desejada: ${layer_height} mm

Determine os parâmetros ideais de calibração inicial recomendados para que o teste dimensional alcance o hexágono perfeito entre 9.99 mm e 10.01 mm e responda ESTRITAMENTE em formato JSON com o seguinte schema:
{
  "initial_exposure_time": number, // tempo em segundos das camadas de base (ex: 28.0)
  "exposure_time": number, // tempo em segundos das camadas normais (ex: 2.3)
  "lift_speed": number, // velocidade de subida em mm/min (ex: 65)
  "layer_height": number, // altura de camada em mm (ex: 0.05)
  "wash_time": number, // tempo de lavagem em álcool isopropílico 99% em minutos (ex: 5)
  "cure_time": number, // tempo de pós-cura na câmara UV em minutos (ex: 10)
  "rationale": string, // justificativa técnica da fotopolimerização para essa resina nessa máquina
  "tips": string[] // 3 a 4 dicas cruciais de manuseio e segurança para não descolar da mesa
}`;

    const callGemini = async (key: string, selectedModel?: string) => {
      const primaryModel = selectedModel?.startsWith("gemini") ? selectedModel : "gemini-1.5-flash";
      const candidateModels = primaryModel === "gemini-1.5-flash" ? ["gemini-1.5-flash"] : [primaryModel, "gemini-1.5-flash"];

      for (const m of candidateModels) {
        try {
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`;
          const geminiRes = await fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.2,
                responseMimeType: "application/json",
              },
            }),
          });

          if (geminiRes.ok) {
            const data = await geminiRes.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
            const cleanText = text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
            const parsed = JSON.parse(cleanText);
            return { ...parsed, aiProvider: "GEMINI", model: m };
          }
        } catch {
          // tentar proximo modelo
        }
      }
      return null;
    };

    const callGroq = async (key: string, selectedModel?: string) => {
      try {
        const groqModel = selectedModel && !selectedModel.startsWith("gemini") ? selectedModel : "llama-3.3-70b-versatile";
        const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: groqModel,
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
            temperature: 0.2,
          }),
        });

        if (groqRes.ok) {
          const data = await groqRes.json();
          const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
          return { ...parsed, aiProvider: "GROQ", model: groqModel };
        }
      } catch {
        return null;
      }
      return null;
    };

    if (apiKey || (activeProvider === "OPENAI_COMPATIBLE" && customEndpoint)) {
      if (activeProvider === "GEMINI") {
        const res = await callGemini(apiKey, model);
        if (res) return NextResponse.json(res);

        // Fallback automático para Groq se disponível no Render
        const groqBackup = getEnvKey("GROQ");
        if (groqBackup) {
          const groqRes = await callGroq(groqBackup);
          if (groqRes) return NextResponse.json(groqRes);
        }
      }

      if (activeProvider === "GROQ") {
        const res = await callGroq(apiKey, model);
        if (res) return NextResponse.json(res);

        // Fallback para Gemini se disponível no Render
        const geminiBackup = getEnvKey("GEMINI");
        if (geminiBackup) {
          const geminiRes = await callGemini(geminiBackup);
          if (geminiRes) return NextResponse.json(geminiRes);
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
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
            temperature: 0.2,
          }),
        });

        if (openaiRes.ok) {
          const data = await openaiRes.json();
          const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
          return NextResponse.json({ ...parsed, aiProvider: "OPENAI" });
        }
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
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
            temperature: 0.2,
          }),
        });

        if (mistralRes.ok) {
          const data = await mistralRes.json();
          const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
          return NextResponse.json({ ...parsed, aiProvider: "MISTRAL" });
        }
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
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
            temperature: 0.2,
          }),
        });

        if (compatRes.ok) {
          const data = await compatRes.json();
          const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
          return NextResponse.json({ ...parsed, aiProvider: "OPENAI_COMPATIBLE" });
        }
      }
    }

    // BASE DE DADOS TÉCNICA LOCAL DE FALLBACK (Garante funcionamento mesmo sem conexão externa)
    const isBioProv = resin_brand.toLowerCase().includes("prov") || resin_type.toLowerCase().includes("prov");

    const fallbackResponse = {
      initial_exposure_time: isBioProv ? 28.0 : 25.0,
      exposure_time: isBioProv ? 2.4 : 2.2,
      lift_speed: 60.0,
      layer_height: layer_height || 0.05,
      wash_time: isBioProv ? 6.0 : 5.0,
      cure_time: isBioProv ? 12.0 : 10.0,
      rationale: `Sugestão fotopolimerizável para ${resin_brand} na ${printer_name}. Parâmetros ajustados para alcançar o hexágono de calibração entre 9.99mm e 10.01mm.`,
      tips: [
        "Homogeneizar o frasco de resina por 5 minutos antes do uso.",
        "Manter a temperatura da resina na cuba entre 23°C e 26°C.",
        "Lavar em álcool isopropílico virgem e secar completamente antes da pós-cura UV.",
        "Conferir medidas com paquímetro digital aferido.",
      ],
      aiProvider: "LOCAL_FALLBACK",
    };

    return NextResponse.json(fallbackResponse);
  } catch (error: any) {
    console.error("Erro na rota AI Recommend Calibration:", error);
    return NextResponse.json(
      { error: error?.message || "Erro ao gerar recomendação de calibração." },
      { status: 500 }
    );
  }
}
