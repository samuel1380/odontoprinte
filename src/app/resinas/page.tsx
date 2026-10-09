"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/shell";
import { OdontoPrintService } from "@/services/odontoprint-service";
import { ResinBatch } from "@/types/database.types";
import { RESIN_STATUS } from "@/lib/constants";
import {
  FlaskConical,
  Plus,
  Compass,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog } from "@/components/ui/dialog";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";

export default function ResinasPage() {
  const [batches, setBatches] = useState<ResinBatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Delete State
  const [batchToDelete, setBatchToDelete] = useState<ResinBatch | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadBatches = async () => {
    setIsLoading(true);
    try {
      const data = await OdontoPrintService.getResinBatches();
      setBatches(data);
    } catch {
      toast.error("Erro ao carregar lotes de resina.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBatches();
  }, []);

  const handleDeleteBatch = async () => {
    if (!batchToDelete) return;

    setIsDeleting(true);
    try {
      const res = await OdontoPrintService.deleteResinBatch(batchToDelete.id);
      if (res.success) {
        toast.success(`Lote de resina "${batchToDelete.lot}" removido com sucesso!`);
        setBatchToDelete(null);
        await loadBatches();
      } else {
        toast.error(res.error || "Não foi possível excluir o lote de resina.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro inesperado ao excluir resina.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Lotes de Resina
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              Recebimento de materiais e status de calibração milimétrica.
            </p>
          </div>

          <Link href="/resinas/recebimento" className="w-full sm:w-auto">
            <Button variant="default" size="sm" className="gap-1.5 font-semibold w-full sm:w-auto justify-center rounded-full bg-white hover:bg-slate-200 text-slate-950">
              <Plus className="w-4 h-4" />
              Cadastrar Resina
            </Button>
          </Link>
        </div>

        {/* Resin Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-52 w-full rounded-3xl bg-slate-800" />
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
                  className="flex flex-col justify-between overflow-hidden border border-slate-800 bg-[#0F172A] transition hover:border-slate-700"
                >
                  <CardHeader className="p-4 sm:p-5 pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="text-base text-white font-bold truncate">{batch.brand}</CardTitle>
                        <p className="text-xs text-slate-400 mt-0.5 truncate">{batch.resin_type}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant={isCalibrated ? "default" : "secondary"}>{statusCfg.label}</Badge>
                        <button
                          type="button"
                          onClick={() => setBatchToDelete(batch)}
                          className="p-1.5 rounded-full text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 transition"
                          title="Excluir lote de resina"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="p-4 sm:p-5 pt-0 space-y-3 text-xs">
                    <div className="divide-y divide-slate-800 rounded-2xl bg-slate-900 p-3.5 border border-slate-800 space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Lote:</span>
                        <span className="font-mono font-bold text-white">{batch.lot}</span>
                      </div>
                      <div className="flex justify-between items-center pt-1.5">
                        <span className="text-slate-400">Volume:</span>
                        <span className="font-medium text-white">
                          {batch.volume} {batch.volume_unit}
                        </span>
                      </div>
                      <div className="flex justify-between items-center pt-1.5">
                        <span className="text-slate-400">Recebimento:</span>
                        <span className="font-medium text-white">
                          {formatDate(batch.received_at)}
                        </span>
                      </div>
                    </div>
                  </CardContent>

                  <div className="p-4 sm:p-5 pt-0 flex gap-2">
                    {!isCalibrated && (
                      <Link href={`/calibracoes/nova?batch=${batch.id}`} className="flex-1">
                        <Button variant="default" size="sm" className="w-full text-xs font-semibold gap-1 rounded-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold">
                          <Compass className="w-3.5 h-3.5" />
                          Calibrar
                        </Button>
                      </Link>
                    )}

                    <Link href={`/resinas/${batch.id}`} className={isCalibrated ? "w-full" : ""}>
                      <Button variant="outline" size="sm" className="w-full text-xs rounded-full border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 hover:text-white">
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
          description={`Tem certeza que deseja apagar o lote "${batchToDelete?.lot}" da resina "${batchToDelete?.brand}"?`}
        >
          <div className="space-y-4 pt-2">
            <div className="p-3 bg-rose-950/60 border border-rose-800/60 rounded-2xl text-xs text-rose-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              <div>
                <span className="font-semibold block mb-0.5">Atenção: Ação Irreversível</span>
                O lote <strong>{batchToDelete?.lot}</strong> ({batchToDelete?.brand} - {batchToDelete?.resin_type}) será permanentemente removido junto com seus testes e históricos de calibração.
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBatchToDelete(null)}
                disabled={isDeleting}
                className="rounded-full border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteBatch}
                disabled={isDeleting}
                className="gap-1.5 font-bold rounded-full bg-rose-600 hover:bg-rose-700"
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
