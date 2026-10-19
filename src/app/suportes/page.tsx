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
} from "lucide-react";
import {
  generateDentalSupports,
  DEFAULT_DENTAL_SUPPORT_CONFIG,
  DENTAL_SUPPORT_PROFILES,
  type DentalSupportConfig,
  type SupportGenerationResult,
  type SupportProfileId,
} from "@/lib/support-generator";
import {
  parseStlTriangles,
  levelAndOrientDentalModel,
  flipModel180,
} from "@/lib/plate-nesting";
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

  // Configuração dos suportes e perfil ativo
  const [activeProfile, setActiveProfile] = useState<"FINE" | "MEDIUM" | "HEAVY">("MEDIUM");
  const [config, setConfig] = useState<DentalSupportConfig>({
    ...DENTAL_SUPPORT_PROFILES.MEDIUM.config,
  });
  const [viewMode, setViewMode] = useState<"top" | "iso">("top");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Verifica se veio alguma mesa gerada recentemente da tela de Montagem
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("odontoprint_pending_supports_mesh");
      const storedName = sessionStorage.getItem("odontoprint_pending_supports_name");
      if (stored) {
        sessionStorage.removeItem("odontoprint_pending_supports_mesh");
        sessionStorage.removeItem("odontoprint_pending_supports_name");

        const binaryString = atob(stored);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        parseStlTriangles(bytes.buffer)
          .then((parsed) => {
            setLoadedModel({
              name: storedName || "mesa-montada.stl",
              sizeBytes: bytes.byteLength,
              positions: parsed.positions,
              triangleCount: parsed.count,
            });
            toast.success("Mesa importada da seção de Montagem!");
          })
          .catch(() => {
            // ignora
          });
      }
    } catch {
      // armazenamento local indisponível ou vazio
    }
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
      const res = await generateDentalSupports(loadedModel.positions, config);
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

  // Renderização no Canvas (estilo do fatiador com modelos azuis e suportes amarelos)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !loadedModel) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    // Fundo da bancada de impressão
    ctx.fillStyle = "#090d16";
    ctx.fillRect(0, 0, W, H);

    // Grade milimétrica da mesa (estilo fatiador 3D)
    ctx.strokeStyle = "#172339";
    ctx.lineWidth = 1;
    const gridStep = 25;
    for (let x = 0; x < W; x += gridStep) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y < H; y += gridStep) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Bounding Box e escala para enquadrar na tela
    const pos = loadedModel.positions;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

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

    const modelW = maxX - minX || 1;
    const modelD = maxY - minY || 1;
    const modelH = maxZ - minZ || 1;

    const pad = 40;
    const scale = Math.min((W - pad * 2) / modelW, (H - pad * 2) / modelD);
    const offsetX = (W - modelW * scale) / 2 - minX * scale;
    const offsetY = (H - modelD * scale) / 2 - minY * scale;

    if (viewMode === "top") {
      // --- VISTA SUPERIOR (TOP-DOWN) ---

      // 1. Desenha Balsa (Raft) em Amarelo/Dourado se já calculada
      if (result) {
        ctx.fillStyle = "rgba(245, 158, 11, 0.4)";
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 2;

        const raftPad = config.raftMargin * scale;
        const rx = minX * scale + offsetX - raftPad;
        const ry = minY * scale + offsetY - raftPad;
        const rw = modelW * scale + raftPad * 2;
        const rh = modelD * scale + raftPad * 2;

        ctx.beginPath();
        ctx.roundRect(rx, ry, rw, rh, 8);
        ctx.fill();
        ctx.stroke();

        // 2. Desenha Pilares de Suporte em Dourado Brilhante
        ctx.fillStyle = "#fbbf24";
        for (const p of result.pillars) {
          const px = p.x * scale + offsetX;
          const py = p.y * scale + offsetY;
          ctx.beginPath();
          ctx.arc(px, py, Math.max(2, (config.pillarDiameter / 2) * scale), 0, Math.PI * 2);
          ctx.fill();

          // Se for suporte lateral, desenha linha de conexão com a parede
          if (p.targetX !== undefined && p.targetY !== undefined) {
            const tx = p.targetX * scale + offsetX;
            const ty = p.targetY * scale + offsetY;
            ctx.strokeStyle = "#fef08a";
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(tx, ty);
            ctx.stroke();

            ctx.fillStyle = "#fef08a";
            ctx.beginPath();
            ctx.arc(tx, ty, 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // 3. Desenha Geometria do Modelo Dentário em Azul Elétrico
      ctx.fillStyle = "rgba(14, 165, 233, 0.85)";
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 0.5;

      const triCount = Math.floor(pos.length / 9);
      const step = Math.max(1, Math.floor(triCount / 12000)); // amostragem fluida para preview

      for (let t = 0; t < triCount; t += step) {
        const off = t * 9;
        const ax = pos[off] * scale + offsetX;
        const ay = pos[off + 1] * scale + offsetY;
        const bx = pos[off + 3] * scale + offsetX;
        const by = pos[off + 4] * scale + offsetY;
        const cx = pos[off + 6] * scale + offsetX;
        const cy = pos[off + 7] * scale + offsetY;

        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.lineTo(cx, cy);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    } else {
      // --- VISTA ISOMÉTRICA / PERSPECTIVA LATERAL ---
      const isoX = (x: number, y: number) => {
        return (x - y) * Math.cos(Math.PI / 6) * scale * 0.85 + W / 2;
      };
      const isoY = (x: number, y: number, z: number) => {
        return (x + y) * Math.sin(Math.PI / 6) * scale * 0.5 - (z - minZ) * scale * 0.85 + H / 2 + 30;
      };

      // Desenha base da chapa
      ctx.fillStyle = "#1e293b";
      ctx.beginPath();
      ctx.moveTo(isoX(minX - 5, minY - 5), isoY(minX - 5, minY - 5, minZ));
      ctx.lineTo(isoX(maxX + 5, minY - 5), isoY(maxX + 5, minY - 5, minZ));
      ctx.lineTo(isoX(maxX + 5, maxY + 5), isoY(maxX + 5, maxY + 5, minZ));
      ctx.lineTo(isoX(minX - 5, maxY + 5), isoY(minX - 5, maxY + 5, minZ));
      ctx.closePath();
      ctx.fill();

      // Se houver suportes calculados: desenha balsa e pilares verticais
      if (result) {
        // Balsa
        ctx.fillStyle = "rgba(245, 158, 11, 0.6)";
        ctx.beginPath();
        ctx.moveTo(isoX(minX - config.raftMargin, minY - config.raftMargin), isoY(minX - config.raftMargin, minY - config.raftMargin, minZ + config.raftThickness));
        ctx.lineTo(isoX(maxX + config.raftMargin, minY - config.raftMargin), isoY(maxX + config.raftMargin, minY - config.raftMargin, minZ + config.raftThickness));
        ctx.lineTo(isoX(maxX + config.raftMargin, maxY + config.raftMargin), isoY(maxX + config.raftMargin, maxY + config.raftMargin, minZ + config.raftThickness));
        ctx.lineTo(isoX(minX - config.raftMargin, maxY + config.raftMargin), isoY(minX - config.raftMargin, maxY + config.raftMargin, minZ + config.raftThickness));
        ctx.closePath();
        ctx.fill();

        // Pilares verticais em dourado
        ctx.strokeStyle = "#fbbf24";
        ctx.lineWidth = Math.max(1.5, config.pillarDiameter * scale * 0.5);
        for (const p of result.pillars) {
          const px0 = isoX(p.x, p.y);
          const py0 = isoY(p.x, p.y, minZ + config.raftThickness);
          const stemTopZ = p.targetX !== undefined ? minZ + p.height - 0.4 : minZ + p.height;
          const pyStem = isoY(p.x, p.y, stemTopZ);

          // Haste vertical
          ctx.beginPath();
          ctx.moveTo(px0, py0);
          ctx.lineTo(px0, pyStem);
          ctx.stroke();

          // Ponta conectando ao modelo
          const targetX = p.targetX ?? p.x;
          const targetY = p.targetY ?? p.y;
          const px1 = isoX(targetX, targetY);
          const py1 = isoY(targetX, targetY, minZ + p.height);

          if (p.targetX !== undefined) {
            ctx.beginPath();
            ctx.moveTo(px0, pyStem);
            ctx.lineTo(px1, py1);
            ctx.stroke();
          }

          // Ponto de contato na ponta
          ctx.fillStyle = "#fef08a";
          ctx.beginPath();
          ctx.arc(px1, py1, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Modelo Dentário Isométrico em Azul
      ctx.fillStyle = "rgba(14, 165, 233, 0.75)";
      ctx.strokeStyle = "#0284c7";
      ctx.lineWidth = 0.5;

      const triCount = Math.floor(pos.length / 9);
      const step = Math.max(1, Math.floor(triCount / 8000));
      const zLift = result ? config.elevationZ : 0;

      for (let t = 0; t < triCount; t += step) {
        const off = t * 9;
        const ax = isoX(pos[off], pos[off + 1]);
        const ay = isoY(pos[off], pos[off + 1], pos[off + 2] + zLift);

        const bx = isoX(pos[off + 3], pos[off + 4]);
        const by = isoY(pos[off + 3], pos[off + 4], pos[off + 5] + zLift);

        const cx = isoX(pos[off + 6], pos[off + 7]);
        const cy = isoY(pos[off + 6], pos[off + 7], pos[off + 8] + zLift);

        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.lineTo(cx, cy);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
  }, [loadedModel, result, viewMode, config]);

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
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex items-center gap-3">
                  <FileCheck2 className="w-6 h-6 text-emerald-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-white truncate">{loadedModel.name}</p>
                    <p className="text-[10px] text-slate-400">
                      {(loadedModel.sizeBytes / (1024 * 1024)).toFixed(1)} MB ·{" "}
                      {loadedModel.triangleCount.toLocaleString()} triângulos
                    </p>
                  </div>
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

            {/* 2. Seleção de Suportes Odontológicos de Alta Precisão */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-amber-400" /> 2. Tipo de Suporte
                </span>
                <span className="text-[10px] bg-emerald-500/15 text-emerald-300 px-2 py-0.5 rounded-full font-semibold border border-emerald-500/25 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Alta Precisão Anti-Fusão
                </span>
              </div>

              {/* Botões Diretos: Suporte Fino, Médio e Grosso */}
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

              {/* Card Destaque: Padrão Odontológico Calibrado */}
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

                {/* Garantia Odontológica */}
                <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-2.5 space-y-1 text-[11px]">
                  <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Ancoragem Lateral & Inferior</span>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-normal">
                    Suportes aplicados apenas na base e laterais do zócalo. Dentes, cúspides e gengiva 100% protegidos contra marcas.
                  </p>
                </div>

                <div className="pt-1.5 border-t border-amber-500/20 flex items-center justify-between text-[10px] text-slate-400 flex-wrap gap-2">
                  <span>Haste: <strong className="text-white">{config.pillarDiameter} mm</strong></span>
                  <span>Ponta: <strong className="text-white">{config.tipDiameter} mm</strong></span>
                  <span>Folga da Parede: <strong className="text-emerald-300">{config.modelClearance} mm</strong></span>
                  <span>Dist. entre Suportes: <strong className="text-amber-300">≥ {config.minPillarDistance} mm</strong></span>
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
                  : `Gerar Suportes ${DENTAL_SUPPORT_PROFILES[activeProfile].name}s`}
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
                </div>

                <div className="pt-2 flex items-center justify-between border-t border-slate-800 text-[11px] text-slate-400">
                  <span>Estrutura STL final:</span>
                  <strong className="text-slate-200">
                    {result.totalTriangles.toLocaleString()} triângulos
                  </strong>
                </div>
              </div>
            )}
          </div>

          {/* Coluna Direita: Visualizador 3D / Canvas Preview */}
          <div className="lg:col-span-7 rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-3 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-cyan-400" /> Prévia da Bancada
                </span>
                <span className="text-[10px] text-slate-500 hidden sm:inline">
                  (Modelos em azul · Suportes e balsa em amarelo)
                </span>
              </div>

              {/* Alternador de Vista (Topo / Isométrica) */}
              <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setViewMode("top")}
                  className={`px-2.5 py-1 rounded-md font-medium transition ${
                    viewMode === "top"
                      ? "bg-slate-800 text-white font-bold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Topo (Planta)
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("iso")}
                  className={`px-2.5 py-1 rounded-md font-medium transition ${
                    viewMode === "iso"
                      ? "bg-slate-800 text-white font-bold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Perspectiva 3D
                </button>
              </div>
            </div>

            {/* Canvas Interativo */}
            <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-950 flex items-center justify-center min-h-[380px] sm:min-h-[460px]">
              <canvas
                ref={canvasRef}
                width={640}
                height={460}
                className="w-full h-auto max-h-[460px] object-contain block"
              />

              {!loadedModel && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-950/80">
                  <Anchor className="w-10 h-10 text-slate-700 mb-2" />
                  <p className="text-xs text-slate-400 max-w-xs">
                    Arraste ou selecione um arquivo de mesa (.stl) para visualizar e aplicar os suportes médios.
                  </p>
                </div>
              )}

              {/* Legenda Flutuante estilo Fatiador */}
              {loadedModel && (
                <div className="absolute bottom-3 left-3 bg-slate-950/85 backdrop-blur-md border border-slate-800/80 px-3 py-1.5 rounded-lg flex items-center gap-3 text-[10px]">
                  <span className="flex items-center gap-1.5 text-cyan-300 font-medium">
                    <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                    Modelos Dentários
                  </span>
                  <span className="flex items-center gap-1.5 text-amber-300 font-medium">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    Suportes & Balsa
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
