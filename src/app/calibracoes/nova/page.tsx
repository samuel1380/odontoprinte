"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/shell";
import { OdontoPrintService } from "@/services/odontoprint-service";
import { ResinBatch, Printer } from "@/types/database.types";
import { useAuth } from "@/lib/auth-context";
import { validateResinCalibration } from "@/lib/business-rules";
import {
  Compass,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Info,
  Layers,
  Sparkles,
  Printer as PrinterIcon,
  FlaskConical,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { AIService } from "@/services/ai-service";
import { CalibrationRecommendation } from "@/types/ai.types";

function NovaCalibracaoContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const [batches, setBatches] = useState<ResinBatch[]>([]);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Selections
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [selectedPrinterId, setSelectedPrinterId] = useState("");
  const [calibrationNumber, setCalibrationNumber] = useState(1);

  // AI Recommendation State
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiRecommendation, setAiRecommendation] = useState<CalibrationRecommendation | null>(null);

  // Technical Parameters (Digitáveis no fluxograma)
  const [initialExposure, setInitialExposure] = useState<number>(25.0);
  const [exposureTime, setExposureTime] = useState<number>(2.3);
  const [liftSpeed, setLiftSpeed] = useState<number>(60.0);
  const [layerHeight, setLayerHeight] = useState<number>(0.05);

  // Test Results
  const [hexagonSize, setHexagonSize] = useState<number>(10.0);
  const [linesVisible, setLinesVisible] = useState<boolean | null>(null);
  const [numbersVisible, setNumbersVisible] = useState<boolean | null>(null);
  const [detailsVisible, setDetailsVisible] = useState<boolean | null>(null);
  const [washTime, setWashTime] = useState<number>(5.0);
  const [cureTime, setCureTime] = useState<number>(10.0);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Consulta IA (Gemini / Groq) para sugerir parâmetros da resina e impressora
  const handleAskAiCalibration = async () => {
    const currentBatch = batches.find((b) => b.id === selectedBatchId);
    const currentPrinter = printers.find((p) => p.id === selectedPrinterId);

    if (!currentBatch || !currentPrinter) {
      toast.warning("Selecione um lote de resina e uma impressora primeiro.");
      return;
    }

    setIsAiLoading(true);
    try {
      const rec = await AIService.getCalibrationRecommendation({
        printerName: `${currentPrinter.brand} ${currentPrinter.model} (${currentPrinter.name})`,
        resinType: currentBatch.resin_type,
        resinBrand: currentBatch.brand,
        layerHeight: Number(layerHeight) || 0.05,
      });

      setAiRecommendation(rec);
      setInitialExposure(rec.initialExposure ?? rec.initial_exposure_time ?? 25.0);
      setExposureTime(rec.normalExposure ?? rec.exposure_time ?? 2.3);
      setLiftSpeed(rec.liftSpeed ?? rec.lift_speed ?? 60.0);
      setWashTime(rec.washTime ?? rec.wash_time ?? 5.0);
      setCureTime(rec.cureTime ?? rec.cure_time ?? 10.0);

      toast.success("Parâmetros sugeridos pela IA aplicados!", {
        description: `Exposição ajustada para ${rec.normalExposure}s (Base: ${rec.initialExposure}s).`,
      });
    } catch {
      toast.error("Erro ao obter sugestão da IA.");
    } finally {
      setIsAiLoading(false);
    }
  };

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const [bList, pList] = await Promise.all([
          OdontoPrintService.getResinBatches(),
          OdontoPrintService.getPrinters(),
        ]);
        setBatches(bList);
        setPrinters(pList);

        const paramBatch = searchParams.get("batch");
        if (paramBatch && bList.some((b) => b.id === paramBatch)) {
          setSelectedBatchId(paramBatch);
        } else if (bList.length > 0) {
          setSelectedBatchId(bList[0].id);
        }

        if (pList.length > 0) {
          setSelectedPrinterId(pList[0].id);
        }
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [searchParams]);

  // Recalcula número da calibração ao trocar resina ou impressora
  useEffect(() => {
    if (!selectedBatchId || !selectedPrinterId) return;
    OdontoPrintService.getCalibrations().then((allCalibs) => {
      const match = allCalibs.filter(
        (c) => c.resin_batch_id === selectedBatchId && c.printer_id === selectedPrinterId
      );
      setCalibrationNumber(match.length + 1);
    });
  }, [selectedBatchId, selectedPrinterId]);

  // Validação estrita de parâmetros (9.99 a 10.01 mm e visibilidades)
  const validation = validateResinCalibration({
    hexagon_size_mm: Number(hexagonSize),
    lines_visible: linesVisible === true,
    numbers_visible: numbersVisible === true,
    details_visible: detailsVisible === true,
  });

  const allQuestionsAnswered =
    linesVisible !== null && numbersVisible !== null && detailsVisible !== null;

  // Finalizar Calibração Aprovada
  const handleFinalize = async () => {
    if (!validation.approved) {
      toast.error("Calibração fora dos parâmetros. Não é possível finalizar.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await OdontoPrintService.registerCalibrationAttempt({
        resin_batch_id: selectedBatchId,
        printer_id: selectedPrinterId,
        initial_exposure_time: Number(initialExposure),
        exposure_time: Number(exposureTime),
        lift_speed: Number(liftSpeed),
        layer_height: Number(layerHeight),
        hexagon_size_mm: Number(hexagonSize),
        lines_visible: linesVisible === true,
        numbers_visible: numbersVisible === true,
        details_visible: detailsVisible === true,
        wash_time: Number(washTime),
        cure_time: Number(cureTime),
        created_by: user?.id || "",
      });

      if (res.approved) {
        toast.success("Calibração aprovada e finalizada!", {
          description: "A resina e a impressora agora estão liberadas para seleção no Fatiador.",
        });
        router.push("/calibracoes");
      }
    } catch {
      toast.error("Erro ao salvar calibração.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Nova Calibração (tentativa reprovada mantendo histórico)
  const handleNewAttempt = async () => {
    setIsSubmitting(true);
    try {
      await OdontoPrintService.registerCalibrationAttempt({
        resin_batch_id: selectedBatchId,
        printer_id: selectedPrinterId,
        initial_exposure_time: Number(initialExposure),
        exposure_time: Number(exposureTime),
        lift_speed: Number(liftSpeed),
        layer_height: Number(layerHeight),
        hexagon_size_mm: Number(hexagonSize),
        lines_visible: linesVisible === true,
        numbers_visible: numbersVisible === true,
        details_visible: detailsVisible === true,
        wash_time: Number(washTime),
        cure_time: Number(cureTime),
        created_by: user?.id || "",
      });

      toast.warning(`Tentativa #${calibrationNumber} reprovada e registrada no histórico.`, {
        description: `Iniciando Calibração #${calibrationNumber + 1}. Ajuste os tempos de exposição.`,
      });

      setCalibrationNumber((prev) => prev + 1);
      setLinesVisible(null);
      setNumbersVisible(null);
      setDetailsVisible(null);
    } catch {
      toast.error("Erro ao registrar tentativa.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#EFECE6] pb-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/calibracoes")}
            className="text-[#716D66] hover:text-[#18181B] gap-1 pl-0"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#18181B] tracking-tight">
              Calibração de Resina
            </h1>
            <p className="text-xs text-[#716D66] mt-0.5">
              Protocolo técnico e validação dimensional.
            </p>
          </div>
        </div>

        <Badge variant="secondary" className="font-mono text-xs px-3 py-1 font-bold">
          Calibração #{calibrationNumber}
        </Badge>
      </div>

      {/* Rules Banner */}
      <div className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-[#EFECE6] text-xs text-[#2D2A26] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Info className="w-4 h-4 text-[#DE5A35] shrink-0" />
          <span>Hexágono alvo: <strong>9,99 mm a 10,01 mm</strong> com linhas e números visíveis.</span>
        </div>
      </div>

      {/* Setup Form */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Coluna 1: Parâmetros Digitáveis */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-[#DE5A35]" />
              Resina & Impressora
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#18181B] mb-1.5">
                Lote de Resina
              </label>
              <select
                value={selectedBatchId}
                onChange={(e) => setSelectedBatchId(e.target.value)}
                className="w-full px-4 py-2.5 text-xs rounded-full border border-[#EFECE6] bg-[#FAF8F5]/60 font-medium text-[#18181B]"
              >
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.brand} ({b.resin_type}) — Lote {b.lot}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#18181B] mb-1.5">
                Impressora
              </label>
              <select
                value={selectedPrinterId}
                onChange={(e) => setSelectedPrinterId(e.target.value)}
                className="w-full px-4 py-2.5 text-xs rounded-full border border-[#EFECE6] bg-[#FAF8F5]/60 font-medium text-[#18181B]"
              >
                {printers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.brand} {p.model})
                  </option>
                ))}
              </select>
            </div>

            {/* Botão de Sugestão de Parâmetros por IA */}
            <div className="pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={handleAskAiCalibration}
                disabled={isAiLoading || !selectedBatchId || !selectedPrinterId}
                className="w-full font-bold text-xs gap-2 py-2"
              >
                {isAiLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Consultando IA...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-[#DE5A35]" />
                    Sugerir Parâmetros por IA
                  </>
                )}
              </Button>
            </div>

            {/* Painel de Parecer Técnico da IA */}
            {aiRecommendation && (
              <div className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-[#EFECE6] text-xs text-[#18181B] space-y-1.5">
                <div className="flex items-center justify-between font-bold">
                  <span className="flex items-center gap-1.5 text-xs">
                    <Sparkles className="w-3.5 h-3.5 text-[#DE5A35]" />
                    Sugestão da IA
                  </span>
                  <Badge variant="outline" className="text-[10px] font-mono">
                    Alvo: {aiRecommendation.targetHexagonMm} mm
                  </Badge>
                </div>
                <p className="text-[11px] leading-relaxed text-[#716D66]">{aiRecommendation.notes}</p>
              </div>
            )}

            <div className="pt-2 border-t border-[#EFECE6] grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[#716D66] mb-1">
                  Exposição Inicial (s)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={initialExposure}
                  onChange={(e) => setInitialExposure(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs rounded-full border border-[#EFECE6] bg-[#FAF8F5]/60 font-mono font-bold text-[#18181B]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#716D66] mb-1">
                  Exposição Normal (s)
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={exposureTime}
                  onChange={(e) => setExposureTime(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-200 font-mono font-bold text-brand-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Velocidade Elevação (mm/min)
                </label>
                <input
                  type="number"
                  step="1"
                  value={liftSpeed}
                  onChange={(e) => setLiftSpeed(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-200 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Altura de Camada (mm)
                </label>
                <input
                  type="number"
                  step="0.005"
                  value={layerHeight}
                  onChange={(e) => setLayerHeight(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-200 font-mono"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Coluna 2: Resultados da Calibração */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Compass className="w-4 h-4 text-brand-500" />
              2. Medições & Validação Visual
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Hexágono */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-[#18181B]">
                  Tamanho do Hexágono (mm) *
                </label>
                <span className="text-[10px] text-[#716D66] font-mono">
                  Alvo: 9.99 a 10.01 mm
                </span>
              </div>
              <input
                type="number"
                step="0.01"
                required
                value={hexagonSize}
                onChange={(e) => setHexagonSize(Number(e.target.value))}
                className={`w-full px-4 py-2.5 text-base rounded-full border-2 font-mono font-bold text-center transition ${
                  hexagonSize >= 9.99 && hexagonSize <= 10.01
                    ? "border-[#18181B] bg-[#FAF8F5] text-[#18181B]"
                    : "border-[#DE3535] bg-rose-50/50 text-[#DE3535]"
                }`}
              />
            </div>

            {/* 3 Perguntas Visuais */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between p-3 rounded-2xl bg-[#FAF8F5] border border-[#EFECE6] text-xs">
                <span className="font-medium text-[#18181B]">Linhas visíveis?</span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setLinesVisible(true)}
                    className={`px-4 py-1 rounded-full text-xs font-bold transition ${
                      linesVisible === true
                        ? "bg-[#18181B] text-white shadow-xs"
                        : "bg-white border border-[#E2DDD5] text-[#716D66] hover:bg-[#FAF8F5]"
                    }`}
                  >
                    SIM
                  </button>
                  <button
                    type="button"
                    onClick={() => setLinesVisible(false)}
                    className={`px-4 py-1 rounded-full text-xs font-bold transition ${
                      linesVisible === false
                        ? "bg-[#DE3535] text-white shadow-xs"
                        : "bg-white border border-[#E2DDD5] text-[#716D66] hover:bg-[#FAF8F5]"
                    }`}
                  >
                    NÃO
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-2xl bg-[#FAF8F5] border border-[#EFECE6] text-xs">
                <span className="font-medium text-[#18181B]">Números visíveis?</span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setNumbersVisible(true)}
                    className={`px-4 py-1 rounded-full text-xs font-bold transition ${
                      numbersVisible === true
                        ? "bg-[#18181B] text-white shadow-xs"
                        : "bg-white border border-[#E2DDD5] text-[#716D66] hover:bg-[#FAF8F5]"
                    }`}
                  >
                    SIM
                  </button>
                  <button
                    type="button"
                    onClick={() => setNumbersVisible(false)}
                    className={`px-4 py-1 rounded-full text-xs font-bold transition ${
                      numbersVisible === false
                        ? "bg-[#DE3535] text-white shadow-xs"
                        : "bg-white border border-[#E2DDD5] text-[#716D66] hover:bg-[#FAF8F5]"
                    }`}
                  >
                    NÃO
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-2xl bg-[#FAF8F5] border border-[#EFECE6] text-xs">
                <span className="font-medium text-[#18181B]">Detalhes visíveis?</span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setDetailsVisible(true)}
                    className={`px-4 py-1 rounded-full text-xs font-bold transition ${
                      detailsVisible === true
                        ? "bg-[#18181B] text-white shadow-xs"
                        : "bg-white border border-[#E2DDD5] text-[#716D66] hover:bg-[#FAF8F5]"
                    }`}
                  >
                    SIM
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetailsVisible(false)}
                    className={`px-4 py-1 rounded-full text-xs font-bold transition ${
                      detailsVisible === false
                        ? "bg-[#DE3535] text-white shadow-xs"
                        : "bg-white border border-[#E2DDD5] text-[#716D66] hover:bg-[#FAF8F5]"
                    }`}
                  >
                    NÃO
                  </button>
                </div>
              </div>
            </div>

            {/* Pós-cura */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#EFECE6]">
              <div>
                <label className="block text-[11px] font-semibold text-[#716D66] mb-1">
                  Lavagem (min)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={washTime}
                  onChange={(e) => setWashTime(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs rounded-full border border-[#EFECE6] bg-[#FAF8F5]/60 font-mono text-[#18181B]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#716D66] mb-1">
                  Cura (min)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={cureTime}
                  onChange={(e) => setCureTime(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs rounded-full border border-[#EFECE6] bg-[#FAF8F5]/60 font-mono text-[#18181B]"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Feedback Banner & Action Buttons */}
      {allQuestionsAnswered && (
        <div
          className={`p-4 rounded-2xl border transition-all ${
            validation.approved
              ? "border-[#18181B] bg-[#FAF8F5] text-[#18181B]"
              : "border-[#DE3535] bg-rose-50 text-[#DE3535]"
          }`}
        >
          <div className="flex items-center gap-2 font-bold text-xs sm:text-sm">
            {validation.approved ? (
              <>
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>Calibração aprovada com precisão técnica. Pronto para finalizar.</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-5 h-5 text-[#DE3535] shrink-0" />
                <span>
                  Calibração fora dos limites. {validation.errorReason} Grave uma nova tentativa.
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => router.push("/calibracoes")}
          className="text-[#716D66] hover:text-[#18181B]"
        >
          Cancelar
        </Button>

        <div className="flex items-center gap-3">
          {/* Botão NOVA CALIBRAÇÃO (se falhou) */}
          {!validation.approved && allQuestionsAnswered && (
            <Button
              type="button"
              onClick={handleNewAttempt}
              disabled={isSubmitting}
              variant="destructive"
              size="default"
              className="font-bold gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Gravar Tentativa
            </Button>
          )}

          {/* Botão FINALIZAR CALIBRAÇÃO */}
          <Button
            type="button"
            onClick={handleFinalize}
            disabled={!validation.approved || !allQuestionsAnswered || isSubmitting}
            variant="default"
            size="default"
            className="font-bold px-8"
          >
            <CheckCircle2 className="w-4 h-4" />
            Finalizar Calibração
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function NovaCalibracaoPage() {
  return (
    <AppShell>
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
        <NovaCalibracaoContent />
      </Suspense>
    </AppShell>
  );
}
