"use client";

import React, { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/shell";
import { OdontoPrintService } from "@/services/odontoprint-service";
import { AIService } from "@/services/ai-service";
import { AIConfig, AIProvider } from "@/types/ai.types";
import { SystemSettings } from "@/types/database.types";
import {
  Settings,
  Save,
  RefreshCcw,
  Info,
  Sliders,
  CheckCircle2,
  Sparkles,
  Bot,
  KeyRound,
  Eye,
  EyeOff,
  Zap,
  Check,
  AlertTriangle,
  ExternalLink,
  Copy,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export default function AdminConfiguracoesPage() {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Form State - Parâmetros
  const [maintenanceDays, setMaintenanceDays] = useState(7);
  const [hexagonMin, setHexagonMin] = useState(9.99);
  const [hexagonMax, setHexagonMax] = useState(10.01);
  const [normalPrefix, setNormalPrefix] = useState("A");
  const [retryPrefix, setRetryPrefix] = useState("00A");

  // Form State - Inteligência Artificial (Google Gemini 3.8 e Groq Cloud)
  const [aiProvider, setAiProvider] = useState<AIProvider>("GEMINI");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiModel, setAiModel] = useState("gemini-3.8-flash");
  const [aiEnabled, setAiEnabled] = useState(true);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isTestingAi, setIsTestingAi] = useState(false);
  const [renderAiStatus, setRenderAiStatus] = useState<{
    gemini: boolean;
    groq: boolean;
    geminiMasked?: string;
    groqMasked?: string;
    preferredProvider?: AIProvider | null;
  } | null>(null);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    latency?: number;
    details?: {
      provider?: string;
      model?: string;
      source?: string;
      note?: string;
      rawError?: string;
      diagnosticReport?: string;
    };
  } | null>(null);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const [s, envStatus] = await Promise.all([
          OdontoPrintService.getSettings(),
          AIService.getEnvStatus(),
        ]);
        setSettings(s);
        setMaintenanceDays(s.maintenance_interval_days);
        setHexagonMin(s.calibration_hexagon_min);
        setHexagonMax(s.calibration_hexagon_max);
        setNormalPrefix(s.normal_print_prefix);
        setRetryPrefix(s.retry_print_prefix);

        setRenderAiStatus(envStatus);

        // Carrega configurações de IA salvas
        const aiCfg = AIService.getConfig();
        const hasSavedConfig = typeof window !== "undefined" && Boolean(localStorage.getItem("odontoprint_ai_config"));

        if (hasSavedConfig) {
          // Usuário já salvou explicitamente: RESPEITA INTEGRALMENTE a escolha do usuário!
          setAiProvider(aiCfg.provider || "GEMINI");
          setAiModel(
            aiCfg.model ||
              (aiCfg.provider === "GROQ"
                ? "openai/gpt-oss-120b"
                : "gemini-3.8-flash")
          );
        } else if (envStatus.preferredProvider) {
          // Apenas primeira inicialização sem nenhuma preferência salva no navegador
          setAiProvider(envStatus.preferredProvider);
          setAiModel(
            envStatus.preferredProvider === "GROQ"
              ? "openai/gpt-oss-120b"
              : "gemini-3.8-flash"
          );
        } else {
          setAiProvider(aiCfg.provider || "GEMINI");
          setAiModel(aiCfg.model || "gemini-3.8-flash");
        }
        setAiApiKey(aiCfg.apiKey || "");
        setAiEnabled(aiCfg.enabled ?? true);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  const handleProviderChange = (newProvider: AIProvider) => {
    setAiProvider(newProvider);
    setTestResult(null);
    const newModel = newProvider === "GEMINI" ? "gemini-3.8-flash" : "openai/gpt-oss-120b";
    setAiModel(newModel);
    // Salva imediatamente para sincronizar instantaneamente com o Copilot
    AIService.saveConfig({
      provider: newProvider,
      apiKey: aiApiKey.trim(),
      model: newModel,
      enabled: aiEnabled,
    });
  };

  const handleCopyDiagnostic = () => {
    const report =
      testResult?.details?.diagnosticReport ||
      `[DIAGNÓSTICO ODONTOIA]\nProvedor: ${aiProvider}\nModelo: ${aiModel}\nMensagem: ${testResult?.message}`;
    navigator.clipboard.writeText(report);
    toast.success("Diagnóstico técnico copiado! Cole aqui no chat para analisarmos.");
  };

  const hasKeyFromRender =
    (aiProvider === "GEMINI" && Boolean(renderAiStatus?.gemini)) ||
    (aiProvider === "GROQ" && Boolean(renderAiStatus?.groq));

  const handleTestAi = async () => {
    if (!aiApiKey.trim() && !hasKeyFromRender) {
      toast.warning("Por favor, digite uma Chave de API ou configure no Render antes de testar.");
      return;
    }

    setIsTestingAi(true);
    setTestResult(null);
    try {
      const res = await AIService.testConnection({
        provider: aiProvider,
        apiKey: aiApiKey.trim(),
        model: aiModel.trim(),
        enabled: aiEnabled,
      });
      setTestResult(res);
      if (res.success) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido de conexão";
      setTestResult({ success: false, message: msg });
      toast.error("Falha ao comunicar com o provedor de IA.");
    } finally {
      setIsTestingAi(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hexagonMin >= hexagonMax) {
      toast.error("O hexágono mínimo deve ser estritamente menor que o máximo.");
      return;
    }

    setIsSaving(true);
    try {
      const updated = await OdontoPrintService.updateSettings({
        maintenance_interval_days: Number(maintenanceDays),
        calibration_hexagon_min: Number(hexagonMin),
        calibration_hexagon_max: Number(hexagonMax),
        normal_print_prefix: normalPrefix.trim().toUpperCase(),
        retry_print_prefix: retryPrefix.trim().toUpperCase(),
      });
      setSettings(updated);

      // Salva configurações de Inteligência Artificial
      AIService.saveConfig({
        provider: aiProvider,
        apiKey: aiApiKey.trim(),
        model: aiModel.trim(),
        enabled: aiEnabled,
      });

      toast.success("Parâmetros e IA do sistema atualizados com sucesso!");
    } catch {
      toast.error("Erro ao salvar configurações.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetDefaults = () => {
    setMaintenanceDays(7);
    setHexagonMin(9.99);
    setHexagonMax(10.01);
    setNormalPrefix("A");
    setRetryPrefix("00A");
    toast.info("Valores padrão restaurados no formulário. Clique em 'Salvar' para aplicar.");
  };

  if (isLoading) {
    return (
      <AppShell>
        <div className="max-w-3xl mx-auto space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-96 w-full rounded-2xl" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-brand-700 bg-brand-50 border-brand-200">
                Administração
              </Badge>
              <span className="text-xs text-slate-400">&bull;</span>
              <span className="text-xs text-slate-500">Parametrização sem Alteração de Código</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1 flex items-center gap-2">
              Configurações & Parâmetros do Sistema
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Ajuste limites de calibração, janelas de manutenção de impressoras e prefixos de nomenclatura.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleResetDefaults}
            className="gap-1 text-xs"
          >
            <RefreshCcw className="w-3.5 h-3.5" />
            Restaurar Padrões
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Card 1: Manutenção */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Sliders className="w-4 h-4 text-brand-500" />
                1. Janela Periódica de Manutenção
              </CardTitle>
              <CardDescription>
                Define quantos dias a impressora pode produzir antes de ser automaticamente bloqueada.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-w-xs">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Intervalo Máximo de Manutenção (Dias) *
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    max={60}
                    required
                    value={maintenanceDays}
                    onChange={(e) => setMaintenanceDays(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <span className="text-xs text-slate-500 font-medium">dias corridos</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  Padrão do laboratório: 7 dias. Ultrapassado este prazo, a impressora muda para MANUTENÇÃO VENCIDA.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Tolerância de Calibração */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Sliders className="w-4 h-4 text-brand-500" />
                2. Tolerância Dimensional do Hexágono de Teste
              </CardTitle>
              <CardDescription>
                Intervalo aceitável de medição no paquímetro para aprovação técnica da resina.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tamanho Mínimo (mm) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={hexagonMin}
                    onChange={(e) => setHexagonMin(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <span className="text-[11px] text-slate-400 mt-1 block">Padrão: 9.99 mm</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tamanho Máximo (mm) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={hexagonMax}
                    onChange={(e) => setHexagonMax(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <span className="text-[11px] text-slate-400 mt-1 block">Padrão: 10.01 mm</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 3: Nomenclatura */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Sliders className="w-4 h-4 text-brand-500" />
                3. Prefixos de Nomenclatura de Impressão
              </CardTitle>
              <CardDescription>
                Padrões de identificação gravados no fatiador e carimbados na bancada.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Prefixo Normal (ex: A001) *
                  </label>
                  <input
                    type="text"
                    required
                    value={normalPrefix}
                    onChange={(e) => setNormalPrefix(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 uppercase"
                  />
                  <span className="text-[11px] text-slate-400 mt-1 block">Exemplo gerado: {normalPrefix}001</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Prefixo Reimpressão (ex: 00A001) *
                  </label>
                  <input
                    type="text"
                    required
                    value={retryPrefix}
                    onChange={(e) => setRetryPrefix(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 font-mono font-bold text-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500 uppercase"
                  />
                  <span className="text-[11px] text-slate-400 mt-1 block">Exemplo gerado: {retryPrefix}001</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 4: Inteligência Artificial (Gemini / Groq) */}
          <Card className="border-indigo-200/80 bg-gradient-to-br from-white via-indigo-50/20 to-brand-50/20 shadow-sm">
            <CardHeader className="pb-3 border-b border-indigo-100/60">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2 text-slate-900">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-600 to-brand-600 flex items-center justify-center text-white shadow-sm">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  4. Inteligência Artificial do Laboratório (Gemini & Groq)
                </CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-600">Copiloto Ativo:</span>
                  <button
                    type="button"
                    onClick={() => setAiEnabled(!aiEnabled)}
                    className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-200 ease-in-out ${
                      aiEnabled ? "bg-brand-600" : "bg-slate-300"
                    }`}
                  >
                    <div
                      className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                        aiEnabled ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>
              <CardDescription className="text-xs text-slate-600 mt-1">
                Conecte a IA para recomendar calibragem ideal de resina por impressora e responder dúvidas da equipe sobre o status dos trabalhos em tempo real.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 pt-4">
              {/* Banner de Status das Chaves do Render */}
              <div className="p-3.5 rounded-xl border border-indigo-200/90 bg-indigo-50/60 text-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-indigo-950 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    Chaves de IA no Servidor (Render / Variáveis de Ambiente):
                  </span>
                  <Badge variant="outline" className="text-[10px] bg-white border-indigo-200 text-indigo-700">
                    Sincronizado com Render
                  </Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-indigo-100">
                    <span className="font-semibold text-slate-700">Groq (GROQ_API_KEY):</span>
                    {renderAiStatus?.groq ? (
                      <Badge className="bg-emerald-600 text-white text-[10px]">
                        Ativa ({renderAiStatus.groqMasked})
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-slate-400 text-[10px]">
                        Não detectada
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-indigo-100">
                    <span className="font-semibold text-slate-700">Google Gemini (GEMINI_API_KEY):</span>
                    {renderAiStatus?.gemini ? (
                      <Badge className="bg-emerald-600 text-white text-[10px]">
                        Ativa ({renderAiStatus.geminiMasked})
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-slate-400 text-[10px]">
                        Não detectada
                      </Badge>
                    )}
                  </div>
                </div>
                {(renderAiStatus?.groq || renderAiStatus?.gemini) ? (
                  <p className="mt-2 text-[11px] text-emerald-700 font-medium flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    As chaves configuradas no Render estão ativas! Você pode usar a IA e testar sem precisar digitar nada no navegador.
                  </p>
                ) : (
                  <p className="mt-2 text-[11px] text-slate-500">
                    Dica: No dashboard do Render, defina <code className="text-indigo-600 font-mono">GROQ_API_KEY</code> e/ou <code className="text-indigo-600 font-mono">GEMINI_API_KEY</code> em Environment Variables.
                  </p>
                )}
              </div>

              {/* Seletor de Provedor */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">
                  Selecione o Provedor de IA
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Google Gemini (PRIORIDADE #1) */}
                  <div
                    onClick={() => handleProviderChange("GEMINI")}
                    className={`cursor-pointer rounded-xl border-2 p-3 transition-all ${
                      aiProvider === "GEMINI"
                        ? "border-blue-600 bg-blue-50/70 shadow-sm ring-1 ring-blue-500/20"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-blue-600" />
                        <span className="text-sm font-bold text-slate-900">Google Gemini</span>
                      </div>
                      {aiProvider === "GEMINI" ? (
                        <Badge className="bg-blue-600 text-white text-[10px] px-1.5 py-0 h-4">
                          Ativo ⭐
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-blue-700 border-blue-300 text-[9px] px-1 py-0 h-4">
                          Prioritário
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Motor principal oficial com <strong>Gemini 3.8 Flash</strong>. Alta capacidade analítica e raciocínio para calibragem e laboratório.
                    </p>
                  </div>

                  {/* Groq */}
                  <div
                    onClick={() => handleProviderChange("GROQ")}
                    className={`cursor-pointer rounded-xl border-2 p-3 transition-all ${
                      aiProvider === "GROQ"
                        ? "border-brand-600 bg-brand-50/70 shadow-sm ring-1 ring-brand-500/20"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <Zap className="w-4 h-4 text-amber-500" />
                        <span className="text-sm font-bold text-slate-900">Groq Cloud</span>
                      </div>
                      {aiProvider === "GROQ" && (
                        <Badge className="bg-brand-600 text-white text-[10px] px-1.5 py-0 h-4">
                          Ativo
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Aceleração LPU ultra-rápida (&lt; 0.5s) com modelos ativos: <strong>OpenAI GPT-OSS 120B/20B</strong> e <strong>Qwen 3.8</strong>.
                    </p>
                  </div>
                </div>
              </div>

              {/* Chave de API */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-slate-500" />
                    Chave de API ({aiProvider === "GROQ" ? "Groq" : "Google AI Studio"})
                  </label>
                  <a
                    href={
                      aiProvider === "GROQ"
                        ? "https://console.groq.com/keys"
                        : "https://aistudio.google.com/app/apikey"
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-brand-600 hover:text-brand-700 font-medium inline-flex items-center gap-1 hover:underline"
                  >
                    Obter chave gratuita <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="relative">
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={aiApiKey}
                    onChange={(e) => setAiApiKey(e.target.value)}
                    placeholder={
                      aiProvider === "GROQ" && renderAiStatus?.groq
                        ? `Chave ativa via Render (${renderAiStatus.groqMasked})`
                        : aiProvider === "GEMINI" && renderAiStatus?.gemini
                        ? `Chave ativa via Render (${renderAiStatus.geminiMasked})`
                        : aiProvider === "GROQ"
                        ? "gsk_... (ou deixe em branco para usar do Render)"
                        : "AIzaSy... (ou deixe em branco para usar do Render)"
                    }
                    className="w-full pl-3.5 pr-24 py-2 text-xs rounded-lg border border-slate-200 font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <div className="absolute right-1 top-1 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="p-1.5 text-slate-400 hover:text-slate-600 rounded text-xs"
                      title={showApiKey ? "Ocultar Chave" : "Mostrar Chave"}
                    >
                      {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={isTestingAi || (!aiApiKey.trim() && !hasKeyFromRender)}
                      onClick={handleTestAi}
                      className="h-7 text-[11px] px-2.5 font-semibold gap-1"
                    >
                      {isTestingAi ? (
                        <>
                          <RefreshCcw className="w-3 h-3 animate-spin" />
                          Testando...
                        </>
                      ) : (
                        <>
                          <Check className="w-3 h-3" />
                          Testar
                        </>
                      )}
                    </Button>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  {hasKeyFromRender && !aiApiKey.trim()
                    ? "✅ A chave está ativa nas Variáveis de Ambiente do Render! Não é necessário digitar nada aqui."
                    : "Sua chave é armazenada com segurança e utilizada exclusivamente nas requisições do sistema."}
                </p>
              </div>

              {/* Modelo de IA */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Modelo Selecionado
                </label>
                <input
                  type="text"
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className="text-[10px] text-slate-400 self-center mr-1">Sugestões:</span>
                  {aiProvider === "GROQ" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setAiModel("openai/gpt-oss-120b")}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 hover:bg-brand-50 hover:text-brand-700 text-slate-600 font-mono transition-colors font-medium"
                      >
                        openai/gpt-oss-120b (Padrão Ativo ⭐)
                      </button>
                      <button
                        type="button"
                        onClick={() => setAiModel("qwen/qwen3.8-27b")}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 hover:bg-brand-50 hover:text-brand-700 text-slate-600 font-mono transition-colors font-medium"
                      >
                        qwen/qwen3.8-27b (Qwen 3.8 Ativo)
                      </button>
                      <button
                        type="button"
                        onClick={() => setAiModel("openai/gpt-oss-20b")}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 hover:bg-brand-50 hover:text-brand-700 text-slate-600 font-mono transition-colors font-medium"
                      >
                        openai/gpt-oss-20b (Ultra Rápido Ativo)
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setAiModel("gemini-3.8-flash")}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 hover:bg-blue-100 hover:text-blue-800 text-blue-700 font-mono font-semibold transition-colors"
                      >
                        gemini-3.8-flash (Modelo Oficial 3.8 ⭐)
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Status do Teste de Conexão com Diagnóstico Detalhado */}
              {testResult && (
                <div
                  className={`p-4 rounded-xl border text-xs transition-all space-y-3 ${
                    testResult.success
                      ? "bg-emerald-50/90 border-emerald-300 text-emerald-900"
                      : "bg-rose-50/90 border-rose-300 text-rose-900"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {testResult.success ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                      )}
                      <div>
                        <span className="font-bold text-sm block">
                          {testResult.success
                            ? "Conexão Estabelecida com Sucesso!"
                            : "Aviso / Falha na Conexão com a IA"}
                        </span>
                        <span className="text-xs text-slate-700">{testResult.message}</span>
                      </div>
                    </div>
                    {testResult.latency !== undefined && (
                      <Badge
                        variant="outline"
                        className={`font-mono text-[10px] shrink-0 ${
                          testResult.success
                            ? "bg-white border-emerald-300 text-emerald-700"
                            : "bg-white border-rose-300 text-rose-700"
                        }`}
                      >
                        ⚡ {testResult.latency}ms
                      </Badge>
                    )}
                  </div>

                  {/* Relatório Técnico de Diagnóstico e Botão de Cópia */}
                  {testResult.details?.diagnosticReport && (
                    <div className="pt-2 border-t border-slate-200/60">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-semibold text-[11px] text-slate-700 flex items-center gap-1">
                          <Info className="w-3.5 h-3.5 text-slate-500" />
                          Relatório Técnico de Diagnóstico (Pronto para copiar):
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={handleCopyDiagnostic}
                          className="h-7 text-[11px] px-2.5 font-semibold gap-1.5 bg-white hover:bg-slate-50 border-slate-300 text-slate-700 shadow-xs cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          Copiar Diagnóstico
                        </Button>
                      </div>
                      <pre className="bg-slate-950 text-slate-100 p-3 rounded-lg font-mono text-[11px] overflow-x-auto whitespace-pre-wrap select-all leading-relaxed border border-slate-800">
                        {testResult.details.diagnosticReport}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* Fallback Info */}
              <div className="p-3 rounded-lg bg-amber-50/70 border border-amber-200/80 text-[11px] text-amber-900 flex items-start gap-2">
                <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <strong>Modo Inteligente sem Chave de API:</strong> Se você ainda não cadastrou a chave, não se preocupe! O Copiloto OdontoPrint continuará respondendo perguntas sobre os pacientes, pedidos, impressoras e resinas com base no banco de dados ativo do laboratório.
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Action Bar */}
          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              size="lg"
              disabled={isSaving}
              className="gap-2 font-bold px-8"
            >
              <Save className="w-4 h-4" />
              {isSaving ? "Salvando Parâmetros..." : "Salvar Configurações"}
            </Button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
