"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/shell";
import { OdontoPrintService } from "@/services/odontoprint-service";
import { PrintRun } from "@/types/database.types";
import { formatDate } from "@/lib/utils";
import {
  Printer,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  Scissors,
  Layers,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

export default function ImpressoesPage() {
  const [runs, setRuns] = useState<
    (PrintRun & { printer_name: string; resin_brand: string; items_count: number })[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const data = await OdontoPrintService.getPrintRuns();
        setRuns(data);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  const activeRuns = runs.filter((r) => r.status === "EM_IMPRESSAO");
  const finishedRuns = runs.filter((r) => r.status === "FINALIZADA");

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#EFECE6] pb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#18181B] tracking-tight">
              Ordens de Impressão
            </h1>
            <p className="text-xs text-[#716D66] mt-0.5">
              Acompanhamento de mesas em produção e histórico.
            </p>
          </div>

          <Link href="/fatiador" className="w-full sm:w-auto">
            <Button variant="default" size="sm" className="gap-1.5 w-full sm:w-auto justify-center font-bold">
              <Scissors className="w-4 h-4" />
              Novo Fatiamento
            </Button>
          </Link>
        </div>

        {/* Active Runs Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#18181B] flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#DE5A35] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#DE5A35]"></span>
              </span>
              Em Execução ({activeRuns.length})
            </h2>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Skeleton className="h-36 w-full rounded-3xl" />
              <Skeleton className="h-36 w-full rounded-3xl" />
            </div>
          ) : activeRuns.length === 0 ? (
            <div className="p-6 rounded-3xl border border-dashed border-[#EFECE6] bg-white text-center text-xs text-[#716D66]">
              Nenhuma ordem de impressão sendo executada no momento.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeRuns.map((run) => (
                <Card key={run.id} className="border border-[#EFECE6] bg-white transition hover:border-[#18181B]/40">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xl font-bold text-[#18181B]">
                        {run.run_code}
                      </span>
                      <Badge variant="default" className="text-[10px]">
                        Em Impressão
                      </Badge>
                    </div>
                    <Link href={`/impressoes/${run.id}`}>
                      <Button size="sm" variant="outline" className="text-xs font-bold gap-1">
                        Gerenciar
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                    </Link>
                  </CardHeader>
                  <CardContent className="space-y-1.5 text-xs text-[#716D66]">
                    <div>
                      <span className="text-[#A19D95]">Impressora:</span>{" "}
                      <span className="font-semibold text-[#18181B]">{run.printer_name}</span>
                    </div>
                    <div>
                      <span className="text-[#A19D95]">Resina:</span>{" "}
                      <span className="font-semibold text-[#18181B]">{run.resin_brand}</span>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-[#EFECE6] text-[11px]">
                      <span>{run.items_count} modelos na mesa</span>
                      <span>{formatDate(run.started_at)}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Finished Runs Section */}
        <div className="pt-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#18181B] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Histórico ({finishedRuns.length})
            </h2>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-2xl" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {finishedRuns.map((run) => (
                <Card key={run.id} className="hover:border-[#18181B]/30 transition">
                  <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-base font-bold text-[#18181B]">
                        {run.run_code}
                      </span>
                      <div>
                        <div className="font-semibold text-[#18181B]">{run.printer_name}</div>
                        <div className="text-[#716D66] text-[11px]">{run.resin_brand}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right hidden md:block">
                        <div className="font-medium text-[#716D66]">{formatDate(run.finished_at)}</div>
                      </div>

                      <Badge variant="secondary" className="text-[11px]">
                        Finalizada
                      </Badge>

                      <Link href={`/impressoes/${run.id}`}>
                        <Button size="sm" variant="ghost" className="text-xs">
                          Detalhes
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
