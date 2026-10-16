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
  rotated: boolean;
  placedW: number;
  placedD: number;
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
    // Halot Sky / Sky 2022 — confira na sua máquina e ajuste se preciso
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
  return { positions, count };
}

export interface PlacementSpec {
  positions: Float32Array;
  /** canto inferior-esquerdo alvo na chapa (mm) */
  x: number;
  y: number;
  /** gira 90° (troca L×P, igual ao mapa) */
  rotated: boolean;
  /** desce o modelo até Z=0 (padrão: sim) */
  dropToBed?: boolean;
}

/** Gira -90° em Z quando rotated (L×P vira P×L). */
function rotXY(x: number, y: number, rotated: boolean): { x: number; y: number } {
  if (!rotated) return { x, y };
  return { x: y, y: -x };
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
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    for (let i = 0; i < p.positions.length; i += 3) {
      const g = rotXY(p.positions[i], p.positions[i + 1], p.rotated);
      if (g.x < minX) minX = g.x;
      if (g.y < minY) minY = g.y;
      if (p.positions[i + 2] < minZ) minZ = p.positions[i + 2];
    }
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
      const a = rotXY(p.positions[i], p.positions[i + 1], p.rotated);
      const b = rotXY(p.positions[i + 3], p.positions[i + 4], p.rotated);
      const c = rotXY(p.positions[i + 6], p.positions[i + 7], p.rotated);
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

/**
 * Encaixa retângulos na chapa (algoritmo de prateleiras: ordena por altura,
 * abre fileiras, gira 90° quando couber melhor). Determinístico.
 *
 * @param gap espaço livre entre modelos (p/ conector e destaque), em mm
 * @param margin borda de segurança da chapa, em mm
 */
export function packPlate(
  models: PackItem[],
  plateW: number,
  plateD: number,
  gap = 2,
  margin = 3
): PackResult {
  const usableW = plateW - margin * 2;
  const usableD = plateD - margin * 2;
  const placed: PlacedItem[] = [];
  const unplaced: PackItem[] = [];

  // Maiores primeiro = menos buraco
  const queue = [...models]
    .filter((m) => m.w > 0 && m.d > 0)
    .sort((a, b) => b.d * b.w - a.d * a.w || b.d - a.d);

  let cursorY = margin;
  let rowH = 0;
  let cursorX = margin;

  const fits = (w: number, d: number, x: number, y: number) =>
    x + w <= margin + usableW + 1e-9 && y + d <= margin + usableD + 1e-9;

  for (const m of queue) {
    // orientações possíveis (normal e girada), maior lado junto à fileira
    const orientations = [
      { w: m.w + gap, d: m.d + gap, rotated: false },
      { w: m.d + gap, d: m.w + gap, rotated: true },
    ].sort((a, b) => b.d - a.d);

    let done = false;
    for (const o of orientations) {
      if (fits(o.w, o.d, cursorX, cursorY)) {
        placed.push({
          ...m,
          x: round1(cursorX),
          y: round1(cursorY),
          rotated: o.rotated,
          placedW: round1(o.w - gap),
          placedD: round1(o.d - gap),
        });
        cursorX += o.w;
        rowH = Math.max(rowH, o.d);
        done = true;
        break;
      }
    }
    if (done) continue;

    // Nova fileira
    const newY = cursorY + rowH;
    for (const o of orientations) {
      if (fits(o.w, o.d, margin, newY)) {
        cursorY = newY;
        cursorX = margin + o.w;
        rowH = o.d;
        placed.push({
          ...m,
          x: round1(margin),
          y: round1(cursorY),
          rotated: o.rotated,
          placedW: round1(o.w - gap),
          placedD: round1(o.d - gap),
        });
        done = true;
        break;
      }
    }
    if (!done) unplaced.push(m);
  }

  const usedArea = placed.reduce((s, p) => s + p.placedW * p.placedD, 0);
  const plateArea = plateW * plateD;
  return {
    placed,
    unplaced,
    utilization: plateArea > 0 ? Math.min(1, usedArea / plateArea) : 0,
  };
}

/** mm → texto "12,5 mm" */
export function fmtMm(n: number): string {
  return `${String(Math.round(n * 10) / 10).replace(".", ",")} mm`;
}
