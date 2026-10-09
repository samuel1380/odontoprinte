"use client";

import React, { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/shell";
import { OdontoPrintService } from "@/services/odontoprint-service";
import { FinishingCaseItem } from "@/types/domain";
import { FILE_TYPE_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  Search,
  Filter,
  CheckSquare,
  Square,
  Flame,
  Check,
  RotateCcw,
  Scissors,
  Printer,
  Cog,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";

export default function AcabamentoPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<FinishingCaseItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"TODOS" | "PENDENTES" | "MAQUIAGEM" | "APROVADOS">("TODOS");

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await OdontoPrintService.getFinishingItems();
      setItems(data);
    } catch {
      toast.error("Erro ao carregar bancada de acabamento.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleCheck = async (
    item: FinishingCaseItem,
    field: "teeth_inserted" | "occlusion_checked" | "glaze_applied"
  ) => {
    const currentVal = item[field] || false;
    const newVal = !currentVal;

    try {
      await OdontoPrintService.updateFinishingChecklist({
        id: item.id,
        [field]: newVal,
        technician_name: user?.full_name || "Técnico",
      });

      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? {
                ...i,
                [field]: newVal,
                status: i.status === "APROVADO_CQ" ? "APROVADO_CQ" : "EM_MAQUIAGEM",
                assigned_technician: user?.full_name || "Técnico",
              }
            : i
        )
      );

      const labels = {
        teeth_inserted: "Encaixe dos dentes nos furos do modelo",
        occlusion_checked: "Ajuste de oclusão com o antagonista",
        glaze_applied: "Maquiagem estética e aplicação de glaze",
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

  // Filtragem
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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200/80 pb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              Bancada de Acabamento & Maquiagem
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Encaixe dos dentes nos furos dos modelos impressos, verificação de oclusão e aplicação de glaze.
            </p>
          </div>

          <div className="text-xs text-slate-500">
            Técnico: <span className="font-semibold text-slate-800">{user?.full_name || "Técnico"}</span>
          </div>
        </div>

        {/* KPI Strip da Bancada */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-xl border border-slate-200/90 bg-white shadow-2xs flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-600">Aguardando Montagem</span>
              <div className="text-2xl font-bold text-slate-900 mt-0.5">{countPending}</div>
              <span className="text-[11px] text-slate-400">Modelos com furos e dentes</span>
            </div>
            <div className="h-9 w-9 rounded-lg bg-amber-50 text-amber-700 border border-amber-200/80 flex items-center justify-center font-bold text-xs">
              1
            </div>
          </div>

          <div className="p-3.5 rounded-xl border border-slate-200/90 bg-white shadow-2xs flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-600">Em Maquiagem & Glaze</span>
              <div className="text-2xl font-bold text-slate-900 mt-0.5">{countInMakeup}</div>
              <span className="text-[11px] text-slate-400">Caracterização estética</span>
            </div>
            <div className="h-9 w-9 rounded-lg bg-blue-50 text-blue-700 border border-blue-200/80 flex items-center justify-center font-bold text-xs">
              2
            </div>
          </div>

          <div className="p-3.5 rounded-xl border border-slate-200/90 bg-white shadow-2xs flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-600">Aprovados no CQ</span>
              <div className="text-2xl font-bold text-slate-900 mt-0.5">{countApproved}</div>
              <span className="text-[11px] text-slate-400">Prontos para expedição</span>
            </div>
            <div className="h-9 w-9 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200/80 flex items-center justify-center font-bold text-xs">
              3
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full lg:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filtrar por paciente..."
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
                Todos ({items.length})
              </Button>
              <Button
                size="sm"
                variant={activeFilter === "PENDENTES" ? "secondary" : "ghost"}
                onClick={() => setActiveFilter("PENDENTES")}
                className="text-xs h-8 flex-1 sm:flex-initial"
              >
                Aguardando ({countPending})
              </Button>
              <Button
                size="sm"
                variant={activeFilter === "MAQUIAGEM" ? "secondary" : "ghost"}
                onClick={() => setActiveFilter("MAQUIAGEM")}
                className="text-xs h-8 flex-1 sm:flex-initial"
              >
                Maquiagem ({countInMakeup})
              </Button>
              <Button
                size="sm"
                variant={activeFilter === "APROVADOS" ? "secondary" : "ghost"}
                onClick={() => setActiveFilter("APROVADOS")}
                className="text-xs h-8 flex-1 sm:flex-initial"
              >
                Aprovados CQ ({countApproved})
              </Button>
            </div>
          </div>

          <div className="text-xs text-slate-500 font-medium sm:text-right">
            Trabalhos recebidos da <span className="font-bold text-slate-700">Impressão 3D e Fresagem</span>
          </div>
        </div>

        {/* Lista de Casos na Bancada */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-44 w-full rounded-2xl" />
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="Nenhum trabalho na bancada de acabamento"
            description="Os modelos aparecem aqui automaticamente assim que saem da impressão 3D (pós-cura) ou da fresadora CNC para montagem dos dentes e maquiagem."
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
                      ? "border-emerald-300 bg-emerald-50/15"
                      : "border-slate-200/90 bg-white hover:border-slate-300 shadow-2xs"
                  }`}
                >
                  {/* Cabeçalho do Card */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-slate-50/80 border-b border-slate-100 px-4 sm:px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono font-bold text-base text-slate-900 tracking-wider">
                          {item.patient_code}
                        </span>
                        {item.patient_name && (
                          <span className="text-xs text-slate-500 font-medium">
                            &bull; {item.patient_name}
                          </span>
                        )}
                      </div>

                      <Badge
                        variant="secondary"
                        className={
                          item.origin === "IMPRESSAO"
                            ? "bg-blue-50 text-blue-700 border-blue-200 text-[10px]"
                            : "bg-purple-50 text-purple-700 border-purple-200 text-[10px]"
                        }
                      >
                        {item.origin === "IMPRESSAO" ? "Impressão 3D (Resina)" : "Fresagem CNC (Zircônia/PMMA)"}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge
                        className={
                          isApproved
                            ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                            : item.status === "EM_MAQUIAGEM"
                            ? "bg-blue-100 text-blue-800 border-blue-300"
                            : "bg-amber-100 text-amber-800 border-amber-300"
                        }
                      >
                        {isApproved
                          ? "Aprovado no CQ"
                          : item.status === "EM_MAQUIAGEM"
                          ? "Em Maquiagem & Glaze"
                          : "Aguardando Montagem"}
                      </Badge>
                    </div>
                  </div>

                  {/* Conteúdo do Card */}
                  <CardContent className="p-4 sm:p-5">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-center">
                      {/* Descrição do Modelo / Peça */}
                      <div className="space-y-1.5">
                        <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                          <Layers className="w-4 h-4 text-brand-500 shrink-0" />
                          <span>{FILE_TYPE_LABELS[item.file_type] || item.file_type}</span>
                        </div>

                        {item.has_sockets && (
                          <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800 font-medium">
                            &bull; Modelo com alvéolos/furos para assentamento de dentes/troqueis.
                          </div>
                        )}

                        <div className="text-[11px] text-slate-400">
                          Entrada na bancada: {formatDate(item.created_at)}
                        </div>
                      </div>

                      {/* Checklist da Bancada Protética */}
                      <div className="lg:col-span-2 space-y-2">
                        <div className="text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                          <span>Checklist de Montagem & Acabamento:</span>
                          {item.assigned_technician && (
                            <span className="text-[10px] text-slate-400">
                              Técnico: {item.assigned_technician}
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {/* Passo 1: Encaixe nos Furos */}
                          <div
                            onClick={() => handleToggleCheck(item, "teeth_inserted")}
                            className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-start gap-2.5 ${
                              item.teeth_inserted
                                ? "border-emerald-500 bg-emerald-50/70 shadow-2xs"
                                : "border-slate-200 bg-white hover:border-slate-300"
                            }`}
                          >
                            <div
                              className={`h-5 w-5 rounded border flex items-center justify-center shrink-0 mt-0.5 ${
                                item.teeth_inserted
                                  ? "border-emerald-600 bg-emerald-500 text-white"
                                  : "border-slate-300 bg-white"
                              }`}
                            >
                              {item.teeth_inserted && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                            </div>
                            <div className="leading-tight">
                              <span className="text-xs font-bold text-slate-900 block">
                                1. Encaixe nos Furos
                              </span>
                              <span className="text-[10px] text-slate-500">
                                Dentes assentados nos alvéolos do modelo
                              </span>
                            </div>
                          </div>

                          {/* Passo 2: Oclusão */}
                          <div
                            onClick={() => handleToggleCheck(item, "occlusion_checked")}
                            className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-start gap-2.5 ${
                              item.occlusion_checked
                                ? "border-emerald-500 bg-emerald-50/70 shadow-2xs"
                                : "border-slate-200 bg-white hover:border-slate-300"
                            }`}
                          >
                            <div
                              className={`h-5 w-5 rounded border flex items-center justify-center shrink-0 mt-0.5 ${
                                item.occlusion_checked
                                  ? "border-emerald-600 bg-emerald-500 text-white"
                                  : "border-slate-300 bg-white"
                              }`}
                            >
                              {item.occlusion_checked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                            </div>
                            <div className="leading-tight">
                              <span className="text-xs font-bold text-slate-900 block">
                                2. Oclusão Antagonista
                              </span>
                              <span className="text-[10px] text-slate-500">
                                Contatos e alinhamento conferidos
                              </span>
                            </div>
                          </div>

                          {/* Passo 3: Maquiagem & Glaze */}
                          <div
                            onClick={() => handleToggleCheck(item, "glaze_applied")}
                            className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-start gap-2.5 ${
                              item.glaze_applied
                                ? "border-emerald-500 bg-emerald-50/70 shadow-2xs"
                                : "border-slate-200 bg-white hover:border-slate-300"
                            }`}
                          >
                            <div
                              className={`h-5 w-5 rounded border flex items-center justify-center shrink-0 mt-0.5 ${
                                item.glaze_applied
                                  ? "border-emerald-600 bg-emerald-500 text-white"
                                  : "border-slate-300 bg-white"
                              }`}
                            >
                              {item.glaze_applied && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                            </div>
                            <div className="leading-tight">
                              <span className="text-xs font-bold text-slate-900 block">
                                3. Maquiagem & Glaze
                              </span>
                              <span className="text-[10px] text-slate-500">
                                Caracterização estética e queima
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Botão de Aprovação Final de CQ */}
                        <div className="pt-2 flex justify-end">
                          <Button
                            onClick={() => handleApproveCase(item.id, item.patient_code)}
                            disabled={isApproved || (!item.teeth_inserted && !item.glaze_applied)}
                            variant={isApproved ? "secondary" : "lime"}
                            size="sm"
                            className="gap-2 font-bold w-full sm:w-auto"
                          >
                            <ShieldCheck className="w-4 h-4" />
                            {isApproved ? "Caso Aprovado no CQ" : "Aprovar Controle de Qualidade & Liberar"}
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
