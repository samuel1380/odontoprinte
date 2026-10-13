import { AIConfig, CalibrationRecommendation, AIChatMessage } from "@/types/ai.types";
import { OdontoPrintService } from "./odontoprint-service";
import {
  DEFAULT_GROQ_MODEL,
  DEFAULT_GEMINI_MODEL,
  normalizeModel,
  AI_CHAT_TIMEOUT_MS,
  AI_MAX_MESSAGE_CHARS,
} from "@/lib/ai/models";

const STORAGE_KEY = "odontoprint_ai_config";

export const DEFAULT_AI_CONFIG: AIConfig = {
  provider: "GEMINI",
  apiKey: "",
  model: DEFAULT_GEMINI_MODEL,
  enabled: true,
};

/** Migra configurações antigas salvas (ex: modelo qwen inexistente). */
function migrateConfig(config: AIConfig): AIConfig {
  const provider = config.provider === "GROQ" ? "GROQ" : "GEMINI";
  const fallback = provider === "GROQ" ? DEFAULT_GROQ_MODEL : DEFAULT_GEMINI_MODEL;
  return {
    ...config,
    provider,
    model: config.model ? normalizeModel(provider, config.model) : fallback,
  };
}

let inMemoryConfig: AIConfig = { ...DEFAULT_AI_CONFIG };

export class AIService {
  static getConfig(): AIConfig {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          inMemoryConfig = migrateConfig({ ...DEFAULT_AI_CONFIG, ...JSON.parse(saved) });
        }
      } catch {
        // ignore
      }
    }
    return { ...inMemoryConfig };
  }

  static saveConfig(config: AIConfig): void {
    inMemoryConfig = migrateConfig({ ...config });
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
        window.dispatchEvent(new CustomEvent("odontoprint_ai_config_changed", { detail: config }));
      } catch {
        // ignore
      }
    }
  }

  static async getEnvStatus(): Promise<{
    gemini: boolean;
    groq: boolean;
    geminiMasked?: string;
    groqMasked?: string;
    preferredProvider?: import("@/types/ai.types").AIProvider | null;
  }> {
    try {
      const res = await fetch("/api/ai/status");
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // ignore
    }
    return {
      gemini: false,
      groq: false,
      preferredProvider: null,
    };
  }

  static async testConnection(config: AIConfig): Promise<{
    success: boolean;
    message: string;
    latency?: number;
    details?: {
      provider?: string;
      model?: string;
      source?: string;
      note?: string;
      rawError?: string;
      diagnosticReport?: string;
    };
  }> {
    const startTime = Date.now();
    const provider = config.provider === "GROQ" ? "GROQ" : "GEMINI";
    const model = normalizeModel(provider, config.model);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Teste de conexão: responda apenas 'CONEXAO_OK'",
          provider,
          apiKey: config.apiKey,
          model,
          context: {},
        }),
        signal: AbortSignal.timeout(AI_CHAT_TIMEOUT_MS),
      });

      const data = await res.json();
      const latency = Date.now() - startTime;

      if (!res.ok || data.error) {
        const errorDetail = data.details || data.error || `Erro HTTP ${res.status}`;
        const diagnosticReport = [
          `[DIAGNÓSTICO ODONTOIA]`,
          `Status: FALHA DE CONEXÃO`,
          `Provedor: ${provider}`,
          `Modelo: ${model}`,
          `Origem da Chave: ${config.apiKey ? "Informada Manualmente" : "Variáveis de Ambiente do Render"}`,
          `Código HTTP: ${res.status}`,
          `Detalhes:`,
          errorDetail,
        ].join("\n");

        return {
          success: false,
          message: data.error || `Falha na conexão (HTTP ${res.status})`,
          latency,
          details: {
            provider,
            model,
            rawError: errorDetail,
            diagnosticReport,
          },
        };
      }

      const sourceLabel = data.source === "render" ? "Render Environment Variables" : "Chave Local";
      const diagnosticReport = [
        `[DIAGNÓSTICO ODONTOIA]`,
        `Status: CONEXÃO COM SUCESSO ✅`,
        `Provedor Ativo: ${data.provider || provider}`,
        `Modelo Ativo: ${data.model || model}`,
        `Origem da Chave: ${sourceLabel}`,
        `Latência: ${latency}ms`,
        data.note ? `Observação: ${data.note}` : "",
      ].filter(Boolean).join("\n");

      return {
        success: true,
        message: `Conectado com sucesso ao ${data.provider || provider} (${data.model || model})!`,
        latency,
        details: {
          provider: data.provider || provider,
          model: data.model || model,
          source: data.source,
          note: data.note,
          diagnosticReport,
        },
      };
    } catch (err: any) {
      const isTimeout = err?.name === "TimeoutError";
      const friendly = isTimeout
        ? "Tempo esgotado (30s). O provedor demorou a responder; tente de novo."
        : err?.message || "Falha na comunicação de rede com o servidor.";
      const diagnosticReport = [
        `[DIAGNÓSTICO ODONTOIA]`,
        `Status: ERRO DE REDE/FETCH`,
        `Provedor: ${provider}`,
        `Erro: ${friendly}`,
      ].join("\n");

      return {
        success: false,
        message: err?.message || "Falha na comunicação de rede com o servidor.",
        details: {
          provider: config.provider,
          model: config.model,
          rawError: String(err),
          diagnosticReport,
        },
      };
    }
  }

  static async sendMessage(message: string, history: AIChatMessage[] = []): Promise<string> {
    const config = this.getConfig();
    const cleanMessage = (message || "").trim();
    if (!cleanMessage) throw new Error("Digite sua dúvida para a OdontoIA.");
    if (cleanMessage.length > AI_MAX_MESSAGE_CHARS) {
      throw new Error(`Mensagem muito longa (máx. ${AI_MAX_MESSAGE_CHARS} caracteres).`);
    }

    // Coleta dados em tempo real do laboratório para o contexto da IA
    let context: any = {};
    try {
      const [casesRes, queueRes, printers, resins, milling, finishing] = await Promise.all([
        OdontoPrintService.getCases(),
        OdontoPrintService.getQueue(),
        OdontoPrintService.getPrinters(),
        OdontoPrintService.getResinBatches(),
        OdontoPrintService.getMillingItems(),
        OdontoPrintService.getFinishingItems(),
      ]);

      context = {
        cases: Array.isArray(casesRes) ? casesRes : (casesRes as any)?.cases || [],
        queue: queueRes.items || [],
        printers: printers || [],
        resins: resins || [],
        milling: milling || [],
        finishing: finishing || [],
      };
    } catch (err) {
      console.warn("Aviso ao carregar contexto de bancada para IA:", err);
    }

    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: cleanMessage,
        history: history.map((h) => ({ role: h.role, content: h.content })),
        context,
        provider: config.provider,
        apiKey: config.apiKey,
        model: normalizeModel(config.provider, config.model),
      }),
      signal: AbortSignal.timeout(AI_CHAT_TIMEOUT_MS),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = data.details || data.error || "Erro ao consultar a OdontoIA.";
      throw new Error(errMsg);
    }

    if (typeof data.reply !== "string" || !data.reply.trim()) {
      throw new Error("A IA retornou uma resposta vazia. Tente de novo.");
    }
    return data.reply;
  }

  static async getCalibrationRecommendation(params: {
    printer_name?: string;
    printerName?: string;
    printer_model?: string;
    printerModel?: string;
    resin_brand?: string;
    resinBrand?: string;
    resin_type?: string;
    resinType?: string;
    layer_height?: number;
    layerHeight?: number;
  }): Promise<CalibrationRecommendation> {
    const config = this.getConfig();

    const printer_name = params.printer_name || params.printerName || "Impressora 3D Odontológica";
    const printer_model = params.printer_model || params.printerModel || "";
    const resin_brand = params.resin_brand || params.resinBrand || "Smart Print";
    const resin_type = params.resin_type || params.resinType || "Modelo Dental";
    const layer_height = params.layer_height ?? params.layerHeight ?? 0.05;

    const res = await fetch("/api/ai/recommend-calibration", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        printer_name,
        printer_model,
        resin_brand,
        resin_type,
        layer_height,
        provider: config.provider,
        apiKey: config.apiKey,
        model: normalizeModel(config.provider, config.model),
      }),
      signal: AbortSignal.timeout(AI_CHAT_TIMEOUT_MS),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "Erro ao obter recomendação da IA.");
    }

    const initExp = data.initial_exposure_time ?? data.initialExposure ?? 28.0;
    const normExp = data.exposure_time ?? data.normalExposure ?? 2.3;
    const lSpeed = data.lift_speed ?? data.liftSpeed ?? 60.0;
    const lHeight = data.layer_height ?? data.layerHeight ?? layer_height;
    const wTime = data.wash_time ?? data.washTime ?? 5.0;
    const cTime = data.cure_time ?? data.cureTime ?? 10.0;
    const rat = data.rationale ?? data.notes ?? "Parâmetros fotopolimerizáveis ideais calculados.";
    const tps = Array.isArray(data.tips) ? data.tips : [];

    const normalized: CalibrationRecommendation = {
      initial_exposure_time: initExp,
      exposure_time: normExp,
      lift_speed: lSpeed,
      layer_height: lHeight,
      wash_time: wTime,
      cure_time: cTime,
      rationale: rat,
      tips: tps,
      initialExposure: initExp,
      normalExposure: normExp,
      liftSpeed: lSpeed,
      layerHeight: lHeight,
      washTime: wTime,
      cureTime: cTime,
      notes: rat,
      targetHexagonMm: data.targetHexagonMm ?? 10.0,
      confidenceScore: data.confidenceScore ?? 0.95,
      aiProvider: data.aiProvider ?? config.provider,
    };

    return normalized;
  }
}
