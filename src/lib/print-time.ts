/**
 * OdontoPrint — Calculadora de Tempo de Impressão 3D Odontológica e Previsão de Término
 *
 * Algoritmo de precisão para impressoras MSLA/LCD (Anycubic, Elegoo, Creality Halot, etc):
 * - Altura Z máxima da chapa
 * - Camadas de base (bottom layers) com exposição longa
 * - Camadas de transição e normais
 * - Ciclo cinemático do eixo Z (lift height, lift speed, retract speed, light off delay)
 */

export interface PrintTimeParams {
  maxZMm: number;
  layerHeightMm?: number; // Padrão 0.05mm (50 microns)
  exposureTimeSec?: number; // Padrão 2.3s
  liftRetractTimeSec?: number; // Ciclo mecânico z-axis (~5.5s)
  bottomLayersCount?: number; // Padrão 4 camadas de balsa
  bottomExposureSec?: number; // Padrão 28s
  bottomLiftRetractSec?: number; // Padrão 8.5s
}

export interface PrintTimeEstimate {
  totalLayers: number;
  totalSeconds: number;
  totalMinutes: number;
  formattedDuration: string;
  completionDate: Date;
  formattedCompletion: string;
  isOvernight: boolean;
}

export function estimatePrintTime(params: PrintTimeParams): PrintTimeEstimate {
  const maxZ = Math.max(0, params.maxZMm || 0);
  const layerHeight = Math.max(0.01, params.layerHeightMm || 0.05);
  const exposure = Math.max(0.5, params.exposureTimeSec || 2.3);
  const lift = Math.max(2.0, params.liftRetractTimeSec || 5.5);
  const bottomLayers = Math.max(1, params.bottomLayersCount || 4);
  const bottomExposure = Math.max(exposure, params.bottomExposureSec || 28.0);
  const bottomLift = Math.max(lift, params.bottomLiftRetractSec || 8.5);

  if (maxZ <= 0) {
    const now = new Date();
    return {
      totalLayers: 0,
      totalSeconds: 0,
      totalMinutes: 0,
      formattedDuration: "0 min",
      completionDate: now,
      formattedCompletion: "--:--",
      isOvernight: false,
    };
  }

  const totalLayers = Math.ceil(maxZ / layerHeight);
  const actualBottom = Math.min(totalLayers, bottomLayers);
  const normalLayers = Math.max(0, totalLayers - actualBottom);

  // Tempo das camadas de base
  const bottomSeconds = actualBottom * (bottomExposure + bottomLift);
  // Tempo das camadas normais
  const normalSeconds = normalLayers * (exposure + lift);

  const totalSeconds = Math.round(bottomSeconds + normalSeconds);
  const totalMinutes = Math.round(totalSeconds / 60);

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  let formattedDuration = "";
  if (hours > 0) {
    formattedDuration = `${hours}h ${minutes.toString().padStart(2, "0")}min`;
  } else {
    formattedDuration = `${Math.max(1, minutes)}min`;
  }

  const completionDate = new Date(Date.now() + totalSeconds * 1000);
  const now = new Date();
  const isOvernight =
    completionDate.getDate() !== now.getDate() ||
    completionDate.getMonth() !== now.getMonth() ||
    completionDate.getFullYear() !== now.getFullYear();

  const hoursStr = completionDate.getHours().toString().padStart(2, "0");
  const minsStr = completionDate.getMinutes().toString().padStart(2, "0");
  const timeOnly = `${hoursStr}:${minsStr}`;

  const formattedCompletion = isOvernight ? `Amanhã às ${timeOnly}` : `Hoje às ${timeOnly}`;

  return {
    totalLayers,
    totalSeconds,
    totalMinutes,
    formattedDuration,
    completionDate,
    formattedCompletion,
    isOvernight,
  };
}
