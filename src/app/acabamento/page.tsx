"use client";

import React, { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/shell";
import { OdontoPrintService } from "@/services/odontoprint-service";
import { FinishingQueueItem } from "@/types/domain";
import { FILE_TYPE_LABELS } from "@/lib/constants";
import { useAuth } from "@/lib/auth-context";
import {
  Sparkles,
  Check,
  ShieldCheck,
  Layers,
  Search,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";

export default function AcabamentoPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<FinishingQueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<"TODOS" | "PENDENTES" | "MAQUIAGEM" | "APROVADOS">("TODOS");
  const [searchQuery, setSearchQuery] = useState("");

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await OdontoPrintService.getFinishingQueue();
      setItems(data);
    } catch {
      toast.error("Erro ao carregar fila da bancada de acabamento.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleCheck = async (
    item: FinishingQueueItem,
    field: "teeth_inserted" | "occlusion_checked" | "glaze_applied"
  ) => {
    const newVal = !item[field];

    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, [field]: newVal } : i))
    );

    try {
      await OdontoPrintService.updateFinishingCheck(item.id, field, newVal, user?.id || "");

      const labels = {
        teeth_inserted: "Encaixe nos Alvéolos",
        occlusion_checked: "Oclusão Antagonista",
        glaze_applied: "Maquiagem & Glaze",
      };

      toast.success(`${labels[field]}: ${newVal ? "Concluído" : "Desmarcado"}`);
    } catch {
      toast.error("Erro ao atualizar item.");
    }
  };

  const handleApproveCase = async (id: string, patientCode: string) => {
    try {
      await OdontoPrintService.approveFinishingCase(id, "Aprovado no controle de qualidade de bancada", user?.id || "");
      toast.success(`Caso ${patientCode} aprovado no Controle de Qualidade! Pronto para expedição.`);
      loadData();
    } catch {
      toast.error("Erro ao aprovar caso.");
    }
  };

  const filteredItems = items.filter((item) => {
    if (activeFilter === "PENDENTES" && item.status !== "AGUARDANDO_MONTAGEM") return false;
    if (activeFilter === "MAQUIAGEM" && item.status !== "EM_MAQUIAGEM") return false;
    if (activeFilter === "APROVADOS" && item.status !== "APROVADO_CQ") return false;

    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.patient_code.toLowerCase().includes(q) ||
      (item.patient_name && item.patient_name.toLowerCase().includes(q))
    );
  });

  const countPending = items.filter((i) => i.status === "AGUARDANDO_MONTAGEM").length;
  const countInMakeup = items.filter((i) => i.status === "EM_MAQUIAGEM").length;
  const countApproved = items.filter((i) => i.status === "APROVADO_CQ").length;

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Bancada de Acabamento
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              Encaixe de dentes, conferência de oclusão e controle de qualidade.
            </p>
          </div>

          <div className="text-xs text-slate-400 bg-[#0F172A] border border-slate-800 px-3.5 py-1.5 rounded-full w-fit">
            Técnico: <span className="font-semibold text-white">{user?.full_name || "Técnico"}</span>
          </div>
        </div>

        {/* KPI Strip da Bancada */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-4 rounded-2xl sm:rounded-3xl border border-slate-800 bg-[#0F172A] flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-400">Aguardando Montagem</span>
              <div className="text-2xl font-bold text-white mt-0.5">{countPending}</div>
            </div>
            <div className="h-8 w-8 rounded-full bg-slate-900 text-cyan-400 border border-slate-800 flex items-center justify-center font-bold text-xs">
              1
            </div>
          </div>

          <div className="p-4 rounded-2xl sm:rounded-3xl border border-slate-800 bg-[#0F172A] flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-400">Em Maquiagem</span>
              <div className="text-2xl font-bold text-white mt-0.5">{countInMakeup}</div>
            </div>
            <div className="h-8 w-8 rounded-full bg-slate-900 text-cyan-400 border border-slate-800 flex items-center justify-center font-bold text-xs">
              2
            </div>
          </div>

          <div className="p-4 rounded-2xl sm:rounded-3xl border border-slate-800 bg-[#0F172A] flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-400">Aprovados CQ</span>
              <div className="text-2xl font-bold text-emerald-400 mt-0.5">{countApproved}</div>
            </div>
            <div className="h-8 w-8 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/60 flex items-center justify-center font-bold text-xs">
              3
            </div>
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
                placeholder="Buscar por paciente..."
                className="w-full pl-9 pr-4 py-2 text-xs rounded-full border border-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-400 bg-slate-900 text-white placeholder:text-slate-500"
              />
            </div>

            {/* Segmented Controls */}
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
                Todos ({items.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveFilter("PENDENTES")}
                className={`px-3 py-1 text-xs font-semibold rounded-full transition ${
                  activeFilter === "PENDENTES"
                    ? "bg-white text-slate-950 shadow-xs"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Aguardando ({countPending})
              </button>
              <button
                type="button"
                onClick={() => setActiveFilter("MAQUIAGEM")}
                className={`px-3 py-1 text-xs font-semibold rounded-full transition ${
                  activeFilter === "MAQUIAGEM"
                    ? "bg-white text-slate-950 shadow-xs"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Maquiagem ({countInMakeup})
              </button>
              <button
                type="button"
                onClick={() => setActiveFilter("APROVADOS")}
                className={`px-3 py-1 text-xs font-semibold rounded-full transition ${
                  activeFilter === "APROVADOS"
                    ? "bg-white text-slate-950 shadow-xs"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Aprovados ({countApproved})
              </button>
            </div>
          </div>
        </div>

        {/* Lista de Casos na Bancada */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-44 w-full rounded-3xl bg-slate-800" />
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="Nenhum trabalho na bancada"
            description="Os modelos aparecem aqui automaticamente após a pós-cura da impressão 3D ou da fresadora CNC."
          />
        ) : (
          <div className="space-y-4">
            {filteredItems.map((item) => {
              const isApproved = item.status === "APROVADO_CQ";

              return (
                <Card
                  key={item.id}
                  className={`overflow-hidden border transition-all ${
                    isApproved
                      ? "border-emerald-800/40 bg-[#0F172A]"
                      : "border-slate-800 bg-[#0F172A] hover:border-slate-700"
                  }`}
                >
                  {/* Cabeçalho do Card */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-[#0B0F19]/80 border-b border-slate-800 px-4 sm:px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono font-bold text-base text-white tracking-wider">
                          {item.patient_code}
                        </span>
                        {item.patient_name && (
                          <span className="text-xs text-slate-400 font-medium">
                            &bull; {item.patient_name}
                          </span>
                        )}
                      </div>

                      <Badge variant="secondary" className="text-[10px]">
                        {item.origin === "IMPRESSAO" ? "Impressão 3D" : "Fresagem CNC"}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge
                        variant={isApproved ? "default" : "secondary"}
                        className={isApproved ? "bg-emerald-500 text-slate-950 font-bold" : ""}
                      >
                        {isApproved
                          ? "Aprovado no CQ"
                          : item.status === "EM_MAQUIAGEM"
                          ? "Em Maquiagem"
                          : "Aguardando Montagem"}
                      </Badge>
                    </div>
                  </div>

                  {/* Conteúdo do Card */}
                  <CardContent className="p-4 sm:p-5">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-center">
                      <div className="space-y-1.5">
                        <div className="text-xs font-bold text-white flex items-center gap-2">
                          <Layers className="w-4 h-4 text-cyan-400 shrink-0" />
                          <span>{FILE_TYPE_LABELS[item.file_type] || item.file_type}</span>
                        </div>

                        {item.has_sockets && (
                          <div className="p-2 rounded-2xl bg-amber-950/60 border border-amber-800/60 text-[11px] text-amber-300 font-medium">
                            Modelo com alvéolos/furos para assentamento.
                          </div>
                        )}

                        <div className="text-[11px] text-slate-500">
                          Entrada: {formatDate(item.created_at)}
                        </div>
                      </div>

                      {/* Checklist da Bancada Protética */}
                      <div className="lg:col-span-2 space-y-2">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {/* Passo 1: Encaixe nos Furos */}
                          <div
                            onClick={() => handleToggleCheck(item, "teeth_inserted")}
                            className={`p-3 rounded-2xl border cursor-pointer transition-all flex items-start gap-2.5 ${
                              item.teeth_inserted
                                ? "border-emerald-500/80 bg-slate-900"
                                : "border-slate-800 bg-[#0B0F19]/60 hover:border-slate-700"
                            }`}
                          >
                            <div
                              className={`h-4.5 w-4.5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                                item.teeth_inserted
                                  ? "border-emerald-400 bg-emerald-400 text-slate-950"
                                  : "border-slate-700 bg-slate-900"
                              }`}
                            >
                              {item.teeth_inserted && <Check className="w-3 h-3 stroke-[3]" />}
                            </div>
                            <div className="leading-tight">
                              <span className="text-xs font-bold text-white block">
                                1. Encaixe nos Furos
                              </span>
                            </div>
                          </div>

                          {/* Passo 2: Oclusão */}
                          <div
                            onClick={() => handleToggleCheck(item, "occlusion_checked")}
                            className={`p-3 rounded-2xl border cursor-pointer transition-all flex items-start gap-2.5 ${
                              item.occlusion_checked
                                ? "border-emerald-500/80 bg-slate-900"
                                : "border-slate-800 bg-[#0B0F19]/60 hover:border-slate-700"
                            }`}
                          >
                            <div
                              className={`h-4.5 w-4.5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                                item.occlusion_checked
                                  ? "border-emerald-400 bg-emerald-400 text-slate-950"
                                  : "border-slate-700 bg-slate-900"
                              }`}
                            >
                              {item.occlusion_checked && <Check className="w-3 h-3 stroke-[3]" />}
                            </div>
                            <div className="leading-tight">
                              <span className="text-xs font-bold text-white block">
                                2. Oclusão Antagonista
                              </span>
                            </div>
                          </div>

                          {/* Passo 3: Maquiagem & Glaze */}
                          <div
                            onClick={() => handleToggleCheck(item, "glaze_applied")}
                            className={`p-3 rounded-2xl border cursor-pointer transition-all flex items-start gap-2.5 ${
                              item.glaze_applied
                                ? "border-emerald-500/80 bg-slate-900"
                                : "border-slate-800 bg-[#0B0F19]/60 hover:border-slate-700"
                            }`}
                          >
                            <div
                              className={`h-4.5 w-4.5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                                item.glaze_applied
                                  ? "border-emerald-400 bg-emerald-400 text-slate-950"
                                  : "border-slate-700 bg-slate-900"
                              }`}
                            >
                              {item.glaze_applied && <Check className="w-3 h-3 stroke-[3]" />}
                            </div>
                            <div className="leading-tight">
                              <span className="text-xs font-bold text-white block">
                                3. Maquiagem & Glaze
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Botão de Aprovação Final de CQ */}
                        <div className="pt-2 flex justify-end">
                          <Button
                            onClick={() => handleApproveCase(item.id, item.patient_code)}
                            disabled={isApproved || (!item.teeth_inserted && !item.glaze_applied)}
                            variant={isApproved ? "outline" : "default"}
                            size="sm"
                            className="gap-2 font-bold w-full sm:w-auto rounded-full bg-cyan-500 hover:bg-cyan-400 text-slate-950"
                          >
                            <ShieldCheck className="w-4 h-4" />
                            {isApproved ? "Caso Aprovado no CQ" : "Aprovar CQ & Liberar"}
                          </Button>
                        </div>
                      </div>
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
