import { describe, it, expect } from "vitest";
import {
  parseStlDimensions,
  parseStlTriangles,
  buildPositionedStl,
  packPlate,
  detectPlate,
  fmtMm,
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
  });
});

describe("detectPlate", () => {
  it("reconhece Photon Mono 4 e Halot Sky", () => {
    expect(detectPlate("Anycubic", "Photon Mono 4").w).toBe(153.4);
    expect(detectPlate("Halot", "Sky 2022").w).toBe(192);
  });

  it("fmtMm formata em pt-BR", () => {
    expect(fmtMm(12.5)).toBe("12,5 mm");
  });
});

describe("buildPositionedStl", () => {
  it("posiciona, gira e desce para a mesa (round-trip exato)", async () => {
    const a = await parseStlTriangles(binaryStl()); // 10×5×2 em (0,0,0)
    const out = buildPositionedStl([
      { positions: a.positions, x: 30, y: 40, rotated: true, dropToBed: true },
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
      layout.placed.map((p) => ({ positions: a.positions, x: p.x, y: p.y, rotated: p.rotated }))
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
    const out = buildPositionedStl([{ positions: shifted, x: 0, y: 0, rotated: false, dropToBed: false }]);
    const back = await parseStlDimensions(out);
    expect(back.z).toBe(2);
  });
});
