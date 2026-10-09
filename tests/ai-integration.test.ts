import { describe, it, expect, beforeEach, vi } from "vitest";
import { AIService, DEFAULT_AI_CONFIG } from "../src/services/ai-service";
import { AIConfig } from "../src/types/ai.types";

describe("AIService Unit Tests", () => {
  beforeEach(() => {
    // Restaura configuração padrão
    AIService.saveConfig(DEFAULT_AI_CONFIG);
    if (typeof window !== "undefined") {
      window.localStorage.clear();
    }
  });

  it("deve carregar configuração padrão para Gemini 3.8 quando nada foi configurado", () => {
    const config = AIService.getConfig();
    expect(config.provider).toBe("GEMINI");
    expect(config.model).toBe("gemini-3.8-flash");
    expect(config.enabled).toBe(true);
    expect(config.apiKey).toBe("");
  });

  it("deve salvar e carregar configurações personalizadas para Groq Cloud", () => {
    const customConfig: AIConfig = {
      provider: "GROQ",
      apiKey: "gsk_test_key_123",
      model: "openai/gpt-oss-120b",
      enabled: true,
    };

    AIService.saveConfig(customConfig);
    const loaded = AIService.getConfig();

    expect(loaded.provider).toBe("GROQ");
    expect(loaded.apiKey).toBe("gsk_test_key_123");
    expect(loaded.model).toBe("openai/gpt-oss-120b");
    expect(loaded.enabled).toBe(true);
  });

  it("deve salvar e carregar configurações para Google Gemini e Groq com modelos válidos", () => {
    const geminiConfig: AIConfig = {
      provider: "GEMINI",
      apiKey: "AIzaSy_fake_test_key",
      model: "gemini-3.8-flash",
      enabled: true,
    };
    AIService.saveConfig(geminiConfig);
    expect(AIService.getConfig().provider).toBe("GEMINI");
    expect(AIService.getConfig().model).toBe("gemini-3.8-flash");

    const groqQwenConfig: AIConfig = {
      provider: "GROQ",
      apiKey: "gsk_qwen_test",
      model: "qwen/qwen3.8-27b",
      enabled: true,
    };
    AIService.saveConfig(groqQwenConfig);
    const loadedGroq = AIService.getConfig();
    expect(loadedGroq.provider).toBe("GROQ");
    expect(loadedGroq.model).toBe("qwen/qwen3.8-27b");
  });

  it("deve validar resposta de recomendação de calibração", async () => {
    // Mock global de fetch para /api/ai/recommend-calibration
    const mockResponse = {
      initialExposure: 26.0,
      normalExposure: 2.2,
      liftSpeed: 60.0,
      layerHeight: 0.05,
      targetHexagonMm: 10.0,
      washTime: 5.0,
      cureTime: 10.0,
      notes: "Configuração calculada para Anycubic Photon Mono M5s com Smart Print Bio.",
      tips: ["Medir com paquímetro digital aferido.", "Checar os números na face de teste."],
      confidenceScore: 0.95,
      aiProvider: "GROQ",
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await AIService.getCalibrationRecommendation({
      printerName: "Anycubic Photon Mono M5s",
      resinType: "Modelo Dental",
      resinBrand: "Smart Print Bio",
      layerHeight: 0.05,
    });

    expect(result.initialExposure).toBe(26.0);
    expect(result.normalExposure).toBe(2.2);
    expect(result.targetHexagonMm).toBe(10.0);
    expect(result.tips.length).toBeGreaterThan(0);
  });

  it("deve enviar mensagem de chat ao assistente e receber a resposta", async () => {
    const mockChatResponse = {
      reply: "O modelo da Vanessa já foi fatiado e está impresso aguardando acabamento!",
      tokensUsed: 42,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockChatResponse,
    } as Response);

    const result = await AIService.sendMessage("O modelo da Vanessa já foi enviado?");
    expect(result).toContain("Vanessa");
  });
});
