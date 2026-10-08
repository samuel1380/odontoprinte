import { AIProvider } from "@/types/ai.types";

/**
 * Utilitário de leitura e resolução resiliente de Chaves de API das IAs (Groq e Gemini)
 * configuradas nas Variáveis de Ambiente do Render ou no arquivo .env
 */

function cleanVal(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.trim().replace(/^['"]|['"]$/g, ""); // remove aspas acidentais no Render
}

export function getEnvKey(provider: string): string {
  const p = (provider || "").toUpperCase().trim();

  const patternsMap: Record<string, string[]> = {
    GROQ: [
      "GROQ_API_KEY",
      "GROQ_KEY",
      "NEXT_PUBLIC_GROQ_API_KEY",
      "GROQ_API",
      "GROQ_TOKEN",
      "GROQ",
    ],
    GEMINI: [
      "GEMINI_API_KEY",
      "GOOGLE_API_KEY",
      "GEMINI_KEY",
      "NEXT_PUBLIC_GEMINI_API_KEY",
      "NEXT_PUBLIC_GOOGLE_API_KEY",
      "GEMINI_API",
      "GEMINI_TOKEN",
      "GEMINI",
    ],
    OPENAI: [
      "OPENAI_API_KEY",
      "OPENAI_KEY",
      "NEXT_PUBLIC_OPENAI_API_KEY",
      "OPENAI",
    ],
    MISTRAL: [
      "MISTRAL_API_KEY",
      "MISTRAL_KEY",
      "NEXT_PUBLIC_MISTRAL_API_KEY",
      "MISTRAL",
    ],
  };

  const patterns = patternsMap[p] || [];

  // 1. Busca direta por nome exato no process.env
  for (const name of patterns) {
    const val = cleanVal(process.env[name]);
    if (val) return val;
  }

  // 2. Busca case-insensitive em todas as variáveis de ambiente (ex: groq_api_key no Render)
  for (const [key, rawVal] of Object.entries(process.env)) {
    const val = cleanVal(rawVal);
    if (!val) continue;
    const lowerKey = key.toLowerCase();
    for (const pat of patterns) {
      if (lowerKey === pat.toLowerCase()) {
        return val;
      }
    }
  }

  // 3. Busca por substring se o usuário nomeou de forma customizada (ex: RENDER_GROQ_API_KEY ou MINHA_CHAVE_GEMINI)
  for (const [key, rawVal] of Object.entries(process.env)) {
    const val = cleanVal(rawVal);
    if (!val) continue;
    const lowerKey = key.toLowerCase();
    if (p === "GROQ" && lowerKey.includes("groq") && (lowerKey.includes("key") || lowerKey.includes("api") || lowerKey.includes("token"))) {
      return val;
    }
    if (p === "GEMINI" && (lowerKey.includes("gemini") || lowerKey.includes("google")) && (lowerKey.includes("key") || lowerKey.includes("api") || lowerKey.includes("token"))) {
      return val;
    }
  }

  return "";
}

export function maskApiKey(key: string): string {
  const clean = cleanVal(key);
  if (!clean) return "";
  if (clean.length <= 8) return "••••••••";
  const start = clean.slice(0, 4);
  const end = clean.slice(-4);
  return `${start}••••••••${end}`;
}

export interface ResolvedAIConfig {
  apiKey: string;
  activeProvider: AIProvider;
  source: "client" | "render" | "none";
}

/**
 * Resolve a melhor chave e provedor disponível.
 * Se o usuário pediu GROQ mas o Render só tem GEMINI (ou vice-versa),
 * faz fallback inteligente automático para nunca deixar o usuário na mão.
 */
export function resolveAIKey(requestedProvider?: AIProvider, clientKey?: string): ResolvedAIConfig {
  const cleanClientKey = cleanVal(clientKey);
  const initialProvider: AIProvider = requestedProvider || "GROQ";

  // Se o cliente passou chave explícita no body
  if (cleanClientKey) {
    return {
      apiKey: cleanClientKey,
      activeProvider: initialProvider,
      source: "client",
    };
  }

  // Tenta chave do provedor solicitado no Render
  const requestedEnvKey = getEnvKey(initialProvider);
  if (requestedEnvKey) {
    return {
      apiKey: requestedEnvKey,
      activeProvider: initialProvider,
      source: "render",
    };
  }

  // Fallback entre Groq e Gemini no Render
  if (initialProvider === "GROQ") {
    const geminiEnv = getEnvKey("GEMINI");
    if (geminiEnv) {
      return {
        apiKey: geminiEnv,
        activeProvider: "GEMINI",
        source: "render",
      };
    }
  } else if (initialProvider === "GEMINI") {
    const groqEnv = getEnvKey("GROQ");
    if (groqEnv) {
      return {
        apiKey: groqEnv,
        activeProvider: "GROQ",
        source: "render",
      };
    }
  }

  // Outros provedores configurados no Render
  const openAiEnv = getEnvKey("OPENAI");
  if (openAiEnv) {
    return {
      apiKey: openAiEnv,
      activeProvider: "OPENAI",
      source: "render",
    };
  }

  const mistralEnv = getEnvKey("MISTRAL");
  if (mistralEnv) {
    return {
      apiKey: mistralEnv,
      activeProvider: "MISTRAL",
      source: "render",
    };
  }

  return {
    apiKey: "",
    activeProvider: initialProvider,
    source: "none",
  };
}

export function getAIEnvStatus() {
  const groqKey = getEnvKey("GROQ");
  const geminiKey = getEnvKey("GEMINI");
  const openaiKey = getEnvKey("OPENAI");
  const mistralKey = getEnvKey("MISTRAL");

  let preferredProvider: AIProvider | null = null;
  if (groqKey) preferredProvider = "GROQ";
  else if (geminiKey) preferredProvider = "GEMINI";
  else if (openaiKey) preferredProvider = "OPENAI";
  else if (mistralKey) preferredProvider = "MISTRAL";

  return {
    groq: Boolean(groqKey),
    gemini: Boolean(geminiKey),
    openai: Boolean(openaiKey),
    mistral: Boolean(mistralKey),
    groqMasked: maskApiKey(groqKey),
    geminiMasked: maskApiKey(geminiKey),
    openaiMasked: maskApiKey(openaiKey),
    mistralMasked: maskApiKey(mistralKey),
    preferredProvider,
  };
}
