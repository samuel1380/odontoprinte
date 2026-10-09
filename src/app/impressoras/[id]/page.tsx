"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/shell";
import { OdontoPrintService } from "@/services/odontoprint-service";
import { PRINTER_STATUS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import {
  Printer,
  Wrench,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  Calendar,
  Layers,
  Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "sonner";

export default function ImpressoraDetalhesPage() {
  const params = useParams();
  const router = useRouter();
  const printerId = params.id as string;

  const [data, setData] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await OdontoPrintService.deletePrinter(printerId);
      toast.success("Impressora apagada com sucesso!");
      router.push("/impressoras");
    } catch {
      toast.error("Erro ao apagar impressora.");
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const res = await OdontoPrintService.getPrinterById(printerId);
        setData(res);
      } catch {
        toast.error("Erro ao carregar histórico da impressora.");
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [printerId]);

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

  if (!data?.printer) {
    return (
      <AppShell>
        <div className="text-center py-12">
          <h2 className="text-lg font-bold text-slate-800">Impressora Não Encontrada</h2>
          <Button onClick={() => router.push("/impressoras")} className="mt-4">
            Voltar
          </Button>
        </div>
      </AppShell>
    );
  }

  const p = data.printer;
  const statusCfg =
    (PRINTER_STATUS as Record<string, { label: string; color: string }>)[p.calculated_status] ||
    PRINTER_STATUS.INATIVA;

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/impressoras")}
              className="text-slate-500 hover:text-slate-900 gap-1 pl-0"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                  {p.name}
                </h1>
                <Badge className={statusCfg.color}>{statusCfg.label}</Badge>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {p.brand} &bull; {p.model} &bull; Série: <span className="font-mono">{p.serial_number}</span>
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
              Excluir Impressora
            </Button>

            <Link href={`/impressoras/${p.id}/manutencao`} className="w-full sm:w-auto">
              <Button variant="default" size="sm" className="gap-1.5 font-bold w-full sm:w-auto justify-center">
                <Wrench className="w-4 h-4" />
                Realizar Nova Manutenção
              </Button>
            </Link>
          </div>
        </div>

        {/* Maintenance History */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="w-4 h-4 text-brand-500" />
              Histórico Completo de Manutenções Preventivas ({data.maintenances.length})
            </CardTitle>
            <CardDescription>
              Registro auditável de cada inspeção realizada nesta impressora
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.maintenances.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">
                Nenhuma manutenção registrada até o momento.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {data.maintenances.map((m: any) => (
                  <div key={m.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant={m.approved ? "success" : "destructive"}>
                          {m.approved ? "Aprovada" : "Reprovada"}
                        </Badge>
                        <span className="font-semibold text-slate-800">
                          {formatDate(m.performed_at)}
                        </span>
                      </div>
                      {m.notes && (
                        <p className="text-slate-500 mt-1 italic">
                          &ldquo;{m.notes}&rdquo;
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2 text-[10px] text-slate-400 mt-1.5">
                        <span>Nivelamento: {m.leveling_ok ? "OK" : "Falhou"}</span>
                        <span>&bull;</span>
                        <span>FEP: {m.fep_integrity_ok ? "Íntegro" : "Danificado"}</span>
                        <span>&bull;</span>
                        <span>LED: {m.led_integrity_ok ? "OK" : "Defeito"}</span>
                        <span>&bull;</span>
                        <span>Pontos Pretos: {m.black_points_led ? "SIM (Falha)" : "Nenhum"}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Modal: Confirmar Exclusão de Impressora */}
        <Dialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          title="Excluir Impressora"
          description={`Tem certeza que deseja apagar a impressora "${p.name}"? Esta ação removerá o equipamento e seu histórico de manutenções.`}
        >
          <div className="space-y-4 pt-2">
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
              <div>
                <span className="font-semibold block mb-0.5">Atenção: Ação Irreversível</span>
                O equipamento <strong>{p.name}</strong> ({p.brand} - {p.model}, Série: {p.serial_number}) será permanentemente removido do parque de impressoras.
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
