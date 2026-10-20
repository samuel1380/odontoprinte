import { describe, it, expect } from "vitest";
import {
  parseStlDimensions,
  parseStlTriangles,
  buildPositionedStl,
  packPlate,
  packRaster,
  rasterizeTriangles,
  dilateGrid,
  rotateGrid,
  filledGrid,
  detectPlate,
  unplacedReason,
  fmtMm,
  levelAndOrientDentalModel,
  flipModel180,
} from "../src/lib/plate-nesting";

// STL binário mínimo: 1 triângulo (0,0,0)-(10,0,0)-(0,5,2)
function binaryStl(): ArrayBuffer {
  const buf = new ArrayBuffer(84 + 50);
  const view = new DataView(buf);
  new TextEncoder().encodeInto("BINTEST", new Uint8Array(buf, 0, 7));
  view.setUint32(80, 1, true);
  // normal zerada; vértices em 96/108/120
  view.setFloat32(96, 0, true);
  view.setFloat32(100, 0, true);
  view.setFloat32(104, 0, true);
  view.setFloat32(108, 10, true);
  view.setFloat32(112, 0, true);
  view.setFloat32(116, 0, true);
  view.setFloat32(120, 0, true);
  view.setFloat32(124, 5, true);
  view.setFloat32(128, 2, true);
  return buf;
}

const ASCII_STL = `solid model
facet normal 0 0 1
outer loop
vertex 0 0 0
vertex 20 0 0
vertex 20 10 1
endloop
endfacet
endsolid model`;

describe("parseStlDimensions", () => {
  it("lê bounding box de STL binário", async () => {
    const r = await parseStlDimensions(binaryStl());
    expect(r.triangles).toBe(1);
    expect(r.x).toBe(10);
    expect(r.y).toBe(5);
    expect(r.z).toBe(2);
  });

  it("lê bounding box de STL ASCII", async () => {
    const r = await parseStlDimensions(new TextEncoder().encode(ASCII_STL).buffer as ArrayBuffer);
    expect(r.triangles).toBe(1);
    expect(r.x).toBe(20);
    expect(r.y).toBe(10);
    expect(r.z).toBe(1);
  });

  it("rejeita arquivo inválido", async () => {
    await expect(parseStlDimensions(new ArrayBuffer(10))).rejects.toThrow();
  });
});

describe("packPlate", () => {
  // Expande cada peça pela folga e garante que ninguém se toca
  const assertNoOverlap = (r: { placed: { x: number; y: number; placedW: number; placedD: number }[] }, gap: number) => {
    const g = Math.max(1, gap);
    for (let i = 0; i < r.placed.length; i++) {
      for (let j = i + 1; j < r.placed.length; j++) {
        const a = r.placed[i];
        const b = r.placed[j];
        const overlap =
          a.x < b.x + b.placedW + g - 0.2 &&
          b.x < a.x + a.placedW + g - 0.2 &&
          a.y < b.y + b.placedD + g - 0.2 &&
          b.y < a.y + a.placedD + g - 0.2;
        expect(overlap, `peças ${i} e ${j} se tocam`).toBe(false);
      }
    }
  };

  const assertInside = (
    r: { placed: { x: number; y: number; placedW: number; placedD: number }[] },
    w: number,
    d: number,
    margin: number
  ) => {
    for (const p of r.placed) {
      expect(p.x).toBeGreaterThanOrEqual(margin - 0.2);
      expect(p.y).toBeGreaterThanOrEqual(margin - 0.2);
      expect(p.x + p.placedW).toBeLessThanOrEqual(w - margin + 0.2);
      expect(p.y + p.placedD).toBeLessThanOrEqual(d - margin + 0.2);
    }
  };
  it("encaixa tudo quando cabe e calcula ocupação", () => {
    const r = packPlate(
      [
        { id: "a", label: "A", w: 30, d: 20 },
        { id: "b", label: "B", w: 30, d: 20 },
      ],
      100,
      100,
      2,
      3
    );
    expect(r.unplaced).toEqual([]);
    expect(r.placed).toHaveLength(2);
    expect(r.utilization).toBeGreaterThan(0);
    expect(r.utilization).toBeLessThanOrEqual(1);
    // sem sobreposição
    const [p, q] = r.placed;
    const overlap =
      p.x < q.x + q.placedW && q.x < p.x + p.placedW && p.y < q.y + q.placedD && q.y < p.y + p.placedD;
    expect(overlap).toBe(false);
  });

  it("gira 90° para aproveitar a chapa estreita", () => {
    // chapa 40x100: peça 60x30 só cabe girada (30x60)
    const r = packPlate([{ id: "a", label: "A", w: 60, d: 30 }], 40, 100, 0, 0);
    expect(r.unplaced).toEqual([]);
    expect(r.placed[0].rotated).toBe(true);
    expect(r.placed[0].placedW).toBe(30);
  });

  it("separa o que não cabe (sobra)", () => {
    const r = packPlate(
      [
        { id: "a", label: "A", w: 90, d: 90 },
        { id: "b", label: "B", w: 90, d: 90 },
      ],
      100,
      100,
      2,
      3
    );
    expect(r.placed).toHaveLength(1);
    expect(r.unplaced.map((u) => u.id)).toEqual(["b"]);
  });

  it("respeita margem e espaçamento", () => {
    const r = packPlate([{ id: "a", label: "A", w: 94, d: 94 }], 100, 100, 2, 3);
    // 94+2 > 100-6 → não cabe
    expect(r.unplaced).toHaveLength(1);
  });

  it("é determinístico", () => {
    const models = [
      { id: "a", label: "A", w: 25, d: 18 },
      { id: "b", label: "B", w: 40, d: 30 },
      { id: "c", label: "C", w: 15, d: 15 },
    ];
    const r1 = packPlate(models, 100, 80);
    const r2 = packPlate(models, 100, 80);
    expect(r1).toEqual(r2);
    assertNoOverlap(r1, 2);
    assertInside(r1, 100, 80, 3);
  });

  it("cabe 12 modelos pequenos na Photon Mono 4 (153,4×87)", () => {
    const models = Array.from({ length: 12 }, (_, i) => ({
      id: `m${i}`,
      label: `M${i}`,
      w: 25,
      d: 18,
    }));
    const r = packPlate(models, 153.4, 87, 2, 3);
    expect(r.unplaced).toEqual([]);
    expect(r.placed).toHaveLength(12);
    assertNoOverlap(r, 2);
    assertInside(r, 153.4, 87, 3);
  });

  it("mistura realista de modelos cabe sem encostar", () => {
    const models = [
      { id: "a", label: "A", w: 32, d: 24 },
      { id: "b", label: "B", w: 28, d: 20 },
      { id: "c", label: "C", w: 25, d: 18 },
      { id: "d", label: "D", w: 25, d: 18 },
      { id: "e", label: "E", w: 22, d: 16 },
      { id: "f", label: "F", w: 22, d: 16 },
      { id: "g", label: "G", w: 20, d: 15 },
      { id: "h", label: "H", w: 20, d: 15 },
      { id: "i", label: "I", w: 18, d: 14 },
      { id: "j", label: "J", w: 18, d: 14 },
    ];
    const r = packPlate(models, 153.4, 87, 2, 3);
    expect(r.unplaced).toEqual([]);
    assertNoOverlap(r, 2);
    assertInside(r, 153.4, 87, 3);
    expect(r.utilization).toBeGreaterThan(0.3);
  });

  it("folga zero ainda separa 1mm (anti-fusão)", () => {
    const r = packPlate(
      [
        { id: "a", label: "A", w: 30, d: 30 },
        { id: "b", label: "B", w: 30, d: 30 },
      ],
      100,
      100,
      0,
      0
    );
    expect(r.placed).toHaveLength(2);
    assertNoOverlap(r, 1);
  });

  it("unplacedReason distingue grande demais de sem espaço", () => {
    expect(unplacedReason({ id: "x", label: "X", w: 200, d: 200 }, 198, 123, 2, 2)).toBe("too-big");
    expect(unplacedReason({ id: "x", label: "X", w: 60, d: 55 }, 198, 123, 2, 2)).toBe("no-space");
  });

    it("8 arcos grandes na Sky 2022: teto honesto, sem sobreposição", () => {
    const arch = (id: string) => ({ id, label: id, w: 62, d: 55 });
    const models = ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8"].map(arch);
    const r = packPlate(models, 198, 123, 2, 2);
    // 3 por fileira × 2 fileiras = teto geométrico sem entrelaçar o U
    expect(r.placed.length).toBeGreaterThanOrEqual(6);
    assertNoOverlap(r, 2);
    assertInside(r, 198, 123, 2);
    for (const u of r.unplaced) {
      expect(unplacedReason(u, 198, 123, 2, 2)).toBe("no-space");
    }
  });

  it("raster pesado na Sky: 13/14 com ângulos finos e ruin-and-recreate", () => {
    const rect = (w: number, d: number) => ({ w, d });
    const defs = [
      { id: "a1", ...rect(64, 55) },
      { id: "a2", ...rect(60, 53) },
      { id: "a3", ...rect(58, 52) },
      { id: "an1", ...rect(62, 32) },
      { id: "an2", ...rect(60, 30) },
      { id: "t1", ...rect(26, 19) },
      { id: "t2", ...rect(26, 19) },
      { id: "t3", ...rect(25, 18) },
      { id: "t4", ...rect(25, 18) },
      { id: "g", ...rect(32, 22) },
      { id: "p", ...rect(48, 26) },
      { id: "c", ...rect(24, 17) },
      { id: "x1", ...rect(30, 22) },
      { id: "x2", ...rect(28, 20) },
    ];
    const models = defs.map((m) => ({ ...m, label: m.id, grid: filledGrid(m.w, m.d, 1) }));
    const r = packRaster(models, 198, 123, 2, 2, 1);
    expect(r.placed.length).toBeGreaterThanOrEqual(13);
    // sem toque em nível de célula: nenhuma célula vizinha pertence a outro modelo
    // (linear via mapa de ocupação, em vez de O(n²) por pares)
    const owner = new Map<string, string>();
    for (const p of r.placed) {
      const pix = p.pix!;
      for (let j = 0; j < pix.h; j++) {
        for (let i = 0; i < pix.w; i++) {
          if (!pix.cells[j * pix.w + i]) continue;
          const key = `${Math.round(p.x + i)},${Math.round(p.y + j)}`;
          if (!owner.has(key)) owner.set(key, p.id);
        }
      }
    }
    for (const [key, id] of owner) {
      const [x, y] = key.split(",").map(Number);
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (di === 0 && dj === 0) continue;
          const o = owner.get(`${x + di},${y + dj}`);
          expect(!o || o === id).toBe(true);
        }
      }
    }
  });

  it("set pesado na Mono 4: multi-tentativa supera passada única (>=9)", () => {
    const models = [
      { id: "a1", label: "A", w: 64, d: 56 },
      { id: "a2", label: "A", w: 62, d: 55 },
      { id: "a3", label: "A", w: 61, d: 54 },
      { id: "an1", label: "AN", w: 62, d: 32 },
      { id: "an2", label: "AN", w: 60, d: 30 },
      { id: "t1", label: "T", w: 26, d: 19 },
      { id: "t2", label: "T", w: 26, d: 19 },
      { id: "t3", label: "T", w: 25, d: 18 },
      { id: "t4", label: "T", w: 25, d: 18 },
      { id: "g", label: "G", w: 32, d: 22 },
      { id: "p", label: "P", w: 48, d: 26 },
      { id: "c", label: "C", w: 24, d: 17 },
    ];
    const r = packPlate(models, 153.4, 87, 2, 2);
    expect(r.placed.length).toBeGreaterThanOrEqual(9);
    assertNoOverlap(r, 2);
    assertInside(r, 153.4, 87, 2);
  });
});

describe("detectPlate", () => {
  it("reconhece Photon Mono 4, Sky 2022 (198×123) e Sky original (192×120)", () => {
    expect(detectPlate("Anycubic", "Photon Mono 4").w).toBe(153.4);
    const sky2022 = detectPlate("Halot", "Sky 2022");
    expect(sky2022.w).toBe(198);
    expect(sky2022.d).toBe(123);
    expect(sky2022.h).toBe(200);
    // nome curto como cadastrado no laboratório
    expect(detectPlate("Halot", "sky 22").w).toBe(198);
    expect(detectPlate("Creality", "Halot Sky").w).toBe(192);
  });

  it("fmtMm formata em pt-BR", () => {
    expect(fmtMm(12.5)).toBe("12,5 mm");
  });
});

describe("buildPositionedStl", () => {
  it("posiciona, gira e desce para a mesa (round-trip exato)", async () => {
    const a = await parseStlTriangles(binaryStl()); // 10×5×2 em (0,0,0)
    const out = buildPositionedStl([
      { positions: a.positions, x: 30, y: 40, angle: 90, dropToBed: true },
    ]);
    // cabeçalho + 1 triângulo
    expect(out.byteLength).toBe(84 + 50);
    expect(new DataView(out).getUint32(80, true)).toBe(1);
    const back = await parseStlDimensions(out);
    // girado: 5×10, canto em (30,40), Z encostado no zero
    expect(back.x).toBe(5);
    expect(back.y).toBe(10);
    expect(back.z).toBe(2);
    expect(back.triangles).toBe(1);
  });

  it("duas peças não se sobrepõem no arquivo final", async () => {
    const a = await parseStlTriangles(binaryStl());
    const layout = packPlate(
      [
        { id: "a", label: "A", w: 10, d: 5 },
        { id: "b", label: "B", w: 10, d: 5 },
      ],
      100,
      100,
      2,
      3
    );
    expect(layout.unplaced).toEqual([]);
    const out = buildPositionedStl(
      layout.placed.map((p) => ({ positions: a.positions, x: p.x, y: p.y, angle: p.angle }))
    );
    expect(new DataView(out).getUint32(80, true)).toBe(2);
    // volta a ler: caixas das peças posicionadas não se tocam
    const re = await parseStlDimensions(out);
    expect(re.triangles).toBe(2);
    expect(re.x).toBeGreaterThan(10);
  });

  it("mantém Z original quando dropToBed é false", async () => {
    const a = await parseStlTriangles(binaryStl());
    // desloca Z para [5,7]
    const shifted = new Float32Array(a.positions);
    for (let i = 2; i < shifted.length; i += 3) shifted[i] += 5;
    const out = buildPositionedStl([{ positions: shifted, x: 0, y: 0, angle: 0, dropToBed: false }]);
    const back = await parseStlDimensions(out);
    expect(back.z).toBe(2);
  });

  it("peça longa entra na diagonal quando não cabe reta", () => {
    // 110×20 não cabe reta nem em pé em 100×100, mas cabe a 45°
    const r = packPlate([{ id: "long", label: "L", w: 110, d: 20 }], 100, 100, 1, 0);
    expect(r.unplaced).toEqual([]);
    expect(r.placed).toHaveLength(1);
    expect(r.placed[0].angle).not.toBe(0);
    expect(r.placed[0].angle).not.toBe(90);
  });

  it("writer com ângulo: bbox relida confere com a peça girada", async () => {
    const a = await parseStlTriangles(binaryStl()); // triângulo (0,0)-(10,0)-(0,5)
    const out = buildPositionedStl([{ positions: a.positions, x: 20, y: 30, angle: 30 }]);
    const back = await parseStlDimensions(out);
    // vértices girados 30° (horário): (0,0), (8.66,-5), (2.5,4.33) → caixa 8,66 × 9,33
    expect(back.x).toBeCloseTo(8.7, 0);
    expect(back.y).toBeCloseTo(9.3, 0);
    expect(back.triangles).toBe(1);
  });
});

// STL binário montado de lista de triângulos [[x,y]×3] (50 bytes cada)
function trisStl(tris: number[][][]): ArrayBuffer {
  const buf = new ArrayBuffer(84 + tris.length * 50);
  const view = new DataView(buf);
  view.setUint32(80, tris.length, true);
  let off = 84;
  for (const t of tris) {
    // normal zerada (12 bytes) já é zero; 3 vértices × 12 bytes; atributo (2 bytes)
    for (let v = 0; v < 3; v++) {
      view.setFloat32(off + 12 + v * 12, t[v][0], true);
      view.setFloat32(off + 16 + v * 12, t[v][1], true);
      view.setFloat32(off + 20 + v * 12, 0, true);
    }
    off += 50;
  }
  return buf;
}

// U 30×30 oco (barras de 6mm, vão interno 24×18 aberto à direita)
function cShapeStl(): ArrayBuffer {
  const rect = (x0: number, y0: number, x1: number, y1: number) => [
    [[x0, y0], [x1, y0], [x1, y1]],
    [[x0, y0], [x1, y1], [x0, y1]],
  ];
  return trisStl([
    ...rect(0, 0, 6, 30),
    ...rect(0, 0, 30, 6),
    ...rect(0, 24, 30, 30),
  ]);
}

function squareStl(s: number): ArrayBuffer {
  return trisStl([
    [[0, 0], [s, 0], [s, s]],
    [[0, 0], [s, s], [0, s]],
  ]);
}

describe("raster", () => {
  it("rasteriza o U com o vão vazio", async () => {
    const t = await parseStlTriangles(cShapeStl());
    const g = rasterizeTriangles(t.positions, 1);
    expect(g.w).toBe(30);
    expect(g.h).toBe(30);
    const at = (x: number, y: number) => g.cells[y * g.w + x];
    expect(at(3, 15)).toBe(1); // barra esquerda
    expect(at(15, 3)).toBe(1); // barra inferior
    expect(at(15, 15)).toBe(0); // vão vazio
    expect(at(28, 15)).toBe(0); // abertura direita
  });

  it("dilata expandindo a grade (anel nunca é cortado)", () => {
    const cells = new Uint8Array(16);
    cells[1 * 4 + 1] = 1;
    cells[1 * 4 + 2] = 1;
    cells[2 * 4 + 1] = 1;
    cells[2 * 4 + 2] = 1;
    const d = dilateGrid({ w: 4, h: 4, cells, minX: 0, minY: 0, cell: 1 }, 1);
    // grade 4×4 + pad 1 vira 6×6, com o 4×4 central todo bloqueado
    expect(d.w).toBe(6);
    expect(d.h).toBe(6);
    expect(d.pad).toBe(1);
    expect(d.cells.reduce((s, v) => s + v, 0)).toBe(16);
    const d0 = dilateGrid({ w: 4, h: 4, cells, minX: 0, minY: 0, cell: 1 }, 0);
    expect(d0.w).toBe(4);
    expect(d0.cells.reduce((s, v) => s + v, 0)).toBe(4);
  });

  it("gira 90° trocando largura/altura", async () => {
    const t = await parseStlTriangles(squareStl(10));
    const g = rasterizeTriangles(t.positions, 1);
    const r = rotateGrid(g, 90);
    expect(r.grid.w).toBe(g.h);
    expect(r.grid.h).toBe(g.w);
    expect(r.safe).toBe(true);
    const r30 = rotateGrid(g, 30);
    expect(r30.safe).toBe(false);
  });

  it("ENTRELAÇA: quadrado 10×10 mora no vão do U (caixas não caberiam)", async () => {
    const c = await parseStlTriangles(cShapeStl());
    const s = await parseStlTriangles(squareStl(10));
    const cg = rasterizeTriangles(c.positions, 1);
    const sg = rasterizeTriangles(s.positions, 1);
    const r = packRaster(
      [
        { id: "u", label: "U", w: 30, d: 30, grid: cg },
        { id: "q", label: "Q", w: 10, d: 10, grid: sg },
      ],
      40,
      40,
      2,
      2
    );
    // por caixas seria impossível (30+12 > 38 lado a lado); entrelaçado cabem os 2
    expect(r.unplaced).toEqual([]);
    expect(r.placed).toHaveLength(2);
    const u = r.placed.find((p) => p.id === "u")!;
    const q = r.placed.find((p) => p.id === "q")!;
    // quadrado dentro da região do U (entrelaçado de verdade)
    expect(q.x).toBeGreaterThanOrEqual(u.x);
    expect(q.x + 10).toBeLessThanOrEqual(u.x + 30);
    // sem toque: distância Chebyshev entre células dos modelos >= 2 células
    const cellsOf = (p: typeof u) => {
      const pix = p.pix!;
      const out: [number, number][] = [];
      for (let j = 0; j < pix.h; j++)
        for (let i = 0; i < pix.w; i++)
          if (pix.cells[j * pix.w + i]) out.push([p.x + i, p.y + j]);
      return out;
    };
    const cu = cellsOf(u);
    const cq = cellsOf(q);
    let minD = Infinity;
    for (const [ax, ay] of cu)
      for (const [bx, by] of cq)
        minD = Math.min(minD, Math.max(Math.abs(ax - bx), Math.abs(ay - by)));
    expect(minD).toBeGreaterThanOrEqual(2);
  });

  it("organização máxima: arcos dentários em formato U cabem com entrelaçamento e rotações opostas", async () => {
    // Modelos de arcos dentários (U 44×36 mm com vão interno 24×26 mm)
    const rect = (x0: number, y0: number, x1: number, y1: number) => [
      [[x0, y0], [x1, y0], [x1, y1]],
      [[x0, y0], [x1, y1], [x0, y1]],
    ];
    const dentalArchTris = trisStl([
      ...rect(0, 0, 10, 36), // ramo esquerdo
      ...rect(0, 0, 44, 10), // anterior / frente
      ...rect(34, 0, 44, 36), // ramo direito
    ]);
    const archStl = await parseStlTriangles(dentalArchTris);
    const grid = rasterizeTriangles(archStl.positions, 1);

    const models = Array.from({ length: 12 }, (_, i) => ({
      id: `arch_${i + 1}`,
      label: `Paciente ${i + 1}`,
      w: 44,
      d: 36,
      grid,
    }));

    // Na Halot Sky (198×123mm), com rotações invertidas (180°) e entrelaçamento molar-com-molar
    const res = packRaster(models, 198, 123, 2, 1.5, 1);
    expect(res.placed.length).toBeGreaterThanOrEqual(9);

    // Validação de não-sobreposição
    const owner = new Map<string, string>();
    for (const p of res.placed) {
      const pix = p.pix!;
      for (let j = 0; j < pix.h; j++) {
        for (let i = 0; i < pix.w; i++) {
          if (!pix.cells[j * pix.w + i]) continue;
          const key = `${Math.round(p.x + i)},${Math.round(p.y + j)}`;
          expect(owner.has(key)).toBe(false);
          owner.set(key, p.id);
        }
      }
    }
  });

  it("raster é determinístico", async () => {
    const c = await parseStlTriangles(cShapeStl());
    const s = await parseStlTriangles(squareStl(10));
    const cg = rasterizeTriangles(c.positions, 1);
    const sg = rasterizeTriangles(s.positions, 1);
    const mk = () => [
      { id: "u", label: "U", w: 30, d: 30, grid: cg },
      { id: "q", label: "Q", w: 10, d: 10, grid: sg },
    ];
    expect(packRaster(mk(), 40, 40, 2, 2)).toEqual(packRaster(mk(), 40, 40, 2, 2));
  });

  it("filledGrid comporta-se como retângulo", () => {
    const g = filledGrid(5, 4, 1);
    expect(g.w).toBe(5);
    expect(g.h).toBe(4);
    expect(g.cells.every((v) => v === 1)).toBe(true);
  });

  it("PLANEJADO == GRAVADO: STL final respeita o mapa (sem deslocamento)", async () => {
    // C com origem deslocada (como arquivo real): sem normalização no mesmo
    // pivô, o writer deslocaria a peça e fundiria com a vizinha.
    const raw = cShapeStl();
    const shifted = (() => {
      const src = new DataView(raw);
      const buf = raw.slice(0);
      const dst = new DataView(buf);
      const n = src.getUint32(80, true);
      for (let t = 0; t < n; t++) {
        for (let v = 0; v < 3; v++) {
          dst.setFloat32(84 + t * 50 + 12 + v * 12, src.getFloat32(84 + t * 50 + 12 + v * 12, true) + 100, true);
          dst.setFloat32(84 + t * 50 + 16 + v * 12, src.getFloat32(84 + t * 50 + 16 + v * 12, true) + 50, true);
        }
      }
      return buf;
    })();
    const t = await parseStlTriangles(shifted);
    const g = rasterizeTriangles(t.positions, 1);
    const r = packRaster([{ id: "u", label: "U", w: 30, d: 30, grid: g }], 60, 60, 2, 2);
    expect(r.placed).toHaveLength(1);
    // constrói EXATAMENTE o que foi planejado (mesma posição e ângulo)
    const planned = r.placed[0];
    const out = buildPositionedStl([
      { positions: t.positions, x: planned.x, y: planned.y, angle: planned.angle },
    ]);
    // relê o arquivo final: toda célula ocupada deve estar a <=1 célula
    // do planejado (tolerância de arredondamento).
    // Nota: o re-parse normaliza a origem, então compensa o deslocamento.
    const re = await parseStlTriangles(out);
    let gx0 = Infinity,
      gy0 = Infinity;
    for (let i = 0; i < re.positions.length; i += 3) {
      if (re.positions[i] < gx0) gx0 = re.positions[i];
      if (re.positions[i + 1] < gy0) gy0 = re.positions[i + 1];
    }
    // 1) posição: canto da geometria gravada confere com o planejado
    expect(Math.abs(gx0 - planned.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(gy0 - planned.y)).toBeLessThanOrEqual(2);
    const back = rasterizeTriangles(re.positions, 1);
    const wanted = new Set<string>();
    const pix = planned.pix!;
    for (let j = 0; j < pix.h; j++)
      for (let i = 0; i < pix.w; i++)
        if (pix.cells[j * pix.w + i]) wanted.add(`${planned.x + i},${planned.y + j}`);
    const ox = planned.x - back.minX;
    const oy = planned.y - back.minY;
    let worst = 0;
    let total = 0;
    for (let j = 0; j < back.h; j++) {
      for (let i = 0; i < back.w; i++) {
        if (!back.cells[j * back.w + i]) continue;
        total++;
        let ok = false;
        for (let dj = -1; dj <= 1 && !ok; dj++)
          for (let di = -1; di <= 1 && !ok; di++)
            if (wanted.has(`${Math.round(back.minX + i + ox + di)},${Math.round(back.minY + j + oy + dj)}`)) ok = true;
        if (!ok) worst++;
      }
    }
    expect(total).toBeGreaterThan(0);
    // >=95% das células gravadas conferem com o planejado
    expect(worst / total).toBeLessThan(0.05);
  });

  describe("levelAndOrientDentalModel e flipModel180", () => {
    it("levelAndOrientDentalModel preserva a malha original 100% intacta sem alterações automáticas", () => {
      const baseTri1 = [0, 0, 20, 40, 0, 20, 40, 30, 20];
      const baseTri2 = [0, 0, 20, 40, 30, 20, 0, 30, 20];
      const toothTri1 = [10, 10, 0, 20, 10, 10, 15, 20, 10];
      const toothTri2 = [20, 10, 0, 30, 10, 10, 25, 20, 10];

      const model = new Float32Array([...baseTri1, ...baseTri2, ...toothTri1, ...toothTri2]);

      const res = levelAndOrientDentalModel(model);
      expect(res.changed).toBe(false);
      expect(res.positions).toBe(model);
    });

    it("flipModel180 desvira modelo de cabeça para baixo sob demanda para Z=0", () => {
      const baseTri1 = [0, 0, 20, 40, 0, 20, 40, 30, 20];
      const baseTri2 = [0, 0, 20, 40, 30, 20, 0, 30, 20];
      const toothTri1 = [10, 10, 0, 20, 10, 10, 15, 20, 10];
      const toothTri2 = [20, 10, 0, 30, 10, 10, 25, 20, 10];

      const model = new Float32Array([...baseTri1, ...baseTri2, ...toothTri1, ...toothTri2]);
      const flipped = flipModel180(model);

      let minZ = Infinity;
      let maxZ = -Infinity;
      for (let i = 2; i < flipped.length; i += 3) {
        if (flipped[i] < minZ) minZ = flipped[i];
        if (flipped[i] > maxZ) maxZ = flipped[i];
      }
      expect(minZ).toBe(0);
      expect(maxZ).toBeCloseTo(20, 0);
    });

    it("permite inverter manualmente 180 graus com flipModel180", () => {
      const tri = [0, 0, 0, 10, 0, 5, 0, 10, 10];
      const model = new Float32Array(tri);

      const flipped = flipModel180(model);
      expect(flipped.length).toBe(model.length);

      let minZ = Infinity;
      for (let i = 2; i < flipped.length; i += 3) {
        if (flipped[i] < minZ) minZ = flipped[i];
      }
      expect(minZ).toBe(0);
    });

    it("PRESERVAÇÃO 1:1 DE TAMANHO: não tomba modelo que possui corte posterior vertical largo", () => {
      // Simula uma arcada odontológica de 60mm de largura, 50mm de profundidade e 20mm de altura.
      // Base inferior é vazada (ferradura) e tem corte posterior reto vertical em Y=50 (60x20mm).
      // Antes do fix, o corte posterior era detectado como bestPlane e tombava o modelo 90°,
      // reduzindo a profundidade Y de 50mm para 20mm (60% de encolhimento).
      const tris: number[] = [];

      // Pequenas áreas da base inferior (Z=0, nz=-1)
      tris.push(0, 0, 0, 10, 0, 0, 10, 10, 0);
      tris.push(50, 0, 0, 60, 0, 0, 60, 10, 0);

      // Corte posterior plano grande (Y=50, nz=0, ny=1)
      for (let x = 0; x < 60; x += 10) {
        for (let z = 0; z < 20; z += 10) {
          tris.push(x, 50, z, x + 10, 50, z, x + 10, 50, z + 10);
          tris.push(x, 50, z, x + 10, 50, z + 10, x, 50, z + 10);
        }
      }

      // Dentes e cúspides na frente e laterais
      for (let i = 0; i < 40; i++) {
        tris.push(i, i * 0.8, 15, i + 1, i * 0.8, 15, i, i * 0.8 + 1, 18);
      }

      const model = new Float32Array(tris);

      // Medição prévia
      let origMinX = Infinity, origMaxX = -Infinity;
      let origMinY = Infinity, origMaxY = -Infinity;
      let origMinZ = Infinity, origMaxZ = -Infinity;
      for (let i = 0; i < model.length; i += 3) {
        if (model[i] < origMinX) origMinX = model[i];
        if (model[i] > origMaxX) origMaxX = model[i];
        if (model[i + 1] < origMinY) origMinY = model[i + 1];
        if (model[i + 1] > origMaxY) origMaxY = model[i + 1];
        if (model[i + 2] < origMinZ) origMinZ = model[i + 2];
        if (model[i + 2] > origMaxZ) origMaxZ = model[i + 2];
      }

      const origW = origMaxX - origMinX;
      const origD = origMaxY - origMinY;
      const origH = origMaxZ - origMinZ;

      const res = levelAndOrientDentalModel(model);

      // Modelo NÃO deve ser tombado nem modificado
      expect(res.wasFlipped).toBe(false);
      expect(res.changed).toBe(false);

      // Medição posterior: 100% idêntica, sem encolhimento
      let postMinX = Infinity, postMaxX = -Infinity;
      let postMinY = Infinity, postMaxY = -Infinity;
      let postMinZ = Infinity, postMaxZ = -Infinity;
      for (let i = 0; i < res.positions.length; i += 3) {
        if (res.positions[i] < postMinX) postMinX = res.positions[i];
        if (res.positions[i] > postMaxX) postMaxX = res.positions[i];
        if (res.positions[i + 1] < postMinY) postMinY = res.positions[i + 1];
        if (res.positions[i + 1] > postMaxY) postMaxY = res.positions[i + 1];
        if (res.positions[i + 2] < postMinZ) postMinZ = res.positions[i + 2];
        if (res.positions[i + 2] > postMaxZ) postMaxZ = res.positions[i + 2];
      }

      expect(postMaxX - postMinX).toBeCloseTo(origW, 4);
      expect(postMaxY - postMinY).toBeCloseTo(origD, 4);
      expect(postMaxZ - postMinZ).toBeCloseTo(origH, 4);
    });

    it("CONSERVAÇÃO ISOMÉTRICA: flipModel180 preserva exatamente a largura X, profundidade Y e altura Z em mm", () => {
      // Cria malha com medidas exatas 55.4 x 42.8 x 18.2 mm
      const tri = [
        0, 0, 0,
        55.4, 0, 0,
        0, 42.8, 18.2,
      ];
      const model = new Float32Array(tri);
      const flipped = flipModel180(model);

      let fMinX = Infinity, fMaxX = -Infinity;
      let fMinY = Infinity, fMaxY = -Infinity;
      let fMinZ = Infinity, fMaxZ = -Infinity;
      for (let i = 0; i < flipped.length; i += 3) {
        if (flipped[i] < fMinX) fMinX = flipped[i];
        if (flipped[i] > fMaxX) fMaxX = flipped[i];
        if (flipped[i + 1] < fMinY) fMinY = flipped[i + 1];
        if (flipped[i + 1] > fMaxY) fMaxY = flipped[i + 1];
        if (flipped[i + 2] < fMinZ) fMinZ = flipped[i + 2];
        if (flipped[i + 2] > fMaxZ) fMaxZ = flipped[i + 2];
      }

      expect(fMaxX - fMinX).toBeCloseTo(55.4, 4);
      expect(fMaxY - fMinY).toBeCloseTo(42.8, 4);
      expect(fMaxZ - fMinZ).toBeCloseTo(18.2, 4);
    });

    it("ROBUSTEZ DE PARSER 1:1: lê STL binário com bytes extras/padding no final sem truncar medidas", async () => {
      // Simula arquivo binário de 1 triângulo (50x40x20mm) com 256 bytes de metadados extras no final
      const triCount = 1;
      const validSize = 84 + triCount * 50;
      const extraBytes = 256;
      const buffer = new ArrayBuffer(validSize + extraBytes);
      const view = new DataView(buffer);

      // Header não começa com 'solid'
      const headerStr = "Exocad Dental CAD Export";
      for (let i = 0; i < headerStr.length; i++) view.setUint8(i, headerStr.charCodeAt(i));
      view.setUint32(80, triCount, true);

      // Triângulo 50x40x20
      view.setFloat32(84 + 12, 0, true);
      view.setFloat32(84 + 16, 0, true);
      view.setFloat32(84 + 20, 0, true);

      view.setFloat32(84 + 24, 50, true);
      view.setFloat32(84 + 28, 0, true);
      view.setFloat32(84 + 32, 0, true);

      view.setFloat32(84 + 36, 0, true);
      view.setFloat32(84 + 40, 40, true);
      view.setFloat32(84 + 44, 20, true);

      const parsed = await parseStlTriangles(buffer);
      expect(parsed.count).toBe(1);

      const dims = await parseStlDimensions(buffer);
      expect(dims.x).toBe(50);
      expect(dims.y).toBe(40);
      expect(dims.z).toBe(20);
    });

    it("troquel ou modelo com troquel que cabe na mesa NUNCA fica inclinado na diagonal (sempre reto em 0°, 90°, 180° ou 270°)", () => {
      // Simula uma mesa padrão com um modelo de arcada (65x50mm) e um troquel de dente preparado (18x14mm)
      const models = [
        { id: "arcada", label: "Modelo Arcada Superior", w: 65, d: 50 },
        { id: "troquel", label: "Troquel Dente 21 Preparado", w: 18, d: 14 },
      ];
      const r = packPlate(models, 150, 100, 2, 3);

      expect(r.unplaced).toEqual([]);
      expect(r.placed).toHaveLength(2);

      const troquelPlaced = r.placed.find((p) => p.id === "troquel")!;
      expect(troquelPlaced).toBeDefined();

      // O troquel DEVE ficar reto na mesa (ortogonal), NUNCA inclinado a 45°, 30°, -45°, etc.
      const allowedOrthogonal = [0, 90, 180, 270];
      const normalizedAngle = ((troquelPlaced.angle % 360) + 360) % 360;
      expect(allowedOrthogonal).toContain(normalizedAngle);
    });
  });
});
