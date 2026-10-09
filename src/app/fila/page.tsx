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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#EFECE6] pb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#18181B] tracking-tight">
              Fila de Impressão 3D
            </h1>
            <p className="text-xs text-[#716D66] mt-0.5">
              Selecione os modelos para compor a mesa de impressão.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={loadQueue}
              className="gap-1.5 text-xs text-[#2D2A26] w-full sm:w-auto justify-center"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Atualizar
            </Button>

            <Button
              onClick={handleProceedToSlicer}
              disabled={selectedItemIds.length === 0}
              variant={selectedItemIds.length > 0 ? "accent" : "default"}
              size="default"
              className="gap-2 font-bold w-full sm:w-auto justify-center"
            >
              <Scissors className="w-4 h-4" />
              Preparar no Fatiador ({selectedItemIds.length})
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-white p-2.5 sm:p-3 rounded-2xl sm:rounded-3xl border border-[#EFECE6]">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full lg:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-[#716D66] absolute left-3.5 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar paciente..."
                className="w-full pl-9 pr-4 py-2 text-xs rounded-full border border-[#EFECE6] focus:outline-none focus:ring-2 focus:ring-[#18181B] bg-[#FAF8F5]/60 text-[#18181B]"
              />
            </div>

            {/* Segmented Controls / Pill Filter */}
            <div className="flex flex-wrap items-center gap-1 bg-[#FAF8F5] p-1 rounded-full border border-[#EFECE6]">
              <button
                type="button"
                onClick={() => setActiveFilter("TODOS")}
                className={`px-3 py-1 text-xs font-semibold rounded-full transition ${
                  activeFilter === "TODOS"
                    ? "bg-[#18181B] text-white shadow-xs"
                    : "text-[#716D66] hover:text-[#18181B]"
                }`}
              >
                Todos ({totalItemsInQueue})
              </button>
              <button
                type="button"
                onClick={() => setActiveFilter("REIMPRESSAO")}
                className={`px-3 py-1 text-xs font-semibold rounded-full flex items-center gap-1 transition ${
                  activeFilter === "REIMPRESSAO"
                    ? "bg-[#DE5A35] text-white shadow-xs"
                    : "text-[#716D66] hover:text-[#DE5A35]"
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
                    ? "bg-[#18181B] text-white shadow-xs"
                    : "text-[#716D66] hover:text-[#18181B]"
                }`}
              >
                Novos ({totalItemsInQueue - totalReprintItems})
              </button>
            </div>
          </div>

          <div className="text-xs text-[#716D66] font-medium sm:text-right px-2">
            <span className="font-bold text-[#18181B]">{selectedItemIds.length}</span> modelos selecionados
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
            title="Nenhum item na fila"
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
                      ? "border-[#DE5A35]/30 bg-white"
                      : "border-[#EFECE6] bg-white"
                  }`}
                >
                  {/* Card Patient Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-[#FAF8F5]/80 border-b border-[#EFECE6] px-4 sm:px-6 py-3">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleSelectAllInCard(card.items)}
                        className="text-[#716D66] hover:text-[#18181B] transition shrink-0"
                        title={allCardSelected ? "Desmarcar todos" : "Selecionar todos"}
                      >
                        {allCardSelected ? (
                          <CheckSquare className="w-5 h-5 text-[#18181B]" />
                        ) : (
                          <Square className="w-5 h-5" />
                        )}
                      </button>

                      <div className="flex flex-wrap items-baseline gap-1.5 sm:gap-2">
                        <span className="font-mono font-bold text-sm sm:text-base text-[#18181B] tracking-wider">
                          {card.patient_code}
                        </span>
                        {card.patient_name && (
                          <span className="text-xs text-[#716D66] font-medium">
                            &bull; {card.patient_name}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs text-[#716D66] pl-8 sm:pl-0">
                      <div className="flex items-center gap-1.5 text-[#2D2A26] bg-white px-3 py-1 rounded-full border border-[#EFECE6] text-xs">
                        <Clock className="w-3.5 h-3.5 text-[#716D66] shrink-0" />
                        <span>Entrada: {formatDate(card.queue_entered_at)}</span>
                        <span className="font-semibold text-[#18181B]">
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
                                  ? "border-[#DE5A35] bg-rose-50/50"
                                  : "border-[#18181B] bg-[#FAF8F5]"
                                : item.is_retry
                                ? "border-[#DE5A35]/30 bg-rose-50/20 hover:bg-rose-50/40"
                                : "border-[#EFECE6] bg-white hover:border-[#E2DDD5] hover:bg-[#FAF8F5]/40"
                            }`}
                          >
                            <div className="flex items-start gap-2.5">
                              <div
                                className={`mt-0.5 h-4.5 w-4.5 rounded-full border flex items-center justify-center transition-all ${
                                  isSelected
                                    ? item.is_retry
                                      ? "border-[#DE5A35] bg-[#DE5A35] text-white"
                                      : "border-[#18181B] bg-[#18181B] text-white"
                                    : "border-[#D1CCC4] bg-white"
                                }`}
                              >
                                {isSelected && <CheckSquare className="w-3 h-3" />}
                              </div>

                              <div>
                                <div className="text-xs font-bold text-[#18181B] flex items-center gap-2">
                                  {FILE_TYPE_LABELS[item.file_type]}
                                </div>

                                {item.is_retry && (
                                  <div className="mt-1 space-y-0.5">
                                    <Badge variant="destructive" className="text-[10px] py-0 px-2">
                                      Tentativa {item.retry_count + 1}
                                    </Badge>
                                    {item.last_failure_reason && (
                                      <p className="text-[11px] text-[#DE3535] font-medium leading-tight">
                                        Motivo: {item.last_failure_reason}
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            <span
                              className={`text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-full ${
                                isSelected
                                  ? item.is_retry
                                    ? "bg-[#DE5A35]/15 text-[#DE5A35]"
                                    : "bg-[#18181B] text-white"
                                  : "text-[#716D66] bg-[#FAF8F5]"
                              }`}
                            >
                              {isSelected ? "Selecionado" : "Na Fila"}
                            </span>
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
