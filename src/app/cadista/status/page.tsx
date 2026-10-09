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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#EFECE6] pb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#18181B] tracking-tight">
              Novo Trabalho
            </h1>
            <p className="text-xs sm:text-sm text-[#716D66] mt-0.5">
              Cadastro de caso para produção 3D.
            </p>
          </div>

          <div className="text-xs text-[#716D66] font-medium bg-[#EFEAE2] px-3.5 py-1.5 rounded-full w-fit">
            Cadista: <span className="font-semibold text-[#18181B]">{user?.full_name || "Operador"}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Card 1: Identificação do Paciente / Caso */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-[#DE5A35]" />
                Identificação do Caso
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#18181B] mb-1.5">
                    Código do Paciente / Trabalho <span className="text-[#DE3535]">*</span>
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
                    className="w-full px-4 py-2.5 text-sm rounded-full border border-[#EFECE6] bg-[#FAF8F5]/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#18181B] font-mono uppercase font-bold text-[#18181B] placeholder:normal-case placeholder:font-normal"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#18181B] mb-1.5">
                    Nome do Paciente <span className="text-[#716D66] font-normal">(Opcional)</span>
                  </label>
                  <input
                    type="text"
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    placeholder="Ex: Maria dos Santos"
                    className="w-full px-4 py-2.5 text-sm rounded-full border border-[#EFECE6] bg-[#FAF8F5]/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#18181B] text-[#18181B]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#18181B] mb-1.5">
                  Observações Clínicas <span className="text-[#716D66] font-normal">(Opcional)</span>
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Instruções de encaixe ou detalhes do caso..."
                  className="w-full px-4 py-2.5 text-sm rounded-2xl border border-[#EFECE6] bg-[#FAF8F5]/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#18181B] text-[#18181B]"
                />
              </div>
            </CardContent>
          </Card>

          {/* Card 2: ARQUIVOS A SEREM IMPRESSOS */}
          <Card className={validationError ? "border-[#DE3535]/50 ring-2 ring-[#DE3535]/10" : ""}>
            <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="text-base flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#DE5A35] shrink-0" />
                  <span>Modelos 3D para Produção</span>
                </CardTitle>
              </div>

              <button
                type="button"
                onClick={handleSelectAll}
                className="text-xs font-semibold px-3 py-1 rounded-full bg-[#EFEAE2] text-[#2D2A26] hover:bg-[#E2DDD5] transition shrink-0"
              >
                {selectedFiles.length === DENTAL_FILE_TYPES.length
                  ? "Desmarcar Todos"
                  : "Selecionar Todos"}
              </button>
            </CardHeader>
            <CardContent className="space-y-3">
              {validationError && (
                <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{validationError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 gap-2">
                {DENTAL_FILE_TYPES.map((file) => {
                  const isSelected = selectedFiles.includes(file.id);

                  return (
                    <div
                      key={file.id}
                      onClick={() => toggleFile(file.id)}
                      className={`flex items-center justify-between p-3.5 rounded-2xl border cursor-pointer transition-all ${
                        isSelected
                          ? "border-[#18181B] bg-[#FAF8F5] shadow-xs"
                          : "border-[#EFECE6] bg-white hover:border-[#E2DDD5] hover:bg-[#FAF8F5]/40"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ${
                            isSelected
                              ? "border-[#18181B] bg-[#18181B] text-white"
                              : "border-[#D1CCC4] bg-white"
                          }`}
                        >
                          {isSelected && <CheckCircle2 className="w-3.5 h-3.5" />}
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`text-sm font-semibold ${
                                isSelected ? "text-[#18181B]" : "text-[#4A4742]"
                              }`}
                            >
                              {file.label}
                            </span>
                            {"category" in file && (
                              <Badge
                                variant="secondary"
                                className="text-[10px] py-0 px-2"
                              >
                                {(file as any).category === "FRESAGEM"
                                  ? "Fresadora CNC"
                                  : (file as any).category === "MISTO"
                                  ? "Impressora / Fresadora"
                                  : "Impressora 3D"}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>

                      {isSelected && (
                        <Badge variant="default" className="text-[10px] uppercase font-bold shrink-0">
                          Selecionado
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Action Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
            <div className="text-xs text-[#716D66] text-center sm:text-left">
              <span className="font-semibold text-[#18181B]">{selectedFiles.length}</span> de{" "}
              {DENTAL_FILE_TYPES.length} arquivos selecionados
            </div>

            <Button
              type="submit"
              size="lg"
              disabled={isSubmitting}
              className="gap-2 px-8 font-bold w-full sm:w-auto justify-center"
            >
              {isSubmitting ? (
                "Cadastrando..."
              ) : (
                <>
                  Enviar para Fila
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
