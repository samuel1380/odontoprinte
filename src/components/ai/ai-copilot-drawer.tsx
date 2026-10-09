"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { AIChatMessage } from "@/types/ai.types";
import { AIService } from "@/services/ai-service";
import {
  Sparkles,
  X,
  Send,
  Bot,
  User,
  Settings,
  RefreshCw,
  Search,
  Printer,
  ListOrdered,
  FlaskConical,
  Zap,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export function AICopilotDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<AIChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Olá! Sou a **OdontoIA**, sua copiloto técnica do laboratório OdontoPrint. 🦷✨\n\nVocê pode me perguntar coisas como:\n- *\"O modelo da Vanessa já foi enviado?\"*\n- *\"Quais impressoras estão liberadas hoje?\"*\n- *\"Quantos modelos temos na fila de espera?\"*\n- *\"Qual a recomendação de calibração para a resina PriZma?\"*",
      timestamp: new Date().toISOString(),
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [aiProvider, setAiProvider] = useState<"GEMINI" | "GROQ">("GEMINI");
  const [isRenderKey, setIsRenderKey] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const syncConfig = async () => {
    const config = AIService.getConfig();
    const currentProvider = (config.provider || "GEMINI") as "GEMINI" | "GROQ";
    setAiProvider(currentProvider);

    try {
      const envStatus = await AIService.getEnvStatus();
      const hasKeyInRender =
        (currentProvider === "GEMINI" && envStatus.gemini) ||
        (currentProvider === "GROQ" && envStatus.groq);
      setIsRenderKey(Boolean(hasKeyInRender));
    } catch {
      setIsRenderKey(false);
    }
  };

  useEffect(() => {
    syncConfig();

    const handleConfigChange = () => {
      syncConfig();
    };

    window.addEventListener("odontoprint_ai_config_changed", handleConfigChange);
    window.addEventListener("storage", handleConfigChange);

    return () => {
      window.removeEventListener("odontoprint_ai_config_changed", handleConfigChange);
      window.removeEventListener("storage", handleConfigChange);
    };
  }, [isOpen]);

  const handleToggleProvider = (targetProvider: "GEMINI" | "GROQ") => {
    const currentConfig = AIService.getConfig();
    const targetModel = targetProvider === "GEMINI" ? "gemini-3.8-flash" : "openai/gpt-oss-120b";
    const updated = {
      ...currentConfig,
      provider: targetProvider,
      model: targetModel,
    };
    AIService.saveConfig(updated);
    setAiProvider(targetProvider);
    toast.success(`Copiloto alternado para ${targetProvider === "GEMINI" ? "Google Gemini 3.8" : "Groq Cloud"}`);
  };

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  const handleSend = async (textToSend?: string) => {
    const query = (textToSend || inputText).trim();
    if (!query || isSending) return;

    const userMsg: AIChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: query,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText("");
    setIsSending(true);

    try {
      const replyText = await AIService.sendMessage(query, messages);
      const assistantMsg: AIChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: replyText,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const errDetails = err?.message || "Tente novamente mais tarde.";
      const targetName = aiProvider === "GROQ" ? "Groq (GROQ_API_KEY)" : "Google Gemini 3.8 (GEMINI_API_KEY)";
      const errorMsg: AIChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `⚠️ Ocorreu uma instabilidade na consulta da OdontoIA (${aiProvider}):\n\n${errDetails}\n\n💡 Dica: Verifique se sua chave do ${targetName} está configurada em [Configurações](/admin/configuracoes) ou no Render.`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsSending(false);
    }
  };

  const handleQuickQuestion = (q: string) => {
    handleSend(q);
  };

  return (
    <>
      {/* Botão Flutuante Global */}
      <div className="fixed bottom-4 right-4 sm:bottom-5 sm:right-5 z-40 flex items-center gap-2">
        {!isOpen && (
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/95 border border-brand-200 text-xs font-semibold text-brand-700 shadow-md backdrop-blur-md animate-in fade-in slide-in-from-right-3">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500"></span>
            </span>
            <span>OdontoIA Copilot</span>
          </div>
        )}

        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex h-12 w-12 sm:h-13 sm:w-13 items-center justify-center rounded-2xl bg-gradient-to-tr from-brand-600 via-brand-500 to-cyan-500 text-white shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-200 border-2 border-white/60 focus:outline-hidden"
          title="Abrir OdontoIA Copilot"
          aria-label="Abrir assistente virtual OdontoIA"
        >
          {isOpen ? <X className="h-5 w-5 sm:h-6 sm:w-6" /> : <Sparkles className="h-5 w-5 sm:h-6 sm:w-6" />}
        </button>
      </div>

      {/* Painel do Chat (Drawer Deslizante) */}
      {isOpen && (
        <>
          {/* Backdrop para mobile */}
          <div
            className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-xs sm:hidden"
            onClick={() => setIsOpen(false)}
          />

          <div className="fixed bottom-18 sm:bottom-20 right-3 sm:right-6 z-50 w-[calc(100vw-24px)] sm:w-[420px] h-[min(560px,calc(100dvh-90px))] rounded-2xl sm:rounded-3xl border border-slate-200/90 bg-white shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header da IA */}
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-gradient-to-r from-slate-900 to-slate-800 text-white">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <img
                    src="/logo.jpg"
                    alt="OdontoPrint Logo"
                    className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl object-contain bg-white p-1 border border-white/20 shadow-xs shrink-0"
                  />
                  <span className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-slate-900">
                    <span className="h-1.5 w-1.5 rounded-full bg-white"></span>
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-sm tracking-tight">OdontoIA Copilot</span>
                    <Badge variant="secondary" className="bg-brand-500/20 text-brand-300 border-brand-400/30 text-[9px] py-0 px-1.5 flex items-center gap-1">
                      <span>{aiProvider}</span>
                      {isRenderKey && (
                        <span className="text-[8px] bg-emerald-500/30 text-emerald-300 px-1 py-0.2 rounded font-semibold">
                          Render
                        </span>
                      )}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    <button
                      type="button"
                      onClick={() => handleToggleProvider("GEMINI")}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition ${
                        aiProvider === "GEMINI"
                          ? "bg-brand-600 text-white shadow-xs"
                          : "text-slate-400 hover:text-white bg-slate-800/80"
                      }`}
                      title="Usar Google Gemini 3.8 Flash"
                    >
                      ✨ Gemini 3.8
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleProvider("GROQ")}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition ${
                        aiProvider === "GROQ"
                          ? "bg-amber-600 text-white shadow-xs"
                          : "text-slate-400 hover:text-white bg-slate-800/80"
                      }`}
                      title="Usar Groq Cloud"
                    >
                      ⚡ Groq
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <Link
                  href="/admin/configuracoes"
                  onClick={() => setIsOpen(false)}
                  className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                  title="Configurar Chaves da IA (Gemini / Groq)"
                >
                  <Settings className="w-4 h-4" />
                </Link>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                  aria-label="Fechar assistente"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Sugestões Rápidas de 1 Clique */}
            <div className="p-2.5 bg-slate-50 border-b border-slate-100 flex gap-1.5 overflow-x-auto text-[11px] no-scrollbar">
              <button
                type="button"
                onClick={() => handleQuickQuestion("Quais impressoras estão liberadas hoje?")}
                className="whitespace-nowrap px-2.5 py-1 rounded-full bg-white border border-slate-200 text-slate-700 hover:border-brand-500 hover:text-brand-700 transition shrink-0"
              >
                🖨️ Impressoras liberadas
              </button>
              <button
                type="button"
                onClick={() => handleQuickQuestion("Quantos modelos estão aguardando na fila 3D?")}
                className="whitespace-nowrap px-2.5 py-1 rounded-full bg-white border border-slate-200 text-slate-700 hover:border-brand-500 hover:text-brand-700 transition shrink-0"
              >
                📋 Fila 3D atual
              </button>
              <button
                type="button"
                onClick={() => handleQuickQuestion("Qual o tempo de calibração recomendado para resina de modelo?")}
                className="whitespace-nowrap px-2.5 py-1 rounded-full bg-white border border-slate-200 text-slate-700 hover:border-brand-500 hover:text-brand-700 transition shrink-0"
              >
                🧪 Calibrar resina
              </button>
            </div>

            {/* Área de Mensagens */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3.5 text-xs bg-slate-50/30">
              {messages.map((m) => {
                const isAssistant = m.role === "assistant";

                return (
                  <div
                    key={m.id}
                    className={`flex items-start gap-2.5 ${
                      isAssistant ? "justify-start" : "justify-end"
                    }`}
                  >
                    {isAssistant && (
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500 text-white shadow-2xs shrink-0 mt-0.5">
                        <Bot className="h-4 w-4" />
                      </div>
                    )}

                    <div
                      className={`group relative max-w-[85%] rounded-2xl p-3 leading-relaxed whitespace-pre-wrap ${
                        isAssistant
                          ? "bg-white text-slate-800 border border-slate-200/80 shadow-2xs"
                          : "bg-brand-600 text-white font-medium shadow-xs"
                      }`}
                    >
                      {m.content}
                      {isAssistant && m.id !== "welcome" && (
                        <div className="mt-2 pt-1 border-t border-slate-100 flex justify-end">
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(m.content);
                              toast.success("Mensagem copiada para a área de transferência!");
                            }}
                            className="text-[10px] text-slate-400 hover:text-slate-700 font-medium inline-flex items-center gap-1 transition"
                            title="Copiar mensagem ou diagnóstico"
                          >
                            <Copy className="w-3 h-3" />
                            <span>Copiar texto</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {!isAssistant && (
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-200 text-slate-700 shrink-0 mt-0.5">
                        <User className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                );
              })}

              {isSending && (
                <div className="flex items-center gap-2 text-xs text-slate-400 p-2 bg-white rounded-xl border border-slate-200/60 w-fit">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-brand-500" />
                  <span>OdontoIA consultando o laboratório...</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input e Envio */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="p-3 border-t border-slate-100 bg-white flex items-center gap-2"
            >
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Pergunte sobre um paciente ou resina..."
                className="flex-1 px-3.5 py-2 text-xs rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-brand-500 bg-slate-50/50"
              />
              <Button
                type="submit"
                disabled={!inputText.trim() || isSending}
                size="sm"
                className="h-9 w-9 p-0 rounded-xl bg-brand-600 hover:bg-brand-700 shrink-0"
              >
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </div>
        </>
      )}
    </>
  );
}
