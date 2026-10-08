"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/shell";
import { OdontoPrintService } from "@/services/odontoprint-service";
import { useAuth } from "@/lib/auth-context";
import {
  FlaskConical,
  ArrowLeft,
  ArrowRight,
  Info,
  Calendar,
  Layers,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function RecebimentoResinaPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [brand, setBrand] = useState("");
  const [resinType, setResinType] = useState("");
  const [lot, setLot] = useState("");
  const [volume, setVolume] = useState<number>(1000);
  const [volumeUnit, setVolumeUnit] = useState("ml");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brand.trim() || !resinType.trim() || !lot.trim() || !volume) {
      toast.error("Preencha todos os campos obrigatórios.");
      return;
    }

    setIsSubmitting(true);
    try {
      const batch = await OdontoPrintService.createResinBatch({
        brand,
        resin_type: resinType,
        lot,
        volume: Number(volume),
        volume_unit: volumeUnit,
        notes,
        created_by: user?.id || "",
      });

      toast.success(`Lote de resina ${lot.toUpperCase()} registrado com sucesso!`, {
        description: "Status definido como AGUARDANDO CALIBRAÇÃO.",
        action: {
          label: "Calibrar Agora",
          onClick: () => router.push(`/calibracoes/nova?batch=${batch.id}`),
        },
      });

      router.push("/resinas");
    } catch {
      toast.error("Erro ao registrar recebimento de resina.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200/80 pb-4">
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
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                Recebimento de Resina Fotopolimerizável
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Cadastro de frasco/lote novo conforme procedimento de qualidade laboratorial.
              </p>
            </div>
          </div>

          <div className="text-xs text-slate-500">
            Responsável: <span className="font-semibold text-slate-800">{user?.full_name || "Operador"}</span>
          </div>
        </div>

        {/* Info Banner */}
        <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-200 text-xs text-amber-900 flex items-start gap-3">
          <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block mb-0.5">Procedimento Padrão OdontoPrint:</span>
            A cada recebimento de resina, um novo registro de lote deve ser criado. O status inicial será sempre &quot;Aguardando Calibração&quot;. A resina só poderá ser usada no Fatiador após calibração técnica aprovada na impressora correspondente.
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-brand-500" />
                Dados do Frasco / Embalagem
              </CardTitle>
              <CardDescription>
                Informações extraídas do rótulo do fabricante e nota fiscal.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Marca do Fabricante *
                  </label>
                  <input
                    type="text"
                    required
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    placeholder="Ex: PriZma 3D Bio, Smart Print, Cosmos..."
                    className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tipo de Aplicação da Resina *
                  </label>
                  <input
                    type="text"
                    required
                    value={resinType}
                    onChange={(e) => setResinType(e.target.value)}
                    placeholder="Ex: Model Precision Beige, Placa Miorrelaxante..."
                    className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Número do Lote (Batch) *
                  </label>
                  <input
                    type="text"
                    required
                    value={lot}
                    onChange={(e) => setLot(e.target.value)}
                    placeholder="Ex: BIO-2026-X1"
                    className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono font-bold uppercase"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Volume & Unidade *
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      required
                      min={1}
                      value={volume}
                      onChange={(e) => setVolume(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                    <select
                      value={volumeUnit}
                      onChange={(e) => setVolumeUnit(e.target.value)}
                      className="px-3 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50 font-bold"
                    >
                      <option value="ml">ml</option>
                      <option value="g">g</option>
                      <option value="L">L</option>
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Observações de Armazenamento / Validade
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex: Armazenar em local escuro entre 18°C e 25°C. Validade do lote até 12/2027..."
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </CardContent>
          </Card>

          {/* Action Bar */}
          <div className="flex items-center justify-between pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => router.push("/resinas")}
            >
              Cancelar
            </Button>

            <Button
              type="submit"
              size="lg"
              disabled={isSubmitting}
              className="font-bold px-8"
            >
              {isSubmitting ? "Salvando..." : "Registrar Recebimento"}
            </Button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
