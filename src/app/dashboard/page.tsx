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
  Clock,
  FlaskConical,
  Activity,
  ArrowUpRight,
  FileCheck2,
  Scissors,
  Layers,
  Sparkles,
  Cog,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
      <div className="space-y-8">
        {/* Header with Title & Quick Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200/80 pb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Painel Geral de Manufatura
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Controle central da esteira: Modelagem CAD, Fila FIFO e Parque de Impressão 3D.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1 sm:pt-0">
            <Link href="/cadista/status">
              <Button size="sm" variant="default" className="text-xs font-semibold gap-1.5 h-8">
                <FileCheck2 className="w-3.5 h-3.5" />
                Novo Trabalho
              </Button>
            </Link>
            <Link href="/fila">
              <Button size="sm" variant="outline" className="text-xs font-medium gap-1.5 h-8">
                <ListOrdered className="w-3.5 h-3.5" />
                Fila FIFO
              </Button>
            </Link>
            <Link href="/fatiador">
              <Button size="sm" variant="outline" className="text-xs font-medium gap-1.5 h-8">
                <Scissors className="w-3.5 h-3.5" />
                Fatiador
              </Button>
            </Link>
            <Link href="/impressoes">
              <Button size="sm" variant="outline" className="text-xs font-medium gap-1.5 h-8">
                <Printer className="w-3.5 h-3.5" />
                Impressões
              </Button>
            </Link>
          </div>
        </div>

        {/* Metric Cards - 4 KPIs Essenciais, Limpos e Responsivos */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card className="p-4 sm:p-5 flex flex-col justify-between hover:border-slate-300 transition-all">
            <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
              <span>Impressoras 3D</span>
              <Printer className="w-4 h-4 text-slate-400" />
            </div>
            <div className="mt-3">
              <div className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                {isLoading ? <Skeleton className="h-8 w-12" /> : metrics?.printers_available}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {isLoading ? "Carregando..." : `${(metrics?.printers_available || 0) + (metrics?.printers_blocked || 0)} ativas no laboratório`}
              </p>
            </div>
          </Card>

          <Card className="p-4 sm:p-5 flex flex-col justify-between hover:border-slate-300 transition-all">
            <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
              <span>Fila de Espera</span>
              <ListOrdered className="w-4 h-4 text-brand-500" />
            </div>
            <div className="mt-3">
              <div className="text-2xl sm:text-3xl font-bold tracking-tight text-brand-600">
                {isLoading ? <Skeleton className="h-8 w-12" /> : metrics?.items_in_queue}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {isLoading ? "Carregando..." : (metrics?.reprints_pending || 0) > 0 ? `${metrics?.reprints_pending} prioridade máxima` : "Modelos na fila FIFO"}
              </p>
            </div>
          </Card>

          <Card className="p-4 sm:p-5 flex flex-col justify-between hover:border-slate-300 transition-all">
            <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
              <span>Produção Hoje</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="mt-3">
              <div className="text-2xl sm:text-3xl font-bold tracking-tight text-emerald-600">
                {isLoading ? <Skeleton className="h-8 w-12" /> : metrics?.items_completed_today}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {isLoading ? "Carregando..." : `${metrics?.items_printing || 0} em impressão agora`}
              </p>
            </div>
          </Card>

          <Card className="p-4 sm:p-5 flex flex-col justify-between hover:border-slate-300 transition-all">
            <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
              <span>Lotes de Resina</span>
              <FlaskConical className="w-4 h-4 text-purple-500" />
            </div>
            <div className="mt-3">
              <div className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                {isLoading ? <Skeleton className="h-8 w-12" /> : metrics?.resins_calibrated}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Combinações calibradas
              </p>
            </div>
          </Card>
        </div>

        {/* WORKFLOW SUMMARY & RECENT ACTIVITIES */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Visual Workflow Map Card */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="w-4 h-4 text-brand-500" />
                Fluxo Operacional Integrado
              </CardTitle>
              <CardDescription>
                Rastreabilidade estrita do CAD ao produto final
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative pl-6 border-l-2 border-brand-200 space-y-6">
                <div className="relative">
                  <div className="absolute -left-[31px] top-0 h-4 w-4 rounded-full border-2 border-white bg-brand-500 shadow-sm" />
                  <div className="text-xs font-bold text-slate-800">1. Cadista Digital</div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Define o trabalho (ex: PAC-100) e seleciona os modelos a imprimir.
                  </p>
                </div>

                <div className="relative">
                  <div className="absolute -left-[31px] top-0 h-4 w-4 rounded-full border-2 border-white bg-cyan-500 shadow-sm" />
                  <div className="text-xs font-bold text-slate-800">2. Fila FIFO & Fatiador</div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Agrupa modelos de pacientes e valida impressora e resina calibrada.
                  </p>
                </div>

                <div className="relative">
                  <div className="absolute -left-[31px] top-0 h-4 w-4 rounded-full border-2 border-white bg-indigo-500 shadow-sm" />
                  <div className="text-xs font-bold text-slate-800">3. Nomenclatura Atômica</div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Gera sequencial único A001 ou 00A1 para repetições.
                  </p>
                </div>

                <div className="relative">
                  <div className="absolute -left-[31px] top-0 h-4 w-4 rounded-full border-2 border-white bg-emerald-500 shadow-sm" />
                  <div className="text-xs font-bold text-slate-800">4. Finalização & Falhas</div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Aprovações são concluídas. Falhas retornam à fila em vermelho.
                  </p>
                </div>
              </div>

              <div className="pt-2">
                <Link href="/fatiador">
                  <Button variant="lime" className="w-full text-xs font-bold gap-2">
                    <Scissors className="w-4 h-4" />
                    Abrir Estação do Fatiador
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Activity Feed (Requisito 5 & 22: Últimas Atividades / Auditoria) */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="w-4 h-4 text-brand-500" />
                  Últimas Atividades Registradas
                </CardTitle>
                <CardDescription>
                  Trilha de auditoria operacional em tempo real
                </CardDescription>
              </div>
              <Link href="/historico">
                <Button variant="ghost" size="sm" className="text-xs gap-1 text-brand-600">
                  Ver Histórico Completo
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : activities.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">
                  Nenhuma atividade registrada até o momento.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {activities.map((act) => {
                    const isReprint = act.action === "ITEM_REIMPRESSAO";
                    const isMaint = act.action.includes("MANUTENCAO");
                    const isCalib = act.action.includes("CALIBRACAO");

                    return (
                      <div key={act.id} className="py-3 flex items-start justify-between gap-4 text-xs">
                        <div className="flex items-start gap-3">
                          <div
                            className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                              isReprint
                                ? "bg-rose-100 text-rose-700"
                                : isMaint
                                ? "bg-amber-100 text-amber-700"
                                : isCalib
                                ? "bg-blue-100 text-blue-700"
                                : "bg-slate-100 text-slate-700"
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

                          <div>
                            <div className="font-semibold text-slate-800">
                              {act.action === "ITEM_REIMPRESSAO" && "Item Retornou para Reimpressão"}
                              {act.action === "ITEM_CONCLUIDO" && "Modelo Concluído com Sucesso"}
                              {act.action === "IMPRESSAO_FINALIZADA" && "Ordem de Impressão Finalizada"}
                              {act.action === "IMPRESSAO_INICIADA" && "Nova Impressão Iniciada"}
                              {act.action === "TRABALHO_CRIADO" && "Novo Trabalho Criado pelo Cadista"}
                              {act.action === "MANUTENCAO_APROVADA" && "Manutenção Aprovada (Impressora Liberada)"}
                              {act.action === "MANUTENCAO_REPROVADA" && "Manutenção Reprovada (Impressora Bloqueada)"}
                              {act.action === "RECEBIMENTO_RESINA" && "Novo Lote de Resina Recebido"}
                              {act.action === "CALIBRACAO_APROVADA" && "Calibração Aprovada com Sucesso"}
                              {act.action === "CALIBRACAO_REPROVADA" && "Calibração Reprovada (Fora de Parâmetros)"}
                            </div>
                            <p className="text-slate-500 mt-0.5">
                              {act.new_data ? JSON.stringify(act.new_data).replace(/["{}]/g, " ") : "Operação concluída"}
                            </p>
                          </div>
                        </div>

                        <span className="shrink-0 text-[11px] text-slate-400 font-medium">
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
      </div>
    </AppShell>
  );
}
