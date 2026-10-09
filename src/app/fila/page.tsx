"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/shell";
import { OdontoPrintService } from "@/services/odontoprint-service";
import { PatientQueueCard, QueueItem } from "@/types/domain";
import { FILE_TYPE_LABELS } from "@/lib/constants";
import { formatDate, formatRelativeWait } from "@/lib/utils";
import {
  ListOrdered,
  Scissors,
  Clock,
  AlertTriangle,
  CheckSquare,
  Square,
  Search,
  Filter,
  ArrowRight,
  RefreshCw,
  Layers,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";

export default function FilaPage() {
  const router = useRouter();

  const [cards, setCards] = useState<PatientQueueCard[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"TODOS" | "REIMPRESSAO" | "AGUARDANDO">("TODOS");

  const loadQueue = async () => {
    setIsLoading(true);
    try {
      const data = await OdontoPrintService.getQueue();
      setCards(data.cards);
    } catch {
      toast.error("Erro ao carregar fila de impressão.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();
  }, []);

  const toggleItemSelection = (itemId: string) => {
    setSelectedItemIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  };

  const handleSelectAllInCard = (items: QueueItem[]) => {
    const cardItemIds = items.map((i) => i.id);
    const allSelected = cardItemIds.every((id) => selectedItemIds.includes(id));

    if (allSelected) {
      setSelectedItemIds((prev) => prev.filter((id) => !cardItemIds.includes(id)));
    } else {
      setSelectedItemIds((prev) => Array.from(new Set([...prev, ...cardItemIds])));
    }
  };

  const handleProceedToSlicer = () => {
    if (selectedItemIds.length === 0) {
      toast.error("Selecione pelo menos um modelo da fila para enviar ao fatiador.");
      return;
    }
    const params = new URLSearchParams();
    params.set("items", selectedItemIds.join(","));
    router.push(`/fatiador?${params.toString()}`);
  };

  // Filtragem
  const filteredCards = cards
    .map((card) => {
      const matchingItems = card.items.filter((item) => {
        if (activeFilter === "REIMPRESSAO" && !item.is_retry) return false;
        if (activeFilter === "AGUARDANDO" && item.is_retry) return false;
        return true;
      });

      return { ...card, items: matchingItems };
    })
    .filter((card) => {
      if (card.items.length === 0) return false;
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        card.patient_code.toLowerCase().includes(q) ||
        (card.patient_name && card.patient_name.toLowerCase().includes(q))
      );
    });

  const totalItemsInQueue = cards.reduce((acc, c) => acc + c.items.length, 0);
  const totalReprintItems = cards.reduce(
    (acc, c) => acc + c.items.filter((i) => i.is_retry).length,
    0
  );

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Top Header & Proceed Button */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200/80 pb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              Fila de Impressão 3D
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Selecione itens de um ou múltiplos pacientes para compor a mesa no Fatiador.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={loadQueue}
              className="gap-1.5 text-xs text-slate-600 w-full sm:w-auto justify-center"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Atualizar
            </Button>

            <Button
              onClick={handleProceedToSlicer}
              disabled={selectedItemIds.length === 0}
              variant={selectedItemIds.length > 0 ? "lime" : "default"}
              size="default"
              className="gap-2 font-bold shadow-xs w-full sm:w-auto justify-center"
            >
              <Scissors className="w-4 h-4" />
              Preparar no Fatiador ({selectedItemIds.length})
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200/90 shadow-2xs">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full lg:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filtrar paciente (ex: PAC-100)..."
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-brand-500 bg-slate-50/50"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1 sm:border-l sm:border-slate-200 sm:pl-2">
              <Button
                size="sm"
                variant={activeFilter === "TODOS" ? "default" : "ghost"}
                onClick={() => setActiveFilter("TODOS")}
                className="text-xs h-8 flex-1 sm:flex-initial"
              >
                Todos ({totalItemsInQueue})
              </Button>
              <Button
                size="sm"
                variant={activeFilter === "REIMPRESSAO" ? "destructive" : "ghost"}
                onClick={() => setActiveFilter("REIMPRESSAO")}
                className="text-xs h-8 gap-1.5 flex-1 sm:flex-initial"
              >
                <AlertTriangle className="w-3 h-3 text-rose-500" />
                Reimpressões ({totalReprintItems})
              </Button>
              <Button
                size="sm"
                variant={activeFilter === "AGUARDANDO" ? "secondary" : "ghost"}
                onClick={() => setActiveFilter("AGUARDANDO")}
                className="text-xs h-8 flex-1 sm:flex-initial"
              >
                Novos ({totalItemsInQueue - totalReprintItems})
              </Button>
            </div>
          </div>

          <div className="text-xs text-slate-500 font-medium sm:text-right">
            <span className="font-bold text-brand-600">{selectedItemIds.length}</span> modelos selecionados
          </div>
        </div>

        {/* Patient Cards List */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-44 w-full rounded-2xl" />
            ))}
          </div>
        ) : filteredCards.length === 0 ? (
          <EmptyState
            icon={ListOrdered}
            title="Nenhum item na fila com os filtros selecionados"
            description="Todos os trabalhos foram fatiados ou ainda não há novos modelos solicitados pelo Cadista."
            actionLabel="+ Criar Novo Trabalho"
            onAction={() => router.push("/cadista/status")}
          />
        ) : (
          <div className="space-y-4">
            {filteredCards.map((card) => {
              const allCardSelected = card.items.every((i) => selectedItemIds.includes(i.id));
              const hasReprintItem = card.items.some((i) => i.is_retry);

              return (
                <Card
                  key={card.case_id}
                  className={`overflow-hidden transition-all duration-200 border ${
                    hasReprintItem
                      ? "border-rose-200 bg-white"
                      : "border-slate-200/90 bg-white"
                  } shadow-2xs`}
                >
                  {/* Card Patient Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-slate-50/70 border-b border-slate-100 px-4 sm:px-5 py-2.5">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleSelectAllInCard(card.items)}
                        className="text-slate-400 hover:text-brand-600 transition shrink-0"
                        title={allCardSelected ? "Desmarcar todos deste paciente" : "Selecionar todos deste paciente"}
                      >
                        {allCardSelected ? (
                          <CheckSquare className="w-5 h-5 text-brand-500" />
                        ) : (
                          <Square className="w-5 h-5" />
                        )}
                      </button>

                      <div className="flex flex-wrap items-baseline gap-1.5 sm:gap-2">
                        <span className="font-mono font-bold text-sm sm:text-base text-slate-900 tracking-wider">
                          {card.patient_code}
                        </span>
                        {card.patient_name && (
                          <span className="text-xs text-slate-500 font-medium">
                            &bull; {card.patient_name}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs text-slate-500 pl-8 sm:pl-0">
                      <div className="flex items-center gap-1.5 text-slate-600 bg-white px-2.5 py-1 rounded-md border border-slate-200 text-xs shadow-2xs">
                        <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>Entrada: {formatDate(card.queue_entered_at)}</span>
                        <span className="font-semibold text-slate-700">
                          ({formatRelativeWait(card.queue_entered_at)} atrás)
                        </span>
                      </div>

                      {hasReprintItem && (
                        <Badge variant="reprint" className="gap-1 text-[11px]">
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
                            className={`flex items-start justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                              isSelected
                                ? item.is_retry
                                  ? "border-rose-400 bg-rose-50/70 shadow-2xs ring-1 ring-rose-400"
                                  : "border-brand-500 bg-brand-50/50 shadow-2xs ring-1 ring-brand-500"
                                : item.is_retry
                                ? "border-rose-200 bg-rose-50/30 hover:bg-rose-50/60"
                                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                            }`}
                          >
                            <div className="flex items-start gap-2.5">
                              {/* Checkbox visual */}
                              <div
                                className={`mt-0.5 h-4.5 w-4.5 rounded border flex items-center justify-center transition-all ${
                                  isSelected
                                    ? item.is_retry
                                      ? "border-rose-600 bg-rose-500 text-white"
                                      : "border-brand-600 bg-brand-500 text-white"
                                    : "border-slate-300 bg-white"
                                }`}
                              >
                                {isSelected && <CheckSquare className="w-3.5 h-3.5" />}
                              </div>

                              <div>
                                <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                                  {FILE_TYPE_LABELS[item.file_type]}
                                </div>

                                {item.is_retry && (
                                  <div className="mt-1 space-y-0.5">
                                    <Badge variant="reprint" className="text-[10px] py-0 px-1.5">
                                      Tentativa {item.retry_count + 1}
                                    </Badge>
                                    {item.last_failure_reason && (
                                      <p className="text-[11px] text-rose-700 font-medium leading-tight">
                                        Motivo: {item.last_failure_reason}
                                      </p>
                                    )}
                                    {item.last_run_code && (
                                      <p className="text-[10px] text-slate-400">
                                        Ordem original: {item.last_run_code}
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            <span
                              className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md ${
                                isSelected
                                  ? item.is_retry
                                    ? "bg-rose-100 text-rose-800"
                                    : "bg-brand-100 text-brand-800"
                                  : "text-slate-400"
                              }`}
                            >
                              {isSelected ? "Selecionado" : "Na Fila"}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                      <span>
                        Itens desmarcados deste paciente continuarão na fila para as próximas impressões.
                      </span>
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
