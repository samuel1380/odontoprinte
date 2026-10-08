"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/shell";
import { OdontoPrintService } from "@/services/odontoprint-service";
import { useAuth } from "@/lib/auth-context";
import { validateMaintenanceChecklist } from "@/lib/business-rules";
import {
  Wrench,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Info,
  ShieldCheck,
  Printer,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export default function PrinterManutencaoPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const printerId = params.id as string;

  const [printerData, setPrinterData] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 7 Checklist Questions (Fiel à Imagem 2)
  const [levelingOk, setLevelingOk] = useState<boolean | null>(null);
  const [cleaningOk, setCleaningOk] = useState<boolean | null>(null);
  const [fepIntegrityOk, setFepIntegrityOk] = useState<boolean | null>(null);
  const [ledIntegrityOk, setLedIntegrityOk] = useState<boolean | null>(null);
  const [blackPointsLed, setBlackPointsLed] = useState<boolean | null>(null); // SIM = reprova
  const [lowLedLuminosity, setLowLedLuminosity] = useState<boolean | null>(null); // SIM = reprova
  const [protectiveFilmOk, setProtectiveFilmOk] = useState<boolean | null>(null);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const data = await OdontoPrintService.getPrinterById(printerId);
        setPrinterData(data.printer);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [printerId]);

  // Checagem em tempo real de aprovação
  const allAnswered =
    levelingOk !== null &&
    cleaningOk !== null &&
    fepIntegrityOk !== null &&
    ledIntegrityOk !== null &&
    blackPointsLed !== null &&
    lowLedLuminosity !== null &&
    protectiveFilmOk !== null;

  const isApproved =
    allAnswered &&
    validateMaintenanceChecklist({
      leveling_ok: levelingOk === true,
      cleaning_ok: cleaningOk === true,
      fep_integrity_ok: fepIntegrityOk === true,
      led_integrity_ok: ledIntegrityOk === true,
      black_points_led: blackPointsLed === true,
      low_led_luminosity: lowLedLuminosity === true,
      protective_film_ok: protectiveFilmOk === true,
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allAnswered) {
      toast.error("Por favor, responda a todos os 7 itens do checklist de manutenção.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await OdontoPrintService.addPrinterMaintenance({
        printer_id: printerId,
        checklist: {
          leveling_ok: levelingOk === true,
          cleaning_ok: cleaningOk === true,
          fep_integrity_ok: fepIntegrityOk === true,
          led_integrity_ok: ledIntegrityOk === true,
          black_points_led: blackPointsLed === true,
          low_led_luminosity: lowLedLuminosity === true,
          protective_film_ok: protectiveFilmOk === true,
        },
        notes,
        performed_by: user?.id || "",
      });

      if (res.approved) {
        toast.success(`Manutenção aprovada com sucesso! A impressora foi liberada por mais 7 dias.`);
      } else {
        toast.error(`Manutenção reprovada! A impressora recebeu status REPROVADA e não poderá ser utilizada até ser reparada.`);
      }

      router.push("/impressoras");
    } catch {
      toast.error("Erro ao registrar manutenção.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <AppShell>
        <div className="max-w-3xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-96 w-full rounded-2xl" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200/80 pb-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/impressoras")}
              className="text-slate-500 hover:text-slate-900 gap-1 pl-0"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                Checklist de Manutenção Periódica
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Equipamento: <span className="font-bold text-slate-800">{printerData?.name}</span> ({printerData?.brand} {printerData?.model})
              </p>
            </div>
          </div>

          <div className="text-xs text-slate-500">
            Técnico: <span className="font-semibold text-slate-800">{user?.full_name || "Técnico"}</span>
          </div>
        </div>

        {/* 7-Days Rule Info Box */}
        <div className="p-4 rounded-xl bg-brand-50/70 border border-brand-200 text-xs text-brand-900 flex items-start gap-3 shadow-subtle">
          <Info className="w-5 h-5 text-brand-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block mb-0.5">Regra Operacional de 7 Dias:</span>
            A impressora é automaticamente bloqueada caso passem mais de 7 dias desde a última manutenção aprovada. Para ser aprovada, todos os itens de nivelamento, limpeza, FEP, LED e película devem estar 100% íntegros e NÃO podem haver pontos pretos ou baixa luminosidade no painel.
          </div>
        </div>

        {/* Checklist Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Wrench className="w-4 h-4 text-brand-500" />
                Itens de Inspeção Visual e Óptica
              </CardTitle>
              <CardDescription>
                Responda a cada critério após testar a impressora em bancada.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3.5">
              {/* 1. Nivelamento */}
              <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                <span className="text-xs font-semibold text-slate-800">1. Nivelamento do Prato</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setLevelingOk(true)}
                    className={`px-3.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      levelingOk === true
                        ? "bg-approvedGreen-500 text-slate-950 shadow-sm"
                        : "bg-white border border-slate-300 text-slate-600"
                    }`}
                  >
                    OK
                  </button>
                  <button
                    type="button"
                    onClick={() => setLevelingOk(false)}
                    className={`px-3.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      levelingOk === false
                        ? "bg-rose-500 text-white shadow-sm"
                        : "bg-white border border-slate-300 text-slate-600"
                    }`}
                  >
                    NÃO OK
                  </button>
                </div>
              </div>

              {/* 2. Limpeza */}
              <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                <span className="text-xs font-semibold text-slate-800">2. Limpeza Geral da Cuba e Eixos</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCleaningOk(true)}
                    className={`px-3.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      cleaningOk === true
                        ? "bg-approvedGreen-500 text-slate-950 shadow-sm"
                        : "bg-white border border-slate-300 text-slate-600"
                    }`}
                  >
                    OK
                  </button>
                  <button
                    type="button"
                    onClick={() => setCleaningOk(false)}
                    className={`px-3.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      cleaningOk === false
                        ? "bg-rose-500 text-white shadow-sm"
                        : "bg-white border border-slate-300 text-slate-600"
                    }`}
                  >
                    NÃO OK
                  </button>
                </div>
              </div>

              {/* 3. Integridade do FEP */}
              <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                <span className="text-xs font-semibold text-slate-800">3. Integridade do Filme FEP (sem furos ou riscos)</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setFepIntegrityOk(true)}
                    className={`px-3.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      fepIntegrityOk === true
                        ? "bg-approvedGreen-500 text-slate-950 shadow-sm"
                        : "bg-white border border-slate-300 text-slate-600"
                    }`}
                  >
                    OK
                  </button>
                  <button
                    type="button"
                    onClick={() => setFepIntegrityOk(false)}
                    className={`px-3.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      fepIntegrityOk === false
                        ? "bg-rose-500 text-white shadow-sm"
                        : "bg-white border border-slate-300 text-slate-600"
                    }`}
                  >
                    NÃO OK
                  </button>
                </div>
              </div>

              {/* 4. Integridade do LED */}
              <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                <span className="text-xs font-semibold text-slate-800">4. Integridade Geral do Painel LED UV</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setLedIntegrityOk(true)}
                    className={`px-3.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      ledIntegrityOk === true
                        ? "bg-approvedGreen-500 text-slate-950 shadow-sm"
                        : "bg-white border border-slate-300 text-slate-600"
                    }`}
                  >
                    OK
                  </button>
                  <button
                    type="button"
                    onClick={() => setLedIntegrityOk(false)}
                    className={`px-3.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      ledIntegrityOk === false
                        ? "bg-rose-500 text-white shadow-sm"
                        : "bg-white border border-slate-300 text-slate-600"
                    }`}
                  >
                    NÃO OK
                  </button>
                </div>
              </div>

              {/* 5. Pontos Pretos no LED? (SIM / NÃO) */}
              <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                <div>
                  <span className="text-xs font-semibold text-slate-800 block">
                    5. Existem pontos pretos (dead pixels) no LED?
                  </span>
                  <span className="text-[10px] text-slate-400">Deve ser &apos;NÃO&apos; para aprovar</span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setBlackPointsLed(true)}
                    className={`px-3.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      blackPointsLed === true
                        ? "bg-rose-500 text-white shadow-sm"
                        : "bg-white border border-slate-300 text-slate-600"
                    }`}
                  >
                    SIM (Defeito)
                  </button>
                  <button
                    type="button"
                    onClick={() => setBlackPointsLed(false)}
                    className={`px-3.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      blackPointsLed === false
                        ? "bg-approvedGreen-500 text-slate-950 shadow-sm"
                        : "bg-white border border-slate-300 text-slate-600"
                    }`}
                  >
                    NÃO (Perfeito)
                  </button>
                </div>
              </div>

              {/* 6. Baixa Luminosidade do LED? (SIM / NÃO) */}
              <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                <div>
                  <span className="text-xs font-semibold text-slate-800 block">
                    6. Existe baixa luminosidade ou oscilação do LED?
                  </span>
                  <span className="text-[10px] text-slate-400">Deve ser &apos;NÃO&apos; para aprovar</span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setLowLedLuminosity(true)}
                    className={`px-3.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      lowLedLuminosity === true
                        ? "bg-rose-500 text-white shadow-sm"
                        : "bg-white border border-slate-300 text-slate-600"
                    }`}
                  >
                    SIM (Defeito)
                  </button>
                  <button
                    type="button"
                    onClick={() => setLowLedLuminosity(false)}
                    className={`px-3.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      lowLedLuminosity === false
                        ? "bg-approvedGreen-500 text-slate-950 shadow-sm"
                        : "bg-white border border-slate-300 text-slate-600"
                    }`}
                  >
                    NÃO (Perfeito)
                  </button>
                </div>
              </div>

              {/* 7. Película Protetora */}
              <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                <span className="text-xs font-semibold text-slate-800">
                  7. Integridade da Película Protetora da Tela LCD
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setProtectiveFilmOk(true)}
                    className={`px-3.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      protectiveFilmOk === true
                        ? "bg-approvedGreen-500 text-slate-950 shadow-sm"
                        : "bg-white border border-slate-300 text-slate-600"
                    }`}
                  >
                    OK
                  </button>
                  <button
                    type="button"
                    onClick={() => setProtectiveFilmOk(false)}
                    className={`px-3.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      protectiveFilmOk === false
                        ? "bg-rose-500 text-white shadow-sm"
                        : "bg-white border border-slate-300 text-slate-600"
                    }`}
                  >
                    NÃO OK
                  </button>
                </div>
              </div>

              {/* Observações */}
              <div className="pt-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Comentários / Observações do Técnico
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex: Troca de FEP realizada, lubrificação do fuso Z efetuada..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </CardContent>
          </Card>

          {/* Result Status Preview Card */}
          {allAnswered && (
            <div
              className={`p-4 rounded-xl border-2 transition-all animate-in fade-in ${
                isApproved
                  ? "border-approvedGreen-500 bg-approvedGreen-50/80 text-approvedGreen-900"
                  : "border-rose-300 bg-rose-50 text-rose-900"
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-sm">
                {isApproved ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-approvedGreen-600" />
                    Manutenção Aprovada! A impressora será liberada para produção.
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-5 h-5 text-rose-600" />
                    Manutenção Reprovada! A impressora receberá status REPROVADA e ficará bloqueada.
                  </>
                )}
              </div>
            </div>
          )}

          {/* Action Bar */}
          <div className="flex items-center justify-between pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => router.push("/impressoras")}
            >
              Cancelar
            </Button>

            <Button
              type="submit"
              size="lg"
              disabled={!allAnswered || isSubmitting}
              className={`font-bold px-8 ${
                isApproved ? "bg-approvedGreen-500 hover:bg-approvedGreen-600 text-slate-950" : ""
              }`}
            >
              {isSubmitting ? "Gravando Manutenção..." : "Salvar e Atualizar Status"}
            </Button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
