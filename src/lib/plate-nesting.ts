// Montagem automática da mesa: lê as dimensões reais dos STL e encaixa
// os modelos na chapa da impressora (empacotamento 2D por prateleiras,
// com giro de 90°). O conteúdo do arquivo nunca sai do navegador.

export interface ModelSize {
  /** largura X em mm */
  x: number;
  /** profundidade Y em mm */
  y: number;
  /** altura Z em mm */
  z: number;
  triangles: number;
}

export interface PlateDef {
  /** largura X da chapa em mm */
  w: number;
  /** profundidade Y da chapa em mm */
  d: number;
  /** altura Z útil em mm */
  h: number;
  label: string;
}

export interface PackItem {
  id: string;
  label: string;
  w: number;
  d: number;
}

export interface PlacedItem extends PackItem {
  x: number;
  y: number;
  /** 0 | 90 | 30 | -30 | 45 | -45 (horário) */
  angle: number;
  rotated: boolean;
  placedW: number;
  placedD: number;
  /** pixels do modelo girado (mapa exato); ausente no packer por caixas */
  pix?: PlacedPixels;
}

/** Ângulos tentados (0/90/180/270 cardinais exatos + diagonais para entrelaçar arcos opostos). */
export const PACK_ANGLES = [
  0, 180, 90, 270, 45, -45, 135, -135, 30, -30, 150, -150, 60, -60, 120, -120, 15, -15, 75, -75,
];

/** Caixa alinhada aos eixos de um retângulo girado (horário). */
export function rotatedBox(w: number, d: number, angleDeg: number): { w: number; d: number } {
  const a = ((angleDeg % 360) + 360) % 360;
  if (a === 0 || a === 180) return { w, d };
  if (a === 90 || a === 270) return { w: d, d: w };
  const r = (angleDeg * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  return { w: w * c + d * s, d: w * s + d * c };
}

export interface PackResult {
  placed: PlacedItem[];
  unplaced: PackItem[];
  /** 0..1 fração da chapa ocupada pelos modelos */
  utilization: number;
}

/** Medidas oficiais das chapas (X × Y × Z em mm). */
export const PLATE_PRESETS: Array<{ match: RegExp; plate: PlateDef }> = [
  {
    match: /photon.*mono.*4/i,
    plate: { w: 153.4, d: 87, h: 165, label: "Anycubic Photon Mono 4 (153,4 × 87 mm)" },
  },
  {
    // Halot Sky 2022 (tela 6K 9,25"): área expandida 198 × 123 × 200 mm.
    // Aceita "Sky 2022", "sky 22", "sky22", "halot sky v2" etc.
    match: /sky[\s_\-]*2\d|2022.*sky|sky.*2022|halot.*v2/i,
    plate: { w: 198, d: 123, h: 200, label: "Halot Sky 2022 (198 × 123 mm)" },
  },
  {
    // Halot Sky original (antigo): 192 × 120 × 200 mm
    match: /sky/i,
    plate: { w: 192, d: 120, h: 200, label: "Halot Sky (192 × 120 mm)" },
  },
  {
    match: /halot/i,
    plate: { w: 192, d: 120, h: 200, label: "Halot (192 × 120 mm)" },
  },
];

/** Chapa padrão quando a impressora não é reconhecida. */
export const DEFAULT_PLATE: PlateDef = {
  w: 153.4,
  d: 87,
  h: 165,
  label: "Padrão (153,4 × 87 mm) — confira e ajuste",
};

export function detectPlate(brand: string, model: string): PlateDef {
  const hay = `${brand} ${model}`;
  for (const preset of PLATE_PRESETS) {
    if (preset.match.test(hay)) return { ...preset.plate };
  }
  return { ...DEFAULT_PLATE };
}

/** Triângulos brutos (9 floats por triângulo: x,y,z × 3 vértices). */
export interface RawTriangles {
  positions: Float32Array;
  count: number;
}

function extractTriangles(buffer: ArrayBuffer): RawTriangles {
  const bytes = new Uint8Array(buffer);
  const looksBinary = (): boolean => {
    if (bytes.length < 84) return false;
    const view = new DataView(buffer);
    const count = view.getUint32(80, true);
    // Binário válido: tamanho exato = 84 + 50 × triângulos
    if (84 + count * 50 === bytes.length) return true;
    // Arquivo binário que começa com "solid": confia no cabeçalho
    const head = new TextDecoder().decode(bytes.slice(0, 5)).toLowerCase();
    if (head === "solid" && count > 0 && 84 + count * 50 <= bytes.length) return true;
    return false;
  };

  if (looksBinary()) {
    const view = new DataView(buffer);
    const count = view.getUint32(80, true);
    const positions = new Float32Array(count * 9);
    let offset = 84;
    let w = 0;
    for (let t = 0; t < count; t++) {
      if (offset + 50 > bytes.length) break;
      // normal (12 bytes) pulada; 3 vértices × 12 bytes
      for (let v = 0; v < 3; v++) {
        positions[w++] = view.getFloat32(offset + 12 + v * 12, true);
        positions[w++] = view.getFloat32(offset + 16 + v * 12, true);
        positions[w++] = view.getFloat32(offset + 20 + v * 12, true);
      }
      offset += 50;
    }
    return { positions: positions.slice(0, w), count: Math.floor(w / 9) };
  }

  // ASCII: lê linhas "vertex x y z"
  const text = new TextDecoder().decode(bytes);
  const re = /vertex\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)/g;
  const coords: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    coords.push(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
  }
  return { positions: new Float32Array(coords), count: Math.floor(coords.length / 9) };
}

/** Lê dimensões (bounding box em mm) de um STL binário ou ASCII. */
export async function parseStlDimensions(input: File | Blob | ArrayBuffer): Promise<ModelSize> {
  const buffer =
    input instanceof ArrayBuffer ? input : await (input as Blob).arrayBuffer();
  const { positions, count } = extractTriangles(buffer);
  if (count === 0 || positions.length < 9) {
    throw new Error("Não foi possível ler a geometria do STL (arquivo vazio ou inválido).");
  }

  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  if (!Number.isFinite(minX)) {
    throw new Error("Não foi possível ler a geometria do STL (arquivo vazio ou inválido).");
  }
  return {
    x: round1(maxX - minX),
    y: round1(maxY - minY),
    z: round1(maxZ - minZ),
    triangles: count,
  };
}

/** Extrai os triângulos (para montar o STL posicionado). */
export async function parseStlTriangles(input: File | Blob | ArrayBuffer): Promise<RawTriangles> {
  const buffer = input instanceof ArrayBuffer ? input : await (input as Blob).arrayBuffer();
  const { positions, count } = extractTriangles(buffer);
  if (count === 0) {
    throw new Error("Não foi possível ler a geometria do STL (arquivo vazio ou inválido).");
  }
  // Normaliza XY para a origem: o raster e o writer giram no MESMO pivô
  // (canto do bbox), senão o planejado e o gravado divergem e fundem peças.
  let minX = Infinity,
    minY = Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    if (positions[i] < minX) minX = positions[i];
    if (positions[i + 1] < minY) minY = positions[i + 1];
  }
  if (Number.isFinite(minX) && (minX !== 0 || minY !== 0)) {
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] -= minX;
      positions[i + 1] -= minY;
    }
  }
  return { positions, count };
}

export interface OrientResult {
  positions: Float32Array;
  changed: boolean;
  wasFlipped: boolean;
  wasLeveled: boolean;
  angleDeg: number;
}

/**
 * Inverte o modelo 180° no eixo X (preserva anatomia e mão dextrogira sem espelhar).
 * Garante que a base do modelo fique no Z=0 e cantos XY na origem.
 */
export function flipModel180(inputPositions: Float32Array): Float32Array {
  const out = new Float32Array(inputPositions.length);
  let minX = Infinity, minY = Infinity, minZ = Infinity;

  for (let i = 0; i < inputPositions.length; i += 3) {
    out[i] = inputPositions[i];
    out[i + 1] = -inputPositions[i + 1];
    out[i + 2] = -inputPositions[i + 2];
    if (out[i] < minX) minX = out[i];
    if (out[i + 1] < minY) minY = out[i + 1];
    if (out[i + 2] < minZ) minZ = out[i + 2];
  }

  if (Number.isFinite(minX)) {
    for (let i = 0; i < out.length; i += 3) {
      out[i] -= minX;
      out[i + 1] -= minY;
      out[i + 2] -= minZ;
    }
  }

  return out;
}

/**
 * Retorna a malha original 100% intacta, preservando estritamente a orientação
 * e dimensões reais milimétricas geradas no software CAD odontológico.
 * Qualquer inversão (180°) é realizada exclusivamente sob demanda manual do usuário.
 */
export function levelAndOrientDentalModel(inputPositions: Float32Array): OrientResult {
  return {
    positions: inputPositions,
    changed: false,
    wasFlipped: false,
    wasLeveled: false,
    angleDeg: 0,
  };
}

export interface PlacementSpec {
  positions: Float32Array;
  /** canto inferior-esquerdo alvo na chapa (mm) */
  x: number;
  y: number;
  /** giro horário em graus (0 | 90 | 30 | -30 | 45 | -45) */
  angle: number;
  /** desce o modelo até Z=0 (padrão: sim) */
  dropToBed?: boolean;
}

/** Gira em sentido horário (90° exatos preservados). */
export function rotPt(x: number, y: number, angleDeg: number): { x: number; y: number } {
  const a = ((angleDeg % 360) + 360) % 360;
  if (a === 0) return { x, y };
  if (a === 90) return { x: y, y: -x };
  if (a === 180) return { x: -x, y: -y };
  if (a === 270) return { x: -y, y: x };
  const r = (angleDeg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: x * c + y * s, y: -x * s + y * c };
}

function triNormal(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number
): { x: number; y: number; z: number } {
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
  return { x: nx / len, y: ny / len, z: nz / len };
}

/**
 * Gera um STL binário único com as peças posicionadas na chapa,
 * pronto para abrir no Chitubox/Halot Box (só faltam suportes).
 * Rotação de -90° em Z + translação; normais recalculadas.
 */
export function buildPositionedStl(parts: PlacementSpec[]): ArrayBuffer {
  let total = 0;
  const prepared = parts.map((p) => {
    const n = Math.floor(p.positions.length / 9);
    total += n;
    // Caixa do modelo (pivô comum com o raster: canto da caixa).
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity,
      minZ = Infinity;
    for (let i = 0; i < p.positions.length; i += 3) {
      const x = p.positions[i];
      const y = p.positions[i + 1];
      const z = p.positions[i + 2];
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
      if (z < minZ) minZ = z;
    }
    if (!Number.isFinite(x0)) {
      throw new Error("Geometria inválida em uma das peças (coordenadas fora do padrão).");
    }
    // Cantos da caixa girados: mesma convenção do raster (nunca a geometria,
    // que pode não tocar as bordas em formas ocas como o U).
    const corners = [
      rotPt(x0, y0, p.angle),
      rotPt(x1, y0, p.angle),
      rotPt(x0, y1, p.angle),
      rotPt(x1, y1, p.angle),
    ];
    const minX = Math.min(corners[0].x, corners[1].x, corners[2].x, corners[3].x);
    const minY = Math.min(corners[0].y, corners[1].y, corners[2].y, corners[3].y);
    return { n, minX, minY, drop: p.dropToBed === false ? 0 : minZ };
  });

  const buffer = new ArrayBuffer(84 + total * 50);
  const view = new DataView(buffer);
  const head = `OdontoPrint mesa posicionada (${parts.length} pecas)`;
  for (let i = 0; i < Math.min(80, head.length); i++) view.setUint8(i, head.charCodeAt(i));
  view.setUint32(80, total, true);

  let offset = 84;
  let pi = 0;
  for (const p of parts) {
    const prep = prepared[pi++];
    const tx = p.x - prep.minX;
    const ty = p.y - prep.minY;
    for (let i = 0; i < p.positions.length; i += 9) {
      const a = rotPt(p.positions[i], p.positions[i + 1], p.angle);
      const b = rotPt(p.positions[i + 3], p.positions[i + 4], p.angle);
      const c = rotPt(p.positions[i + 6], p.positions[i + 7], p.angle);
      const az = p.positions[i + 2] - prep.drop;
      const bz = p.positions[i + 5] - prep.drop;
      const cz = p.positions[i + 8] - prep.drop;
      const n = triNormal(a.x + tx, a.y + ty, az, b.x + tx, b.y + ty, bz, c.x + tx, c.y + ty, cz);
      view.setFloat32(offset, n.x, true);
      view.setFloat32(offset + 4, n.y, true);
      view.setFloat32(offset + 8, n.z, true);
      view.setFloat32(offset + 12, a.x + tx, true);
      view.setFloat32(offset + 16, a.y + ty, true);
      view.setFloat32(offset + 20, az, true);
      view.setFloat32(offset + 24, b.x + tx, true);
      view.setFloat32(offset + 28, b.y + ty, true);
      view.setFloat32(offset + 32, bz, true);
      view.setFloat32(offset + 36, c.x + tx, true);
      view.setFloat32(offset + 40, c.y + ty, true);
      view.setFloat32(offset + 44, cz, true);
      view.setUint16(offset + 48, 0, true);
      offset += 50;
    }
  }
  return buffer;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Ordenações tentadas pelos empacotadores (determinísticas). */
const PACK_ORDERINGS: Array<(a: PackItem, b: PackItem) => number> = [
  (a, b) => b.w * b.d - a.w * a.d || Math.max(b.w, b.d) - Math.max(a.w, a.d) || (a.id < b.id ? -1 : 1),
  (a, b) => Math.max(b.w, b.d) - Math.max(a.w, a.d) || b.w * b.d - a.w * a.d || (a.id < b.id ? -1 : 1),
  (a, b) => b.w - a.w || b.d - a.d || (a.id < b.id ? -1 : 1),
  (a, b) => b.d - a.d || b.w - a.w || (a.id < b.id ? -1 : 1),
  (a, b) => 2 * (b.w + b.d) - 2 * (a.w + a.d) || (a.id < b.id ? -1 : 1),
  (a, b) => Math.min(b.w, b.d) - Math.min(a.w, a.d) || b.w * b.d - a.w * a.d || (a.id < b.id ? -1 : 1),
  (a, b) => a.w * a.d - b.w * b.d || Math.min(a.w, a.d) - Math.min(b.w, b.d) || (a.id < b.id ? -1 : 1),
];

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shufflePack<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  const rnd = mulberry32(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Encaixa retângulos na chapa (MaxRects + melhor encaixe: tenta várias ordens
 * e orientações, fica com a que couber mais modelos). Determinístico.
 *
 * @param gap espaço livre entre modelos (mínimo 1mm anti-fusão), em mm
 * @param margin borda de segurança da chapa, em mm
 */
export function packPlate(
  models: PackItem[],
  plateW: number,
  plateD: number,
  gap = 2,
  margin = 3
): PackResult {
  // Anti-fusão: nunca menos de 1mm entre modelos
  const g = Math.max(1, gap || 0);
  const EPS = 1e-9;
  const usableW = plateW - margin * 2;
  const usableD = plateD - margin * 2;
  const valid = models.filter((m) => m.w > 0 && m.d > 0);
  if (usableW <= 0 || usableD <= 0 || valid.length === 0) {
    return { placed: [], unplaced: [...models], utilization: plateW > 0 && plateD > 0 ? 0 : 0 };
  }

  interface FreeRect {
    x: number;
    y: number;
    w: number;
    h: number;
  }

  type Score = [number, number, number, number];

  // Heurísticas de escolha (testa todas, fica com a melhor):
  // BSSF = menor sobra no lado curto; LOW = base (y+altura) mais baixa.
  const scorings: Array<{
    fn: (f: FreeRect, o: { w: number; d: number }, leftoverH: number, leftoverV: number) => Score;
  }> = [
    {
      fn: (f, _o, leftoverH, leftoverV) => [
        Math.min(leftoverH, leftoverV),
        Math.max(leftoverH, leftoverV),
        f.y,
        f.x,
      ],
    },
    {
      fn: (f, o, leftoverH, leftoverV) => [f.y + o.d, leftoverH * leftoverV, f.y, f.x],
    },
  ];

  const lessThan = (a: Score, b: Score): boolean => {
    for (let i = 0; i < 4; i++) {
      if (a[i] < b[i] - EPS) return true;
      if (a[i] > b[i] + EPS) return false;
    }
    return false;
  };

  let best: PackResult | null = null;

  const consider = (placed: PlacedItem[], unplaced: PackItem[]) => {
    const usedArea = placed.reduce((s, p) => s + p.w * p.d, 0);
    const plateArea = plateW * plateD;
    const candidate: PackResult = {
      placed,
      unplaced,
      utilization: plateArea > 0 ? Math.min(1, usedArea / plateArea) : 0,
    };
    if (
      !best ||
      candidate.placed.length > best.placed.length ||
      (candidate.placed.length === best.placed.length && candidate.utilization > best.utilization)
    ) {
      best = candidate;
    }
  };

  const isPerfect = () => !!best && best.placed.length === valid.length;

  const footprintOptions = (m: PackItem) =>
    PACK_ANGLES.map((angle) => {
      const box = rotatedBox(m.w, m.d, angle);
      return { w: box.w + g, d: box.d + g, angle, rotated: angle !== 0 };
    });

  // ---- Estratégia 1: MaxRects (guilhotina + melhor encaixe) ----
  for (const order of PACK_ORDERINGS) {
    for (const scoring of scorings) {
    const queue = [...valid].sort(order);
    let free: FreeRect[] = [{ x: margin, y: margin, w: usableW, h: usableD }];
    const placed: PlacedItem[] = [];
    const unplaced: PackItem[] = [];

    const prune = () => {
      free = free.filter((f) => f.w > EPS && f.h > EPS);
      for (let i = free.length - 1; i >= 0; i--) {
        for (let j = 0; j < free.length; j++) {
          if (i === j) continue;
          const a = free[i];
          const b = free[j];
          if (a.x >= b.x - EPS && a.y >= b.y - EPS && a.x + a.w <= b.x + b.w + EPS && a.y + a.h <= b.y + b.h + EPS) {
            free.splice(i, 1);
            break;
          }
        }
      }
    };

      for (const m of queue) {
        const options = footprintOptions(m);
        let bestScore: Score | null = null;
        let bestPick: { fx: number; fy: number; fi: number; o: (typeof options)[0] } | null = null;

      for (let fi = 0; fi < free.length; fi++) {
        const f = free[fi];
        for (const o of options) {
          if (o.w > f.w + EPS || o.d > f.h + EPS) continue;
          const score = scoring.fn(f, o, f.w - o.w, f.h - o.d);
          if (!bestScore || lessThan(score, bestScore)) {
            bestScore = score;
            bestPick = { fx: f.x, fy: f.y, fi, o };
          }
        }
      }

      if (!bestPick) {
        unplaced.push(m);
        continue;
      }

      const { fx, fy, fi, o } = bestPick;
      const f = free[fi];
      placed.push({
        ...m,
        x: round1(fx),
        y: round1(fy),
        angle: o.angle,
        rotated: o.rotated,
        // caixa ocupada (modelo + folga); área real do modelo p/ ocupação
        placedW: round1(o.w - g),
        placedD: round1(o.d - g),
      });
      free.splice(fi, 1);
      // Guilhotina: sobra da direita + sobra de baixo
      const right: FreeRect = { x: fx + o.w, y: fy, w: f.w - o.w, h: o.d };
      const bottom: FreeRect = { x: fx, y: fy + o.d, w: f.w, h: f.h - o.d };
      if (right.w > EPS && right.h > EPS) free.push(right);
      if (bottom.w > EPS && bottom.h > EPS) free.push(bottom);
      prune();
    }

      consider(placed, unplaced);
      if (isPerfect()) break;
    }
    if (isPerfect()) break;
  }

  // ---- Estratégia 2: Bottom-Left-Fill multi-tentativa (ordens heurísticas + embaralhadas) ----
  if (!isPerfect()) {
    const mulberry32 = (seed: number) => () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const shuffle = (arr: PackItem[], seed: number): PackItem[] => {
      const a = [...arr];
      const rnd = mulberry32(seed);
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };

    const blfPack = (queue: PackItem[]): { placed: PlacedItem[]; unplaced: PackItem[] } => {
      const placed: PlacedItem[] = [];
      const unplaced: PackItem[] = [];
      const rects: { x: number; y: number; w: number; h: number }[] = [];
      const limX = margin + usableW;
      const limY = margin + usableD;

      for (const m of queue) {
        const options = footprintOptions(m);
        const xs = new Set<number>([margin]);
        const ys = new Set<number>([margin]);
        for (const r of rects) {
          xs.add(r.x + r.w);
          ys.add(r.y + r.h);
        }
        const xsU = Array.from(xs).sort((a, b) => a - b);
        const ysU = Array.from(ys).sort((a, b) => a - b);
        const cands: { x: number; y: number; o: (typeof options)[0]; oi: number }[] = [];

        options.forEach((o, oi) => {
          for (const cy of ysU) {
            if (cy + o.d > limY + EPS) continue;
            for (const cx of xsU) {
              if (cx + o.w > limX + EPS) continue;
              let ok = true;
              for (const r of rects) {
                if (
                  cx < r.x + r.w - EPS &&
                  r.x < cx + o.w - EPS &&
                  cy < r.y + r.h - EPS &&
                  r.y < cy + o.d - EPS
                ) {
                  ok = false;
                  break;
                }
              }
              if (!ok) continue;
              cands.push({ x: cx, y: cy, o, oi });
              break; // mais à esquerda nesta fileira
            }
          }
        });

        if (cands.length === 0) {
          unplaced.push(m);
          continue;
        }
        cands.sort((a, b) => a.y - b.y || a.x - b.x || a.oi - b.oi);
        const c = cands[0];
        placed.push({
          ...m,
          x: round1(c.x),
          y: round1(c.y),
          angle: c.o.angle,
          rotated: c.o.rotated,
          placedW: round1(c.o.w - g),
          placedD: round1(c.o.d - g),
        });
        rects.push({ x: c.x, y: c.y, w: c.o.w, h: c.o.d });
      }
      return { placed, unplaced };
    };

    const blfQueues: PackItem[][] = [
      ...PACK_ORDERINGS.map((o) => [...valid].sort(o)),
      ...[7, 42, 123, 999, 2026].map((s) => shuffle(valid, s)),
    ];
    for (const queue of blfQueues) {
      const { placed, unplaced } = blfPack(queue);
      consider(placed, unplaced);
      if (isPerfect()) break;
    }
  }

  return best || { placed: [], unplaced: [...models], utilization: 0 };
}

/** Por que o modelo ficou de fora: grande demais p/ a chapa ou sem espaço. */
export function unplacedReason(
  item: PackItem,
  plateW: number,
  plateD: number,
  gap = 2,
  margin = 3
): "too-big" | "no-space" {
  const g = Math.max(1, gap || 0);
  const uw = plateW - margin * 2;
  const ud = plateD - margin * 2;
  for (const angle of PACK_ANGLES) {
    const box = rotatedBox(item.w, item.d, angle);
    if (box.w + g <= uw + 1e-9 && box.d + g <= ud + 1e-9) return "no-space";
  }
  return "too-big";
}

/** mm → texto "12,5 mm" */
export function fmtMm(n: number): string {
  return `${String(Math.round(n * 10) / 10).replace(".", ",")} mm`;
}

/* ================================================================== */
/* NESTING POR PIXELS — enxerga o vazio dentro do U e entrelaça peças  */
/* ================================================================== */

export interface ModelGrid {
  /** células em nº de colunas × linhas */
  w: number;
  h: number;
  /** 1 = ocupado */
  cells: Uint8Array;
  /** origem mm do canto da grade (canto do bbox) */
  minX: number;
  minY: number;
  /** tamanho da célula em mm */
  cell: number;
}

/** Rotação horária exata (graus) de um ponto. */
function rotCw(x: number, y: number, angleDeg: number): { x: number; y: number } {
  const a = ((angleDeg % 360) + 360) % 360;
  if (a === 0) return { x, y };
  if (a === 90) return { x: y, y: -x };
  if (a === 180) return { x: -x, y: -y };
  if (a === 270) return { x: -y, y: x };
  const r = (angleDeg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: x * c + y * s, y: -x * s + y * c };
}

/**
 * Rasteriza os triângulos (projeção XY) numa grade de `cell` mm.
 * Célula marcada se o centro estiver dentro de algum triângulo.
 */
export function rasterizeTriangles(positions: Float32Array, cell = 1): ModelGrid {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const n = Math.floor(positions.length / 9);
  for (let t = 0; t < n; t++) {
    for (let v = 0; v < 3; v++) {
      const x = positions[(t * 9 + v * 3)];
      const y = positions[(t * 9 + v * 3) + 1];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX)) {
    return { w: 0, h: 0, cells: new Uint8Array(0), minX: 0, minY: 0, cell };
  }
  const w = Math.max(1, Math.ceil((maxX - minX) / cell));
  const h = Math.max(1, Math.ceil((maxY - minY) / cell));
  const cells = new Uint8Array(w * h);

  const inside = (px: number, py: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number): boolean => {
    const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
    const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
    const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
    const neg = d1 < -1e-9 || d2 < -1e-9 || d3 < -1e-9;
    const pos = d1 > 1e-9 || d2 > 1e-9 || d3 > 1e-9;
    return !(neg && pos);
  };

  for (let t = 0; t < n; t++) {
    const ax = positions[t * 9];
    const ay = positions[t * 9 + 1];
    const bx = positions[t * 9 + 3];
    const by = positions[t * 9 + 4];
    const cx = positions[t * 9 + 6];
    const cy = positions[t * 9 + 7];
    if (![ax, ay, bx, by, cx, cy].every(Number.isFinite)) continue;
    const area2 = Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay));
    if (area2 < 1e-12) continue;
    const x0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - minX) / cell));
    const x1 = Math.min(w - 1, Math.floor((Math.max(ax, bx, cx) - minX) / cell));
    const y0 = Math.max(0, Math.floor((Math.min(ay, by, cy) - minY) / cell));
    const y1 = Math.min(h - 1, Math.floor((Math.max(ay, by, cy) - minY) / cell));
    for (let j = y0; j <= y1; j++) {
      for (let i = x0; i <= x1; i++) {
        if (inside(minX + (i + 0.5) * cell, minY + (j + 0.5) * cell, ax, ay, bx, by, cx, cy)) {
          cells[j * w + i] = 1;
        }
      }
    }
  }
  return { w, h, cells, minX, minY, cell };
}

/** Grade cheia (para medidas manuais / sem geometria): comporta-se como retângulo. */
export function filledGrid(wMm: number, dMm: number, cell = 1): ModelGrid {
  const w = Math.max(1, Math.ceil(wMm / cell));
  const h = Math.max(1, Math.ceil(dMm / cell));
  return { w, h, cells: new Uint8Array(w * h).fill(1), minX: 0, minY: 0, cell };
}

/**
 * Dilata a máscara em `radius` células (Chebyshev) EXPANDINDO a grade:
 * retorna {cells, w, h, pad} onde (0,0) corresponde a (-pad,-pad) da
 * grade original. Sem isso, o anel de segurança fora da caixa do modelo
 * seria cortado e peças coladas passariam na checagem.
 */
export function dilateGrid(
  g: ModelGrid,
  radius: number
): { cells: Uint8Array; w: number; h: number; pad: number } {
  const pad = Math.max(0, radius);
  const w = g.w + pad * 2;
  const h = g.h + pad * 2;
  const out = new Uint8Array(w * h);
  if (radius <= 0) {
    for (let j = 0; j < g.h; j++) {
      for (let i = 0; i < g.w; i++) {
        if (g.cells[j * g.w + i]) out[(j + pad) * w + (i + pad)] = 1;
      }
    }
    return { cells: out, w, h, pad };
  }
  for (let j = 0; j < g.h; j++) {
    for (let i = 0; i < g.w; i++) {
      if (!g.cells[j * g.w + i]) continue;
      for (let dj = -radius; dj <= radius; dj++) {
        for (let di = -radius; di <= radius; di++) {
          out[(j + pad + dj) * w + (i + pad + di)] = 1;
        }
      }
    }
  }
  return { cells: out, w, h, pad };
}

/**
 * Gira a máscara (reamostragem pelo centro da célula destino).
 * Ângulos não-cardinais ganham +1 célula de segurança (conservador).
 */
export function rotateGrid(g: ModelGrid, angleDeg: number): { grid: ModelGrid; safe: boolean } {
  const a = ((angleDeg % 360) + 360) % 360;
  const exact = a === 0 || a === 90 || a === 180 || a === 270;
  // cantos do bbox girados em torno da origem da grade
  const corners = [
    rotCw(0, 0, angleDeg),
    rotCw(g.w * g.cell, 0, angleDeg),
    rotCw(0, g.h * g.cell, angleDeg),
    rotCw(g.w * g.cell, g.h * g.cell, angleDeg),
  ];
  const rMinX = Math.min(...corners.map((c) => c.x));
  const rMinY = Math.min(...corners.map((c) => c.y));
  const rMaxX = Math.max(...corners.map((c) => c.x));
  const rMaxY = Math.max(...corners.map((c) => c.y));
  const w = Math.max(1, Math.ceil((rMaxX - rMinX) / g.cell));
  const h = Math.max(1, Math.ceil((rMaxY - rMinY) / g.cell));
  const cells = new Uint8Array(w * h);
  const inv = (360 - a) % 360;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      // centro da célula destino -> desfaz o giro -> célula da grade original
      const qx = rMinX + (i + 0.5) * g.cell;
      const qy = rMinY + (j + 0.5) * g.cell;
      const p = rotCw(qx, qy, inv);
      const gi = Math.floor((p.x - g.minX) / g.cell + 1e-9);
      const gj = Math.floor((p.y - g.minY) / g.cell + 1e-9);
      if (gi >= 0 && gi < g.w && gj >= 0 && gj < g.h && g.cells[gj * g.w + gi]) {
        cells[j * w + i] = 1;
      }
    }
  }
  return {
    grid: { w, h, cells, minX: 0, minY: 0, cell: g.cell },
    safe: exact,
  };
}

/* ================================================================== */
/* PACK RASTER — nesting por pixels (entrelaça o U com segurança)      */
/* ================================================================== */

export interface RasterPackItem extends PackItem {
  /** grade do modelo (origem no canto do bbox); null = retângulo cheio */
  grid: ModelGrid | null;
}

export interface PlacedPixels {
  w: number;
  h: number;
  cells: number[];
  cell: number;
  angle: number;
}

interface PreparedAngle {
  angle: number;
  gw: number;
  gh: number;
  blocked: Uint8Array;
  setCells: number[];
  /** deslocamento do canto do modelo dentro da grade com folga */
  pad: number;
  boxW: number;
  boxH: number;
  draw: ModelGrid;
}

/**
 * Encaixa usando a geometria real: peças podem ocupar o vazio dentro do U
 * umas das outras. Separação mínima garantida por dilatação (>= gap).
 * Determinístico. Modelos sem grade caem para retângulo cheio.
 */
export function packRaster(
  models: RasterPackItem[],
  plateW: number,
  plateD: number,
  gap = 2,
  margin = 3,
  cell = 1
): PackResult {
  const valid = models.filter((m) => m.w > 0 && m.d > 0);
  const pw = Math.max(1, Math.round((plateW - margin * 2) / cell));
  const ph = Math.max(1, Math.round((plateD - margin * 2) / cell));
  if (plateW - margin * 2 <= 0 || plateD - margin * 2 <= 0 || valid.length === 0) {
    return { placed: [], unplaced: [...models], utilization: 0 };
  }
  const r = Math.max(1, Math.ceil(gap / 2 / cell));
  const step = Math.max(1, Math.round(2 / cell));

  interface Prep {
    item: RasterPackItem;
    areaCells: number;
    angles: PreparedAngle[];
  }
  const preps: Prep[] = valid.map((m) => {
    const base: ModelGrid =
      m.grid && m.grid.w > 0 && m.grid.h > 0 ? m.grid : filledGrid(m.w, m.d, cell);
    let area = 0;
    for (let i = 0; i < base.cells.length; i++) if (base.cells[i]) area++;
    const angles: PreparedAngle[] = PACK_ANGLES.map((angle) => {
      const rot = rotateGrid(base, angle);
      const dil = dilateGrid(rot.grid, r + (rot.safe ? 0 : (gap > 1 ? 0 : 1)));
      const setCells: number[] = [];
      for (let i = 0; i < dil.cells.length; i++) if (dil.cells[i]) setCells.push(i);
      const box = rotatedBox(m.w, m.d, angle);
      return {
        angle,
        gw: dil.w,
        gh: dil.h,
        blocked: dil.cells,
        setCells,
        pad: dil.pad,
        boxW: box.w,
        boxH: box.d,
        draw: rot.grid,
      };
    });
    return { item: m, areaCells: area, angles };
  });

  let best: PackResult | null = null;

  const prepById = new Map<string, Prep>();
  for (const p of preps) prepById.set(p.item.id, p);

  const attempts: Prep[][] = [
    ...PACK_ORDERINGS.map((o) =>
      [...preps].sort((a, b) => o(a.item, b.item))
    ),
    [...preps].sort((a, b) => b.areaCells - a.areaCells || (a.item.id < b.item.id ? -1 : 1)),
    [...preps].sort((a, b) => a.areaCells - b.areaCells || (a.item.id < b.item.id ? -1 : 1)),
    ...[7, 42, 123, 999, 2026, 3141].map((s) => shufflePack(preps, s)),
  ];

  for (const queue of attempts) {
    const plate = new Uint8Array(pw * ph);
    // imagem integral da ocupação: teste O(1) se a caixa está livre
    const sat = new Int32Array((pw + 1) * (ph + 1));
    const rebuildSat = () => {
      for (let y = 0; y <= ph; y++) {
        let row = 0;
        for (let x = 0; x <= pw; x++) {
          const v = x > 0 && y > 0 ? plate[(y - 1) * pw + (x - 1)] : 0;
          row += v;
          sat[y * (pw + 1) + x] = row + (y > 0 ? sat[(y - 1) * (pw + 1) + x] : 0);
        }
      }
    };
    const rectFree = (cx: number, cy: number, w: number, h: number): boolean => {
      const x1 = cx + w;
      const y1 = cy + h;
      return (
        sat[y1 * (pw + 1) + x1] -
          sat[y1 * (pw + 1) + cx] -
          sat[cy * (pw + 1) + x1] +
          sat[cy * (pw + 1) + cx] ===
        0
      );
    };
    const placed: PlacedItem[] = [];
    const unplaced: PackItem[] = [];
    let cellArea = 0;

    for (const p of queue) {
      let pick: { cx: number; cy: number; a: PreparedAngle; ai: number } | null = null;
      for (let ai = 0; ai < p.angles.length; ai++) {
        const a = p.angles[ai];
        for (let cy = 0; cy + a.gh <= ph; cy += step) {
          for (let cx = 0; cx + a.gw <= pw; cx += step) {
            let ok = true;
            if (!rectFree(cx, cy, a.gw, a.gh)) {
              for (let k = 0; k < a.setCells.length; k++) {
                const c = a.setCells[k];
                const gx = cx + (c % a.gw);
                const gy = cy + Math.floor(c / a.gw);
                if (plate[gy * pw + gx]) {
                  ok = false;
                  break;
                }
              }
            }
            if (!ok) continue;
            // Critério de compactação (Bottom-Left / Bounding Box mínimo)
            const score = cy * pw + cx;
            if (
              !pick ||
              score < (pick.cy * pw + pick.cx) ||
              (score === (pick.cy * pw + pick.cx) && ai < pick.ai)
            ) {
              pick = { cx, cy, a, ai };
            }
          }
        }
      }
      if (!pick) {
        unplaced.push(p.item);
        continue;
      }
      for (let k = 0; k < pick.a.setCells.length; k++) {
        const c = pick.a.setCells[k];
        plate[(pick.cy + Math.floor(c / pick.a.gw)) * pw + (pick.cx + (c % pick.a.gw))] = 1;
      }
      rebuildSat();
      const mmX = round1(margin + pick.cx * cell);
      const mmY = round1(margin + pick.cy * cell);
      placed.push({
        ...p.item,
        x: mmX,
        y: mmY,
        angle: pick.a.angle,
        rotated: pick.a.angle !== 0,
        placedW: round1(pick.a.boxW),
        placedD: round1(pick.a.boxH),
        pix: {
          w: pick.a.draw.w,
          h: pick.a.draw.h,
          cells: Array.from(pick.a.draw.cells),
          cell: pick.a.draw.cell,
          angle: pick.a.angle,
        },
      } as PlacedItem);
      cellArea += p.areaCells;
    }
    const plateArea = plateW * plateD;
    const candidate: PackResult = {
      placed,
      unplaced,
      utilization: plateArea > 0 ? Math.min(1, (cellArea * cell * cell) / plateArea) : 0,
    };
    if (
      !best ||
      candidate.placed.length > best.placed.length ||
      (candidate.placed.length === best.placed.length && candidate.utilization > best.utilization)
    ) {
      best = candidate;
    }
    const done: PackResult | null = best;
    if (done && done.placed.length === valid.length) break;
  }

  // Passada fina: tenta encaixar as sobras nos buracos em grade de 1mm
  // (a passada principal usa grade 2mm e pode deixar vãos aproveitáveis).
  if (best && best.unplaced.length > 0) {
    const plate = new Uint8Array(pw * ph);
    const markPlaced = (x: number, y: number, a: PreparedAngle) => {
      for (let k = 0; k < a.setCells.length; k++) {
        const c = a.setCells[k];
        plate[(y + Math.floor(c / a.gw)) * pw + (x + (c % a.gw))] = 1;
      }
      rebuildSat();
    };
    const sat = new Int32Array((pw + 1) * (ph + 1));
    const rebuildSat = () => {
      for (let y = 0; y <= ph; y++) {
        let row = 0;
        for (let x = 0; x <= pw; x++) {
          const v = x > 0 && y > 0 ? plate[(y - 1) * pw + (x - 1)] : 0;
          row += v;
          sat[y * (pw + 1) + x] = row + (y > 0 ? sat[(y - 1) * (pw + 1) + x] : 0);
        }
      }
    };
    const rectFree = (cx: number, cy: number, w: number, h: number): boolean => {
      const x1 = cx + w;
      const y1 = cy + h;
      return (
        sat[y1 * (pw + 1) + x1] -
          sat[y1 * (pw + 1) + cx] -
          sat[cy * (pw + 1) + x1] +
          sat[cy * (pw + 1) + cx] ===
        0
      );
    };
    // reconstroi ocupação a partir do melhor resultado
    for (const p of best.placed) {
      const prep = prepById.get(p.id);
      const entry = prep?.angles.find((a) => a.angle === (p as PlacedItem).angle);
      if (!prep || !entry) continue;
      const cx = Math.round(((p as PlacedItem).x - margin) / cell);
      const cy = Math.round(((p as PlacedItem).y - margin) / cell);
      markPlaced(cx, cy, entry);
    }
    const stillOut: PackItem[] = [];
    const extraPlaced: PlacedItem[] = [];
    let extraArea = 0;
    for (const u of best.unplaced) {
      const prep = prepById.get(u.id);
      if (!prep) {
        stillOut.push(u);
        continue;
      }
      let pick: { cx: number; cy: number; a: PreparedAngle; ai: number } | null = null;
      for (let ai = 0; ai < prep.angles.length; ai++) {
        const a = prep.angles[ai];
        for (let cy = 0; cy + a.gh <= ph; cy += 1) {
          for (let cx = 0; cx + a.gw <= pw; cx += 1) {
            let ok = true;
            if (!rectFree(cx, cy, a.gw, a.gh)) {
              for (let k = 0; k < a.setCells.length; k++) {
                const c = a.setCells[k];
                if (plate[(cy + Math.floor(c / a.gw)) * pw + (cx + (c % a.gw))]) {
                  ok = false;
                  break;
                }
              }
            }
            if (!ok) continue;
            if (!pick || cy < pick.cy || (cy === pick.cy && (cx < pick.cx || (cx === pick.cx && ai < pick.ai)))) {
              pick = { cx, cy, a, ai };
            }
          }
        }
      }
      if (!pick) {
        stillOut.push(u);
        continue;
      }
      markPlaced(pick.cx, pick.cy, pick.a);
      extraPlaced.push({
        ...u,
        x: round1(margin + pick.cx * cell),
        y: round1(margin + pick.cy * cell),
        angle: pick.a.angle,
        rotated: pick.a.angle !== 0,
        placedW: round1(pick.a.boxW),
        placedD: round1(pick.a.boxH),
        pix: {
          w: pick.a.draw.w,
          h: pick.a.draw.h,
          cells: Array.from(pick.a.draw.cells),
          cell: pick.a.draw.cell,
          angle: pick.a.angle,
        },
      } as PlacedItem);
      extraArea += prep.areaCells;
    }
    if (extraPlaced.length > 0) {
      const placed = [...best.placed, ...extraPlaced];
      const plateArea = plateW * plateD;
      const prevArea = best.utilization * plateArea;
      best = {
        placed,
        unplaced: stillOut,
        utilization: plateArea > 0 ? Math.min(1, (prevArea + extraArea * cell * cell) / plateArea) : 0,
      };
    }

    // Arruína e recria: remove peças e tenta recolocar tudo
    // (sobras primeiro) — repete até não melhorar mais (máx 8 rodadas).
    // É o "organizar até caber o máximo": só aceita se couber MAIS peças.
    for (let round = 0; round < 8; round++) {
      if (!best || best.unplaced.length === 0 || best.placed.length < 3) break;
      const bySize = [...best.placed].sort(
        (a, b) => b.placedW * b.placedD - a.placedW * a.placedD
      );
      const victims = [
        bySize[round % bySize.length],
        bySize[(round + 1) % bySize.length],
      ];
      const victimIds = new Set(victims.map((v) => v.id));
      plate.fill(0);
      rebuildSat();
      for (const p of best.placed) {
        if (victimIds.has(p.id)) continue;
        const prep = prepById.get(p.id);
        const entry = prep?.angles.find((a) => a.angle === (p as PlacedItem).angle);
        if (!prep || !entry) continue;
        const cx = Math.round(((p as PlacedItem).x - margin) / cell);
        const cy = Math.round(((p as PlacedItem).y - margin) / cell);
        markPlaced(cx, cy, entry);
      }
      const retryQueue: { item: PackItem; prep: Prep }[] = [];
      for (const u of best.unplaced) {
        const prep = prepById.get(u.id);
        if (prep) retryQueue.push({ item: u, prep });
      }
      for (const v of victims) {
        const prep = prepById.get(v.id);
        if (prep) retryQueue.push({ item: prep.item, prep });
      }
      const rePlaced: PlacedItem[] = [];
      const reLeft: PackItem[] = [];
      let reArea = 0;
      for (const { item, prep } of retryQueue) {
        let pick: { cx: number; cy: number; a: PreparedAngle; ai: number } | null = null;
        for (let ai = 0; ai < prep.angles.length; ai++) {
          const a = prep.angles[ai];
          for (let cy = 0; cy + a.gh <= ph; cy += 1) {
            for (let cx = 0; cx + a.gw <= pw; cx += 1) {
            let ok = true;
            if (!rectFree(cx, cy, a.gw, a.gh)) {
              for (let k = 0; k < a.setCells.length; k++) {
                const c = a.setCells[k];
                if (plate[(cy + Math.floor(c / a.gw)) * pw + (cx + (c % a.gw))]) {
                  ok = false;
                  break;
                }
              }
            }
            if (!ok) continue;
            if (!pick || cy < pick.cy || (cy === pick.cy && (cx < pick.cx || (cx === pick.cx && ai < pick.ai)))) {
              pick = { cx, cy, a, ai };
            }
            }
          }
        }
        if (!pick) {
          reLeft.push(item);
          continue;
        }
        markPlaced(pick.cx, pick.cy, pick.a);
        rePlaced.push({
          ...item,
          x: round1(margin + pick.cx * cell),
          y: round1(margin + pick.cy * cell),
          angle: pick.a.angle,
          rotated: pick.a.angle !== 0,
          placedW: round1(pick.a.boxW),
          placedD: round1(pick.a.boxH),
          pix: {
            w: pick.a.draw.w,
            h: pick.a.draw.h,
            cells: Array.from(pick.a.draw.cells),
            cell: pick.a.draw.cell,
            angle: pick.a.angle,
          },
        } as PlacedItem);
        reArea += prep.areaCells;
      }
      const keptIds = new Set(best.placed.map((p) => p.id).filter((id) => !victimIds.has(id)));
      const kept: PlacedItem[] = best.placed.filter((p) => keptIds.has(p.id));
      const totalPlaced = kept.length + rePlaced.length;
      if (totalPlaced > best.placed.length) {
        const plateArea = plateW * plateD;
        best = {
          placed: [...kept, ...rePlaced],
          unplaced: reLeft,
          utilization:
            plateArea > 0
              ? Math.min(
                  1,
                  (kept.reduce((s, p) => {
                    const pr = prepById.get(p.id);
                    return s + (pr ? pr.areaCells : 0);
                  }, 0) +
                    reArea) *
                    cell *
                    cell / plateArea
                )
              : 0,
        };
      }
    }
  }

  return best || { placed: [], unplaced: [...models], utilization: 0 };
}
