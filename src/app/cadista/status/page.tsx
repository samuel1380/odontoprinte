"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/shell";
import { DENTAL_FILE_TYPES, DentalFileType, ProcessType } from "@/lib/constants";
import { OdontoPrintService } from "@/services/odontoprint-service";
import { useAuth } from "@/lib/auth-context";
import {
  FileCheck2,
  Printer,
  Cog,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Sparkles,
  Info,
  Calendar,
  Layers,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function CadistaStatusPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [patientCode, setPatientCode] = useState("");
  const [patientName, setPatientName] = useState("");
  const [notes, setNotes] = useState("");
  const [processType, setProcessType] = useState<ProcessType>("IMPRESSAO");
  const [selectedFiles, setSelectedFiles] = useState<DentalFileType[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const toggleFile = (fileType: DentalFileType) => {
    setSelectedFiles((prev) =>
      prev.includes(fileType)
        ? prev.filter((item) => item !== fileType)
        : [...prev, fileType]
    );
    if (validationError) setValidationError(null);
  };

  const handleSelectAll = () => {
    if (selectedFiles.length === DENTAL_FILE_TYPES.length) {
      setSelectedFiles([]);
    } else {
      setSelectedFiles(DENTAL_FILE_TYPES.map((f) => f.id));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // REGRA FUNDAMENTAL: Se nenhum item for selecionado, NÃO alterar o status e NÃO criar registro na fila
    if (selectedFiles.length === 0) {
      const msg = "Selecione pelo menos um arquivo para continuar.";
      setValidationError(msg);
      toast.error(msg);
      return;
    }

    if (!patientCode.trim()) {
      const msg = "Informe o código do paciente/trabalho (ex: PAC-100).";
      setValidationError(msg);
      toast.error(msg);
      return;
    }

    setIsSubmitting(true);
    setValidationError(null);

    try {
      const res = await OdontoPrintService.createCadistaCase({
        patient_code: patientCode,
        patient_name: patientName,
        notes,
        process_type: processType,
        selected_files: selectedFiles,
        user_id: user?.id || "",
      });

      if (!res.success) {
        setValidationError(res.error || "Erro ao criar trabalho.");
        toast.error(res.error);
        return;
      }

      toast.success(
        `Trabalho ${patientCode.toUpperCase()} criado! ${selectedFiles.length} modelos cadastrados na esteira 3D.`,
        {
          description: "Os modelos foram encaminhados para a Fila de Impressão FIFO.",
          action: {
            label: "Ver Fila 3D",
            onClick: () => router.push("/fila"),
          },
        }
      );

      router.push("/fila");
    } catch (err: any) {
      toast.error(err.message || "Erro inesperado ao salvar trabalho.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200/80 pb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Novo Trabalho (Cadastrar Caso)
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Informe a identificação do paciente e selecione quais modelos 3D devem ser produzidos.
            </p>
          </div>

          <div className="text-xs text-slate-500 font-medium bg-slate-100/80 px-3 py-1.5 rounded-full w-fit">
            Cadista: <span className="font-semibold text-slate-800">{user?.full_name || "Operador"}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Card 1: Identificação do Paciente / Caso */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-brand-500" />
                1. Identificação do Paciente
              </CardTitle>
              <CardDescription>
                O código (ex: PAC-100) é a referência principal para rastrear a ordem do início ao fim.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Código do Paciente / Trabalho <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={patientCode}
                    onChange={(e) => {
                      setPatientCode(e.target.value);
                      if (validationError) setValidationError(null);
                    }}
                    placeholder="Ex: PAC-100"
                    className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white font-mono uppercase font-bold text-slate-900 placeholder:normal-case placeholder:font-normal"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Identificador único no fluxo de bancada e caixas de produção.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nome ou Identificação do Paciente <span className="text-slate-400 font-normal">(Opcional)</span>
                  </label>
                  <input
                    type="text"
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    placeholder="Ex: Maria dos Santos"
                    className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Opcional conforme política de privacidade e LGPD clínica.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Observações Clínicas / Instruções de Encaixe <span className="text-slate-400 font-normal">(Opcional)</span>
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex: Aliviar retenções cervicais no troquel ou espaçamento de cimento 40 micras..."
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                />
              </div>
            </CardContent>
          </Card>

          {/* Card 2: ARQUIVOS A SEREM IMPRESSOS */}
          <Card className={validationError ? "border-rose-300 ring-2 ring-rose-100" : ""}>
            <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="text-base flex items-center gap-2">
                  <Layers className="w-4 h-4 text-brand-500 shrink-0" />
                  <span>2. Modelos 3D para Impressão</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Selecione exatamente quais modelos anatômicos compõem este trabalho.
                </CardDescription>
              </div>

              <button
                type="button"
                onClick={handleSelectAll}
                className="text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline shrink-0 whitespace-nowrap"
              >
                {selectedFiles.length === DENTAL_FILE_TYPES.length
                  ? "Desmarcar Todos"
                  : "Selecionar Todos"}
              </button>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Alerta de regra fundamental */}
              {validationError && (
                <div className="flex items-center gap-2.5 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium animate-in fade-in">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{validationError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 gap-2.5">
                {DENTAL_FILE_TYPES.map((file) => {
                  const isSelected = selectedFiles.includes(file.id);

                  return (
                    <div
                      key={file.id}
                      onClick={() => toggleFile(file.id)}
                      className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all ${
                        isSelected
                          ? "border-approvedGreen-500/80 bg-approvedGreen-50/60 shadow-sm"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {/* Círculo de seleção visual como desenhado no fluxograma */}
                        <div
                          className={`h-6 w-6 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ${
                            isSelected
                              ? "border-approvedGreen-600 bg-approvedGreen-500 text-white shadow-sm"
                              : "border-slate-300 bg-white"
                          }`}
                        >
                          {isSelected && <CheckCircle2 className="w-4 h-4" />}
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`text-sm font-semibold ${
                                isSelected ? "text-slate-900" : "text-slate-700"
                              }`}
                            >
                              {file.label}
                            </span>
                            {"category" in file && (
                              <Badge
                                variant="secondary"
                                className={`text-[10px] py-0 px-1.5 ${
                                  (file as any).category === "FRESAGEM"
                                    ? "bg-purple-50 text-purple-700 border-purple-200"
                                    : (file as any).category === "MISTO"
                                    ? "bg-slate-100 text-slate-700 border-slate-200"
                                    : "bg-blue-50 text-blue-700 border-blue-200"
                                }`}
                              >
                                {(file as any).category === "FRESAGEM"
                                  ? "Fresadora CNC"
                                  : (file as any).category === "MISTO"
                                  ? "Impressora ou Fresadora"
                                  : "Impressora 3D"}
                              </Badge>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400">{file.description}</p>
                        </div>
                      </div>

                      {isSelected && (
                        <Badge variant="lime" className="text-[10px] uppercase font-bold shrink-0">
                          Selecionado
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="pt-2 flex items-center gap-2 text-xs text-slate-400">
                <Info className="w-3.5 h-3.5 shrink-0 text-brand-500" />
                <span>
                  Modelos impressos (com furos) e dentes fresados serão reunidos na Bancada de Acabamento & Maquiagem para montagem e glaze.
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Action Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
            <div className="text-xs text-slate-500 text-center sm:text-left">
              <span className="font-semibold text-slate-800">{selectedFiles.length}</span> de{" "}
              {DENTAL_FILE_TYPES.length} arquivos selecionados
            </div>

            <Button
              type="submit"
              size="lg"
              disabled={isSubmitting}
              className="gap-2 px-6 sm:px-8 font-bold w-full sm:w-auto justify-center"
            >
              {isSubmitting ? (
                "Cadastrando Trabalho..."
              ) : (
                <>
                  Confirmar e Enviar para Fila
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
