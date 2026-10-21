"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import { AppShell } from "@/components/layout/shell";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Anchor,
  Upload,
  Download,
  Trash2,
  Sliders,
  CheckCircle2,
  AlertCircle,
  FileCheck2,
  ShieldCheck,
  Sparkles,
  Layers,
  ArrowRight,
  Info,
  RotateCw,
  Eye,
  EyeOff,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Compass,
} from "lucide-react";
import {
  generateDentalSupports,
  DEFAULT_DENTAL_SUPPORT_CONFIG,
  DENTAL_SUPPORT_PROFILES,
  DENTAL_SUPPORT_CATEGORIES,
  detectIslands,
  type DentalSupportConfig,
  type SupportGenerationResult,
  type SupportProfileId,
  type DentalSupportCategoryId,
  type DetectedIsland,
} from "@/lib/support-generator";
import {
  parseStlTriangles,
  levelAndOrientDentalModel,
  flipModel180,
} from "@/lib/plate-nesting";
import { getPendingMesh } from "@/lib/mesh-storage";
import Link from "next/link";

interface LoadedModel {
  name: string;
  sizeBytes: number;
  positions: Float32Array;
  triangleCount: number;
}

export default function SuportesPage() {
  const [loadedModel, setLoadedModel] = useState<LoadedModel | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<SupportGenerationResult | null>(null);

  // Configuração dos suportes, categoria e perfil ativo
  const [activeCategory, setActiveCategory] = useState<DentalSupportCategoryId>("MODELS");
  const [activeProfile, setActiveProfile] = useState<"FINE" | "MEDIUM" | "HEAVY">("MEDIUM");
  const [config, setConfig] = useState<DentalSupportConfig>({
    ...DENTAL_SUPPORT_PROFILES.MEDIUM.config,
  });
  const [viewPreset, setViewPreset] = useState<"iso" | "bottom" | "top" | "front">("iso");
  const [yaw, setYaw] = useState<number>(-0.55);
  const [pitch, setPitch] = useState<number>(0.42);
  const [zoom, setZoom] = useState<number>(1.0);
  const [xRay, setXRay] = useState<boolean>(false);
  const [islands, setIslands] = useState<DetectedIsland[]>([]);
  const [plateMeta, setPlateMeta] = useState<{ plateW?: number; plateD?: number; printerName?: string } | null>(null);

  // Dimensões reais originais milimétricas do modelo (100% 1:1 sem redimensionamento)
  const modelDims = useMemo(() => {
    if (!loadedModel) return null;
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    const pos = loadedModel.positions;
    for (let i = 0; i < pos.length; i += 3) {
      if (pos[i] < minX) minX = pos[i];
      if (pos[i] > maxX) maxX = pos[i];
      if (pos[i + 1] < minY) minY = pos[i + 1];
      if (pos[i + 1] > maxY) maxY = pos[i + 1];
      if (pos[i + 2] < minZ) minZ = pos[i + 2];
      if (pos[i + 2] > maxZ) maxZ = pos[i + 2];
    }
    return {
      w: Math.round((maxX - minX) * 10) / 10,
      d: Math.round((maxY - minY) * 10) / 10,
      h: Math.round((maxZ - minZ) * 10) / 10,
    };
  }, [loadedModel]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDraggingRef = useRef<boolean>(false);
  const lastMousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Presets rápidos de câmera
  const applyPreset = (preset: "iso" | "bottom" | "top" | "front") => {
    setViewPreset(preset);
    if (preset === "iso") {
      setYaw(-0.55);
      setPitch(0.42);
      setZoom(1.0);
    } else if (preset === "bottom") {
      // Ângulo por baixo para visualização total e desobstruída dos suportes e pontos de contato
      setYaw(-0.55);
      setPitch(-0.52);
      setZoom(1.1);
    } else if (preset === "top") {
      setYaw(0);
      setPitch(Math.PI / 2 - 0.001);
      setZoom(1.0);
    } else if (preset === "front") {
      setYaw(0);
      setPitch(0.04);
      setZoom(1.0);
    }
  };

  const handleZoom = (delta: number) => {
    setZoom((prev) => Math.max(0.4, Math.min(4.0, +(prev + delta).toFixed(2))));
  };

  const handleResetCamera = () => {
    applyPreset("iso");
  };

  // Interatividade com Mouse e Touch no Canvas (Rotação 360° e Zoom)
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = true;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - lastMousePosRef.current.x;
    const dy = e.clientY - lastMousePosRef.current.y;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };

    setYaw((prev) => prev + dx * 0.008);
    setPitch((prev) => {
      const next = prev + dy * 0.008;
      return Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, next));
    });
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom((prev) => Math.max(0.4, Math.min(4.0, +(prev * factor).toFixed(2))));
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1) {
      isDraggingRef.current = true;
      lastMousePosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - lastMousePosRef.current.x;
    const dy = e.touches[0].clientY - lastMousePosRef.current.y;
    lastMousePosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };

    setYaw((prev) => prev + dx * 0.008);
    setPitch((prev) => {
      const next = prev + dy * 0.008;
      return Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, next));
    });
  };

  const handleTouchEnd = () => {
    isDraggingRef.current = false;
  };

  // Escaneia ilhas suspensas automaticamente
  useEffect(() => {
    if (!loadedModel) {
      setIslands([]);
      return;
    }
    const detected = detectIslands(loadedModel.positions, result?.pillars);
    setIslands(detected);
  }, [loadedModel, result]);

  // Verifica se veio alguma mesa gerada recentemente da tela de Montagem
  useEffect(() => {
    let active = true;
    getPendingMesh()
      .then((data) => {
        if (!active || !data) return;
        if (data.plateW && data.plateD) {
          setPlateMeta({ plateW: data.plateW, plateD: data.plateD, printerName: data.printerName });
        }
        parseStlTriangles(data.buffer)
          .then((parsed) => {
            if (!active) return;
            setLoadedModel({
              name: data.fileName || "mesa-montada.stl",
              sizeBytes: data.buffer.byteLength,
              positions: parsed.positions,
              triangleCount: parsed.count,
            });
            toast.success(`Mesa "${data.fileName}" importada com sucesso (${parsed.count.toLocaleString()} triângulos)!`);
          })
          .catch(() => {
            toast.error("Erro ao interpretar a malha da mesa montada.");
          });
      })
      .catch(() => {
        // ignora se vazio
      });

    return () => {
      active = false;
    };
  }, []);

  // Processa o arquivo STL recebido (arrastado ou selecionado)
  const handleFileProcess = async (file: File) => {
    if (!/\.stl$/i.test(file.name)) {
      toast.error("Por favor, selecione um arquivo no formato .STL.");
      return;
    }

    setLoadingFile(true);
    setResult(null);

    try {
      const parsed = await parseStlTriangles(file);
      setLoadedModel({
        name: file.name,
        sizeBytes: file.size,
        positions: parsed.positions,
        triangleCount: parsed.count,
      });
      toast.success(`Modelo "${file.name}" carregado no tamanho 100% original (${parsed.count.toLocaleString()} triângulos).`);
    } catch (err: any) {
      toast.error(err?.message || "Falha ao processar a geometria do arquivo STL.");
      setLoadedModel(null);
    } finally {
      setLoadingFile(false);
    }
  };

  const handleFlipModel = () => {
    if (!loadedModel) return;
    const flipped = flipModel180(loadedModel.positions);
    setLoadedModel({
      ...loadedModel,
      positions: flipped,
    });
    setResult(null);
    toast.success("Modelo invertido 180°!");
  };

  // Executa o motor de suportes médios odontológicos
  const handleGenerate = async () => {
    if (!loadedModel) {
      toast.error("Adicione um arquivo STL primeiro.");
      return;
    }

    setGenerating(true);
    try {
      // Pequeno timeout para permitir que o spinner do React pinte antes do cálculo intensivo
      await new Promise((r) => setTimeout(r, 40));
      const res = await generateDentalSupports(loadedModel.positions, {
        ...config,
        plateWidth: plateMeta?.plateW,
        plateDepth: plateMeta?.plateD,
      });
      setResult(res);
      toast.success(
        `Suportes médios gerados com sucesso! (${res.pillarCount} pilares e balsa anti-falhas aplicados).`
      );
    } catch (err: any) {
      toast.error(err?.message || "Erro ao calcular suportes.");
    } finally {
      setGenerating(false);
    }
  };

  // Baixa o STL final com suportes e balsa
  const handleDownload = () => {
    if (!result) return;
    try {
      const blob = new Blob([result.stlBuffer], { type: "model/stl" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const baseName = loadedModel?.name?.replace(/\.stl$/i, "") || "mesa";
      a.href = url;
      a.download = `${baseName}-com-suportes-medios.stl`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success("Arquivo baixado com sucesso! Pronto para fatiar no Chitubox / Halot Box.");
    } catch {
      toast.error("Falha ao preparar download do arquivo.");
    }
  };

  // Renderização 3D no Canvas (Câmera Órbita, Shading Direcional e Destaque de Suportes)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !loadedModel) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    // Fundo escuro de alto contraste da bancada fatiadora
    ctx.fillStyle = "#070b12";
    ctx.fillRect(0, 0, W, H);

    const pos = loadedModel.positions;
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i];
      const y = pos[i + 1];
      const z = pos[i + 2];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }

    const zLift = result ? config.elevationZ : 0;
    const modelW = maxX - minX || 1;
    const modelD = maxY - minY || 1;
    const modelH = (maxZ - minZ) + zLift || 1;

    // Centro do modelo e da cena para rotação orbital 360° perfeita
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const cz = minZ + ((maxZ - minZ) + zLift) / 2;

    // Escala para enquadramento na tela (estável: preserva proporção visual sem encolher o modelo pós-geração de suportes)
    const rawModelH = maxZ - minZ || 1;
    const maxDim = Math.max(modelW, modelD, rawModelH * 1.25, Math.hypot(modelW, modelD) * 0.72);
    const baseScale = Math.min((W - 80) / maxDim, (H - 80) / maxDim);
    const S = baseScale * zoom;

    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const cosP = Math.cos(pitch);
    const sinP = Math.sin(pitch);

    // Projeção 3D de ponto cartesiano para tela
    const project = (x: number, y: number, z: number) => {
      const dx = x - cx;
      const dy = y - cy;
      const dz = z - cz;

      // Rotação horizontal (Yaw)
      const rx = dx * cosY - dy * sinY;
      const ry = dx * sinY + dy * cosY;
      const rz = dz;

      // Rotação de inclinação vertical (Pitch)
      const px = rx;
      const py = ry * sinP - rz * cosP;
      const depth = ry * cosP + rz * sinP;

      return {
        x: W / 2 + px * S,
        y: H / 2 + py * S,
        depth,
      };
    };

    // 1. Grade e Plataforma de Impressão (Build Plate) em 3D
    const margin = Math.max(12, Math.max(modelW, modelD) * 0.16);
    const plateMinX = minX - margin;
    const plateMaxX = maxX + margin;
    const plateMinY = minY - margin;
    const plateMaxY = maxY + margin;
    const plateZ = minZ;

    const p0 = project(plateMinX, plateMinY, plateZ);
    const p1 = project(plateMaxX, plateMinY, plateZ);
    const p2 = project(plateMaxX, plateMaxY, plateZ);
    const p3 = project(plateMinX, plateMaxY, plateZ);

    // Plataforma de impressão chanfrada
    ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Grade milimétrica na mesa
    ctx.strokeStyle = "rgba(30, 41, 59, 0.6)";
    ctx.lineWidth = 0.8;
    const gridDivs = 8;
    for (let i = 1; i < gridDivs; i++) {
      const t = i / gridDivs;
      const gx = plateMinX + (plateMaxX - plateMinX) * t;
      const gy = plateMinY + (plateMaxY - plateMinY) * t;

      const lxA = project(gx, plateMinY, plateZ);
      const lxB = project(gx, plateMaxY, plateZ);
      ctx.beginPath();
      ctx.moveTo(lxA.x, lxA.y);
      ctx.lineTo(lxB.x, lxB.y);
      ctx.stroke();

      const lyA = project(plateMinX, gy, plateZ);
      const lyB = project(plateMaxX, gy, plateZ);
      ctx.beginPath();
      ctx.moveTo(lyA.x, lyA.y);
      ctx.lineTo(lyB.x, lyB.y);
      ctx.stroke();
    }

    // 2. Balsa (Raft) Chanfrada em 3D em Dourado
    if (result) {
      const rMargin = config.raftMargin;
      const rMinX = minX - rMargin;
      const rMaxX = maxX + rMargin;
      const rMinY = minY - rMargin;
      const rMaxY = maxY + rMargin;
      const rTopZ = minZ + config.raftThickness;

      const rf0 = project(rMinX, rMinY, rTopZ);
      const rf1 = project(rMaxX, rMinY, rTopZ);
      const rf2 = project(rMaxX, rMaxY, rTopZ);
      const rf3 = project(rMinX, rMaxY, rTopZ);

      ctx.fillStyle = "rgba(245, 158, 11, 0.35)";
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(rf0.x, rf0.y);
      ctx.lineTo(rf1.x, rf1.y);
      ctx.lineTo(rf2.x, rf2.y);
      ctx.lineTo(rf3.x, rf3.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Função de desenho de todos os Suportes (Pilares, Conexões e Pontos de Contato)
    const drawSupports = () => {
      if (!result) return;

      const baseZ = minZ + config.raftThickness;
      const pillarRadius = Math.max(1.8, (config.pillarDiameter / 2) * S * 0.7);

      for (const p of result.pillars) {
        const contactZ = minZ + p.height;
        const targetX = p.targetX ?? p.x;
        const targetY = p.targetY ?? p.y;

        const ptBase = project(p.x, p.y, baseZ);
        const ptStemTop = project(p.x, p.y, contactZ - 0.5);
        const ptContact = project(targetX, targetY, contactZ);

        // Sapata / Base de fixação na balsa
        ctx.fillStyle = "#b45309";
        ctx.beginPath();
        ctx.ellipse(ptBase.x, ptBase.y, pillarRadius * 1.6, pillarRadius * 0.9, 0, 0, Math.PI * 2);
        ctx.fill();

        // Pilar vertical: traço dourado com núcleo iluminado de alto contraste
        ctx.strokeStyle = "#b45309";
        ctx.lineWidth = pillarRadius * 2 + 1.2;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(ptBase.x, ptBase.y);
        ctx.lineTo(ptStemTop.x, ptStemTop.y);
        ctx.stroke();

        ctx.strokeStyle = "#fbbf24";
        ctx.lineWidth = Math.max(1.6, pillarRadius * 1.5);
        ctx.beginPath();
        ctx.moveTo(ptBase.x, ptBase.y);
        ctx.lineTo(ptStemTop.x, ptStemTop.y);
        ctx.stroke();

        // Conexão chanfrada até a parede (se pilar lateral)
        if (p.targetX !== undefined || p.targetY !== undefined) {
          ctx.strokeStyle = "#b45309";
          ctx.lineWidth = pillarRadius * 2 + 1;
          ctx.beginPath();
          ctx.moveTo(ptStemTop.x, ptStemTop.y);
          ctx.lineTo(ptContact.x, ptContact.y);
          ctx.stroke();

          ctx.strokeStyle = "#fef08a";
          ctx.lineWidth = Math.max(1.5, pillarRadius * 1.3);
          ctx.beginPath();
          ctx.moveTo(ptStemTop.x, ptStemTop.y);
          ctx.lineTo(ptContact.x, ptContact.y);
          ctx.stroke();
        }

        // Esfera destacada no Ponto de Contato com o modelo
        ctx.fillStyle = "#fef08a";
        ctx.strokeStyle = "#92400e";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(ptContact.x, ptContact.y, Math.max(2.8, pillarRadius * 1.2), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    };

    // Função de desenho da Geometria do Modelo Dentário com Iluminação Realista (Shading 3D)
    const drawModel = () => {
      const triCount = Math.floor(pos.length / 9);
      // Amostragem fluida para interatividade 60fps
      const step = Math.max(1, Math.floor(triCount / 14000));

      // Vetor de luz direcional fixo
      const lx = 0.45;
      const ly = 0.55;
      const lz = 0.70;

      for (let t = 0; t < triCount; t += step) {
        const off = t * 9;
        const ax = pos[off];
        const ay = pos[off + 1];
        const az = pos[off + 2] + zLift;

        const bx = pos[off + 3];
        const by = pos[off + 4];
        const bz = pos[off + 5] + zLift;

        const cx3 = pos[off + 6];
        const cy3 = pos[off + 7];
        const cz3 = pos[off + 8] + zLift;

        // Vetores de aresta para normal da face
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
          nx /= nLen;
          ny /= nLen;
          nz /= nLen;
        }

        // Normal no referencial da câmera
        const rotNx = nx * cosY - ny * sinY;
        const rotNy = nx * sinY + ny * cosY;
        const camNz = rotNy * sinP - nz * cosP;

        // Backface Culling: descarta faces viradas para trás quando não em Raio-X total
        if (camNz < -0.05 && !xRay) {
          continue;
        }

        // Iluminação Difusa com realce nas cúspides e cristas
        const dot = nx * lx + ny * ly + nz * lz;
        const diffuse = Math.max(0, dot);
        const light = 0.22 + 0.78 * diffuse;

        // Tons de resina azul odontológica fatiadora
        const r = Math.round(14 + 18 * light);
        const g = Math.round(100 * light + 25);
        const b = Math.round(200 * light + 45);
        const alpha = xRay ? 0.28 : 0.90;

        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;

        const pA = project(ax, ay, az);
        const pB = project(bx, by, bz);
        const pC = project(cx3, cy3, cz3);

        ctx.beginPath();
        ctx.moveTo(pA.x, pA.y);
        ctx.lineTo(pB.x, pB.y);
        ctx.lineTo(pC.x, pC.y);
        ctx.closePath();
        ctx.fill();

        // Contorno sutil para revelar as facetas anatômicas do dente
        if (!xRay) {
          ctx.strokeStyle = `rgba(56, 189, 248, 0.12)`;
          ctx.lineWidth = 0.4;
          ctx.stroke();
        }
      }
    };

    // Ordem de desenho com prioridade para garantir total visibilidade dos suportes:
    // Modelo desenhado com iluminação anatômica, seguido pelos suportes e esferas de contato
    drawModel();
    drawSupports();

  }, [loadedModel, result, config, yaw, pitch, zoom, xRay, viewPreset]);

  return (
    <AppShell>
      <div className="space-y-4 max-w-6xl mx-auto">
        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <Anchor className="w-5 h-5 text-amber-400" />
              Adicionar Suportes 3D
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Aplicação de balsa chanfrada e malha de suportes médios anti-falhas para fatiamento odontológico.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/montagem">
              <Button variant="outline" size="sm" className="rounded-full border-slate-700 text-xs text-slate-300 h-9">
                Ir para Montagem de Mesa
              </Button>
            </Link>
            {result && (
              <Button
                size="sm"
                onClick={handleDownload}
                className="gap-1.5 font-bold bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-full text-xs h-9 px-4 shadow-lg shadow-amber-400/20"
              >
                <Download className="w-4 h-4" />
                Baixar Mesa com Suportes (.stl)
              </Button>
            )}
          </div>
        </div>

        {/* Grade Principal: Entrada & Configurações à esquerda, Visualizador à direita */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Coluna Esquerda: Arquivo & Controles */}
          <div className="lg:col-span-5 space-y-4">
            {/* 1. Seleção / Upload de Arquivo */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Upload className="w-4 h-4 text-cyan-400" /> 1. Mesa ou Modelo STL
                </span>
                {loadedModel && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleFlipModel}
                      className="text-amber-400 hover:text-amber-300 text-xs flex items-center gap-1 transition"
                      title="Inverter 180° se o modelo estiver de cabeça para baixo"
                    >
                      <RotateCw className="w-3.5 h-3.5" /> Virar 180°
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLoadedModel(null);
                        setResult(null);
                      }}
                      className="text-slate-500 hover:text-rose-400 text-xs flex items-center gap-1 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Limpar
                    </button>
                  </div>
                )}
              </div>

              {!loadedModel ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer.files?.[0]) {
                      handleFileProcess(e.dataTransfer.files[0]);
                    }
                  }}
                  className="border-2 border-dashed border-slate-700 hover:border-amber-400/70 hover:bg-slate-800/40 rounded-2xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center gap-2"
                >
                  <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-200">
                      {loadingFile ? "Processando malha 3D..." : "Solte o arquivo da mesa (.stl) aqui"}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Clique para navegar · Aceita mesa montada ou modelos individuais
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 space-y-2.5">
                  <div className="flex items-center gap-3">
                    <FileCheck2 className="w-6 h-6 text-emerald-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-white truncate">{loadedModel.name}</p>
                      <p className="text-[10px] text-slate-400">
                        {(loadedModel.sizeBytes / (1024 * 1024)).toFixed(1)} MB ·{" "}
                        {loadedModel.triangleCount.toLocaleString()} triângulos
                      </p>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                      Escala 1:1 Preservada
                    </span>
                  </div>

                  {modelDims && (
                    <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-slate-800/80 text-[11px]">
                      <div className="bg-slate-900/80 px-2 py-1 rounded-lg border border-slate-800">
                        <span className="text-[9px] text-slate-500 block">Largura (X)</span>
                        <strong className="text-slate-200 font-mono">{modelDims.w} mm</strong>
                      </div>
                      <div className="bg-slate-900/80 px-2 py-1 rounded-lg border border-slate-800">
                        <span className="text-[9px] text-slate-500 block">Profund. (Y)</span>
                        <strong className="text-slate-200 font-mono">{modelDims.d} mm</strong>
                      </div>
                      <div className="bg-slate-900/80 px-2 py-1 rounded-lg border border-slate-800">
                        <span className="text-[9px] text-slate-500 block">Altura (Z)</span>
                        <strong className="text-slate-200 font-mono">{modelDims.h} mm</strong>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept=".stl"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) handleFileProcess(e.target.files[0]);
                  e.target.value = "";
                }}
              />
            </div>

            {/* 2. Seleção de Categoria & Tipo de Suporte */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-amber-400" /> 2. Categoria & Tipo de Suporte
                </span>
                <span className="text-[10px] bg-emerald-500/15 text-emerald-300 px-2 py-0.5 rounded-full font-semibold border border-emerald-500/25 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Anti-Distorção Lateral
                </span>
              </div>

              {/* Seletor de Categorias Odontológicas */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-400 block">
                  Categoria de Aplicação:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800 text-[11px]">
                  {(["MODELS", "VENEERS", "CROWNS", "GUIDES"] as const).map((catKey) => {
                    const cat = DENTAL_SUPPORT_CATEGORIES[catKey];
                    const isSelected = activeCategory === catKey;
                    return (
                      <button
                        key={catKey}
                        type="button"
                        onClick={() => {
                          setActiveCategory(catKey);
                          setResult(null);
                        }}
                        className={`py-1.5 px-2 rounded-lg text-center transition flex flex-col items-center justify-center gap-0.5 ${
                          isSelected
                            ? "bg-amber-400 text-slate-950 font-bold shadow-sm"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                        }`}
                      >
                        <span className="leading-tight truncate w-full">{cat.name}</span>
                        <span
                          className={`text-[9px] px-1 py-0.2 rounded font-normal ${
                            isSelected
                              ? "bg-slate-900/20 text-slate-950 font-bold"
                              : cat.isConfigured
                              ? "text-emerald-400"
                              : "text-slate-500"
                          }`}
                        >
                          {cat.badge}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {activeCategory !== "MODELS" && (
                <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-3 text-xs space-y-1">
                  <p className="font-semibold text-cyan-300 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5" />
                    Categoria: {DENTAL_SUPPORT_CATEGORIES[activeCategory].label}
                  </p>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    {DENTAL_SUPPORT_CATEGORIES[activeCategory].description}
                  </p>
                  <p className="text-[10px] text-amber-300 font-medium pt-1">
                    * Calibração fina em desenvolvimento para esta categoria. No momento, o gerador opera com os parâmetros seguros de Modelos.
                  </p>
                </div>
              )}

              {/* Botões Diretos de Perfil: Suporte Fino, Médio e Grosso */}
              <div className="grid grid-cols-3 gap-2 p-1.5 bg-slate-950 rounded-2xl border border-slate-800">
                {(["FINE", "MEDIUM", "HEAVY"] as const).map((pKey) => {
                  const p = DENTAL_SUPPORT_PROFILES[pKey];
                  const isActive = activeProfile === pKey;
                  return (
                    <button
                      key={pKey}
                      type="button"
                      onClick={() => {
                        setActiveProfile(pKey);
                        setConfig({ ...p.config });
                        setResult(null);
                      }}
                      className={`flex flex-col items-center justify-center py-2.5 px-2 rounded-xl transition text-center ${
                        isActive
                          ? "bg-amber-400 text-slate-950 shadow-md font-bold"
                          : "text-slate-400 hover:text-slate-100 hover:bg-slate-900"
                      }`}
                    >
                      <span className="text-xs font-bold leading-tight">
                        Suporte {p.name}
                      </span>
                      <span className={`text-[10px] mt-0.5 ${isActive ? "text-slate-900 font-semibold" : "text-slate-500"}`}>
                        {p.badge}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Card Destaque: Padrão Odontológico Calibrado com Amarração Lateral */}
              <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-3.5 text-xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> {DENTAL_SUPPORT_PROFILES[activeProfile].label}
                  </span>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-semibold border border-emerald-500/30">
                    Anti-Fusão Ativa
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  {DENTAL_SUPPORT_PROFILES[activeProfile].description}
                </p>

                {/* Garantia Odontológica: Destaque de Amarração Lateral */}
                <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-2.5 space-y-1.5 text-[11px]">
                  <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Amarração Lateral Contínua Anti-Distorção</span>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-normal">
                    Malha reforçada de suportes em toda a lateral do zócalo. Trava as paredes contra deformação e sucção do FEP, mantendo cúspides e dentes 100% livres de marcas.
                  </p>
                </div>

                <div className="pt-2 border-t border-amber-500/20 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-slate-400">
                  <div>Haste (Diameter): <strong className="text-white font-mono">{config.pillarDiameter.toFixed(2)} mm</strong></div>
                  <div>Contato (Esfera): <strong className="text-white font-mono">Ø {config.tipDiameter.toFixed(2)} mm</strong></div>
                  <div>Comprimento do Topo: <strong className="text-amber-300 font-mono">{config.tipLength.toFixed(2)} mm</strong></div>
                  <div>Profundidade de Contato: <strong className="text-emerald-300 font-mono">{config.tipPenetration.toFixed(2)} mm</strong></div>
                  <div>Folga da Parede: <strong className="text-slate-200 font-mono">{config.modelClearance.toFixed(2)} mm</strong></div>
                  <div>Distância Anti-Fusão: <strong className="text-amber-300 font-mono">≥ {config.minPillarDistance.toFixed(2)} mm</strong></div>
                </div>
              </div>

              {/* Botão de Ação: Gerar Suportes */}
              <Button
                size="sm"
                onClick={handleGenerate}
                disabled={!loadedModel || generating}
                className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl text-xs h-10 mt-1 gap-2 shadow-lg shadow-cyan-500/20"
              >
                <Anchor className="w-4 h-4" />
                {generating
                  ? "Calculando geometria e suportes..."
                  : `Gerar Suportes ${DENTAL_SUPPORT_PROFILES[activeProfile].name}s (${DENTAL_SUPPORT_CATEGORIES[activeCategory].name})`}
              </Button>
            </div>

            {/* 3. Indicadores & Resumo do Cálculo */}
            {result && (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Resumo da Aplicação
                </span>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-500 block">Pilares Criados</span>
                    <span className="text-sm font-bold text-amber-300">{result.pillarCount} suportes</span>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-500 block">Consumo Suportes</span>
                    <span className="text-sm font-bold text-cyan-300">~{result.estimatedResinMl} ml resina</span>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-500 block">Altura Final Z</span>
                    <span className="text-sm font-bold text-white">{result.bounds.height} mm</span>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-500 block">Tempo de Geração</span>
                    <span className="text-sm font-bold text-emerald-400">{result.durationMs} ms</span>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 col-span-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-500">Dimensões da Peça (X × Y × Z)</span>
                      <span className="text-[10px] text-emerald-400 font-semibold">Escala 1:1 original</span>
                    </div>
                    <span className="text-xs font-bold text-white font-mono mt-0.5 block">
                      {modelDims ? `${modelDims.w} mm × ${modelDims.d} mm (altura ${modelDims.h} mm)` : `${result.bounds.width} × ${result.bounds.depth} mm`}
                    </span>
                  </div>

                  {plateMeta?.plateW && plateMeta?.plateD && (
                    <div className="col-span-2">
                      {result.bounds.width > plateMeta.plateW || result.bounds.depth > plateMeta.plateD ? (
                        <div className="bg-rose-500/15 border border-rose-500/40 rounded-xl p-2.5 text-xs text-rose-300 space-y-1">
                          <div className="font-bold flex items-center gap-1.5 text-rose-200">
                            <AlertCircle className="w-4 h-4 text-rose-400" />
                            Atenção: A balsa excede a chapa da impressora!
                          </div>
                          <p className="text-[10px] leading-relaxed text-rose-300/90">
                            Balsa total: <strong>{result.bounds.width} × {result.bounds.depth} mm</strong>. Área da impressora {plateMeta.printerName || ""}: <strong>{plateMeta.plateW} × {plateMeta.plateD} mm</strong>.
                          </p>
                        </div>
                      ) : (
                        <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-2 text-[10px] text-emerald-300 flex items-center justify-between">
                          <span>Chapa ({plateMeta.printerName || "Impressora"}):</span>
                          <strong>{result.bounds.width} × {result.bounds.depth} mm (Dentro da mesa de {plateMeta.plateW}×{plateMeta.plateD} mm)</strong>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="pt-2 flex items-center justify-between border-t border-slate-800 text-[11px] text-slate-400">
                  <span>Estrutura STL final:</span>
                  <strong className="text-slate-200">
                    {result.totalTriangles.toLocaleString()} triângulos
                  </strong>
                </div>
              </div>
            )}

            {/* 4. Detector de Ilhas Suspensas no Ar (Island Detector) */}
            {loadedModel && (
              <div className={`rounded-2xl border p-4 space-y-2.5 transition ${
                islands.length === 0
                  ? "border-emerald-500/30 bg-emerald-950/20"
                  : "border-amber-500/40 bg-amber-950/25"
              }`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold flex items-center gap-1.5 text-white">
                    <AlertCircle className={`w-4 h-4 ${islands.length === 0 ? "text-emerald-400" : "text-amber-400"}`} />
                    Detector de Ilhas Suspensas
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                    islands.length === 0
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                      : "bg-amber-500/20 text-amber-300 border-amber-500/30"
                  }`}>
                    {islands.length === 0 ? "100% Ancorado" : `${islands.length} Alertas`}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  {islands.length === 0
                    ? "Excelente! Nenhuma ilha suspensa no ar detectada. Toda a geometria possui sustentação sólida para impressão no FEP."
                    : `Atenção: Detectamos ${islands.length} região(ões) com início no ar sem suporte sólido embaixo. A aplicação de suportes evita descolamento e furos no FEP.`}
                </p>
              </div>
            )}
          </div>

          {/* Coluna Direita: Visualizador 3D / Canvas Preview */}
          <div className="lg:col-span-7 rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-3 flex flex-col justify-between">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-cyan-400" /> Prévia da Bancada 3D
                </span>
                <span className="text-[10px] text-slate-500 hidden sm:inline">
                  (Órbita 360° · Iluminação Anatômica)
                </span>
              </div>

              {/* Barra de Controles: Presets e Raio-X */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => applyPreset("iso")}
                    className={`px-2.5 py-1 rounded-md font-medium transition ${
                      viewPreset === "iso"
                        ? "bg-slate-800 text-white font-bold"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Perspectiva 3D
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset("bottom")}
                    className={`px-2.5 py-1 rounded-md font-medium transition ${
                      viewPreset === "bottom"
                        ? "bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30"
                        : "text-amber-400 hover:text-amber-200"
                    }`}
                    title="Olhar por baixo para inspecionar os suportes e pontos de contato"
                  >
                    Por Baixo (Ver Suportes)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset("top")}
                    className={`px-2.5 py-1 rounded-md font-medium transition ${
                      viewPreset === "top"
                        ? "bg-slate-800 text-white font-bold"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Topo
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset("front")}
                    className={`px-2.5 py-1 rounded-md font-medium transition ${
                      viewPreset === "front"
                        ? "bg-slate-800 text-white font-bold"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Frente
                  </button>
                </div>

                {/* Alternador de Modo Raio-X */}
                <button
                  type="button"
                  onClick={() => setXRay((prev) => !prev)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition ${
                    xRay
                      ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                      : "bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200"
                  }`}
                  title="Ativa transparência vítrea no modelo para ver os suportes ocultos"
                >
                  {xRay ? <EyeOff className="w-3.5 h-3.5 text-cyan-400" /> : <Eye className="w-3.5 h-3.5 text-slate-400" />}
                  Raio-X
                </button>
              </div>
            </div>

            {/* Canvas Interativo com Rotação 360° e Zoom */}
            <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-950 flex items-center justify-center min-h-[400px] sm:min-h-[480px]">
              <canvas
                ref={canvasRef}
                width={720}
                height={480}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                className="w-full h-auto max-h-[480px] object-contain block cursor-grab active:cursor-grabbing select-none"
              />

              {!loadedModel && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-950/80 pointer-events-none">
                  <Anchor className="w-10 h-10 text-slate-700 mb-2" />
                  <p className="text-xs text-slate-400 max-w-xs">
                    Arraste ou selecione um arquivo de mesa (.stl) para visualizar e aplicar os suportes médios.
                  </p>
                </div>
              )}

              {/* Controles Flutuantes de Zoom e Reset */}
              {loadedModel && (
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
                    title="Restaurar Câmera"
                    className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Dica de Interação */}
              {loadedModel && (
                <div className="absolute top-3 left-3 bg-slate-950/75 backdrop-blur-md border border-slate-800/80 px-2.5 py-1 rounded-md text-[10px] text-slate-400 pointer-events-none flex items-center gap-1.5">
                  <Compass className="w-3 h-3 text-cyan-400" />
                  <span>Arraste para girar 360° · Roda do mouse para zoom</span>
                </div>
              )}

              {/* Legenda Flutuante estilo Fatiador Profissional */}
              {loadedModel && (
                <div className="absolute bottom-3 left-3 bg-slate-950/85 backdrop-blur-md border border-slate-800/80 px-3 py-1.5 rounded-lg flex items-center gap-3 text-[10px] flex-wrap pointer-events-none">
                  <span className="flex items-center gap-1.5 text-cyan-300 font-medium">
                    <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                    Modelo (Resina Azul)
                  </span>
                  <span className="flex items-center gap-1.5 text-amber-300 font-medium">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    Suportes & Balsa
                  </span>
                  <span className="flex items-center gap-1.5 text-yellow-200 font-medium">
                    <span className="w-2.5 h-2.5 rounded-full bg-yellow-200 ring-1 ring-amber-600" />
                    Pontos de Contato
                  </span>
                </div>
              )}
            </div>

            {/* Rodapé informativo */}
            <div className="bg-slate-950/50 rounded-xl p-3 border border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1.5 text-[11px]">
                <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                Compatível com qualquer impressora de resina (Chitubox, Lychee, Halot Box, Anycubic).
              </span>
              {result && (
                <Button
                  size="sm"
                  onClick={handleDownload}
                  className="rounded-full bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs h-7 px-3 shrink-0"
                >
                  Baixar STL
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
