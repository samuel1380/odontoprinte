import { describe, it, expect } from "vitest";
import {
  generateDentalSupports,
  DEFAULT_DENTAL_SUPPORT_CONFIG,
  DENTAL_SUPPORT_PROFILES,
  DENTAL_SUPPORT_CATEGORIES,
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

describe("SupportGenerator (Motor de Suportes Odontológicos de Alta Precisão)", () => {
  it("tem as medidas padrão corretas de suporte médio anti-falhas e anti-fusão", () => {
    expect(DEFAULT_DENTAL_SUPPORT_CONFIG.elevationZ).toBe(5.0);
    expect(DEFAULT_DENTAL_SUPPORT_CONFIG.pillarDiameter).toBe(1.3);
    expect(DEFAULT_DENTAL_SUPPORT_CONFIG.tipDiameter).toBe(0.65);
    expect(DEFAULT_DENTAL_SUPPORT_CONFIG.raftThickness).toBe(1.0);
    expect(DEFAULT_DENTAL_SUPPORT_CONFIG.minPillarDistance).toBeGreaterThanOrEqual(2.4);
    expect(DEFAULT_DENTAL_SUPPORT_CONFIG.modelClearance).toBeGreaterThanOrEqual(0.7);
  });

  it("disponibiliza perfis predefinidos calibrados (Fino, Médio e Grosso)", () => {
    expect(DENTAL_SUPPORT_PROFILES.FINE).toBeDefined();
    expect(DENTAL_SUPPORT_PROFILES.MEDIUM).toBeDefined();
    expect(DENTAL_SUPPORT_PROFILES.HEAVY).toBeDefined();

    expect(DENTAL_SUPPORT_PROFILES.FINE.config.pillarDiameter).toBe(1.0);
    expect(DENTAL_SUPPORT_PROFILES.MEDIUM.config.pillarDiameter).toBe(1.3);
    expect(DENTAL_SUPPORT_PROFILES.HEAVY.config.pillarDiameter).toBe(1.5);

    // Retrocompatibilidade
    expect(DENTAL_SUPPORT_PROFILES.GOLD_MEDIUM).toBeDefined();
    expect(DENTAL_SUPPORT_PROFILES.FINE_PRECISION).toBeDefined();
    expect(DENTAL_SUPPORT_PROFILES.HEAVY_STRUCTURAL).toBeDefined();
  });

  it("disponibiliza categorias de suportes com 'Modelos Dentários' ativa e demais para expansão futura", () => {
    expect(DENTAL_SUPPORT_CATEGORIES.MODELS).toBeDefined();
    expect(DENTAL_SUPPORT_CATEGORIES.VENEERS).toBeDefined();
    expect(DENTAL_SUPPORT_CATEGORIES.CROWNS).toBeDefined();
    expect(DENTAL_SUPPORT_CATEGORIES.GUIDES).toBeDefined();

    // Modelos está configurado e pronto para uso
    expect(DENTAL_SUPPORT_CATEGORIES.MODELS.isConfigured).toBe(true);
    expect(DENTAL_SUPPORT_CATEGORIES.MODELS.name).toBe("Modelos Dentários");

    // Facetas, Coroas e Guias prontas para configuração posterior
    expect(DENTAL_SUPPORT_CATEGORIES.VENEERS.isConfigured).toBe(false);
    expect(DENTAL_SUPPORT_CATEGORIES.CROWNS.isConfigured).toBe(false);
    expect(DENTAL_SUPPORT_CATEGORIES.GUIDES.isConfigured).toBe(false);
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

  it("gera suportes laterais e NUNCA coloca suportes no topo (dentes e gengiva protegidos)", async () => {
    const positions = createSampleModelPositions();
    // Modelo com altura Z de 0 a 12mm. Elevado em 5mm, topo fica em 17mm.
    const result = await generateDentalSupports(positions, { elevationZ: 5.0 });

    const maxAllowedZ = 5.0 + 12.0 * 0.40 + 0.1; // limite de 40% da altura do modelo

    for (const p of result.pillars) {
      // Nenhum suporte pode atingir a região dos dentes/topo
      expect(p.zContact).toBeLessThanOrEqual(maxAllowedZ);
    }

    // Valida que existem suportes com target lateral ou na base inferior
    expect(result.pillars.some((p) => p.isLateral || p.targetX !== undefined || p.zContact <= 5.0 + 3.0)).toBe(true);
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

  it("gera amarração lateral densa e contínua em paredes com alívio sem deixar vazios", async () => {
    // Cria modelo de zócalo com parede lateral de 35mm com conicidade de 25 graus
    const tris: number[] = [
      // Base inferior
      0, 0, 0, 35, 0, 0, 35, 25, 0,
      0, 0, 0, 35, 25, 0, 0, 25, 0,
      // Parede lateral longa inclinada para fora (norm.nz ~ 0.40)
      0, 0, 0, 35, 0, 0, 35, -2, 4,
      0, 0, 0, 35, -2, 4, 0, -2, 4,
      // Parede lateral oposta
      0, 25, 0, 35, 25, 0, 35, 27, 4,
      0, 25, 0, 35, 27, 4, 0, 27, 4,
      // Topo oclusal alto (Z=16)
      0, 0, 4, 35, 0, 4, 17, 12, 16,
    ];
    const pos = new Float32Array(tris);
    const result = await generateDentalSupports(pos, { elevationZ: 5.0 });

    const lateralPillars = result.pillars.filter((p) => p.isLateral || p.targetX !== undefined);
    // Deve conter múltiplos suportes distribuídos ao longo da extensão de 35mm
    expect(lateralPillars.length).toBeGreaterThanOrEqual(8);

    // Valida que há suportes cobrindo diferentes trechos de X ao longo da parede de 35mm
    const xs = lateralPillars.map((p) => p.x);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    expect(maxX - minX).toBeGreaterThanOrEqual(20);
  });

  it("conecta suportes até o topo na lateral posterior e desce acompanhando a gengiva na frente sem tocar dentes", async () => {
    // Modelo com parede traseira alta livre de dentes (X=0 a 10, Y=0, Z=0 a 14)
    // e dentes/gengiva na região anterior (X=20 a 30, Y=0 a 10, Z=8 a 15)
    const tris: number[] = [
      // Base plana
      0, 0, 0, 30, 0, 0, 30, 20, 0,
      0, 0, 0, 30, 20, 0, 0, 20, 0,
      // Parede lateral posterior alta (X de 0 a 10, Z até 12)
      0, 0, 0, 10, 0, 0, 10, -1, 12,
      0, 0, 0, 10, -1, 12, 0, -1, 12,
      // Parede lateral anterior (X de 20 a 30, Z até 7)
      20, 0, 0, 30, 0, 0, 30, -1, 7,
      20, 0, 0, 30, -1, 7, 20, -1, 7,
      // Dentes / gengiva na região anterior (apenas em X >= 18, voltados para cima norm.nz > 0.5, Z de 8 a 15)
      18, 0, 8, 30, 0, 8, 25, 10, 15,
    ];

    const pos = new Float32Array(tris);
    const elevationZ = 5.0;
    const result = await generateDentalSupports(pos, { elevationZ });

    const lateralPillars = result.pillars.filter((p) => p.isLateral || p.targetX !== undefined);
    expect(lateralPillars.length).toBeGreaterThan(0);

    // Suportes na região posterior (X <= 10) devem subir alto na parede
    const posteriorPillars = lateralPillars.filter((p) => (p.targetX ?? p.x) <= 12);
    expect(posteriorPillars.length).toBeGreaterThan(0);
    const maxPosteriorZ = Math.max(...posteriorPillars.map((p) => p.zContact));
    expect(maxPosteriorZ).toBeGreaterThan(elevationZ + 6.0);

    // Suportes na região anterior (X >= 20, onde há dentes/gengiva em Z=8 + 5 = 13)
    // NUNCA podem tocar na gengiva ou dentes (ficam com teto seguro)
    const anteriorPillars = lateralPillars.filter((p) => (p.targetX ?? p.x) >= 18);
    for (const p of anteriorPillars) {
      // Gengiva começa em Z = 8.0 + elevationZ = 13.0
      // Suportes descem e respeitam a margem de segurança cervical
      expect(p.zContact).toBeLessThan(elevationZ + 8.0);
    }
  });
});
