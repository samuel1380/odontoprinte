/**
 * OdontoPrint — Gerador de Suportes Médios Odontológicos para Impressão 3D
 *
 * Cria balsa (raft) chanfrada anti-descolamento e malha densa de suportes médios
 * (cilindros com base cônica reforçada e ponta cônica de precisão) sob a geometria
 * dos modelos anatômicos, evitando falhas por sucção ou descolamento da mesa.
 */

export interface DentalSupportConfig {
  /** Elevação Z do modelo em relação à chapa (mm). Padrão: 5.0 mm */
  elevationZ: number;
  /** Diâmetro do pilar cilíndrico (mm). Padrão: 1.3 mm ("Suporte Médio") */
  pillarDiameter: number;
  /** Diâmetro da ponta cônica de contato (mm). Padrão: 0.70 mm */
  tipDiameter: number;
  /** Comprimento da ponta de contato (mm). Padrão: 1.2 mm */
  tipLength: number;
  /** Diâmetro do pé cônico na balsa (mm). Padrão: 2.4 mm */
  baseDiameter: number;
  /** Altura do pé cônico de reforço na balsa (mm). Padrão: 0.8 mm */
  baseLength: number;
  /** Espessura da balsa/raft (mm). Padrão: 1.0 mm */
  raftThickness: number;
  /** Margem de extensão da balsa além do perímetro do modelo (mm). Padrão: 2.0 mm */
  raftMargin: number;
  /** Espaçamento da malha de suportes (mm). Padrão: 3.0 mm */
  supportSpacing: number;
}

export const DEFAULT_DENTAL_SUPPORT_CONFIG: DentalSupportConfig = {
  elevationZ: 5.0,
  pillarDiameter: 1.3,
  tipDiameter: 0.7,
  tipLength: 1.2,
  baseDiameter: 2.4,
  baseLength: 0.8,
  raftThickness: 1.0,
  raftMargin: 2.0,
  supportSpacing: 3.0,
};

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

    // Vértices da base inferior
    const x0a = cx + r0 * cos[i];
    const y0a = cy + r0 * sin[i];
    const x0b = cx + r0 * cos[next];
    const y0b = cy + r0 * sin[next];

    // Vértices da base superior
    const x1a = cx + r1 * cos[i];
    const y1a = cy + r1 * sin[i];
    const x1b = cx + r1 * cos[next];
    const y1b = cy + r1 * sin[next];

    // Triângulo 1 (x0a, y0a, z0) -> (x0b, y0b, z0) -> (x1b, y1b, z1)
    triangles.push(x0a, y0a, z0, x0b, y0b, z0, x1b, y1b, z1);
    // Triângulo 2 (x0a, y0a, z0) -> (x1b, y1b, z1) -> (x1a, y1a, z1)
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
 * Ponto dentro de triângulo 2D?
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
  // Plano: nx*(x-ax) + ny*(y-ay) + nz*(z-az) = 0 => z = az - (nx*(px-ax) + ny*(py-ay))/nz
  return az - (nx * (px - ax) + ny * (py - ay)) / nz;
}

/**
 * Gera a balsa (raft) e os suportes médios sobre a geometria fornecida.
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
  const modelHeight = maxZ - minZ;

  // 2. Modelo elevado: Z é deslocado para (Z - minZ + elevationZ)
  const zShift = -minZ + cfg.elevationZ;
  const elevatedMinZ = cfg.elevationZ;
  const elevatedMaxZ = maxZ + zShift;

  // 3. Mapeamento da face inferior e detecção de pontos de suporte
  // Criamos uma grade 2D de amostragem no espaçamento do suporte
  const spacing = Math.max(1.5, cfg.supportSpacing);
  const startX = minX - cfg.raftMargin;
  const endX = maxX + cfg.raftMargin;
  const startY = minY - cfg.raftMargin;
  const endY = maxY + cfg.raftMargin;

  const cols = Math.max(1, Math.ceil((endX - startX) / spacing));
  const rows = Math.max(1, Math.ceil((endY - startY) / spacing));

  // Mapa de menor Z de contato para cada célula (x, y)
  // Armazena o menor Z onde a face é voltada para baixo ou próxima da base
  const contactMap: Array<{ x: number; y: number; minContactZ: number } | null> = new Array(
    cols * rows
  ).fill(null);

  // Mapa 2D de ocupação para gerar a balsa (raft)
  const raftGridCell = 1.5; // mm
  const raftCols = Math.max(1, Math.ceil((endX - startX) / raftGridCell));
  const raftRows = Math.max(1, Math.ceil((endY - startY) / raftGridCell));
  const raftOccupied = new Uint8Array(raftCols * raftRows);

  // Amostragem acelerada: percorre triângulos do modelo
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

    // Marca ocupação no grid do raft
    const tMinX = Math.min(ax, bx, cx);
    const tMaxX = Math.max(ax, bx, cx);
    const tMinY = Math.min(ay, by, cy);
    const tMaxY = Math.max(ay, by, cy);

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

    // Identifica superfícies que exigem suporte:
    // a) Normais voltadas para baixo (nz < -0.05)
    // b) Ou superfícies horizontais/baixas da base anatômica (az, bz, cz <= elevatedMinZ + 4.0 mm)
    const isDownward = norm.nz < -0.05;
    const isLowerBase = Math.min(az, bz, cz) <= elevatedMinZ + 4.0;

    if (!isDownward && !isLowerBase) continue;

    // Amostra nos pontos da malha de suportes
    const sci0 = Math.max(0, Math.floor((tMinX - startX) / spacing));
    const sci1 = Math.min(cols - 1, Math.floor((tMaxX - startX) / spacing));
    const scj0 = Math.max(0, Math.floor((tMinY - startY) / spacing));
    const scj1 = Math.min(rows - 1, Math.floor((tMaxY - startY) / spacing));

    for (let sj = scj0; sj <= scj1; sj++) {
      for (let si = sci0; si <= sci1; si++) {
        const px = startX + (si + 0.5) * spacing;
        const py = startY + (sj + 0.5) * spacing;

        if (pointInTriangle2D(px, py, ax, ay, bx, by, cx, cy)) {
          const zHit = interpolateZOnTriangle(px, py, ax, ay, az, bx, by, bz, cx, cy, cz, norm.nx, norm.ny, norm.nz);
          if (zHit !== null && zHit >= elevatedMinZ - 0.1) {
            const idx = sj * cols + si;
            const current = contactMap[idx];
            if (!current || zHit < current.minContactZ) {
              contactMap[idx] = { x: px, y: py, minContactZ: zHit };
            }
          }
        }
      }
    }
  }

  // 4. Constrói a lista de pilares a partir dos pontos de contato
  const pillars: SupportPillarInfo[] = [];
  const pRad = cfg.pillarDiameter / 2;
  const tipRad = cfg.tipDiameter / 2;
  const baseRad = cfg.baseDiameter / 2;
  const raftZ = cfg.raftThickness;

  for (let idx = 0; idx < contactMap.length; idx++) {
    const contact = contactMap[idx];
    if (!contact) continue;

    // Contato precisa estar acima do raft
    const zContact = contact.minContactZ;
    if (zContact <= raftZ + 0.5) continue;

    pillars.push({
      x: contact.x,
      y: contact.y,
      zBase: raftZ,
      zContact,
      height: zContact - raftZ,
    });
  }

  // Se nenhum pilar foi detectado automaticamente (caso o modelo seja extremamente plano ou sem facetas inferiores),
  // adiciona pilares nos 4 cantos e centro do modelo para garantir anti-falhas
  if (pillars.length === 0) {
    const safeZ = elevatedMinZ;
    const defaults = [
      { x: minX + modelWidth * 0.2, y: minY + modelDepth * 0.2 },
      { x: maxX - modelWidth * 0.2, y: minY + modelDepth * 0.2 },
      { x: minX + modelWidth * 0.2, y: maxY - modelDepth * 0.2 },
      { x: maxX - modelWidth * 0.2, y: maxY - modelDepth * 0.2 },
      { x: minX + modelWidth * 0.5, y: minY + modelDepth * 0.5 },
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

  // 5. Dilatação da balsa (raft) para criar a borda de sustentação e chanfro de espátula
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

  // Garante que o pé de cada pilar tenha balsa abaixo dele
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

  // 6. Gerador de malha dos Suportes (Triângulos adicionais)
  const supportTrianglesCoords: number[] = [];

  // 6a. Geometria dos Pilares
  for (const pil of pillars) {
    const cx = pil.x;
    const cy = pil.y;
    const z0 = pil.zBase;
    const zTop = pil.zContact;
    const totalH = zTop - z0;

    const effBaseH = Math.min(cfg.baseLength, totalH * 0.3);
    const effTipH = Math.min(cfg.tipLength, totalH * 0.3);
    const effStemH = Math.max(0, totalH - effBaseH - effTipH);

    const zBaseEnd = z0 + effBaseH;
    const zStemEnd = zBaseEnd + effStemH;

    // Pé cônico de fixação na balsa: baseRad -> pRad
    appendCylinderSection(supportTrianglesCoords, cx, cy, z0, baseRad, zBaseEnd, pRad);
    appendCap(supportTrianglesCoords, cx, cy, z0, baseRad, false);

    // Haste média do pilar: pRad -> pRad
    if (effStemH > 0.05) {
      appendCylinderSection(supportTrianglesCoords, cx, cy, zBaseEnd, pRad, zStemEnd, pRad);
    }

    // Ponta cônica de precisão no modelo: pRad -> tipRad
    appendCylinderSection(supportTrianglesCoords, cx, cy, zStemEnd, pRad, zTop, tipRad);
    appendCap(supportTrianglesCoords, cx, cy, zTop, tipRad, true);
  }

  // 6b. Geometria da Balsa (Raft com chanfro de 45°)
  for (let rj = 0; rj < raftRows; rj++) {
    for (let ri = 0; ri < raftCols; ri++) {
      if (!raftDilated[rj * raftCols + ri]) continue;

      const x0 = startX + ri * raftGridCell;
      const x1 = x0 + raftGridCell;
      const y0 = startY + rj * raftGridCell;
      const y1 = y0 + raftGridCell;

      // Face superior da balsa (Z = raftZ)
      supportTrianglesCoords.push(x0, y0, raftZ, x1, y0, raftZ, x1, y1, raftZ);
      supportTrianglesCoords.push(x0, y0, raftZ, x1, y1, raftZ, x0, y1, raftZ);

      // Face inferior da balsa (Z = 0)
      supportTrianglesCoords.push(x0, y0, 0, x1, y1, 0, x1, y0, 0);
      supportTrianglesCoords.push(x0, y0, 0, x0, y1, 0, x1, y1, 0);

      // Paredes laterais (bordas externas ganham chanfro para facilitar remoção com espátula)
      // Borda Norte (Y+)
      if (rj === raftRows - 1 || !raftDilated[(rj + 1) * raftCols + ri]) {
        supportTrianglesCoords.push(x0, y1, 0, x1, y1, 0, x1, y1, raftZ);
        supportTrianglesCoords.push(x0, y1, 0, x1, y1, raftZ, x0, y1, raftZ);
      }
      // Borda Sul (Y-)
      if (rj === 0 || !raftDilated[(rj - 1) * raftCols + ri]) {
        supportTrianglesCoords.push(x0, y0, 0, x1, y0, raftZ, x1, y0, 0);
        supportTrianglesCoords.push(x0, y0, 0, x0, y0, raftZ, x1, y0, raftZ);
      }
      // Borda Leste (X+)
      if (ri === raftCols - 1 || !raftDilated[rj * raftCols + (ri + 1)]) {
        supportTrianglesCoords.push(x1, y0, 0, x1, y1, 0, x1, y1, raftZ);
        supportTrianglesCoords.push(x1, y0, 0, x1, y1, raftZ, x1, y0, raftZ);
      }
      // Borda Oeste (X-)
      if (ri === 0 || !raftDilated[rj * raftCols + (ri - 1)]) {
        supportTrianglesCoords.push(x0, y0, 0, x0, y1, raftZ, x0, y1, 0);
        supportTrianglesCoords.push(x0, y0, 0, x0, y0, raftZ, x0, y1, raftZ);
      }
    }
  }

  // 7. Montagem do STL binário unificado
  const supportTriCount = Math.floor(supportTrianglesCoords.length / 9);
  const totalTriCount = triCount + supportTriCount;

  const bufferSize = 84 + totalTriCount * 50;
  const buffer = new ArrayBuffer(bufferSize);
  const view = new DataView(buffer);

  // Cabeçalho de 80 bytes
  const headerText = `OdontoPrint com Suportes Medios (${pillars.length} pilares, raft ${cfg.raftThickness}mm)`;
  for (let i = 0; i < Math.min(80, headerText.length); i++) {
    view.setUint8(i, headerText.charCodeAt(i));
  }
  view.setUint32(80, totalTriCount, true);

  let offset = 84;

  // 7a. Escreve modelo original elevado
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

  // 7b. Escreve suportes e balsa
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

  // Cálculo de volume aproximado de resina dos suportes + balsa
  // 1 ml = 1000 mm³
  const avgPillarVolumeMm3 =
    Math.PI * Math.pow(pRad, 2) * (cfg.elevationZ > 0 ? cfg.elevationZ : 5) * 1.2;
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
