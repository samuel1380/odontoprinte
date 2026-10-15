"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/shell";
import { OdontoPrintService } from "@/services/odontoprint-service";
import { DashboardMetrics } from "@/types/domain";
import { ActivityItem } from "@/lib/activity-feed";
import {
  Printer,
  ListOrdered,
  AlertTriangle,
  CheckCircle2,
  FlaskConical,
  Activity,
  ArrowUpRight,
  FileCheck2,
  Layers,
  PlusCircle,
  RefreshCw,
  Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [printing, setPrinting] = useState<Awaited<
    ReturnType<typeof OdontoPrintService.getPrintingOverview>
  > | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const [m, a, p] = await Promise.all([
          OdontoPrintService.getDashboardMetrics(),
          OdontoPrintService.getRecentActivities(15),
          OdontoPrintService.getPrintingOverview(),
        ]);
        setMetrics(m);
        setActivities(a);
        setPrinting(p);
      } finally {
        setIsLoading(false);
      }
    }
    load();
    const timer = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  const elapsed = (startedAt?: string | null): string => {
    if (!startedAt) return "";
    const mins = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000));
    if (mins < 1) return "começou agora";
    if (mins < 60) return `há ${mins} min imprimindo`;
    const h = Math.floor(mins / 60);
    return `há ${h} h${mins % 60 ? ` ${mins % 60} min` : ""} imprimindo`;
  };

  const visibleActivities = showAll ? activities : activities.slice(0, 10);

  const kindStyle: Record<ActivityItem["kind"], string> = {
    added: "bg-emerald-950/80 text-emerald-300 border border-emerald-800/50",
    printed: "bg-cyan-950/80 text-cyan-300 border border-cyan-800/50",
    failed: "bg-rose-950/80 text-rose-300 border border-rose-800/50",
    reprint: "bg-amber-950/80 text-amber-300 border border-amber-800/50",
    done: "bg-emerald-950/80 text-emerald-300 border border-emerald-800/50",
    info: "bg-slate-800/80 text-slate-300 border border-slate-700/60",
    warning: "bg-amber-950/80 text-amber-300 border border-amber-800/50",
  };

  const KindIcon = ({ kind }: { kind: ActivityItem["kind"] }) => {
    const cls = "h-3.5 w-3.5";
    switch (kind) {
      case "added":
        return <PlusCircle className={cls} />;
      case "printed":
        return <Printer className={cls} />;
      case "failed":
        return <AlertTriangle className={cls} />;
      case "reprint":
        return <RefreshCw className={cls} />;
      case "done":
        return <CheckCircle2 className={cls} />;
      case "warning":
        return <AlertTriangle className={cls} />;
      default:
        return <Info className={cls} />;
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header with Title */}
        <div className="pb-2">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Painel Principal
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              Visão geral da produção e do parque odontológico 3D.
            </p>
          </div>
        </div>

        {/* Ações Diretas em Pílulas */}
        <div className="flex flex-wrap items-center gap-2 overflow-x-auto pb-1">
          <Link href="/cadista/status">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white text-slate-950 text-xs font-semibold hover:bg-slate-200 transition shadow-sm">
              <FileCheck2 className="w-3.5 h-3.5 text-slate-950" />
              <span>Novo Trabalho</span>
            </div>
          </Link>

          <Link href="/fila">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#0F172A] border border-slate-800 text-slate-300 text-xs font-medium hover:bg-slate-800 hover:text-white transition">
              <ListOrdered className="w-3.5 h-3.5 text-slate-400" />
              <span>Fila</span>
              {metrics && metrics.items_in_queue > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-cyan-500 text-slate-950 text-[10px] font-bold">
                  {metrics.items_in_queue}
                </span>
              )}
            </div>
          </Link>

          <Link href="/impressoras">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#0F172A] border border-slate-800 text-slate-300 text-xs font-medium hover:bg-slate-800 hover:text-white transition">
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              <span>Impressoras</span>
            </div>
          </Link>

          <Link href="/resinas">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#0F172A] border border-slate-800 text-slate-300 text-xs font-medium hover:bg-slate-800 hover:text-white transition">
              <FlaskConical className="w-3.5 h-3.5 text-slate-400" />
              <span>Resinas</span>
            </div>
          </Link>
        </div>

        {/* Metric Cards - 4 KPIs Essenciais */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card className="p-4 sm:p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
              <span>Impressoras Prontas</span>
              <Printer className="w-4 h-4 text-slate-400" />
            </div>
            <div className="mt-3">
              <div className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                {isLoading ? <Skeleton className="h-8 w-12 bg-slate-800" /> : metrics?.printers_available}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                {isLoading ? "Carregando..." : `${(metrics?.printers_available || 0) + (metrics?.printers_blocked || 0)} no parque`}
              </p>
            </div>
          </Card>

          <Card className="p-4 sm:p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
              <span>Fila de Espera</span>
              <ListOrdered className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="mt-3">
              <div className="text-2xl sm:text-3xl font-bold tracking-tight text-cyan-400">
                {isLoading ? <Skeleton className="h-8 w-12 bg-slate-800" /> : metrics?.items_in_queue}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                {isLoading ? "Carregando..." : (metrics?.reprints_pending || 0) > 0 ? `${metrics?.reprints_pending} reimpressões prioritárias` : "Modelos aguardando"}
              </p>
            </div>
          </Card>

          <Card className="p-4 sm:p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
              <span>Concluídos Hoje</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="mt-3">
              <div className="text-2xl sm:text-3xl font-bold tracking-tight text-emerald-400">
                {isLoading ? <Skeleton className="h-8 w-12 bg-slate-800" /> : metrics?.items_completed_today}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                {isLoading ? "Carregando..." : `${metrics?.items_printing || 0} em impressão`}
              </p>
            </div>
          </Card>

          <Card className="p-4 sm:p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
              <span>Resinas Calibradas</span>
              <FlaskConical className="w-4 h-4 text-slate-400" />
            </div>
            <div className="mt-3">
              <div className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                {isLoading ? <Skeleton className="h-8 w-12 bg-slate-800" /> : metrics?.resins_calibrated}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Lotes aptos para produção
              </p>
            </div>
          </Card>
        </div>

        {/* O que está imprimindo — explicado */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Printer className="w-4 h-4 text-cyan-400" />
                O que está imprimindo
              </CardTitle>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Cada mesa da máquina, de qual pedido ela é e há quanto tempo roda.
              </p>
            </div>
            <Link href="/fila">
              <Button variant="ghost" size="sm" className="text-xs gap-1 text-slate-300 hover:text-white rounded-full">
                Ver fila
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {isLoading ? (
              <Skeleton className="h-16 w-full rounded-xl bg-slate-800" />
            ) : printing && printing.printing.length > 0 ? (
              printing.printing.map((run) => (
                <Link
                  key={run.id}
                  href="/fila"
                  className="block bg-slate-950/60 border border-slate-800 hover:border-slate-600 rounded-xl p-3 transition"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                    </span>
                    <span className="font-mono text-sm font-bold text-white">
                      Mesa {run.run_code}
                    </span>
                    <span className="ml-auto shrink-0 text-[11px] text-slate-400">
                      {elapsed(run.started_at)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1">
                    {run.group_titles.length > 0
                      ? run.group_titles.join(" + ")
                      : "Pedido sem lote"}{" "}
                    <span className="text-slate-500">
                      · {run.printer_name} · {run.items_count} modelo(s)
                    </span>
                  </p>
                </Link>
              ))
            ) : (
              <p className="text-xs text-slate-500 py-2">
                Nenhuma máquina imprimindo agora.{" "}
                <Link href="/fila" className="text-slate-300 hover:text-white underline underline-offset-2">
                  Monte um pedido na fila
                </Link>
                .
              </p>
            )}

            {!isLoading && printing && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <Link
                  href="/fila"
                  className="bg-slate-950/60 border border-slate-800 hover:border-slate-600 rounded-xl p-3 transition"
                >
                  <p className="text-[11px] text-slate-500">Aguardando na fila</p>
                  <p className="text-sm font-semibold text-white mt-0.5">
                    {printing.waitingGroups} pedido(s) · {printing.waitingModels} modelo(s)
                  </p>
                </Link>
                <Link
                  href="/fila"
                  className={`rounded-xl p-3 transition border ${
                    printing.failedCount > 0
                      ? "bg-amber-950/40 border-amber-900 hover:border-amber-700"
                      : "bg-slate-950/60 border-slate-800 hover:border-slate-600"
                  }`}
                >
                  <p className="text-[11px] text-slate-500">Prioridade da próxima impressão</p>
                  <p className={`text-sm font-semibold mt-0.5 ${printing.failedCount > 0 ? "text-amber-200" : "text-white"}`}>
                    {printing.failedCount > 0
                      ? `${printing.failedCount} modelo(s) com falha`
                      : "Nenhuma falha pendente"}
                  </p>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Atividades Recentes */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                Atividades Recentes
              </CardTitle>
            </div>
            <Link href="/historico">
              <Button variant="ghost" size="sm" className="text-xs gap-1 text-slate-300 hover:text-white rounded-full">
                Ver Histórico
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-2xl bg-slate-800" />
                ))}
              </div>
            ) : activities.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-500">
                Nenhuma atividade registrada até o momento.
              </div>
            ) : (
              <div>
                <div className="divide-y divide-slate-800">
                  {visibleActivities.map((act) => {
                    const row = (
                      <div className="py-3 flex items-start justify-between gap-4 text-xs">
                        <div className="flex items-start gap-3 min-w-0">
                          <div
                            className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${kindStyle[act.kind]}`}
                          >
                            <KindIcon kind={act.kind} />
                          </div>

                          <div className="min-w-0">
                            <div className="font-semibold text-white leading-snug">
                              {act.title}
                            </div>
                            {act.detail && (
                              <p className="text-slate-400 mt-0.5 text-[11px] leading-snug">
                                {act.detail}
                              </p>
                            )}
                          </div>
                        </div>

                        <span className="shrink-0 text-[11px] text-slate-500 font-medium whitespace-nowrap">
                          {act.relative}
                        </span>
                      </div>
                    );
                    return act.href ? (
                      <Link key={act.id} href={act.href} className="block hover:bg-slate-800/30 rounded-lg transition">
                        {row}
                      </Link>
                    ) : (
                      <div key={act.id}>{row}</div>
                    );
                  })}
                </div>
                {activities.length > 10 && (
                  <button
                    type="button"
                    onClick={() => setShowAll(!showAll)}
                    className="mt-2 w-full py-2 text-xs font-medium text-slate-400 hover:text-white border border-slate-800 hover:border-slate-700 rounded-xl transition"
                  >
                    {showAll ? "Ver menos" : `Ver mais (${activities.length - 10} anteriores)`}
                  </button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
