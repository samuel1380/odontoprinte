/**
 * OdontoPrint — Geometria do Motor de Suportes v2
 *
 * Cada suporte é um sólido fechado (manifold) construído como:
 *
 *   pé cônico embutido no topo da base contínua
 *       + coluna cilíndrica
 *         + cone do topo (sheared frustum)
 *           + calota esférica de contato
 *
 * A calota começa exatamente na latitude em que o raio da esfera é igual ao
 * raio do topo do cone. Assim o anel de junção é compartilhado e não sobra
 * nenhuma fresta/aresta aberta entre o cone e a esfera.
 */

import type {
  DentalSupportConfig,
  SupportPillarInfo,
} from "./support-config";

export const SUPPORT_SEGMENTS = 16;
export const SPHERE_CAP_RINGS = 5;

export interface BaseProfile {
  padH: number;
  padTopR: number;
  padBottomR: number;
  pedestalH: number;
  zBase: number;
}

export interface SupportFootProfile {
  footBaseR: number;
  footH: number;
  footStartZ: number;
  footTopZ: number;
}

export interface TipProfile {
  radius: number;
  connectionRadius: number;
  sCx: number;
  sCy: number;
  sCz: number;
  /** Z do plano horizontal onde a esfera encontra o topo do cone. */
  zConnection: number;
  offsetOut: number;
  nx: number;
  ny: number;
  nz: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * @deprecated Perfil da sapata individual do motor antigo. A base contínua
 * usa `computeFootProfile`, que é um pé cônico apoiado diretamente no raft.
 */
export function computeBaseProfile(
  cfg: DentalSupportConfig,
  zContact: number
): BaseProfile {
  const pRad = Math.max(0.2, cfg.pillarDiameter / 2);
  const padTopR = Math.max(cfg.baseDiameter / 2, pRad + 0.02);
  const padH = clamp(cfg.raftThickness * 0.4, 0.35, 0.8);
  const slopeDeg = clamp(cfg.raftSlopeDeg ?? 30, 10, 80);
  const skirt = Math.min(0.65, padH / Math.tan((slopeDeg * Math.PI) / 180));
  const padBottomR = padTopR + skirt;

  const available = Math.max(0, zContact - padH);
  const pedestalH = clamp(Math.min(cfg.baseLength, available * 0.35), 0, 1.2);
  const zBase = padH + pedestalH;

  return { padH, padTopR, padBottomR, pedestalH, zBase };
}

export function computeFootProfile(
  cfg: DentalSupportConfig,
  zBase: number,
  zContact: number
): SupportFootProfile {
  const pRad = Math.max(0.2, cfg.pillarDiameter / 2);
  const footBaseR = Math.max(cfg.baseDiameter / 2, pRad + 0.02);
  const available = Math.max(0, zContact - zBase);
  const footH = clamp(
    Math.min(cfg.baseLength, available * 0.2),
    0.15,
    Math.max(0.15, cfg.baseLength)
  );
  const footStartZ = Math.max(0, zBase - 0.05);
  return {
    footBaseR,
    footH,
    footStartZ,
    footTopZ: footStartZ + footH,
  };
}

export function computeTipProfile(
  cfg: DentalSupportConfig,
  targetX: number,
  targetY: number,
  zContact: number,
  normal: { nx: number; ny: number; nz: number }
): TipProfile {
  const radius = Math.max(0.1, cfg.tipDiameter / 2);
  const penetration = clamp(cfg.tipPenetration, 0.03, radius * 0.9);
  const offsetOut = radius - penetration;

  const nLen = Math.hypot(normal.nx, normal.ny, normal.nz) || 1;
  const nx = normal.nx / nLen;
  const ny = normal.ny / nLen;
  const nz = normal.nz / nLen;

  const sCx = targetX + nx * offsetOut;
  const sCy = targetY + ny * offsetOut;
  const sCz = zContact + nz * offsetOut;

  const desiredTop = (cfg.tipUpperDiameter ?? cfg.tipDiameter * 0.8) / 2;
  const connectionRadius = clamp(desiredTop, 0.04, radius * 0.97);
  const hConnection = Math.sqrt(
    Math.max(1e-6, radius * radius - connectionRadius * connectionRadius)
  );
  const zConnection = sCz - hConnection;

  return {
    radius,
    connectionRadius,
    sCx,
    sCy,
    sCz,
    zConnection,
    offsetOut,
    nx,
    ny,
    nz,
  };
}

export function computeNormal(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number
): { nx: number; ny: number; nz: number } {
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
  return { nx: nx / len, ny: ny / len, nz: nz / len };
}

export function writeTriangle(
  view: DataView,
  offset: number,
  nx: number,
  ny: number,
  nz: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number
): number {
  view.setFloat32(offset, nx, true);
  view.setFloat32(offset + 4, ny, true);
  view.setFloat32(offset + 8, nz, true);

  view.setFloat32(offset + 12, ax, true);
  view.setFloat32(offset + 16, ay, true);
  view.setFloat32(offset + 20, az, true);

  view.setFloat32(offset + 24, bx, true);
  view.setFloat32(offset + 28, by, true);
  view.setFloat32(offset + 32, bz, true);

  view.setFloat32(offset + 36, cx, true);
  view.setFloat32(offset + 40, cy, true);
  view.setFloat32(offset + 44, cz, true);

  view.setUint16(offset + 48, 0, true);
  return offset + 50;
}

/**
 * Tronco de cone generalizado com anéis horizontais. O topo pode estar
 * deslocado em X/Y (cone "sheared") para os braços laterais. Como os dois
 * anéis são horizontais, a junção com a coluna e com a calota é exata.
 */
function appendFrustum(
  out: number[],
  x0: number,
  y0: number,
  z0: number,
  r0: number,
  x1: number,
  y1: number,
  z1: number,
  r1: number,
  segments = SUPPORT_SEGMENTS
) {
  for (let i = 0; i < segments; i++) {
    const a0 = (2 * Math.PI * i) / segments;
    const a1 = (2 * Math.PI * ((i + 1) % segments)) / segments;
    const c0 = Math.cos(a0);
    const s0 = Math.sin(a0);
    const c1 = Math.cos(a1);
    const s1 = Math.sin(a1);

    const x0a = x0 + r0 * c0;
    const y0a = y0 + r0 * s0;
    const x0b = x0 + r0 * c1;
    const y0b = y0 + r0 * s1;
    const x1a = x1 + r1 * c0;
    const y1a = y1 + r1 * s0;
    const x1b = x1 + r1 * c1;
    const y1b = y1 + r1 * s1;

    out.push(x0a, y0a, z0, x0b, y0b, z0, x1b, y1b, z1);
    out.push(x0a, y0a, z0, x1b, y1b, z1, x1a, y1a, z1);
  }
}

function appendBottomCap(
  out: number[],
  cx: number,
  cy: number,
  z: number,
  radius: number,
  segments = SUPPORT_SEGMENTS
) {
  for (let i = 0; i < segments; i++) {
    const a0 = (2 * Math.PI * i) / segments;
    const a1 = (2 * Math.PI * ((i + 1) % segments)) / segments;
    const x0 = cx + radius * Math.cos(a0);
    const y0 = cy + radius * Math.sin(a0);
    const x1 = cx + radius * Math.cos(a1);
    const y1 = cy + radius * Math.sin(a1);
    out.push(cx, cy, z, x1, y1, z, x0, y0, z);
  }
}

/**
 * Calota esférica horizontal que nasce no anel de junção (zConnection,
 * connectionRadius) e fecha no polo superior. A base é compartilhada com o
 * topo do cone, produzindo um sólido sem frestas.
 */
function appendSphereCap(
  out: number[],
  cx: number,
  cy: number,
  cz: number,
  radius: number,
  zConnection: number,
  connectionRadius: number,
  segments = SUPPORT_SEGMENTS,
  rings = SPHERE_CAP_RINGS
) {
  const zTop = cz + radius;
  const safeTop = Math.max(zConnection + 1e-4, zTop);

  for (let r = 0; r < rings; r++) {
    const z0 = zConnection + ((safeTop - zConnection) * r) / rings;
    const z1 = zConnection + ((safeTop - zConnection) * (r + 1)) / rings;
    const r0 =
      r === 0
        ? connectionRadius
        : Math.sqrt(Math.max(0, radius * radius - (z0 - cz) * (z0 - cz)));
    const isLast = r === rings - 1;
    const r1 = isLast
      ? 0
      : Math.sqrt(Math.max(0, radius * radius - (z1 - cz) * (z1 - cz)));

    for (let i = 0; i < segments; i++) {
      const a0 = (2 * Math.PI * i) / segments;
      const a1 = (2 * Math.PI * ((i + 1) % segments)) / segments;
      const c0 = Math.cos(a0);
      const s0 = Math.sin(a0);
      const c1 = Math.cos(a1);
      const s1 = Math.sin(a1);

      const x0a = cx + r0 * c0;
      const y0a = cy + r0 * s0;
      const x0b = cx + r0 * c1;
      const y0b = cy + r0 * s1;

      if (isLast) {
        out.push(x0a, y0a, z0, x0b, y0b, z0, cx, cy, safeTop);
      } else {
        const x1a = cx + r1 * c0;
        const y1a = cy + r1 * s0;
        const x1b = cx + r1 * c1;
        const y1b = cy + r1 * s1;
        out.push(x0a, y0a, z0, x0b, y0b, z0, x1b, y1b, z1);
        out.push(x0a, y0a, z0, x1b, y1b, z1, x1a, y1a, z1);
      }
    }
  }
}

export function resolveKnee(
  p: SupportPillarInfo,
  cfg: DentalSupportConfig,
  tip: TipProfile
): number {
  const desired = p.zKnee ?? tip.sCz - cfg.tipLength;
  return Math.max(
    p.zBase + 0.02,
    Math.min(desired, tip.zConnection - 0.02)
  );
}

/**
 * Adiciona ao array a malha fechada de um suporte completo.
 * Retorna false quando o suporte é curto demais para a geometria caber.
 */
export function appendSupportMesh(
  out: number[],
  p: SupportPillarInfo,
  cfg: DentalSupportConfig
): boolean {
  const pRad = Math.max(0.2, cfg.pillarDiameter / 2);
  if (tipTooShort(p, cfg)) return false;

  const targetX = p.targetX ?? p.x;
  const targetY = p.targetY ?? p.y;
  const normal = p.targetNormal ?? { nx: 0, ny: 0, nz: -1 };
  const tip = computeTipProfile(cfg, targetX, targetY, p.zContact, normal);
  if (tip.zConnection <= p.zBase + 0.02) return false;

  const knee = resolveKnee(p, cfg, tip);
  const foot = computeFootProfile(cfg, p.zBase, p.zContact);

  // Pé cônico apoiado e embutido 0,05 mm na base contínua.
  appendBottomCap(out, p.x, p.y, foot.footStartZ, foot.footBaseR);
  appendFrustum(
    out,
    p.x,
    p.y,
    foot.footStartZ,
    foot.footBaseR,
    p.x,
    p.y,
    foot.footTopZ,
    pRad
  );

  // Coluna (quando sobra altura entre o pé e o joelho).
  if (knee > foot.footTopZ + 1e-4) {
    appendFrustum(out, p.x, p.y, foot.footTopZ, pRad, p.x, p.y, knee, pRad);
  }

  // Braço/cone até a esfera de contato
  appendFrustum(
    out,
    p.x,
    p.y,
    knee,
    pRad,
    tip.sCx,
    tip.sCy,
    tip.zConnection,
    tip.connectionRadius
  );

  // Calota esférica de contato (junção exata com o cone)
  appendSphereCap(
    out,
    tip.sCx,
    tip.sCy,
    tip.sCz,
    tip.radius,
    tip.zConnection,
    tip.connectionRadius
  );

  return true;
}

export function tipTooShort(
  p: SupportPillarInfo,
  cfg: DentalSupportConfig
): boolean {
  const targetX = p.targetX ?? p.x;
  const targetY = p.targetY ?? p.y;
  const normal = p.targetNormal ?? { nx: 0, ny: 0, nz: -1 };
  const tip = computeTipProfile(cfg, targetX, targetY, p.zContact, normal);
  return tip.zConnection <= p.zBase + 0.08;
}

export interface SupportSample {
  x: number;
  y: number;
  z: number;
  r: number;
}

function appendSegmentSamples(
  out: SupportSample[],
  ax: number,
  ay: number,
  az: number,
  ar: number,
  bx: number,
  by: number,
  bz: number,
  br: number,
  steps: number
) {
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    out.push({
      x: ax + (bx - ax) * t,
      y: ay + (by - ay) * t,
      z: az + (bz - az) * t,
      r: ar + (br - ar) * t,
    });
  }
}

/**
 * Amostra a superfície acima do pé (coluna, braço e ponta) para detectar
 * fusão/sobreposição entre suportes. O pé é omitido de propósito: ele fica
 * embutido na base contínua e não compromete a impressão.
 */
export function sampleSupportGeometry(
  p: SupportPillarInfo,
  cfg: DentalSupportConfig
): SupportSample[] {
  const pRad = Math.max(0.2, cfg.pillarDiameter / 2);
  const targetX = p.targetX ?? p.x;
  const targetY = p.targetY ?? p.y;
  const normal = p.targetNormal ?? { nx: 0, ny: 0, nz: -1 };
  const tip = computeTipProfile(cfg, targetX, targetY, p.zContact, normal);
  const knee = resolveKnee(p, cfg, tip);
  const foot = computeFootProfile(cfg, p.zBase, p.zContact);

  const samples: SupportSample[] = [];
  const columnStart = Math.max(p.zBase, foot.footTopZ);
  if (knee > columnStart + 1e-4) {
    appendSegmentSamples(
      samples,
      p.x,
      p.y,
      columnStart,
      pRad,
      p.x,
      p.y,
      knee,
      pRad,
      3
    );
  }
  appendSegmentSamples(
    samples,
    p.x,
    p.y,
    knee,
    pRad,
    tip.sCx,
    tip.sCy,
    tip.zConnection,
    tip.connectionRadius,
    4
  );
  samples.push({ x: tip.sCx, y: tip.sCy, z: tip.sCz, r: tip.radius });
  return samples;
}

/** Menor folga de ar entre as superfícies de dois suportes (mm, negativa quando há fusão). */
export function minSupportClearance(a: SupportSample[], b: SupportSample[]): number {
  let min = Infinity;
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      const dx = a[i].x - b[j].x;
      const dy = a[i].y - b[j].y;
      const dz = a[i].z - b[j].z;
      const gap = Math.hypot(dx, dy, dz) - a[i].r - b[j].r;
      if (gap < min) min = gap;
    }
  }
  return min;
}

export function estimateSupportVolumeMm3(
  p: SupportPillarInfo,
  cfg: DentalSupportConfig
): number {
  const pRad = Math.max(0.2, cfg.pillarDiameter / 2);
  const targetX = p.targetX ?? p.x;
  const targetY = p.targetY ?? p.y;
  const normal = p.targetNormal ?? { nx: 0, ny: 0, nz: -1 };
  const tip = computeTipProfile(cfg, targetX, targetY, p.zContact, normal);
  const knee = resolveKnee(p, cfg, tip);
  const foot = computeFootProfile(cfg, p.zBase, p.zContact);

  const frustumVolume = (r0: number, r1: number, h: number) =>
    (Math.PI * h * (r0 * r0 + r0 * r1 + r1 * r1)) / 3;

  const footVolume = frustumVolume(foot.footBaseR, pRad, foot.footH);
  const column = Math.PI * pRad * pRad * Math.max(0, knee - foot.footTopZ);
  const cone = frustumVolume(
    pRad,
    tip.connectionRadius,
    Math.max(0, tip.zConnection - knee)
  );
  const capHeight = tip.sCz + tip.radius - tip.zConnection;
  const cap =
    (Math.PI * capHeight * capHeight * (3 * tip.radius - capHeight)) / 3;

  return footVolume + column + cone + Math.max(0, cap);
}

export function pointInTriangle2D(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number
): boolean {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const hasNeg = d1 < -1e-7 || d2 < -1e-7 || d3 < -1e-7;
  const hasPos = d1 > 1e-7 || d2 > 1e-7 || d3 > 1e-7;
  return !(hasNeg && hasPos);
}

export function interpolateZOnTriangle(
  px: number,
  py: number,
  ax: number,
  ay: number,
  az: number,
  nx: number,
  ny: number,
  nz: number
): number | null {
  if (Math.abs(nz) < 1e-5) return null;
  return az - (nx * (px - ax) + ny * (py - ay)) / nz;
}

function distPointToSegmentSq(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-9) return (px - x1) * (px - x1) + (py - y1) * (py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return (px - projX) * (px - projX) + (py - projY) * (py - projY);
}

export function distPointToTriangle2D(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number
): number {
  if (pointInTriangle2D(px, py, ax, ay, bx, by, cx, cy)) return 0;
  const d1 = distPointToSegmentSq(px, py, ax, ay, bx, by);
  const d2 = distPointToSegmentSq(px, py, bx, by, cx, cy);
  const d3 = distPointToSegmentSq(px, py, cx, cy, ax, ay);
  return Math.sqrt(Math.min(d1, d2, d3));
}

/**
 * Adiciona um cilindro fechado e manifold (2 triângulos por aresta) entre dois
 * pontos no espaço 3D. Usado para barras de travamento estrutural (cross-bracing)
 * entre pilares vizinhos, eliminando a vibração e flexão na sucção do FEP.
 */
export function appendCylinderBetween(
  out: number[],
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  radius: number,
  segments = 12
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-4) return;

  const ux = dx / len;
  const uy = dy / len;
  const uz = dz / len;

  let px = 0;
  let py = 0;
  let pz = 1;
  if (Math.abs(uz) > 0.9) {
    px = 1;
    py = 0;
    pz = 0;
  }

  // v1 = (u x p) / ||u x p||
  let v1x = uy * pz - uz * py;
  let v1y = uz * px - ux * pz;
  let v1z = ux * py - uy * px;
  const v1Len = Math.hypot(v1x, v1y, v1z) || 1;
  v1x /= v1Len;
  v1y /= v1Len;
  v1z /= v1Len;

  // v2 = u x v1
  const v2x = uy * v1z - uz * v1y;
  const v2y = uz * v1x - ux * v1z;
  const v2z = ux * v1y - uy * v1x;

  const ring0: Array<{ x: number; y: number; z: number }> = [];
  const ring1: Array<{ x: number; y: number; z: number }> = [];

  for (let i = 0; i < segments; i++) {
    const angle = (2 * Math.PI * i) / segments;
    const c = Math.cos(angle) * radius;
    const s = Math.sin(angle) * radius;
    const ox = v1x * c + v2x * s;
    const oy = v1y * c + v2y * s;
    const oz = v1z * c + v2z * s;

    ring0.push({ x: x0 + ox, y: y0 + oy, z: z0 + oz });
    ring1.push({ x: x1 + ox, y: y1 + oy, z: z1 + oz });
  }

  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments;
    // Quad lateral (2 triângulos, normais para fora)
    out.push(
      ring0[i].x, ring0[i].y, ring0[i].z,
      ring0[j].x, ring0[j].y, ring0[j].z,
      ring1[j].x, ring1[j].y, ring1[j].z
    );
    out.push(
      ring0[i].x, ring0[i].y, ring0[i].z,
      ring1[j].x, ring1[j].y, ring1[j].z,
      ring1[i].x, ring1[i].y, ring1[i].z
    );
    // Tampa 0 (em A, normal em -u)
    out.push(
      x0, y0, z0,
      ring0[j].x, ring0[j].y, ring0[j].z,
      ring0[i].x, ring0[i].y, ring0[i].z
    );
    // Tampa 1 (em B, normal em +u)
    out.push(
      x1, y1, z1,
      ring1[i].x, ring1[i].y, ring1[i].z,
      ring1[j].x, ring1[j].y, ring1[j].z
    );
  }
}

