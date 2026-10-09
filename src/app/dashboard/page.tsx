"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/shell";
import { OdontoPrintService } from "@/services/odontoprint-service";
import { DashboardMetrics } from "@/types/domain";
import { AuditLog } from "@/types/database.types";
import {
  Printer,
  ListOrdered,
  AlertTriangle,
  CheckCircle2,
  FlaskConical,
  Activity,
  ArrowUpRight,
  FileCheck2,
  Scissors,
  Layers,
  Sparkles,
  Cog,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils";

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [activities, setActivities] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const [m, a] = await Promise.all([
          OdontoPrintService.getDashboardMetrics(),
          OdontoPrintService.getRecentActivities(),
        ]);
        setMetrics(m);
        setActivities(a);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header with Title */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Painel Principal
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              Visão geral da produção e do parque odontológico 3D.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link href="/cadista/status">
              <Button size="sm" variant="default" className="text-xs gap-1.5 h-9 px-4 rounded-full">
                <FileCheck2 className="w-3.5 h-3.5" />
                Novo Trabalho
              </Button>
            </Link>
            <Link href="/fatiador">
              <Button size="sm" variant="secondary" className="text-xs gap-1.5 h-9 px-4 rounded-full">
                <Scissors className="w-3.5 h-3.5" />
                Fatiador
              </Button>
            </Link>
          </div>
        </div>

        {/* Ações Diretas em Pílulas */}
        <div className="flex flex-wrap items-center gap-2 overflow-x-auto pb-1">
          <Link href="/cadista/status">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white text-slate-950 text-xs font-semibold hover:bg-slate-200 transition shadow-xs">
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

          <Link href="/fatiador">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#0F172A] border border-slate-800 text-slate-300 text-xs font-medium hover:bg-slate-800 hover:text-white transition">
              <Scissors className="w-3.5 h-3.5 text-slate-400" />
              <span>Fatiar Mesa</span>
            </div>
          </Link>

          <Link href="/impressoes">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#0F172A] border border-slate-800 text-slate-300 text-xs font-medium hover:bg-slate-800 hover:text-white transition">
              <Printer className="w-3.5 h-3.5 text-slate-400" />
              <span>Impressões</span>
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

          <Link href="/acabamento">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#0F172A] border border-slate-800 text-slate-300 text-xs font-medium hover:bg-slate-800 hover:text-white transition">
              <Sparkles className="w-3.5 h-3.5 text-slate-400" />
              <span>Acabamento</span>
            </div>
          </Link>

          <Link href="/fresagem">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#0F172A] border border-slate-800 text-slate-300 text-xs font-medium hover:bg-slate-800 hover:text-white transition">
              <Cog className="w-3.5 h-3.5 text-slate-400" />
              <span>Fresagem</span>
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
              <div className="divide-y divide-slate-800">
                {activities.map((act) => {
                  const isReprint = act.action === "ITEM_REIMPRESSAO";
                  const isMaint = act.action.includes("MANUTENCAO");
                  const isCalib = act.action.includes("CALIBRACAO");

                  return (
                    <div key={act.id} className="py-3 flex items-start justify-between gap-4 text-xs">
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                            isReprint
                              ? "bg-rose-950/80 text-rose-300 border border-rose-800/50"
                              : isMaint
                              ? "bg-amber-950/80 text-amber-300 border border-amber-800/50"
                              : isCalib
                              ? "bg-cyan-950/80 text-cyan-300 border border-cyan-800/50"
                              : "bg-emerald-950/80 text-emerald-300 border border-emerald-800/50"
                          }`}
                        >
                          {isReprint ? (
                            <AlertTriangle className="h-3.5 w-3.5" />
                          ) : isMaint ? (
                            <Printer className="h-3.5 w-3.5" />
                          ) : isCalib ? (
                            <FlaskConical className="h-3.5 w-3.5" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="font-semibold text-white truncate">
                            {act.action === "ITEM_REIMPRESSAO" && "Item Retornou para Reimpressão"}
                            {act.action === "ITEM_CONCLUIDO" && "Modelo Concluído com Sucesso"}
                            {act.action === "IMPRESSAO_FINALIZADA" && "Ordem de Impressão Finalizada"}
                            {act.action === "IMPRESSAO_INICIADA" && "Impressão Iniciada"}
                            {act.action === "TRABALHO_CRIADO" && "Novo Trabalho Registrado"}
                            {act.action === "MANUTENCAO_APROVADA" && "Manutenção Aprovada"}
                            {act.action === "MANUTENCAO_REPROVADA" && "Manutenção Reprovada"}
                            {act.action === "RECEBIMENTO_RESINA" && "Novo Lote de Resina"}
                            {act.action === "CALIBRACAO_APROVADA" && "Calibração Aprovada"}
                            {act.action === "CALIBRACAO_REPROVADA" && "Calibração Reprovada"}
                          </div>
                          <p className="text-slate-400 mt-0.5 text-[11px] truncate">
                            {act.new_data ? JSON.stringify(act.new_data).replace(/["{}]/g, " ") : "Operação registrada"}
                          </p>
                        </div>
                      </div>

                      <span className="shrink-0 text-[11px] text-slate-500 font-medium">
                        {formatDate(act.created_at)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
