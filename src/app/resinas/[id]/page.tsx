"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/shell";
import { OdontoPrintService } from "@/services/odontoprint-service";
import { RESIN_STATUS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import {
  FlaskConical,
  Compass,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  XCircle,
  Printer,
  Sparkles,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "sonner";

export default function ResinaDetalhesPage() {
  const params = useParams();
  const router = useRouter();
  const batchId = params.id as string;

  const [data, setData] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await OdontoPrintService.deleteResinBatch(batchId);
      toast.success("Lote de resina apagado com sucesso!");
      router.push("/resinas");
    } catch {
      toast.error("Erro ao apagar lote de resina.");
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const res = await OdontoPrintService.getResinBatchById(batchId);
        setData(res);
      } catch {
        toast.error("Erro ao carregar detalhes do lote de resina.");
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [batchId]);

  if (isLoading) {
    return (
      <AppShell>
        <div className="max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </AppShell>
    );
  }

  if (!data?.batch) {
    return (
      <AppShell>
        <div className="text-center py-12">
          <h2 className="text-lg font-bold text-slate-800">Lote de Resina Não Encontrado</h2>
          <Button onClick={() => router.push("/resinas")} className="mt-4">
            Voltar
          </Button>
        </div>
      </AppShell>
    );
  }

  const b = data.batch;
  const statusCfg =
    (RESIN_STATUS as Record<string, { label: string; color: string }>)[b.status] ||
    RESIN_STATUS.AGUARDANDO_CALIBRACAO;

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/resinas")}
              className="text-slate-500 hover:text-slate-900 gap-1 pl-0"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                  {b.brand}
                </h1>
                <Badge className={statusCfg.color}>{statusCfg.label}</Badge>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {b.resin_type} &bull; Lote: <span className="font-mono font-bold">{b.lot}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteDialogOpen(true)}
              className="text-rose-600 border-rose-200 hover:bg-rose-50 gap-1.5 font-bold w-full sm:w-auto justify-center"
            >
              <Trash2 className="w-4 h-4" />
              Excluir Lote
            </Button>

            <Link href={`/calibracoes/nova?batch=${b.id}`} className="w-full sm:w-auto">
              <Button variant="default" size="sm" className="gap-1.5 font-bold w-full sm:w-auto justify-center">
                <Compass className="w-4 h-4" />
                Nova Calibração com este Lote
              </Button>
            </Link>
          </div>
        </div>

        {/* Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-semibold text-slate-400">Volume Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-bold text-lg text-slate-900">
                {b.volume} {b.volume_unit}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-semibold text-slate-400">Data de Recebimento</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-bold text-lg text-slate-900">
                {formatDate(b.received_at)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-semibold text-slate-400">Calibrações Vinculadas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-bold text-lg text-slate-900">
                {data.calibrations.length} testes
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Calibrations History */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Compass className="w-4 h-4 text-brand-500" />
              Testes de Calibração Realizados com este Lote ({data.calibrations.length})
            </CardTitle>
            <CardDescription>
              Uma resina é calibrada especificamente para cada impressora 3D do laboratório.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.calibrations.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">
                Nenhum teste de calibração registrado ainda para este lote.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {data.calibrations.map((cal: any) => (
                  <div
                    key={cal.id}
                    className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant={cal.status === "APROVADA" ? "success" : "destructive"}>
                          {cal.status === "APROVADA" ? "Calibração Aprovada" : "Reprovada"}
                        </Badge>
                        <span className="font-bold text-slate-800">
                          {cal.printer_name} (Tentativa #{cal.calibration_number})
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-3 text-[11px] text-slate-500 mt-1.5">
                        <span>Hexágono Medido: <strong className="text-slate-900">{cal.hexagon_size_mm} mm</strong></span>
                        <span>&bull;</span>
                        <span>Camada: {cal.layer_height} mm</span>
                        <span>&bull;</span>
                        <span>Exposição: {cal.exposure_time} s</span>
                        <span>&bull;</span>
                        <span>Lavagem: {cal.wash_time} min</span>
                        <span>&bull;</span>
                        <span>Cura: {cal.cure_time} min</span>
                      </div>
                    </div>

                    <div className="text-right text-[11px] text-slate-400">
                      {formatDate(cal.created_at)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Modal: Confirmar Exclusão de Lote de Resina */}
        <Dialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          title="Excluir Lote de Resina"
          description={`Tem certeza que deseja apagar o lote ${b.lot} (${b.brand})?`}
        >
          <div className="space-y-4 pt-2">
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
              <div>
                <span className="font-semibold block mb-0.5">Atenção: Ação Irreversível</span>
                O lote <strong>{b.lot}</strong> ({b.brand} - {b.resin_type}, Volume: {b.volume} {b.volume_unit}) será removido permanentemente.
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteDialogOpen(false)}
                disabled={isDeleting}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
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
