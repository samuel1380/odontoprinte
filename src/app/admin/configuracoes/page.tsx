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

  // Form State - Inteligência Artificial (Groq / Gemini / OpenAI / Mistral / Compatível)
  const [aiProvider, setAiProvider] = useState<AIProvider>("GROQ");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiCustomEndpoint, setAiCustomEndpoint] = useState("");
  const [aiModel, setAiModel] = useState("llama-3.3-70b-versatile");
  const [aiEnabled, setAiEnabled] = useState(true);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isTestingAi, setIsTestingAi] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    latency?: number;
  } | null>(null);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const s = await OdontoPrintService.getSettings();
        setSettings(s);
        setMaintenanceDays(s.maintenance_interval_days);
        setHexagonMin(s.calibration_hexagon_min);
        setHexagonMax(s.calibration_hexagon_max);
        setNormalPrefix(s.normal_print_prefix);
        setRetryPrefix(s.retry_print_prefix);

        // Carrega configurações de IA salvas
        const aiCfg = AIService.getConfig();
        setAiProvider(aiCfg.provider);
        setAiApiKey(aiCfg.apiKey || "");
        setAiCustomEndpoint(aiCfg.customEndpoint || "");
        setAiModel(aiCfg.model || "llama-3.3-70b-versatile");
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
    if (newProvider === "GROQ") {
      setAiModel("llama-3.3-70b-versatile");
    } else if (newProvider === "GEMINI") {
      setAiModel("gemini-2.0-flash");
    } else if (newProvider === "OPENAI") {
      setAiModel("gpt-4o-mini");
    } else if (newProvider === "MISTRAL") {
      setAiModel("mistral-large-latest");
    } else {
      setAiModel("llama3");
    }
  };

  const handleTestAi = async () => {
    if (!aiApiKey.trim() && aiProvider !== "OPENAI_COMPATIBLE") {
      toast.warning("Por favor, digite ou cole uma Chave de API antes de testar.");
      return;
    }

    setIsTestingAi(true);
    setTestResult(null);
    try {
      const res = await AIService.testConnection({
        provider: aiProvider,
        apiKey: aiApiKey.trim(),
        model: aiModel.trim(),
        customEndpoint: aiCustomEndpoint.trim(),
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
        customEndpoint: aiCustomEndpoint.trim(),
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

          {/* Card 4: Inteligência Artificial (Groq / Mistral) */}
          <Card className="border-indigo-200/80 bg-gradient-to-br from-white via-indigo-50/20 to-brand-50/20 shadow-sm">
            <CardHeader className="pb-3 border-b border-indigo-100/60">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2 text-slate-900">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-600 to-brand-600 flex items-center justify-center text-white shadow-sm">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  4. Inteligência Artificial do Laboratório (Groq & Mistral)
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
              {/* Seletor de Provedor */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">
                  Selecione o Provedor de IA
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
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
                      Respostas instantâneas (&lt; 0.5s). Modelo <strong>Llama 3.3 70B</strong>.
                    </p>
                  </div>

                  {/* Google Gemini */}
                  <div
                    onClick={() => handleProviderChange("GEMINI")}
                    className={`cursor-pointer rounded-xl border-2 p-3 transition-all ${
                      aiProvider === "GEMINI"
                        ? "border-brand-600 bg-brand-50/70 shadow-sm ring-1 ring-brand-500/20"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-blue-500" />
                        <span className="text-sm font-bold text-slate-900">Google Gemini</span>
                      </div>
                      {aiProvider === "GEMINI" && (
                        <Badge className="bg-brand-600 text-white text-[10px] px-1.5 py-0 h-4">
                          Ativo
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Precisão clínica avançada e cota gratuita com <strong>Gemini 2.0 Flash</strong>.
                    </p>
                  </div>

                  {/* OpenAI */}
                  <div
                    onClick={() => handleProviderChange("OPENAI")}
                    className={`cursor-pointer rounded-xl border-2 p-3 transition-all ${
                      aiProvider === "OPENAI"
                        ? "border-brand-600 bg-brand-50/70 shadow-sm ring-1 ring-brand-500/20"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <Bot className="w-4 h-4 text-emerald-600" />
                        <span className="text-sm font-bold text-slate-900">OpenAI</span>
                      </div>
                      {aiProvider === "OPENAI" && (
                        <Badge className="bg-brand-600 text-white text-[10px] px-1.5 py-0 h-4">
                          Ativo
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Raciocínio padrão ouro com <strong>GPT-4o-mini</strong> e <strong>GPT-4o</strong>.
                    </p>
                  </div>

                  {/* Mistral */}
                  <div
                    onClick={() => handleProviderChange("MISTRAL")}
                    className={`cursor-pointer rounded-xl border-2 p-3 transition-all ${
                      aiProvider === "MISTRAL"
                        ? "border-brand-600 bg-brand-50/70 shadow-sm ring-1 ring-brand-500/20"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <Bot className="w-4 h-4 text-indigo-500" />
                        <span className="text-sm font-bold text-slate-900">Mistral AI</span>
                      </div>
                      {aiProvider === "MISTRAL" && (
                        <Badge className="bg-brand-600 text-white text-[10px] px-1.5 py-0 h-4">
                          Ativo
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Especializado e consistente com <strong>Mistral Large</strong>.
                    </p>
                  </div>

                  {/* OpenAI Compatible / Local */}
                  <div
                    onClick={() => handleProviderChange("OPENAI_COMPATIBLE")}
                    className={`cursor-pointer rounded-xl border-2 p-3 transition-all ${
                      aiProvider === "OPENAI_COMPATIBLE"
                        ? "border-brand-600 bg-brand-50/70 shadow-sm ring-1 ring-brand-500/20"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <Sliders className="w-4 h-4 text-purple-500" />
                        <span className="text-sm font-bold text-slate-900">Local / Ollama</span>
                      </div>
                      {aiProvider === "OPENAI_COMPATIBLE" && (
                        <Badge className="bg-brand-600 text-white text-[10px] px-1.5 py-0 h-4">
                          Ativo
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Servidor local ou compatível (Ollama, LM Studio, OpenRouter).
                    </p>
                  </div>
                </div>
              </div>

              {/* Endpoint Customizado para Servidores Locais / Compatíveis */}
              {aiProvider === "OPENAI_COMPATIBLE" && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Endpoint da API (Base URL)
                  </label>
                  <input
                    type="text"
                    value={aiCustomEndpoint}
                    onChange={(e) => setAiCustomEndpoint(e.target.value)}
                    placeholder="http://localhost:11434/v1 ou https://openrouter.ai/api/v1"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Insira a URL base do servidor (ex: <code className="font-mono">http://localhost:11434/v1</code> para Ollama ou <code className="font-mono">https://openrouter.ai/api/v1</code>).
                  </p>
                </div>
              )}

              {/* Chave de API */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-slate-500" />
                    Chave de API (
                    {aiProvider === "GROQ"
                      ? "Groq"
                      : aiProvider === "GEMINI"
                      ? "Google AI Studio"
                      : aiProvider === "OPENAI"
                      ? "OpenAI"
                      : aiProvider === "MISTRAL"
                      ? "Mistral AI"
                      : "Opcional / OpenRouter"}
                    )
                  </label>
                  <a
                    href={
                      aiProvider === "GROQ"
                        ? "https://console.groq.com/keys"
                        : aiProvider === "GEMINI"
                        ? "https://aistudio.google.com/app/apikey"
                        : aiProvider === "OPENAI"
                        ? "https://platform.openai.com/api-keys"
                        : aiProvider === "MISTRAL"
                        ? "https://console.mistral.ai/api-keys/"
                        : "https://openrouter.ai/keys"
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
                      aiProvider === "GROQ"
                        ? "gsk_..."
                        : aiProvider === "GEMINI"
                        ? "AIzaSy..."
                        : aiProvider === "OPENAI"
                        ? "sk-..."
                        : aiProvider === "MISTRAL"
                        ? "mistral_..."
                        : "(Deixe vazio para Ollama local ou insira sk-or-...)"
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
                      disabled={isTestingAi || (!aiApiKey.trim() && aiProvider !== "OPENAI_COMPATIBLE")}
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
                <p className="text-[11px] text-slate-400 mt-1">
                  Sua chave é armazenada com segurança localmente e utilizada exclusivamente nas requisições do sistema.
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
                        onClick={() => setAiModel("llama-3.3-70b-versatile")}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 hover:bg-brand-50 hover:text-brand-700 text-slate-600 font-mono transition-colors"
                      >
                        llama-3.3-70b-versatile (Recomendado)
                      </button>
                      <button
                        type="button"
                        onClick={() => setAiModel("llama-3.1-8b-instant")}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 hover:bg-brand-50 hover:text-brand-700 text-slate-600 font-mono transition-colors"
                      >
                        llama-3.1-8b-instant (Ultra Leve)
                      </button>
                      <button
                        type="button"
                        onClick={() => setAiModel("mixtral-8x7b-32768")}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 hover:bg-brand-50 hover:text-brand-700 text-slate-600 font-mono transition-colors"
                      >
                        mixtral-8x7b-32768
                      </button>
                    </>
                  ) : aiProvider === "GEMINI" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setAiModel("gemini-2.0-flash")}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 hover:bg-brand-50 hover:text-brand-700 text-slate-600 font-mono transition-colors"
                      >
                        gemini-2.0-flash (Recomendado)
                      </button>
                      <button
                        type="button"
                        onClick={() => setAiModel("gemini-1.5-flash")}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 hover:bg-brand-50 hover:text-brand-700 text-slate-600 font-mono transition-colors"
                      >
                        gemini-1.5-flash (Alta Estabilidade)
                      </button>
                      <button
                        type="button"
                        onClick={() => setAiModel("gemini-1.5-pro")}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 hover:bg-brand-50 hover:text-brand-700 text-slate-600 font-mono transition-colors"
                      >
                        gemini-1.5-pro (Raciocínio Profundo)
                      </button>
                    </>
                  ) : aiProvider === "OPENAI" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setAiModel("gpt-4o-mini")}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 hover:bg-brand-50 hover:text-brand-700 text-slate-600 font-mono transition-colors"
                      >
                        gpt-4o-mini (Recomendado)
                      </button>
                      <button
                        type="button"
                        onClick={() => setAiModel("gpt-4o")}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 hover:bg-brand-50 hover:text-brand-700 text-slate-600 font-mono transition-colors"
                      >
                        gpt-4o (Máxima Precisão)
                      </button>
                    </>
                  ) : aiProvider === "MISTRAL" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setAiModel("mistral-large-latest")}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 hover:bg-brand-50 hover:text-brand-700 text-slate-600 font-mono transition-colors"
                      >
                        mistral-large-latest (Recomendado)
                      </button>
                      <button
                        type="button"
                        onClick={() => setAiModel("mistral-small-latest")}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 hover:bg-brand-50 hover:text-brand-700 text-slate-600 font-mono transition-colors"
                      >
                        mistral-small-latest
                      </button>
                      <button
                        type="button"
                        onClick={() => setAiModel("codestral-latest")}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 hover:bg-brand-50 hover:text-brand-700 text-slate-600 font-mono transition-colors"
                      >
                        codestral-latest
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setAiModel("llama3")}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 hover:bg-brand-50 hover:text-brand-700 text-slate-600 font-mono transition-colors"
                      >
                        llama3 (Ollama)
                      </button>
                      <button
                        type="button"
                        onClick={() => setAiModel("deepseek-r1")}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 hover:bg-brand-50 hover:text-brand-700 text-slate-600 font-mono transition-colors"
                      >
                        deepseek-r1
                      </button>
                      <button
                        type="button"
                        onClick={() => setAiModel("qwen2.5-coder")}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 hover:bg-brand-50 hover:text-brand-700 text-slate-600 font-mono transition-colors"
                      >
                        qwen2.5-coder
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Status do Teste de Conexão */}
              {testResult && (
                <div
                  className={`p-3 rounded-lg border text-xs flex items-center justify-between transition-all ${
                    testResult.success
                      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                      : "bg-rose-50 border-rose-200 text-rose-800"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {testResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    )}
                    <span className="font-medium">{testResult.message}</span>
                  </div>
                  {testResult.latency !== undefined && (
                    <Badge variant="outline" className="font-mono text-[10px] bg-white border-emerald-300 text-emerald-700">
                      ⚡ {testResult.latency}ms
                    </Badge>
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
