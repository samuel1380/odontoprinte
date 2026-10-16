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

/** Lê dimensões (bounding box em mm) de um STL binário ou ASCII. */
export async function parseStlDimensions(input: File | Blob | ArrayBuffer): Promise<ModelSize> {
  const buffer =
    input instanceof ArrayBuffer ? input : await (input as Blob).arrayBuffer();
  const bytes = new Uint8Array(buffer);

  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  let triangles = 0;

  const touch = (x: number, y: number, z: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  };

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
    triangles = view.getUint32(80, true);
    let offset = 84;
    for (let t = 0; t < triangles; t++) {
      if (offset + 50 > bytes.length) break;
      // normal (12 bytes) pulado; 3 vértices × 12 bytes
      for (let v = 0; v < 3; v++) {
        const x = view.getFloat32(offset + 12 + v * 12, true);
        const y = view.getFloat32(offset + 16 + v * 12, true);
        const z = view.getFloat32(offset + 20 + v * 12, true);
        touch(x, y, z);
      }
      offset += 50;
    }
  } else {
    // ASCII: lê linhas "vertex x y z"
    const text = new TextDecoder().decode(bytes);
    const re = /vertex\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      touch(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
    }
    const facets = (text.match(/^\s*facet\s+normal/gm) || []).length;
    triangles = facets;
  }

  if (!Number.isFinite(minX) || triangles === 0) {
    throw new Error("Não foi possível ler a geometria do STL (arquivo vazio ou inválido).");
  }
  return {
    x: round1(maxX - minX),
    y: round1(maxY - minY),
    z: round1(maxZ - minZ),
    triangles,
  };
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
