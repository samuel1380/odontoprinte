/**
 * OdontoPrint — Configuração do Motor de Suportes (v2)
 *
 * Os valores padrão refletem o perfil "Column Support-Medium" do Halot Box:
 * elevação 6,0 mm, haste 1,20 mm, cone superior 3,00 mm (0,60 mm no topo),
 * esfera de contato 0,70 mm com 0,30 mm de penetração, densidade 75% e
 * ângulo de suporte 60°.
 *
 * A base é contínua sob o modelo e os suportes: topo plano em `raftThickness`
 * e perímetro em rampa de espátula (30° por padrão) até a chapa.
 */

export interface DentalSupportConfig {
  /** Elevação Z do modelo em relação à chapa (mm). Padrão: 6,0 mm */
  elevationZ: number;
  /** Diâmetro do pilar cilíndrico (mm). Padrão: 1,20 mm (Lower Diameter) */
  pillarDiameter: number;
  /** Diâmetro da esfera de contato (mm). Padrão: 0,70 mm (Contact Sphere) */
  tipDiameter: number;
  /** Comprimento do topo cônico (mm). Padrão: 3,00 mm (Top Length) */
  tipLength: number;
  /** Profundidade de contato / penetração da esfera (mm). Padrão: 0,30 mm */
  tipPenetration: number;
  /** Forma do contato. O contato esférico é o padrão odontológico. */
  tipShape?: "CONE" | "SPHERE";
  /** Diâmetro do topo do cone (mm). Padrão: 0,60 mm (Upper Diameter) */
  tipUpperDiameter?: number;
  /** Diâmetro do pé cônico apoiado sobre a base contínua (mm). Padrão: 1,6 mm */
  baseDiameter: number;
  /** Altura do pé cônico sobre a base contínua (mm). Padrão: 0,8 mm */
  baseLength: number;
  /** Altura do topo da base contínua em relação à chapa (mm). Padrão: 0,9 mm (fina e flexível para espátula) */
  raftThickness: number;
  /** Margem da base além do modelo e dos pés dos suportes (mm). Padrão: 2,0 mm */
  raftMargin: number;
  /**
   * Inclinação da rampa de espátula da base em relação à chapa (graus).
   * Padrão: 35°. Rampa contínua que permite a entrada limpa da espátula.
   */
  raftSlopeDeg?: number;
  /** Espaçamento da malha de suportes a 75% de densidade (mm). Padrão: 2,6 mm */
  supportSpacing: number;
  /** Distância mínima entre centros de suportes (mm). Padrão: 1,70 mm */
  minPillarDistance: number;
  /** Folga mínima entre a haste e as paredes do modelo (mm). Padrão: 0,75 mm */
  modelClearance: number;
  /**
   * Espaçamento lateral legado. O motor v2 usa a mesma malha de densidade
   * para o anel lateral inferior; mantido para compatibilidade dos perfis.
   */
  lateralPillarSpacing?: number;
  /** Ângulo máximo de overhang que recebe suporte (graus). Padrão: 60° */
  supportAngleDeg?: number;
  /** Densidade da malha de suportes (%). Padrão: 75% */
  supportDensityPercent?: number;
  /** Ativa barras de travamento estrutural (cross-bracing) entre pilares vizinhos. */
  crossBracingEnabled?: boolean;
  /** Diâmetro das barras de travamento estrutural (mm). Padrão: 0,80 mm. */
  crossBraceDiameter?: number;
  /** Altura útil da chapa (mm). Usada para caber a elevação + modelo no volume. */
  plateHeight?: number;
  /** Folga de ar mínima entre as superfícies de dois suportes (mm). Padrão: 0,40 mm */
  minSupportGap?: number;
  /** Largura útil da chapa (mm). Quando informada, as bases são contidas na chapa. */
  plateWidth?: number;
  /** Profundidade útil da chapa (mm). Quando informada, as bases são contidas na chapa. */
  plateDepth?: number;
}

export const DEFAULT_DENTAL_SUPPORT_CONFIG: DentalSupportConfig = {
  elevationZ: 6.0,
  pillarDiameter: 1.20,
  tipDiameter: 0.70,
  tipLength: 3.00,
  tipPenetration: 0.30,
  tipShape: "SPHERE",
  tipUpperDiameter: 0.60,
  baseDiameter: 1.8,
  baseLength: 0.5,
  raftThickness: 1.5,
  raftMargin: 2.0,
  raftSlopeDeg: 30,
  supportSpacing: 2.6,
  minPillarDistance: 1.70,
  modelClearance: 0.75,
  lateralPillarSpacing: 1.45,
  supportAngleDeg: 60,
  supportDensityPercent: 75,
  minSupportGap: 0.40,
  crossBracingEnabled: true,
  crossBraceDiameter: 0.80,
};

export const DENTAL_SUPPORT_PROFILES = {
  MEDIUM: {
    id: "MEDIUM",
    name: "Médio",
    label: "Suporte Médio (Padrão Ouro)",
    badge: "Recomendado",
    description:
      "Réplica do Halot Box Column Support-Medium: ângulo a 60°, travamento estrutural entre pilares e base contínua com rampa de espátula a 30°.",
    config: {
      elevationZ: 6.0,
      pillarDiameter: 1.20,
      tipDiameter: 0.70,
      tipLength: 3.00,
      tipPenetration: 0.30,
      tipShape: "SPHERE" as const,
      tipUpperDiameter: 0.60,
      baseDiameter: 1.8,
      baseLength: 0.5,
      raftThickness: 1.5,
      raftMargin: 2.0,
      raftSlopeDeg: 30,
      supportSpacing: 2.6,
      minPillarDistance: 1.70,
      modelClearance: 0.75,
      lateralPillarSpacing: 1.45,
      supportAngleDeg: 60,
      supportDensityPercent: 75,
      minSupportGap: 0.40,
      crossBracingEnabled: true,
      crossBraceDiameter: 0.80,
    },
  },
  FINE: {
    id: "FINE",
    name: "Fino",
    label: "Suporte Fino (Alta Precisão)",
    badge: "Precisão Fina",
    description:
      "Indicado para detalhes delicados, facetas e troquéis. Base contínua fina com rampa de espátula, malha densa e remoção ultra suave.",
    config: {
      elevationZ: 4.5,
      pillarDiameter: 1.0,
      tipDiameter: 0.50,
      tipLength: 1.1,
      tipPenetration: 0.08,
      tipShape: "SPHERE" as const,
      tipUpperDiameter: 0.50,
      baseDiameter: 1.8,
      baseLength: 0.6,
      raftThickness: 0.75,
      raftMargin: 1.8,
      raftSlopeDeg: 35,
      supportSpacing: 2.2,
      minPillarDistance: 2.0,
      modelClearance: 0.70,
      lateralPillarSpacing: 1.25,
      supportAngleDeg: 55,
      supportDensityPercent: 80,
      minSupportGap: 0.40,
      crossBracingEnabled: true,
      crossBraceDiameter: 0.70,
    },
  },
  HEAVY: {
    id: "HEAVY",
    name: "Grosso",
    label: "Suporte Grosso (Reforçado)",
    badge: "Anti-Sucção Forte",
    description:
      "Para modelos maciços ou pesados. Base contínua reforçada, haste grossa e malha mais espaçada para máxima estabilidade.",
    config: {
      elevationZ: 7.0,
      pillarDiameter: 1.5,
      tipDiameter: 0.80,
      tipLength: 1.5,
      tipPenetration: 0.15,
      tipShape: "SPHERE" as const,
      tipUpperDiameter: 0.80,
      baseDiameter: 2.6,
      baseLength: 1.0,
      raftThickness: 1.1,
      raftMargin: 2.6,
      raftSlopeDeg: 35,
      supportSpacing: 3.0,
      minPillarDistance: 2.8,
      modelClearance: 1.0,
      lateralPillarSpacing: 1.65,
      supportAngleDeg: 65,
      supportDensityPercent: 70,
      minSupportGap: 0.40,
      crossBracingEnabled: true,
      crossBraceDiameter: 0.90,
    },
  },
  // Retrocompatibilidade transparente
  get GOLD_MEDIUM() {
    return this.MEDIUM;
  },
  get FINE_PRECISION() {
    return this.FINE;
  },
  get HEAVY_STRUCTURAL() {
    return this.HEAVY;
  },
} as const;

export type SupportProfileId =
  | "FINE"
  | "MEDIUM"
  | "HEAVY"
  | "GOLD_MEDIUM"
  | "FINE_PRECISION"
  | "HEAVY_STRUCTURAL";

export type DentalSupportCategoryId = "MODELS" | "VENEERS" | "CROWNS" | "GUIDES";

export interface DentalSupportCategory {
  id: DentalSupportCategoryId;
  name: string;
  label: string;
  description: string;
  badge: string;
  isConfigured: boolean;
}

export const DENTAL_SUPPORT_CATEGORIES: Record<DentalSupportCategoryId, DentalSupportCategory> = {
  MODELS: {
    id: "MODELS",
    name: "Modelos Dentários",
    label: "Modelos Odontológicos (Zócalos & Arcadas)",
    description:
      "Motor por overhang com anel lateral inferior, base contínua com rampa de espátula e contato esférico calibrado para modelos de trabalho e arcadas.",
    badge: "Configurado",
    isConfigured: true,
  },
  VENEERS: {
    id: "VENEERS",
    name: "Facetas & Lentes",
    label: "Facetas, Lentes & Fragmentos",
    description:
      "Suportes delicados com micro-pontas para bordas incisais ultrafinas sem lascamentos (calibração específica em breve).",
    badge: "Em breve",
    isConfigured: false,
  },
  CROWNS: {
    id: "CROWNS",
    name: "Coroas & Sobre Dente",
    label: "Coroas Unitárias, Pontes & Inlays",
    description:
      "Ancoragem oclusal estratégica com proteção do bordo de assentamento protético (calibração específica em breve).",
    badge: "Em breve",
    isConfigured: false,
  },
  GUIDES: {
    id: "GUIDES",
    name: "Guias Cirúrgicos",
    label: "Guias Cirúrgicos & Placas Miorrelaxantes",
    description:
      "Sustentação pesada anti-deformação para assentamento passivo de anéis metálicos (calibração específica em breve).",
    badge: "Em breve",
    isConfigured: false,
  },
};

export interface SupportPillarInfo {
  /** Centro da haste (para suporte lateral fica fora da parede). */
  x: number;
  y: number;
  /** Altura do início da coluna (topo do pé cônico, sobre a base contínua). */
  zBase: number;
  /** Altura do ponto de contato no modelo. */
  zContact: number;
  /** Altura da coluna (zContact - zBase). */
  height: number;
  /** Ponto de contato no modelo (diferente do centro da haste em suportes laterais). */
  targetX?: number;
  targetY?: number;
  isLateral?: boolean;
  /** Direção para fora do modelo no ponto de contato. */
  targetNormal?: { nx: number; ny: number; nz: number };
  /** Altura onde começa o cone do topo. */
  zKnee?: number;
}

export interface SupportBaseLoop {
  top: Array<{ x: number; y: number }>;
  bottom: Array<{ x: number; y: number }>;
}

export interface SupportBaseBounds2D {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface SupportBaseInfo {
  /** Altura do topo plano da base (mm). */
  height: number;
  /** Avanço horizontal da rampa de espátula (mm). */
  chamfer: number;
  /** Contornos do topo e do fundo (para a prévia 3D). */
  loops: SupportBaseLoop[];
  topBounds: SupportBaseBounds2D | null;
  bottomBounds: SupportBaseBounds2D | null;
  triangles: number;
  volumeMl: number;
}

export interface SupportGenerationResult {
  /** Buffer binário do STL final (modelo elevado + base + suportes). */
  stlBuffer: ArrayBuffer;
  /** Triângulos do STL final. */
  totalTriangles: number;
  /** Triângulos exclusivos da base e dos suportes. */
  supportTriangles: number;
  /** Quantidade de suportes gerados. */
  pillarCount: number;
  /** Lista de suportes para renderização e inspeção no canvas. */
  pillars: SupportPillarInfo[];
  /** Elevação Z efetivamente usada (pode ser reduzida para caber na chapa). */
  elevationZ: number;
  /** Altura do topo plano da base contínua (mm). */
  baseHeight: number;
  /** Geometria resumida da base contínua (contornos para a prévia). */
  base: SupportBaseInfo;
  /** Bounding box final (mm), incluindo a base contínua. */
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
    width: number;
    depth: number;
    height: number;
  };
  /** Bounding box exclusivo do modelo (sem suportes), em mm. */
  modelBounds: {
    width: number;
    depth: number;
    height: number;
  };
  /** Volume estimado de resina da base + suportes (ml). */
  estimatedResinMl: number;
  /** Tempo de cálculo em milissegundos. */
  durationMs: number;
}
