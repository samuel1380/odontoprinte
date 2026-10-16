"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { OdontoPrintService } from "@/services/odontoprint-service";
import type { PrintCardItem, PrinterWithStatus } from "@/types/domain";
import type { OrderGroup } from "@/app/fila/page";
import {
  parseStlDimensions,
  packPlate,
  detectPlate,
  fmtMm,
  type ModelSize,
  type PackResult,
} from "@/lib/plate-nesting";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { LayoutGrid, Upload, Copy, Check, Ruler, AlertTriangle, Printer } from "lucide-react";

interface Props {
  group: OrderGroup;
  printers: PrinterWithStatus[];
  onClose: () => void;
  onPrintersChanged: () => void;
}

interface FileDims {
  size: ModelSize | null;
  error?: string;
  parsing: boolean;
}

/**
 * Montagem automática da mesa: joga os STL, o sistema lê as medidas reais
 * e encaixa os modelos na chapa (visual + posições para repetir no fatiador).
 * Nada é enviado: tudo acontece neste navegador.
 */
export function AutoLayoutModal({ group, printers, onClose, onPrintersChanged }: Props) {
  const [printerId, setPrinterId] = useState<string>(
    group.printer_id || printers[0]?.id || ""
  );
  const [gap, setGap] = useState(2);
  const [plateW, setPlateW] = useState("");
  const [plateD, setPlateD] = useState("");
  const [plateH, setPlateH] = useState("");
  const [savingPlate, setSavingPlate] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [dims, setDims] = useState<Record<string, FileDims>>({});
  const [manual, setManual] = useState<Record<string, { w: string; d: string }>>({});
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const printer = printers.find((p) => p.id === printerId);
  const detected = printer ? detectPlate(printer.brand, printer.model) : null;

  // Medida efetiva: salvo na impressora > detectado pelo modelo
  const effW = Number(plateW) > 0 ? Number(plateW) : printer?.plate_width_mm || detected?.w || 0;
  const effD = Number(plateD) > 0 ? Number(plateD) : printer?.plate_depth_mm || detected?.d || 0;
  const effH = Number(plateH) > 0 ? Number(plateH) : printer?.plate_height_mm || detected?.h || 0;

  // Preenche os campos com o salvo/detectado ao trocar de impressora
  useEffect(() => {
    setPlateW(printer?.plate_width_mm ? String(printer.plate_width_mm) : "");
    setPlateD(printer?.plate_depth_mm ? String(printer.plate_depth_mm) : "");
    setPlateH(printer?.plate_height_mm ? String(printer.plate_height_mm) : "");
  }, [printerId]);

  const byName = useMemo(() => {
    const map = new Map<string, File>();
    for (const f of files) map.set(f.name.toLowerCase(), f);
    return map;
  }, [files]);

  // Lê dimensões dos arquivos novos em segundo plano
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const f of files) {
        const key = f.name.toLowerCase();
        if (dims[key] || !byName.has(key)) continue;
        setDims((p) => ({ ...p, [key]: { size: null, parsing: true } }));
        try {
          const size = await parseStlDimensions(f);
          if (!cancelled) setDims((p) => ({ ...p, [key]: { size, parsing: false } }));
        } catch (err: any) {
          if (!cancelled)
            setDims((p) => ({
              ...p,
              [key]: { size: null, parsing: false, error: err?.message || "Falha ao ler" },
            }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  const addFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const valid = Array.from(list).filter((f) => /\.(stl|obj|3mf|ply)$/i.test(f.name));
    if (valid.length < list.length) toast.warning("Somente arquivos 3D (.stl, .obj, .3mf, .ply).");
    setFiles((prev) => {
      const names = new Set(prev.map((p) => p.name.toLowerCase()));
      return [...prev, ...valid.filter((f) => !names.has(f.name.toLowerCase()))];
    });
  };

  const itemSize = (item: PrintCardItem): { w: number; d: number; z: number; auto: boolean } | null => {
    const f = byName.get((item.file_name || "").toLowerCase());
    const parsed = f ? dims[f.name.toLowerCase()]?.size : null;
    if (parsed) return { w: parsed.x, d: parsed.y, z: parsed.z, auto: true };
    const m = manual[item.id];
    const w = Number(m?.w);
    const d = Number(m?.d);
    if (w > 0 && d > 0) return { w, d, z: 0, auto: false };
    return null;
  };

  const result: PackResult | null = useMemo(() => {
    if (effW <= 0 || effD <= 0) return null;
    const models = group.items
      .map((item) => {
        const s = itemSize(item);
        if (!s) return null;
        return { id: item.id, label: item.patient_code, w: s.w, d: s.d };
      })
      .filter(Boolean) as { id: string; label: string; w: number; d: number }[];
    if (models.length === 0) return null;
    return packPlate(models, effW, effD, Math.max(0, gap), 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.items, effW, effD, gap, dims, manual, files]);

  const parsingCount = Object.values(dims).filter((d) => d.parsing).length;
  const missingCount = group.items.filter((i) => !itemSize(i)).length;
  const maxZ = Math.max(
    0,
    ...group.items.map((i) => itemSize(i)?.z || 0)
  );
  const heightWarn = effH > 0 && maxZ > effH;

  const labelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of group.items) map.set(i.id, `${i.patient_code} (${i.file_name || "sem arquivo"})`);
    return map;
  }, [group.items]);

  const copyMap = async () => {
    if (!result) return;
    const lines = [
      `MESA ${group.title} — chapa ${effW}×${effD}mm (${printer?.name || "?"})`,
      `Ocupação: ${Math.round(result.utilization * 100)}% · ${result.placed.length} na chapa, ${result.unplaced.length} de fora`,
      ...result.placed.map(
        (p, i) =>
          `${i + 1}. ${labelById.get(p.id)} → x=${p.x} y=${p.y} ${p.placedW}×${p.placedD}mm${p.rotated ? " (GIRAR 90°)" : ""}`
      ),
      ...result.unplaced.map((u) => `FORA: ${labelById.get(u.id)} (${u.w}×${u.d}mm) — vai na próxima mesa`),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  const savePlate = async () => {
    if (!printer) return;
    const w = Number(plateW);
    const d = Number(plateD);
    const h = Number(plateH);
    if (!(w > 0) || !(d > 0)) {
      toast.error("Informe largura e profundidade da chapa em mm.");
      return;
    }
    setSavingPlate(true);
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
      onPrintersChanged();
    } finally {
      setSavingPlate(false);
    }
  };

  const scale = effW > 0 && effD > 0 ? Math.min(560 / effW, 340 / effD) : 1;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title={`Montagem automática — ${group.title}`}>
      <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
        {/* 1. Impressora + medida da chapa */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3.5 space-y-3">
          <p className="text-xs font-bold text-white flex items-center gap-1.5">
            <Printer className="w-4 h-4 text-cyan-400" /> 1. Chapa da impressora
          </p>
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
          {printer && (
            <p className="text-[11px] text-slate-400">
              Detectado: <strong className="text-slate-200">{detected?.label}</strong>
              {printer.plate_width_mm ? " · medida salva na impressora" : " · confira e salve"}
            </p>
          )}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Largura (mm)", value: plateW, set: setPlateW, ph: detected ? String(detected.w) : "" },
              { label: "Profund. (mm)", value: plateD, set: setPlateD, ph: detected ? String(detected.d) : "" },
              { label: "Altura (mm)", value: plateH, set: setPlateH, ph: detected ? String(detected.h) : "" },
            ].map((f) => (
              <div key={f.label}>
                <label className="text-[10px] text-slate-400 block mb-1">{f.label}</label>
                <input
                  type="number"
                  min={0}
                  value={f.value}
                  placeholder={f.ph}
                  onChange={(e) => f.set(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl px-2.5 py-1.5 text-sm focus:outline-none focus:border-cyan-400"
                />
              </div>
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={savePlate}
            disabled={!printerId || savingPlate}
            className="rounded-full border-slate-700 text-slate-200 text-xs h-8 gap-1.5"
          >
            <Ruler className="w-3.5 h-3.5" />
            {savingPlate ? "Salvando..." : "Salvar medida na impressora"}
          </Button>
        </div>

        {/* 2. Arquivos */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3.5 space-y-2.5">
          <p className="text-xs font-bold text-white flex items-center gap-1.5">
            <Upload className="w-4 h-4 text-cyan-400" /> 2. Arquivos da mesa ({files.length} lidos)
          </p>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full border-2 border-dashed border-slate-700 hover:border-cyan-500 rounded-2xl p-4 text-center text-xs text-slate-300 transition"
          >
            Clique para selecionar os STL/OBJ da mesa
            <span className="block text-[10px] text-slate-500 mt-1">
              Só lê as medidas aqui no aparelho — nada é enviado
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".stl,.obj,.3mf,.ply"
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          {parsingCount > 0 && (
            <p className="text-[11px] text-cyan-300">Lendo medidas... ({parsingCount})</p>
          )}
          {missingCount > 0 && files.length > 0 && (
            <p className="text-[11px] text-amber-300 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              {missingCount} modelo(s) sem arquivo — informe L×P manual abaixo ou adicione o arquivo.
            </p>
          )}
          <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
            {group.items.map((item) => {
              const s = itemSize(item);
              const f = byName.get((item.file_name || "").toLowerCase());
              const st = f ? dims[f.name.toLowerCase()] : undefined;
              return (
                <div key={item.id} className="flex items-center gap-2 text-xs bg-slate-950/60 border border-slate-800 rounded-xl px-2.5 py-1.5">
                  <span className="font-mono font-bold text-white truncate flex-1">{item.patient_code}</span>
                  {s ? (
                    <span className="text-slate-300 shrink-0">
                      {fmtMm(s.w)} × {fmtMm(s.d)}
                      {s.auto ? "" : " (manual)"}
                    </span>
                  ) : st?.error ? (
                    <span className="text-rose-300 text-[10px] shrink-0">erro no arquivo</span>
                  ) : (
                    <span className="flex items-center gap-1 shrink-0">
                      <input
                        type="number"
                        min={0}
                        placeholder="L"
                        value={manual[item.id]?.w || ""}
                        onChange={(e) =>
                          setManual((p) => ({ ...p, [item.id]: { w: e.target.value, d: p[item.id]?.d || "" } }))
                        }
                        className="w-14 bg-slate-900 border border-slate-700 text-white rounded-lg px-1.5 py-1 text-[11px]"
                      />
                      <span className="text-slate-500">×</span>
                      <input
                        type="number"
                        min={0}
                        placeholder="P"
                        value={manual[item.id]?.d || ""}
                        onChange={(e) =>
                          setManual((p) => ({ ...p, [item.id]: { w: p[item.id]?.w || "", d: e.target.value } }))
                        }
                        className="w-14 bg-slate-900 border border-slate-700 text-white rounded-lg px-1.5 py-1 text-[11px]"
                      />
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 3. Mapa da chapa */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs font-bold text-white flex items-center gap-1.5">
              <LayoutGrid className="w-4 h-4 text-cyan-400" /> 3. Mapa da chapa
            </p>
            <label className="text-[11px] text-slate-400 flex items-center gap-1.5">
              Espaço p/ conector (mm)
              <input
                type="number"
                min={0}
                max={10}
                value={gap}
                onChange={(e) => setGap(Number(e.target.value))}
                className="w-14 bg-slate-950 border border-slate-700 text-white rounded-lg px-1.5 py-1 text-[11px]"
              />
            </label>
          </div>

          {!result ? (
            <p className="text-xs text-slate-400 text-center py-4">
              Selecione a impressora e informe os tamanhos (via arquivo ou manual) para ver o mapa.
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
              </div>
              {heightWarn && (
                <p className="text-[11px] text-rose-300 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Modelo com {fmtMm(maxZ)} de altura passa da chapa ({fmtMm(effH)}). Deite ou divida.
                </p>
              )}
              <svg
                viewBox={`-8 -12 ${effW + 16} ${effD + 24}`}
                className="w-full h-auto rounded-xl bg-slate-950 border border-slate-800"
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
              <ol className="space-y-1 text-[11px] text-slate-300">
                {result.placed.map((p, i) => (
                  <li key={p.id} className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-cyan-300 w-5">{i + 1}.</span>
                    <span className="font-semibold text-white">{labelById.get(p.id)}</span>
                    <span>
                      x={p.x} y={p.y} · {fmtMm(p.placedW)} × {fmtMm(p.placedD)}
                      {p.rotated ? " · GIRAR 90°" : ""}
                    </span>
                  </li>
                ))}
                {result.unplaced.map((u) => (
                  <li key={u.id} className="text-amber-300">
                    FORA: {labelById.get(u.id)} ({fmtMm(u.w)} × {fmtMm(u.d)}) — próxima mesa
                  </li>
                ))}
              </ol>
              <Button
                size="sm"
                variant="outline"
                onClick={copyMap}
                className="rounded-full border-slate-700 text-slate-200 text-xs h-8 gap-1.5"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copiado!" : "Copiar mapa (colar no fatiador)"}
              </Button>
              <p className="text-[10px] text-slate-500">
                No Halot Box/Chitubox: importe os arquivos, posicione pela grade (x/y acima) e adicione suportes + conectores por lá.
              </p>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}
