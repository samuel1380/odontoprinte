"use client";

import React, { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/shell";
import { OdontoPrintService } from "@/services/odontoprint-service";
import { AIService } from "@/services/ai-service";
import { AIProvider } from "@/types/ai.types";
import { SystemSettings } from "@/types/database.types";
import {
  RefreshCcw,
  Sliders,
  CheckCircle2,
  Sparkles,
  KeyRound,
  Eye,
  EyeOff,
  AlertTriangle,
  ExternalLink,
  Copy,
  Database,
  Save,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  // Form State - Banco de Dados Supabase (Sincronização em Nuvem)
  const [dbStatus, setDbStatus] = useState<{
    tested: boolean;
    configured: boolean;
    connected: boolean;
    url?: string;
    error?: string;
  } | null>(null);
  const [isTestingDb, setIsTestingDb] = useState(false);

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

        const aiCfg = AIService.getConfig();
        const hasSavedConfig = typeof window !== "undefined" && Boolean(localStorage.getItem("odontoprint_ai_config"));

        if (hasSavedConfig) {
          setAiProvider(aiCfg.provider || "GEMINI");
          setAiModel(
            aiCfg.model ||
              (aiCfg.provider === "GROQ"
                ? "openai/gpt-oss-120b"
                : "gemini-3.8-flash")
          );
        } else if (envStatus.preferredProvider) {
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
    AIService.saveConfig({
      provider: newProvider,
      apiKey: aiApiKey.trim(),
      model: newModel,
      enabled: aiEnabled,
    });
  };

  const hasKeyFromRender =
    (aiProvider === "GEMINI" && Boolean(renderAiStatus?.gemini)) ||
    (aiProvider === "GROQ" && Boolean(renderAiStatus?.groq));

  const handleTestAi = async () => {
    if (!aiApiKey.trim() && !hasKeyFromRender) {
      toast.warning("Digite uma Chave de API ou configure no servidor antes de testar.");
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
      const msg = err instanceof Error ? err.message : "Erro de conexão";
      setTestResult({ success: false, message: msg });
      toast.error("Falha ao comunicar com o provedor de IA.");
    } finally {
      setIsTestingAi(false);
    }
  };

  const handleTestDatabase = async () => {
    setIsTestingDb(true);
    try {
      const res = await OdontoPrintService.testDatabaseConnection();
      setDbStatus({
        tested: true,
        configured: res.configured,
        connected: res.connected,
        url: res.url,
        error: res.error,
      });
      if (res.connected) {
        toast.success("Banco de Dados Supabase conectado!");
      } else {
        toast.error(`Falha no Supabase: ${res.error || "Verifique permissões."}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      setDbStatus({
        tested: true,
        configured: false,
        connected: false,
        error: msg,
      });
      toast.error("Erro ao testar comunicação com o banco.");
    } finally {
      setIsTestingDb(false);
    }
  };

  const handleCopyUnlockSql = () => {
    const sql = `-- SCRIPT DE LIBERAÇÃO TOTAL DO SUPABASE (ODONTOPRINT)
ALTER TABLE IF EXISTS public.printers DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.printer_maintenances DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.resin_batches DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.resin_calibrations DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cases DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.case_status_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.print_jobs DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.print_job_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.print_runs DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.print_run_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.system_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.profiles DISABLE ROW LEVEL SECURITY;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;`;
    navigator.clipboard.writeText(sql);
    toast.success("Script SQL copiado com sucesso!");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hexagonMin >= hexagonMax) {
      toast.error("O hexágono mínimo deve ser menor que o máximo.");
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

      AIService.saveConfig({
        provider: aiProvider,
        apiKey: aiApiKey.trim(),
        model: aiModel.trim(),
        enabled: aiEnabled,
      });

      toast.success("Configurações atualizadas!");
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
    toast.info("Valores padrão restaurados.");
  };

  if (isLoading) {
    return (
      <AppShell>
        <div className="max-w-3xl mx-auto space-y-6">
          <Skeleton className="h-10 w-64 rounded-full" />
          <Skeleton className="h-96 w-full rounded-3xl" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Configurações
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Parâmetros operacionais, banco de dados e inteligência artificial
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleResetDefaults}
            className="rounded-full gap-1.5 text-xs w-full sm:w-auto border-slate-700 bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-800"
          >
            <RefreshCcw className="w-3.5 h-3.5" />
            Restaurar Padrões
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Card 1: Manutenção */}
          <Card className="rounded-2xl sm:rounded-3xl border border-slate-800 bg-[#0F172A] shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-cyan-400" />
                Prazo de Manutenção Preventiva
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-w-xs">
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Intervalo Máximo (Dias)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={60}
                    required
                    value={maintenanceDays}
                    onChange={(e) => setMaintenanceDays(Number(e.target.value))}
                    className="w-full px-3.5 py-2 text-sm rounded-full border border-slate-800 bg-[#0B0F19] font-semibold text-white focus:outline-none focus:border-cyan-500"
                  />
                  <span className="text-xs text-slate-400 font-medium shrink-0">dias</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Tolerância de Calibração */}
          <Card className="rounded-2xl sm:rounded-3xl border border-slate-800 bg-[#0F172A] shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-cyan-400" />
                Tolerância do Hexágono de Calibração
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Mínimo (mm)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={hexagonMin}
                    onChange={(e) => setHexagonMin(Number(e.target.value))}
                    className="w-full px-3.5 py-2 text-sm rounded-full border border-slate-800 bg-[#0B0F19] font-mono font-semibold text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Máximo (mm)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={hexagonMax}
                    onChange={(e) => setHexagonMax(Number(e.target.value))}
                    className="w-full px-3.5 py-2 text-sm rounded-full border border-slate-800 bg-[#0B0F19] font-mono font-semibold text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 3: Nomenclatura */}
          <Card className="rounded-2xl sm:rounded-3xl border border-slate-800 bg-[#0F172A] shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-cyan-400" />
                Prefixos de Identificação
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Prefixo Normal
                  </label>
                  <input
                    type="text"
                    required
                    value={normalPrefix}
                    onChange={(e) => setNormalPrefix(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm rounded-full border border-slate-800 bg-[#0B0F19] font-mono font-semibold text-white focus:outline-none focus:border-cyan-500 uppercase"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Prefixo Reimpressão
                  </label>
                  <input
                    type="text"
                    required
                    value={retryPrefix}
                    onChange={(e) => setRetryPrefix(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm rounded-full border border-slate-800 bg-[#0B0F19] font-mono font-semibold text-rose-400 focus:outline-none focus:border-rose-500 uppercase"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 4: Status do Banco de Dados & Sincronização em Nuvem (Supabase) */}
          <Card className="rounded-2xl sm:rounded-3xl border border-slate-800 bg-[#0F172A] shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <CardTitle className="text-base flex items-center gap-2 text-white">
                  <Database className="w-4 h-4 text-cyan-400" />
                  Banco de Dados & Nuvem (Supabase)
                </CardTitle>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleTestDatabase}
                  disabled={isTestingDb}
                  className="rounded-full h-8 text-xs font-medium gap-1.5 border-slate-700 bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-800"
                >
                  <RefreshCcw className={`w-3.5 h-3.5 ${isTestingDb ? "animate-spin" : ""}`} />
                  {isTestingDb ? "Testando..." : "Testar Conexão"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-1 text-xs">
              {dbStatus ? (
                <div
                  className={`p-3.5 rounded-2xl border ${
                    dbStatus.connected
                      ? "bg-emerald-950/20 border-emerald-500/40 text-emerald-300"
                      : "bg-rose-950/20 border-rose-500/40 text-rose-300"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {dbStatus.connected ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                      )}
                      <span className="font-semibold text-xs">
                        {dbStatus.connected
                          ? "Supabase conectado e sincronizado"
                          : `Falha na conexão: ${dbStatus.error || "Verifique permissões"}`}
                      </span>
                    </div>
                    {!dbStatus.connected && (
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={handleCopyUnlockSql}
                        className="rounded-full h-7 text-xs gap-1"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Copiar SQL
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-2xl bg-[#0B0F19] border border-slate-800 flex items-center justify-between">
                  <span className="text-slate-400">Clique em testar para validar o Supabase</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={handleTestDatabase}
                    disabled={isTestingDb}
                    className="rounded-full bg-white text-slate-950 hover:bg-slate-200 h-7 text-xs font-bold"
                  >
                    Testar
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Card 5: Inteligência Artificial (Gemini / Groq) */}
          <Card className="rounded-2xl sm:rounded-3xl border border-slate-800 bg-[#0F172A] shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2 text-white">
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                  Inteligência Artificial
                </CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Ativo:</span>
                  <button
                    type="button"
                    onClick={() => setAiEnabled(!aiEnabled)}
                    className={`w-10 h-5 flex items-center rounded-full p-0.5 transition-colors duration-200 ${
                      aiEnabled ? "bg-cyan-500" : "bg-slate-800 border border-slate-700"
                    }`}
                  >
                    <div
                      className={`bg-white w-4 h-4 rounded-full shadow-sm transform transition-transform duration-200 ${
                        aiEnabled ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-1">
              {/* Segmented Controls for Provider */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Provedor
                </label>
                <div className="inline-flex p-1 bg-[#0B0F19] rounded-full border border-slate-800">
                  <button
                    type="button"
                    onClick={() => handleProviderChange("GEMINI")}
                    className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                      aiProvider === "GEMINI"
                        ? "bg-white text-slate-950 shadow-xs font-bold"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Google Gemini 3.8
                  </button>
                  <button
                    type="button"
                    onClick={() => handleProviderChange("GROQ")}
                    className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                      aiProvider === "GROQ"
                        ? "bg-white text-slate-950 shadow-xs font-bold"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Groq Cloud
                  </button>
                </div>
              </div>

              {/* Chave de API */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                    Chave de API
                  </label>
                  <a
                    href={
                      aiProvider === "GROQ"
                        ? "https://console.groq.com/keys"
                        : "https://aistudio.google.com/app/apikey"
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-cyan-400 font-medium inline-flex items-center gap-1 hover:underline"
                  >
                    Obter chave <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="relative">
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={aiApiKey}
                    onChange={(e) => setAiApiKey(e.target.value)}
                    placeholder={
                      hasKeyFromRender
                        ? "Chave ativa no servidor"
                        : aiProvider === "GROQ"
                        ? "gsk_..."
                        : "AIzaSy..."
                    }
                    className="w-full pl-3.5 pr-24 py-2 text-xs rounded-full border border-slate-800 bg-[#0B0F19] font-mono text-white focus:outline-none focus:border-cyan-500"
                  />
                  <div className="absolute right-1.5 top-1 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="p-1.5 text-slate-400 hover:text-white rounded-full text-xs"
                    >
                      {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={isTestingAi || (!aiApiKey.trim() && !hasKeyFromRender)}
                      onClick={handleTestAi}
                      className="h-7 text-[11px] px-3 rounded-full font-semibold bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-200"
                    >
                      {isTestingAi ? (
                        <RefreshCcw className="w-3 h-3 animate-spin" />
                      ) : (
                        "Testar"
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Modelo de IA */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Modelo
                </label>
                <input
                  type="text"
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-full border border-slate-800 bg-[#0B0F19] font-mono text-white focus:outline-none focus:border-cyan-500"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {aiProvider === "GROQ" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setAiModel("openai/gpt-oss-120b")}
                        className="text-[11px] px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-slate-300 font-mono font-medium hover:text-white hover:bg-slate-800 transition-colors"
                      >
                        openai/gpt-oss-120b
                      </button>
                      <button
                        type="button"
                        onClick={() => setAiModel("qwen/qwen3.8-27b")}
                        className="text-[11px] px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-slate-300 font-mono font-medium hover:text-white hover:bg-slate-800 transition-colors"
                      >
                        qwen/qwen3.8-27b
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAiModel("gemini-3.8-flash")}
                      className="text-[11px] px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-slate-300 font-mono font-medium hover:text-white hover:bg-slate-800 transition-colors"
                    >
                      gemini-3.8-flash
                    </button>
                  )}
                </div>
              </div>

              {/* Status do Teste de Conexão */}
              {testResult && (
                <div
                  className={`p-3.5 rounded-2xl border text-xs flex items-center justify-between ${
                    testResult.success
                      ? "bg-emerald-950/20 border-emerald-500/40 text-emerald-300"
                      : "bg-rose-950/20 border-rose-500/40 text-rose-300"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {testResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    <span className="font-semibold">{testResult.message}</span>
                  </div>
                  {testResult.latency !== undefined && (
                    <Badge variant="outline" className="rounded-full bg-slate-900 border-slate-700 text-slate-300 text-xs">
                      {testResult.latency}ms
                    </Badge>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Action Bar */}
          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              size="lg"
              disabled={isSaving}
              className="rounded-full bg-white text-slate-950 hover:bg-slate-200 font-bold px-8 h-11"
            >
              <Save className="w-4 h-4 mr-2" />
              {isSaving ? "Salvando..." : "Salvar Configurações"}
            </Button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
