import { AIProvider } from "@/types/ai.types";

/**
 * Catálogo central de modelos de IA.
 * Fonte única usada pelo frontend (ai-service, configuracoes, drawer)
 * e pelo backend (rotas /api/ai/*). Evita nomes divergentes entre telas.
 *
 * Gemini (docs Google AI for Developers, 2026):
 *  - gemini-3.8-flash (mais recente, padrão)
 *  - gemini-3.5-flash (fallback estável)
 *  - gemini-2.5-flash (fallback legado)
 * Groq (console.groq.com/docs/models):
 *  - openai/gpt-oss-120b (produção, padrão)
 *  - openai/gpt-oss-20b (produção, rápido)
 *  - llama-3.3-70b-versatile (produção)
 *  - llama-3.1-8b-instant (produção, mais rápido)
 *  - qwen/qwen3-32b (produção, raciocínio)
 */

export const GEMINI_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.5-flash",
  "gemini-2.5-flash",
] as const;

export const GROQ_MODELS = [
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "qwen/qwen3-32b",
] as const;

export const DEFAULT_GEMINI_MODEL = GEMINI_MODELS[0];
export const DEFAULT_GROQ_MODEL = GROQ_MODELS[0];

export const DEFAULT_MODEL_FOR_PROVIDER: Record<AIProvider, string> = {
  GEMINI: DEFAULT_GEMINI_MODEL,
  GROQ: DEFAULT_GROQ_MODEL,
};

/** Limites anti-abuso / anti-travamento */
export const AI_CHAT_TIMEOUT_MS = 30000;
export const AI_SERVER_TIMEOUT_MS = 25000;
export const AI_MAX_MESSAGE_CHARS = 4000;
export const AI_MAX_HISTORY_TURNS = 6;

/** Modelos legados que devem ser migrados automaticamente */
const LEGACY_MODEL_MAP: Record<string, string> = {
  // nome inventado em versões antigas -> modelo real no Groq
  "qwen/qwen3.8-27b": "qwen/qwen3-32b",
  "gemini-3.8-flash ": "gemini-3.8-flash",
};

/**
 * Normaliza o modelo pedido: migra legados, valida contra o catálogo
 * e cai para o padrão do provedor quando inválido.
 */
export function normalizeModel(provider: AIProvider, model?: string): string {
  const cleaned = (model || "").trim();
  const migrated = LEGACY_MODEL_MAP[cleaned] || cleaned;
  const catalog = provider === "GROQ" ? GROQ_MODELS : GEMINI_MODELS;
  if ((catalog as readonly string[]).includes(migrated)) return migrated;
  // Aceita override via env (GEMINI_MODEL / GROQ_MODEL) mesmo fora do catálogo
  if (typeof process !== "undefined") {
    const envOverride =
      provider === "GROQ" ? process.env.GROQ_MODEL : process.env.GEMINI_MODEL;
    if (envOverride && envOverride.trim() === migrated) return migrated;
  }
  return DEFAULT_MODEL_FOR_PROVIDER[provider];
}

/** Cascata de tentativas: modelo pedido primeiro, depois o resto do catálogo (máx. 3). */
export function cascadeModels(provider: AIProvider, requested?: string): string[] {
  const first = normalizeModel(provider, requested);
  const catalog = (provider === "GROQ" ? GROQ_MODELS : GEMINI_MODELS) as readonly string[];
  return [first, ...catalog.filter((m) => m !== first)].slice(0, 3);
}
