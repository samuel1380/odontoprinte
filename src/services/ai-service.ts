import { AIConfig, CalibrationRecommendation, AIChatMessage } from "@/types/ai.types";
import { OdontoPrintService } from "./odontoprint-service";

const STORAGE_KEY = "odontoprint_ai_config";

export const DEFAULT_AI_CONFIG: AIConfig = {
  provider: "GROQ",
  apiKey: "",
  model: "llama-3.3-70b-versatile",
  enabled: true,
};

let inMemoryConfig: AIConfig = { ...DEFAULT_AI_CONFIG };

export class AIService {
  static getConfig(): AIConfig {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          inMemoryConfig = { ...DEFAULT_AI_CONFIG, ...JSON.parse(saved) };
        }
      } catch {
        // ignore
      }
    }
    return { ...inMemoryConfig };
  }

  static saveConfig(config: AIConfig): void {
    inMemoryConfig = { ...config };
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      } catch {
        // ignore
      }
    }
  }

  static async getEnvStatus(): Promise<{
    groq: boolean;
    gemini: boolean;
    openai: boolean;
    mistral: boolean;
    groqMasked?: string;
    geminiMasked?: string;
    openaiMasked?: string;
    mistralMasked?: string;
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
      groq: false,
      gemini: false,
      openai: false,
      mistral: false,
      preferredProvider: null,
    };
  }

  static async testConnection(config: AIConfig): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Teste de conexão: responda apenas 'CONEXAO_OK'",
          provider: config.provider,
          apiKey: config.apiKey,
          model: config.model,
          customEndpoint: config.customEndpoint,
          context: {},
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        return { success: false, message: data.error || `Erro HTTP ${res.status}` };
      }

      const sourceInfo = data.source === "render" ? " [Chave do Render]" : "";
      return {
        success: true,
        message: `Conectado com sucesso ao ${data.provider || config.provider}${sourceInfo} (${data.model || config.model})!`,
      };
    } catch (err: any) {
      return { success: false, message: err?.message || "Falha na comunicação de rede com o servidor." };
    }
  }

  static async sendMessage(message: string, history: AIChatMessage[] = []): Promise<string> {
    const config = this.getConfig();

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
        message,
        history: history.map((h) => ({ role: h.role, content: h.content })),
        context,
        provider: config.provider,
        apiKey: config.apiKey,
        model: config.model,
        customEndpoint: config.customEndpoint,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Erro ao consultar a OdontoIA.");
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
        model: config.model,
        customEndpoint: config.customEndpoint,
      }),
    });

    const data = await res.json();
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
