/**
 * OdontoPrint — API pública dos suportes.
 *
 * O motor antigo (paliçada contínua + balsa única) foi substituído pelo
 * `support-engine.ts` (overhang + anel lateral inferior + sapatas individuais).
 * Este arquivo mantém o caminho de importação usado pela UI e pelos testes.
 */

export * from "./support-config";

export {
  generateDentalSupports,
  detectIslands,
} from "./support-engine";

export type { DetectedIsland } from "./support-engine";

export {
  sampleSupportGeometry,
  minSupportClearance,
  computeBaseProfile,
  computeTipProfile,
} from "./support-geometry";

export type { SupportSample, BaseProfile, TipProfile } from "./support-geometry";
