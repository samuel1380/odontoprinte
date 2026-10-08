"use client";

import React, { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/shell";
import { OdontoPrintService } from "@/services/odontoprint-service";
import { MillingItem } from "@/types/domain";
import { FILE_TYPE_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import {
  Cog,
  Play,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  Search,
  Check,
  Disc,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "sonner";

export default function FresagemPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<MillingItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Modal Iniciar Usinagem
  const [selectedItem, setSelectedItem] = useState<MillingItem | null>(null);
  const [blockLot, setBlockLot] = useState("");
  const [isStarting, setIsStarting] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await OdontoPrintService.getMillingItems();
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
      toast.error("Informe o lote do bloco/disco de zircônia ou PMMA.");
      return;
    }

    setIsStarting(true);
    try {
      await OdontoPrintService.startMilling(selectedItem.id, blockLot.trim().toUpperCase(), user?.id || "");
      toast.success(`Usinagem iniciada para ${selectedItem.patient_code} (Bloco: ${blockLot.toUpperCase()})`);
      setSelectedItem(null);
      setBlockLot("");
      loadData();
    } catch {
      toast.error("Erro ao iniciar usinagem.");
    } finally {
      setIsStarting(false);
    }
  };

  const handleFinalizeMilling = async (id: string, patientCode: string) => {
    try {
      await OdontoPrintService.finalizeMilling(id, true, undefined, user?.id || "");
      toast.success(`Fresagem de ${patientCode} concluída com sucesso! Peça enviada para a Bancada de Acabamento & Maquiagem.`);
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
      (item.patient_name && item.patient_name.toLowerCase().includes(q))
    );
  });

  const countPending = items.filter((i) => i.status === "AGUARDANDO_FRESAGEM").length;
  const countMilling = items.filter((i) => i.status === "EM_USINAGEM").length;
  const countFinished = items.filter((i) => i.status === "FRESADO_CONCLUIDO").length;

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200/80 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-purple-700 bg-purple-50 border-purple-200 text-xs">
                Setor de Fresagem CNC
              </Badge>
              <span className="text-xs text-slate-400">&bull;</span>
              <span className="text-xs text-slate-500">Usinagem de Alta Precisão</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight mt-1 flex items-center gap-2">
              <Cog className="w-5 h-5 text-purple-600" />
              Fila de Fresagem CNC
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Peças desenhadas pelo Cadista em Zircônia, PMMA ou cera para usinagem nas fresadoras.
            </p>
          </div>

          <div className="text-xs text-slate-500">
            Operador: <span className="font-semibold text-slate-800">{user?.full_name || "Operador"}</span>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-xl border border-purple-200 bg-purple-50/50 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-purple-800">Aguardando Fresagem</span>
              <div className="text-2xl font-black text-purple-900 mt-0.5">{countPending}</div>
              <span className="text-[11px] text-purple-600">Projetos CAD prontos</span>
            </div>
            <Disc className="w-8 h-8 text-purple-400" />
          </div>

          <div className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/50 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-blue-800">Em Usinagem CNC</span>
              <div className="text-2xl font-black text-blue-900 mt-0.5">{countMilling}</div>
              <span className="text-[11px] text-blue-600">Fresadoras em operação</span>
            </div>
            <Cog className="w-8 h-8 text-blue-400 animate-spin" />
          </div>

          <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/50 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-emerald-800">Fresados & Despachados</span>
              <div className="text-2xl font-black text-emerald-900 mt-0.5">{countFinished}</div>
              <span className="text-[11px] text-emerald-600">Enviados para Maquiagem</span>
            </div>
            <Sparkles className="w-8 h-8 text-emerald-400" />
          </div>
        </div>

        {/* Search */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filtrar por paciente..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-purple-500 bg-slate-50/50"
            />
          </div>

          <div className="text-xs text-slate-500 font-medium hidden sm:block">
            {items.length} itens na esteira de fresagem
          </div>
        </div>

        {/* Lista de Itens */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-32 w-full rounded-2xl" />
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <EmptyState
            icon={Cog}
            title="Nenhum item na fila de fresagem"
            description="Quando o Cadista criar trabalhos direcionados para fresagem ou coroas de zircônia/PMMA, eles aparecerão aqui para usinagem."
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
                  className={`overflow-hidden border-2 transition-all ${
                    isDone
                      ? "border-emerald-200 bg-emerald-50/10"
                      : isMilling
                      ? "border-blue-300 bg-blue-50/20"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono font-black text-base text-slate-900 tracking-wider">
                          {item.patient_code}
                        </span>
                        {item.patient_name && (
                          <span className="text-xs text-slate-500 font-medium">
                            &bull; {item.patient_name}
                          </span>
                        )}
                        <Badge
                          variant="secondary"
                          className={
                            item.material === "ZIRCONIA"
                              ? "bg-purple-50 text-purple-700 border-purple-200 text-[10px]"
                              : "bg-blue-50 text-blue-700 border-blue-200 text-[10px]"
                          }
                        >
                          {item.material}
                        </Badge>
                      </div>

                      <div className="text-xs font-semibold text-slate-700">
                        {FILE_TYPE_LABELS[item.file_type] || item.file_type}
                      </div>

                      {item.block_lot && (
                        <div className="text-[11px] text-slate-500 font-mono">
                          Lote do Disco: <span className="font-bold text-slate-800">{item.block_lot}</span>
                        </div>
                      )}

                      <div className="text-[10px] text-slate-400">
                        Criado em: {formatDate(item.created_at)}
                      </div>
                    </div>

                    {/* Ações */}
                    <div className="flex items-center gap-2">
                      {isWaiting && (
                        <Button
                          onClick={() => setSelectedItem(item)}
                          size="sm"
                          className="gap-1.5 font-bold w-full sm:w-auto"
                        >
                          <Play className="w-3.5 h-3.5" />
                          Iniciar Usinagem
                        </Button>
                      )}

                      {isMilling && (
                        <Button
                          onClick={() => handleFinalizeMilling(item.id, item.patient_code)}
                          variant="lime"
                          size="sm"
                          className="gap-1.5 font-bold w-full sm:w-auto"
                        >
                          <Check className="w-4 h-4 stroke-[3]" />
                          Concluir Fresagem & Enviar para Acabamento
                        </Button>
                      )}

                      {isDone && (
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 gap-1 py-1 px-3">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Enviado para Maquiagem
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Lote do Bloco / Disco de Zircônia ou PMMA *
              </label>
              <input
                type="text"
                required
                value={blockLot}
                onChange={(e) => setBlockLot(e.target.value)}
                placeholder="Ex: ZIR-LOT-9921-A2 ou PMMA-D98-01"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-purple-500 font-mono font-bold uppercase"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Garante rastreabilidade total do lote cerâmico até a entrega ao dentista.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelectedItem(null)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isStarting} size="sm" className="font-bold">
                {isStarting ? "Iniciando..." : "Confirmar e Iniciar"}
              </Button>
            </div>
          </form>
        </Dialog>
      </div>
    </AppShell>
  );
}
