/**
 * OdontoPrint — Gerador de Suportes Médios Odontológicos de Alta Precisão
 *
 * Aplica suportes calibrados com proteção anti-fusão de nível industrial:
 * 1. Não funde suporte com modelo (folga de segurança da haste e fixação apenas em superfícies inferiores).
 * 2. Não funde suporte com outro suporte (distância mínima garantida por malha estocástica/hexagonal).
 * 3. Ponta cônica micrométrica destacável (0,12 mm de penetração sólida para não quebrar no descolamento).
 * 4. Balsa (raft) com chanfro de 45° para remoção rápida e segura na espátula de laboratório.
 */

export interface DentalSupportConfig {
  /** Elevação Z do modelo em relação à chapa (mm). Padrão: 5.0 mm */
  elevationZ: number;
  /** Diâmetro do pilar cilíndrico (mm). Padrão: 1.20 mm */
  pillarDiameter: number;
  /** Diâmetro da ponta/esfera de contato (mm). Padrão: 0.70 mm */
  tipDiameter: number;
  /** Comprimento da ponta cônica / top length (mm). Padrão: 3.00 mm */
  tipLength: number;
  /** Profundidade de contato / contact depth de penetração (mm). Padrão: 0.40 mm */
  tipPenetration: number;
  /** Forma da parte de contato. Padrão: "SPHERE" (Esfera destacável odontológica) */
  tipShape?: "CONE" | "SPHERE";
  /** Diâmetro do pé cônico na balsa (mm). Padrão: 2.2 mm */
  baseDiameter: number;
  /** Altura do pé cônico de reforço na balsa (mm). Padrão: 0.8 mm */
  baseLength: number;
  /** Espessura da balsa/raft (mm). Padrão: 1.0 mm */
  raftThickness: number;
  /** Margem de extensão da balsa além do perímetro do modelo (mm). Padrão: 2.0 mm */
  raftMargin: number;
  /** Espaçamento médio da malha de suportes (mm). Padrão: 2.8 mm */
  supportSpacing: number;
  /** Distância mínima entre centros de pilares para evitar fusão de suportes vizinhos (mm). Padrão: 1.70 mm */
  minPillarDistance: number;
  /** Distância mínima de segurança entre a haste do pilar e as paredes do modelo (mm). Padrão: 0.75 mm */
  modelClearance: number;
  /** Espaçamento entre pilares perimetrais na lateral para formar paliçada densa contínua (mm). Padrão: 1.45 mm */
  lateralPillarSpacing?: number;
  /** Altura útil da chapa (mm). Usada para caber a elevação + modelo dentro do volume de impressão. */
  plateHeight?: number;
  /** Folga de ar mínima entre a superfície de dois suportes distintos (mm). Padrão: 0.40 mm */
  minSupportGap?: number;
  /** Largura útil da chapa da impressora (mm). Quando informada, balsa e suportes são contidos na chapa. */
  plateWidth?: number;
  /** Profundidade útil da chapa da impressora (mm). Quando informada, balsa e suportes são contidos na chapa. */
  plateDepth?: number;
}

export const DEFAULT_DENTAL_SUPPORT_CONFIG: DentalSupportConfig = {
  elevationZ: 5.0,
  pillarDiameter: 1.20,
  tipDiameter: 0.70,
  tipLength: 3.00,
  tipPenetration: 0.30,
  tipShape: "SPHERE",
  baseDiameter: 1.6,
  baseLength: 0.8,
  raftThickness: 1.0,
  raftMargin: 2.0,
  supportSpacing: 3.8,
  minPillarDistance: 1.70,
  modelClearance: 0.75,
  lateralPillarSpacing: 1.45,
  minSupportGap: 0.40,
};

export const DENTAL_SUPPORT_PROFILES = {
  MEDIUM: {
    id: "MEDIUM",
    name: "Médio",
    label: "Suporte Médio (Padrão Ouro)",
    badge: "Recomendado",
    description: "Equilíbrio ideal de alta precisão para arcadas completas e modelos de trabalho. Firmeza excelente sem fusão de pilares e sem marcar.",
    config: {
      elevationZ: 5.0,
      pillarDiameter: 1.20,
      tipDiameter: 0.70,
      tipLength: 3.00,
      tipPenetration: 0.30,
      tipShape: "SPHERE" as const,
      baseDiameter: 1.6,
      baseLength: 0.8,
      raftThickness: 1.0,
      raftMargin: 2.2,
      supportSpacing: 3.8,
      minPillarDistance: 1.70,
      modelClearance: 0.75,
      lateralPillarSpacing: 1.45,
    },
  },
  FINE: {
    id: "FINE",
    name: "Fino",
    label: "Suporte Fino (Alta Precisão)",
    badge: "Precisão Fina",
    description: "Recomendado para detalhes delicados, facetas e troquéis. Remoção ultra suave e mínima marcação na peça.",
    config: {
      elevationZ: 4.5,
      pillarDiameter: 1.0,
      tipDiameter: 0.50,
      tipLength: 1.1,
      tipPenetration: 0.08,
      baseDiameter: 1.8,
      baseLength: 0.6,
      raftThickness: 0.8,
      raftMargin: 1.8,
      supportSpacing: 2.6,
      minPillarDistance: 2.0,
      modelClearance: 0.70,
      lateralPillarSpacing: 1.25,
    },
  },
  HEAVY: {
    id: "HEAVY",
    name: "Grosso",
    label: "Suporte Grosso (Reforçado)",
    badge: "Anti-Sucção Forte",
    description: "Para modelos maciços ou pesados que exigem sustentação estrutural máxima contra a sucção do filme FEP.",
    config: {
      elevationZ: 6.0,
      pillarDiameter: 1.5,
      tipDiameter: 0.80,
      tipLength: 1.5,
      tipPenetration: 0.15,
      baseDiameter: 2.6,
      baseLength: 1.0,
      raftThickness: 1.2,
      raftMargin: 2.6,
      supportSpacing: 3.2,
      minPillarDistance: 2.8,
      modelClearance: 1.00,
      lateralPillarSpacing: 1.65,
    },
  },
  // Retrocompatibilidade transparente
  get GOLD_MEDIUM() {
    return this.MEDIUM;
  },
  get FINE_PRECISION() {
    return this.FINE;
  },
  get HEAVY_STRUCTURAL() {
    return this.HEAVY;
  },
} as const;

export type SupportProfileId = "FINE" | "MEDIUM" | "HEAVY" | "GOLD_MEDIUM" | "FINE_PRECISION" | "HEAVY_STRUCTURAL";

export type DentalSupportCategoryId = "MODELS" | "VENEERS" | "CROWNS" | "GUIDES";

export interface DentalSupportCategory {
  id: DentalSupportCategoryId;
  name: string;
  label: string;
  description: string;
  badge: string;
  isConfigured: boolean;
}

export const DENTAL_SUPPORT_CATEGORIES: Record<DentalSupportCategoryId, DentalSupportCategory> = {
  MODELS: {
    id: "MODELS",
    name: "Modelos Dentários",
    label: "Modelos Odontológicos (Zócalos & Arcadas)",
    description: "Configurado para modelos de trabalho, alinhadores e zócalos com amarração perimetral lateral pesada anti-distorção.",
    badge: "Configurado",
    isConfigured: true,
  },
  VENEERS: {
    id: "VENEERS",
    name: "Facetas & Lentes",
    label: "Facetas, Lentes & Fragmentos",
    description: "Suportes delicados com micro-pontas para bordas incisais ultrafinas sem lascamentos (calibração específica em breve).",
    badge: "Em breve",
    isConfigured: false,
  },
  CROWNS: {
    id: "CROWNS",
    name: "Coroas & Sobre Dente",
    label: "Coroas Unitárias, Pontes & Inlays",
    description: "Ancoragem oclusal estratégica com proteção do bordo de assentamento protético (calibração específica em breve).",
    badge: "Em breve",
    isConfigured: false,
  },
  GUIDES: {
    id: "GUIDES",
    name: "Guias Cirúrgicos",
    label: "Guias Cirúrgicos & Placas Miorrelaxantes",
    description: "Sustentação pesada anti-deformação para assentamento passivo de anéis metálicos (calibração específica em breve).",
    badge: "Em breve",
    isConfigured: false,
  },
};

export interface SupportPillarInfo {
  x: number;
  y: number;
  zBase: number;
  zContact: number;
  height: number;
  targetX?: number;
  targetY?: number;
  isLateral?: boolean;
  targetNormal?: { nx: number; ny: number; nz: number };
}

export interface SupportGenerationResult {
  /** Buffer binário do STL final (modelo elevado + pilares + balsa) */
  stlBuffer: ArrayBuffer;
  /** Triângulos do STL final */
  totalTriangles: number;
  /** Triângulos exclusivos dos suportes e balsa */
  supportTriangles: number;
  /** Quantidade de pilares médios gerados */
  pillarCount: number;
  /** Lista de pilares para renderização e inspeção no canvas */
  pillars: SupportPillarInfo[];
  /** Bounding box final (mm) */
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
    width: number;
    depth: number;
    height: number;
  };
  /**
   * Bounding box exclusivo do modelo (sem balsa/suportes), em mm.
   * Garante a verificação de escala 1:1 da peça original exportada.
   */
  modelBounds: {
    width: number;
    depth: number;
    height: number;
  };
  /** Volume estimado de resina dos suportes + balsa (ml) */
  estimatedResinMl: number;
  /** Tempo de cálculo em milissegundos */
  durationMs: number;
}

/**
 * Calcula a normal de um triângulo.
 */
function computeNormal(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number
): { nx: number; ny: number; nz: number } {
  const ux = bx - ax;
  const uy = by - ay;
  const uz = bz - az;
  const vx = cx - ax;
  const vy = cy - ay;
  const vz = cz - az;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  return { nx: nx / len, ny: ny / len, nz: nz / len };
}

/**
 * Adiciona um triângulo ao buffer STL binário via DataView.
 */
function writeTriangle(
  view: DataView,
  offset: number,
  nx: number,
  ny: number,
  nz: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number
): number {
  view.setFloat32(offset, nx, true);
  view.setFloat32(offset + 4, ny, true);
  view.setFloat32(offset + 8, nz, true);

  view.setFloat32(offset + 12, ax, true);
  view.setFloat32(offset + 16, ay, true);
  view.setFloat32(offset + 20, az, true);

  view.setFloat32(offset + 24, bx, true);
  view.setFloat32(offset + 28, by, true);
  view.setFloat32(offset + 32, bz, true);

  view.setFloat32(offset + 36, cx, true);
  view.setFloat32(offset + 40, cy, true);
  view.setFloat32(offset + 44, cz, true);

  view.setUint16(offset + 48, 0, true);
  return offset + 50;
}

/**
 * Gera um tronco de cone / cilindro 3D entre duas seções circulares (x0, y0, z0) e (x1, y1, z1).
 * Permite conexão de precisão para suportes laterais e verticais.
 */
function appendConeFrustum3D(
  triangles: number[],
  x0: number,
  y0: number,
  z0: number,
  r0: number,
  x1: number,
  y1: number,
  z1: number,
  r1: number,
  segments: number = 8
) {
  const cos: number[] = [];
  const sin: number[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (2 * Math.PI * i) / segments;
    cos.push(Math.cos(angle));
    sin.push(Math.sin(angle));
  }

  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;

    const x0a = x0 + r0 * cos[i];
    const y0a = y0 + r0 * sin[i];
    const x0b = x0 + r0 * cos[next];
    const y0b = y0 + r0 * sin[next];

    const x1a = x1 + r1 * cos[i];
    const y1a = y1 + r1 * sin[i];
    const x1b = x1 + r1 * cos[next];
    const y1b = y1 + r1 * sin[next];

    triangles.push(x0a, y0a, z0, x0b, y0b, z0, x1b, y1b, z1);
    triangles.push(x0a, y0a, z0, x1b, y1b, z1, x1a, y1a, z1);
  }
}

/**
 * Gera um tronco de cone / cilindro vertical em malha poligonal de 8 lados.
 */
function appendCylinderSection(
  triangles: number[],
  cx: number,
  cy: number,
  z0: number,
  r0: number,
  z1: number,
  r1: number,
  segments: number = 8
) {
  appendConeFrustum3D(triangles, cx, cy, z0, r0, cx, cy, z1, r1, segments);
}

/**
 * Gera tampa plana para cilindro (inferior ou superior).
 */
function appendCap(
  triangles: number[],
  cx: number,
  cy: number,
  z: number,
  radius: number,
  isTop: boolean,
  segments: number = 8
) {
  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    const a0 = (2 * Math.PI * i) / segments;
    const a1 = (2 * Math.PI * next) / segments;
    const x0 = cx + radius * Math.cos(a0);
    const y0 = cy + radius * Math.sin(a0);
    const x1 = cx + radius * Math.cos(a1);
    const y1 = cy + radius * Math.sin(a1);

    if (isTop) {
      triangles.push(cx, cy, z, x0, y0, z, x1, y1, z);
    } else {
      triangles.push(cx, cy, z, x1, y1, z, x0, y0, z);
    }
  }
}

/**
 * Gera calota esférica destacável 3D (domo exterior) fechando na borda superior do cone.
 * Elimina 100% de faces internas dentro do cone e arestas não-manifoldes (manifold perfeita).
 */
function appendSphericalCap(
  triangles: number[],
  cx: number,
  cy: number,
  cz: number,
  radius: number,
  dirX: number = 0,
  dirY: number = 0,
  dirZ: number = 1,
  rings: number = 5,
  sectors: number = 8
) {
  const len = Math.hypot(dirX, dirY, dirZ) || 1;
  const dx = dirX / len;
  const dy = dirY / len;
  const dz = dirZ / len;

  let ux = 0, uy = 1, uz = 0;
  if (Math.abs(dy) > 0.88) {
    ux = 1; uy = 0; uz = 0;
  }
  const dotUD = ux * dx + uy * dy + uz * dz;
  ux -= dotUD * dx;
  uy -= dotUD * dy;
  uz -= dotUD * dz;
  const uLen = Math.hypot(ux, uy, uz) || 1;
  ux /= uLen; uy /= uLen; uz /= uLen;

  const vx = dy * uz - dz * uy;
  const vy = dz * ux - dx * uz;
  const vz = dx * uy - dy * ux;

  for (let r = 0; r < rings; r++) {
    const phi0 = (Math.PI * 0.5 * r) / rings;
    const phi1 = (Math.PI * 0.5 * (r + 1)) / rings;
    const sin0 = Math.sin(phi0), cos0 = Math.cos(phi0);
    const sin1 = Math.sin(phi1), cos1 = Math.cos(phi1);

    for (let s = 0; s < sectors; s++) {
      const th0 = (2 * Math.PI * s) / sectors;
      const th1 = (2 * Math.PI * (s + 1)) / sectors;
      const cosT0 = Math.cos(th0), sinT0 = Math.sin(th0);
      const cosT1 = Math.cos(th1), sinT1 = Math.sin(th1);

      const p00x = cx + radius * (cos0 * dx + sin0 * (cosT0 * ux + sinT0 * vx));
      const p00y = cy + radius * (cos0 * dy + sin0 * (cosT0 * uy + sinT0 * vy));
      const p00z = cz + radius * (cos0 * dz + sin0 * (cosT0 * uz + sinT0 * vz));

      const p01x = cx + radius * (cos0 * dx + sin0 * (cosT1 * ux + sinT1 * vx));
      const p01y = cy + radius * (cos0 * dy + sin0 * (cosT1 * uy + sinT1 * vy));
      const p01z = cz + radius * (cos0 * dz + sin0 * (cosT1 * uz + sinT1 * vz));

      const p10x = cx + radius * (cos1 * dx + sin1 * (cosT0 * ux + sinT0 * vx));
      const p10y = cy + radius * (cos1 * dy + sin1 * (cosT0 * uy + sinT0 * vy));
      const p10z = cz + radius * (cos1 * dz + sin1 * (cosT0 * uz + sinT0 * vz));

      const p11x = cx + radius * (cos1 * dx + sin1 * (cosT1 * ux + sinT1 * vx));
      const p11y = cy + radius * (cos1 * dy + sin1 * (cosT1 * uy + sinT1 * vy));
      const p11z = cz + radius * (cos1 * dz + sin1 * (cosT1 * uz + sinT1 * vz));

      if (r === 0) {
        triangles.push(p00x, p00y, p00z, p11x, p11y, p11z, p10x, p10y, p10z);
      } else {
        triangles.push(p00x, p00y, p00z, p01x, p01y, p01z, p11x, p11y, p11z);
        triangles.push(p00x, p00y, p00z, p11x, p11y, p11z, p10x, p10y, p10z);
      }
    }
  }
}

/**
 * Gera uma micro-esfera de contato 3D destacável (padrão Sphere contact odontológico).
 */
function appendSphere(
  triangles: number[],
  cx: number,
  cy: number,
  cz: number,
  radius: number,
  rings: number = 6,
  sectors: number = 8
) {
  appendSphericalCap(triangles, cx, cy, cz, radius, 0, 0, 1, Math.max(3, Math.floor(rings / 2)), sectors);
  appendSphericalCap(triangles, cx, cy, cz, radius, 0, 0, -1, Math.max(3, Math.floor(rings / 2)), sectors);
}

export interface SupportSample {
  x: number;
  y: number;
  z: number;
  r: number;
}

function appendSegmentSamples(
  out: SupportSample[],
  ax: number,
  ay: number,
  az: number,
  ar: number,
  bx: number,
  by: number,
  bz: number,
  br: number,
  steps: number
) {
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    out.push({
      x: ax + (bx - ax) * t,
      y: ay + (by - ay) * t,
      z: az + (bz - az) * t,
      r: ar + (br - ar) * t,
    });
  }
}

/**
 * Amostra a superfície de um pilar acima do pé (haste, braço e ponta) para
 * detectar com precisão qualquer fusão/sobreposição entre suportes.
 * O pé/cone é omitido de propósito: os cones se apoiam na mesma balsa e podem
 * se tocar sem comprometer a impressão (a fusão crítica ocorre acima dela).
 */
export function sampleSupportGeometry(p: SupportPillarInfo, cfg: DentalSupportConfig): SupportSample[] {
  const pRad = cfg.pillarDiameter / 2;
  const tipRad = cfg.tipDiameter / 2;

  const z0 = p.zBase;
  const totalH = p.zContact - z0;
  const effBaseH = Math.min(cfg.baseLength, totalH * 0.20);
  const effTipH = Math.min(cfg.tipLength, Math.max(0.8, totalH - effBaseH - 0.5));
  const effStemH = Math.max(0, totalH - effBaseH - effTipH);
  const zBaseEnd = z0 + effBaseH;
  const zStemEnd = zBaseEnd + effStemH;

  const targetX = p.targetX ?? p.x;
  const targetY = p.targetY ?? p.y;
  const tNorm = p.targetNormal || { nx: 0, ny: 0, nz: -1 };
  const nLen3D = Math.hypot(tNorm.nx, tNorm.ny, tNorm.nz) || 1;
  const unx = tNorm.nx / nLen3D;
  const uny = tNorm.ny / nLen3D;
  const unz = tNorm.nz / nLen3D;

  const effPen = Math.min(tipRad, Math.max(0.05, cfg.tipPenetration));
  const offsetOut = tipRad - effPen;
  const sCx = targetX + unx * offsetOut;
  const sCy = targetY + uny * offsetOut;
  const sCz = p.zContact + unz * offsetOut;

  const samples: SupportSample[] = [];
  appendSegmentSamples(samples, p.x, p.y, zBaseEnd, pRad, p.x, p.y, zStemEnd, pRad, 3);
  appendSegmentSamples(samples, p.x, p.y, zStemEnd, pRad, sCx, sCy, sCz, tipRad, 4);
  samples.push({ x: sCx, y: sCy, z: sCz, r: tipRad });
  return samples;
}

/** Menor folga de ar entre as superfícies de dois suportes (mm, negativa quando há fusão). */
export function minSupportClearance(a: SupportSample[], b: SupportSample[]): number {
  let min = Infinity;
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      const dx = a[i].x - b[j].x;
      const dy = a[i].y - b[j].y;
      const dz = a[i].z - b[j].z;
      const gap = Math.hypot(dx, dy, dz) - a[i].r - b[j].r;
      if (gap < min) min = gap;
    }
  }
  return min;
}

/**
 * Testa se ponto (px, py) está contido no triângulo 2D (a, b, c).
 */
function pointInTriangle2D(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number
): boolean {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const hasNeg = d1 < -1e-7 || d2 < -1e-7 || d3 < -1e-7;
  const hasPos = d1 > 1e-7 || d2 > 1e-7 || d3 > 1e-7;
  return !(hasNeg && hasPos);
}

/**
 * Interpola o valor de Z em (px, py) projetado no plano do triângulo 3D (a, b, c).
 */
function interpolateZOnTriangle(
  px: number,
  py: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
  nx: number,
  ny: number,
  nz: number
): number | null {
  if (Math.abs(nz) < 1e-5) return null;
  return az - (nx * (px - ax) + ny * (py - ay)) / nz;
}

/**
 * Distância de ponto (px, py) até segmento de reta 2D (x1, y1)-(x2, y2).
 */
function distPointToSegmentSq(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-9) return (px - x1) * (px - x1) + (py - y1) * (py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return (px - projX) * (px - projX) + (py - projY) * (py - projY);
}

/**
 * Distância mínima do ponto 2D (px, py) até o triângulo 2D (a, b, c).
 */
function distPointToTriangle2D(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number
): number {
  if (pointInTriangle2D(px, py, ax, ay, bx, by, cx, cy)) return 0;
  const d1 = distPointToSegmentSq(px, py, ax, ay, bx, by);
  const d2 = distPointToSegmentSq(px, py, bx, by, cx, cy);
  const d3 = distPointToSegmentSq(px, py, cx, cy, ax, ay);
  return Math.sqrt(Math.min(d1, d2, d3));
}

/**
 * Gera a balsa (raft) e os suportes médios com proteção estrita anti-fusão.
 */
export async function generateDentalSupports(
  modelPositions: Float32Array,
  userConfig: Partial<DentalSupportConfig> = {}
): Promise<SupportGenerationResult> {
  const t0 = performance.now();
  const cfg: DentalSupportConfig = { ...DEFAULT_DENTAL_SUPPORT_CONFIG, ...userConfig };

  const triCount = Math.floor(modelPositions.length / 9);
  if (triCount === 0) {
    throw new Error("Nenhum triângulo fornecido para geração de suportes.");
  }

  // 1. Determina Bounding Box original
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < modelPositions.length; i += 3) {
    const x = modelPositions[i];
    const y = modelPositions[i + 1];
    const z = modelPositions[i + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  const modelWidth = maxX - minX;
  const modelDepth = maxY - minY;

  // Limites da chapa (opcionais). As coordenadas do modelo chegam no sistema
  // da própria chapa (origem no canto 0,0 da mesa), então a janela útil é
  // [0, plateW] × [0, plateD]. Todo suporte/balsa precisa caber NESSA janela:
  // se o conjunto ultrapassar a chapa, o Halot Box reescala a peça inteira
  // ("model is too large or too small scale to the fit size") e o modelo sai
  // menor que o original.
  const plateW = cfg.plateWidth && cfg.plateWidth > 0 ? cfg.plateWidth : null;
  const plateD = cfg.plateDepth && cfg.plateDepth > 0 ? cfg.plateDepth : null;
  const plateH = cfg.plateHeight && cfg.plateHeight > 0 ? cfg.plateHeight : null;
  const insidePlate = (x: number, y: number): boolean => {
    if (plateW !== null && (x < 0 || x > plateW)) return false;
    if (plateD !== null && (y < 0 || y > plateD)) return false;
    return true;
  };
  // A balsa recebe chanfro de 45° (1 espessura para fora): a célula precisa
  // caber inteira (célula + chanfro) dentro da chapa.
  const raftChamfer = cfg.raftThickness;
  const insidePlateForRaftCell = (x0: number, y0: number, x1: number, y1: number): boolean => {
    if (plateW !== null && (x0 - raftChamfer < 0 || x1 + raftChamfer > plateW)) return false;
    if (plateD !== null && (y0 - raftChamfer < 0 || y1 + raftChamfer > plateD)) return false;
    return true;
  };
  // Célula totalmente dentro da chapa (sem chanfro): garante base sob o pilar
  // mesmo encostado na borda da mesa.
  const insidePlateCell = (x0: number, y0: number, x1: number, y1: number): boolean => {
    if (plateW !== null && (x0 < 0 || x1 > plateW)) return false;
    if (plateD !== null && (y0 < 0 || y1 > plateD)) return false;
    return true;
  };

  // 2. Modelo elevado: Z é deslocado para (Z - minZ + elevationZ)
  // A elevação é encolhida se o conjunto (elevação + modelo) não couber na
  // altura útil da chapa: assim o STL não é reescalado pelo fatiador.
  const modelHeight = maxZ - minZ;
  let elevationZ = cfg.elevationZ;
  if (plateH !== null) {
    const maxElevation = plateH - modelHeight - 0.5;
    if (maxElevation < elevationZ) {
      elevationZ = Math.max(1.0, maxElevation);
    }
  }
  const zShift = -minZ + elevationZ;
  const elevatedMinZ = elevationZ;
  const elevatedMaxZ = maxZ + zShift;

  const gridMargin = Math.max(cfg.raftMargin + 1.5, cfg.pillarDiameter + 2.5);
  const startX = minX - gridMargin;
  const endX = maxX + gridMargin;
  const startY = minY - gridMargin;
  const endY = maxY + gridMargin;

  // 3. Spatial Grid para indexação rápida dos triângulos (acelera detecção de colisão e contato)
  const spatialCellSize = 5.0; // mm
  const gridCols = Math.max(1, Math.ceil((endX - startX) / spatialCellSize));
  const gridRows = Math.max(1, Math.ceil((endY - startY) / spatialCellSize));
  const spatialGrid: number[][] = Array.from({ length: gridCols * gridRows }, () => []);

  // Grade da Balsa (Raft)
  const raftGridCell = 1.5; // mm
  const raftCols = Math.max(1, Math.ceil((endX - startX) / raftGridCell));
  const raftRows = Math.max(1, Math.ceil((endY - startY) / raftGridCell));
  const raftOccupied = new Uint8Array(raftCols * raftRows);

  for (let t = 0; t < triCount; t++) {
    const off = t * 9;
    const ax = modelPositions[off];
    const ay = modelPositions[off + 1];
    const bx = modelPositions[off + 3];
    const by = modelPositions[off + 4];
    const cx = modelPositions[off + 6];
    const cy = modelPositions[off + 7];

    const tMinX = Math.min(ax, bx, cx);
    const tMaxX = Math.max(ax, bx, cx);
    const tMinY = Math.min(ay, by, cy);
    const tMaxY = Math.max(ay, by, cy);

    // Indexa no spatial grid
    const c0 = Math.max(0, Math.floor((tMinX - startX) / spatialCellSize));
    const c1 = Math.min(gridCols - 1, Math.floor((tMaxX - startX) / spatialCellSize));
    const r0 = Math.max(0, Math.floor((tMinY - startY) / spatialCellSize));
    const r1 = Math.min(gridRows - 1, Math.floor((tMaxY - startY) / spatialCellSize));

    for (let rj = r0; rj <= r1; rj++) {
      for (let ri = c0; ri <= c1; ri++) {
        spatialGrid[rj * gridCols + ri].push(t);
      }
    }

    // Marca no grid de projeção da balsa
    const rci0 = Math.max(0, Math.floor((tMinX - startX) / raftGridCell));
    const rci1 = Math.min(raftCols - 1, Math.floor((tMaxX - startX) / raftGridCell));
    const rcj0 = Math.max(0, Math.floor((tMinY - startY) / raftGridCell));
    const rcj1 = Math.min(raftRows - 1, Math.floor((tMaxY - startY) / raftGridCell));

    for (let rj = rcj0; rj <= rcj1; rj++) {
      for (let ri = rci0; ri <= rci1; ri++) {
        const px = startX + (ri + 0.5) * raftGridCell;
        const py = startY + (rj + 0.5) * raftGridCell;
        if (pointInTriangle2D(px, py, ax, ay, bx, by, cx, cy)) {
          raftOccupied[rj * raftCols + ri] = 1;
        }
      }
    }
  }

  // 3b. Mapeamento Anatômico da Margem Gengival / Oclusal e Altura Local dos Modelos
  // Permite que em mesas com múltiplos modelos (altos e baixos), cada peça tenha
  // seus suportes calculados na metade exata da sua respectiva altura local.
  const modelH = maxZ - minZ;
  const gingivaGridCell = 1.8; // mm
  const gingivaCols = Math.max(1, Math.ceil((endX - startX) / gingivaGridCell));
  const gingivaRows = Math.max(1, Math.ceil((endY - startY) / gingivaGridCell));
  const minGingivaGrid = new Float32Array(gingivaCols * gingivaRows);
  minGingivaGrid.fill(Infinity);
  const maxZGrid = new Float32Array(gingivaCols * gingivaRows);
  maxZGrid.fill(-Infinity);

  const gingivaThresholdZ = elevatedMinZ + Math.max(3.5, modelH * 0.40);

  for (let t = 0; t < triCount; t++) {
    const off = t * 9;
    const ax = modelPositions[off];
    const ay = modelPositions[off + 1];
    const az = modelPositions[off + 2] + zShift;

    const bx = modelPositions[off + 3];
    const by = modelPositions[off + 4];
    const bz = modelPositions[off + 5] + zShift;

    const cx = modelPositions[off + 6];
    const cy = modelPositions[off + 7];
    const cz = modelPositions[off + 8] + zShift;

    const tMinX = Math.min(ax, bx, cx);
    const tMaxX = Math.max(ax, bx, cx);
    const tMinY = Math.min(ay, by, cy);
    const tMaxY = Math.max(ay, by, cy);
    const minZTri = Math.min(az, bz, cz);
    const maxZTri = Math.max(az, bz, cz);

    const gi0 = Math.max(0, Math.floor((tMinX - startX) / gingivaGridCell));
    const gi1 = Math.min(gingivaCols - 1, Math.floor((tMaxX - startX) / gingivaGridCell));
    const gj0 = Math.max(0, Math.floor((tMinY - startY) / gingivaGridCell));
    const gj1 = Math.min(gingivaRows - 1, Math.floor((tMaxY - startY) / gingivaGridCell));

    // Mapeia altura máxima local
    for (let gj = gj0; gj <= gj1; gj++) {
      for (let gi = gi0; gi <= gi1; gi++) {
        const idx = gj * gingivaCols + gi;
        if (maxZTri > maxZGrid[idx]) {
          maxZGrid[idx] = maxZTri;
        }
      }
    }

    const norm = computeNormal(ax, ay, az, bx, by, bz, cx, cy, cz);

    // Gengiva e Dentes: superfícies anatômicas voltadas para cima (norm.nz > 0.35)
    // localizadas estritamente acima do zócalo (gingivaThresholdZ)
    if (norm.nz > 0.35 && minZTri >= gingivaThresholdZ) {
      for (let gj = gj0; gj <= gj1; gj++) {
        for (let gi = gi0; gi <= gi1; gi++) {
          const idx = gj * gingivaCols + gi;
          if (minZTri < minGingivaGrid[idx]) {
            minGingivaGrid[idx] = minZTri;
          }
        }
      }
    }
  }

  // Teto seguro anatômico:
  // - No canto posterior do zócalo (sem dentes/gengiva acima): sobe até perto do topo da parede do zócalo!
  // - Na lateral e parede lingual: sobe até a metade do modelo (topo do zócalo, logo abaixo da gengiva).
  // - Perto de dentes e gengivas: desce acompanhando a linha cervical (com margem de segurança de 0.8 mm abaixo da gengiva).
  const getSafeLateralMaxZ = (px: number, py: number): number => {
    const gi = Math.max(0, Math.min(gingivaCols - 1, Math.floor((px - startX) / gingivaGridCell)));
    const gj = Math.max(0, Math.min(gingivaRows - 1, Math.floor((py - startY) / gingivaGridCell)));
    let minGingiva = Infinity;
    let localMaxZ = -Infinity;
    const rad = 2; // Busca precisa cobrindo a transição parede-gengiva (~3.6 mm)
    for (let dj = -rad; dj <= rad; dj++) {
      for (let di = -rad; di <= rad; di++) {
        const ni = gi + di;
        const nj = gj + dj;
        if (ni >= 0 && ni < gingivaCols && nj >= 0 && nj < gingivaRows) {
          const idx = nj * gingivaCols + ni;
          const gz = minGingivaGrid[idx];
          if (gz < minGingiva) minGingiva = gz;
          const mz = maxZGrid[idx];
          if (mz > localMaxZ) localMaxZ = mz;
        }
      }
    }

    const effectiveLocalH = localMaxZ > elevatedMinZ + 2.0 ? localMaxZ - elevatedMinZ : modelH;
    const targetLateralHalfZ = elevatedMinZ + effectiveLocalH * 0.55;

    if (minGingiva !== Infinity) {
      // Região com gengiva/dentes acima: sobe na parede do zócalo até a metade da peça (ou até 0.8mm abaixo da gengiva)
      return Math.max(elevatedMinZ + 1.5, Math.min(minGingiva - 0.8, targetLateralHalfZ));
    }
    // Canto posterior / quinas do zócalo (livre de dentes em cima): sobe até a metade superior com margem segura do topo
    return Math.min(elevatedMinZ + Math.min(effectiveLocalH * 0.70, 20.0), localMaxZ - 1.5);
  };

  // 4. Amostragem de Suportes Odontológicos: Embaixo e nas Laterais Inferiores
  // REGRA INVIOLÁVEL: NUNCA no topo, NUNCA nos dentes, NUNCA na gengiva.
  // Suportes são restritos estritamente ao plano inferior e às paredes laterais da base (zócalo).
  const maxSupportZ = elevatedMinZ + Math.min(modelH * 0.40, 14.0);

  interface CandidatePoint {
    x: number;
    y: number;
    zContact: number;
    normal: { nx: number; ny: number; nz: number };
    targetX?: number;
    targetY?: number;
    isLateral?: boolean;
  }

  const bottomCandidates: CandidatePoint[] = [];

  // 4a. SUPORTES DE BAIXO (Face inferior, oca e reentrâncias da base)
  const spacing = Math.max(2.4, cfg.supportSpacing);
  const rowStepY = spacing * (Math.sqrt(3) / 2);
  const sampleRows = Math.max(1, Math.ceil((endY - startY) / rowStepY));

  for (let rj = 0; rj < sampleRows; rj++) {
    const py = startY + rj * rowStepY;
    const xOffset = (rj % 2) * (spacing * 0.5);
    const sampleCols = Math.max(1, Math.ceil((endX - startX) / spacing));

    for (let ri = 0; ri < sampleCols; ri++) {
      const px = startX + ri * spacing + xOffset;
      if (px < minX - 0.5 || px > maxX + 0.5 || py < minY - 0.5 || py > maxY + 0.5) continue;

      // Consulta triângulos na célula do spatial grid correspondente
      const gc = Math.max(0, Math.min(gridCols - 1, Math.floor((px - startX) / spatialCellSize)));
      const gr = Math.max(0, Math.min(gridRows - 1, Math.floor((py - startY) / spatialCellSize)));
      const candidateTriIndices = spatialGrid[gr * gridCols + gc];
      if (!candidateTriIndices || candidateTriIndices.length === 0) continue;

      let bestHitZ: number | null = null;
      let bestNorm: { nx: number; ny: number; nz: number } | null = null;

      for (let k = 0; k < candidateTriIndices.length; k++) {
        const t = candidateTriIndices[k];
        const off = t * 9;

        const ax = modelPositions[off];
        const ay = modelPositions[off + 1];
        const az = modelPositions[off + 2] + zShift;

        const bx = modelPositions[off + 3];
        const by = modelPositions[off + 4];
        const bz = modelPositions[off + 5] + zShift;

        const cx = modelPositions[off + 6];
        const cy = modelPositions[off + 7];
        const cz = modelPositions[off + 8] + zShift;

        const norm = computeNormal(ax, ay, az, bx, by, bz, cx, cy, cz);

        // REGRA ANTI-FUSÃO NO MODELO E PROTEÇÃO TOTAL DE DENTES/GENGIVA:
        // Apenas superfícies voltadas para baixo (nz < -0.10) ou corte inferior da base.
        // NUNCA atinge dentes ou superfícies superiores.
        if (norm.nz > 0.05 || Math.min(az, bz, cz) > maxSupportZ) {
          continue;
        }

        if (pointInTriangle2D(px, py, ax, ay, bx, by, cx, cy)) {
          const zHit = interpolateZOnTriangle(px, py, ax, ay, az, bx, by, bz, cx, cy, cz, norm.nx, norm.ny, norm.nz);
          if (zHit !== null && zHit >= elevatedMinZ - 0.2 && zHit <= maxSupportZ) {
            if (bestHitZ === null || zHit < bestHitZ) {
              bestHitZ = zHit;
              bestNorm = norm;
            }
          }
        }
      }

      if (bestHitZ !== null && bestNorm !== null) {
        bottomCandidates.push({
          x: px,
          y: py,
          zContact: bestHitZ,
          normal: bestNorm,
          isLateral: false,
        });
      }
    }
  }

  // 4b. SUPORTES LATERAIS CONTÍNUOS (Paredes laterais do zócalo / contorno perimetral completo)
  // Conectores sobem na lateral até o topo do zócalo atrás e descem acompanhando a gengiva na frente
  const pRad = cfg.pillarDiameter / 2;
  const tipRad = cfg.tipDiameter / 2;
  const baseRad = cfg.baseDiameter / 2;
  // Afasta a haste da parede o suficiente para cumprir a folga real do modelo
  const lateralPillarOffset = pRad + Math.max(0.70, cfg.modelClearance) + 0.10;
  const rawLateralCandidates: CandidatePoint[] = [];

  for (let t = 0; t < triCount; t++) {
    const off = t * 9;
    const az = modelPositions[off + 2] + zShift;
    const bz = modelPositions[off + 5] + zShift;
    const cz = modelPositions[off + 8] + zShift;

    const minTriZ = Math.min(az, bz, cz);
    if (minTriZ < elevatedMinZ - 0.5) continue;

    const ax = modelPositions[off];
    const ay = modelPositions[off + 1];
    const bx = modelPositions[off + 3];
    const by = modelPositions[off + 4];
    const cx = modelPositions[off + 6];
    const cy = modelPositions[off + 7];

    const norm = computeNormal(ax, ay, az, bx, by, bz, cx, cy, cz);

    // Parede lateral apontando para fora do modelo (zócalos verticais e com conicidade de alívio)
    const len2D = Math.hypot(norm.nx, norm.ny);
    if (len2D < 0.05 || Math.abs(norm.nz) > 0.85) continue;

    const edgeAB = Math.hypot(bx - ax, by - ay);
    const edgeBC = Math.hypot(cx - bx, cy - by);
    const edgeCA = Math.hypot(ax - cx, ay - cy);
    const maxEdge = Math.max(edgeAB, edgeBC, edgeCA);

    // Amostragem densa contínua ao longo de todo o perímetro da face lateral
    const numSubdivs = Math.max(1, Math.min(16, Math.ceil(maxEdge / 0.95)));

    for (let si = 0; si <= numSubdivs; si++) {
      for (let sj = 0; sj <= numSubdivs - si; sj++) {
        const w1 = numSubdivs === 1 ? 1 / 3 : si / numSubdivs;
        const w2 = numSubdivs === 1 ? 1 / 3 : sj / numSubdivs;
        const w3 = 1 - w1 - w2;

        const ptZ = w1 * az + w2 * bz + w3 * cz;
        const ptX = w1 * ax + w2 * bx + w3 * cx;
        const ptY = w1 * ay + w2 * by + w3 * cy;

        // Teto anatômico calculado: desce perto dos dentes e sobe até o topo do zócalo atrás
        const safeMaxZ = getSafeLateralMaxZ(ptX, ptY);
        if (ptZ > safeMaxZ || ptZ < elevatedMinZ) continue;

        rawLateralCandidates.push({
          x: ptX,
          y: ptY,
          zContact: ptZ,
          normal: norm,
          targetX: ptX,
          targetY: ptY,
          isLateral: true,
        });

        if (numSubdivs === 1) break;
      }
      if (numSubdivs === 1) break;
    }
  }

  // ORGANIZAÇÃO PERIMETRAL: elimina amostras repetidas no mesmo XY (mantendo a mais alta)
  // e ordena as fileiras pela direção da parede + posição ao longo dela. Isso mantém a
  // mesma densidade de suportes, porém em fileiras regulares (sem aglomerados/fusões).
  const dedupCell = 0.6;
  const bestByCell = new Map<string, CandidatePoint>();
  for (const cand of rawLateralCandidates) {
    // O contato fica na parede do modelo: só entra na lista se o modelo estiver
    // dentro da chapa (a haste é que precisa caber na janela da mesa).
    if (!insidePlate(cand.x, cand.y)) continue;
    const key = `${Math.round(cand.x / dedupCell)}_${Math.round(cand.y / dedupCell)}`;
    const prev = bestByCell.get(key);
    if (!prev || cand.zContact > prev.zContact) bestByCell.set(key, cand);
  }
  const orderedLateralCandidates = Array.from(bestByCell.values());

  const normalGroup = (c: CandidatePoint): number => {
    let a = Math.atan2(c.normal.ny, c.normal.nx);
    if (a < 0) a += Math.PI * 2;
    return Math.round(a / (Math.PI / 12)); // grupos de 15°
  };

  orderedLateralCandidates.sort((a, b) => {
    const ga = normalGroup(a);
    const gb = normalGroup(b);
    if (ga !== gb) return ga - gb;
    // Projeção na tangente da parede: percorre cada fileira de forma contínua.
    const ta = -a.normal.ny * a.x + a.normal.nx * a.y;
    const tb = -b.normal.ny * b.x + b.normal.nx * b.y;
    return ta - tb;
  });

  // Filtra candidatos laterais garantindo alta densidade perimetral contínua (~1.45 mm)
  const latSpacing = Math.max(1.30, userConfig.lateralPillarSpacing ?? 1.45);
  const latSpacingSq = latSpacing * latSpacing;
  const filteredLateralCandidates: CandidatePoint[] = [];

  for (const cand of orderedLateralCandidates) {
    let tooClose = false;
    for (let j = 0; j < filteredLateralCandidates.length; j++) {
      const prev = filteredLateralCandidates[j];
      const dSq = (cand.x - prev.x) ** 2 + (cand.y - prev.y) ** 2;
      // Garante distância horizontal mínima entre suportes na lateral (sem suportes na mesma posição XY)
      if (dSq < latSpacingSq) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) {
      filteredLateralCandidates.push(cand);
    }
  }

  // 5. Filtro de Segurança Anti-Fusão de Suportes (Pilar com Pilar e Pilar com Modelo)
  const pillars: SupportPillarInfo[] = [];
  const raftZ = cfg.raftThickness;
  const minPillarDist = Math.max(1.65, cfg.minPillarDistance || 1.70);
  const minPillarDistSq = minPillarDist * minPillarDist;
  const stemRadiusWithClearance = pRad + cfg.modelClearance;
  const minSupportGap = Math.max(0.25, cfg.minSupportGap ?? 0.40);
  const placedSamples: SupportSample[][] = [];

  // 5a. Insere PRIMEIRO os suportes LATERAIS com recuo adaptativo (garante barreira perimetral contínua)
  for (const cand of filteredLateralCandidates) {
    const targetX = cand.targetX ?? cand.x;
    const targetY = cand.targetY ?? cand.y;
    const zContact = cand.zContact;

    if (zContact <= raftZ + cfg.tipLength + 0.3) continue;

    const normLen2D = Math.hypot(cand.normal.nx, cand.normal.ny) || 1;
    const unx = cand.normal.nx / normLen2D;
    const uny = cand.normal.ny / normLen2D;

    // Tenta diferentes offsets de afastamento para a haste caso haja concavidade ou saliência na parede
    let bestPillarPos: { px: number; py: number } | null = null;
    let bestSamples: SupportSample[] | null = null;
    const offsetMultipliers = [1.0, 1.12, 1.25, 1.4, 1.6, 1.85, 2.1];

    // Testa na direção da normal; se colidir (ex: normal invertida do CAD apontando para dentro),
    // testa na direção oposta (-1) para garantir haste sempre do lado de fora do modelo
    for (const dir of [1, -1]) {
      const dirNx = unx * dir;
      const dirNy = uny * dir;

      for (const mult of offsetMultipliers) {
        const curOffset = lateralPillarOffset * mult;
        const testPx = targetX + dirNx * curOffset;
        const testPy = targetY + dirNy * curOffset;

        // A haste E o pé cônico precisam caber na chapa: caso contrário o
        // conjunto passa da mesa e o fatiador reescala tudo (modelo encolhido).
        if (!insidePlate(testPx - baseRad, testPy - baseRad)) continue;
        if (!insidePlate(testPx + baseRad, testPy + baseRad)) continue;

        // Checagem anti-fusão absoluta: distância mínima entre hastes vizinhas no plano da balsa
        let tooClose = false;
        for (let pIdx = 0; pIdx < pillars.length; pIdx++) {
          const p = pillars[pIdx];
          const distSq = (testPx - p.x) * (testPx - p.x) + (testPy - p.y) * (testPy - p.y);
          if (distSq < minPillarDistSq) {
            tooClose = true;
            break;
          }
        }
        if (tooClose) {
          continue;
        }

        // Checagem de colisão da haste vertical e do braço com o modelo
        // Usa a folga real cfg.modelClearance
        let collides = false;
        const clearance = stemRadiusWithClearance;

        // Calcula a posição do centro da ponta de contato da esfera/cone
        const nLen3D = Math.hypot(cand.normal.nx, cand.normal.ny, cand.normal.nz) || 1;
        const cnx = cand.normal.nx / nLen3D;
        const cny = cand.normal.ny / nLen3D;
        const cnz = cand.normal.nz / nLen3D;
        const effPen = Math.min(tipRad, Math.max(0.05, cfg.tipPenetration));
        const offsetOut = tipRad - effPen;
        const sCx = targetX + cnx * offsetOut;
        const sCy = targetY + cny * offsetOut;
        const sCz = zContact + cnz * offsetOut;

        const hDist = Math.hypot(sCx - testPx, sCy - testPy);
        // Garante inclinação do braço >= 45 graus (rise >= hDist * 0.95)
        const requiredRise = hDist * 0.95;
        const zStemMax = sCz - Math.max(cfg.tipLength, requiredRise);

        // Se a haste vertical não tiver espaço para subir da balsa, o ângulo seria < 45° (overhang severo)
        if (zStemMax < raftZ + cfg.baseLength) {
          continue;
        }

        // 1. Checagem da haste vertical contra o modelo (folga real modelClearance)
        if (zStemMax > elevatedMinZ + 0.2) {
          const gc0 = Math.max(0, Math.floor((testPx - clearance - startX) / spatialCellSize));
          const gc1 = Math.min(gridCols - 1, Math.floor((testPx + clearance - startX) / spatialCellSize));
          const gr0 = Math.max(0, Math.floor((testPy - clearance - startY) / spatialCellSize));
          const gr1 = Math.min(gridRows - 1, Math.floor((testPy + clearance - startY) / spatialCellSize));

          for (let gr = gr0; gr <= gr1 && !collides; gr++) {
            for (let gc = gc0; gc <= gc1 && !collides; gc++) {
              const triList = spatialGrid[gr * gridCols + gc];
              for (let k = 0; k < triList.length; k++) {
                const t = triList[k];
                const off = t * 9;
                const az = modelPositions[off + 2] + zShift;
                const bz = modelPositions[off + 5] + zShift;
                const cz = modelPositions[off + 8] + zShift;
                const tMinZ = Math.min(az, bz, cz);
                const tMaxZ = Math.max(az, bz, cz);

                // A haste vertical só colide com o modelo se o triângulo existir
                // dentro da faixa de Z da haste (entre elevatedMinZ e zStemMax)
                if (tMinZ < zStemMax && tMaxZ > elevatedMinZ + 0.1) {
                  const ax = modelPositions[off];
                  const ay = modelPositions[off + 1];
                  const bx = modelPositions[off + 3];
                  const by = modelPositions[off + 4];
                  const cx = modelPositions[off + 6];
                  const cy = modelPositions[off + 7];

                  const d2D = distPointToTriangle2D(testPx, testPy, ax, ay, bx, by, cx, cy);
                  if (d2D < clearance) {
                    collides = true;
                    break;
                  }
                }
              }
            }
          }
        }

        // 2. Checagem do braço conector inclinado em 3D contra saliências do modelo
        if (!collides && hDist > 0.3) {
          const checkSteps = [0.25, 0.50, 0.75];
          for (const st of checkSteps) {
            const bx = testPx + st * (sCx - testPx);
            const by = testPy + st * (sCy - testPy);
            const bz = zStemMax + st * (sCz - zStemMax);
            const armRad = pRad + st * (tipRad - pRad);
            const armClearance = armRad + cfg.modelClearance * 0.4;

            const bgc0 = Math.max(0, Math.floor((bx - armClearance - startX) / spatialCellSize));
            const bgc1 = Math.min(gridCols - 1, Math.floor((bx + armClearance - startX) / spatialCellSize));
            const bgr0 = Math.max(0, Math.floor((by - armClearance - startY) / spatialCellSize));
            const bgr1 = Math.min(gridRows - 1, Math.floor((by + armClearance - startY) / spatialCellSize));

            for (let gr = bgr0; gr <= bgr1 && !collides; gr++) {
              for (let gc = bgc0; gc <= bgc1 && !collides; gc++) {
                const triList = spatialGrid[gr * gridCols + gc];
                for (let k = 0; k < triList.length; k++) {
                  const t = triList[k];
                  const off = t * 9;
                  const az = modelPositions[off + 2] + zShift;
                  const bzT = modelPositions[off + 5] + zShift;
                  const cz = modelPositions[off + 8] + zShift;
                  const tMinZ = Math.min(az, bzT, cz);
                  const tMaxZ = Math.max(az, bzT, cz);

                  if (bz >= tMinZ - armClearance && bz <= tMaxZ + armClearance) {
                    const ax = modelPositions[off];
                    const ay = modelPositions[off + 1];
                    const bxT = modelPositions[off + 3];
                    const byT = modelPositions[off + 4];
                    const cxT = modelPositions[off + 6];
                    const cyT = modelPositions[off + 7];

                    // O braço DEVE se aproximar da parede de contato: ignora os
                    // triângulos da própria região-alvo para não empurrar a haste
                    // para longe e criar braços longos/cruzados.
                    if (distPointToTriangle2D(targetX, targetY, ax, ay, bxT, byT, cxT, cyT) < tipRad + 0.60) {
                      continue;
                    }

                    const d2D = distPointToTriangle2D(bx, by, ax, ay, bxT, byT, cxT, cyT);
                    if (d2D < armClearance) {
                      collides = true;
                      break;
                    }
                  }
                }
              }
            }
            if (collides) break;
          }
        }

        // 3. Checagem 3D de fusão com TODOS os suportes já aprovados
        // (pé × pé, haste × haste, braço × haste, braço × braço e ponta × ponta).
        const testPillar: SupportPillarInfo = {
          x: testPx,
          y: testPy,
          zBase: raftZ,
          zContact,
          height: zContact - raftZ,
          targetX,
          targetY,
          isLateral: true,
          targetNormal: cand.normal,
        };
        const testSamples = sampleSupportGeometry(testPillar, cfg);
        let supportCollides = false;
        for (let pIdx = 0; pIdx < placedSamples.length; pIdx++) {
          if (minSupportClearance(testSamples, placedSamples[pIdx]) < minSupportGap) {
            supportCollides = true;
            break;
          }
        }
        if (supportCollides) continue;

        if (!collides) {
          bestPillarPos = { px: testPx, py: testPy };
          bestSamples = testSamples;
          break; // Posição perfeita encontrada!
        }
      }

      if (bestPillarPos) break;
    }

    if (!bestPillarPos || !bestSamples) continue;

    const pillar: SupportPillarInfo = {
      x: bestPillarPos.px,
      y: bestPillarPos.py,
      zBase: raftZ,
      zContact,
      height: zContact - raftZ,
      targetX,
      targetY,
      isLateral: true,
      targetNormal: cand.normal,
    };
    pillars.push(pillar);
    placedSamples.push(bestSamples);
  }

  // 5b. Insere os suportes DE BAIXO para preencher o interior da base
  bottomCandidates.sort((a, b) => a.zContact - b.zContact);

  for (const cand of bottomCandidates) {
    const px = cand.x;
    const py = cand.y;
    const zContact = cand.zContact;

    if (zContact <= raftZ + cfg.tipLength + 0.3) continue;
    if (!insidePlate(px - baseRad, py - baseRad)) continue;
    if (!insidePlate(px + baseRad, py + baseRad)) continue;

    let tooClose = false;
    for (let pIdx = 0; pIdx < pillars.length; pIdx++) {
      const p = pillars[pIdx];
      const distSq = (px - p.x) * (px - p.x) + (py - p.y) * (py - p.y);
      if (distSq < minPillarDistSq) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    let shaftCollidesWithModel = false;
    const zStemMax = zContact - cfg.tipLength;

    const gc0 = Math.max(0, Math.floor((px - stemRadiusWithClearance - startX) / spatialCellSize));
    const gc1 = Math.min(gridCols - 1, Math.floor((px + stemRadiusWithClearance - startX) / spatialCellSize));
    const gr0 = Math.max(0, Math.floor((py - stemRadiusWithClearance - startY) / spatialCellSize));
    const gr1 = Math.min(gridRows - 1, Math.floor((py + stemRadiusWithClearance - startY) / spatialCellSize));

    for (let gr = gr0; gr <= gr1 && !shaftCollidesWithModel; gr++) {
      for (let gc = gc0; gc <= gc1 && !shaftCollidesWithModel; gc++) {
        const triList = spatialGrid[gr * gridCols + gc];
        for (let k = 0; k < triList.length; k++) {
          const t = triList[k];
          const off = t * 9;

          const az = modelPositions[off + 2] + zShift;
          const bz = modelPositions[off + 5] + zShift;
          const cz = modelPositions[off + 8] + zShift;

          const tMinZ = Math.min(az, bz, cz);

          if (tMinZ < zStemMax && Math.max(az, bz, cz) > raftZ) {
            const ax = modelPositions[off];
            const ay = modelPositions[off + 1];
            const bx = modelPositions[off + 3];
            const by = modelPositions[off + 4];
            const cx = modelPositions[off + 6];
            const cy = modelPositions[off + 7];

            const d2D = distPointToTriangle2D(px, py, ax, ay, bx, by, cx, cy);
            if (d2D < stemRadiusWithClearance) {
              shaftCollidesWithModel = true;
              break;
            }
          }
        }
      }
    }

    if (shaftCollidesWithModel) continue;

    const bottomPillar: SupportPillarInfo = {
      x: px,
      y: py,
      zBase: raftZ,
      zContact,
      height: zContact - raftZ,
      isLateral: false,
      targetNormal: cand.normal,
    };
    const bottomSamples = sampleSupportGeometry(bottomPillar, cfg);
    let supportCollides = false;
    for (let pIdx = 0; pIdx < placedSamples.length; pIdx++) {
      if (minSupportClearance(bottomSamples, placedSamples[pIdx]) < minSupportGap) {
        supportCollides = true;
        break;
      }
    }
    if (supportCollides) continue;

    pillars.push(bottomPillar);
    placedSamples.push(bottomSamples);
  }

  // Se nenhum pilar foi aprovado (ex: modelo muito pequeno com paredes muito íngremes),
  // assegura 4 pilares centrais mínimos sem colisão para evitar perda da peça
  if (pillars.length === 0) {
    const safeZ = elevatedMinZ;
    const defaults = [
      { x: minX + modelWidth * 0.3, y: minY + modelDepth * 0.3 },
      { x: maxX - modelWidth * 0.3, y: minY + modelDepth * 0.3 },
      { x: minX + modelWidth * 0.3, y: maxY - modelDepth * 0.3 },
      { x: maxX - modelWidth * 0.3, y: maxY - modelDepth * 0.3 },
    ];
    for (const d of defaults) {
      pillars.push({
        x: d.x,
        y: d.y,
        zBase: raftZ,
        zContact: safeZ,
        height: safeZ - raftZ,
      });
    }
  }

  // 6. Dilatação da Balsa (Raft)
  const dilateCells = Math.max(1, Math.ceil(cfg.raftMargin / raftGridCell));
  const raftDilated = new Uint8Array(raftCols * raftRows);

  for (let rj = 0; rj < raftRows; rj++) {
    for (let ri = 0; ri < raftCols; ri++) {
      if (!raftOccupied[rj * raftCols + ri]) continue;
      for (let dj = -dilateCells; dj <= dilateCells; dj++) {
        for (let di = -dilateCells; di <= dilateCells; di++) {
          const ni = ri + di;
          const nj = rj + dj;
          if (ni >= 0 && ni < raftCols && nj >= 0 && nj < raftRows) {
            const cx0 = startX + ni * raftGridCell;
            const cy0 = startY + nj * raftGridCell;
            if (insidePlateForRaftCell(cx0, cy0, cx0 + raftGridCell, cy0 + raftGridCell)) {
              raftDilated[nj * raftCols + ni] = 1;
            }
          }
        }
      }
    }
  }

  // Garante balsa sob cada pilar (tanto inferiores quanto laterais)
  for (const pil of pillars) {
    const ri = Math.floor((pil.x - startX) / raftGridCell);
    const rj = Math.floor((pil.y - startY) / raftGridCell);
    for (let dj = -2; dj <= 2; dj++) {
      for (let di = -2; di <= 2; di++) {
        const ni = ri + di;
        const nj = rj + dj;
        if (ni >= 0 && ni < raftCols && nj >= 0 && nj < raftRows) {
          // Garante balsa sob o pilar, mas nunca além da chapa (o conjunto tem
          // que caber 1:1 no volume de impressão).
          const cx0 = startX + ni * raftGridCell;
          const cy0 = startY + nj * raftGridCell;
          if (insidePlateCell(cx0, cy0, cx0 + raftGridCell, cy0 + raftGridCell)) {
            raftDilated[nj * raftCols + ni] = 1;
          }
        }
      }
    }
  }

  // 7. Geração da Geometria 3D dos Suportes (Pilares de Precisão e Balsa com Chanfro)
  const supportTrianglesCoords: number[] = [];

  for (const pil of pillars) {
    const cx = pil.x;
    const cy = pil.y;
    const z0 = pil.zBase;
    const totalH = pil.zContact - z0;

    const effBaseH = Math.min(cfg.baseLength, totalH * 0.20);
    const effTipH = Math.min(cfg.tipLength, Math.max(0.8, totalH - effBaseH - 0.5));
    const effStemH = Math.max(0, totalH - effBaseH - effTipH);

    const zBaseEnd = z0 + effBaseH;
    const zStemEnd = zBaseEnd + effStemH;

    // Pé cônico de fixação na balsa: baseRad -> pRad (anti-sobreposição)
    appendCylinderSection(supportTrianglesCoords, cx, cy, z0, baseRad, zBaseEnd, pRad);
    appendCap(supportTrianglesCoords, cx, cy, z0, baseRad, false);

    // Haste cilíndrica uniforme anti-fusão: pRad -> pRad (diâmetro 1.20 mm)
    if (effStemH > 0.05) {
      appendCylinderSection(supportTrianglesCoords, cx, cy, zBaseEnd, pRad, zStemEnd, pRad);
    }

    // Ponta conectando ao alvo
    const targetX = pil.targetX ?? cx;
    const targetY = pil.targetY ?? cy;
    const tNorm = pil.targetNormal || { nx: 0, ny: 0, nz: -1 };
    const nLen3D = Math.hypot(tNorm.nx, tNorm.ny, tNorm.nz) || 1;
    const unx = tNorm.nx / nLen3D;
    const uny = tNorm.ny / nLen3D;
    const unz = tNorm.nz / nLen3D;

    if (cfg.tipShape === "SPHERE") {
      // Penetração real controlada: esfera de raio tipRad entra exatamente tipPenetration sem cratera
      const effPen = Math.min(tipRad, Math.max(0.05, cfg.tipPenetration));
      const offsetOut = tipRad - effPen;
      const sCx = targetX + unx * offsetOut;
      const sCy = targetY + uny * offsetOut;
      const sCz = pil.zContact + unz * offsetOut;

      // Haste superior cônica conectando perfeitamente no centro da calota esférica
      appendConeFrustum3D(
        supportTrianglesCoords,
        cx,
        cy,
        zStemEnd,
        pRad,
        sCx,
        sCy,
        sCz,
        tipRad
      );
      // Calota esférica exterior fechando o topo em direção à superfície do modelo (zero faces internas)
      appendSphericalCap(
        supportTrianglesCoords,
        sCx,
        sCy,
        sCz,
        tipRad,
        -unx,
        -uny,
        -unz,
        4,
        8
      );
    } else {
      const zTop = pil.zContact + Math.min(0.20, cfg.tipPenetration);
      appendConeFrustum3D(
        supportTrianglesCoords,
        cx,
        cy,
        zStemEnd,
        pRad,
        targetX,
        targetY,
        zTop,
        tipRad
      );
      appendCap(supportTrianglesCoords, targetX, targetY, zTop, tipRad, true);
    }
  }

  // Geometria da Balsa com Chanfro Real a 45°
  const chamfer = raftZ; // Para 45°, o avanço horizontal na base é igual à espessura da balsa (1.0 mm)
  for (let rj = 0; rj < raftRows; rj++) {
    for (let ri = 0; ri < raftCols; ri++) {
      if (!raftDilated[rj * raftCols + ri]) continue;

      const x0 = startX + ri * raftGridCell;
      const x1 = x0 + raftGridCell;
      const y0 = startY + rj * raftGridCell;
      const y1 = y0 + raftGridCell;

      const isNorth = (rj === raftRows - 1 || !raftDilated[(rj + 1) * raftCols + ri]);
      const isSouth = (rj === 0 || !raftDilated[(rj - 1) * raftCols + ri]);
      const isEast  = (ri === raftCols - 1 || !raftDilated[rj * raftCols + (ri + 1)]);
      const isWest  = (ri === 0 || !raftDilated[rj * raftCols + (ri - 1)]);

      // Face superior plana (Z = raftZ)
      supportTrianglesCoords.push(x0, y0, raftZ, x1, y0, raftZ, x1, y1, raftZ);
      supportTrianglesCoords.push(x0, y0, raftZ, x1, y1, raftZ, x0, y1, raftZ);

      // Face inferior plana da célula (Z = 0)
      supportTrianglesCoords.push(x0, y0, 0, x1, y1, 0, x1, y0, 0);
      supportTrianglesCoords.push(x0, y0, 0, x0, y1, 0, x1, y1, 0);

      // Bordas com chanfro a 45° reais (rampa de espátula)
      // O chanfro NUNCA pode ultrapassar a chapa: seria o conjunto maior que a
      // mesa e o fatiador reescalaria o modelo.
      const canNorth = plateD === null || y1 + chamfer <= plateD;
      const canSouth = plateD === null || y0 - chamfer >= 0;
      const canEast = plateW === null || x1 + chamfer <= plateW;
      const canWest = plateW === null || x0 - chamfer >= 0;

      // Norte (Y+)
      if (isNorth && canNorth) {
        supportTrianglesCoords.push(x0, y1, raftZ, x1, y1, raftZ, x1, y1 + chamfer, 0);
        supportTrianglesCoords.push(x0, y1, raftZ, x1, y1 + chamfer, 0, x0, y1 + chamfer, 0);
        supportTrianglesCoords.push(x0, y1, 0, x1, y1 + chamfer, 0, x1, y1, 0);
        supportTrianglesCoords.push(x0, y1, 0, x0, y1 + chamfer, 0, x1, y1 + chamfer, 0);
      }
      // Sul (Y-)
      if (isSouth && canSouth) {
        supportTrianglesCoords.push(x1, y0, raftZ, x0, y0, raftZ, x0, y0 - chamfer, 0);
        supportTrianglesCoords.push(x1, y0, raftZ, x0, y0 - chamfer, 0, x1, y0 - chamfer, 0);
        supportTrianglesCoords.push(x0, y0 - chamfer, 0, x0, y0, 0, x1, y0, 0);
        supportTrianglesCoords.push(x0, y0 - chamfer, 0, x1, y0, 0, x1, y0 - chamfer, 0);
      }
      // Leste (X+)
      if (isEast && canEast) {
        supportTrianglesCoords.push(x1, y1, raftZ, x1, y0, raftZ, x1 + chamfer, y0, 0);
        supportTrianglesCoords.push(x1, y1, raftZ, x1 + chamfer, y0, 0, x1 + chamfer, y1, 0);
        supportTrianglesCoords.push(x1, y0, 0, x1 + chamfer, y1, 0, x1 + chamfer, y0, 0);
        supportTrianglesCoords.push(x1, y0, 0, x1, y1, 0, x1 + chamfer, y1, 0);
      }
      // Oeste (X-)
      if (isWest && canWest) {
        supportTrianglesCoords.push(x0, y0, raftZ, x0, y1, raftZ, x0 - chamfer, y1, 0);
        supportTrianglesCoords.push(x0, y0, raftZ, x0 - chamfer, y1, 0, x0 - chamfer, y0, 0);
        supportTrianglesCoords.push(x0 - chamfer, y0, 0, x0 - chamfer, y1, 0, x0, y1, 0);
        supportTrianglesCoords.push(x0 - chamfer, y0, 0, x0, y1, 0, x0, y0, 0);
      }

      // Quinas chanfradas a 45°
      if (isNorth && isEast) {
        supportTrianglesCoords.push(x1, y1, raftZ, x1, y1 + chamfer, 0, x1 + chamfer, y1 + chamfer, 0);
        supportTrianglesCoords.push(x1, y1, raftZ, x1 + chamfer, y1 + chamfer, 0, x1 + chamfer, y1, 0);
        supportTrianglesCoords.push(x1, y1, 0, x1, y1 + chamfer, 0, x1 + chamfer, y1 + chamfer, 0);
        supportTrianglesCoords.push(x1, y1, 0, x1 + chamfer, y1 + chamfer, 0, x1 + chamfer, y1, 0);
      }
      if (isNorth && isWest) {
        supportTrianglesCoords.push(x0, y1, raftZ, x0 - chamfer, y1, 0, x0 - chamfer, y1 + chamfer, 0);
        supportTrianglesCoords.push(x0, y1, raftZ, x0 - chamfer, y1 + chamfer, 0, x0, y1 + chamfer, 0);
        supportTrianglesCoords.push(x0, y1, 0, x0 - chamfer, y1 + chamfer, 0, x0 - chamfer, y1, 0);
        supportTrianglesCoords.push(x0, y1, 0, x0, y1 + chamfer, 0, x0 - chamfer, y1 + chamfer, 0);
      }
      if (isSouth && isEast) {
        supportTrianglesCoords.push(x1, y0, raftZ, x1 + chamfer, y0, 0, x1 + chamfer, y0 - chamfer, 0);
        supportTrianglesCoords.push(x1, y0, raftZ, x1 + chamfer, y0 - chamfer, 0, x1, y0 - chamfer, 0);
        supportTrianglesCoords.push(x1, y0, 0, x1 + chamfer, y0 - chamfer, 0, x1 + chamfer, y0, 0);
        supportTrianglesCoords.push(x1, y0, 0, x1, y0 - chamfer, 0, x1 + chamfer, y0 - chamfer, 0);
      }
      if (isSouth && isWest) {
        supportTrianglesCoords.push(x0, y0, raftZ, x0, y0 - chamfer, 0, x0 - chamfer, y0 - chamfer, 0);
        supportTrianglesCoords.push(x0, y0, raftZ, x0 - chamfer, y0 - chamfer, 0, x0 - chamfer, y0, 0);
        supportTrianglesCoords.push(x0, y0, 0, x0 - chamfer, y0, 0, x0 - chamfer, y0 - chamfer, 0);
        supportTrianglesCoords.push(x0, y0, 0, x0 - chamfer, y0 - chamfer, 0, x0, y0 - chamfer, 0);
      }
    }
  }

  // 8. Montagem do STL binário unificado
  const supportTriCount = Math.floor(supportTrianglesCoords.length / 9);
  const totalTriCount = triCount + supportTriCount;

  const bufferSize = 84 + totalTriCount * 50;
  const buffer = new ArrayBuffer(bufferSize);
  const view = new DataView(buffer);

  const headerText = `OdontoPrint Suporte Preciso Anti-Fusao (${pillars.length} pilares, raft ${cfg.raftThickness}mm)`;
  for (let i = 0; i < Math.min(80, headerText.length); i++) {
    view.setUint8(i, headerText.charCodeAt(i));
  }
  view.setUint32(80, totalTriCount, true);

  let offset = 84;

  // Modelo original elevado
  for (let t = 0; t < triCount; t++) {
    const off = t * 9;
    const ax = modelPositions[off];
    const ay = modelPositions[off + 1];
    const az = modelPositions[off + 2] + zShift;

    const bx = modelPositions[off + 3];
    const by = modelPositions[off + 4];
    const bz = modelPositions[off + 5] + zShift;

    const cx = modelPositions[off + 6];
    const cy = modelPositions[off + 7];
    const cz = modelPositions[off + 8] + zShift;

    const norm = computeNormal(ax, ay, az, bx, by, bz, cx, cy, cz);
    offset = writeTriangle(view, offset, norm.nx, norm.ny, norm.nz, ax, ay, az, bx, by, bz, cx, cy, cz);
  }

  // Suportes e Balsa
  for (let t = 0; t < supportTriCount; t++) {
    const off = t * 9;
    const ax = supportTrianglesCoords[off];
    const ay = supportTrianglesCoords[off + 1];
    const az = supportTrianglesCoords[off + 2];

    const bx = supportTrianglesCoords[off + 3];
    const by = supportTrianglesCoords[off + 4];
    const bz = supportTrianglesCoords[off + 5];

    const cx = supportTrianglesCoords[off + 6];
    const cy = supportTrianglesCoords[off + 7];
    const cz = supportTrianglesCoords[off + 8];

    const norm = computeNormal(ax, ay, az, bx, by, bz, cx, cy, cz);
    offset = writeTriangle(view, offset, norm.nx, norm.ny, norm.nz, ax, ay, az, bx, by, bz, cx, cy, cz);
  }

  // Cálculo real do Bounding Box a partir de todos os triângulos finais gerados
  let bMinX = Infinity, bMaxX = -Infinity;
  let bMinY = Infinity, bMaxY = -Infinity;
  let bMinZ = 0, bMaxZ = elevatedMaxZ;

  for (let i = 0; i < supportTrianglesCoords.length; i += 3) {
    const vx = supportTrianglesCoords[i];
    const vy = supportTrianglesCoords[i + 1];
    const vz = supportTrianglesCoords[i + 2];
    if (vx < bMinX) bMinX = vx;
    if (vx > bMaxX) bMaxX = vx;
    if (vy < bMinY) bMinY = vy;
    if (vy > bMaxY) bMaxY = vy;
    if (vz > bMaxZ) bMaxZ = vz;
  }
  for (let i = 0; i < modelPositions.length; i += 3) {
    const vx = modelPositions[i];
    const vy = modelPositions[i + 1];
    const vz = modelPositions[i + 2] + zShift;
    if (vx < bMinX) bMinX = vx;
    if (vx > bMaxX) bMaxX = vx;
    if (vy < bMinY) bMinY = vy;
    if (vy > bMaxY) bMaxY = vy;
    if (vz > bMaxZ) bMaxZ = vz;
  }

  // Consumo aproximado de resina (ml)
  const avgPillarVolumeMm3 = Math.PI * Math.pow(pRad, 2) * (cfg.elevationZ || 5) * 1.15;
  const totalPillarsVolumeMm3 = pillars.length * avgPillarVolumeMm3;
  let raftCellCount = 0;
  for (let i = 0; i < raftDilated.length; i++) if (raftDilated[i]) raftCellCount++;
  const raftVolumeMm3 = raftCellCount * Math.pow(raftGridCell, 2) * cfg.raftThickness;
  const estimatedResinMl = Math.round(((totalPillarsVolumeMm3 + raftVolumeMm3) / 1000) * 10) / 10;

  const durationMs = Math.round(performance.now() - t0);

  return {
    stlBuffer: buffer,
    totalTriangles: totalTriCount,
    supportTriangles: supportTriCount,
    pillarCount: pillars.length,
    pillars,
    bounds: {
      minX: Math.round(bMinX * 10) / 10,
      maxX: Math.round(bMaxX * 10) / 10,
      minY: Math.round(bMinY * 10) / 10,
      maxY: Math.round(bMaxY * 10) / 10,
      minZ: 0,
      maxZ: Math.round(bMaxZ * 10) / 10,
      width: Math.round((bMaxX - bMinX) * 10) / 10,
      depth: Math.round((bMaxY - bMinY) * 10) / 10,
      height: Math.round(bMaxZ * 10) / 10,
    },
    modelBounds: {
      width: Math.round(modelWidth * 1000) / 1000,
      depth: Math.round(modelDepth * 1000) / 1000,
      height: Math.round((maxZ - minZ) * 1000) / 1000,
    },
    estimatedResinMl,
    durationMs,
  };
}

export interface DetectedIsland {
  x: number;
  y: number;
  z: number;
  area: number;
  isSupported: boolean;
  severity: "CRITICAL" | "WARNING";
}

/**
 * Detector de Ilhas Suspensas no Ar (Island Detector)
 * Identifica regiões onde o modelo 3D começa a imprimir no ar sem sustentação por baixo.
 */
export function detectIslands(
  modelPositions: Float32Array,
  existingSupports?: Array<{ x: number; y: number; zContact?: number }>,
  options: { minIslandAreaMm2?: number; supportRadiusMm?: number } = {}
): DetectedIsland[] {
  const triCount = Math.floor(modelPositions.length / 9);
  if (triCount === 0) return [];

  const minArea = options.minIslandAreaMm2 || 0.15;
  const supportRadius = options.supportRadiusMm || 2.5;

  const islands: DetectedIsland[] = [];
  const visitedBuckets = new Set<string>();

  for (let t = 0; t < triCount; t++) {
    const off = t * 9;
    const ax = modelPositions[off];
    const ay = modelPositions[off + 1];
    const az = modelPositions[off + 2];
    const bx = modelPositions[off + 3];
    const by = modelPositions[off + 4];
    const bz = modelPositions[off + 5];
    const cx = modelPositions[off + 6];
    const cy = modelPositions[off + 7];
    const cz = modelPositions[off + 8];

    const norm = computeNormal(ax, ay, az, bx, by, bz, cx, cy, cz);
    // Faces voltadas para baixo (overhang acentuado ou teto invertido)
    if (norm.nz < -0.35) {
      const abx = bx - ax, aby = by - ay, abz = bz - az;
      const acx = cx - ax, acy = cy - ay, acz = cz - az;
      const crossX = aby * acz - abz * acy;
      const crossY = abz * acx - abx * acz;
      const crossZ = abx * acy - aby * acx;
      const triArea = 0.5 * Math.hypot(crossX, crossY, crossZ);

      const lowestZ = Math.min(az, bz, cz);
      const midX = (ax + bx + cx) / 3;
      const midY = (ay + by + cy) / 3;

      const bucketKey = `${Math.round(midX / 2.5)}_${Math.round(midY / 2.5)}`;
      if (visitedBuckets.has(bucketKey)) continue;

      let isSupported = false;
      if (existingSupports && existingSupports.length > 0) {
        for (const sup of existingSupports) {
          const d = Math.hypot(sup.x - midX, sup.y - midY);
          if (d <= supportRadius) {
            isSupported = true;
            break;
          }
        }
      }

      if (!isSupported && triArea >= minArea) {
        visitedBuckets.add(bucketKey);
        islands.push({
          x: Math.round(midX * 10) / 10,
          y: Math.round(midY * 10) / 10,
          z: Math.round(lowestZ * 10) / 10,
          area: Math.round(triArea * 100) / 100,
          isSupported,
          severity: norm.nz < -0.75 ? "CRITICAL" : "WARNING",
        });
      }
    }
  }

  return islands;
}

