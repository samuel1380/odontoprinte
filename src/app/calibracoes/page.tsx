"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/shell";
import { OdontoPrintService } from "@/services/odontoprint-service";
import { formatDate } from "@/lib/utils";
import {
  Compass,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Printer,
  FlaskConical,
  Layers,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export default function CalibracoesPage() {
  const [calibrations, setCalibrations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const data = await OdontoPrintService.getCalibrations();
        setCalibrations(data);
      } catch {
        toast.error("Erro ao listar calibrações.");
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200/80 pb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              Calibrações Técnicas de Resina
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Relação estrita Resina/Lote + Impressora (tolerância micrométrica de 9.99 a 10.01 mm).
            </p>
          </div>

          <Link href="/calibracoes/nova" className="w-full sm:w-auto">
            <Button variant="default" size="sm" className="gap-1.5 font-bold w-full sm:w-auto justify-center">
              <Plus className="w-4 h-4" />
              Nova Calibração Técnica
            </Button>
          </Link>
        </div>

        {/* Calibrations Table / Cards */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : calibrations.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-200 p-8">
            <Compass className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <h3 className="text-base font-bold text-slate-800">Nenhuma calibração registrada</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Realize a calibração das peças de teste para liberar combinações de resina e impressora.
            </p>
            <Link href="/calibracoes/nova">
              <Button className="mt-4 font-bold" size="sm">
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
                  className={`transition-all hover:border-slate-300 ${
                    isApproved ? "border-emerald-200 bg-white" : "border-rose-200 bg-rose-50/20"
                  }`}
                >
                  <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
                    <div className="flex items-start gap-3.5">
                      <div
                        className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${
                          isApproved ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                        }`}
                      >
                        <Compass className="w-5 h-5" />
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900">
                            {cal.resin_brand}
                          </span>
                          <span className="text-slate-400">&bull;</span>
                          <span className="font-mono text-slate-600 font-semibold">
                            Lote {cal.resin_lot}
                          </span>
                          <Badge variant={isApproved ? "success" : "destructive"}>
                            {isApproved ? "Aprovada" : "Reprovada"}
                          </Badge>
                        </div>

                        <div className="text-slate-500 mt-1 flex items-center gap-1.5">
                          <Printer className="w-3.5 h-3.5 text-brand-500" />
                          <span>Impressora: <strong className="text-slate-700">{cal.printer_name}</strong></span>
                          <span>&bull;</span>
                          <span>Tentativa #{cal.calibration_number}</span>
                        </div>
                      </div>
                    </div>

                    {/* Measurements */}
                    <div className="flex flex-wrap items-center gap-4 border-t md:border-t-0 pt-2 md:pt-0 border-slate-100">
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block">Hexágono</span>
                        <span
                          className={`font-mono font-bold text-sm ${
                            cal.hexagon_size_mm >= 9.99 && cal.hexagon_size_mm <= 10.01
                              ? "text-emerald-700"
                              : "text-rose-600"
                          }`}
                        >
                          {Number(cal.hexagon_size_mm).toFixed(2)} mm
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block">Camada</span>
                        <span className="font-semibold text-slate-700">{cal.layer_height} mm</span>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block">Exposição</span>
                        <span className="font-semibold text-slate-700">{cal.exposure_time} s</span>
                      </div>

                      <div className="text-right text-[11px] text-slate-400 pl-2 border-l border-slate-200">
                        {formatDate(cal.created_at)}
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
