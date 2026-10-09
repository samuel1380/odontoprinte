"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/shell";
import { OdontoPrintService } from "@/services/odontoprint-service";
import { ResinBatch } from "@/types/database.types";
import { RESIN_STATUS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import {
  FlaskConical,
  Plus,
  Compass,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Layers,
  Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "sonner";

export default function ResinasPage() {
  const [batches, setBatches] = useState<ResinBatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [batchToDelete, setBatchToDelete] = useState<ResinBatch | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const data = await OdontoPrintService.getResinBatches();
        setBatches(data);
      } catch {
        toast.error("Erro ao listar lotes de resina.");
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  const handleDeleteBatch = async () => {
    if (!batchToDelete) return;
    setIsDeleting(true);
    try {
      await OdontoPrintService.deleteResinBatch(batchToDelete.id);
      toast.success(`Lote de resina "${batchToDelete.lot}" apagado com sucesso.`);
      setBatchToDelete(null);
      const data = await OdontoPrintService.getResinBatches();
      setBatches(data);
    } catch {
      toast.error("Erro ao apagar lote de resina.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-brand-700 bg-brand-50 border-brand-200">
                Operador de Resinas
              </Badge>
              <span className="text-xs text-slate-400">&bull;</span>
              <span className="text-xs text-slate-500">Controle de Insumos & Validade</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1 flex items-center gap-2">
              Lotes de Resina Fotopolimerizável
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Todo novo lote recebido entra como &quot;Aguardando Calibração&quot; e requer teste aprovado antes de ir para a impressora.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Link href="/calibracoes/nova">
              <Button variant="outline" size="sm" className="gap-1.5 border-brand-200 text-brand-700">
                <Compass className="w-4 h-4" />
                Nova Calibração
              </Button>
            </Link>

            <Link href="/resinas/recebimento">
              <Button variant="default" size="sm" className="gap-1.5 font-bold">
                <Plus className="w-4 h-4" />
                Recebimento de Resina
              </Button>
            </Link>
          </div>
        </div>

        {/* Batches Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-48 w-full rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {batches.map((batch) => {
              const statusCfg = RESIN_STATUS[batch.status] || RESIN_STATUS.AGUARDANDO_CALIBRACAO;
              const isCalibrated = batch.status === "CALIBRADA";

              return (
                <Card
                  key={batch.id}
                  className={`flex flex-col justify-between overflow-hidden border-2 transition-all hover:shadow-card ${
                    isCalibrated
                      ? "border-emerald-200 bg-white"
                      : batch.status === "AGUARDANDO_CALIBRACAO"
                      ? "border-amber-200 bg-amber-50/20"
                      : "border-rose-200 bg-rose-50/20"
                  }`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base text-slate-900">{batch.brand}</CardTitle>
                        <CardDescription>{batch.resin_type}</CardDescription>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge className={statusCfg.color}>{statusCfg.label}</Badge>
                        <button
                          type="button"
                          onClick={() => setBatchToDelete(batch)}
                          className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                          title="Excluir lote de resina"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3 text-xs">
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Lote:</span>
                        <span className="font-mono font-bold text-slate-800">{batch.lot}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Volume Registrado:</span>
                        <span className="font-semibold text-slate-700">
                          {batch.volume} {batch.volume_unit}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Recebida em:</span>
                        <span className="font-medium text-slate-700">
                          {formatDate(batch.received_at)}
                        </span>
                      </div>
                    </div>
                  </CardContent>

                  <div className="p-4 pt-0 flex gap-2">
                    {!isCalibrated && (
                      <Link href={`/calibracoes/nova?batch=${batch.id}`} className="flex-1">
                        <Button variant="default" size="sm" className="w-full text-xs font-bold gap-1">
                          <Compass className="w-3.5 h-3.5" />
                          Calibrar Resina
                        </Button>
                      </Link>
                    )}

                    <Link href={`/resinas/${batch.id}`} className={isCalibrated ? "w-full" : ""}>
                      <Button variant="outline" size="sm" className="w-full text-xs">
                        Ver Detalhes
                      </Button>
                    </Link>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Modal: Confirmar Exclusão de Lote de Resina */}
        <Dialog
          open={Boolean(batchToDelete)}
          onOpenChange={(open) => {
            if (!open) setBatchToDelete(null);
          }}
          title="Excluir Lote de Resina"
          description={`Tem certeza que deseja apagar o lote ${batchToDelete?.lot} (${batchToDelete?.brand})?`}
        >
          <div className="space-y-4 pt-2">
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
              <div>
                <span className="font-semibold block mb-0.5">Atenção: Ação Irreversível</span>
                O lote <strong>{batchToDelete?.lot}</strong> ({batchToDelete?.brand} - {batchToDelete?.resin_type}, Volume: {batchToDelete?.volume} {batchToDelete?.volume_unit}) será removido do inventário.
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBatchToDelete(null)}
                disabled={isDeleting}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteBatch}
                disabled={isDeleting}
                className="gap-1.5 font-bold"
              >
                <Trash2 className="w-4 h-4" />
                {isDeleting ? "Excluindo..." : "Confirmar Exclusão"}
              </Button>
            </div>
          </div>
        </Dialog>
      </div>
    </AppShell>
  );
}
