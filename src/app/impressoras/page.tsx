"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/shell";
import { OdontoPrintService } from "@/services/odontoprint-service";
import { PrinterWithStatus } from "@/types/domain";
import { PRINTER_STATUS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import {
  Printer,
  Wrench,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Plus,
  Layers,
  ArrowRight,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "sonner";

export default function ImpressorasPage() {
  const [printers, setPrinters] = useState<PrinterWithStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Excluir Impressora State
  const [printerToDelete, setPrinterToDelete] = useState<PrinterWithStatus | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // New Printer Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [maintenanceContact, setMaintenanceContact] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const loadPrinters = async () => {
    setIsLoading(true);
    try {
      const data = await OdontoPrintService.getPrinters();
      setPrinters(data);
    } catch {
      toast.error("Erro ao listar impressoras.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPrinters();
  }, []);

  const handleCreatePrinter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !brand.trim() || !model.trim() || !serialNumber.trim()) {
      toast.error("Preencha todos os campos obrigatórios.");
      return;
    }

    setIsSaving(true);
    try {
      await OdontoPrintService.createPrinter({
        name,
        brand,
        model,
        serial_number: serialNumber,
        maintenance_contact: maintenanceContact,
        active: true,
      });

      toast.success("Impressora cadastrada com sucesso! Realize a primeira manutenção para liberá-la.");
      setModalOpen(false);
      setName("");
      setBrand("");
      setModel("");
      setSerialNumber("");
      setMaintenanceContact("");
      loadPrinters();
    } catch {
      toast.error("Erro ao cadastrar impressora.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePrinter = async () => {
    if (!printerToDelete) return;
    setIsDeleting(true);
    try {
      await OdontoPrintService.deletePrinter(printerToDelete.id);
      toast.success(`Impressora "${printerToDelete.name}" apagada com sucesso.`);
      setPrinterToDelete(null);
      await loadPrinters();
    } catch {
      toast.error("Erro ao apagar impressora.");
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
                Operador de Resinas & Equipamentos
              </Badge>
              <span className="text-xs text-slate-400">&bull;</span>
              <span className="text-xs text-slate-500">Regra Estrita de 7 Dias</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1 flex items-center gap-2">
              Parque de Impressoras 3D
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Equipamentos com manutenção vencida (&gt;7 dias) são automaticamente bloqueados para novas impressões.
            </p>
          </div>

          <Button onClick={() => setModalOpen(true)} variant="default" size="sm" className="gap-1.5 font-bold">
            <Plus className="w-4 h-4" />
            Cadastrar Nova Impressora
          </Button>
        </div>

        {/* Fleet Cards */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-56 w-full rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {printers.map((p) => {
              const statusCfg = PRINTER_STATUS[p.calculated_status] || PRINTER_STATUS.INATIVA;
              const isAvailable = p.calculated_status === "DISPONIVEL";

              return (
                <Card
                  key={p.id}
                  className={`flex flex-col justify-between overflow-hidden border-2 transition-all hover:shadow-card ${
                    isAvailable
                      ? "border-emerald-200 bg-white"
                      : p.calculated_status === "MANUTENCAO_VENCIDA"
                      ? "border-amber-200 bg-amber-50/20"
                      : "border-rose-200 bg-rose-50/20"
                  }`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base text-slate-900">{p.name}</CardTitle>
                        <CardDescription>
                          {p.brand} &bull; {p.model}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge className={statusCfg.color}>{statusCfg.label}</Badge>
                        <button
                          type="button"
                          onClick={() => setPrinterToDelete(p)}
                          className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                          title="Excluir impressora"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3 text-xs">
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Nº de Série:</span>
                        <span className="font-mono font-bold text-slate-700">{p.serial_number}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Última Manutenção:</span>
                        <span className="font-medium text-slate-700">
                          {p.latest_maintenance ? formatDate(p.latest_maintenance.performed_at) : "Nenhuma"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Tempo desde manutenção:</span>
                        <span
                          className={`font-bold ${
                            (p.days_since_maintenance || 0) > 7
                              ? "text-rose-600"
                              : "text-emerald-700"
                          }`}
                        >
                          {p.days_since_maintenance !== null
                            ? `${p.days_since_maintenance} dias atrás`
                            : "Pendente"}
                        </span>
                      </div>
                    </div>

                    {!isAvailable && (
                      <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                        <div>
                          {p.calculated_status === "MANUTENCAO_VENCIDA"
                            ? `Bloqueada para novas impressões porque a manutenção venceu há ${p.days_since_maintenance} dias (limite: 7 dias).`
                            : p.calculated_status === "REPROVADA"
                            ? "Bloqueada porque foi reprovada no último checklist técnico de bancada."
                            : "Equipamento desativado."}
                        </div>
                      </div>
                    )}
                  </CardContent>

                  <div className="p-4 pt-0 flex gap-2">
                    <Link href={`/impressoras/${p.id}/manutencao`} className="flex-1">
                      <Button
                        variant={isAvailable ? "outline" : "default"}
                        size="sm"
                        className={`w-full text-xs font-bold gap-1.5 ${
                          !isAvailable ? "bg-amber-600 hover:bg-amber-700 text-white" : ""
                        }`}
                      >
                        <Wrench className="w-3.5 h-3.5" />
                        Realizar Manutenção
                      </Button>
                    </Link>

                    <Link href={`/impressoras/${p.id}`}>
                      <Button variant="ghost" size="sm" className="text-xs">
                        Histórico
                      </Button>
                    </Link>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Modal: Cadastrar Impressora */}
        <Dialog
          open={modalOpen}
          onOpenChange={setModalOpen}
          title="Cadastrar Nova Impressora 3D"
          description="Adicione um equipamento ao parque tecnológico do laboratório."
        >
          <form onSubmit={handleCreatePrinter} className="space-y-4 pt-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nome da Impressora *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Odonto Printer 04"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Marca *
                </label>
                <input
                  type="text"
                  required
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder="Ex: Elegoo"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Modelo *
                </label>
                <input
                  type="text"
                  required
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="Ex: Saturn 4 Ultra"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Número de Série *
              </label>
              <input
                type="text"
                required
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                placeholder="Ex: SN-ELG-8812-BR"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Contato de Manutenção / Assistência
              </label>
              <input
                type="text"
                value={maintenanceContact}
                onChange={(e) => setMaintenanceContact(e.target.value)}
                placeholder="Ex: assistencia@elegoo.com / (11) 98888-7777"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setModalOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSaving} size="sm" className="font-bold">
                {isSaving ? "Salvando..." : "Salvar Impressora"}
              </Button>
            </div>
          </form>
        </Dialog>

        {/* Modal: Confirmar Exclusão de Impressora */}
        <Dialog
          open={Boolean(printerToDelete)}
          onOpenChange={(open) => {
            if (!open) setPrinterToDelete(null);
          }}
          title="Excluir Impressora"
          description={`Tem certeza que deseja apagar a impressora "${printerToDelete?.name}"? Esta ação removerá o equipamento e seu histórico de manutenções.`}
        >
          <div className="space-y-4 pt-2">
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
              <div>
                <span className="font-semibold block mb-0.5">Atenção: Ação Irreversível</span>
                O equipamento <strong>{printerToDelete?.name}</strong> ({printerToDelete?.brand} - {printerToDelete?.model}, Série: {printerToDelete?.serial_number}) será permanentemente removido do parque de impressoras.
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPrinterToDelete(null)}
                disabled={isDeleting}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeletePrinter}
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
