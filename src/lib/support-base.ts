/**
 * OdontoPrint — Base contínua (raft) do motor de suportes v2.
 *
 * A base é construída a partir da projeção XY do modelo e dos pés dos
 * suportes, com margem configurável. O topo fica em `topZ`; o perímetro
 * desce em rampa até a chapa (Z=0), formando a rampa de espátula. A rampa é
 * limitada pela chapa para o conjunto nunca sair da área de impressão.
 */

import { pointInTriangle2D } from "./support-geometry";

export interface BasePoint2D {
  x: number;
  y: number;
}

export interface RaftLoop {
  /** Contorno do topo da base (Z = topZ). */
  top: BasePoint2D[];
  /** Contorno correspondente no fundo (Z = 0), deslocado pela rampa. */
  bottom: BasePoint2D[];
}

export interface RaftBounds2D {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface RaftMeshResult {
  coords: number[];
  loops: RaftLoop[];
  topBounds: RaftBounds2D | null;
  bottomBounds: RaftBounds2D | null;
  triangleCount: number;
  volumeMm3: number;
  topZ: number;
  chamfer: number;
}

export interface RaftMeshOptions {
  topZ: number;
  margin: number;
  slopeDeg: number;
  supportFootRadius: number;
  plateWidth?: number;
  plateDepth?: number;
  cellSize?: number;
}

interface CellEdge {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  key: string;
  offset: number;
  nx: number;
  ny: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function insidePlate(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  plateW: number | null,
  plateD: number | null
): boolean {
  if (plateW !== null && (x0 < -1e-6 || x1 > plateW + 1e-6)) return false;
  if (plateD !== null && (y0 < -1e-6 || y1 > plateD + 1e-6)) return false;
  return true;
}

function vertexKey(i: number, j: number): string {
  return `${i}_${j}`;
}

export function buildRaftMesh(
  modelPositions: Float32Array,
  supports: Array<{ x: number; y: number }>,
  options: RaftMeshOptions
): RaftMeshResult {
  const cell = Math.max(0.4, options.cellSize ?? 1.0);
  const topZ = Math.max(0.3, options.topZ);
  const slopeDeg = clamp(options.slopeDeg ?? 30, 10, 80);
  const chamfer = topZ / Math.tan((slopeDeg * Math.PI) / 180);
  const margin = Math.max(0, options.margin);
  const footR = Math.max(0.2, options.supportFootRadius);
  const plateW = options.plateWidth && options.plateWidth > 0 ? options.plateWidth : null;
  const plateD = options.plateDepth && options.plateDepth > 0 ? options.plateDepth : null;

  if (modelPositions.length < 9) {
    return {
      coords: [],
      loops: [],
      topBounds: null,
      bottomBounds: null,
      triangleCount: 0,
      volumeMm3: 0,
      topZ,
      chamfer,
    };
  }

  let modelMinX = Infinity;
  let modelMaxX = -Infinity;
  let modelMinY = Infinity;
  let modelMaxY = -Infinity;
  for (let i = 0; i < modelPositions.length; i += 3) {
    const x = modelPositions[i];
    const y = modelPositions[i + 1];
    if (x < modelMinX) modelMinX = x;
    if (x > modelMaxX) modelMaxX = x;
    if (y < modelMinY) modelMinY = y;
    if (y > modelMaxY) modelMaxY = y;
  }

  let footprintMinX = modelMinX;
  let footprintMaxX = modelMaxX;
  let footprintMinY = modelMinY;
  let footprintMaxY = modelMaxY;
  for (const p of supports) {
    footprintMinX = Math.min(footprintMinX, p.x - footR);
    footprintMaxX = Math.max(footprintMaxX, p.x + footR);
    footprintMinY = Math.min(footprintMinY, p.y - footR);
    footprintMaxY = Math.max(footprintMaxY, p.y + footR);
  }

  // A margem já inclui o raio do pé: assim o contorno da base é liso e cobre
  // os pés dos suportes sem criar degraus individuais em volta de cada um.
  const dilateCells = Math.max(1, Math.ceil((margin + footR) / cell));
  const gridPad = (dilateCells + 2) * cell;
  let startX = footprintMinX - gridPad;
  let startY = footprintMinY - gridPad;
  let endX = footprintMaxX + gridPad;
  let endY = footprintMaxY + gridPad;

  if (plateW !== null) {
    startX = Math.max(0, startX);
    endX = Math.min(plateW, endX);
  }
  if (plateD !== null) {
    startY = Math.max(0, startY);
    endY = Math.min(plateD, endY);
  }

  if (!(endX > startX) || !(endY > startY)) {
    return {
      coords: [],
      loops: [],
      topBounds: null,
      bottomBounds: null,
      triangleCount: 0,
      volumeMm3: 0,
      topZ,
      chamfer,
    };
  }

  const cols = Math.max(1, Math.ceil((endX - startX) / cell));
  const rows = Math.max(1, Math.ceil((endY - startY) / cell));
  const occupied = new Uint8Array(cols * rows);

  const cellInsidePlate = (ri: number, rj: number): boolean => {
    const x0 = startX + ri * cell;
    const y0 = startY + rj * cell;
    return insidePlate(x0, y0, x0 + cell, y0 + cell, plateW, plateD);
  };

  // Projeção do modelo: mesma ideia da balsa antiga, mas sem depender do
  // winding das normais.
  const triCount = Math.floor(modelPositions.length / 9);
  for (let t = 0; t < triCount; t++) {
    const off = t * 9;
    const ax = modelPositions[off];
    const ay = modelPositions[off + 1];
    const bx = modelPositions[off + 3];
    const by = modelPositions[off + 4];
    const cx = modelPositions[off + 6];
    const cy = modelPositions[off + 7];

    const area2 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(area2) < 1e-9) continue;

    const tMinX = Math.min(ax, bx, cx);
    const tMaxX = Math.max(ax, bx, cx);
    const tMinY = Math.min(ay, by, cy);
    const tMaxY = Math.max(ay, by, cy);

    const ri0 = Math.max(0, Math.floor((tMinX - startX) / cell));
    const ri1 = Math.min(cols - 1, Math.floor((tMaxX - startX) / cell));
    const rj0 = Math.max(0, Math.floor((tMinY - startY) / cell));
    const rj1 = Math.min(rows - 1, Math.floor((tMaxY - startY) / cell));

    for (let rj = rj0; rj <= rj1; rj++) {
      for (let ri = ri0; ri <= ri1; ri++) {
        if (!cellInsidePlate(ri, rj)) continue;
        const px = startX + (ri + 0.5) * cell;
        const py = startY + (rj + 0.5) * cell;
        if (pointInTriangle2D(px, py, ax, ay, bx, by, cx, cy)) {
          occupied[rj * cols + ri] = 1;
        }
      }
    }
  }

  // Dilatação de margem. Usa distância de Chebyshev (como a balsa antiga):
  // o contorno fica ligeiramente retangular, mas a base fica contínua e
  // sempre cobre o modelo e os pés.
  const dilated = new Uint8Array(cols * rows);
  for (let rj = 0; rj < rows; rj++) {
    for (let ri = 0; ri < cols; ri++) {
      if (!occupied[rj * cols + ri]) continue;
      for (let dj = -dilateCells; dj <= dilateCells; dj++) {
        for (let di = -dilateCells; di <= dilateCells; di++) {
          const nri = ri + di;
          const nrj = rj + dj;
          if (nri < 0 || nri >= cols || nrj < 0 || nrj >= rows) continue;
          if (!cellInsidePlate(nri, nrj)) continue;
          dilated[nrj * cols + nri] = 1;
        }
      }
    }
  }

  // Fallback: se algum pé cair fora da projeção já dilatada (por exemplo em
  // uma cavidade ou com margem 0), completa só a área necessária. Com a
  // margem padrão isso não altera o contorno, evitando degraus por suporte.
  const pointCovered = (px: number, py: number): boolean => {
    const ri = Math.floor((px - startX) / cell);
    const rj = Math.floor((py - startY) / cell);
    if (ri < 0 || ri >= cols || rj < 0 || rj >= rows) return false;
    return dilated[rj * cols + ri] === 1;
  };
  const supportMarkCells = Math.max(1, Math.ceil(footR / cell));
  const diag = footR / Math.SQRT2;
  for (const p of supports) {
    const probes = [
      [p.x, p.y],
      [p.x + footR, p.y],
      [p.x - footR, p.y],
      [p.x, p.y + footR],
      [p.x, p.y - footR],
      [p.x + diag, p.y + diag],
      [p.x - diag, p.y + diag],
      [p.x + diag, p.y - diag],
      [p.x - diag, p.y - diag],
    ];
    if (probes.every(([px, py]) => pointCovered(px, py))) continue;

    const ci = Math.floor((p.x - startX) / cell);
    const cj = Math.floor((p.y - startY) / cell);
    for (let dj = -supportMarkCells; dj <= supportMarkCells; dj++) {
      for (let di = -supportMarkCells; di <= supportMarkCells; di++) {
        const ri = ci + di;
        const rj = cj + dj;
        if (ri < 0 || ri >= cols || rj < 0 || rj >= rows) continue;
        if (!cellInsidePlate(ri, rj)) continue;
        dilated[rj * cols + ri] = 1;
      }
    }
  }

  // Remove "pinças" diagonais, que deixariam o contorno com grau 4 e
  // produziriam arestas não-manifold no encontro dos chanfros.
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (let rj = 0; rj < rows - 1; rj++) {
      for (let ri = 0; ri < cols - 1; ri++) {
        const a = rj * cols + ri;
        const b = rj * cols + ri + 1;
        const c = (rj + 1) * cols + ri;
        const d = (rj + 1) * cols + ri + 1;
        const diag1 = dilated[a] && dilated[d] && !dilated[b] && !dilated[c];
        const diag2 = dilated[b] && dilated[c] && !dilated[a] && !dilated[d];
        if (!diag1 && !diag2) continue;
        if (!dilated[a] && cellInsidePlate(ri, rj)) {
          dilated[a] = 1;
          changed = true;
        }
        if (!dilated[b] && cellInsidePlate(ri + 1, rj)) {
          dilated[b] = 1;
          changed = true;
        }
        if (!dilated[c] && cellInsidePlate(ri, rj + 1)) {
          dilated[c] = 1;
          changed = true;
        }
        if (!dilated[d] && cellInsidePlate(ri + 1, rj + 1)) {
          dilated[d] = 1;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  let anyOccupied = false;
  for (let i = 0; i < dilated.length; i++) {
    if (dilated[i]) {
      anyOccupied = true;
      break;
    }
  }

  if (!anyOccupied) {
    const ri0 = clamp(Math.floor((modelMinX - startX) / cell), 0, cols - 1);
    const ri1 = clamp(Math.floor((modelMaxX - startX) / cell), 0, cols - 1);
    const rj0 = clamp(Math.floor((modelMinY - startY) / cell), 0, rows - 1);
    const rj1 = clamp(Math.floor((modelMaxY - startY) / cell), 0, rows - 1);
    for (let rj = rj0; rj <= rj1; rj++) {
      for (let ri = ri0; ri <= ri1; ri++) {
        if (cellInsidePlate(ri, rj)) dilated[rj * cols + ri] = 1;
      }
    }
  }

  const isOccupied = (ri: number, rj: number): boolean => {
    if (ri < 0 || ri >= cols || rj < 0 || rj >= rows) return false;
    return dilated[rj * cols + ri] === 1;
  };

  // Extrai as arestas de contorno orientadas (sólido à esquerda).
  const edges: CellEdge[] = [];
  const outgoing = new Map<string, CellEdge[]>();

  const pushEdge = (ax: number, ay: number, bx: number, by: number) => {
    const key = `${vertexKey(ax, ay)}>${vertexKey(bx, by)}`;
    const edge: CellEdge = {
      ax,
      ay,
      bx,
      by,
      key,
      offset: 0,
      nx: 0,
      ny: 0,
    };
    edges.push(edge);
    const startKey = vertexKey(ax, ay);
    const list = outgoing.get(startKey);
    if (list) list.push(edge);
    else outgoing.set(startKey, [edge]);
  };

  for (let rj = 0; rj < rows; rj++) {
    for (let ri = 0; ri < cols; ri++) {
      if (!isOccupied(ri, rj)) continue;
      if (!isOccupied(ri, rj - 1)) pushEdge(ri, rj, ri + 1, rj);
      if (!isOccupied(ri + 1, rj)) pushEdge(ri + 1, rj, ri + 1, rj + 1);
      if (!isOccupied(ri, rj + 1)) pushEdge(ri + 1, rj + 1, ri, rj + 1);
      if (!isOccupied(ri - 1, rj)) pushEdge(ri, rj + 1, ri, rj);
    }
  }

  const used = new Set<string>();
  const loopsEdges: CellEdge[][] = [];

  for (const first of edges) {
    if (used.has(first.key)) continue;
    const loop: CellEdge[] = [];
    let current: CellEdge | undefined = first;
    let guard = 0;
    while (current && !used.has(current.key) && guard < edges.length + 4) {
      guard++;
      used.add(current.key);
      loop.push(current);
      const endKey = vertexKey(current.bx, current.by);
      const candidates = outgoing.get(endKey);
      if (!candidates || candidates.length === 0) break;

      let next: CellEdge | undefined;
      const unused = candidates.filter((e) => !used.has(e.key));
      if (unused.length === 1) {
        next = unused[0];
      } else if (unused.length > 1) {
        // Escolhe a curva mais fechada (menor ângulo à esquerda) para manter
        // o sólido à esquerda em contornos com auto-contato residual.
        const inDx = current.bx - current.ax;
        const inDy = current.by - current.ay;
        let bestAngle = -Infinity;
        for (const candidate of unused) {
          const outDx = candidate.bx - candidate.ax;
          const outDy = candidate.by - candidate.ay;
          const cross = inDx * outDy - inDy * outDx;
          const dot = inDx * outDx + inDy * outDy;
          const angle = Math.atan2(cross, dot);
          if (angle > bestAngle) {
            bestAngle = angle;
            next = candidate;
          }
        }
      }

      if (!next) break;
      current = next;
      if (current === first) break;
    }
    if (loop.length > 0) loopsEdges.push(loop);
  }

  let topMinX = Infinity;
  let topMaxX = -Infinity;
  let topMinY = Infinity;
  let topMaxY = -Infinity;
  let bMinX = Infinity;
  let bMaxX = -Infinity;
  let bMinY = Infinity;
  let bMaxY = -Infinity;

  const computeOffset = (edge: CellEdge) => {
    const dx = edge.bx - edge.ax;
    const dy = edge.by - edge.ay;
    const len = Math.hypot(dx, dy) || 1;
    const nx = dy / len;
    const ny = -dx / len;
    edge.nx = nx;
    edge.ny = ny;

    let allowed = Infinity;
    if (plateW !== null) {
      if (nx > 0.5) allowed = Math.min(allowed, plateW - Math.max(edge.ax, edge.bx) * cell - startX);
      if (nx < -0.5) allowed = Math.min(allowed, Math.min(edge.ax, edge.bx) * cell + startX);
    }
    if (plateD !== null) {
      if (ny > 0.5) allowed = Math.min(allowed, plateD - Math.max(edge.ay, edge.by) * cell - startY);
      if (ny < -0.5) allowed = Math.min(allowed, Math.min(edge.ay, edge.by) * cell + startY);
    }
    edge.offset = Math.max(0, Math.min(chamfer, allowed));
  };

  for (const loop of loopsEdges) {
    for (const edge of loop) computeOffset(edge);
  }

  const coords: number[] = [];
  const loops: RaftLoop[] = [];

  const pushTri = (
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    cx: number,
    cy: number,
    cz: number
  ) => {
    const same = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) =>
      Math.abs(x0 - x1) < 1e-9 && Math.abs(y0 - y1) < 1e-9 && Math.abs(z0 - z1) < 1e-9;
    if (same(ax, ay, az, bx, by, bz) || same(bx, by, bz, cx, cy, cz) || same(cx, cy, cz, ax, ay, az)) {
      return;
    }
    coords.push(ax, ay, az, bx, by, bz, cx, cy, cz);
  };

  const pushTopQuad = (x0: number, y0: number, x1: number, y1: number) => {
    coords.push(x0, y0, topZ, x1, y0, topZ, x1, y1, topZ);
    coords.push(x0, y0, topZ, x1, y1, topZ, x0, y1, topZ);
  };
  const pushBottomQuad = (x0: number, y0: number, x1: number, y1: number) => {
    coords.push(x0, y0, 0, x1, y1, 0, x1, y0, 0);
    coords.push(x0, y0, 0, x0, y1, 0, x1, y1, 0);
  };

  for (let rj = 0; rj < rows; rj++) {
    for (let ri = 0; ri < cols; ri++) {
      if (!isOccupied(ri, rj)) continue;
      const x0 = startX + ri * cell;
      const y0 = startY + rj * cell;
      const x1 = x0 + cell;
      const y1 = y0 + cell;
      pushTopQuad(x0, y0, x1, y1);
      pushBottomQuad(x0, y0, x1, y1);
    }
  }

  const clampBottomPoint = (p: BasePoint2D): BasePoint2D => {
    if (plateW !== null) p.x = clamp(p.x, 0, plateW);
    if (plateD !== null) p.y = clamp(p.y, 0, plateD);
    return p;
  };

  for (const loop of loopsEdges) {
    if (loop.length === 0) continue;

    const top: BasePoint2D[] = [];
    const bottom: BasePoint2D[] = [];

    for (let k = 0; k < loop.length; k++) {
      const edge = loop[k];
      const prev = loop[(k - 1 + loop.length) % loop.length];
      const vx = startX + edge.ax * cell;
      const vy = startY + edge.ay * cell;

      const pPrev = {
        x: vx + prev.nx * prev.offset,
        y: vy + prev.ny * prev.offset,
      };
      const pNext = {
        x: vx + edge.nx * edge.offset,
        y: vy + edge.ny * edge.offset,
      };

      let bx = pPrev.x;
      let by = pPrev.y;
      const dPrevX = (prev.bx - prev.ax) * cell;
      const dPrevY = (prev.by - prev.ay) * cell;
      const dNextX = (edge.bx - edge.ax) * cell;
      const dNextY = (edge.by - edge.ay) * cell;
      const det = dPrevX * dNextY - dPrevY * dNextX;

      if (Math.abs(det) > 1e-9) {
        const qx = pNext.x - pPrev.x;
        const qy = pNext.y - pPrev.y;
        const t = (qx * dNextY - qy * dNextX) / det;
        bx = pPrev.x + dPrevX * t;
        by = pPrev.y + dPrevY * t;
      } else {
        bx = (pPrev.x + pNext.x) * 0.5;
        by = (pPrev.y + pNext.y) * 0.5;
      }

      const miterLen = Math.hypot(bx - vx, by - vy);
      const maxMiter = Math.max(chamfer * 4, 1.0);
      if (miterLen > maxMiter) {
        let dirX = prev.nx * prev.offset + edge.nx * edge.offset;
        let dirY = prev.ny * prev.offset + edge.ny * edge.offset;
        const dLen = Math.hypot(dirX, dirY);
        if (dLen < 1e-6) {
          dirX = prev.nx;
          dirY = prev.ny;
        } else {
          dirX /= dLen;
          dirY /= dLen;
        }
        bx = vx + dirX * maxMiter;
        by = vy + dirY * maxMiter;
      }

      top.push({ x: vx, y: vy });
      bottom.push(clampBottomPoint({ x: bx, y: by }));
    }

    // Superfície lateral e anel inferior de cada aresta do contorno.
    for (let k = 0; k < loop.length; k++) {
      const edge = loop[k];
      const nextIndex = (k + 1) % loop.length;
      const ax = startX + edge.ax * cell;
      const ay = startY + edge.ay * cell;
      const bx = startX + edge.bx * cell;
      const by = startY + edge.by * cell;
      const ax0 = ax;
      const ay0 = ay;
      const bx0 = bx;
      const by0 = by;
      const aBottom = bottom[k];
      const bBottom = bottom[nextIndex];

      // Rampa (parede inclinada) do topo até o fundo deslocado. Em quinas
      // contra a chapa dois vértices podem convergir para o mesmo ponto:
      // nesse caso a rampa vira um único triângulo (o pushTri descarta a
      // face degenerada).
      pushTri(ax, ay, topZ, aBottom.x, aBottom.y, 0, bBottom.x, bBottom.y, 0);
      pushTri(ax, ay, topZ, bBottom.x, bBottom.y, 0, bx, by, topZ);

      // Fundo entre a aresta original (Z=0) e a aresta deslocada. Também
      // pode degenerar quando o chanfro encontra a borda da chapa.
      pushTri(ax0, ay0, 0, bx0, by0, 0, bBottom.x, bBottom.y, 0);
      pushTri(ax0, ay0, 0, bBottom.x, bBottom.y, 0, aBottom.x, aBottom.y, 0);
    }

    loops.push({ top, bottom });
  }

  for (const loop of loops) {
    for (const p of loop.top) {
      if (p.x < topMinX) topMinX = p.x;
      if (p.x > topMaxX) topMaxX = p.x;
      if (p.y < topMinY) topMinY = p.y;
      if (p.y > topMaxY) topMaxY = p.y;
    }
    for (const p of loop.bottom) {
      if (p.x < bMinX) bMinX = p.x;
      if (p.x > bMaxX) bMaxX = p.x;
      if (p.y < bMinY) bMinY = p.y;
      if (p.y > bMaxY) bMaxY = p.y;
    }
  }

  let volumeMm3 = 0;
  for (let i = 0; i < coords.length; i += 9) {
    const ax = coords[i];
    const ay = coords[i + 1];
    const az = coords[i + 2];
    const bx = coords[i + 3];
    const by = coords[i + 4];
    const bz = coords[i + 5];
    const cx = coords[i + 6];
    const cy = coords[i + 7];
    const cz = coords[i + 8];
    volumeMm3 +=
      (ax * (by * cz - bz * cy) +
        ay * (bz * cx - bx * cz) +
        az * (bx * cy - by * cx)) /
      6;
  }
  volumeMm3 = Math.abs(volumeMm3);

  return {
    coords,
    loops,
    topBounds: loops.length > 0
      ? { minX: topMinX, maxX: topMaxX, minY: topMinY, maxY: topMaxY }
      : null,
    bottomBounds: loops.length > 0
      ? { minX: bMinX, maxX: bMaxX, minY: bMinY, maxY: bMaxY }
      : null,
    triangleCount: Math.floor(coords.length / 9),
    volumeMm3,
    topZ,
    chamfer,
  };
}
