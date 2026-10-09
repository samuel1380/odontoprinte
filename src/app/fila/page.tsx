"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/shell";
import { OdontoPrintService } from "@/services/odontoprint-service";
import { QueueItem } from "@/types/domain";
import { FILE_TYPE_LABELS } from "@/lib/constants";
import {
  Clock,
  Scissors,
  CheckSquare,
  Square,
  Search,
  AlertTriangle,
  RefreshCcw,
  ListOrdered,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";

interface CaseGroup {
  case_id: string;
  patient_code: string;
  patient_name?: string | null;
  queue_entered_at: string;
  items: QueueItem[];
}

export default function FilaPage() {
  const router = useRouter();
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"TODOS" | "REIMPRESSAO" | "AGUARDANDO">("TODOS");

  const loadQueue = async () => {
    setIsLoading(true);
    try {
      const items = await OdontoPrintService.getQueueItems();
      setQueueItems(items);
    } catch {
      toast.error("Erro ao carregar fila de impressão.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();
  }, []);

  const caseGroups: CaseGroup[] = useMemo(() => {
    const map = new Map<string, CaseGroup>();

    for (const item of queueItems) {
      if (!map.has(item.case_id)) {
        map.set(item.case_id, {
          case_id: item.case_id,
          patient_code: item.patient_code,
          patient_name: item.patient_name,
          queue_entered_at: item.queue_entered_at,
          items: [],
        });
      }
      map.get(item.case_id)!.items.push(item);
    }

    return Array.from(map.values());
  }, [queueItems]);

  const filteredGroups = useMemo(() => {
    return caseGroups
      .map((group) => {
        let items = group.items;

        if (activeFilter === "REIMPRESSAO") {
          items = items.filter((i) => i.is_retry);
        } else if (activeFilter === "AGUARDANDO") {
          items = items.filter((i) => !i.is_retry);
        }

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchCase =
            group.patient_code.toLowerCase().includes(q) ||
            (group.patient_name && group.patient_name.toLowerCase().includes(q));
          if (!matchCase) {
            items = items.filter((i) =>
              (FILE_TYPE_LABELS[i.file_type] || "").toLowerCase().includes(q)
            );
          }
        }

        return { ...group, items };
      })
      .filter((group) => group.items.length > 0);
  }, [caseGroups, activeFilter, searchQuery]);

  const toggleItemSelection = (id: string) => {
    setSelectedItemIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleSelectAllInCard = (items: QueueItem[]) => {
    const ids = items.map((i) => i.id);
    const allSelected = ids.every((id) => selectedItemIds.includes(id));

    if (allSelected) {
      setSelectedItemIds((prev) => prev.filter((id) => !ids.includes(id)));
    } else {
      setSelectedItemIds((prev) => Array.from(new Set([...prev, ...ids])));
    }
  };

  const handleSendToSlicer = () => {
    if (selectedItemIds.length === 0) {
      toast.warning("Selecione pelo menos um modelo da fila para fatiar.");
      return;
    }
    router.push(`/fatiador?items=${selectedItemIds.join(",")}`);
  };

  const totalItemsInQueue = queueItems.length;
  const totalReprintItems = queueItems.filter((i) => i.is_retry).length;

  const formatRelativeWait = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    if (hours > 24) return `${Math.floor(hours / 24)}d`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${Math.max(1, minutes)} min`;
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Fila de Impressão 3D
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              Sequenciamento inteligente FIFO com prioridade automática.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={loadQueue}
              className="gap-1.5 text-xs rounded-full border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              <RefreshCcw className="w-3.5 h-3.5" />
              Atualizar
            </Button>

            <Button
              type="button"
              onClick={handleSendToSlicer}
              disabled={selectedItemIds.length === 0}
              className="gap-2 text-xs font-bold rounded-full bg-white hover:bg-slate-200 text-slate-950 shadow-md"
            >
              <Scissors className="w-3.5 h-3.5" />
              Preparar Impressão ({selectedItemIds.length})
            </Button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-[#0F172A] p-2.5 sm:p-3 rounded-2xl sm:rounded-3xl border border-slate-800">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full lg:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar paciente..."
                className="w-full pl-9 pr-4 py-2 text-xs rounded-full border border-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-400 bg-slate-900 text-white placeholder:text-slate-500"
              />
            </div>

            {/* Segmented Controls / Pill Filter */}
            <div className="flex flex-wrap items-center gap-1 bg-[#0B0F19] p-1 rounded-full border border-slate-800">
              <button
                type="button"
                onClick={() => setActiveFilter("TODOS")}
                className={`px-3 py-1 text-xs font-semibold rounded-full transition ${
                  activeFilter === "TODOS"
                    ? "bg-white text-slate-950 shadow-xs"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Todos ({totalItemsInQueue})
              </button>
              <button
                type="button"
                onClick={() => setActiveFilter("REIMPRESSAO")}
                className={`px-3 py-1 text-xs font-semibold rounded-full flex items-center gap-1 transition ${
                  activeFilter === "REIMPRESSAO"
                    ? "bg-cyan-500 text-slate-950 font-bold shadow-xs"
                    : "text-slate-400 hover:text-cyan-400"
                }`}
              >
                <AlertTriangle className="w-3 h-3" />
                Reimpressões ({totalReprintItems})
              </button>
              <button
                type="button"
                onClick={() => setActiveFilter("AGUARDANDO")}
                className={`px-3 py-1 text-xs font-semibold rounded-full transition ${
                  activeFilter === "AGUARDANDO"
                    ? "bg-white text-slate-950 shadow-xs"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Novos ({totalItemsInQueue - totalReprintItems})
              </button>
            </div>
          </div>
        </div>

        {/* Fila Cases List */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 w-full rounded-3xl bg-slate-800" />
            ))}
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="p-12 text-center rounded-3xl border border-slate-800 bg-[#0F172A] text-slate-400">
            <ListOrdered className="w-8 h-8 mx-auto mb-2 text-slate-500" />
            <p className="font-semibold text-white">Nenhum item aguardando na fila</p>
            <p className="text-xs text-slate-400 mt-1">
              Todos os modelos odontológicos cadastrados já foram fatiados ou impressos.
            </p>
            <Link href="/cadista/status" className="mt-4 inline-block">
              <Button size="sm" className="rounded-full bg-white text-slate-950 hover:bg-slate-200">
                Cadastrar Novo Caso
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredGroups.map((card) => {
              const allCardSelected = card.items.every((i) => selectedItemIds.includes(i.id));
              const hasReprintItem = card.items.some((i) => i.is_retry);

              return (
                <Card
                  key={card.case_id}
                  className={`overflow-hidden transition-all duration-200 border ${
                    hasReprintItem
                      ? "border-rose-500/40 bg-[#0F172A]"
                      : "border-slate-800 bg-[#0F172A]"
                  }`}
                >
                  {/* Card Patient Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-[#0B0F19]/80 border-b border-slate-800 px-4 sm:px-6 py-3">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleSelectAllInCard(card.items)}
                        className="text-slate-400 hover:text-white transition shrink-0"
                        title={allCardSelected ? "Desmarcar todos" : "Selecionar todos"}
                      >
                        {allCardSelected ? (
                          <CheckSquare className="w-5 h-5 text-white" />
                        ) : (
                          <Square className="w-5 h-5" />
                        )}
                      </button>

                      <div className="flex flex-wrap items-baseline gap-1.5 sm:gap-2">
                        <span className="font-mono font-bold text-sm sm:text-base text-white tracking-wider">
                          {card.patient_code}
                        </span>
                        {card.patient_name && (
                          <span className="text-xs text-slate-400 font-medium">
                            &bull; {card.patient_name}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs text-slate-400 pl-8 sm:pl-0">
                      <div className="flex items-center gap-1.5 text-slate-300 bg-slate-900 px-3 py-1 rounded-full border border-slate-800 text-xs">
                        <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>Entrada: {formatDate(card.queue_entered_at)}</span>
                        <span className="font-semibold text-white">
                          ({formatRelativeWait(card.queue_entered_at)} atrás)
                        </span>
                      </div>

                      {hasReprintItem && (
                        <Badge variant="destructive" className="gap-1 text-[11px]">
                          <AlertTriangle className="w-3 h-3" />
                          Reimpressão
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Card Items List */}
                  <CardContent className="p-4 sm:p-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {card.items.map((item) => {
                        const isSelected = selectedItemIds.includes(item.id);

                        return (
                          <div
                            key={item.id}
                            onClick={() => toggleItemSelection(item.id)}
                            className={`flex items-start justify-between p-3.5 rounded-2xl border cursor-pointer transition-all ${
                              isSelected
                                ? item.is_retry
                                  ? "border-rose-500 bg-rose-950/40"
                                  : "border-cyan-500 bg-slate-900"
                                : item.is_retry
                                ? "border-rose-800/40 bg-rose-950/20 hover:bg-rose-950/30"
                                : "border-slate-800 bg-[#0B0F19]/60 hover:border-slate-700 hover:bg-slate-900/40"
                            }`}
                          >
                            <div className="flex items-start gap-2.5">
                              <div
                                className={`mt-0.5 h-4.5 w-4.5 rounded-full border flex items-center justify-center transition-all ${
                                  isSelected
                                    ? item.is_retry
                                      ? "border-rose-500 bg-rose-500 text-white"
                                      : "border-cyan-400 bg-cyan-400 text-slate-950"
                                    : "border-slate-700 bg-slate-900"
                                }`}
                              >
                                {isSelected && <CheckSquare className="w-3 h-3" />}
                              </div>

                              <div>
                                <div className="text-xs font-bold text-white flex items-center gap-2">
                                  {FILE_TYPE_LABELS[item.file_type]}
                                </div>

                                {item.is_retry && (
                                  <div className="mt-1 space-y-0.5">
                                    <Badge variant="destructive" className="text-[10px] py-0 px-2">
                                      Tentativa {item.retry_count + 1}
                                    </Badge>
                                    {item.last_failure_reason && (
                                      <p className="text-[11px] text-rose-400 font-medium leading-tight">
                                        Motivo: {item.last_failure_reason}
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
