"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/shell";
import { OdontoPrintService } from "@/services/odontoprint-service";
import { FILE_TYPE_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import {
  Printer,
  FlaskConical,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowLeft,
  XCircle,
  HelpCircle,
  Sparkles,
  Layers,
  StopCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export default function ImpressaoDetalhePage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const runId = params.id as string;

  const [run, setRun] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Modal States
  const [modalOpen, setModalOpen] = useState(false);
  const [step, setStep] = useState<"QUESTION" | "CHECK_FAILURES">("QUESTION");
  const [failedItemIds, setFailedItemIds] = useState<string[]>([]);
  const [failureReasons, setFailureReasons] = useState<Record<string, string>>({});
  const [isFinalizing, setIsFinalizing] = useState(false);

  const loadRun = async () => {
    setIsLoading(true);
    try {
      const data = await OdontoPrintService.getPrintRunById(runId);
      setRun(data);
    } catch {
      toast.error("Erro ao carregar detalhes da impressão.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRun();
  }, [runId]);

  const handleOpenFinalizeModal = () => {
    setStep("QUESTION");
    setFailedItemIds([]);
    setFailureReasons({});
    setModalOpen(true);
  };

  const handleAnswerNoFailures = async () => {
    setIsFinalizing(true);
    try {
      const res = await OdontoPrintService.finalizePrintRun({
        run_id: runId,
        failed_items: [],
        user_id: user?.id || "",
      });

      if (!res.success) {
        toast.error(res.error || "Erro ao finalizar impressão.");
        return;
      }

      toast.success(`Impressão ${run.run_code} finalizada com 100% de sucesso!`, {
        description: "Todos os modelos foram marcados como CONCLUÍDOS.",
      });
      setModalOpen(false);
      loadRun();
    } catch {
      toast.error("Erro ao finalizar ordem de impressão.");
    } finally {
      setIsFinalizing(false);
    }
  };

  const handleToggleFailedItem = (itemId: string) => {
    setFailedItemIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  };

  const handleConfirmWithFailures = async () => {
    if (failedItemIds.length === 0) {
      toast.error("Você indicou que houve falha, mas nenhum modelo foi marcado. Marque pelo menos um modelo ou informe que não houve falhas.");
      return;
    }

    setIsFinalizing(true);
    try {
      const payload = failedItemIds.map((id) => ({
        item_id: id,
        reason: failureReasons[id] || "Falha técnica na impressão",
      }));

      const res = await OdontoPrintService.finalizePrintRun({
        run_id: runId,
        failed_items: payload,
        user_id: user?.id || "",
      });

      if (!res.success) {
        toast.error(res.error || "Erro ao processar finalização.");
        return;
      }

      toast.warning(`Impressão ${run.run_code} concluída com falhas parciais.`, {
        description: `${res.completed_count} modelos aprovados e ${res.failed_count} modelo(s) retornaram para a fila em vermelho como REIMPRESSÃO.`,
      });

      setModalOpen(false);
      loadRun();
    } catch {
      toast.error("Erro ao registrar falhas.");
    } finally {
      setIsFinalizing(false);
    }
  };

  if (isLoading) {
    return (
      <AppShell>
        <div className="max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </AppShell>
    );
  }

  if (!run) {
    return (
      <AppShell>
        <div className="max-w-4xl mx-auto text-center py-12">
          <h2 className="text-xl font-bold text-slate-800">Ordem de Impressão Não Encontrada</h2>
          <Button onClick={() => router.push("/impressoes")} className="mt-4">
            Voltar para Lista de Impressões
          </Button>
        </div>
      </AppShell>
    );
  }

  const isCompleted = run.status === "FINALIZADA";

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/impressoes")}
              className="text-slate-500 hover:text-slate-900 gap-1 pl-0"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-2xl font-black text-brand-600">
                  {run.run_code}
                </span>
                <Badge variant={isCompleted ? "success" : "lime"}>
                  {isCompleted ? "Finalizada" : "Em Impressão"}
                </Badge>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Iniciada em: {formatDate(run.started_at)}
                {run.finished_at && ` • Finalizada em: ${formatDate(run.finished_at)}`}
              </p>
            </div>
          </div>

          {!isCompleted && (
            <Button
              onClick={handleOpenFinalizeModal}
              variant="default"
              size="lg"
              className="gap-2 font-bold shadow-elevated bg-brand-500 hover:bg-brand-600"
            >
              <StopCircle className="w-5 h-5 text-white" />
              IMPRESSÃO FINALIZADA
            </Button>
          )}
        </div>

        {/* Specs Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                <Printer className="w-3.5 h-3.5 text-brand-500" />
                Impressora
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-bold text-sm text-slate-900">{run.printer?.name}</div>
              <div className="text-xs text-slate-500 mt-0.5">
                {run.printer?.brand} {run.printer?.model}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                <FlaskConical className="w-3.5 h-3.5 text-brand-500" />
                Resina & Lote
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-bold text-sm text-slate-900">{run.batch?.brand}</div>
              <div className="text-xs text-slate-500 mt-0.5">
                Tipo: {run.batch?.resin_type} • Lote: <span className="font-mono font-bold">{run.batch?.lot}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-brand-500" />
                Parâmetros Fatiados
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-bold text-sm text-slate-900">
                Calibração #{run.calibration?.calibration_number || 1}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                Camada: {run.calibration?.layer_height}mm • Exposição: {run.calibration?.exposure_time}s
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Models List in this Print Run */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              <span>Modelos Alocados nesta Impressão ({run.items?.length || 0})</span>
            </CardTitle>
            <CardDescription>
              Inspeção visual e status individualizado de cada modelo odontológico
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-slate-100">
              {run.items?.map((item: any) => {
                const isFailed = item.result === "FALHOU";
                const isDone = item.result === "CONCLUIDO";

                return (
                  <div
                    key={item.id}
                    className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`h-8 w-8 rounded-lg flex items-center justify-center font-mono font-bold ${
                          isFailed
                            ? "bg-rose-100 text-rose-700"
                            : isDone
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {item.patient_code.replace("PAC-", "")}
                      </div>

                      <div>
                        <div className="font-bold text-slate-900 flex items-center gap-2">
                          <span>{item.patient_code}</span>
                          <span className="text-slate-400">&bull;</span>
                          <span>{FILE_TYPE_LABELS[item.file_type]}</span>
                        </div>
                        {item.patient_name && (
                          <div className="text-[11px] text-slate-400">
                            Paciente: {item.patient_name}
                          </div>
                        )}
                        {item.failure_reason && (
                          <div className="text-[11px] text-rose-600 font-semibold mt-0.5">
                            Motivo da Falha: {item.failure_reason}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Badge
                        variant={
                          isFailed
                            ? "reprint"
                            : isDone
                            ? "success"
                            : "lime"
                        }
                      >
                        {isFailed ? "Falhou (Retornou à Fila)" : isDone ? "Concluído" : "Em Impressão"}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* MODAL DE FINALIZAÇÃO (FLUXOGRAMA OFICIAL) */}
        <Dialog
          open={modalOpen}
          onOpenChange={setModalOpen}
          title="Conclusão da Impressão 3D"
          description={`Verificação de qualidade e inspeção das peças na ordem ${run.run_code}.`}
        >
          {step === "QUESTION" ? (
            <div className="space-y-6 pt-2">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center">
                <HelpCircle className="w-10 h-10 text-brand-500 mx-auto mb-2" />
                <h3 className="text-base font-bold text-slate-900">
                  Falhou algum modelo durante a impressão?
                </h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  Examine a mesa de impressão. Houve descolamento de suporte, perda de geometria ou ausência de polimerização em alguma peça?
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Button
                  onClick={handleAnswerNoFailures}
                  disabled={isFinalizing}
                  variant="lime"
                  size="lg"
                  className="font-bold text-sm"
                >
                  <CheckCircle2 className="w-4 h-4 mr-1.5" />
                  NÃO (Todos OK)
                </Button>

                <Button
                  onClick={() => setStep("CHECK_FAILURES")}
                  variant="destructive"
                  size="lg"
                  className="font-bold text-sm"
                >
                  <AlertTriangle className="w-4 h-4 mr-1.5" />
                  SIM (Houve Falha)
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-5 pt-2">
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
                <span className="font-bold block">Marque quais modelos falharam:</span>
                Modelos marcados retornarão automaticamente à Fila de Impressão destacados em vermelho com contagem incremental de retentativas. Modelos não marcados serão concluídos.
              </div>

              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {run.items?.map((item: any) => {
                  const isChecked = failedItemIds.includes(item.print_job_item_id);

                  return (
                    <div
                      key={item.id}
                      className={`p-3 rounded-xl border-2 transition-all ${
                        isChecked
                          ? "border-rose-500 bg-rose-50/80"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleFailedItem(item.print_job_item_id)}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                        />
                        <div className="flex-1">
                          <div className="text-xs font-bold text-slate-900">
                            {item.patient_code} &bull; {FILE_TYPE_LABELS[item.file_type]}
                          </div>
                          {isChecked && (
                            <div className="mt-2">
                              <input
                                type="text"
                                placeholder="Motivo da falha (ex: Descolamento na cúspide)..."
                                value={failureReasons[item.print_job_item_id] || ""}
                                onChange={(e) =>
                                  setFailureReasons({
                                    ...failureReasons,
                                    [item.print_job_item_id]: e.target.value,
                                  })
                                }
                                className="w-full px-2.5 py-1.5 text-xs rounded border border-rose-300 bg-white focus:outline-none focus:ring-1 focus:ring-rose-500"
                              />
                            </div>
                          )}
                        </div>
                      </label>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep("QUESTION")}
                >
                  Voltar
                </Button>

                <Button
                  onClick={handleConfirmWithFailures}
                  disabled={isFinalizing || failedItemIds.length === 0}
                  variant="destructive"
                  size="default"
                  className="font-bold"
                >
                  {isFinalizing ? "Processando..." : "Confirmar Falhas e Concluir Ordem"}
                </Button>
              </div>
            </div>
          )}
        </Dialog>
      </div>
    </AppShell>
  );
}
