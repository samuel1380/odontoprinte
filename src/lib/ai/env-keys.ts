import { AIProvider } from "@/types/ai.types";

/**
 * Utilitário de leitura e resolução resiliente de Chaves de API das IAs (Gemini e Groq)
 * configuradas nas Variáveis de Ambiente do Render ou no arquivo .env
 */

function cleanVal(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.trim().replace(/^['"]|['"]$/g, ""); // remove aspas acidentais no Render
}

export function getEnvKey(provider: string): string {
  const p = (provider || "").toUpperCase().trim();

  const patternsMap: Record<string, string[]> = {
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
    GROQ: [
      "GROQ_API_KEY",
      "GROQ_KEY",
      "NEXT_PUBLIC_GROQ_API_KEY",
      "GROQ_API",
      "GROQ_TOKEN",
      "GROQ",
    ],
  };

  const patterns = patternsMap[p] || [];

  // 1. Busca direta por nome exato no process.env
  for (const name of patterns) {
    const val = cleanVal(process.env[name]);
    if (val) return val;
  }

  // 2. Busca case-insensitive em todas as variáveis de ambiente (ex: gemini_api_key no Render)
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

  // 3. Busca por substring se o usuário nomeou de forma customizada (ex: RENDER_GEMINI_API_KEY ou RENDER_GROQ_API_KEY)
  for (const [key, rawVal] of Object.entries(process.env)) {
    const val = cleanVal(rawVal);
    if (!val) continue;
    const lowerKey = key.toLowerCase();
    if (
      p === "GEMINI" &&
      (lowerKey.includes("gemini") || lowerKey.includes("google")) &&
      (lowerKey.includes("key") || lowerKey.includes("api") || lowerKey.includes("token"))
    ) {
      return val;
    }
    if (
      p === "GROQ" &&
      lowerKey.includes("groq") &&
      (lowerKey.includes("key") || lowerKey.includes("api") || lowerKey.includes("token"))
    ) {
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
 * Prioriza GEMINI. Se faltar, faz fallback automático para GROQ (e vice-versa).
 */
export function resolveAIKey(requestedProvider?: AIProvider, clientKey?: string): ResolvedAIConfig {
  const cleanClientKey = cleanVal(clientKey);
  const initialProvider: AIProvider = requestedProvider === "GROQ" ? "GROQ" : "GEMINI";

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

  // Fallback entre Gemini e Groq
  if (initialProvider === "GEMINI") {
    const groqEnv = getEnvKey("GROQ");
    if (groqEnv) {
      return {
        apiKey: groqEnv,
        activeProvider: "GROQ",
        source: "render",
      };
    }
  } else {
    const geminiEnv = getEnvKey("GEMINI");
    if (geminiEnv) {
      return {
        apiKey: geminiEnv,
        activeProvider: "GEMINI",
        source: "render",
      };
    }
  }

  return {
    apiKey: "",
    activeProvider: initialProvider,
    source: "none",
  };
}

export function getAIEnvStatus() {
  const geminiKey = getEnvKey("GEMINI");
  const groqKey = getEnvKey("GROQ");

  let preferredProvider: AIProvider | null = null;
  if (geminiKey) preferredProvider = "GEMINI";
  else if (groqKey) preferredProvider = "GROQ";

  return {
    gemini: Boolean(geminiKey),
    groq: Boolean(groqKey),
    geminiMasked: maskApiKey(geminiKey),
    groqMasked: maskApiKey(groqKey),
    preferredProvider,
  };
}
