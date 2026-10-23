/**
 * OdontoPrint — Motor de Suportes v2 (overhang + anel lateral)
 *
 * Substitui o gerador antigo de paliçada/balsa por uma abordagem em duas
 * camadas, inspirada no fluxo automático do Halot Box/Chitubox:
 *
 * 1. SUPORTES DE OVERHANG: amostra uma malha hexagonal no XY e procura a
 *    superfície MAIS BAIXA atingida por um raio vertical vindo de baixo. Isso
 *    acha qualquer overhang acessível de baixo, sem depender do winding das
 *    normais (CAD espelhado). A sonda de espaço aberto rejeita tetos de
 *    cavidades internas de modelos ocos.
 *
 * 2. ANEL LATERAL INFERIOR: amostra apenas as paredes laterais voltadas para
 *    fora na faixa inferior do modelo (40%, limitada a 14 mm). É uma malha
 *    espaçada (mesma densidade dos overhangs), não uma paliçada contínua.
 *
 * 3. BASE CONTÍNUA: projeção XY do modelo + pés dos suportes, margem e
 *    contorno com rampa de espátula a 30°. O topo fica em `baseTopZ` e recebe
 *    os pés cônicos; o perímetro desce até a chapa para a espátula soltar.
 */

import {
  DEFAULT_DENTAL_SUPPORT_CONFIG,
  type DentalSupportConfig,
  type SupportGenerationResult,
  type SupportPillarInfo,
} from "./support-config";
import {
  appendSupportMesh,
  computeNormal,
  computeTipProfile,
  distPointToTriangle2D,
  estimateSupportVolumeMm3,
  interpolateZOnTriangle,
  minSupportClearance,
  pointInTriangle2D,
  resolveKnee,
  sampleSupportGeometry,
  tipTooShort,
  writeTriangle,
  type SupportSample,
} from "./support-geometry";
import { buildRaftMesh } from "./support-base";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface Hit {
  z: number;
  nx: number;
  ny: number;
  nz: number;
}

interface SurfaceCandidate {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
}

export async function generateDentalSupports(
  modelPositions: Float32Array,
  userConfig: Partial<DentalSupportConfig> = {}
): Promise<SupportGenerationResult> {
  const t0 = performance.now();
  const cfg: DentalSupportConfig = {
    ...DEFAULT_DENTAL_SUPPORT_CONFIG,
    ...userConfig,
  };

  const triCount = Math.floor(modelPositions.length / 9);
  if (triCount === 0) {
    throw new Error("Nenhum triângulo fornecido para geração de suportes.");
  }

  // ---------------------------------------------------------------------------
  // 1. Bounding box, chapa e elevação
  // ---------------------------------------------------------------------------
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
  const modelH = maxZ - minZ;

  const plateW = cfg.plateWidth && cfg.plateWidth > 0 ? cfg.plateWidth : null;
  const plateD = cfg.plateDepth && cfg.plateDepth > 0 ? cfg.plateDepth : null;
  const plateH = cfg.plateHeight && cfg.plateHeight > 0 ? cfg.plateHeight : null;

  let elevationZ = cfg.elevationZ;
  if (plateH !== null) {
    const maxElevation = plateH - modelH - 0.5;
    if (maxElevation < elevationZ) {
      elevationZ = Math.max(1.0, maxElevation);
    }
  }
  const zShift = -minZ + elevationZ;
  const elevatedMinZ = elevationZ;
  const elevatedMaxZ = maxZ + zShift;

  // Topo da base contínua: a base nasce em Z=0, sobe até baseTopZ e recebe
  // uma rampa de espátula no perímetro. Nunca encosta no modelo.
  const baseTopZ = clamp(
    cfg.raftThickness,
    0.4,
    Math.max(0.4, elevationZ - 0.25)
  );

  const padFitsPlate = (x: number, y: number, padR: number): boolean => {
    if (plateW !== null && (x - padR < 0 || x + padR > plateW)) return false;
    if (plateD !== null && (y - padR < 0 || y + padR > plateD)) return false;
    return true;
  };

  // ---------------------------------------------------------------------------
  // 2. Parâmetros de malha
  // ---------------------------------------------------------------------------
  const pRad = Math.max(0.2, cfg.pillarDiameter / 2);
  const footR = Math.max(0.2, cfg.baseDiameter / 2, pRad + 0.02);
  const density = clamp(cfg.supportDensityPercent ?? 75, 25, 150);
  const minPillarDist = Math.max(1.2, cfg.minPillarDistance || 1.7);
  const minSupportGap = Math.max(0.2, cfg.minSupportGap ?? 0.4);
  const baseSpacing = Math.max(0.8, cfg.supportSpacing || 2.6);
  const densityFactor = Math.sqrt(75 / density);
  const spacing = clamp(baseSpacing * densityFactor, 1.0, 10.0);
  const gridSpacing = Math.max(
    spacing,
    minPillarDist,
    cfg.pillarDiameter + minSupportGap + 0.05
  );

  const angleDeg = clamp(cfg.supportAngleDeg ?? 60, 10, 85);
  const minAbsNz = Math.cos((angleDeg * Math.PI) / 180);

  const bandBottom = elevatedMinZ + 0.8;
  const bandTop =
    elevatedMinZ +
    Math.min(Math.max(3.0, modelH * 0.5) + 0.25, 15.25);

  // ---------------------------------------------------------------------------
  // 3. Índice espacial + normais dos triângulos
  // ---------------------------------------------------------------------------
  const gridMargin = Math.max(6.0, footR + 2.0);
  const startX = minX - gridMargin;
  const endX = maxX + gridMargin;
  const startY = minY - gridMargin;
  const endY = maxY + gridMargin;

  const spatialCellSize = 5.0;
  const gridCols = Math.max(1, Math.ceil((endX - startX) / spatialCellSize));
  const gridRows = Math.max(1, Math.ceil((endY - startY) / spatialCellSize));
  const spatialGrid: number[][] = Array.from(
    { length: gridCols * gridRows },
    () => []
  );

  const triMinZ = new Float32Array(triCount);
  const triMaxZ = new Float32Array(triCount);
  const triNx = new Float32Array(triCount);
  const triNy = new Float32Array(triCount);
  const triNz = new Float32Array(triCount);
  const triLen2D = new Float32Array(triCount);

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

    triMinZ[t] = Math.min(az, bz, cz);
    triMaxZ[t] = Math.max(az, bz, cz);

    const norm = computeNormal(ax, ay, az, bx, by, bz, cx, cy, cz);
    triNx[t] = norm.nx;
    triNy[t] = norm.ny;
    triNz[t] = norm.nz;
    triLen2D[t] = Math.hypot(norm.nx, norm.ny);

    const tMinX = Math.min(ax, bx, cx);
    const tMaxX = Math.max(ax, bx, cx);
    const tMinY = Math.min(ay, by, cy);
    const tMaxY = Math.max(ay, by, cy);

    const c0 = Math.max(0, Math.floor((tMinX - startX) / spatialCellSize));
    const c1 = Math.min(
      gridCols - 1,
      Math.floor((tMaxX - startX) / spatialCellSize)
    );
    const r0 = Math.max(0, Math.floor((tMinY - startY) / spatialCellSize));
    const r1 = Math.min(
      gridRows - 1,
      Math.floor((tMaxY - startY) / spatialCellSize)
    );

    for (let rj = r0; rj <= r1; rj++) {
      for (let ri = c0; ri <= c1; ri++) {
        spatialGrid[rj * gridCols + ri].push(t);
      }
    }
  }

  const triRayStamp = new Uint32Array(triCount);
  let rayStampId = 0;

  function rayHitsModelAtZ(
    ox: number,
    oy: number,
    z: number,
    dirX: number,
    dirY: number
  ): boolean {
    const dLen = Math.hypot(dirX, dirY);
    if (dLen < 1e-9) return false;
    const dx = dirX / dLen;
    const dy = dirY / dLen;

    let cellI = Math.floor((ox - startX) / spatialCellSize);
    let cellJ = Math.floor((oy - startY) / spatialCellSize);
    if (cellI < 0 || cellI >= gridCols || cellJ < 0 || cellJ >= gridRows) {
      return false;
    }

    const stepI = dx >= 0 ? 1 : -1;
    const stepJ = dy >= 0 ? 1 : -1;
    const tDeltaI = Math.abs(dx) > 1e-12 ? spatialCellSize / Math.abs(dx) : Infinity;
    const tDeltaJ = Math.abs(dy) > 1e-12 ? spatialCellSize / Math.abs(dy) : Infinity;
    const boundaryX = startX + (cellI + (stepI > 0 ? 1 : 0)) * spatialCellSize;
    const boundaryY = startY + (cellJ + (stepJ > 0 ? 1 : 0)) * spatialCellSize;
    let tMaxI = Math.abs(dx) > 1e-12 ? (boundaryX - ox) / dx : Infinity;
    let tMaxJ = Math.abs(dy) > 1e-12 ? (boundaryY - oy) / dy : Infinity;

    rayStampId++;
    const maxSteps = gridCols + gridRows + 4;

    for (let step = 0; step < maxSteps; step++) {
      const triList = spatialGrid[cellJ * gridCols + cellI];
      for (let k = 0; k < triList.length; k++) {
        const tri = triList[k];
        if (triMinZ[tri] > z + 1e-4 || triMaxZ[tri] < z - 1e-4) continue;
        if (triRayStamp[tri] === rayStampId) continue;
        triRayStamp[tri] = rayStampId;

        const off = tri * 9;
        const ax = modelPositions[off];
        const ay = modelPositions[off + 1];
        const az = modelPositions[off + 2] + zShift;
        const bx = modelPositions[off + 3];
        const by = modelPositions[off + 4];
        const bz = modelPositions[off + 5] + zShift;
        const cx = modelPositions[off + 6];
        const cy = modelPositions[off + 7];
        const cz = modelPositions[off + 8] + zShift;

        const e1x = bx - ax;
        const e1y = by - ay;
        const e1z = bz - az;
        const e2x = cx - ax;
        const e2y = cy - ay;
        const e2z = cz - az;
        const hx = dy * e2z;
        const hy = -dx * e2z;
        const hz = dx * e2y - dy * e2x;
        const det = e1x * hx + e1y * hy + e1z * hz;
        if (Math.abs(det) < 1e-9) continue;
        const inv = 1 / det;
        const sx = ox - ax;
        const sy = oy - ay;
        const sz = z - az;
        const u = inv * (sx * hx + sy * hy + sz * hz);
        if (u < -1e-6 || u > 1 + 1e-6) continue;
        const qx = sy * e1z - sz * e1y;
        const qy = sz * e1x - sx * e1z;
        const qz = sx * e1y - sy * e1x;
        const v = inv * (dx * qx + dy * qy);
        if (v < -1e-6 || u + v > 1 + 1e-6) continue;
        const hitT = inv * (e2x * qx + e2y * qy + e2z * qz);
        if (hitT > 1e-4) return true;
      }

      if (tMaxI < tMaxJ) {
        cellI += stepI;
        if (cellI < 0 || cellI >= gridCols) return false;
        tMaxI += tDeltaI;
      } else {
        cellJ += stepJ;
        if (cellJ < 0 || cellJ >= gridRows) return false;
        tMaxJ += tDeltaJ;
      }
    }
    return false;
  }

  /**
   * Um ponto é considerado em espaço aberto se pelo menos `minEscapes` dos
   * 8 raios horizontais conseguem escapar do modelo. O padrão (2) descarta
   * cavidades fechadas; valores maiores também descartam reentrâncias
   * internas abertas (por exemplo, o vão de uma alça), onde o suporte ficaria
   * dentro do envelope do modelo.
   */
  function isOpenSpaceProbe(
    px: number,
    py: number,
    pz: number,
    minEscapes = 2
  ): boolean {
    if (pz <= elevatedMinZ + 1e-3) return true;
    if (px < minX || px > maxX || py < minY || py > maxY) return true;

    let escapes = 0;
    for (let k = 0; k < 8; k++) {
      const a = (Math.PI * 2 * k) / 8;
      if (!rayHitsModelAtZ(px, py, pz, Math.cos(a), Math.sin(a))) {
        escapes++;
        if (escapes >= minEscapes) return true;
      }
    }
    return false;
  }

  function lowestHitAt(px: number, py: number): Hit | null {
    const gc = Math.floor((px - startX) / spatialCellSize);
    const gr = Math.floor((py - startY) / spatialCellSize);
    if (gc < 0 || gc >= gridCols || gr < 0 || gr >= gridRows) return null;

    const list = spatialGrid[gr * gridCols + gc];
    if (list.length === 0) return null;

    let bestZ = Infinity;
    let bestNx = 0;
    let bestNy = 0;
    let bestNz = 0;

    for (let k = 0; k < list.length; k++) {
      const t = list[k];
      const nz = triNz[t];
      if (Math.abs(nz) < 1e-4) continue;

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

      if (!pointInTriangle2D(px, py, ax, ay, bx, by, cx, cy)) continue;

      const z = interpolateZOnTriangle(
        px,
        py,
        ax,
        ay,
        az,
        triNx[t],
        triNy[t],
        nz
      );
      if (z !== null && z < bestZ) {
        bestZ = z;
        bestNx = triNx[t];
        bestNy = triNy[t];
        bestNz = nz;
      }
    }

    if (bestZ === Infinity) return null;
    return { z: bestZ, nx: bestNx, ny: bestNy, nz: bestNz };
  }

  function stemCollidesWithModel(
    px: number,
    py: number,
    clearanceRadius: number,
    z0: number,
    z1: number
  ): boolean {
    const c0 = Math.max(
      0,
      Math.floor((px - clearanceRadius - startX) / spatialCellSize)
    );
    const c1 = Math.min(
      gridCols - 1,
      Math.floor((px + clearanceRadius - startX) / spatialCellSize)
    );
    const r0 = Math.max(
      0,
      Math.floor((py - clearanceRadius - startY) / spatialCellSize)
    );
    const r1 = Math.min(
      gridRows - 1,
      Math.floor((py + clearanceRadius - startY) / spatialCellSize)
    );

    for (let rj = r0; rj <= r1; rj++) {
      for (let ri = c0; ri <= c1; ri++) {
        const list = spatialGrid[rj * gridCols + ri];
        for (let k = 0; k < list.length; k++) {
          const t = list[k];
          if (triMaxZ[t] < z0 || triMinZ[t] > z1) continue;

          const off = t * 9;
          const ax = modelPositions[off];
          const ay = modelPositions[off + 1];
          const bx = modelPositions[off + 3];
          const by = modelPositions[off + 4];
          const cx = modelPositions[off + 6];
          const cy = modelPositions[off + 7];

          const d2D = distPointToTriangle2D(px, py, ax, ay, bx, by, cx, cy);
          if (d2D < clearanceRadius) return true;
        }
      }
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // 4. Overhangs: malha hexagonal + raio vertical de baixo para cima
  // ---------------------------------------------------------------------------
  const bottomCandidates: SurfaceCandidate[] = [];
  const rowStep = gridSpacing * (Math.sqrt(3) / 2);
  const sampleCols =
    Math.max(1, Math.ceil((maxX - minX) / gridSpacing) + 1);
  const sampleRows = Math.max(1, Math.ceil((maxY - minY) / rowStep) + 1);

  for (let rj = 0; rj < sampleRows; rj++) {
    const py = minY + rj * rowStep;
    if (py > maxY + 1e-6) continue;
    const xOffset = (rj % 2) * (gridSpacing * 0.5);

    for (let ri = 0; ri < sampleCols; ri++) {
      const px = minX + ri * gridSpacing + xOffset;
      if (px > maxX + 1e-6) continue;

      const hit = lowestHitAt(px, py);
      if (!hit) continue;
      if (hit.z < elevatedMinZ - 0.25) continue;

      // O ângulo é medido em relação à horizontal. Faces verticais não são
      // overhangs e ficam fora; faces com |nz| >= cos(ângulo) entram.
      if (Math.abs(hit.nz) < minAbsNz) continue;

      // Teto de cavidade interna de modelo oco: a sonda horizontal não escapa.
      if (!isOpenSpaceProbe(px, py, hit.z - 0.45, 5)) continue;

      bottomCandidates.push({
        x: px,
        y: py,
        z: hit.z,
        nx: 0,
        ny: 0,
        nz: -1,
      });
    }
  }

  bottomCandidates.sort(
    (a, b) => a.z - b.z || a.y - b.y || a.x - b.x
  );

  // ---------------------------------------------------------------------------
  // 5. Anel lateral inferior (paredes externas, faixa de 50%)
  // ---------------------------------------------------------------------------
  const lateralByCell = new Map<string, SurfaceCandidate>();
  const latCell = Math.max(0.9, gridSpacing * 0.5);

  for (let t = 0; t < triCount; t++) {
    const nz = triNz[t];
    const len2D = triLen2D[t];
    if (len2D < 0.05 || Math.abs(nz) > 0.8) continue;
    if (triMaxZ[t] < bandBottom || triMinZ[t] > bandTop) continue;

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

    const maxEdge = Math.max(
      Math.hypot(bx - ax, by - ay),
      Math.hypot(cx - bx, cy - by),
      Math.hypot(ax - cx, ay - cy)
    );
    const n = Math.max(
      1,
      Math.min(20, Math.ceil(maxEdge / Math.max(1.2, gridSpacing * 0.5)))
    );

    for (let si = 0; si <= n; si++) {
      for (let sj = 0; sj <= n - si; sj++) {
        const w1 = n === 1 ? 1 / 3 : si / n;
        const w2 = n === 1 ? 1 / 3 : sj / n;
        const w3 = 1 - w1 - w2;

        const px = w1 * ax + w2 * bx + w3 * cx;
        const py = w1 * ay + w2 * by + w3 * cy;
        const pz = w1 * az + w2 * bz + w3 * cz;
        if (pz < bandBottom - 1e-6 || pz > bandTop + 1e-6) continue;

        const key = `${Math.round(px / latCell)}_${Math.round(py / latCell)}`;
        const prev = lateralByCell.get(key);
        if (!prev || pz > prev.z) {
          lateralByCell.set(key, {
            x: px,
            y: py,
            z: pz,
            nx: triNx[t],
            ny: triNy[t],
            nz,
          });
        }
      }
    }
  }

  const lateralCandidates = Array.from(lateralByCell.values()).sort(
    (a, b) => b.z - a.z || a.y - b.y || a.x - b.x
  );

  // ---------------------------------------------------------------------------
  // 6. Colocação com anti-fusão
  // ---------------------------------------------------------------------------
  const pillars: SupportPillarInfo[] = [];
  const placedSamples: SupportSample[][] = [];

  /**
   * Verifica se a haste/braço de um suporte atravessa o modelo.
   *
   * A coluna vertical é testada com folga real. No braço inclinado, o
   * centroide é amostrado até perto da ponta; a folga lateral só é exigida
   * na metade inferior, porque a região do cone/esfera encosta no modelo de
   * propósito (penetração de 0,30 mm).
   */
  const supportPathHitsModel = (
    pillar: SupportPillarInfo,
    tip: ReturnType<typeof computeTipProfile>,
    knee: number
  ): boolean => {
    const stemTop = Math.max(
      baseTopZ + 0.05,
      Math.min(knee - 0.05, tip.zConnection - 0.2)
    );
    if (stemTop > baseTopZ + 0.01) {
      if (
        stemCollidesWithModel(
          pillar.x,
          pillar.y,
          pRad + Math.max(0.55, cfg.modelClearance),
          baseTopZ,
          stemTop
        )
      ) {
        return true;
      }
    }

    const armDx = tip.sCx - pillar.x;
    const armDy = tip.sCy - pillar.y;
    const armDz = tip.zConnection - knee;
    const armLen = Math.hypot(armDx, armDy, armDz);
    if (armLen < 1e-4) return false;

    const steps = Math.max(4, Math.ceil(armLen / 0.35));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const px = pillar.x + armDx * t;
      const py = pillar.y + armDy * t;
      const pz = knee + armDz * t;

      // Centro do braço dentro do modelo: sempre inválido.
      if (!isOpenSpaceProbe(px, py, pz, t <= 0.5 ? 5 : 2)) return true;

      // Longe da ponta, exige folga para o raio do cone não encostar em
      // outra parede. Perto da ponta, o contato é intencional.
      if (t <= 0.5) {
        const localR =
          pRad + (tip.connectionRadius - pRad) * t + 0.05;
        if (
          stemCollidesWithModel(
            px,
            py,
            localR,
            pz - 0.05,
            pz + 0.05
          )
        ) {
          return true;
        }
      }
    }

    return false;
  };

  const commitSupport = (
    pillar: SupportPillarInfo,
    checkSamples: boolean
  ): boolean => {
    pillar.zBase = baseTopZ;
    pillar.height = pillar.zContact - baseTopZ;
    if (pillar.zContact - baseTopZ < 0.45) return false;
    if (tipTooShort(pillar, cfg)) return false;
    if (!padFitsPlate(pillar.x, pillar.y, footR)) return false;

    const targetX = pillar.targetX ?? pillar.x;
    const targetY = pillar.targetY ?? pillar.y;
    const normal = pillar.targetNormal ?? { nx: 0, ny: 0, nz: -1 };
    const tip = computeTipProfile(cfg, targetX, targetY, pillar.zContact, normal);
    const knee = resolveKnee(pillar, cfg, tip);
    if (supportPathHitsModel(pillar, tip, knee)) return false;

    for (let i = 0; i < pillars.length; i++) {
      const other = pillars[i];
      const d = Math.hypot(pillar.x - other.x, pillar.y - other.y);
      if (d < minPillarDist - 1e-6) return false;
    }

    const samples = sampleSupportGeometry(pillar, cfg);
    if (checkSamples) {
      for (let i = 0; i < placedSamples.length; i++) {
        if (
          minSupportClearance(samples, placedSamples[i]) <
          minSupportGap - 1e-4
        ) {
          return false;
        }
      }
    }

    pillars.push(pillar);
    placedSamples.push(samples);
    return true;
  };

  // 6a. Overhangs (base principal de sustentação)
  for (let i = 0; i < bottomCandidates.length; i++) {
    const c = bottomCandidates[i];
    const normal = { nx: 0, ny: 0, nz: -1 };
    const tip = computeTipProfile(cfg, c.x, c.y, c.z, normal);
    const knee = Math.max(
      baseTopZ + 0.02,
      Math.min(tip.sCz - cfg.tipLength, tip.zConnection - 0.02)
    );

    commitSupport(
      {
        x: c.x,
        y: c.y,
        zBase: baseTopZ,
        zContact: c.z,
        height: c.z - baseTopZ,
        isLateral: false,
        targetNormal: normal,
        zKnee: knee,
      },
      false
    );
  }

  // 6b. Anel lateral inferior
  const lateralOffsetBase = pRad + Math.max(0.7, cfg.modelClearance) + 0.1;
  const offsetMultipliers = [1.0, 1.15, 1.3];

  for (let i = 0; i < lateralCandidates.length; i++) {
    const c = lateralCandidates[i];
    const hLen = Math.hypot(c.nx, c.ny);
    if (hLen < 0.05) continue;

    const ux = c.nx / hLen;
    const uy = c.ny / hLen;
    if (
      tipTooShort(
        { x: c.x, y: c.y, zBase: baseTopZ, zContact: c.z, height: c.z - baseTopZ },
        cfg
      )
    ) {
      continue;
    }

    // Escolhe UMA direção externa antes de afastar a haste. Em paredes
    // finas (ou malha de folha única) os dois lados podem estar abertos; sem
    // essa trava o anti-fusão poderia alternar suportes para dentro e para
    // fora da peça, criando braços cruzando a parede.
    //
    // O teste é direcional: um raio horizontal saindo do contato deve
    // ESCAPAR pelo lado de fora e ENCONTRAR o modelo pelo lado de dentro.
    // Assim funciona mesmo com normais invertidas e com modelos abertos.
    const hitsAlong = (dir: 1 | -1): boolean =>
      rayHitsModelAtZ(c.x, c.y, c.z, ux * dir, uy * dir);

    const plusHits = hitsAlong(1);
    const minusHits = hitsAlong(-1);
    let side: 1 | -1 | 0;
    if (plusHits && minusHits) {
      side = 0; // parede interna de cavidade: nenhum lado é externo
    } else if (plusHits) {
      side = -1;
    } else if (minusHits) {
      side = 1;
    } else {
      side = 1; // folha fina: segue a normal do triângulo
    }
    if (side === 0) continue;

    const normal = { nx: ux * side, ny: uy * side, nz: 0 };

    for (let m = 0; m < offsetMultipliers.length; m++) {
      const lateralOffset = lateralOffsetBase * offsetMultipliers[m];
      const stemX = c.x + ux * side * lateralOffset;
      const stemY = c.y + uy * side * lateralOffset;
      const tip = computeTipProfile(cfg, c.x, c.y, c.z, normal);
      const hDist = lateralOffset - tip.offsetOut;

      const desiredKnee =
        tip.sCz -
        Math.sqrt(Math.max(0.04, cfg.tipLength * cfg.tipLength - hDist * hDist));
      const knee = Math.max(
        baseTopZ + 0.02,
        Math.min(desiredKnee, tip.zConnection - 0.02)
      );

      // A haste precisa estar em espaço aberto em toda a faixa que ocupa.
      const probeLow = baseTopZ + 0.05;
      const probeHigh = Math.max(probeLow + 0.1, knee - 0.05);
      if (!isOpenSpaceProbe(stemX, stemY, probeLow, 5)) continue;
      if (!isOpenSpaceProbe(stemX, stemY, probeHigh, 5)) continue;

      // A haste não pode atravessar outra parede do modelo.
      if (
        stemCollidesWithModel(
          stemX,
          stemY,
          pRad + Math.max(0.55, cfg.modelClearance),
          baseTopZ,
          knee
        )
      ) {
        continue;
      }

      const pillar: SupportPillarInfo = {
        x: stemX,
        y: stemY,
        zBase: baseTopZ,
        zContact: c.z,
        height: c.z - baseTopZ,
        targetX: c.x,
        targetY: c.y,
        isLateral: true,
        targetNormal: normal,
        zKnee: knee,
      };

      if (commitSupport(pillar, true)) {
        break;
      }
    }
  }

  // 6c. Último recurso: se nada foi aprovado, tenta 4 pontos baixos da base.
  if (pillars.length === 0) {
    const fallbackPoints = [
      { x: minX + modelWidth * 0.25, y: minY + modelDepth * 0.25 },
      { x: minX + modelWidth * 0.75, y: minY + modelDepth * 0.25 },
      { x: minX + modelWidth * 0.25, y: minY + modelDepth * 0.75 },
      { x: minX + modelWidth * 0.75, y: minY + modelDepth * 0.75 },
    ];

    for (const point of fallbackPoints) {
      const hit = lowestHitAt(point.x, point.y);
      if (!hit) continue;
      if (!isOpenSpaceProbe(point.x, point.y, hit.z - 0.45, 5)) continue;

      if (hit.z - baseTopZ < 0.45) continue;
      const normal = { nx: 0, ny: 0, nz: -1 };
      const tip = computeTipProfile(cfg, point.x, point.y, hit.z, normal);
      const knee = Math.max(
        baseTopZ + 0.02,
        Math.min(tip.sCz - cfg.tipLength, tip.zConnection - 0.02)
      );

      commitSupport(
        {
          x: point.x,
          y: point.y,
          zBase: baseTopZ,
          zContact: hit.z,
          height: hit.z - baseTopZ,
          isLateral: false,
          targetNormal: normal,
          zKnee: knee,
        },
        false
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 7. Base contínua + malha final (modelo + base + suportes)
  // ---------------------------------------------------------------------------
  // A base é construída DEPOIS dos pilares: assim ela cobre a projeção do
  // modelo e também cada pé cônico, inclusive os suportes laterais. O topo da
  // base é plano em `baseTopZ` e o perímetro desce a 30° até a chapa.
  const raft = buildRaftMesh(
    modelPositions,
    pillars.map((p) => ({ x: p.x, y: p.y })),
    {
      topZ: baseTopZ,
      margin: cfg.raftMargin,
      slopeDeg: cfg.raftSlopeDeg ?? 30,
      supportFootRadius: footR,
      plateWidth: plateW ?? undefined,
      plateDepth: plateD ?? undefined,
      cellSize: 1.0,
    }
  );

  const supportCoords: number[] = [...raft.coords];
  const builtPillars: SupportPillarInfo[] = [];

  for (let i = 0; i < pillars.length; i++) {
    const before = supportCoords.length;
    if (appendSupportMesh(supportCoords, pillars[i], cfg)) {
      builtPillars.push(pillars[i]);
    } else {
      supportCoords.length = before;
    }
  }

  const supportTriCount = Math.floor(supportCoords.length / 9);
  const totalTriCount = triCount + supportTriCount;
  const buffer = new ArrayBuffer(84 + totalTriCount * 50);
  const view = new DataView(buffer);

  const headerText = `OdontoPrint Support Engine v2 (${builtPillars.length} suportes, base continua 30 graus)`;
  for (let i = 0; i < Math.min(80, headerText.length); i++) {
    view.setUint8(i, headerText.charCodeAt(i));
  }
  view.setUint32(80, totalTriCount, true);

  let offset = 84;

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
    offset = writeTriangle(
      view,
      offset,
      norm.nx,
      norm.ny,
      norm.nz,
      ax,
      ay,
      az,
      bx,
      by,
      bz,
      cx,
      cy,
      cz
    );
  }

  for (let t = 0; t < supportTriCount; t++) {
    const off = t * 9;
    const ax = supportCoords[off];
    const ay = supportCoords[off + 1];
    const az = supportCoords[off + 2];
    const bx = supportCoords[off + 3];
    const by = supportCoords[off + 4];
    const bz = supportCoords[off + 5];
    const cx = supportCoords[off + 6];
    const cy = supportCoords[off + 7];
    const cz = supportCoords[off + 8];

    const norm = computeNormal(ax, ay, az, bx, by, bz, cx, cy, cz);
    offset = writeTriangle(
      view,
      offset,
      norm.nx,
      norm.ny,
      norm.nz,
      ax,
      ay,
      az,
      bx,
      by,
      bz,
      cx,
      cy,
      cz
    );
  }

  // ---------------------------------------------------------------------------
  // 8. Bounding box e estimativas
  // ---------------------------------------------------------------------------
  let bMinX = Infinity;
  let bMaxX = -Infinity;
  let bMinY = Infinity;
  let bMaxY = -Infinity;
  let bMaxZ = elevatedMaxZ;

  for (let i = 0; i < supportCoords.length; i += 3) {
    const vx = supportCoords[i];
    const vy = supportCoords[i + 1];
    const vz = supportCoords[i + 2];
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

  if (!Number.isFinite(bMinX)) {
    bMinX = minX;
    bMaxX = maxX;
    bMinY = minY;
    bMaxY = maxY;
  }

  let supportVolumeMm3 = 0;
  for (let i = 0; i < builtPillars.length; i++) {
    supportVolumeMm3 += estimateSupportVolumeMm3(builtPillars[i], cfg);
  }
  const estimatedResinMl = Math.max(
    0,
    Math.round(((supportVolumeMm3 + raft.volumeMm3) / 1000) * 100) / 100
  );

  const durationMs = Math.round(performance.now() - t0);

  return {
    stlBuffer: buffer,
    totalTriangles: totalTriCount,
    supportTriangles: supportTriCount,
    pillarCount: builtPillars.length,
    pillars: builtPillars,
    elevationZ,
    baseHeight: baseTopZ,
    base: {
      height: baseTopZ,
      chamfer: raft.chamfer,
      loops: raft.loops,
      topBounds: raft.topBounds,
      bottomBounds: raft.bottomBounds,
      triangles: raft.triangleCount,
      volumeMl: Math.round((raft.volumeMm3 / 1000) * 100) / 100,
    },
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
 * Detector de ilhas suspensas no ar. Mantém a mesma interface usada pela UI.
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
    if (norm.nz < -0.35) {
      const abx = bx - ax;
      const aby = by - ay;
      const abz = bz - az;
      const acx = cx - ax;
      const acy = cy - ay;
      const acz = cz - az;
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
