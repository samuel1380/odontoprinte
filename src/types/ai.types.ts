export type AIProvider = "GROQ" | "GEMINI" | "OPENAI" | "MISTRAL" | "OPENAI_COMPATIBLE";

export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  model: string;
  enabled: boolean;
  customEndpoint?: string;
  temperature?: number;
}

export interface AIChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
}

export interface CalibrationRecommendation {
  initial_exposure_time: number;
  exposure_time: number;
  lift_speed: number;
  layer_height: number;
  wash_time: number;
  cure_time: number;
  rationale: string;
  tips: string[];
  // Propriedades compatíveis para o frontend
  initialExposure: number;
  normalExposure: number;
  liftSpeed: number;
  layerHeight: number;
  washTime: number;
  cureTime: number;
  notes: string;
  targetHexagonMm?: number;
  confidenceScore?: number;
  aiProvider?: string;
}
