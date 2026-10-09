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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200/80 pb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Lotes de Resina Fotopolimerizável
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Controle de insumos, rastreabilidade de validade e calibração por equipamento.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1 sm:pt-0">
            <Link href="/calibracoes/nova">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs font-medium h-9">
                <Compass className="w-3.5 h-3.5 text-brand-600" />
                Nova Calibração
              </Button>
            </Link>

            <Link href="/resinas/recebimento">
              <Button variant="default" size="sm" className="gap-1.5 text-xs font-semibold h-9">
                <Plus className="w-4 h-4" />
                Receber Resina
              </Button>
            </Link>
          </div>
        </div>

        {/* Batches Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-48 w-full rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {batches.map((batch) => {
              const statusCfg = RESIN_STATUS[batch.status] || RESIN_STATUS.AGUARDANDO_CALIBRACAO;
              const isCalibrated = batch.status === "CALIBRADA";

              return (
                <Card
                  key={batch.id}
                  className="flex flex-col justify-between overflow-hidden border border-slate-200/90 bg-white rounded-xl sm:rounded-2xl transition-all hover:border-slate-300 hover:shadow-xs"
                >
                  <CardHeader className="p-4 sm:p-5 pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="text-base text-slate-900 font-bold truncate">{batch.brand}</CardTitle>
                        <CardDescription className="text-xs text-slate-500 mt-0.5 truncate">{batch.resin_type}</CardDescription>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge className={statusCfg.color}>{statusCfg.label}</Badge>
                        <button
                          type="button"
                          onClick={() => setBatchToDelete(batch)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                          title="Excluir lote de resina"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="p-4 sm:p-5 pt-0 space-y-3 text-xs">
                    <div className="divide-y divide-slate-100 rounded-xl bg-slate-50/70 p-3 border border-slate-100 space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Lote:</span>
                        <span className="font-mono font-bold text-slate-800">{batch.lot}</span>
                      </div>
                      <div className="flex justify-between items-center pt-1.5">
                        <span className="text-slate-400">Volume:</span>
                        <span className="font-medium text-slate-700">
                          {batch.volume} {batch.volume_unit}
                        </span>
                      </div>
                      <div className="flex justify-between items-center pt-1.5">
                        <span className="text-slate-400">Recebimento:</span>
                        <span className="font-medium text-slate-700">
                          {formatDate(batch.received_at)}
                        </span>
                      </div>
                    </div>
                  </CardContent>

                  <div className="p-4 sm:p-5 pt-0 flex gap-2">
                    {!isCalibrated && (
                      <Link href={`/calibracoes/nova?batch=${batch.id}`} className="flex-1">
                        <Button variant="default" size="sm" className="w-full text-xs font-semibold gap-1 h-8.5">
                          <Compass className="w-3.5 h-3.5" />
                          Calibrar
                        </Button>
                      </Link>
                    )}

                    <Link href={`/resinas/${batch.id}`} className={isCalibrated ? "w-full" : ""}>
                      <Button variant="outline" size="sm" className="w-full text-xs h-8.5 text-slate-700">
                        Detalhes
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
