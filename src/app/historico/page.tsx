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
  Layers,
  XCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <History className="w-5 h-5 text-cyan-400" />
              Histórico Completo
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Busque um paciente e veja a linha do tempo do trabalho.
            </p>
          </div>
          {!isLoading && cases.length > 0 && (
            <span className="text-xs text-slate-400 bg-slate-900 border border-slate-800 rounded-md px-2 py-0.5 w-fit">
              {cases.length} {cases.length === 1 ? "trabalho" : "trabalhos"}
            </span>
          )}
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2.5 bg-[#0F172A] p-3 rounded-2xl border border-slate-800 shadow-2xs">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Paciente, código ou lote... (ex: PAC-100)"
              className="w-full pl-9 pr-8 py-2 text-xs rounded-xl border border-slate-800 focus:outline-none focus:border-cyan-500 bg-[#0B0F19] text-white placeholder:text-slate-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  loadHistory("");
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                title="Limpar busca"
              >
                <XCircle className="w-4 h-4" />
              </button>
            )}
          </div>
          <Button type="submit" size="sm" className="font-bold px-5 w-full sm:w-auto justify-center rounded-full bg-white text-slate-950 hover:bg-slate-200">
            Pesquisar
          </Button>
        </form>

        {/* Results List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-2xl" />
            ))}
          </div>
        ) : cases.length === 0 ? (
          <div className="text-center bg-[#0F172A] rounded-2xl border border-dashed border-slate-800 p-8">
            <div className="w-12 h-12 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <Search className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-white">
              {searchQuery ? "Nada encontrado para essa busca" : "Nenhum trabalho no histórico"}
            </h3>
            <p className="text-xs text-slate-400 mt-1 mb-4">
              {searchQuery
                ? "Confira o código do paciente ou limpe a busca para ver tudo."
                : "Os trabalhos concluídos e em produção aparecem aqui."}
            </p>
            {searchQuery && (
              <Button
                variant="outline"
                onClick={() => {
                  setSearchQuery("");
                  loadHistory("");
                }}
                className="border-slate-700 text-slate-300 rounded-full text-xs h-9"
              >
                Limpar busca
              </Button>
            )}
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
                  className={`cursor-pointer transition-all hover:border-slate-700 bg-[#0F172A] border-slate-800 ${
                    isReprint ? "border-rose-500/40 bg-rose-950/10" : ""
                  }`}
                >
                  <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
                          isReprint
                            ? "bg-rose-950/40 text-rose-300 border border-rose-500/30"
                            : isDone
                            ? "bg-emerald-950/40 text-emerald-300 border border-emerald-500/30"
                            : "bg-cyan-950/40 text-cyan-300 border border-cyan-500/30"
                        }`}
                      >
                        <Layers className="w-5 h-5" />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-sm text-white">
                            {c.patient_code}
                          </span>
                          {c.patient_name && (
                            <span className="text-slate-400 font-medium truncate">
                              &bull; {c.patient_name}
                            </span>
                          )}
                          <Badge
                            variant={
                              isReprint
                                ? "reprint"
                                : isDone
                                ? "success"
                                : "secondary"
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
                          <p className="text-slate-400 text-[11px] mt-0.5 line-clamp-1">
                            {c.notes}
                          </p>
                        )}

                        {c.items_count > 0 && (
                          <div className="mt-1.5 h-1 w-full max-w-[220px] rounded-full bg-slate-800 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                isDone ? "bg-emerald-500" : "bg-cyan-500"
                              }`}
                              style={{
                                width: `${Math.min(
                                  100,
                                  Math.round(((c.completed_count || 0) / c.items_count) * 100)
                                )}%`,
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800">
                      <div className="text-left sm:text-right">
                        <span className="text-[10px] text-slate-500 block">Entrada</span>
                        <span className="font-medium text-slate-300">
                          {formatDate(c.created_at)}
                        </span>
                      </div>

                      <div className="text-left sm:text-right">
                        <span className="text-[10px] text-slate-500 block">Modelos</span>
                        <span className="font-bold text-white">
                          {c.completed_count} / {c.items_count}
                        </span>
                      </div>

                      <Button size="sm" variant="ghost" className="gap-1 text-cyan-400 hover:text-cyan-300 hover:bg-slate-800 font-semibold">
                        Linha do tempo
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
          className="max-w-2xl bg-[#0F172A] border-slate-800 text-white"
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
              <div className="relative ml-2 pl-8 border-l-2 border-slate-800 space-y-6">
                {timelineData.timeline.map((evt) => {
                  const isFailed = evt.type === "FAILED";
                  const isDone = evt.type === "COMPLETED";

                  return (
                    <div key={evt.id} className="relative">
                      <div
                        className={`absolute -left-[41px] top-0.5 h-4 w-4 rounded-full border-2 border-[#0F172A] shadow-sm ${
                          isFailed
                            ? "bg-rose-500"
                            : isDone
                            ? "bg-emerald-500"
                            : "bg-cyan-500"
                        }`}
                      />

                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs font-bold text-white">
                          {evt.title}
                        </span>
                        <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                          {formatDate(evt.timestamp)}
                        </span>
                      </div>

                      <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                        {evt.description}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end">
                <Button variant="outline" size="sm" onClick={() => setModalOpen(false)} className="rounded-full border-slate-700 bg-slate-800 text-slate-200 hover:text-white hover:bg-slate-700">
                  Fechar
                </Button>
              </div>
            </div>
          )}
        </Dialog>
      </div>
    </AppShell>
  );
}
