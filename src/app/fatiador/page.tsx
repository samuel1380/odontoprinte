"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/shell";
import { OdontoPrintService } from "@/services/odontoprint-service";
import { PrinterWithStatus, EligibleResinOption, QueueItem } from "@/types/domain";
import { FILE_TYPE_LABELS } from "@/lib/constants";
import { useAuth } from "@/lib/auth-context";
import {
  Printer,
  FlaskConical,
  CheckCircle2,
  AlertTriangle,
  Play,
  Layers,
  Barcode,
  ArrowLeft,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

function FatiadorContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [eligiblePrinters, setEligiblePrinters] = useState<PrinterWithStatus[]>([]);
  const [allPrinters, setAllPrinters] = useState<PrinterWithStatus[]>([]);
  const [eligibleResins, setEligibleResins] = useState<EligibleResinOption[]>([]);

  const [selectedPrinterId, setSelectedPrinterId] = useState<string>("");
  const [selectedResinId, setSelectedResinId] = useState<string>("");
  const [supportsConfirmed, setSupportsConfirmed] = useState<boolean | null>(null);
  const [resinManipulated, setResinManipulated] = useState<boolean | null>(null);

  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [isStartingPrint, setIsStartingPrint] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const [queueData, options, printersList] = await Promise.all([
          OdontoPrintService.getQueue(),
          OdontoPrintService.getEligibleOptions(),
          OdontoPrintService.getPrinters(),
        ]);

        setQueueItems(queueData.items);
        setEligiblePrinters(options.printers);
        setAllPrinters(printersList);
        setEligibleResins(options.resins);

        const itemsParam = searchParams.get("items");
        if (itemsParam) {
          const ids = itemsParam.split(",").filter(Boolean);
          setSelectedItemIds(ids);
        } else if (queueData.items.length > 0) {
          setSelectedItemIds(queueData.items.slice(0, 2).map((i) => i.id));
        }

        if (options.printers.length > 0) {
          const firstPrinter = options.printers[0];
          setSelectedPrinterId(firstPrinter.id);

          const matchingResin = options.resins.find((r) => r.printer_id === firstPrinter.id);
          if (matchingResin) {
            setSelectedResinId(matchingResin.calibration_id);
          }
        }
      } catch {
        toast.error("Erro ao carregar dados do fatiador.");
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [searchParams]);

  const handlePrinterChange = (printerId: string) => {
    setSelectedPrinterId(printerId);
    setGeneratedCode(null);

    const matchingResins = eligibleResins.filter((r) => r.printer_id === printerId);
    if (matchingResins.length > 0) {
      setSelectedResinId(matchingResins[0].calibration_id);
    } else {
      setSelectedResinId("");
    }
  };

  const selectedModels = queueItems.filter((item) => selectedItemIds.includes(item.id));
  const hasRetryItem = selectedModels.some((item) => item.is_retry);

  const resinsForSelectedPrinter = eligibleResins.filter(
    (r) => r.printer_id === selectedPrinterId
  );

  const selectedResinOption = eligibleResins.find((r) => r.calibration_id === selectedResinId);

  const handleGenerateNomenclature = async () => {
    if (!selectedPrinterId) {
      toast.error("Selecione uma impressora elegível.");
      return;
    }
    if (!selectedResinId) {
      toast.error("Selecione uma resina calibrada para esta impressora.");
      return;
    }
    if (supportsConfirmed !== true || resinManipulated !== true) {
      toast.error("As verificações obrigatórias de suporte e resina devem ser marcadas como 'SIM'.");
      return;
    }
    if (selectedModels.length === 0) {
      toast.error("Nenhum modelo selecionado para fatiamento.");
      return;
    }

    setIsGeneratingCode(true);
    try {
      const code = await OdontoPrintService.generatePrintCode(hasRetryItem);
      setGeneratedCode(code);
      toast.success(`Nomenclatura gerada com sucesso: ${code}`);
    } catch {
      toast.error("Falha ao gerar nomenclatura.");
    } finally {
      setIsGeneratingCode(false);
    }
  };

  const handleStartPrint = async () => {
    if (!generatedCode) {
      toast.error("Gere a nomenclatura da impressão antes de iniciar.");
      return;
    }
    if (!selectedResinOption) {
      toast.error("Opção de resina inválida.");
      return;
    }

    setIsStartingPrint(true);
    try {
      const res = await OdontoPrintService.startPrintRun({
        run_code: generatedCode,
        printer_id: selectedPrinterId,
        resin_batch_id: selectedResinOption.resin_batch_id,
        calibration_id: selectedResinOption.calibration_id,
        item_ids: selectedItemIds,
        supports_confirmed: true,
        resin_manipulated: true,
        user_id: user?.id || "",
      });

      if (!res.success) {
        toast.error(res.error || "Erro ao iniciar impressão.");
        return;
      }

      toast.success(`Impressão ${generatedCode} iniciada com sucesso!`);
      router.push(`/impressoes/${res.run.id}`);
    } catch {
      toast.error("Erro inesperado ao iniciar a impressão.");
    } finally {
      setIsStartingPrint(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/fila")}
              className="text-slate-400 hover:text-white gap-1 pl-0 h-auto py-1 text-xs"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Voltar à Fila
            </Button>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Preparar Impressão
          </h1>
        </div>

        <div className="text-xs text-slate-400 bg-[#0F172A] border border-slate-800 px-3.5 py-1.5 rounded-full w-fit">
          Operador: <span className="font-semibold text-white">{user?.full_name || "Operador"}</span>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full rounded-3xl bg-slate-800" />
          <Skeleton className="h-64 w-full rounded-3xl bg-slate-800" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Controls Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* 1. SELEÇÃO DA IMPRESSORA */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Printer className="w-4 h-4 text-cyan-400" />
                  Impressora
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {eligiblePrinters.length === 0 ? (
                  <div className="p-3.5 rounded-2xl bg-amber-950/60 border border-amber-800/60 text-amber-300 text-xs">
                    <div className="font-bold flex items-center gap-1.5 mb-0.5">
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                      Nenhuma impressora liberada
                    </div>
                    As impressoras estão com manutenção pendente ou reprovadas. Realize a manutenção para liberar.
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                      Impressora Liberada
                    </label>
                    <select
                      value={selectedPrinterId}
                      onChange={(e) => handlePrinterChange(e.target.value)}
                      className="w-full px-4 py-2.5 text-sm rounded-full border border-slate-800 bg-slate-900 focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 font-medium text-white"
                    >
                      {eligiblePrinters.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} — {p.brand} {p.model}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 2. SELEÇÃO DA RESINA CALIBRADA */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <FlaskConical className="w-4 h-4 text-cyan-400" />
                  Resina Calibrada
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {resinsForSelectedPrinter.length === 0 ? (
                  <div className="p-3.5 rounded-2xl bg-amber-950/60 border border-amber-800/60 text-amber-300 text-xs">
                    <div className="font-bold flex items-center gap-1.5 mb-0.5">
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                      Nenhuma resina calibrada
                    </div>
                    Esta impressora não possui resina com calibração aprovada. Acesse o módulo de calibrações.
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                      Lote de Resina
                    </label>
                    <select
                      value={selectedResinId}
                      onChange={(e) => {
                        setSelectedResinId(e.target.value);
                        setGeneratedCode(null);
                      }}
                      className="w-full px-4 py-2.5 text-sm rounded-full border border-slate-800 bg-slate-900 focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 font-medium text-white"
                    >
                      {resinsForSelectedPrinter.map((r) => (
                        <option key={r.calibration_id} value={r.calibration_id}>
                          {r.brand} ({r.resin_type}) — Lote {r.lot} ({r.layer_height}mm / {r.exposure_time}s)
                        </option>
                      ))}
                    </select>

                    {selectedResinOption && (
                      <div className="mt-3 p-3 rounded-2xl bg-slate-900 border border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div>
                          <span className="text-slate-400 block text-[10px]">Marca</span>
                          <span className="font-bold text-white">{selectedResinOption.brand}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">Lote</span>
                          <span className="font-mono font-bold text-white">{selectedResinOption.lot}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">Camada</span>
                          <span className="font-bold text-white">{selectedResinOption.layer_height} mm</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">Exposição</span>
                          <span className="font-bold text-white">{selectedResinOption.exposure_time} s</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 3. CONFERÊNCIA TÉCNICA PRÉ-IMPRESSÃO */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                  Conferência Pré-Impressão
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Pergunta 1 */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-2xl border border-slate-800 bg-[#0B0F19]/60 gap-3">
                  <div className="text-xs font-semibold text-slate-200">
                    Suportes posicionados corretamente?
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setSupportsConfirmed(true)}
                      className={`px-4 py-1.5 rounded-full text-xs font-bold transition ${
                        supportsConfirmed === true
                          ? "bg-white text-slate-950 shadow-xs"
                          : "bg-slate-900 border border-slate-700 text-slate-400 hover:text-white"
                      }`}
                    >
                      SIM
                    </button>
                    <button
                      type="button"
                      onClick={() => setSupportsConfirmed(false)}
                      className={`px-4 py-1.5 rounded-full text-xs font-bold transition ${
                        supportsConfirmed === false
                          ? "bg-rose-600 text-white shadow-xs"
                          : "bg-slate-900 border border-slate-700 text-slate-400 hover:text-white"
                      }`}
                    >
                      NÃO
                    </button>
                  </div>
                </div>

                {/* Pergunta 2 */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-2xl border border-slate-800 bg-[#0B0F19]/60 gap-3">
                  <div className="text-xs font-semibold text-slate-200">
                    Resina homogeneizada e sem bolhas?
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setResinManipulated(true)}
                      className={`px-4 py-1.5 rounded-full text-xs font-bold transition ${
                        resinManipulated === true
                          ? "bg-white text-slate-950 shadow-xs"
                          : "bg-slate-900 border border-slate-700 text-slate-400 hover:text-white"
                      }`}
                    >
                      SIM
                    </button>
                    <button
                      type="button"
                      onClick={() => setResinManipulated(false)}
                      className={`px-4 py-1.5 rounded-full text-xs font-bold transition ${
                        resinManipulated === false
                          ? "bg-rose-600 text-white shadow-xs"
                          : "bg-slate-900 border border-slate-700 text-slate-400 hover:text-white"
                      }`}
                    >
                      NÃO
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Summary & Action Column */}
          <div className="space-y-6">
            {/* Modelos na Mesa de Impressão */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>Mesa ({selectedModels.length})</span>
                  {hasRetryItem && (
                    <Badge variant="destructive" className="text-[10px]">
                      Reimpressão
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {selectedModels.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-500">
                    Nenhum modelo selecionado na fila.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {selectedModels.map((item) => (
                      <div
                        key={item.id}
                        className={`p-3 rounded-2xl border text-xs flex items-start justify-between ${
                          item.is_retry
                            ? "bg-rose-950/40 border-rose-800/40 text-rose-300 font-medium"
                            : "bg-[#0B0F19]/60 border-slate-800 text-white font-medium"
                        }`}
                      >
                        <div>
                          <div className="font-mono font-bold text-white">
                            {item.patient_code}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {FILE_TYPE_LABELS[item.file_type]}
                          </div>
                        </div>

                        {item.is_retry && (
                          <Badge variant="destructive" className="text-[9px] py-0 px-2">
                            Tentativa {item.retry_count + 1}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Nomenclatura & Start Button Card */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Barcode className="w-4 h-4 text-cyan-400" />
                  Código da Mesa
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {generatedCode ? (
                  <div className="text-center p-4 rounded-2xl bg-slate-900 border border-slate-800">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                      Código Gerado
                    </span>
                    <span className="font-mono text-3xl font-black text-cyan-300 tracking-wider block my-1">
                      {generatedCode}
                    </span>
                  </div>
                ) : (
                  <Button
                    onClick={handleGenerateNomenclature}
                    disabled={isGeneratingCode || !selectedPrinterId || !selectedResinId}
                    variant="outline"
                    className="w-full gap-2 font-bold py-2.5 rounded-full border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 hover:text-white"
                  >
                    <Barcode className="w-4 h-4" />
                    Gerar Código
                  </Button>
                )}

                {/* Botão INICIAR IMPRESSÃO */}
                <Button
                  onClick={handleStartPrint}
                  disabled={!generatedCode || isStartingPrint}
                  variant="default"
                  size="lg"
                  className="w-full gap-2 font-bold text-sm rounded-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-md"
                >
                  <Play className="w-4 h-4 fill-current" />
                  {isStartingPrint ? "Iniciando..." : "Iniciar Impressão"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FatiadorPage() {
  return (
    <AppShell>
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl bg-slate-800" />}>
        <FatiadorContent />
      </Suspense>
    </AppShell>
  );
}
