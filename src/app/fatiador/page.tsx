"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/shell";
import { OdontoPrintService } from "@/services/odontoprint-service";
import { PrinterWithStatus, EligibleResinOption, QueueItem } from "@/types/domain";
import { FILE_TYPE_LABELS } from "@/lib/constants";
import { useAuth } from "@/lib/auth-context";
import {
  Scissors,
  Printer,
  FlaskConical,
  CheckCircle2,
  AlertTriangle,
  Play,
  Layers,
  Sparkles,
  Barcode,
  Info,
  ArrowLeft,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  const [selectedResinId, setSelectedResinId] = useState<string>(""); // calibration_id
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

        // Preenche itens selecionados a partir da URL
        const itemsParam = searchParams.get("items");
        if (itemsParam) {
          const ids = itemsParam.split(",").filter(Boolean);
          setSelectedItemIds(ids);
        } else if (queueData.items.length > 0) {
          // Seleciona os 2 primeiros por conveniência
          setSelectedItemIds(queueData.items.slice(0, 2).map((i) => i.id));
        }

        // Auto-seleciona a primeira impressora elegível se houver
        if (options.printers.length > 0) {
          const firstPrinter = options.printers[0];
          setSelectedPrinterId(firstPrinter.id);

          // Auto-seleciona resina calibrada para essa impressora
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

  // Atualiza resinas disponíveis ao mudar impressora
  const handlePrinterChange = (printerId: string) => {
    setSelectedPrinterId(printerId);
    setGeneratedCode(null); // Reseta código se trocar configuração

    const matchingResins = eligibleResins.filter((r) => r.printer_id === printerId);
    if (matchingResins.length > 0) {
      setSelectedResinId(matchingResins[0].calibration_id);
    } else {
      setSelectedResinId("");
    }
  };

  // Itens selecionados detalhados
  const selectedModels = queueItems.filter((item) => selectedItemIds.includes(item.id));
  const hasRetryItem = selectedModels.some((item) => item.is_retry);

  // Resinas compatíveis com a impressora selecionada
  const resinsForSelectedPrinter = eligibleResins.filter(
    (r) => r.printer_id === selectedPrinterId
  );

  const selectedResinOption = eligibleResins.find((r) => r.calibration_id === selectedResinId);
  const selectedPrinterOption = eligiblePrinters.find((p) => p.id === selectedPrinterId);

  // GERAÇÃO ATÔMICA DA NOMENCLATURA
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
      toast.success(`Nomenclatura gerada com sucesso: ${code}`, {
        description: hasRetryItem
          ? "Prefixo especial de retentativa aplicado devido a item com falha anterior."
          : "Código sequencial atômico normal registrado.",
      });
    } catch {
      toast.error("Falha ao gerar nomenclatura.");
    } finally {
      setIsGeneratingCode(false);
    }
  };

  // INICIAR IMPRESSÃO
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200/80 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/fila")}
              className="text-slate-500 hover:text-slate-900 gap-1 pl-0 h-auto py-1 text-xs"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Voltar à Fila
            </Button>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            Fatiador &bull; Preparar Impressão
          </h1>
        </div>

        <div className="text-xs text-slate-500">
          Operador: <span className="font-semibold text-slate-800">{user?.full_name || "Operador"}</span>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Controls Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* 1. SELEÇÃO DA IMPRESSORA */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Printer className="w-4 h-4 text-brand-500" />
                  1. Escolha a Impressora
                </CardTitle>
                <CardDescription>
                  Selecione uma impressora liberada para produzir esta mesa.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {eligiblePrinters.length === 0 ? (
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                    <div className="font-bold flex items-center gap-1.5 mb-1">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      Nenhuma impressora liberada no momento!
                    </div>
                    Todas as impressoras cadastradas estão com manutenção vencida (&gt;7 dias) ou foram reprovadas no checklist. Realize uma manutenção para desbloquear.
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Impressora Liberada
                    </label>
                    <select
                      value={selectedPrinterId}
                      onChange={(e) => handlePrinterChange(e.target.value)}
                      className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white font-medium text-slate-900"
                    >
                      {eligiblePrinters.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} — {p.brand} {p.model} (Manutenção OK, há {p.days_since_maintenance} dias)
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Exibe aviso de impressoras bloqueadas para transparência empresarial */}
                {allPrinters.filter((p) => !p.is_eligible_for_print).length > 0 && (
                  <div className="pt-2">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Unidades Indisponíveis no Parque:
                    </span>
                    <div className="mt-1.5 space-y-1">
                      {allPrinters
                        .filter((p) => !p.is_eligible_for_print)
                        .map((p) => (
                          <div
                            key={p.id}
                            className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200/80 text-[11px] text-slate-500"
                          >
                            <span className="font-medium text-slate-700">{p.name}</span>
                            <Badge variant={p.calculated_status === "MANUTENCAO_VENCIDA" ? "warning" : "destructive"}>
                              {p.calculated_status === "MANUTENCAO_VENCIDA"
                                ? `Bloqueada: Manutenção venceu há ${p.days_since_maintenance} dias`
                                : p.calculated_status === "REPROVADA"
                                ? "Bloqueada: Reprovada no Checklist"
                                : "Inativa"}
                            </Badge>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 2. SELEÇÃO DA RESINA CALIBRADA */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FlaskConical className="w-4 h-4 text-brand-500" />
                  2. Escolha a Resina Calibrada
                </CardTitle>
                <CardDescription>
                  Aparecem apenas as resinas já testadas e aprovadas para a impressora selecionada.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {resinsForSelectedPrinter.length === 0 ? (
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                    <div className="font-bold flex items-center gap-1.5 mb-1">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      Nenhuma resina calibrada para esta impressora!
                    </div>
                    Esta impressora ainda não possui um lote de resina com calibração aprovada (hexágono 9.99 a 10.01 mm). Acesse o módulo de calibrações para calibrar.
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Lote de Resina Calibrado
                    </label>
                    <select
                      value={selectedResinId}
                      onChange={(e) => {
                        setSelectedResinId(e.target.value);
                        setGeneratedCode(null);
                      }}
                      className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white font-medium text-slate-900"
                    >
                      {resinsForSelectedPrinter.map((r) => (
                        <option key={r.calibration_id} value={r.calibration_id}>
                          {r.brand} ({r.resin_type}) — Lote {r.lot} (Calibração #{r.calibration_number}, {r.layer_height}mm / {r.exposure_time}s)
                        </option>
                      ))}
                    </select>

                    {selectedResinOption && (
                      <div className="mt-3 p-3 rounded-xl bg-brand-50/60 border border-brand-100 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div>
                          <span className="text-slate-400 block text-[10px]">Marca / Tipo</span>
                          <span className="font-bold text-slate-800">{selectedResinOption.brand}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">Lote</span>
                          <span className="font-mono font-bold text-slate-800">{selectedResinOption.lot}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">Altura de Camada</span>
                          <span className="font-bold text-slate-800">{selectedResinOption.layer_height} mm</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">Tempo Exposição</span>
                          <span className="font-bold text-slate-800">{selectedResinOption.exposure_time} s</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 3. VERIFICAÇÕES OBRIGATÓRIAS PRÉ-IMPRESSÃO */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-brand-500" />
                  3. Conferência Pré-Impressão
                </CardTitle>
                <CardDescription>
                  Confirme os pontos essenciais para garantir que a peça saia perfeita.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Pergunta 1 */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 gap-3">
                  <div className="text-xs font-semibold text-slate-800 leading-snug">
                    Suportes colocados nas linhas pretas e em toda a área crítica?
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setSupportsConfirmed(true)}
                      className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        supportsConfirmed === true
                          ? "bg-approvedGreen-500 text-slate-950 border border-approvedGreen-600 shadow-sm"
                          : "bg-white border border-slate-300 text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      SIM
                    </button>
                    <button
                      type="button"
                      onClick={() => setSupportsConfirmed(false)}
                      className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        supportsConfirmed === false
                          ? "bg-rose-500 text-white border border-rose-600 shadow-sm"
                          : "bg-white border border-slate-300 text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      NÃO
                    </button>
                  </div>
                </div>

                {/* Pergunta 2 */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 gap-3">
                  <div className="text-xs font-semibold text-slate-800 leading-snug">
                    Resina manipulada (homogeneizada e sem bolhas de ar)?
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setResinManipulated(true)}
                      className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        resinManipulated === true
                          ? "bg-approvedGreen-500 text-slate-950 border border-approvedGreen-600 shadow-sm"
                          : "bg-white border border-slate-300 text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      SIM
                    </button>
                    <button
                      type="button"
                      onClick={() => setResinManipulated(false)}
                      className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        resinManipulated === false
                          ? "bg-rose-500 text-white border border-rose-600 shadow-sm"
                          : "bg-white border border-slate-300 text-slate-600 hover:bg-slate-100"
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
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>Modelos na Mesa ({selectedModels.length})</span>
                  {hasRetryItem && (
                    <Badge variant="reprint" className="text-[10px]">
                      Reimpressão
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  Itens selecionados para fatiamento conjunto
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {selectedModels.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-400">
                    Nenhum modelo selecionado na fila.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {selectedModels.map((item) => (
                      <div
                        key={item.id}
                        className={`p-2.5 rounded-lg border text-xs flex items-start justify-between ${
                          item.is_retry
                            ? "bg-rose-50 border-rose-200 text-rose-900 font-medium"
                            : "bg-slate-50 border-slate-200/80 text-slate-800 font-medium"
                        }`}
                      >
                        <div>
                          <div className="font-mono font-bold text-slate-900">
                            {item.patient_code}
                          </div>
                          <div className="text-[11px] text-slate-600">
                            {FILE_TYPE_LABELS[item.file_type]}
                          </div>
                        </div>

                        {item.is_retry && (
                          <Badge variant="reprint" className="text-[9px] py-0 px-1">
                            Retentativa {item.retry_count + 1}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Nomenclatura & Start Button Card */}
            <Card className="border border-brand-200/90 bg-white shadow-2xs">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Barcode className="w-4 h-4 text-brand-500" />
                  Código da Mesa de Impressão
                </CardTitle>
                <CardDescription>
                  Identificação automática para carimbar o arquivo
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {generatedCode ? (
                  <div className="text-center p-4 rounded-xl bg-brand-50/40 border border-brand-300 shadow-2xs animate-in zoom-in-95">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block">
                      Código Gerado para a Peça
                    </span>
                    <span className="font-mono text-3xl font-black text-brand-600 tracking-wider block my-1">
                      {generatedCode}
                    </span>
                    <p className="text-[11px] text-slate-500">
                      Nomeie seu arquivo no fatiador com este código.
                    </p>
                  </div>
                ) : (
                  <Button
                    onClick={handleGenerateNomenclature}
                    disabled={isGeneratingCode || !selectedPrinterId || !selectedResinId}
                    variant="default"
                    className="w-full gap-2 font-bold py-3"
                  >
                    <Barcode className="w-4 h-4" />
                    Gerar Código da Peça
                  </Button>
                )}

                {/* Botão INICIAR IMPRESSÃO */}
                <Button
                  onClick={handleStartPrint}
                  disabled={!generatedCode || isStartingPrint}
                  variant="lime"
                  size="lg"
                  className="w-full gap-2 font-black tracking-wide text-base shadow-elevated"
                >
                  <Play className="w-5 h-5 fill-slate-950" />
                  {isStartingPrint ? "Iniciando Impressão..." : "INICIAR IMPRESSÃO"}
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
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
        <FatiadorContent />
      </Suspense>
    </AppShell>
  );
}
