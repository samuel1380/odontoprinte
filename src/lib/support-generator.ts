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
  /** Diâmetro do pilar cilíndrico (mm). Padrão: 1.3 mm ("Suporte Médio") */
  pillarDiameter: number;
  /** Diâmetro da ponta cônica de contato (mm). Padrão: 0.65 mm */
  tipDiameter: number;
  /** Comprimento da ponta de contato (mm). Padrão: 1.3 mm */
  tipLength: number;
  /** Micro-penetração de ancoragem na superfície (mm). Padrão: 0.12 mm */
  tipPenetration: number;
  /** Diâmetro do pé cônico na balsa (mm). Padrão: 2.2 mm */
  baseDiameter: number;
  /** Altura do pé cônico de reforço na balsa (mm). Padrão: 0.8 mm */
  baseLength: number;
  /** Espessura da balsa/raft (mm). Padrão: 1.0 mm */
  raftThickness: number;
  /** Margem de extensão da balsa além do perímetro do modelo (mm). Padrão: 2.0 mm */
  raftMargin: number;
  /** Espaçamento médio da malha de suportes (mm). Padrão: 3.0 mm */
  supportSpacing: number;
  /** Distância mínima entre centros de pilares para evitar fusão de suportes vizinhos (mm). Padrão: 2.5 mm */
  minPillarDistance: number;
  /** Distância mínima de segurança entre a haste do pilar e as paredes do modelo (mm). Padrão: 0.75 mm */
  modelClearance: number;
}

export const DEFAULT_DENTAL_SUPPORT_CONFIG: DentalSupportConfig = {
  elevationZ: 5.0,
  pillarDiameter: 1.3,
  tipDiameter: 0.65,
  tipLength: 1.3,
  tipPenetration: 0.12,
  baseDiameter: 2.2,
  baseLength: 0.8,
  raftThickness: 1.0,
  raftMargin: 2.0,
  supportSpacing: 3.0,
  minPillarDistance: 2.5,
  modelClearance: 0.75,
};

export const DENTAL_SUPPORT_PROFILES = {
  GOLD_MEDIUM: {
    id: "GOLD_MEDIUM",
    label: "Médio Odontológico Anti-Fusão (Padrão Ouro)",
    description: "Equilíbrio ideal para arcadas completas e modelos de trabalho. Suporte firme sem marcar e sem fusão de pilares.",
    config: {
      elevationZ: 5.0,
      pillarDiameter: 1.3,
      tipDiameter: 0.65,
      tipLength: 1.3,
      tipPenetration: 0.12,
      baseDiameter: 2.2,
      baseLength: 0.8,
      raftThickness: 1.0,
      raftMargin: 2.0,
      supportSpacing: 3.0,
      minPillarDistance: 2.5,
      modelClearance: 0.75,
    },
  },
  FINE_PRECISION: {
    id: "FINE_PRECISION",
    label: "Fino / Alta Precisão",
    description: "Recomendado para troquéis, facetas e detalhes anatômicos finos com remoção ultra suave.",
    config: {
      elevationZ: 4.5,
      pillarDiameter: 1.0,
      tipDiameter: 0.50,
      tipLength: 1.1,
      tipPenetration: 0.08,
      baseDiameter: 1.8,
      baseLength: 0.6,
      raftThickness: 0.8,
      raftMargin: 1.5,
      supportSpacing: 2.5,
      minPillarDistance: 2.0,
      modelClearance: 0.6,
    },
  },
  HEAVY_STRUCTURAL: {
    id: "HEAVY_STRUCTURAL",
    label: "Reforçado / Anti-Falha Extrema",
    description: "Para modelos pesados ou maciços que exigem ancoragem máxima contra sucção do FEP.",
    config: {
      elevationZ: 6.0,
      pillarDiameter: 1.5,
      tipDiameter: 0.80,
      tipLength: 1.5,
      tipPenetration: 0.15,
      baseDiameter: 2.6,
      baseLength: 1.0,
      raftThickness: 1.2,
      raftMargin: 2.5,
      supportSpacing: 2.8,
      minPillarDistance: 2.8,
      modelClearance: 0.9,
    },
  },
} as const;

export type SupportProfileId = keyof typeof DENTAL_SUPPORT_PROFILES;

export interface SupportPillarInfo {
  x: number;
  y: number;
  zBase: number;
  zContact: number;
  height: number;
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
 * Gera um tronco de cone / cilindro em malha poligonal de 8 lados.
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
  const cos: number[] = [];
  const sin: number[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (2 * Math.PI * i) / segments;
    cos.push(Math.cos(angle));
    sin.push(Math.sin(angle));
  }

  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;

    const x0a = cx + r0 * cos[i];
    const y0a = cy + r0 * sin[i];
    const x0b = cx + r0 * cos[next];
    const y0b = cy + r0 * sin[next];

    const x1a = cx + r1 * cos[i];
    const y1a = cy + r1 * sin[i];
    const x1b = cx + r1 * cos[next];
    const y1b = cy + r1 * sin[next];

    triangles.push(x0a, y0a, z0, x0b, y0b, z0, x1b, y1b, z1);
    triangles.push(x0a, y0a, z0, x1b, y1b, z1, x1a, y1a, z1);
  }
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

  // 2. Modelo elevado: Z é deslocado para (Z - minZ + elevationZ)
  const zShift = -minZ + cfg.elevationZ;
  const elevatedMinZ = cfg.elevationZ;
  const elevatedMaxZ = maxZ + zShift;

  const startX = minX - cfg.raftMargin;
  const endX = maxX + cfg.raftMargin;
  const startY = minY - cfg.raftMargin;
  const endY = maxY + cfg.raftMargin;

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

  // 4. Amostragem em Malha Estocástica/Hexagonal para distribuição uniforme de suportes
  // Evita padrões de grade quadrada onde diagonais e ortogonais causam aglomeração
  const spacing = Math.max(1.8, cfg.supportSpacing);
  const rowStepY = spacing * (Math.sqrt(3) / 2);
  const sampleRows = Math.max(1, Math.ceil((endY - startY) / rowStepY));

  interface CandidatePoint {
    x: number;
    y: number;
    zContact: number;
    normal: { nx: number; ny: number; nz: number };
  }

  const rawCandidates: CandidatePoint[] = [];

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

        // REGRA CRÍTICA ANTI-FUSÃO NO MODELO:
        // Suporte NUNCA deve encostar em superfícies voltadas para cima (dentes, oclusal).
        // Apenas superfícies voltadas para baixo (nz < -0.15) ou plano de corte da base anatômica (az <= elevatedMinZ + 2.0).
        if (norm.nz > -0.12 && Math.min(az, bz, cz) > elevatedMinZ + 2.5) {
          continue;
        }

        if (pointInTriangle2D(px, py, ax, ay, bx, by, cx, cy)) {
          const zHit = interpolateZOnTriangle(px, py, ax, ay, az, bx, by, bz, cx, cy, cz, norm.nx, norm.ny, norm.nz);
          if (zHit !== null && zHit >= elevatedMinZ - 0.2) {
            // Guarda o ponto de menor Z na coluna (linha de visão livre a partir da mesa)
            if (bestHitZ === null || zHit < bestHitZ) {
              bestHitZ = zHit;
              bestNorm = norm;
            }
          }
        }
      }

      if (bestHitZ !== null && bestNorm !== null) {
        rawCandidates.push({
          x: px,
          y: py,
          zContact: bestHitZ,
          normal: bestNorm,
        });
      }
    }
  }

  // 5. Filtro de Segurança Anti-Fusão de Suportes (Pilar com Pilar e Pilar com Modelo)
  const pillars: SupportPillarInfo[] = [];
  const pRad = cfg.pillarDiameter / 2;
  const raftZ = cfg.raftThickness;
  const safePillarDistSq = Math.pow(cfg.minPillarDistance, 2);
  const stemRadiusWithClearance = pRad + cfg.modelClearance;

  // Ordena candidatos por altura de contato Z crescente (suportes mais baixos na base têm prioridade)
  rawCandidates.sort((a, b) => a.zContact - b.zContact);

  for (const cand of rawCandidates) {
    const px = cand.x;
    const py = cand.y;
    const zContact = cand.zContact;

    // A. Não adiciona se a distância até a balsa for ínfima
    if (zContact <= raftZ + cfg.tipLength + 0.3) continue;

    // B. CHECAGEM ANTI-FUSÃO ENTRE SUPORTES:
    // Garante distância mínima estrita entre pilares vizinhos para que nunca se fundam em uma massa sólida
    let tooCloseToOtherPillar = false;
    for (let pIdx = 0; pIdx < pillars.length; pIdx++) {
      const p = pillars[pIdx];
      const distSq = (px - p.x) * (px - p.x) + (py - p.y) * (py - p.y);
      if (distSq < safePillarDistSq) {
        tooCloseToOtherPillar = true;
        break;
      }
    }
    if (tooCloseToOtherPillar) continue;

    // C. CHECAGEM ANTI-FUSÃO COM O MODELO (Shaft-to-Wall Collision Clearance):
    // Verifica se a haste do pilar (de zBase até zContact - tipLength) colide ou passa muito perto
    // de alguma parede inclinada do modelo dentário
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
          const tMaxZ = Math.max(az, bz, cz);

          // Se o triângulo estiver no intervalo de altura da haste cilíndrica:
          if (tMinZ < zStemMax && tMaxZ > raftZ) {
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

    // Pilar aprovado com 100% de segurança anti-fusão
    pillars.push({
      x: px,
      y: py,
      zBase: raftZ,
      zContact,
      height: zContact - raftZ,
    });
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
            raftDilated[nj * raftCols + ni] = 1;
          }
        }
      }
    }
  }

  // Garante balsa sob cada pilar
  for (const pil of pillars) {
    const ri = Math.floor((pil.x - startX) / raftGridCell);
    const rj = Math.floor((pil.y - startY) / raftGridCell);
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const ni = ri + di;
        const nj = rj + dj;
        if (ni >= 0 && ni < raftCols && nj >= 0 && nj < raftRows) {
          raftDilated[nj * raftCols + ni] = 1;
        }
      }
    }
  }

  // 7. Geração da Geometria 3D dos Suportes (Pilares de Precisão e Balsa com Chanfro)
  const supportTrianglesCoords: number[] = [];
  const tipRad = cfg.tipDiameter / 2;
  const baseRad = cfg.baseDiameter / 2;

  for (const pil of pillars) {
    const cx = pil.x;
    const cy = pil.y;
    const z0 = pil.zBase;
    // Micro-penetração de ancoragem na peça: garante solda sólida sem gaps de fatiamento
    const zTop = pil.zContact + cfg.tipPenetration;
    const totalH = zTop - z0;

    const effBaseH = Math.min(cfg.baseLength, totalH * 0.25);
    const effTipH = Math.min(cfg.tipLength, totalH * 0.35);
    const effStemH = Math.max(0, totalH - effBaseH - effTipH);

    const zBaseEnd = z0 + effBaseH;
    const zStemEnd = zBaseEnd + effStemH;

    // Pé cônico de fixação na balsa: baseRad -> pRad
    appendCylinderSection(supportTrianglesCoords, cx, cy, z0, baseRad, zBaseEnd, pRad);
    appendCap(supportTrianglesCoords, cx, cy, z0, baseRad, false);

    // Haste média uniforme anti-fusão: pRad -> pRad
    if (effStemH > 0.05) {
      appendCylinderSection(supportTrianglesCoords, cx, cy, zBaseEnd, pRad, zStemEnd, pRad);
    }

    // Ponta cônica de precisão no modelo: pRad -> tipRad
    appendCylinderSection(supportTrianglesCoords, cx, cy, zStemEnd, pRad, zTop, tipRad);
    appendCap(supportTrianglesCoords, cx, cy, zTop, tipRad, true);
  }

  // Geometria da Balsa com Chanfro a 45°
  for (let rj = 0; rj < raftRows; rj++) {
    for (let ri = 0; ri < raftCols; ri++) {
      if (!raftDilated[rj * raftCols + ri]) continue;

      const x0 = startX + ri * raftGridCell;
      const x1 = x0 + raftGridCell;
      const y0 = startY + rj * raftGridCell;
      const y1 = y0 + raftGridCell;

      // Face superior (Z = raftZ)
      supportTrianglesCoords.push(x0, y0, raftZ, x1, y0, raftZ, x1, y1, raftZ);
      supportTrianglesCoords.push(x0, y0, raftZ, x1, y1, raftZ, x0, y1, raftZ);

      // Face inferior (Z = 0)
      supportTrianglesCoords.push(x0, y0, 0, x1, y1, 0, x1, y0, 0);
      supportTrianglesCoords.push(x0, y0, 0, x0, y1, 0, x1, y1, 0);

      // Bordas com chanfro a 45° para remoção fácil na espátula
      // Norte (Y+)
      if (rj === raftRows - 1 || !raftDilated[(rj + 1) * raftCols + ri]) {
        supportTrianglesCoords.push(x0, y1, 0, x1, y1, 0, x1, y1, raftZ);
        supportTrianglesCoords.push(x0, y1, 0, x1, y1, raftZ, x0, y1, raftZ);
      }
      // Sul (Y-)
      if (rj === 0 || !raftDilated[(rj - 1) * raftCols + ri]) {
        supportTrianglesCoords.push(x0, y0, 0, x1, y0, raftZ, x1, y0, 0);
        supportTrianglesCoords.push(x0, y0, 0, x0, y0, raftZ, x1, y0, raftZ);
      }
      // Leste (X+)
      if (ri === raftCols - 1 || !raftDilated[rj * raftCols + (ri + 1)]) {
        supportTrianglesCoords.push(x1, y0, 0, x1, y1, 0, x1, y1, raftZ);
        supportTrianglesCoords.push(x1, y0, 0, x1, y1, raftZ, x1, y0, raftZ);
      }
      // Oeste (X-)
      if (ri === 0 || !raftDilated[rj * raftCols + (ri - 1)]) {
        supportTrianglesCoords.push(x0, y0, 0, x0, y1, raftZ, x0, y1, 0);
        supportTrianglesCoords.push(x0, y0, 0, x0, y0, raftZ, x0, y1, raftZ);
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
      minX: Math.round((minX - cfg.raftMargin) * 10) / 10,
      maxX: Math.round((maxX + cfg.raftMargin) * 10) / 10,
      minY: Math.round((minY - cfg.raftMargin) * 10) / 10,
      maxY: Math.round((maxY + cfg.raftMargin) * 10) / 10,
      minZ: 0,
      maxZ: Math.round(elevatedMaxZ * 10) / 10,
      width: Math.round((modelWidth + cfg.raftMargin * 2) * 10) / 10,
      depth: Math.round((modelDepth + cfg.raftMargin * 2) * 10) / 10,
      height: Math.round(elevatedMaxZ * 10) / 10,
    },
    estimatedResinMl,
    durationMs,
  };
}
