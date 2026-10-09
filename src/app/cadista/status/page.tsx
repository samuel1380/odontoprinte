"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/shell";
import { OdontoPrintService } from "@/services/odontoprint-service";
import { DENTAL_FILE_TYPES } from "@/lib/constants";
import { useAuth } from "@/lib/auth-context";
import {
  FileCheck2,
  Layers,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function CadistaStatusPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [patientCode, setPatientCode] = useState("");
  const [patientName, setPatientName] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const toggleFile = (fileId: string) => {
    setSelectedFiles((prev) =>
      prev.includes(fileId) ? prev.filter((id) => id !== fileId) : [...prev, fileId]
    );
    if (validationError) setValidationError(null);
  };

  const handleSelectAll = () => {
    if (selectedFiles.length === DENTAL_FILE_TYPES.length) {
      setSelectedFiles([]);
    } else {
      setSelectedFiles(DENTAL_FILE_TYPES.map((f) => f.id));
    }
    if (validationError) setValidationError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!patientCode.trim()) {
      setValidationError("O código do paciente/caso é obrigatório.");
      toast.error("Informe o código do caso.");
      return;
    }

    if (selectedFiles.length === 0) {
      setValidationError("Selecione pelo menos um modelo odontológico para produzir.");
      toast.error("Nenhum modelo selecionado.");
      return;
    }

    setIsSubmitting(true);
    setValidationError(null);

    try {
      const createdCase = await OdontoPrintService.createCaseWithItems({
        patient_code: patientCode.trim(),
        patient_name: patientName.trim() || undefined,
        clinical_notes: notes.trim() || undefined,
        files: selectedFiles.map((fileId) => {
          const fileMeta = DENTAL_FILE_TYPES.find((f) => f.id === fileId);
          return {
            file_type: fileId,
            file_name: `${patientCode.trim().toUpperCase()}_${fileId.toUpperCase()}.stl`,
            label: fileMeta?.label || fileId,
            category: (fileMeta as any)?.category,
          };
        }),
      });

      if (!createdCase) {
        throw new Error("Não foi possível criar o caso no banco de dados.");
      }

      toast.success(
        `Trabalho ${patientCode.toUpperCase()} criado! ${selectedFiles.length} modelos cadastrados na esteira 3D.`,
        {
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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Novo Trabalho
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              Cadastro de caso para produção 3D.
            </p>
          </div>

          <div className="text-xs text-slate-400 font-medium bg-[#0F172A] border border-slate-800 px-3.5 py-1.5 rounded-full w-fit">
            Cadista: <span className="font-semibold text-white">{user?.full_name || "Operador"}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Card 1: Identificação do Paciente / Caso */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-cyan-400" />
                Identificação do Caso
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                    Código do Paciente / Trabalho <span className="text-rose-400">*</span>
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
                    className="w-full px-4 py-2.5 text-sm rounded-full border border-slate-800 bg-slate-900 focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 font-mono uppercase font-bold text-white placeholder:normal-case placeholder:font-normal placeholder:text-slate-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                    Nome do Paciente <span className="text-slate-500 font-normal">(Opcional)</span>
                  </label>
                  <input
                    type="text"
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    placeholder="Ex: Maria dos Santos"
                    className="w-full px-4 py-2.5 text-sm rounded-full border border-slate-800 bg-slate-900 focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 text-white placeholder:text-slate-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                  Observações Clínicas <span className="text-slate-500 font-normal">(Opcional)</span>
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Instruções de encaixe ou detalhes do caso..."
                  className="w-full px-4 py-2.5 text-sm rounded-2xl border border-slate-800 bg-slate-900 focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 text-white placeholder:text-slate-500"
                />
              </div>
            </CardContent>
          </Card>

          {/* Card 2: ARQUIVOS A SEREM IMPRESSOS */}
          <Card className={validationError ? "border-rose-500/50 ring-2 ring-rose-500/10" : ""}>
            <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="text-base flex items-center gap-2">
                  <Layers className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>Modelos 3D para Produção</span>
                </CardTitle>
              </div>

              <button
                type="button"
                onClick={handleSelectAll}
                className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition shrink-0 border border-slate-700"
              >
                {selectedFiles.length === DENTAL_FILE_TYPES.length
                  ? "Desmarcar Todos"
                  : "Selecionar Todos"}
              </button>
            </CardHeader>
            <CardContent className="space-y-3">
              {validationError && (
                <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-rose-950/60 border border-rose-800/60 text-rose-300 text-xs font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
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
                          ? "border-cyan-500/80 bg-slate-900 shadow-sm"
                          : "border-slate-800 bg-[#0B0F19]/60 hover:border-slate-700 hover:bg-slate-900/50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ${
                            isSelected
                              ? "border-cyan-400 bg-cyan-400 text-slate-950"
                              : "border-slate-700 bg-slate-900"
                          }`}
                        >
                          {isSelected && <CheckCircle2 className="w-3.5 h-3.5" />}
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`text-sm font-semibold ${
                                isSelected ? "text-white" : "text-slate-300"
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
                        <Badge variant="default" className="text-[10px] uppercase font-bold shrink-0 bg-white text-slate-950">
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
            <div className="text-xs text-slate-400 text-center sm:text-left">
              <span className="font-semibold text-white">{selectedFiles.length}</span> de{" "}
              {DENTAL_FILE_TYPES.length} arquivos selecionados
            </div>

            <Button
              type="submit"
              size="lg"
              disabled={isSubmitting}
              className="gap-2 px-8 font-bold w-full sm:w-auto justify-center bg-white hover:bg-slate-200 text-slate-950"
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
