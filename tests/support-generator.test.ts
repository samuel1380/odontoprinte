import { describe, it, expect } from "vitest";
import {
  generateDentalSupports,
  DEFAULT_DENTAL_SUPPORT_CONFIG,
} from "../src/lib/support-generator";

// Cria triângulos simples simulando a base de um modelo dentário (quadrado de 20x20mm na origem)
function createSampleModelPositions(): Float32Array {
  // 2 triângulos formando um retângulo de 20x20 na base com Z de 0 a 10mm
  const tri1 = [
    0, 0, 0,
    20, 0, 0,
    20, 20, 5,
  ];
  const tri2 = [
    0, 0, 0,
    20, 20, 5,
    0, 20, 10,
  ];
  // Mais um triângulo voltado para baixo
  const triDownward = [
    5, 5, 2,
    15, 5, 2,
    10, 15, 2,
  ];
  return new Float32Array([...tri1, ...tri2, ...triDownward]);
}

describe("SupportGenerator (Motor de Suportes Médios Odontológicos)", () => {
  it("tem as medidas padrão corretas de suporte médio anti-falhas", () => {
    expect(DEFAULT_DENTAL_SUPPORT_CONFIG.elevationZ).toBe(5.0);
    expect(DEFAULT_DENTAL_SUPPORT_CONFIG.pillarDiameter).toBe(1.3);
    expect(DEFAULT_DENTAL_SUPPORT_CONFIG.tipDiameter).toBe(0.7);
    expect(DEFAULT_DENTAL_SUPPORT_CONFIG.raftThickness).toBe(1.0);
    expect(DEFAULT_DENTAL_SUPPORT_CONFIG.supportSpacing).toBe(3.0);
  });

  it("gera suportes, balsa e buffer STL binário válido", async () => {
    const positions = createSampleModelPositions();
    const result = await generateDentalSupports(positions);

    expect(result.pillarCount).toBeGreaterThan(0);
    expect(result.supportTriangles).toBeGreaterThan(0);
    expect(result.totalTriangles).toBe(3 + result.supportTriangles);

    // Validação estrita da estrutura de STL binário
    expect(result.stlBuffer.byteLength).toBe(84 + result.totalTriangles * 50);

    const view = new DataView(result.stlBuffer);
    const countInHeader = view.getUint32(80, true);
    expect(countInHeader).toBe(result.totalTriangles);
  });

  it("eleva o modelo em Z conforme a elevação configurada", async () => {
    const positions = createSampleModelPositions();
    const result = await generateDentalSupports(positions, { elevationZ: 6.0 });

    // O topo final deve levar em conta a elevação de 6mm
    expect(result.bounds.minZ).toBe(0); // Balsa começa na mesa Z=0
    expect(result.bounds.maxZ).toBeGreaterThanOrEqual(16.0); // 10 + 6
  });

  it("calcula estimativa de consumo de resina e duração", async () => {
    const positions = createSampleModelPositions();
    const result = await generateDentalSupports(positions);

    expect(result.estimatedResinMl).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.pillars.length).toBe(result.pillarCount);
  });
});
