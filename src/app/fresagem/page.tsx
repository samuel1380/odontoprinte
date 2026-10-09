"use client";

import React, { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/shell";
import { OdontoPrintService } from "@/services/odontoprint-service";
import { MillingQueueItem } from "@/types/domain";
import { FILE_TYPE_LABELS } from "@/lib/constants";
import { useAuth } from "@/lib/auth-context";
import {
  Cog,
  Play,
  Check,
  Disc,
  Search,
  CheckCircle2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog } from "@/components/ui/dialog";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";

export default function FresagemPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<MillingQueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Modal para iniciar usinagem
  const [selectedItem, setSelectedItem] = useState<MillingQueueItem | null>(null);
  const [blockLot, setBlockLot] = useState("");
  const [isStarting, setIsStarting] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await OdontoPrintService.getMillingQueue();
      setItems(data);
    } catch {
      toast.error("Erro ao carregar fila de fresagem.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleStartMilling = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    if (!blockLot.trim()) {
      toast.error("Informe o lote do bloco/disco de Zircônia ou PMMA.");
      return;
    }

    setIsStarting(true);
    try {
      await OdontoPrintService.startMilling(selectedItem.id, blockLot.trim(), user?.id || "");
      toast.success(`Usinagem iniciada para ${selectedItem.patient_code}!`);
      setSelectedItem(null);
      setBlockLot("");
      loadData();
    } catch {
      toast.error("Erro ao iniciar fresagem.");
    } finally {
      setIsStarting(false);
    }
  };

  const handleFinalizeMilling = async (id: string, patientCode: string) => {
    try {
      await OdontoPrintService.finalizeMilling(id, true, undefined, user?.id || "");
      toast.success(`Fresagem de ${patientCode} concluída! Peça enviada para a bancada.`);
      loadData();
    } catch {
      toast.error("Erro ao concluir fresagem.");
    }
  };

  const filteredItems = items.filter((item) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.patient_code.toLowerCase().includes(q) ||
      (item.patient_name && item.patient_name.toLowerCase().includes(q)) ||
      (item.block_lot && item.block_lot.toLowerCase().includes(q))
    );
  });

  const countPending = items.filter((i) => i.status === "AGUARDANDO_FRESAGEM").length;
  const countMilling = items.filter((i) => i.status === "EM_USINAGEM").length;
  const countFinished = items.filter((i) => i.status === "FRESADO_CONCLUIDO").length;

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Fila de Fresagem CNC
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Usinagem de peças em Zircônia e PMMA.
            </p>
          </div>

          <div className="text-xs text-slate-400 bg-[#0F172A] border border-slate-800 px-3.5 py-1.5 rounded-full w-fit">
            Operador: <span className="font-semibold text-white">{user?.full_name || "Operador"}</span>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-4 rounded-2xl sm:rounded-3xl border border-slate-800 bg-[#0F172A] flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-400">Aguardando Fresagem</span>
              <div className="text-2xl font-bold text-white mt-0.5">{countPending}</div>
            </div>
            <Disc className="w-5 h-5 text-slate-500" />
          </div>

          <div className="p-4 rounded-2xl sm:rounded-3xl border border-slate-800 bg-[#0F172A] flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-400">Em Usinagem</span>
              <div className="text-2xl font-bold text-cyan-400 mt-0.5">{countMilling}</div>
            </div>
            <Cog className="w-5 h-5 text-cyan-400 animate-spin" />
          </div>

          <div className="p-4 rounded-2xl sm:rounded-3xl border border-slate-800 bg-[#0F172A] flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-400">Concluídos</span>
              <div className="text-2xl font-bold text-emerald-400 mt-0.5">{countFinished}</div>
            </div>
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          </div>
        </div>

        {/* Search */}
        <div className="bg-[#0F172A] p-2.5 sm:p-3 rounded-2xl sm:rounded-3xl border border-slate-800 flex items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por paciente..."
              className="w-full pl-9 pr-4 py-2 text-xs rounded-full border border-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-400 bg-slate-900 text-white placeholder:text-slate-500"
            />
          </div>

          <div className="text-xs text-slate-400 font-medium hidden sm:block px-2">
            {items.length} itens na fila
          </div>
        </div>

        {/* Lista de Itens */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-32 w-full rounded-3xl bg-slate-800" />
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <EmptyState
            icon={Cog}
            title="Nenhum item na fila de fresagem"
            description="Peças direcionadas para usinagem CNC de Zircônia ou PMMA aparecerão aqui."
          />
        ) : (
          <div className="space-y-3">
            {filteredItems.map((item) => {
              const isWaiting = item.status === "AGUARDANDO_FRESAGEM";
              const isMilling = item.status === "EM_USINAGEM";
              const isDone = item.status === "FRESADO_CONCLUIDO";

              return (
                <Card
                  key={item.id}
                  className={`overflow-hidden border transition-all ${
                    isDone
                      ? "border-emerald-800/40 bg-[#0F172A]"
                      : isMilling
                      ? "border-cyan-500/60 bg-slate-900"
                      : "border-slate-800 bg-[#0F172A] hover:border-slate-700"
                  }`}
                >
                  <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono font-black text-base text-white tracking-wider">
                          {item.patient_code}
                        </span>
                        {item.patient_name && (
                          <span className="text-xs text-slate-400 font-medium">
                            &bull; {item.patient_name}
                          </span>
                        )}
                        <Badge variant="secondary" className="text-[10px]">
                          {item.material}
                        </Badge>
                      </div>

                      <div className="text-xs font-semibold text-white">
                        {FILE_TYPE_LABELS[item.file_type] || item.file_type}
                      </div>

                      {item.block_lot && (
                        <div className="text-[11px] text-slate-400 font-mono">
                          Disco: <span className="font-bold text-cyan-300">{item.block_lot}</span>
                        </div>
                      )}

                      <div className="text-[10px] text-slate-500">
                        {formatDate(item.created_at)}
                      </div>
                    </div>

                    {/* Ações */}
                    <div className="flex items-center gap-2">
                      {isWaiting && (
                        <Button
                          onClick={() => setSelectedItem(item)}
                          size="sm"
                          className="gap-1.5 font-bold w-full sm:w-auto rounded-full bg-cyan-500 hover:bg-cyan-400 text-slate-950"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          Iniciar Usinagem
                        </Button>
                      )}

                      {isMilling && (
                        <Button
                          onClick={() => handleFinalizeMilling(item.id, item.patient_code)}
                          variant="default"
                          size="sm"
                          className="gap-1.5 font-bold w-full sm:w-auto rounded-full bg-white hover:bg-slate-200 text-slate-950"
                        >
                          <Check className="w-4 h-4 stroke-[3]" />
                          Concluir Fresagem
                        </Button>
                      )}

                      {isDone && (
                        <Badge variant="default" className="text-xs bg-emerald-500 text-slate-950 font-bold">
                          Concluído
                        </Badge>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Modal: Iniciar Usinagem CNC */}
        <Dialog
          open={!!selectedItem}
          onOpenChange={(open) => !open && setSelectedItem(null)}
          title="Iniciar Usinagem CNC"
          description={`Vincule o disco/bloco de usinagem para o caso ${selectedItem?.patient_code}.`}
        >
          <form onSubmit={handleStartMilling} className="space-y-4 pt-2">
            <div>
              <label className="block text-xs font-semibold text-slate-200 mb-1">
                Lote do Bloco / Disco de Zircônia ou PMMA *
              </label>
              <input
                type="text"
                required
                value={blockLot}
                onChange={(e) => setBlockLot(e.target.value)}
                placeholder="Ex: ZIR-LOT-9921-A2 ou PMMA-D98-01"
                className="w-full px-3.5 py-2 text-xs rounded-full border border-slate-800 bg-slate-900 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400 font-mono font-bold uppercase"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelectedItem(null)}
                className="rounded-full text-slate-400 hover:text-white"
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isStarting} size="sm" className="font-bold rounded-full bg-white hover:bg-slate-200 text-slate-950">
                {isStarting ? "Iniciando..." : "Confirmar e Iniciar"}
              </Button>
            </div>
          </form>
        </Dialog>
      </div>
    </AppShell>
  );
}
