"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/shell";
import { OdontoPrintService } from "@/services/odontoprint-service";
import { ResinCalibrationDetail } from "@/types/domain";
import {
  Compass,
  Plus,
  Printer,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";

export default function CalibracoesPage() {
  const [calibrations, setCalibrations] = useState<ResinCalibrationDetail[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadCalibrations = async () => {
    setIsLoading(true);
    try {
      const data = await OdontoPrintService.getCalibrations();
      setCalibrations(data);
    } catch {
      toast.error("Erro ao carregar calibrações.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCalibrations();
  }, []);

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Calibrações de Resina
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Testes dimensionais e validação de lotes.
            </p>
          </div>

          <Link href="/calibracoes/nova" className="w-full sm:w-auto">
            <Button variant="default" size="sm" className="gap-1.5 font-bold w-full sm:w-auto justify-center rounded-full bg-white hover:bg-slate-200 text-slate-950">
              <Plus className="w-4 h-4" />
              Nova Calibração
            </Button>
          </Link>
        </div>

        {/* Calibrations Table / Cards */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-2xl bg-slate-800" />
            ))}
          </div>
        ) : calibrations.length === 0 ? (
          <div className="text-center py-12 bg-[#0F172A] rounded-3xl border border-dashed border-slate-800 p-8">
            <Compass className="w-10 h-10 text-slate-500 mx-auto mb-2" />
            <h3 className="text-base font-bold text-white">Nenhuma calibração registrada</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Realize a calibração das peças de teste para liberar combinações de resina e impressora.
            </p>
            <Link href="/calibracoes/nova">
              <Button className="mt-4 font-bold rounded-full bg-white hover:bg-slate-200 text-slate-950" size="sm">
                Iniciar Primeira Calibração
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {calibrations.map((cal) => {
              const isApproved = cal.status === "APROVADA";

              return (
                <Card
                  key={cal.id}
                  className={`transition-all hover:border-slate-700 ${
                    isApproved ? "border-slate-800 bg-[#0F172A]" : "border-rose-800/40 bg-rose-950/20"
                  }`}
                >
                  <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
                    <div className="flex items-start gap-3.5">
                      <div
                        className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${
                          isApproved ? "bg-emerald-950/80 text-emerald-400 border border-emerald-800/50" : "bg-rose-950/80 text-rose-400 border border-rose-800/50"
                        }`}
                      >
                        <Compass className="w-4 h-4" />
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-white">
                            {cal.resin_brand}
                          </span>
                          <span className="text-slate-600">&bull;</span>
                          <span className="font-mono text-slate-400 font-semibold">
                            Lote {cal.resin_lot}
                          </span>
                          <Badge variant={isApproved ? "default" : "destructive"}>
                            {isApproved ? "Aprovada" : "Reprovada"}
                          </Badge>
                        </div>

                        <div className="text-slate-400 mt-1 flex items-center gap-1.5">
                          <Printer className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Impressora: <strong className="text-white">{cal.printer_name}</strong></span>
                          <span>&bull;</span>
                          <span>Tentativa #{cal.calibration_number}</span>
                        </div>
                      </div>
                    </div>

                    {/* Measurements */}
                    <div className="flex flex-wrap items-center gap-4 border-t md:border-t-0 pt-2 md:pt-0 border-slate-800">
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block">Hexágono</span>
                        <span
                          className={`font-mono font-bold text-sm ${
                            cal.hexagon_size_mm >= 9.99 && cal.hexagon_size_mm <= 10.01
                              ? "text-emerald-400"
                              : "text-rose-400"
                          }`}
                        >
                          {Number(cal.hexagon_size_mm).toFixed(2)} mm
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block">Camada</span>
                        <span className="font-semibold text-white">{cal.layer_height} mm</span>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block">Exposição</span>
                        <span className="font-semibold text-white">{cal.exposure_time} s</span>
                      </div>

                      <div className="text-right hidden sm:block">
                        <span className="text-[10px] text-slate-500 block">Data</span>
                        <span className="text-slate-400">{formatDate(cal.calibrated_at || cal.created_at)}</span>
                      </div>

                      <Link href={`/resinas/${cal.resin_batch_id}`}>
                        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-slate-400 hover:text-white">
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </Link>
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
