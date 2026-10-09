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
        "Olá! Sou a **OdontoIA**, sua copiloto técnica do laboratório OdontoPrint.\n\nPergunte-me sobre status de modelos, impressoras liberadas ou calibração de resinas.",
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
    toast.success(`Copiloto: ${targetProvider === "GEMINI" ? "Gemini 3.8" : "Groq Cloud"}`);
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
      const errorMsg: AIChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `⚠️ Erro de conexão com ${aiProvider}:\n\n${errDetails}`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      {/* Botão Flutuante Global */}
      <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 flex items-center gap-2">
        {!isOpen && (
          <div className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#0F172A]/90 border border-slate-800 text-xs font-semibold text-slate-200 shadow-md backdrop-blur-md">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400"></span>
            </span>
            <span>OdontoIA</span>
          </div>
        )}

        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex h-12 w-12 sm:h-13 sm:w-13 items-center justify-center rounded-full bg-white text-slate-950 shadow-xl hover:bg-slate-200 hover:scale-105 active:scale-95 transition-all duration-200 border border-white/30 focus:outline-hidden"
          title="Abrir OdontoIA Copilot"
          aria-label="Abrir assistente virtual OdontoIA"
        >
          {isOpen ? <X className="h-5 w-5 sm:h-6 sm:w-6" /> : <Sparkles className="h-5 w-5 sm:h-6 sm:w-6 text-brand-600" />}
        </button>
      </div>

      {/* Painel do Chat */}
      {isOpen && (
        <>
          {/* Backdrop para mobile */}
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs sm:hidden"
            onClick={() => setIsOpen(false)}
          />

          <div className="fixed bottom-18 sm:bottom-22 right-3 sm:right-6 z-50 w-[calc(100vw-24px)] sm:w-[420px] h-[min(560px,calc(100dvh-90px))] rounded-3xl border border-slate-800 bg-[#0F172A] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 text-slate-100">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-[#0B0F19]">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="h-10 w-10 rounded-full bg-white text-slate-950 flex items-center justify-center font-bold text-sm shadow-xs">
                    <Sparkles className="h-5 w-5 text-brand-600" />
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-[#0B0F19]">
                    <span className="h-1 w-1 rounded-full bg-white"></span>
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-white tracking-tight">OdontoIA</span>
                    <Badge variant="outline" className="rounded-full border-slate-700 bg-slate-900 text-cyan-300 text-[10px] px-2 py-0">
                      {aiProvider}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    <button
                      type="button"
                      onClick={() => handleToggleProvider("GEMINI")}
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold transition-all ${
                        aiProvider === "GEMINI"
                          ? "bg-white text-slate-950"
                          : "bg-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      Gemini 3.8
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleProvider("GROQ")}
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold transition-all ${
                        aiProvider === "GROQ"
                          ? "bg-white text-slate-950"
                          : "bg-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      Groq
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <Link
                  href="/admin/configuracoes"
                  onClick={() => setIsOpen(false)}
                  className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition"
                  title="Configurar IA"
                >
                  <Settings className="w-4 h-4" />
                </Link>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition"
                  aria-label="Fechar assistente"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Sugestões Rápidas */}
            <div className="p-2.5 bg-[#0B0F19] border-b border-slate-800 flex gap-1.5 overflow-x-auto text-[11px] no-scrollbar">
              <button
                type="button"
                onClick={() => handleSend("Quais impressoras estão liberadas hoje?")}
                className="whitespace-nowrap px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white transition shrink-0"
              >
                Impressoras liberadas
              </button>
              <button
                type="button"
                onClick={() => handleSend("Quantos modelos estão aguardando na fila 3D?")}
                className="whitespace-nowrap px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white transition shrink-0"
              >
                Fila atual
              </button>
              <button
                type="button"
                onClick={() => handleSend("Qual o tempo de calibração recomendado para resina de modelo?")}
                className="whitespace-nowrap px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white transition shrink-0"
              >
                Calibrar resina
              </button>
            </div>

            {/* Mensagens */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3.5 text-xs bg-[#0B0F19]/50">
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
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-slate-950 shrink-0 mt-0.5 shadow-xs">
                        <Bot className="h-3.5 w-3.5 text-brand-600" />
                      </div>
                    )}

                    <div
                      className={`group relative max-w-[85%] rounded-2xl p-3 leading-relaxed whitespace-pre-wrap ${
                        isAssistant
                          ? "bg-[#0F172A] text-slate-100 border border-slate-800 shadow-md"
                          : "bg-white text-slate-950 font-medium shadow-md"
                      }`}
                    >
                      {m.content}
                      {isAssistant && m.id !== "welcome" && (
                        <div className="mt-2 pt-1 border-t border-slate-800 flex justify-end">
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(m.content);
                              toast.success("Copiado!");
                            }}
                            className="text-[10px] text-slate-400 hover:text-white font-medium inline-flex items-center gap-1 transition"
                          >
                            <Copy className="w-3 h-3" />
                            <span>Copiar</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {!isAssistant && (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-slate-200 shrink-0 mt-0.5 border border-slate-700">
                        <User className="h-3.5 w-3.5" />
                      </div>
                    )}
                  </div>
                );
              })}

              {isSending && (
                <div className="flex items-center gap-2 text-xs text-slate-400 p-2 bg-[#0F172A] rounded-full border border-slate-800 w-fit">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                  <span>Consultando...</span>
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
              className="p-3 border-t border-slate-800 bg-[#0F172A] flex items-center gap-2"
            >
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Digite sua dúvida..."
                className="flex-1 px-4 py-2 text-xs rounded-full border border-slate-700/80 focus:outline-hidden focus:ring-2 focus:ring-cyan-400 bg-slate-900 text-white placeholder:text-slate-500"
              />
              <Button
                type="submit"
                disabled={!inputText.trim() || isSending}
                size="sm"
                className="h-8 w-8 p-0 rounded-full bg-white hover:bg-slate-200 text-slate-950 shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
              </Button>
            </form>
          </div>
        </>
      )}
    </>
  );
}
