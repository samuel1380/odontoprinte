import { describe, it, expect } from "vitest";
import {
  generateDentalSupports,
  DEFAULT_DENTAL_SUPPORT_CONFIG,
  DENTAL_SUPPORT_PROFILES,
} from "../src/lib/support-generator";

// Cria triângulos simples simulando a base de um modelo dentário (quadrado de 30x30mm na origem com triângulos inferiores)
function createSampleModelPositions(): Float32Array {
  const tris: number[] = [
    // Base plana
    0, 0, 0, 30, 0, 0, 30, 30, 0,
    0, 0, 0, 30, 30, 0, 0, 30, 0,
    // Superfícies inclinadas
    0, 0, 0, 30, 0, 0, 15, 15, 12,
    30, 0, 0, 30, 30, 0, 15, 15, 12,
    30, 30, 0, 0, 30, 0, 15, 15, 12,
    0, 30, 0, 0, 0, 0, 15, 15, 12,
    // Triângulo inferior (overhang)
    5, 5, 2, 25, 5, 2, 15, 25, 2,
  ];
  return new Float32Array(tris);
}

describe("SupportGenerator (Motor de Suportes Médios Odontológicos de Alta Precisão)", () => {
  it("tem as medidas padrão corretas de suporte médio anti-falhas e anti-fusão", () => {
    expect(DEFAULT_DENTAL_SUPPORT_CONFIG.elevationZ).toBe(5.0);
    expect(DEFAULT_DENTAL_SUPPORT_CONFIG.pillarDiameter).toBe(1.3);
    expect(DEFAULT_DENTAL_SUPPORT_CONFIG.tipDiameter).toBe(0.65);
    expect(DEFAULT_DENTAL_SUPPORT_CONFIG.raftThickness).toBe(1.0);
    expect(DEFAULT_DENTAL_SUPPORT_CONFIG.minPillarDistance).toBeGreaterThanOrEqual(2.4);
    expect(DEFAULT_DENTAL_SUPPORT_CONFIG.modelClearance).toBeGreaterThanOrEqual(0.7);
  });

  it("disponibiliza perfis predefinidos calibrados (Padrão Ouro, Fino e Reforçado)", () => {
    expect(DENTAL_SUPPORT_PROFILES.GOLD_MEDIUM).toBeDefined();
    expect(DENTAL_SUPPORT_PROFILES.FINE_PRECISION).toBeDefined();
    expect(DENTAL_SUPPORT_PROFILES.HEAVY_STRUCTURAL).toBeDefined();
    expect(DENTAL_SUPPORT_PROFILES.GOLD_MEDIUM.config.pillarDiameter).toBe(1.3);
    expect(DENTAL_SUPPORT_PROFILES.FINE_PRECISION.config.pillarDiameter).toBe(1.0);
    expect(DENTAL_SUPPORT_PROFILES.HEAVY_STRUCTURAL.config.pillarDiameter).toBe(1.5);
  });

  it("gera suportes, balsa e buffer STL binário válido", async () => {
    const positions = createSampleModelPositions();
    const result = await generateDentalSupports(positions);

    expect(result.pillarCount).toBeGreaterThan(0);
    expect(result.supportTriangles).toBeGreaterThan(0);
    expect(result.totalTriangles).toBe(7 + result.supportTriangles);

    // Validação estrita da estrutura de STL binário
    expect(result.stlBuffer.byteLength).toBe(84 + result.totalTriangles * 50);

    const view = new DataView(result.stlBuffer);
    const countInHeader = view.getUint32(80, true);
    expect(countInHeader).toBe(result.totalTriangles);
  });

  it("garante proteção anti-fusão entre suportes vizinhos (distância mínima respeitada)", async () => {
    const positions = createSampleModelPositions();
    const minDistance = 2.5;
    const result = await generateDentalSupports(positions, { minPillarDistance: minDistance });

    expect(result.pillars.length).toBeGreaterThan(1);

    // Valida que NENHUM par de pilares está mais próximo do que minDistance
    for (let i = 0; i < result.pillars.length; i++) {
      for (let j = i + 1; j < result.pillars.length; j++) {
        const p1 = result.pillars[i];
        const p2 = result.pillars[j];
        const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        expect(dist).toBeGreaterThanOrEqual(minDistance - 0.05);
      }
    }
  });

  it("eleva o modelo em Z conforme a elevação configurada", async () => {
    const positions = createSampleModelPositions();
    const result = await generateDentalSupports(positions, { elevationZ: 6.0 });

    expect(result.bounds.minZ).toBe(0);
    expect(result.bounds.maxZ).toBeGreaterThanOrEqual(18.0);
  });

  it("calcula estimativa de consumo de resina e duração com segurança", async () => {
    const positions = createSampleModelPositions();
    const result = await generateDentalSupports(positions);

    expect(result.estimatedResinMl).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.pillars.length).toBe(result.pillarCount);
  });
});
