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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200/80 pb-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/calibracoes")}
            className="text-slate-500 hover:text-slate-900 gap-1 pl-0"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              Bancada de Calibração de Resina
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Protocolo técnico de validação de peça de teste e precisão dimensional.
            </p>
          </div>
        </div>

        <Badge variant="secondary" className="font-mono text-xs px-3 py-1 font-bold">
          Calibração #{calibrationNumber}
        </Badge>
      </div>

      {/* Strict Rules Banner */}
      <div className="p-4 rounded-xl bg-brand-50/70 border border-brand-200 text-xs text-brand-900 flex items-start gap-3">
        <Info className="w-5 h-5 text-brand-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold block mb-0.5">Critérios Rígidos de Aprovação:</span>
          O hexágono da peça de teste deve medir rigorosamente entre <strong>9,99 mm e 10,01 mm</strong>. Linhas, números e detalhes finos devem estar 100% visíveis. Caso algum parâmetro falhe, a tentativa é registrada e o botão &quot;Nova Calibração&quot; é acionado para o próximo ciclo de ajuste.
        </div>
      </div>

      {/* Setup Form */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Coluna 1: Parâmetros Digitáveis */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-brand-500" />
              1. Combinação & Parâmetros Fatiados
            </CardTitle>
            <CardDescription>
              A calibração é vinculada ao par Resina + Impressora.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Lote de Resina
              </label>
              <select
                value={selectedBatchId}
                onChange={(e) => setSelectedBatchId(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white font-medium text-slate-900"
              >
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.brand} ({b.resin_type}) — Lote {b.lot}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Impressora Utilizada
              </label>
              <select
                value={selectedPrinterId}
                onChange={(e) => setSelectedPrinterId(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white font-medium text-slate-900"
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
                className="w-full bg-gradient-to-r from-indigo-50/80 via-brand-50/80 to-purple-50/80 hover:from-indigo-100 hover:to-purple-100 border-indigo-200 text-indigo-900 font-bold text-xs gap-2 py-2 shadow-sm transition-all"
              >
                {isAiLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-brand-600" />
                    Consultando IA (Gemini / Groq)...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-brand-600" />
                    ✨ Sugerir Parâmetros por IA (Gemini / Groq)
                  </>
                )}
              </Button>
            </div>

            {/* Painel de Parecer Técnico da IA */}
            {aiRecommendation && (
              <div className="p-3 rounded-lg bg-indigo-50/60 border border-indigo-200 text-xs text-indigo-950 space-y-1.5 animate-in fade-in-50 duration-200">
                <div className="flex items-center justify-between font-bold text-indigo-900">
                  <span className="flex items-center gap-1.5 text-xs">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    Parecer da IA ({aiRecommendation.confidenceScore ? `${Math.round(aiRecommendation.confidenceScore * 100)}% confiança` : "Recomendado"})
                  </span>
                  <Badge variant="outline" className="text-[10px] bg-white border-indigo-300 text-indigo-700 font-mono">
                    Alvo: {aiRecommendation.targetHexagonMm} mm
                  </Badge>
                </div>
                <p className="text-[11px] leading-relaxed text-indigo-900/90">{aiRecommendation.notes}</p>
                {aiRecommendation.tips && aiRecommendation.tips.length > 0 && (
                  <ul className="text-[10px] text-indigo-800 list-disc list-inside space-y-0.5 pt-1 border-t border-indigo-200/50">
                    {aiRecommendation.tips.map((tip, idx) => (
                      <li key={idx}>{tip}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Tempo Exposição Inicial (s)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={initialExposure}
                  onChange={(e) => setInitialExposure(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-200 font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Tempo Exposição Normal (s)
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
            <CardDescription>
              Valores obtidos no paquímetro digital e inspeção óptica.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Hexágono */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700">
                  Tamanho do Hexágono (mm) *
                </label>
                <span className="text-[10px] text-slate-400 font-mono">
                  Aceitável: 9.99 a 10.01 mm
                </span>
              </div>
              <input
                type="number"
                step="0.01"
                required
                value={hexagonSize}
                onChange={(e) => setHexagonSize(Number(e.target.value))}
                className={`w-full px-3.5 py-2 text-sm rounded-lg border-2 font-mono font-bold text-center ${
                  hexagonSize >= 9.99 && hexagonSize <= 10.01
                    ? "border-approvedGreen-500 bg-approvedGreen-50/50 text-slate-950"
                    : "border-rose-400 bg-rose-50/50 text-rose-700"
                }`}
              />
            </div>

            {/* 3 Perguntas Visuais da Imagem 2 */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                <span className="font-medium text-slate-800">Linhas estão visíveis?</span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setLinesVisible(true)}
                    className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                      linesVisible === true
                        ? "bg-approvedGreen-500 text-slate-950"
                        : "bg-white border border-slate-300 text-slate-600"
                    }`}
                  >
                    SIM
                  </button>
                  <button
                    type="button"
                    onClick={() => setLinesVisible(false)}
                    className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                      linesVisible === false
                        ? "bg-rose-500 text-white"
                        : "bg-white border border-slate-300 text-slate-600"
                    }`}
                  >
                    NÃO
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                <span className="font-medium text-slate-800">Números estão visíveis?</span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setNumbersVisible(true)}
                    className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                      numbersVisible === true
                        ? "bg-approvedGreen-500 text-slate-950"
                        : "bg-white border border-slate-300 text-slate-600"
                    }`}
                  >
                    SIM
                  </button>
                  <button
                    type="button"
                    onClick={() => setNumbersVisible(false)}
                    className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                      numbersVisible === false
                        ? "bg-rose-500 text-white"
                        : "bg-white border border-slate-300 text-slate-600"
                    }`}
                  >
                    NÃO
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                <span className="font-medium text-slate-800">Detalhes estão visíveis?</span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setDetailsVisible(true)}
                    className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                      detailsVisible === true
                        ? "bg-approvedGreen-500 text-slate-950"
                        : "bg-white border border-slate-300 text-slate-600"
                    }`}
                  >
                    SIM
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetailsVisible(false)}
                    className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                      detailsVisible === false
                        ? "bg-rose-500 text-white"
                        : "bg-white border border-slate-300 text-slate-600"
                    }`}
                  >
                    NÃO
                  </button>
                </div>
              </div>
            </div>

            {/* Pós-cura */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Tempo Lavagem (min)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={washTime}
                  onChange={(e) => setWashTime(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-200 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Tempo Cura (min)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={cureTime}
                  onChange={(e) => setCureTime(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-200 font-mono"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Feedback Banner & Action Buttons */}
      {allQuestionsAnswered && (
        <div
          className={`p-4 rounded-xl border-2 transition-all ${
            validation.approved
              ? "border-approvedGreen-500 bg-approvedGreen-50 text-approvedGreen-900"
              : "border-rose-300 bg-rose-50 text-rose-900"
          }`}
        >
          <div className="flex items-center gap-2 font-bold text-sm">
            {validation.approved ? (
              <>
                <CheckCircle2 className="w-5 h-5 text-approvedGreen-600 shrink-0" />
                <span>Calibração dentro de todos os parâmetros técnicos! Habilitado para finalizar.</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                <span>
                  Calibração fora dos parâmetros. {validation.errorReason} Realize uma nova calibração.
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
              size="lg"
              className="font-bold gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              NOVA CALIBRAÇÃO (Gravar Tentativa {calibrationNumber})
            </Button>
          )}

          {/* Botão FINALIZAR CALIBRAÇÃO (somente habilitado se tudo OK) */}
          <Button
            type="button"
            onClick={handleFinalize}
            disabled={!validation.approved || !allQuestionsAnswered || isSubmitting}
            variant="lime"
            size="lg"
            className="font-black px-8 text-slate-950 shadow-elevated"
          >
            <CheckCircle2 className="w-5 h-5" />
            FINALIZAR CALIBRAÇÃO
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
