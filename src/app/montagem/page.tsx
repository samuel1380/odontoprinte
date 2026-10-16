"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/layout/shell";
import { OdontoPrintService } from "@/services/odontoprint-service";
import type { PrinterWithStatus } from "@/types/domain";
import {
  parseStlDimensions,
  parseStlTriangles,
  buildPositionedStl,
  packPlate,
  detectPlate,
  unplacedReason,
  fmtMm,
  type ModelSize,
  type PackResult,
} from "@/lib/plate-nesting";
import { parseFileName } from "@/lib/parse-filename";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
} from "lucide-react";

interface UploadModel {
  id: string;
  file: File;
  name: string;
  patient: string;
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
  const [printers, setPrinters] = useState<PrinterWithStatus[]>([]);
  const [loadingPrinters, setLoadingPrinters] = useState(true);
  const [printerId, setPrinterId] = useState("");
  const [plateW, setPlateW] = useState("");
  const [plateD, setPlateD] = useState("");
  const [plateH, setPlateH] = useState("");
  const [savingPlate, setSavingPlate] = useState(false);
  const [gap, setGap] = useState(2);
  const [models, setModels] = useState<UploadModel[]>([]);
  const [copied, setCopied] = useState(false);
  const [building, setBuilding] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const trianglesById = useRef(new Map<string, Float32Array>());

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
          try {
            patient = parseFileName(f.name, []).patient || patient;
          } catch {
            // mantém nome do arquivo
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
          } as UploadModel;
        });
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
          const [size, tris] = await Promise.all([
            parseStlDimensions(m.file),
            /\.stl$/i.test(m.file.name)
              ? parseStlTriangles(m.file)
              : Promise.resolve(null),
          ]);
          if (cancelled) return;
          if (tris) trianglesById.current.set(m.id, tris.positions);
          setModels((prev) => prev.map((p) => (p.id === m.id ? { ...p, size, parsing: false } : p)));
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

  const result: PackResult | null = useMemo(() => {
    if (effW <= 0 || effD <= 0) return null;
    const items = models
      .map((m) => {
        const s = sized(m);
        if (!s) return null;
        return { id: m.id, label: m.patient, w: s.w, d: s.d };
      })
      .filter(Boolean) as { id: string; label: string; w: number; d: number }[];
    if (items.length === 0) return null;
    return packPlate(items, effW, effD, Math.max(0, gap), 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models, effW, effD, gap]);

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

  const copyMap = async () => {
    if (!result) return;
    const lines = [
      `MESA — chapa ${effW}×${effD}mm (${printer?.name || "?"})`,
      `Ocupação: ${Math.round(result.utilization * 100)}% · ${result.placed.length} na chapa, ${result.unplaced.length} de fora`,
      ...result.placed.map(
        (p, i) =>
          `${i + 1}. ${labelById.get(p.id)} → x=${p.x} y=${p.y} ${p.placedW}×${p.placedD}mm${p.rotated ? " (GIRAR 90°)" : ""}`
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
          rotated: p.rotated,
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
    setModels((prev) => prev.filter((m) => m.id !== id));
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
          <Button
            size="sm"
            onClick={downloadStl}
            disabled={!result || result.placed.length === 0 || building}
            className="gap-1.5 font-bold bg-white hover:bg-slate-200 text-slate-950 rounded-full text-xs h-9 px-5 disabled:opacity-40"
          >
            <Download className="w-4 h-4" />
            {building ? "Gerando..." : "Baixar mesa (.stl)"}
          </Button>
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
              <label className="text-[11px] text-slate-400 flex items-center gap-1.5 ml-auto">
                Espaço p/ conector (mm)
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={gap}
                  onChange={(e) => setGap(Math.max(1, Number(e.target.value) || 1))}
                  className="w-14 bg-slate-950 border border-slate-700 text-white rounded-lg px-1.5 py-1 text-[11px]"
                />
              </label>
            </div>
          </div>

          {/* 2. Arquivos */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3.5 space-y-2.5 h-fit">
            <p className="text-xs font-bold text-white flex items-center gap-1.5">
              <Upload className="w-4 h-4 text-cyan-400" /> 2. Modelos ({models.length})
            </p>
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
                      <p className="font-mono font-bold text-white truncate">{m.patient}</p>
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
              <div className="flex items-center gap-3 text-[11px] flex-wrap">
                <span className="px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-bold">
                  {Math.round(result.utilization * 100)}% da chapa
                </span>
                <span className="text-emerald-300 font-semibold">{result.placed.length} na chapa</span>
                {result.unplaced.length > 0 && (
                  <span className="text-amber-300 font-semibold">{result.unplaced.length} de fora → próxima mesa</span>
                )}
                <span className="text-slate-400">~{estMB} MB p/ baixar</span>
              </div>
              {heightWarn && (
                <p className="text-[11px] text-rose-300 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Modelo com {fmtMm(maxZ)} passa da altura ({fmtMm(effH)}). Deite ou divida.
                </p>
              )}
              <svg
                viewBox={`-8 -12 ${effW + 16} ${effD + 24}`}
                className="w-full h-auto max-h-[420px] rounded-xl bg-slate-950 border border-slate-800"
                role="img"
                aria-label="Mapa da chapa com os modelos encaixados"
              >
                <rect x={0} y={0} width={effW} height={effD} rx={2} fill="none" stroke="#334155" strokeWidth={0.8} />
                {result.placed.map((p, i) => (
                  <g key={p.id}>
                    <rect
                      x={p.x}
                      y={p.y}
                      width={p.placedW}
                      height={p.placedD}
                      rx={1.2}
                      fill={p.rotated ? "rgba(34,211,238,0.22)" : "rgba(34,211,238,0.12)"}
                      stroke="#22d3ee"
                      strokeWidth={0.7}
                    />
                    <text
                      x={p.x + p.placedW / 2}
                      y={p.y + p.placedD / 2}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="#e2e8f0"
                      fontSize={Math.max(3.2, Math.min(6, p.placedW / 4))}
                      fontWeight="bold"
                    >
                      {i + 1}
                    </text>
                  </g>
                ))}
              </svg>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <ol className="space-y-1 text-[11px] text-slate-300">
                  {result.placed.map((p, i) => (
                    <li key={p.id} className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-cyan-300 w-5">{i + 1}.</span>
                      <span className="font-semibold text-white truncate">{labelById.get(p.id)}</span>
                      <span>
                        x={p.x} y={p.y}{p.rotated ? " · GIRAR 90°" : ""}
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
                  <Button
                    size="sm"
                    onClick={downloadStl}
                    disabled={building || result.placed.length === 0}
                    className="gap-1.5 font-bold bg-white hover:bg-slate-200 text-slate-950 rounded-full text-xs h-9 disabled:opacity-40"
                  >
                    <Download className="w-4 h-4" />
                    {building ? "Gerando..." : "Baixar mesa (.stl)"}
                  </Button>
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
                    O STL sai com as peças na posição e encostadas na mesa. No fatiador, só adicione suportes e conectores.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
