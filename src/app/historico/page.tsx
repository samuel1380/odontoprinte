"use client";

import React, { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/shell";
import { OdontoPrintService } from "@/services/odontoprint-service";
import { CaseTimelineEvent } from "@/types/domain";
import { formatDate } from "@/lib/utils";
import {
  History,
  Search,
  ChevronRight,
  Clock,
  Printer,
  CheckCircle2,
  AlertTriangle,
  FileCheck2,
  Layers,
  Sparkles,
  User,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "sonner";

export default function HistoricoPage() {
  const [cases, setCases] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Timeline Modal State
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [timelineData, setTimelineData] = useState<{
    caseData: any;
    items: any[];
    timeline: CaseTimelineEvent[];
  } | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const loadHistory = async (query = "") => {
    setIsLoading(true);
    try {
      const res = await OdontoPrintService.getHistory({ search: query });
      setCases(res.cases);
    } catch {
      toast.error("Erro ao carregar histórico.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadHistory(searchQuery);
  };

  const handleOpenTimeline = async (caseId: string) => {
    setSelectedCaseId(caseId);
    setTimelineLoading(true);
    setModalOpen(true);
    try {
      const data = await OdontoPrintService.getCaseTimeline(caseId);
      setTimelineData(data);
    } catch {
      toast.error("Erro ao carregar timeline do paciente.");
    } finally {
      setTimelineLoading(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200/80 pb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              Rastreabilidade de Trabalhos
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Pesquise qualquer paciente, código de trabalho ou lote e visualize a linha do tempo ponta a ponta.
            </p>
          </div>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2.5 bg-white p-3 rounded-xl border border-slate-200/90 shadow-2xs">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Pesquisar por paciente (ex: PAC-100), nome ou lote..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-brand-500 bg-slate-50/50"
            />
          </div>
          <Button type="submit" size="sm" className="font-bold px-4 w-full sm:w-auto justify-center">
            Pesquisar
          </Button>
        </form>

        {/* Results List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : cases.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-200 p-8 text-xs text-slate-400">
            Nenhum trabalho encontrado com o termo pesquisado.
          </div>
        ) : (
          <div className="space-y-3">
            {cases.map((c) => {
              const isDone = c.status === "CONCLUIDO";
              const isReprint = c.status === "REIMPRESSAO";

              return (
                <Card
                  key={c.id}
                  onClick={() => handleOpenTimeline(c.id)}
                  className={`cursor-pointer transition-all hover:border-brand-400 hover:shadow-card ${
                    isReprint ? "border-rose-300 bg-rose-50/10" : ""
                  }`}
                >
                  <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-4">
                      <div
                        className={`h-10 w-10 rounded-xl flex items-center justify-center font-mono font-black text-sm shrink-0 ${
                          isReprint
                            ? "bg-rose-100 text-rose-700 border border-rose-200"
                            : isDone
                            ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                            : "bg-brand-100 text-brand-700 border border-brand-200"
                        }`}
                      >
                        {c.patient_code.replace("PAC-", "")}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm text-slate-900">
                            {c.patient_code}
                          </span>
                          {c.patient_name && (
                            <span className="text-slate-500 font-medium">
                              &bull; {c.patient_name}
                            </span>
                          )}
                          <Badge
                            variant={
                              isReprint
                                ? "reprint"
                                : isDone
                                ? "success"
                                : "default"
                            }
                          >
                            {isReprint
                              ? "Contém Reimpressão"
                              : isDone
                              ? "Concluído"
                              : "Em Produção"}
                          </Badge>
                        </div>

                        {c.notes && (
                          <p className="text-slate-500 text-[11px] mt-0.5 line-clamp-1">
                            {c.notes}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 pl-2 sm:pl-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block">Entrada no Sistema</span>
                        <span className="font-medium text-slate-700">
                          {formatDate(c.created_at)}
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block">Modelos</span>
                        <span className="font-bold text-slate-800">
                          {c.completed_count} / {c.items_count}
                        </span>
                      </div>

                      <Button size="sm" variant="ghost" className="gap-1 text-brand-600 font-semibold">
                        Ver Histórico
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Timeline Modal */}
        <Dialog
          open={modalOpen}
          onOpenChange={setModalOpen}
          title={`Linha do Tempo: ${timelineData?.caseData?.patient_code || ""}`}
          description={
            timelineData?.caseData?.patient_name
              ? `Paciente: ${timelineData.caseData.patient_name} • Rastreabilidade Completa`
              : "Rastreabilidade completa de ponta a ponta do trabalho."
          }
          className="max-w-2xl"
        >
          {timelineLoading ? (
            <div className="space-y-4 py-4">
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
          ) : !timelineData ? (
            <div className="text-center py-6 text-xs text-slate-400">
              Não foi possível carregar a linha do tempo.
            </div>
          ) : (
            <div className="py-4 space-y-6">
              {/* Timeline Container */}
              <div className="relative pl-6 border-l-2 border-brand-200 space-y-6">
                {timelineData.timeline.map((evt) => {
                  const isFailed = evt.type === "FAILED";
                  const isDone = evt.type === "COMPLETED";

                  return (
                    <div key={evt.id} className="relative">
                      <div
                        className={`absolute -left-[31px] top-0.5 h-4 w-4 rounded-full border-2 border-white shadow-sm ${
                          isFailed
                            ? "bg-rose-500"
                            : isDone
                            ? "bg-emerald-500"
                            : "bg-brand-500"
                        }`}
                      />

                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs font-bold text-slate-900">
                          {evt.title}
                        </span>
                        <span className="text-[10px] text-slate-400 shrink-0 font-medium">
                          {formatDate(evt.timestamp)}
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                        {evt.description}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end">
                <Button variant="outline" size="sm" onClick={() => setModalOpen(false)}>
                  Fechar Linha do Tempo
                </Button>
              </div>
            </div>
          )}
        </Dialog>
      </div>
    </AppShell>
  );
}
