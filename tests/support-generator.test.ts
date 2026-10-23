import { describe, it, expect } from "vitest";
import {
  generateDentalSupports,
  sampleSupportGeometry,
  minSupportClearance,
  DEFAULT_DENTAL_SUPPORT_CONFIG,
  DENTAL_SUPPORT_PROFILES,
  DENTAL_SUPPORT_CATEGORIES,
} from "../src/lib/support-generator";
import { buildRaftMesh } from "../src/lib/support-base";
import { parseStlTriangles } from "../src/lib/plate-nesting";

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

// Perímetro retangular fechado (4 paredes laterais) para validar cobertura completa.
function createPerimeterModel(w = 40, d = 30, h = 8, ox = 0, oy = 0): Float32Array {
  const x0 = ox, y0 = oy, x1 = ox + w, y1 = oy + d;
  return new Float32Array([
    x0, y0, 0, x1, y0, 0, x1, y1, 0,
    x0, y0, 0, x1, y1, 0, x0, y1, 0,
    x0, y0, 0, x1, y0, 0, x1, y0, h,
    x0, y0, 0, x1, y0, h, x0, y0, h,
    x0, y1, 0, x1, y1, 0, x1, y1, h,
    x0, y1, 0, x1, y1, h, x0, y1, h,
    x0, y0, 0, x0, y1, 0, x0, y1, h,
    x0, y0, 0, x0, y1, h, x0, y0, h,
    x1, y0, 0, x1, y1, 0, x1, y1, h,
    x1, y0, 0, x1, y1, h, x1, y0, h,
  ]);
}

function addBox(
  tris: number[],
  x0: number, x1: number,
  y0: number, y1: number,
  z0: number, z1: number
): void {
  const quad = (
    a: [number, number, number], b: [number, number, number],
    c: [number, number, number], d: [number, number, number]
  ) => tris.push(...a, ...b, ...c, ...a, ...c, ...d);

  quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
  quad([x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1]);
  quad([x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1]);
  quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]);
  quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
  quad([x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [x0, y0, z0]);
}

// Modelo com reentrância interna: o vão x=10..30, y=0..12 é aberto na frente
// e embaixo, mas tem teto em z=8. Suportes sob esse teto ficam dentro do
// envelope do modelo.
function createNotchedModel(): Float32Array {
  const tris: number[] = [];
  addBox(tris, 0, 10, 0, 12, 0, 8);
  addBox(tris, 30, 40, 0, 12, 0, 8);
  addBox(tris, 0, 40, 12, 20, 0, 8);
  addBox(tris, 0, 40, 0, 20, 8, 12);
  return new Float32Array(tris);
}

// Parede fechada com uma prateleira saliente em z=6..6.5, y=-1..0. Um suporte
// lateral na parede acima da prateleira teria o braço atravessando a prateleira.
function createShelfWallModel(): Float32Array {
  const tris: number[] = [];
  addBox(tris, 0, 30, 0, 3, 0, 16);
  addBox(tris, 5, 25, -1, 0, 6, 6.5);
  return new Float32Array(tris);
}

describe("SupportGenerator (Motor de Suportes Odontológicos de Alta Precisão)", () => {
  it("tem as medidas padrão corretas de suporte médio anti-falhas e anti-fusão", () => {
    expect(DEFAULT_DENTAL_SUPPORT_CONFIG.elevationZ).toBe(6.0);
    expect(DEFAULT_DENTAL_SUPPORT_CONFIG.pillarDiameter).toBe(1.20);
    expect(DEFAULT_DENTAL_SUPPORT_CONFIG.tipDiameter).toBe(0.70);
    expect(DEFAULT_DENTAL_SUPPORT_CONFIG.tipLength).toBe(3.00);
    expect(DEFAULT_DENTAL_SUPPORT_CONFIG.tipPenetration).toBe(0.30);
    expect(DEFAULT_DENTAL_SUPPORT_CONFIG.tipShape).toBe("SPHERE");
    expect(DEFAULT_DENTAL_SUPPORT_CONFIG.raftThickness).toBe(1.5);
    expect(DEFAULT_DENTAL_SUPPORT_CONFIG.raftSlopeDeg).toBe(30);
    expect(DEFAULT_DENTAL_SUPPORT_CONFIG.supportSpacing).toBe(2.6);
    // Receita "Column Support-Medium" do Halot Box:
    expect(DEFAULT_DENTAL_SUPPORT_CONFIG.tipUpperDiameter).toBe(0.60);
    expect(DEFAULT_DENTAL_SUPPORT_CONFIG.tipLength).toBe(3.00);
    expect(DEFAULT_DENTAL_SUPPORT_CONFIG.pillarDiameter).toBe(1.20);
    expect(DEFAULT_DENTAL_SUPPORT_CONFIG.minSupportGap).toBe(0.40);
    expect(DEFAULT_DENTAL_SUPPORT_CONFIG.minPillarDistance).toBe(1.70);
    expect(DEFAULT_DENTAL_SUPPORT_CONFIG.modelClearance).toBeGreaterThanOrEqual(0.7);
  });

  it("disponibiliza perfis predefinidos calibrados (Fino, Médio e Grosso)", () => {
    expect(DENTAL_SUPPORT_PROFILES.FINE).toBeDefined();
    expect(DENTAL_SUPPORT_PROFILES.MEDIUM).toBeDefined();
    expect(DENTAL_SUPPORT_PROFILES.HEAVY).toBeDefined();

    expect(DENTAL_SUPPORT_PROFILES.FINE.config.pillarDiameter).toBe(1.0);
    expect(DENTAL_SUPPORT_PROFILES.MEDIUM.config.pillarDiameter).toBe(1.20);
    expect(DENTAL_SUPPORT_PROFILES.MEDIUM.config.tipDiameter).toBe(0.70);
    expect(DENTAL_SUPPORT_PROFILES.MEDIUM.config.tipLength).toBe(3.00);
    expect(DENTAL_SUPPORT_PROFILES.MEDIUM.config.tipPenetration).toBe(0.30);
    expect(DENTAL_SUPPORT_PROFILES.MEDIUM.config.tipShape).toBe("SPHERE");
    expect(DENTAL_SUPPORT_PROFILES.MEDIUM.config.supportDensityPercent).toBe(75);
    expect(DENTAL_SUPPORT_PROFILES.MEDIUM.config.supportAngleDeg).toBe(60);
    expect(DENTAL_SUPPORT_PROFILES.FINE.config.supportDensityPercent).toBe(80);
    expect(DENTAL_SUPPORT_PROFILES.FINE.config.supportAngleDeg).toBe(55);
    expect(DENTAL_SUPPORT_PROFILES.HEAVY.config.supportDensityPercent).toBe(70);
    expect(DENTAL_SUPPORT_PROFILES.HEAVY.config.supportAngleDeg).toBe(65);
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

  it("gera suportes, base contínua e buffer STL binário válido", async () => {
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

  it("gera cobertura lateral expressiva no perímetro do zócalo", async () => {
    // Modelo com perímetro retangular de 40mm x 30mm com paredes laterais
    const tris: number[] = [
      // Base inferior (Z=0)
      0, 0, 0, 40, 0, 0, 40, 30, 0,
      0, 0, 0, 40, 30, 0, 0, 30, 0,
      // Parede lateral frontal (Y=0, Z=0..8)
      0, 0, 0, 40, 0, 0, 40, 0, 8,
      0, 0, 0, 40, 0, 8, 0, 0, 8,
      // Parede lateral traseira (Y=30, Z=0..8)
      0, 30, 0, 40, 30, 0, 40, 30, 8,
      0, 30, 0, 40, 30, 8, 0, 30, 8,
      // Parede lateral esquerda (X=0, Z=0..8)
      0, 0, 0, 0, 30, 0, 0, 30, 8,
      0, 0, 0, 0, 30, 8, 0, 0, 8,
      // Parede lateral direita (X=40, Z=0..8)
      40, 0, 0, 40, 30, 0, 40, 30, 8,
      40, 0, 0, 40, 30, 8, 40, 0, 8,
    ];
    const pos = new Float32Array(tris);
    const result = await generateDentalSupports(pos, { elevationZ: 5.0 });

    const lateralPillars = result.pillars.filter((p) => p.isLateral || p.targetX !== undefined);

    // Deve gerar boa quantidade de suportes no perímetro, sem paliçada densa
    expect(lateralPillars.length).toBeGreaterThanOrEqual(30);

    // Deve ter suportes nas 4 paredes (X mín/máx e Y mín/máx)
    const xs = lateralPillars.map((p) => p.x);
    const ys = lateralPillars.map((p) => p.y);
    expect(Math.min(...xs)).toBeLessThan(5);
    expect(Math.max(...xs)).toBeGreaterThan(35);
    expect(Math.min(...ys)).toBeLessThan(5);
    expect(Math.max(...ys)).toBeGreaterThan(25);
  });

  it("garante que suportes nas laterais do zócalo sobem até a metade do modelo e respeitam oclusal", async () => {
    // Modelo com 20mm de altura total (Z de 0 a 20)
    // Parede lateral do zócalo vai de Z=0 a Z=12
    // Dentes/gengiva acima de Z=12 (Z=12 a 20)
    const tris: number[] = [
      // Base
      0, 0, 0, 30, 0, 0, 30, 20, 0,
      0, 0, 0, 30, 20, 0, 0, 20, 0,
      // Parede lateral vestibular (Y=0, Z vai de 0 a 12 com leve inclinação externa)
      0, 0, 0, 30, 0, 0, 30, -0.5, 12,
      0, 0, 0, 30, -0.5, 12, 0, -0.5, 12,
      // Parede lateral oposta
      0, 20, 0, 30, 20, 0, 30, 20.5, 12,
      0, 20, 0, 30, 20.5, 12, 0, 20.5, 12,
      // Dentes / topo oclusal voltados para cima (Z de 12 a 20, norm.nz > 0.40)
      0, 0, 12, 30, 0, 12, 15, 10, 20,
      0, 20, 12, 15, 10, 20, 30, 20, 12,
    ];
    const pos = new Float32Array(tris);
    const elevationZ = 5.0;
    const modelH = 20.0;
    const result = await generateDentalSupports(pos, { elevationZ });

    const lateralPillars = result.pillars.filter((p) => p.isLateral || p.targetX !== undefined);
    expect(lateralPillars.length).toBeGreaterThan(0);

    // Deve subir até a metade do modelo (modelH * 0.50 = 10mm -> cota Z = 5 + 10 = 15mm)
    const maxLateralZ = Math.max(...lateralPillars.map((p) => p.zContact));
    expect(maxLateralZ).toBeGreaterThanOrEqual(elevationZ + modelH * 0.50);

    // NUNCA pode atingir dentes ou oclusal (dentes começam em 12 + 5 = 17mm)
    for (const p of lateralPillars) {
      expect(p.zContact).toBeLessThan(elevationZ + 12.0);
    }
  });

  it("gera suportes laterais mesmo em modelos com normais invertidas e sem interpenetracao de hastes", async () => {
    // Modelo com paredes laterais cujos triângulos têm ordem horária (normais apontando para dentro)
    const tris: number[] = [
      // Base plana
      0, 0, 0, 30, 20, 0, 30, 0, 0,
      0, 0, 0, 0, 20, 0, 30, 20, 0,
      // Parede lateral invertida (sentido horário)
      0, 0, 0, 30, -0.5, 12, 30, 0, 0,
      0, 0, 0, 0, -0.5, 12, 30, -0.5, 12,
      // Parede oposta
      0, 20, 0, 30, 20, 0, 30, 20.5, 12,
      0, 20, 0, 30, 20.5, 12, 0, 20.5, 12,
    ];
    const pos = new Float32Array(tris);
    const result = await generateDentalSupports(pos, { elevationZ: 5.0 });

    const lateralPillars = result.pillars.filter((p) => p.isLateral || p.targetX !== undefined);
    // Deve conter suportes laterais mesmo com normal invertida
    expect(lateralPillars.length).toBeGreaterThan(0);

    // Valida que NENHUM par de pilares tem distância menor que 1.65mm (haste 1.20mm -> folga de ar >= 0.45mm sem fusão)
    for (let i = 0; i < result.pillars.length; i++) {
      for (let j = i + 1; j < result.pillars.length; j++) {
        const p1 = result.pillars[i];
        const p2 = result.pillars[j];
        const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        expect(d).toBeGreaterThanOrEqual(1.64);
      }
    }
  });

  it("não coloca suportes dentro de reentrância interna do modelo", async () => {
    const result = await generateDentalSupports(createNotchedModel(), {
      elevationZ: 6.0,
    });

    expect(result.pillarCount).toBeGreaterThan(0);

    const insideNotch = result.pillars.filter((p) => {
      if (p.x <= 10 || p.x >= 30 || p.y >= 12) return false;
      const rawZ = p.zContact - 6.0;
      return p.isLateral ? rawZ < 8.0 : rawZ > 7.5 && rawZ < 8.5;
    });
    expect(insideNotch).toHaveLength(0);

    // Ainda deve apoiar a base externa fora da reentrância.
    expect(
      result.pillars.some(
        (p) =>
          !p.isLateral &&
          (p.x < 10 || p.x > 30 || p.y > 12) &&
          p.zContact < 7.0
      )
    ).toBe(true);
  });

  it("rejeita braços laterais que atravessam uma prateleira do modelo", async () => {
    const result = await generateDentalSupports(createShelfWallModel(), {
      elevationZ: 6.0,
      minPillarDistance: 0.1,
      minSupportGap: 0.01,
    });

    const wallSupportsAboveShelf = result.pillars.filter((p) => {
      if (!p.isLateral) return false;
      const tx = p.targetX ?? p.x;
      const ty = p.targetY ?? p.y;
      return tx > 5 && tx < 25 && Math.abs(ty) < 0.3 && p.zContact > 13.5;
    });
    expect(wallSupportsAboveShelf).toHaveLength(0);

    // A prateleira em si continua recebendo suporte pela borda externa.
    expect(
      result.pillars.some(
        (p) => p.isLateral && Math.abs((p.targetY ?? p.y) + 1) < 0.1
      )
    ).toBe(true);
  });

  it("gera suportes com ponta esférica de 0.70mm, profundidade 0.30mm, topo 3.00mm e haste 1.20mm sem fusão", async () => {
    const positions = createSampleModelPositions();
    const result = await generateDentalSupports(positions, {
      tipShape: "SPHERE",
      tipDiameter: 0.70,
      tipPenetration: 0.30,
      tipLength: 3.00,
      pillarDiameter: 1.20,
      minPillarDistance: 1.70,
    });

    expect(result.pillarCount).toBeGreaterThan(0);
    // Cada pilar tem ponta esférica gerando triângulos adicionais
    expect(result.supportTriangles).toBeGreaterThan(100);

    // Valida que todas as distâncias entre pilares respeitam a proteção anti-fusão
    for (let i = 0; i < result.pillars.length; i++) {
      for (let j = i + 1; j < result.pillars.length; j++) {
        const p1 = result.pillars[i];
        const p2 = result.pillars[j];
        const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        // Distância centro-a-centro >= 1.65mm garante vão livre de ar de pelo menos 0.45mm para hastes de 1.20mm
        expect(dist).toBeGreaterThanOrEqual(1.64);
      }
    }
  });

  it("gera base contínua com topo alto, rampa de espátula e pés apoiados", async () => {
    const raftThickness = 1.5;
    const positions = createSampleModelPositions();
    const result = await generateDentalSupports(positions, { raftThickness });
    expect(result.pillarCount).toBeGreaterThan(0);

    // A base é única e contínua, com topo plano em raftThickness e perímetro
    // descendo a 30° até a chapa (rampa de espátula).
    expect(result.base).toBeDefined();
    expect(result.base.height).toBeCloseTo(raftThickness, 5);
    expect(result.baseHeight).toBeCloseTo(raftThickness, 5);
    expect(result.base.chamfer).toBeCloseTo(raftThickness / Math.tan(Math.PI / 6), 5);
    expect(result.base.triangles).toBeGreaterThan(0);
    expect(result.base.volumeMl).toBeGreaterThan(0);
    expect(result.base.loops.length).toBeGreaterThan(0);
    expect(result.base.topBounds).not.toBeNull();
    expect(result.base.bottomBounds).not.toBeNull();

    // Todos os pés nascem no topo da base, nunca no fundo da chapa.
    const footR = Math.max(0.2, DEFAULT_DENTAL_SUPPORT_CONFIG.baseDiameter / 2,
      DEFAULT_DENTAL_SUPPORT_CONFIG.pillarDiameter / 2 + 0.02);
    for (const p of result.pillars) {
      expect(p.zBase).toBeCloseTo(result.baseHeight, 5);
      expect(p.zBase).toBeGreaterThan(0.4);
      expect(p.zBase).toBeLessThan(DEFAULT_DENTAL_SUPPORT_CONFIG.elevationZ);
      // O topo da base cobre todo o disco do pé cônico.
      expect(p.x - footR).toBeGreaterThanOrEqual((result.base.topBounds?.minX ?? 0) - 1e-6);
      expect(p.x + footR).toBeLessThanOrEqual((result.base.topBounds?.maxX ?? 0) + 1e-6);
      expect(p.y - footR).toBeGreaterThanOrEqual((result.base.topBounds?.minY ?? 0) - 1e-6);
      expect(p.y + footR).toBeLessThanOrEqual((result.base.topBounds?.maxY ?? 0) + 1e-6);
    }

    // O fundo é mais largo que o topo por causa do chanfro, mas continua
    // próximo do modelo (margem da base + pé), sem explodir a caixa.
    const top = result.base.topBounds!;
    const bottom = result.base.bottomBounds!;
    expect(top.maxX - top.minX).toBeGreaterThanOrEqual(30);
    expect(top.maxY - top.minY).toBeGreaterThanOrEqual(30);
    expect(bottom.minX).toBeLessThanOrEqual(top.minX);
    expect(bottom.maxX).toBeGreaterThanOrEqual(top.maxX);
    expect(bottom.minY).toBeLessThanOrEqual(top.minY);
    expect(bottom.maxY).toBeGreaterThanOrEqual(top.maxY);
    expect(top.maxX - top.minX).toBeLessThan(30 + 2 * (footR + 2 + 3));
    expect(top.maxY - top.minY).toBeLessThan(30 + 2 * (footR + 2 + 3));
  });

  it("constrói base manifold em pegada côncava e limitada pela chapa", () => {
    // Pegada em L: (0,0)-(20,0)-(20,8)-(8,8)-(8,20)-(0,20).
    // A projeção usa apenas XY; não é necessário um STL fechado aqui.
    const lFootprint = new Float32Array([
      0, 0, 0, 20, 0, 0, 20, 8, 0,
      0, 0, 0, 20, 8, 0, 8, 8, 0,
      0, 20, 0, 0, 0, 0, 8, 8, 0,
      8, 8, 0, 8, 20, 0, 0, 20, 0,
    ]);
    const raft = buildRaftMesh(lFootprint, [{ x: 4, y: 4 }, { x: 4, y: 15 }], {
      topZ: 1.5,
      margin: 2.0,
      slopeDeg: 30,
      supportFootRadius: 0.8,
      plateWidth: 60,
      plateDepth: 60,
      cellSize: 1.0,
    });

    expect(raft.loops.length).toBeGreaterThan(0);
    expect(raft.triangleCount).toBeGreaterThan(0);
    expect(raft.topBounds).not.toBeNull();
    expect(raft.bottomBounds).not.toBeNull();
    expect(raft.topBounds!.minX).toBeGreaterThanOrEqual(-1e-6);
    expect(raft.topBounds!.minY).toBeGreaterThanOrEqual(-1e-6);
    expect(raft.bottomBounds!.minX).toBeGreaterThanOrEqual(-1e-6);
    expect(raft.bottomBounds!.minY).toBeGreaterThanOrEqual(-1e-6);
    expect(raft.bottomBounds!.maxX).toBeLessThanOrEqual(60 + 1e-6);
    expect(raft.bottomBounds!.maxY).toBeLessThanOrEqual(60 + 1e-6);

    const key = (x: number, y: number, z: number) =>
      `${Math.round(x * 1e4)}_${Math.round(y * 1e4)}_${Math.round(z * 1e4)}`;
    const edges = new Map<string, number>();
    for (let i = 0; i < raft.coords.length; i += 9) {
      const a = key(raft.coords[i], raft.coords[i + 1], raft.coords[i + 2]);
      const b = key(raft.coords[i + 3], raft.coords[i + 4], raft.coords[i + 5]);
      const c = key(raft.coords[i + 6], raft.coords[i + 7], raft.coords[i + 8]);
      for (const [u, v] of [[a, b], [b, c], [c, a]] as const) {
        const edge = u < v ? `${u}|${v}` : `${v}|${u}`;
        edges.set(edge, (edges.get(edge) ?? 0) + 1);
      }
    }
    expect(Array.from(edges.values()).filter((n) => n !== 2)).toEqual([]);
  });

  it("gera a rampa da base a 30° e mantém o fundo na chapa", async () => {
    const positions = createSampleModelPositions();
    const result = await generateDentalSupports(positions, { elevationZ: 6.0 });
    const view = new DataView(result.stlBuffer);
    const total = view.getUint32(80, true);
    let ramps = 0;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let t = 0; t < total; t++) {
      const off = 84 + t * 50;
      const zs = [0, 1, 2].map((k) => view.getFloat32(off + 20 + k * 12, true));
      const nx = view.getFloat32(off, true);
      const ny = view.getFloat32(off + 4, true);
      const nz = view.getFloat32(off + 8, true);
      minZ = Math.min(minZ, ...zs);
      maxZ = Math.max(maxZ, ...zs);
      if (Math.min(...zs) > 1e-3 || Math.max(...zs) < result.baseHeight - 1e-3) continue;
      const slope = (Math.atan2(Math.hypot(nx, ny), Math.abs(nz)) * 180) / Math.PI;
      if (Math.abs(slope - 30) < 0.5) ramps++;
    }
    expect(ramps).toBeGreaterThan(0);
    expect(minZ).toBeCloseTo(0, 3);
    expect(maxZ).toBeCloseTo(result.bounds.maxZ, 3);
  });

  it("calcula bounding box real do conjunto com base contínua", async () => {
    const positions = createSampleModelPositions();
    const result = await generateDentalSupports(positions, { raftThickness: 1.0 });

    // O modelo original tem 30x30mm em X e Y; a base pode se estender além
    // do footprint, mas a caixa precisa começar na chapa (Z=0).
    expect(result.bounds.width).toBeGreaterThanOrEqual(30.0);
    expect(result.bounds.depth).toBeGreaterThanOrEqual(30.0);
    expect(result.bounds.minZ).toBe(0);
    expect(result.bounds.height).toBe(result.bounds.maxZ);
  });

  it("mantém folga 3D real entre todos os suportes, sem fusão de hastes/braços", async () => {
    const positions = createSampleModelPositions();
    const cfg = { ...DEFAULT_DENTAL_SUPPORT_CONFIG };
    const result = await generateDentalSupports(positions, cfg);

    expect(result.pillarCount).toBeGreaterThan(0);
    const gap = cfg.minSupportGap ?? 0.40;
    const samples = result.pillars.map((p) => sampleSupportGeometry(p, cfg));

    for (let i = 0; i < samples.length; i++) {
      for (let j = i + 1; j < samples.length; j++) {
        expect(minSupportClearance(samples[i], samples[j])).toBeGreaterThanOrEqual(gap - 0.001);
      }
    }
  });

  it("gera anel lateral em todos os perfis (Fino, Médio e Grosso)", async () => {
    const positions = createPerimeterModel(40, 30, 10);
    for (const id of ["FINE", "MEDIUM", "HEAVY"] as const) {
      const result = await generateDentalSupports(positions, {
        ...DENTAL_SUPPORT_PROFILES[id].config,
      });
      const lateral = result.pillars.filter((p) => p.isLateral);
      expect(lateral.length, `perfil ${id} sem suportes laterais`).toBeGreaterThan(0);
    }
  });

  it("gera malha fechada e manifold (cada aresta compartilhada por 2 triângulos)", async () => {
    // Caixa fechada 20x20x10 mm: base + 4 paredes + topo.
    const w = 20, d = 20, h = 10;
    const box = new Float32Array([
      // base (Z=0, normal -Z)
      0, 0, 0, 0, d, 0, w, d, 0,
      0, 0, 0, w, d, 0, w, 0, 0,
      // topo (Z=h, normal +Z)
      0, 0, h, w, d, h, 0, d, h,
      0, 0, h, w, 0, h, w, d, h,
      // parede Y=0
      0, 0, 0, w, 0, h, w, 0, 0,
      0, 0, 0, 0, 0, h, w, 0, h,
      // parede Y=d
      0, d, 0, w, d, 0, w, d, h,
      0, d, 0, w, d, h, 0, d, h,
      // parede X=0
      0, 0, 0, 0, d, 0, 0, d, h,
      0, 0, 0, 0, d, h, 0, 0, h,
      // parede X=w
      w, 0, 0, w, 0, h, w, d, h,
      w, 0, 0, w, d, h, w, d, 0,
    ]);
    const result = await generateDentalSupports(box, { elevationZ: 6.0 });
    expect(result.pillarCount).toBeGreaterThan(0);

    const parsed = await parseStlTriangles(result.stlBuffer);
    const pos = parsed.positions;
    const key = (x: number, y: number, z: number) =>
      `${Math.round(x * 1e4)}_${Math.round(y * 1e4)}_${Math.round(z * 1e4)}`;
    const edges = new Map<string, number>();
    for (let t = 0; t < pos.length; t += 9) {
      const a = key(pos[t], pos[t + 1], pos[t + 2]);
      const b = key(pos[t + 3], pos[t + 4], pos[t + 5]);
      const c = key(pos[t + 6], pos[t + 7], pos[t + 8]);
      for (const [u, v] of [[a, b], [b, c], [c, a]] as const) {
        const edge = u < v ? `${u}|${v}` : `${v}|${u}`;
        edges.set(edge, (edges.get(edge) ?? 0) + 1);
      }
    }
    const openEdges = Array.from(edges.values()).filter((n) => n !== 2);
    expect(openEdges.length).toBe(0);
  });

  it("mantém o conjunto dentro da chapa quando há margem disponível", async () => {
    const plateW = 60;
    const plateD = 50;
    const cfg = {
      ...DEFAULT_DENTAL_SUPPORT_CONFIG,
      plateWidth: plateW,
      plateDepth: plateD,
    };
    const result = await generateDentalSupports(createSampleModelPositions(), cfg);

    expect(result.pillarCount).toBeGreaterThan(0);
    // A chapa é validada pela pegada total (largura/profundidade), não pela
    // coordenada absoluta: o Halot Box centraliza o conjunto ao importar.
    expect(result.bounds.width).toBeLessThanOrEqual(plateW);
    expect(result.bounds.depth).toBeLessThanOrEqual(plateD);
  });

  it("não deixa nenhuma das quatro laterais sem suporte e cabe na chapa", async () => {
    // Mesa real: o modelo fica com a margem da chapa (3,5 mm) ao redor, e a
    // base/suportes precisam caber na área de impressão (sem reescala).
    const offset = 3.5;
    const model = createPerimeterModel(40, 30, 8, offset, offset);
    const result = await generateDentalSupports(model, {
      elevationZ: 5.0,
      plateWidth: 192,
      plateDepth: 120,
      plateHeight: 200,
    });

    const lateral = result.pillars.filter((p) => p.isLateral);
    const walls = { front: 0, back: 0, left: 0, right: 0 };
    for (const p of lateral) {
      const x = p.targetX ?? p.x;
      const y = p.targetY ?? p.y;
      if (y < offset + 1) walls.front++;
      else if (y > offset + 29) walls.back++;
      else if (x < offset + 1) walls.left++;
      else if (x > offset + 39) walls.right++;
    }

    expect(walls.front).toBeGreaterThanOrEqual(5);
    expect(walls.back).toBeGreaterThanOrEqual(5);
    expect(walls.left).toBeGreaterThanOrEqual(5);
    expect(walls.right).toBeGreaterThanOrEqual(5);

    // O conjunto tem que caber 1:1 na chapa: se ultrapassar, o fatiador reescala.
    expect(result.bounds.width).toBeLessThanOrEqual(192);
    expect(result.bounds.depth).toBeLessThanOrEqual(120);
    expect(result.bounds.height).toBeLessThanOrEqual(200);
    expect(result.base.bottomBounds).not.toBeNull();
    expect(result.base.bottomBounds!.minX).toBeGreaterThanOrEqual(-1e-6);
    expect(result.base.bottomBounds!.minY).toBeGreaterThanOrEqual(-1e-6);
    expect(result.base.bottomBounds!.maxX).toBeLessThanOrEqual(192 + 1e-6);
    expect(result.base.bottomBounds!.maxY).toBeLessThanOrEqual(120 + 1e-6);
  });

  it("mantém a profundidade de contato em 0,30 mm (a ponta não entra demais no modelo)", async () => {
    // Parede vertical em X=0 com o modelo do lado +X (normal externa -X).
    const wall: number[] = [
      0, 0, 0, 0, 0, 10, 0, 20, 10,
      0, 0, 0, 0, 20, 10, 0, 20, 0,
    ];
    const result = await generateDentalSupports(new Float32Array(wall), { elevationZ: 5.0 });

    const view = new DataView(result.stlBuffer);
    const total = view.getUint32(80, true);
    let deepest = -Infinity;
    for (let t = 2; t < total; t++) {
      const off = 84 + t * 50;
      for (let k = 0; k < 3; k++) {
        const x = view.getFloat32(off + 12 + k * 12, true);
        const z = view.getFloat32(off + 20 + k * 12, true);
        // ignora a base (z <= 1): mede só a ponta de contato
        if (z > 1.5 && x > deepest) deepest = x;
      }
    }
    // A esfera (raio 0,35) fica 0,05 mm fora da parede => penetra 0,30 mm
    expect(deepest).toBeCloseTo(0.30, 2);
  });

  it("cria suportes de fundo mesmo com a malha de sentido (winding) invertido", async () => {
    // Caixa 60 × 30 × 12 com a face de baixo com winding invertido (normal +Z).
    // Antes o gerador ignorava essa face e o modelo ficava SEM NENHUM apoio
    // embaixo: a base saía ondulada/torta na impressão.
    const w = 60, d = 30, h = 12;
    const x0 = 3.5, y0 = 3.5, x1 = x0 + w, y1 = y0 + d;
    const pos = new Float32Array([
      // base com winding invertido (normal +Z)
      x0, y0, 0, x1, y0, 0, x1, y1, 0,
      x0, y0, 0, x1, y1, 0, x0, y1, 0,
      // laterais
      x0, y0, 0, x1, y0, 0, x1, y0, h,
      x0, y0, 0, x1, y0, h, x0, y0, h,
      x0, y1, 0, x1, y1, 0, x1, y1, h,
      x0, y1, 0, x1, y1, h, x0, y1, h,
      x1, y0, 0, x1, y1, 0, x1, y1, h,
      x1, y0, 0, x1, y1, h, x1, y0, h,
      // topo
      x0, y0, h, x1, y0, h, x1, y1, h,
      x0, y0, h, x1, y1, h, x0, y1, h,
    ]);

    const result = await generateDentalSupports(pos, {
      plateWidth: 192,
      plateDepth: 120,
      plateHeight: 200,
    });

    const bottom = result.pillars.filter((p) => !p.isLateral);
    expect(bottom.length).toBeGreaterThan(50);

    // Todos os suportes de fundo tocam a base do modelo (na altura dele)
    const modelBaseZ = DEFAULT_DENTAL_SUPPORT_CONFIG.elevationZ;
    for (const p of bottom) {
      expect(p.zContact).toBeCloseTo(modelBaseZ, 2);
    }

    // Malha de apoio densa: distância média entre apoios menor que 3,5 mm
    let minGap = Infinity;
    for (let i = 0; i < bottom.length; i++) {
      for (let j = i + 1; j < bottom.length; j++) {
        const d = Math.hypot(bottom[i].x - bottom[j].x, bottom[i].y - bottom[j].y);
        if (d < minGap) minGap = d;
      }
    }
    expect(minGap).toBeLessThan(3.5);
  });

  it("mantém a base do modelo perto da plataforma (apoio curto e rígido)", async () => {
    // Quanto menor a elevação, menos "ponte" a base precisa fazer:
    // é o que evita a deformação/ondulação no fundo impresso.
    const w = 40, d = 30, h = 12;
    const pos = new Float32Array([
      0, d, 0, w, d, 0, w, 0, 0, 0, d, 0, w, 0, 0, 0, 0, 0,
      0, 0, 0, w, 0, 0, w, 0, h, 0, 0, 0, w, 0, h, 0, 0, h,
      0, d, 0, w, d, 0, w, d, h, 0, d, 0, w, d, h, 0, d, h,
      w, 0, 0, w, d, 0, w, d, h, w, 0, 0, w, d, h, w, 0, h,
      0, 0, h, w, 0, h, w, d, h, 0, 0, h, w, d, h, 0, d, h,
    ]);
    const result = await generateDentalSupports(pos, { elevationZ: 3.5, raftThickness: 1.5 });

    const bottom = result.pillars.filter((p) => !p.isLateral);
    expect(bottom.length).toBeGreaterThan(0);
    for (const p of bottom) {
      // pé apoiado no fundo (Z=0), topo do pé curto e ponta na base do modelo
      expect(p.zBase).toBeCloseTo(result.baseHeight, 5);
      expect(p.zBase).toBeLessThan(2.0);
      expect(p.zContact - p.zBase).toBeLessThanOrEqual(2.5);
    }
  });

  it("gera a coluna igual ao suporte Column do Halot Box (haste 1,20 + cone 3,00 -> 0,60 + esfera 0,70/0,30)", async () => {
    // Parede vertical em X=0 (modelo do lado +X, normal externa -X)
    const wall = new Float32Array([
      0, 0, 0, 0, 0, 10, 0, 20, 10,
      0, 0, 0, 0, 20, 10, 0, 20, 0,
    ]);
    const result = await generateDentalSupports(wall, { elevationZ: 6.0, raftThickness: 1.5 });
    const p = result.pillars[0];
    expect(p).toBeDefined();

    const tipRad = DEFAULT_DENTAL_SUPPORT_CONFIG.tipDiameter / 2;
    const offsetOut = tipRad - DEFAULT_DENTAL_SUPPORT_CONFIG.tipPenetration;
    const sCx = (p.targetX ?? p.x) - offsetOut; // normal externa -X
    const sCz = p.zContact;

    const hDist = Math.abs(sCx - p.x);
    const coneLen = Math.hypot(hDist, sCz - (p.zKnee ?? 0));
    const angleDeg = (Math.atan2(sCz - (p.zKnee ?? 0), hDist) * 180) / Math.PI;

    // Cone de comprimento fixo (Top Length 3,00 mm do Halot Box)
    expect(coneLen).toBeCloseTo(3.0, 1);
    // Ângulo com a plataforma próximo dos 60° configurados no Halot Box
    expect(angleDeg).toBeGreaterThan(55);
    expect(angleDeg).toBeLessThan(65);
    // A coluna é robusta (não é uma lâmina): a haste sobe até o joelho do cone
    expect((p.zKnee ?? 0) - p.zBase).toBeGreaterThan(0.5);
  });

  it("exporta o modelo em escala 1:1 (X/Y intactos, apenas deslocamento em Z)", async () => {
    const positions = createSampleModelPositions();
    const elevationZ = 5.0;
    const result = await generateDentalSupports(positions, { elevationZ });

    expect(result.modelBounds.width).toBeCloseTo(30, 3);
    expect(result.modelBounds.depth).toBeCloseTo(30, 3);
    expect(result.modelBounds.height).toBeCloseTo(12, 3);

    const exported = await parseStlTriangles(result.stlBuffer);
    const modelTriCount = Math.floor(positions.length / 9);
    const modelVerts = modelTriCount * 9;

    // O parser normaliza XY pelo canto global (inclui a base); comparação justa
    // é feita descontando essa translação rígida, sem qualquer escala.
    let inMinX = Infinity, inMinY = Infinity, exMinX = Infinity, exMinY = Infinity;
    for (let i = 0; i < modelVerts; i += 3) {
      inMinX = Math.min(inMinX, positions[i]);
      inMinY = Math.min(inMinY, positions[i + 1]);
      exMinX = Math.min(exMinX, exported.positions[i]);
      exMinY = Math.min(exMinY, exported.positions[i + 1]);
    }
    const shiftX = exMinX - inMinX;
    const shiftY = exMinY - inMinY;

    for (let i = 0; i < modelVerts; i += 3) {
      expect(exported.positions[i]).toBeCloseTo(positions[i] + shiftX, 3);
      expect(exported.positions[i + 1]).toBeCloseTo(positions[i + 1] + shiftY, 3);
      expect(exported.positions[i + 2]).toBeCloseTo(positions[i + 2] + elevationZ, 3);
    }
  });

  it("não coloca conectores dentro de modelos ocos (cavidade interna)", async () => {
    // Caixa oca aberta embaixo: casca externa, casca interna e teto sólido.
    // A cavidade é o vazio entre as duas cascas; nenhum pilar pode entrar nela.
    const x0 = 3.5, y0 = 3.5, w = 40, d = 30, h = 12, wall = 2.0;
    const x1 = x0 + w, y1 = y0 + d;
    const ix0 = x0 + wall, iy0 = y0 + wall, ix1 = x1 - wall, iy1 = y1 - wall;
    const iz = h - wall;
    const tris: number[] = [];
    const quad = (
      ax: number, ay: number, az: number,
      bx: number, by: number, bz: number,
      cx: number, cy: number, cz: number,
      dx: number, dy: number, dz: number
    ) => {
      tris.push(ax, ay, az, bx, by, bz, cx, cy, cz);
      tris.push(ax, ay, az, cx, cy, cz, dx, dy, dz);
    };

    // Casca externa (normais para fora) + tampa superior
    quad(x0, y0, 0, x1, y0, 0, x1, y0, h, x0, y0, h);
    quad(x1, y1, 0, x0, y1, 0, x0, y1, h, x1, y1, h);
    quad(x0, y1, 0, x0, y0, 0, x0, y0, h, x0, y1, h);
    quad(x1, y0, 0, x1, y1, 0, x1, y1, h, x1, y0, h);
    quad(x0, y0, h, x1, y0, h, x1, y1, h, x0, y1, h);

    // Casca interna (normais para dentro da cavidade, aberta embaixo) + teto
    quad(ix0, iy0, 0, ix0, iy0, iz, ix1, iy0, iz, ix1, iy0, 0);
    quad(ix1, iy1, 0, ix1, iy1, iz, ix0, iy1, iz, ix0, iy1, 0);
    quad(ix0, iy1, 0, ix0, iy1, iz, ix0, iy0, iz, ix0, iy0, 0);
    quad(ix1, iy0, 0, ix1, iy0, iz, ix1, iy1, iz, ix1, iy1, 0);
    quad(ix0, iy0, iz, ix0, iy1, iz, ix1, iy1, iz, ix1, iy0, iz);

    const elevationZ = 6.0;
    const result = await generateDentalSupports(new Float32Array(tris), {
      elevationZ,
      plateWidth: 192,
      plateDepth: 120,
      plateHeight: 200,
    });

    const lateral = result.pillars.filter((p) => p.isLateral);
    expect(lateral.length).toBeGreaterThan(10);

    const insideCavity = (x: number, y: number, z: number): boolean => {
      const modelZ = z - elevationZ;
      return (
        x > ix0 + 0.05 && x < ix1 - 0.05 &&
        y > iy0 + 0.05 && y < iy1 - 0.05 &&
        modelZ > 0.05 && modelZ < iz - 0.05
      );
    };

    for (const p of result.pillars) {
      expect(insideCavity(p.x, p.y, p.zContact)).toBe(false);
      if (p.targetX !== undefined && p.targetY !== undefined) {
        expect(insideCavity(p.targetX, p.targetY, p.zContact)).toBe(false);
      }
    }
  });
});
