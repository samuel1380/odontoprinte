"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/shell";
import { OdontoPrintService } from "@/services/odontoprint-service";
import type { PrinterWithStatus } from "@/types/domain";
import {
  parseStlDimensions,
  parseStlTriangles,
  rasterizeTriangles,
  buildPositionedStl,
  levelAndOrientDentalModel,
  flipModel180,
  alignTroquelBaseToBed,
  computePositionsDimensions,
  packRaster,
  detectPlate,
  unplacedReason,
  fmtMm,
  rotPt,
  type ModelSize,
  type ModelGrid,
  type PackResult,
} from "@/lib/plate-nesting";
import { savePendingMesh } from "@/lib/mesh-storage";
import { parseFileName, getWorkTypeBadgeInfo } from "@/lib/parse-filename";
import { estimatePrintTime } from "@/lib/print-time";
import { generateQRCodeSvg } from "@/lib/qrcode";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  LayoutGrid,
  Upload,
  Copy,
  Check,
  Ruler,
  AlertTriangle,
  Printer,
  Download,
  Trash2,
  Anchor,
  RotateCw,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  Send,
  FileText,
  QrCode,
  Sparkles,
  Layers,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Compass,
} from "lucide-react";

interface UploadModel {
  id: string;
  file: File;
  name: string;
  patient: string;
  workType?: string | null;
  version?: string | null;
  size: ModelSize | null;
  error?: string;
  parsing: boolean;
  manualW: string;
  manualD: string;
}

/**
 * Montagem de Mesa — seção própria: joga os STL, o sistema lê as medidas,
 * encaixa na chapa da impressora e gera UM STL posicionado pronto para
 * abrir no Chitubox/Halot Box (só faltam suportes). 100% local.
 */
export default function MontagemPage() {
  const router = useRouter();
  const [printers, setPrinters] = useState<PrinterWithStatus[]>([]);
  const [loadingPrinters, setLoadingPrinters] = useState(true);
  const [printerId, setPrinterId] = useState("");
  const [plateW, setPlateW] = useState("");
  const [plateD, setPlateD] = useState("");
  const [plateH, setPlateH] = useState("");
  const [savingPlate, setSavingPlate] = useState(false);
  const [gap, setGap] = useState(2);
  const [margin, setMargin] = useState(1.5);
  const [models, setModels] = useState<UploadModel[]>([]);
  const [copied, setCopied] = useState(false);
  const [building, setBuilding] = useState(false);
  const [sendingToQueue, setSendingToQueue] = useState(false);
  const [worksheetOpen, setWorksheetOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const trianglesById = useRef(new Map<string, Float32Array>());
  const gridsById = useRef(new Map<string, ModelGrid>());
  const mapRef = useRef<HTMLCanvasElement>(null);

  // Estados de visualização 3D e câmera da mesa
  const [viewMode, setViewMode] = useState<"3d" | "2d">("3d");
  const [yaw, setYaw] = useState<number>(-0.55);
  const [pitch, setPitch] = useState<number>(0.48);
  const [zoom, setZoom] = useState<number>(1.0);
  const isDraggingRef = useRef<boolean>(false);
  const lastMousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (viewMode !== "3d") return;
    isDraggingRef.current = true;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current || viewMode !== "3d") return;
    const dx = e.clientX - lastMousePosRef.current.x;
    const dy = e.clientY - lastMousePosRef.current.y;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };

    setYaw((prev) => prev + dx * 0.008);
    setPitch((prev) => {
      const next = prev + dy * 0.008;
      return Math.max(0.05, Math.min(Math.PI / 2 - 0.05, next));
    });
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (viewMode !== "3d") return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom((prev) => Math.max(0.4, Math.min(4.0, +(prev * factor).toFixed(2))));
  };

  const handleZoom = (delta: number) => {
    setZoom((prev) => Math.max(0.4, Math.min(4.0, +(prev + delta).toFixed(2))));
  };

  const handleResetCamera = () => {
    setYaw(-0.55);
    setPitch(0.48);
    setZoom(1.0);
  };

  useEffect(() => {
    OdontoPrintService.getPrinters()
      .then((list) => {
        setPrinters(list);
        if (list.length > 0) setPrinterId(list[0].id);
      })
      .catch(() => toast.error("Erro ao carregar impressoras."))
      .finally(() => setLoadingPrinters(false));
  }, []);

  const printer = printers.find((p) => p.id === printerId);
  const detected = printer ? detectPlate(printer.brand, printer.model) : null;

  const effW = Number(plateW) > 0 ? Number(plateW) : printer?.plate_width_mm || detected?.w || 0;
  const effD = Number(plateD) > 0 ? Number(plateD) : printer?.plate_depth_mm || detected?.d || 0;
  const effH = Number(plateH) > 0 ? Number(plateH) : printer?.plate_height_mm || detected?.h || 0;

  useEffect(() => {
    setPlateW(printer?.plate_width_mm ? String(printer.plate_width_mm) : "");
    setPlateD(printer?.plate_depth_mm ? String(printer.plate_depth_mm) : "");
    setPlateH(printer?.plate_height_mm ? String(printer.plate_height_mm) : "");
  }, [printerId]);

  const addFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const valid = Array.from(list).filter((f) => /\.(stl|obj|3mf|ply)$/i.test(f.name));
    if (valid.length < list.length) toast.warning("Somente arquivos 3D (.stl, .obj, .3mf, .ply).");
    setModels((prev) => {
      const names = new Set(prev.map((m) => m.name.toLowerCase()));
      const fresh = valid
        .filter((f) => !names.has(f.name.toLowerCase()))
        .map((f) => {
          let patient = f.name.replace(/\.[^/.]+$/, "");
          let workType: string | null = null;
          let version: string | null = null;
          try {
            const parsed = parseFileName(f.name, []);
            patient = parsed.patient || patient;
            workType = parsed.workType;
            version = parsed.version || null;
          } catch {
            // mantém nome do arquivo
          }
          return {
            id: crypto.randomUUID(),
            file: f,
            name: f.name,
            patient: patient.toUpperCase(),
            workType,
            version,
            size: null,
            parsing: true,
            manualW: "",
            manualD: "",
          } as UploadModel;
        });

      // Detector de Paciente Duplicado ou Versão Atualizada (v2, final, etc)
      for (const freshModel of fresh) {
        const existing = prev.find((p) => p.patient === freshModel.patient);
        if (existing) {
          if (freshModel.version) {
            toast.warning(
              `Versão atualizada detectada para ${freshModel.patient} (${freshModel.version}). Pode substituir o modelo anterior ou imprimir ambos na mesa.`,
              { duration: 6000 }
            );
          } else {
            toast.warning(
              `Atenção: O paciente ${freshModel.patient} já possui outro modelo nesta mesa.`,
              { duration: 5000 }
            );
          }
        }
      }

      return [...prev, ...fresh];
    });
  };

  // Lê geometria em segundo plano (guarda triângulos p/ o STL final)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const m of models) {
        if (m.size || m.error || !m.parsing) continue;
        try {
          // Lê o STL UMA única vez. Antes o arquivo era lido/decodificado duas
          // vezes (dimensões + triângulos), dobrando o tempo de importação.
          const tris = /\.stl$/i.test(m.file.name)
            ? await parseStlTriangles(m.file)
            : null;
          const size = tris
            ? computePositionsDimensions(tris.positions)
            : await parseStlDimensions(m.file);
          if (cancelled) return;
          if (tris) {
            let positions = tris.positions;
            let currentSize = size;
            const isTroquel = m.workType === "TROQUEL" || /troquel|troqueis|die/i.test(m.file.name);
            if (isTroquel) {
              const aligned = alignTroquelBaseToBed(positions);
              if (aligned !== positions) {
                positions = aligned;
                currentSize = computePositionsDimensions(positions);
              }
            }
            trianglesById.current.set(m.id, positions);
            try {
              gridsById.current.set(m.id, rasterizeTriangles(positions, 1));
            } catch {
              // sem grade: cai para retângulo cheio no encaixe
            }
            setModels((prev) => prev.map((p) => (p.id === m.id ? { ...p, size: currentSize, parsing: false } : p)));
          } else {
            setModels((prev) => prev.map((p) => (p.id === m.id ? { ...p, size, parsing: false } : p)));
          }
        } catch (err: any) {
          if (cancelled) return;
          setModels((prev) =>
            prev.map((p) =>
              p.id === m.id
                ? { ...p, parsing: false, error: err?.message || "Falha ao ler" }
                : p
            )
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models.map((m) => m.id).join(",")]);

  const sized = (m: UploadModel): { w: number; d: number; z: number } | null => {
    if (m.size) return { w: m.size.x, d: m.size.y, z: m.size.z };
    const w = Number(m.manualW);
    const d = Number(m.manualD);
    if (w > 0 && d > 0) return { w, d, z: 0 };
    return null;
  };

  const [result, setResult] = useState<PackResult | null>(null);
  const [packing, setPacking] = useState(false);

  // Encaixe com debounce (raster pode levar 1-3s em mesas grandes)
  const packSignature = JSON.stringify([
    models.map((m) => [m.id, m.size, m.manualW, m.manualD, m.error]),
    effW,
    effD,
    gap,
    margin,
  ]);
  useEffect(() => {
    setPacking(true);
    const t = setTimeout(() => {
      try {
        if (!(effW > 0 && effD > 0)) {
          setResult(null);
          return;
        }
        const items = models
          .map((m) => {
            const s = sized(m);
            if (!s) return null;
            return {
              id: m.id,
              label: m.patient,
              w: s.w,
              d: s.d,
              grid: gridsById.current.get(m.id) || null,
            };
          })
          .filter(Boolean) as {
          id: string;
          label: string;
          w: number;
          d: number;
          grid: ModelGrid | null;
        }[];
        if (items.length === 0) {
          setResult(null);
          return;
        }
        setResult(packRaster(items, effW, effD, Math.max(0, gap), Math.max(0.5, margin)));
      } finally {
        setPacking(false);
      }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packSignature]);

  // Mapa exato em canvas (desenha as células reais de cada modelo)
  const MAP_COLORS = [
    "#22d3ee",
    "#a78bfa",
    "#34d399",
    "#fbbf24",
    "#f472b6",
    "#60a5fa",
    "#fb7185",
    "#4ade80",
    "#facc15",
    "#38bdf8",
    "#c084fc",
    "#2dd4bf",
  ];
  // Renderização da Mesa em Canvas: Suporte a Prévia 3D Real (estilo Halot Box) e Mapa Técnico 2D
  useEffect(() => {
    const canvas = mapRef.current;
    if (!canvas || !result || !(effW > 0 && effD > 0)) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (viewMode === "3d") {
      canvas.width = 720;
      canvas.height = 460;
      const W = canvas.width;
      const H = canvas.height;

      // Fundo escuro de alto contraste da bancada fatiadora
      ctx.fillStyle = "#070b12";
      ctx.fillRect(0, 0, W, H);

      const maxModelZ = Math.max(0, ...models.map((m) => sized(m)?.z || 0));
      const cx = effW / 2;
      const cy = effD / 2;
      const cz = (maxModelZ || 25) / 2;

      const maxDim = Math.max(effW, effD, maxModelZ || 25, Math.hypot(effW, effD) * 0.7);
      const baseScale = Math.min((W - 80) / maxDim, (H - 80) / maxDim);
      const S = baseScale * zoom;

      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      const cosP = Math.cos(pitch);
      const sinP = Math.sin(pitch);

      const project = (x: number, y: number, z: number) => {
        const dx = x - cx;
        const dy = y - cy;
        const dz = z - cz;

        const rx = dx * cosY - dy * sinY;
        const ry = dx * sinY + dy * cosY;
        const rz = dz;

        const px = rx;
        const py = ry * sinP - rz * cosP;
        const depth = ry * cosP + rz * sinP;

        return {
          x: W / 2 + px * S,
          y: H / 2 + py * S,
          depth,
        };
      };

      // 1. Chapa Metálica de Impressão (Build Plate) 3D
      const p0 = project(0, 0, 0);
      const p1 = project(effW, 0, 0);
      const p2 = project(effW, effD, 0);
      const p3 = project(0, effD, 0);

      ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
      ctx.strokeStyle = "#334155";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Margem útil da chapa
      const m0 = project(margin, margin, 0);
      const m1 = project(effW - margin, margin, 0);
      const m2 = project(effW - margin, effD - margin, 0);
      const m3 = project(margin, effD - margin, 0);
      ctx.strokeStyle = "rgba(56, 189, 248, 0.45)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(m0.x, m0.y);
      ctx.lineTo(m1.x, m1.y);
      ctx.lineTo(m2.x, m2.y);
      ctx.lineTo(m3.x, m3.y);
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);

      // Grade milimétrica na chapa
      ctx.strokeStyle = "rgba(30, 41, 59, 0.5)";
      ctx.lineWidth = 0.7;
      const stepMm = 20;
      for (let gx = stepMm; gx < effW; gx += stepMm) {
        const la = project(gx, 0, 0);
        const lb = project(gx, effD, 0);
        ctx.beginPath();
        ctx.moveTo(la.x, la.y);
        ctx.lineTo(lb.x, lb.y);
        ctx.stroke();
      }
      for (let gy = stepMm; gy < effD; gy += stepMm) {
        const la = project(0, gy, 0);
        const lb = project(effW, gy, 0);
        ctx.beginPath();
        ctx.moveTo(la.x, la.y);
        ctx.lineTo(lb.x, lb.y);
        ctx.stroke();
      }

      // 2. Renderização dos Modelos Odontológicos Posicionados na Mesa
      const lx = 0.45;
      const ly = 0.55;
      const lz = 0.70;

      result.placed.forEach((p, i) => {
        const triangles = trianglesById.current.get(p.id);
        const modelColor = MAP_COLORS[i % MAP_COLORS.length];

        if (triangles && triangles.length >= 9) {
          let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, minZ = Infinity;
          for (let k = 0; k < triangles.length; k += 3) {
            const x = triangles[k], y = triangles[k + 1], z = triangles[k + 2];
            if (x < x0) x0 = x; if (y < y0) y0 = y;
            if (x > x1) x1 = x; if (y > y1) y1 = y;
            if (z < minZ) minZ = z;
          }
          const corners = [
            rotPt(x0, y0, p.angle),
            rotPt(x1, y0, p.angle),
            rotPt(x0, y1, p.angle),
            rotPt(x1, y1, p.angle),
          ];
          const minRotX = Math.min(corners[0].x, corners[1].x, corners[2].x, corners[3].x);
          const minRotY = Math.min(corners[0].y, corners[1].y, corners[2].y, corners[3].y);
          const tx = p.x - minRotX;
          const ty = p.y - minRotY;
          const drop = minZ;

          const triCount = Math.floor(triangles.length / 9);
          const step = Math.max(1, Math.floor(triCount / 6000));

          for (let t = 0; t < triCount; t += step) {
            const off = t * 9;
            const aRot = rotPt(triangles[off], triangles[off + 1], p.angle);
            const bRot = rotPt(triangles[off + 3], triangles[off + 4], p.angle);
            const cRot = rotPt(triangles[off + 6], triangles[off + 7], p.angle);

            const ax = aRot.x + tx;
            const ay = aRot.y + ty;
            const az = triangles[off + 2] - drop;

            const bx = bRot.x + tx;
            const by = bRot.y + ty;
            const bz = triangles[off + 5] - drop;

            const cx3 = cRot.x + tx;
            const cy3 = cRot.y + ty;
            const cz3 = triangles[off + 8] - drop;

            const abx = bx - ax;
            const aby = by - ay;
            const abz = bz - az;

            const acx = cx3 - ax;
            const acy = cy3 - ay;
            const acz = cz3 - az;

            let nx = aby * acz - abz * acy;
            let ny = abz * acx - abx * acz;
            let nz = abx * acy - aby * acx;
            const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz);

            if (nLen > 0.00001) {
              nx /= nLen; ny /= nLen; nz /= nLen;
            }

            const rotNx = nx * cosY - ny * sinY;
            const rotNy = nx * sinY + ny * cosY;
            const camNz = rotNy * sinP - nz * cosP;

            if (camNz < -0.05) continue;

            const dot = nx * lx + ny * ly + nz * lz;
            const diffuse = Math.max(0, dot);
            const light = 0.22 + 0.78 * diffuse;

            const r = Math.round(14 + 18 * light);
            const g = Math.round(100 * light + 25);
            const b = Math.round(200 * light + 45);
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.90)`;

            const ptA = project(ax, ay, az);
            const ptB = project(bx, by, bz);
            const ptC = project(cx3, cy3, cz3);

            ctx.beginPath();
            ctx.moveTo(ptA.x, ptA.y);
            ctx.lineTo(ptB.x, ptB.y);
            ctx.lineTo(ptC.x, ptC.y);
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = "rgba(56, 189, 248, 0.12)";
            ctx.lineWidth = 0.4;
            ctx.stroke();
          }

          // Marcador do número do modelo na mesa
          const centerProj = project(p.x + p.placedW / 2, p.y + p.placedD / 2, (maxModelZ || 20) * 0.9);
          ctx.fillStyle = "#0f172a";
          ctx.beginPath();
          ctx.arc(centerProj.x, centerProj.y, 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = modelColor;
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 11px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(i + 1), centerProj.x, centerProj.y + 0.5);

        } else {
          // Caixa 3D para modelos sem geometria STL carregada
          const b0 = project(p.x, p.y, 0);
          const b1 = project(p.x + p.placedW, p.y, 0);
          const b2 = project(p.x + p.placedW, p.y + p.placedD, 0);
          const b3 = project(p.x, p.y + p.placedD, 0);

          ctx.fillStyle = modelColor;
          ctx.globalAlpha = 0.5;
          ctx.beginPath();
          ctx.moveTo(b0.x, b0.y);
          ctx.lineTo(b1.x, b1.y);
          ctx.lineTo(b2.x, b2.y);
          ctx.lineTo(b3.x, b3.y);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      });
    } else {
      // --- VISTA MAPA 2D TÉCNICO (DISTRIBUIÇÃO) ---
      const S = 3; // px por mm
      canvas.width = Math.max(1, Math.round(effW * S));
      canvas.height = Math.max(1, Math.round(effD * S));
      ctx.fillStyle = "#020617";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "#334155";
      ctx.lineWidth = 2;
      ctx.strokeRect(margin * S, margin * S, (effW - margin * 2) * S, (effD - margin * 2) * S);
      result.placed.forEach((p, i) => {
        const color = MAP_COLORS[i % MAP_COLORS.length];
        const pix = (p as any).pix as
          | { w: number; h: number; cells: number[]; cell: number }
          | undefined;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.75;
        let sx = 0;
        let sy = 0;
        let n = 0;
        if (pix && pix.cells.length > 0) {
          for (let j = 0; j < pix.h; j++) {
            for (let k = 0; k < pix.w; k++) {
              if (!pix.cells[j * pix.w + k]) continue;
              const px = (p.x + k * pix.cell) * S;
              const py = (p.y + j * pix.cell) * S;
              ctx.fillRect(px, py, pix.cell * S, pix.cell * S);
              sx += px + (pix.cell * S) / 2;
              sy += py + (pix.cell * S) / 2;
              n++;
            }
          }
        } else {
          ctx.fillRect(p.x * S, p.y * S, p.placedW * S, p.placedD * S);
          sx = (p.x + p.placedW / 2) * S;
          sy = (p.y + p.placedD / 2) * S;
          n = 1;
        }
        ctx.globalAlpha = 1;
        if (n > 0) {
          ctx.fillStyle = "#0f172a";
          ctx.beginPath();
          ctx.arc(sx / n, sy / n, 9, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 11px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(i + 1), sx / n, sy / n + 0.5);
        }
      });
    }
  }, [result, effW, effD, margin, viewMode, yaw, pitch, zoom, models]);

  const labelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of models) map.set(m.id, `${m.patient} (${m.name})`);
    return map;
  }, [models]);

  const maxZ = Math.max(0, ...models.map((m) => sized(m)?.z || 0));
  const heightWarn = effH > 0 && maxZ > effH;
  const parsingCount = models.filter((m) => m.parsing).length;
  const missingCount = models.filter((m) => !sized(m)).length;
  const estTris = result
    ? result.placed.reduce((s, p) => {
        const t = trianglesById.current.get(p.id);
        return s + (t ? t.length / 9 : 0);
      }, 0)
    : 0;
  const estMB = ((84 + estTris * 50) / (1024 * 1024)).toFixed(1);

  const printEstimate = useMemo(() => {
    return estimatePrintTime({ maxZMm: maxZ, layerHeightMm: 0.05 });
  }, [maxZ]);

  const handleSendToQueue = async () => {
    if (!result || result.placed.length === 0) {
      toast.error("Nenhum modelo posicionado na mesa para enviar.");
      return;
    }
    setSendingToQueue(true);
    try {
      const placedModels = result.placed.map((p) => {
        const m = models.find((mod) => mod.id === p.id);
        return {
          patient: m?.patient || "PACIENTE",
          fileName: m?.name || "modelo.stl",
          workType: m?.workType || "MODELO",
        };
      });

      const cardsRes = await OdontoPrintService.createPrintCards(
        placedModels.map((pm) => ({
          patient: pm.patient,
          clinic: "Laboratório",
          cadista: "Montagem de Mesa",
          work_type: pm.workType,
          file_name: pm.fileName,
        }))
      );

      if (!cardsRes.success || cardsRes.created_ids.length === 0) {
        throw new Error(cardsRes.error || "Falha ao registrar itens da mesa.");
      }

      const batchName = `Mesa ${printer?.name || "Chapa"} · ${placedModels.length} peças`;
      const batchRes = await OdontoPrintService.createOrderBatch({
        item_ids: cardsRes.created_ids,
        batch_name: batchName,
        printer_id: printer?.id || null,
        printer_name: printer?.name || null,
      });

      if (!batchRes.success) {
        throw new Error(batchRes.error || "Falha ao criar lote na fila.");
      }

      toast.success(
        `Mesa enviada para a Fila com ${placedModels.length} modelo(s)! Lote criado com sucesso.`
      );
    } catch (err: any) {
      toast.error(err?.message || "Erro ao enviar mesa para a fila.");
    } finally {
      setSendingToQueue(false);
    }
  };

  const copyMap = async () => {
    if (!result) return;
    const lines = [
      `MESA — chapa ${effW}×${effD}mm (${printer?.name || "?"})`,
      `Ocupação: ${Math.round(result.utilization * 100)}% · ${result.placed.length} na chapa, ${result.unplaced.length} de fora`,
      ...result.placed.map(
        (p, i) =>
          `${i + 1}. ${labelById.get(p.id)} → x=${p.x} y=${p.y} ${p.placedW}×${p.placedD}mm${p.angle !== 0 ? ` (GIRAR ${p.angle}°)` : ""}`
      ),
      ...result.unplaced.map(
        (u) =>
          `FORA: ${labelById.get(u.id)} (${u.w}×${u.d}mm) — ${
            unplacedReason(u, effW, effD, gap, 2) === "too-big"
              ? "grande demais para esta chapa"
              : "próxima mesa"
          }`
      ),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  const downloadStl = async () => {
    if (!result || result.placed.length === 0) {
      toast.error("Nada posicionado para baixar.");
      return;
    }
    const withGeo = result.placed.filter((p) => trianglesById.current.get(p.id));
    const missing = result.placed.filter((p) => !trianglesById.current.get(p.id));
    if (withGeo.length === 0) {
      toast.error(
        "Nenhum modelo com geometria lida (só STL gera arquivo; OBJ/3MF e medidas manuais entram só no mapa)."
      );
      return;
    }
    setBuilding(true);
    try {
      await new Promise((r) => setTimeout(r, 30)); // libera a UI p/ o spinner
      const buffer = buildPositionedStl(
        withGeo.map((p) => ({
          positions: trianglesById.current.get(p.id)!,
          x: p.x,
          y: p.y,
          angle: p.angle,
        }))
      );
      const blob = new Blob([buffer], { type: "model/stl" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
      a.href = url;
      a.download = `mesa-${(printer?.name || "chapa").replace(/\s+/g, "-").toLowerCase()}-${stamp}.stl`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      if (missing.length > 0) {
        toast.warning(`Mesa baixada com ${withGeo.length} modelo(s). ${missing.length} sem STL ficaram de fora do arquivo.`);
      } else {
        toast.success("Mesa baixada! Abra no Chitubox/Halot Box e adicione os suportes.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Falha ao gerar o arquivo.");
    } finally {
      setBuilding(false);
    }
  };

  const sendToSupports = async () => {
    if (!result || result.placed.length === 0) {
      router.push("/suportes");
      return;
    }
    const withGeo = result.placed.filter((p) => trianglesById.current.get(p.id));
    if (withGeo.length === 0) {
      router.push("/suportes");
      return;
    }
    setBuilding(true);
    try {
      await new Promise((r) => setTimeout(r, 20));
      const buffer = buildPositionedStl(
        withGeo.map((p) => ({
          positions: trianglesById.current.get(p.id)!,
          x: p.x,
          y: p.y,
          angle: p.angle,
        }))
      );
      const fileName = `mesa-${(printer?.name || "chapa").replace(/\s+/g, "-").toLowerCase()}.stl`;
      await savePendingMesh(buffer, fileName, {
        plateW: Number(plateW),
        plateD: Number(plateD),
        printerName: printer?.name,
      });
      router.push("/suportes");
    } catch (err: any) {
      toast.error(err?.message || "Falha ao preparar mesa para suportes.");
      router.push("/suportes");
    } finally {
      setBuilding(false);
    }
  };

  const savePlate = async () => {
    if (!printer) {
      toast.error("Selecione uma impressora primeiro (cadastre em Impressoras se a lista estiver vazia).");
      return;
    }
    const w = Number(plateW);
    const d = Number(plateD);
    const h = Number(plateH);
    if (!(w > 0) || !(d > 0)) {
      toast.error("Informe largura e profundidade da chapa em mm.");
      return;
    }
    try {
      const res = await OdontoPrintService.updatePrinterDimensions(printer.id, {
        width_mm: w,
        depth_mm: d,
        height_mm: h > 0 ? h : null,
      });
      if (!res.success) {
        toast.error(res.error || "Erro ao salvar medidas.");
        return;
      }
      toast.success(`Mesa da ${printer.name} salva: ${w}×${d}mm.`);
      const list = await OdontoPrintService.getPrinters();
      setPrinters(list);
    } catch {
      toast.error("Erro ao salvar medidas.");
    }
  };

  const removeModel = (id: string) => {
    trianglesById.current.delete(id);
    gridsById.current.delete(id);
    setModels((prev) => prev.filter((m) => m.id !== id));
  };

  const flipModel = (id: string) => {
    const geo = trianglesById.current.get(id);
    if (!geo) return;
    const flipped = flipModel180(geo);
    trianglesById.current.set(id, flipped);

    let lMinX = Infinity, lMaxX = -Infinity;
    let lMinY = Infinity, lMaxY = -Infinity;
    let lMinZ = Infinity, lMaxZ = -Infinity;
    for (let i = 0; i < flipped.length; i += 3) {
      if (flipped[i] < lMinX) lMinX = flipped[i];
      if (flipped[i] > lMaxX) lMaxX = flipped[i];
      if (flipped[i + 1] < lMinY) lMinY = flipped[i + 1];
      if (flipped[i + 1] > lMaxY) lMaxY = flipped[i + 1];
      if (flipped[i + 2] < lMinZ) lMinZ = flipped[i + 2];
      if (flipped[i + 2] > lMaxZ) lMaxZ = flipped[i + 2];
    }
    const newSize: ModelSize = {
      x: Math.round((lMaxX - lMinX) * 10) / 10,
      y: Math.round((lMaxY - lMinY) * 10) / 10,
      z: Math.round((lMaxZ - lMinZ) * 10) / 10,
      triangles: Math.floor(flipped.length / 9),
    };
    try {
      gridsById.current.set(id, rasterizeTriangles(flipped, 1));
    } catch {
      //
    }
    setModels((prev) => prev.map((m) => (m.id === id ? { ...m, size: newSize } : m)));
    toast.success("Modelo virado 180° com sucesso!");
  };

  const alignModelStraight = (id: string) => {
    const geo = trianglesById.current.get(id);
    if (!geo) return;
    const aligned = alignTroquelBaseToBed(geo);
    trianglesById.current.set(id, aligned);

    const newSize = computePositionsDimensions(aligned);
    try {
      gridsById.current.set(id, rasterizeTriangles(aligned, 1));
    } catch {
      //
    }
    setModels((prev) => prev.map((m) => (m.id === id ? { ...m, size: newSize } : m)));
    toast.success("Base assentada e endireitada na horizontal com sucesso!");
  };

  const downloadSingleModel = (id: string, name: string) => {
    const geo = trianglesById.current.get(id);
    if (!geo) return;
    const buffer = buildPositionedStl([
      {
        positions: geo,
        x: 0,
        y: 0,
        angle: 0,
        dropToBed: true,
      },
    ]);
    const blob = new Blob([buffer], { type: "model/stl" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name.endsWith(".stl") ? name : `${name}.stl`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast.success(`Modelo "${name}" baixado no tamanho 100% original.`);
  };

  return (
    <AppShell>
      <div className="space-y-4 max-w-6xl mx-auto">
        {/* Cabeçalho */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <LayoutGrid className="w-5 h-5 text-cyan-400" />
              Montagem de Mesa
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Jogue os arquivos, o sistema organiza na chapa e gera o STL pronto para o fatiador.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setWorksheetOpen(true)}
              disabled={!result || result.placed.length === 0}
              className="gap-1.5 font-bold border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 rounded-full text-xs h-9 px-3.5 disabled:opacity-40"
            >
              <FileText className="w-4 h-4 text-cyan-400" />
              Ficha de Bancada
            </Button>
            <Button
              size="sm"
              onClick={handleSendToQueue}
              disabled={!result || result.placed.length === 0 || sendingToQueue}
              className="gap-1.5 font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-full text-xs h-9 px-4 disabled:opacity-40 shadow-sm"
            >
              <Send className="w-4 h-4" />
              {sendingToQueue ? "Enviando..." : "Enviar p/ Fila"}
            </Button>
            <Button
              size="sm"
              onClick={sendToSupports}
              disabled={!result || result.placed.length === 0}
              className="gap-1.5 font-bold bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-full text-xs h-9 px-4 disabled:opacity-40"
            >
              <Anchor className="w-4 h-4" />
              Adicionar Suportes
            </Button>
            <Button
              size="sm"
              onClick={downloadStl}
              disabled={!result || result.placed.length === 0 || building}
              className="gap-1.5 font-bold bg-white hover:bg-slate-200 text-slate-950 rounded-full text-xs h-9 px-4 disabled:opacity-40"
            >
              <Download className="w-4 h-4" />
              {building ? "Gerando..." : "Baixar mesa (.stl)"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* 1. Chapa */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3.5 space-y-3 h-fit">
            <p className="text-xs font-bold text-white flex items-center gap-1.5">
              <Printer className="w-4 h-4 text-cyan-400" /> 1. Chapa da impressora
            </p>
            {loadingPrinters ? (
              <Skeleton className="h-10 w-full rounded-xl bg-slate-800" />
            ) : (
              <select
                value={printerId}
                onChange={(e) => setPrinterId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-cyan-400"
              >
                <option value="">Selecione...</option>
                {printers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.brand} {p.model}
                  </option>
                ))}
              </select>
            )}
            {printers.length === 0 && !loadingPrinters && (
              <p className="text-[11px] text-amber-300">
                Nenhuma impressora cadastrada — cadastre em Impressoras para montar a mesa.
              </p>
            )}
            {printer && (
              <p className="text-[11px] text-slate-400">
                Detectado: <strong className="text-slate-200">{detected?.label}</strong>
                {printer.plate_width_mm ? " · medida salva" : " · confira e salve"}
              </p>
            )}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Largura (mm)", value: plateW, set: setPlateW },
                { label: "Profund. (mm)", value: plateD, set: setPlateD },
                { label: "Altura (mm)", value: plateH, set: setPlateH },
              ].map((f) => (
                <div key={f.label}>
                  <label className="text-[10px] text-slate-400 block mb-1">{f.label}</label>
                  <input
                    type="number"
                    min={0}
                    value={f.value}
                    onChange={(e) => f.set(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl px-2.5 py-1.5 text-sm focus:outline-none focus:border-cyan-400"
                  />
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                onClick={savePlate}
                disabled={!printerId}
                className="rounded-full border-slate-700 text-slate-200 text-xs h-8 gap-1.5"
              >
                <Ruler className="w-3.5 h-3.5" />
                Salvar medida na impressora
              </Button>
              <div className="flex items-center gap-3 ml-auto flex-wrap">
                <label className="text-[11px] text-slate-400 flex items-center gap-1.5">
                  Margem borda (mm)
                  <input
                    type="number"
                    min={0.5}
                    max={10}
                    step={0.5}
                    value={margin}
                    onChange={(e) => setMargin(Math.max(0.5, Number(e.target.value) || 0.5))}
                    className="w-14 bg-slate-950 border border-slate-700 text-white rounded-lg px-1.5 py-1 text-[11px]"
                    title="Distância de segurança das bordas da chapa (padrão 1,5 mm)"
                  />
                </label>
                <label className="text-[11px] text-slate-400 flex items-center gap-1.5">
                  Folga entre peças (mm)
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={gap}
                    onChange={(e) => setGap(Math.max(1, Number(e.target.value) || 1))}
                    className="w-14 bg-slate-950 border border-slate-700 text-white rounded-lg px-1.5 py-1 text-[11px]"
                    title="Folga mínima entre peças para conector e anti-fusão (padrão 2 mm)"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* 2. Arquivos */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3.5 space-y-2.5 h-fit">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-white flex items-center gap-1.5">
                <Upload className="w-4 h-4 text-cyan-400" /> 2. Modelos ({models.length})
              </p>
            </div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full border-2 border-dashed border-slate-700 hover:border-cyan-500 rounded-2xl p-4 text-center text-xs text-slate-300 transition"
            >
              Solte os STL/OBJ aqui ou clique para selecionar
              <span className="block text-[10px] text-slate-500 mt-1">
                Só lê as medidas neste aparelho — nada é enviado
              </span>
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".stl,.obj,.3mf,.ply"
              className="hidden"
              onChange={(e) => {
                const list = e.target.files;
                if (!list || list.length === 0) return;
                const valid = Array.from(list).filter((f) => /\.(stl|obj|3mf|ply)$/i.test(f.name));
                if (valid.length < list.length) toast.warning("Somente arquivos 3D.");
                setModels((prev) => {
                  const names = new Set(prev.map((m) => m.name.toLowerCase()));
                  const fresh: UploadModel[] = valid
                    .filter((f) => !names.has(f.name.toLowerCase()))
                    .map((f) => {
                      let patient = f.name.replace(/\.[^/.]+$/, "");
                      try {
                        patient = parseFileName(f.name, []).patient || patient;
                      } catch {
                        // mantém nome
                      }
                      return {
                        id: crypto.randomUUID(),
                        file: f,
                        name: f.name,
                        patient: patient.toUpperCase(),
                        size: null,
                        parsing: true,
                        manualW: "",
                        manualD: "",
                      };
                    });
                  return [...prev, ...fresh];
                });
                e.target.value = "";
              }}
            />
            {parsingCount > 0 && (
              <p className="text-[11px] text-cyan-300">Lendo medidas... ({parsingCount})</p>
            )}
            <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
              {models.length === 0 && (
                <p className="text-[11px] text-slate-500 text-center py-3">
                  Nenhum arquivo ainda. Os modelos entram no mapa sozinhos.
                </p>
              )}
              {models.map((m) => {
                const s = sized(m);
                return (
                  <div key={m.id} className="flex items-center gap-2 text-xs bg-slate-950/60 border border-slate-800 rounded-xl px-2.5 py-1.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-mono font-bold text-white truncate">{m.patient}</p>
                        {(() => {
                          const b = getWorkTypeBadgeInfo(m.workType);
                          return (
                            <span className={`text-[9px] px-1.5 py-0.2 rounded font-semibold border ${b.badgeClass}`}>
                              {b.label}
                            </span>
                          );
                        })()}
                        {m.version && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            {m.version.toUpperCase()}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 truncate">{m.name}</p>
                    </div>
                    {s ? (
                      <span className="text-slate-300 shrink-0 text-[11px]">
                        {fmtMm(s.w)} × {fmtMm(s.d)}
                      </span>
                    ) : m.error ? (
                      <span className="text-rose-300 text-[10px] shrink-0">erro</span>
                    ) : m.parsing ? (
                      <span className="text-slate-500 text-[10px] shrink-0">lendo...</span>
                    ) : (
                      <span className="flex items-center gap-1 shrink-0">
                        <input
                          type="number"
                          min={0}
                          placeholder="L"
                          value={m.manualW}
                          onChange={(e) =>
                            setModels((prev) =>
                              prev.map((p) => (p.id === m.id ? { ...p, manualW: e.target.value } : p))
                            )
                          }
                          className="w-14 bg-slate-900 border border-slate-700 text-white rounded-lg px-1.5 py-1 text-[11px]"
                        />
                        <span className="text-slate-500">×</span>
                        <input
                          type="number"
                          min={0}
                          placeholder="P"
                          value={m.manualD}
                          onChange={(e) =>
                            setModels((prev) =>
                              prev.map((p) => (p.id === m.id ? { ...p, manualD: e.target.value } : p))
                            )
                          }
                          className="w-14 bg-slate-900 border border-slate-700 text-white rounded-lg px-1.5 py-1 text-[11px]"
                        />
                      </span>
                    )}

                    {/* Controles de Nivelamento e Orientação 3D */}
                    {trianglesById.current.has(m.id) && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => alignModelStraight(m.id)}
                          className="text-slate-400 hover:text-emerald-400 p-1 rounded hover:bg-slate-800 transition"
                          title="Endireitar base reta na mesa (corrige troquel ou modelo inclinado a 45°)"
                        >
                          <Compass className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => flipModel(m.id)}
                          className="text-slate-400 hover:text-amber-400 p-1 rounded hover:bg-slate-800 transition"
                          title="Virar 180° (Inverter cima/baixo se estiver de cabeça para baixo)"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadSingleModel(m.id, m.name)}
                          className="text-slate-400 hover:text-cyan-400 p-1 rounded hover:bg-slate-800 transition"
                          title="Baixar este modelo individual (.stl) no tamanho original"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => removeModel(m.id)}
                      className="text-slate-500 hover:text-rose-400 p-1 shrink-0"
                      title="Remover arquivo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
            {missingCount > 0 && (
              <p className="text-[11px] text-amber-300">
                {missingCount} sem medida — adicione o STL ou digite L×P.
              </p>
            )}
          </div>
        </div>

        {/* 3. Mapa */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3.5 space-y-2.5">
          <p className="text-xs font-bold text-white flex items-center gap-1.5">
            <LayoutGrid className="w-4 h-4 text-cyan-400" /> 3. Mapa da chapa
          </p>
          {!result ? (
            <p className="text-xs text-slate-400 text-center py-4">
              Selecione a impressora e adicione arquivos com medida para ver o mapa.
            </p>
          ) : (
            <>
              <div className="flex items-center gap-2.5 text-[11px] flex-wrap">
                <span className="px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-bold">
                  {Math.round(result.utilization * 100)}% da chapa
                </span>
                <span className="text-emerald-300 font-semibold">{result.placed.length} na chapa</span>
                {result.unplaced.length > 0 && (
                  <span className="text-amber-300 font-semibold">{result.unplaced.length} de fora → próxima mesa</span>
                )}
                {maxZ > 0 && (
                  <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300 font-bold">
                    <Clock className="w-3.5 h-3.5 text-purple-400" />
                    Tempo: {printEstimate.formattedDuration} · Conclusão {printEstimate.formattedCompletion} ({printEstimate.totalLayers} cam.)
                  </span>
                )}
                <span className="text-slate-400">~{estMB} MB p/ baixar</span>
              </div>
              {heightWarn && (
                <p className="text-[11px] text-rose-300 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Modelo com {fmtMm(maxZ)} passa da altura ({fmtMm(effH)}). Deite ou divida.
                </p>
              )}
              {/* Barra de Alternância: Prévia 3D Real (estilo Halot Box) vs Mapa 2D */}
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
                <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setViewMode("3d")}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition ${
                      viewMode === "3d"
                        ? "bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Prévia Real da Mesa (3D)
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("2d")}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition ${
                      viewMode === "2d"
                        ? "bg-slate-800 text-white font-bold"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    Mapa Técnico (2D)
                  </button>
                </div>
                <span className="text-[10px] text-slate-500 hidden sm:inline">
                  {viewMode === "3d" ? "Visualização anatômica das peças na mesa" : "Layout de etiquetas e coordenadas"}
                </span>
              </div>

              {/* Área do Canvas com Controles de Câmera Flutuantes */}
              <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-950 flex items-center justify-center min-h-[380px] sm:min-h-[460px]">
                <canvas
                  ref={mapRef}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  onWheel={handleWheel}
                  className={`w-full h-auto max-h-[460px] object-contain block select-none ${
                    viewMode === "3d" ? "cursor-grab active:cursor-grabbing" : ""
                  }`}
                  role="img"
                  aria-label="Mapa da chapa com os modelos encaixados"
                />

                {/* Controles Flutuantes da Câmera 3D */}
                {viewMode === "3d" && (
                  <>
                    <div className="absolute top-3 right-3 flex flex-col gap-1.5 bg-slate-950/80 backdrop-blur-md border border-slate-800 p-1 rounded-lg z-10 shadow-lg">
                      <button
                        type="button"
                        onClick={() => handleZoom(0.2)}
                        title="Aproximar (Zoom In)"
                        className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition"
                      >
                        <ZoomIn className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleZoom(-0.2)}
                        title="Afastar (Zoom Out)"
                        className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition"
                      >
                        <ZoomOut className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={handleResetCamera}
                        title="Restaurar Posição da Câmera"
                        className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="absolute top-3 left-3 bg-slate-950/75 backdrop-blur-md border border-slate-800/80 px-2.5 py-1 rounded-md text-[10px] text-slate-400 pointer-events-none flex items-center gap-1.5">
                      <Compass className="w-3 h-3 text-cyan-400" />
                      <span>Arraste para girar a mesa 360° · Roda do mouse para zoom</span>
                    </div>
                  </>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <ol className="space-y-1 text-[11px] text-slate-300">
                  {result.placed.map((p, i) => (
                    <li key={p.id} className="flex items-center gap-2 flex-wrap">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: MAP_COLORS[i % MAP_COLORS.length] }}
                      />
                      <span className="font-mono font-bold text-cyan-300 w-5">{i + 1}.</span>
                      <span className="font-semibold text-white truncate">{labelById.get(p.id)}</span>
                      <span>
                        x={p.x} y={p.y}{p.angle !== 0 ? ` · GIRAR ${p.angle}°` : ""}
                      </span>
                    </li>
                  ))}
                  {result.unplaced.map((u) => (
                    <li key={u.id} className="text-amber-300">
                      FORA: {labelById.get(u.id)} ({fmtMm(u.w)} × {fmtMm(u.d)}) —{" "}
                      {unplacedReason(u, effW, effD, gap, 2) === "too-big"
                        ? "grande demais para esta chapa"
                        : "sem espaço (vai na próxima mesa)"}
                    </li>
                  ))}
                </ol>
                <div className="flex flex-col gap-2 justify-start">
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={sendToSupports}
                      disabled={building || result.placed.length === 0}
                      className="gap-1.5 font-bold bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-full text-xs h-9 flex-1 disabled:opacity-40"
                    >
                      <Anchor className="w-4 h-4" />
                      Adicionar Suportes 3D
                    </Button>
                    <Button
                      size="sm"
                      onClick={downloadStl}
                      disabled={building || result.placed.length === 0}
                      className="gap-1.5 font-bold bg-white hover:bg-slate-200 text-slate-950 rounded-full text-xs h-9 flex-1 disabled:opacity-40"
                    >
                      <Download className="w-4 h-4" />
                      {building ? "Gerando..." : "Baixar mesa"}
                    </Button>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={copyMap}
                    className="rounded-full border-slate-700 text-slate-200 text-xs h-9 gap-1.5"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? "Copiado!" : "Copiar posições"}
                  </Button>
                  <p className="text-[10px] text-slate-500">
                    O STL sai com as peças na posição e encostadas na mesa. Use "Adicionar Suportes 3D" para aplicar balsa e suportes médios automáticos.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modal Ficha de Bancada com QR Code */}
      <Dialog
        open={worksheetOpen}
        onOpenChange={setWorksheetOpen}
        title="Ficha de Bancada & Ordem de Produção"
        description="Ficha física para controle de processo na bancada de pós-processamento, lavagem e cura."
      >
        <div className="space-y-4 pt-2 text-xs">
          {/* Cabeçalho da Ordem */}
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-[10px] text-slate-400 font-mono uppercase">Ordem de Impressão</p>
              <p className="font-bold text-white text-sm">
                Mesa {printer?.name || "Impressora"}
              </p>
              <p className="text-[11px] text-slate-400">
                Emitida em: {new Date().toLocaleDateString("pt-BR")} às {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </p>
              <div className="flex items-center gap-2 pt-1 text-[11px] flex-wrap">
                <span className="text-cyan-300 font-semibold">{result?.placed.length || 0} peças na chapa</span>
                <span className="text-slate-600">·</span>
                <span className="text-purple-300 font-semibold">{printEstimate.formattedDuration} impressão</span>
                <span className="text-slate-600">·</span>
                <span className="text-emerald-300 font-semibold">Término: {printEstimate.formattedCompletion}</span>
              </div>
            </div>

            {/* QR Code dinâmico SVG */}
            <div className="shrink-0 bg-white p-2 rounded-xl shadow-md text-center">
              <div
                dangerouslySetInnerHTML={{
                  __html: generateQRCodeSvg(
                    typeof window !== "undefined" ? `${window.location.origin}/fila` : "https://odontoprint.app/fila",
                    90
                  ),
                }}
              />
              <span className="text-[9px] text-slate-700 font-bold block mt-1">Ler na Fila</span>
            </div>
          </div>

          {/* Tabela de Modelos para Conferência Física */}
          <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950 max-h-56 overflow-y-auto">
            <table className="w-full text-[11px] text-left">
              <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800 text-[10px] sticky top-0">
                <tr>
                  <th className="py-2 px-3 w-8">Nº</th>
                  <th className="py-2 px-3">Paciente / Caso</th>
                  <th className="py-2 px-3">Tipo</th>
                  <th className="py-2 px-3 text-center">Lavado</th>
                  <th className="py-2 px-3 text-center">Cura UV</th>
                  <th className="py-2 px-3 text-center">CQ Visual</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {result?.placed.map((p, idx) => {
                  const m = models.find((mod) => mod.id === p.id);
                  const b = getWorkTypeBadgeInfo(m?.workType);
                  return (
                    <tr key={p.id} className="hover:bg-slate-900/40">
                      <td className="py-2 px-3 font-mono font-bold text-cyan-400">{idx + 1}</td>
                      <td className="py-2 px-3">
                        <span className="font-bold text-white block">{m?.patient || "PACIENTE"}</span>
                        <span className="text-[10px] text-slate-500">{m?.name}</span>
                      </td>
                      <td className="py-2 px-3">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold border ${b.badgeClass}`}>
                          {b.label}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-center text-slate-500 font-mono">[  ]</td>
                      <td className="py-2 px-3 text-center text-slate-500 font-mono">[  ]</td>
                      <td className="py-2 px-3 text-center text-slate-500 font-mono">[  ]</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Botões de Ação da Ficha */}
          <div className="flex items-center justify-between pt-2">
            <span className="text-[10px] text-slate-500">
              Assinatura do Técnico: ___________________________
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setWorksheetOpen(false)}
                className="rounded-full text-xs"
              >
                Fechar
              </Button>
              <Button
                size="sm"
                onClick={() => window.print()}
                className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-full text-xs gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                Imprimir Ficha
              </Button>
            </div>
          </div>
        </div>
      </Dialog>
    </AppShell>
  );
}
