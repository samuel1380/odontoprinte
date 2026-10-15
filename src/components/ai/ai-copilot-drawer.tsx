"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { AIChatMessage } from "@/types/ai.types";
import { AIService } from "@/services/ai-service";
import { DEFAULT_GROQ_MODEL, DEFAULT_GEMINI_MODEL } from "@/lib/ai/models";
import {
  Sparkles,
  X,
  Send,
  Bot,
  User,
  Settings,
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
  // Re-dispara a animação de "borracha" da bolinha a cada clique
  const [squishKey, setSquishKey] = useState(0);

  // Bolinha arrastável: solta no canto mais próximo e se ajusta sozinha
  type Dock = { h: "left" | "right"; v: "top" | "bottom" };
  const DOCK_KEY = "odontoprint_copilot_dock";
  const [dock, setDock] = useState<Dock>(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(DOCK_KEY) : null;
      const parsed = raw ? JSON.parse(raw) : null;
      if (
        parsed &&
        (parsed.h === "left" || parsed.h === "right") &&
        (parsed.v === "top" || parsed.v === "bottom")
      ) {
        return parsed as Dock;
      }
    } catch {
      // ignora
    }
    return { h: "right", v: "bottom" };
  });
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const dragStart = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  const handleBubbleDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== undefined && e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignora
    }
    dragStart.current = { x: e.clientX, y: e.clientY, moved: false };
  };

  const handleBubbleMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const s = dragStart.current;
    if (!s) return;
    if (!s.moved && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 8) {
      s.moved = true;
      if (isOpen) setIsOpen(false);
    }
    if (s.moved) setDragPos({ x: e.clientX, y: e.clientY });
  };

  const handleBubbleUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const s = dragStart.current;
    dragStart.current = null;
    setDragPos(null);
    if (!s) return;
    if (!s.moved) {
      setSquishKey((k) => k + 1);
      setIsOpen(!isOpen);
      return;
    }
    const next: Dock = {
      h: e.clientX < window.innerWidth / 2 ? "left" : "right",
      v: e.clientY < window.innerHeight / 2 ? "top" : "bottom",
    };
    setDock(next);
    try {
      localStorage.setItem(DOCK_KEY, JSON.stringify(next));
    } catch {
      // ignora
    }
  };

  const dockCorner =
    dock.v === "top"
      ? dock.h === "left"
        ? "left-4 top-4 sm:left-6 sm:top-6"
        : "right-4 top-4 sm:right-6 sm:top-6"
      : dock.h === "left"
      ? "left-4 bottom-4 sm:left-6 sm:bottom-6"
      : "right-4 bottom-4 sm:right-6 sm:bottom-6";
  const panelPlacement =
    dock.v === "top"
      ? dock.h === "left"
        ? "left-4 top-[76px] sm:left-6 sm:top-[104px] origin-top-left"
        : "right-4 top-[76px] sm:right-6 sm:top-[104px] origin-top-right"
      : dock.h === "left"
      ? "left-4 bottom-[76px] sm:left-6 sm:bottom-[104px] origin-bottom-left"
      : "right-4 bottom-[76px] sm:right-6 sm:bottom-[104px] origin-bottom-right";

  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Ref espelha o histórico para evitar closure desatualizada em envios rápidos
  const messagesRef = useRef<AIChatMessage[]>(messages);
  messagesRef.current = messages;

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
    const targetModel = targetProvider === "GEMINI" ? DEFAULT_GEMINI_MODEL : DEFAULT_GROQ_MODEL;
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
      const replyText = await AIService.sendMessage(query, messagesRef.current);
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
      {/* Bolinha flutuante arrastável (segura e solta no canto) */}
      <div
        className={`fixed z-40 flex items-center gap-2 ${
          dragPos ? "" : `${dockCorner} transition-[left,top,right,bottom,transform] duration-500 ease-[cubic-bezier(.34,1.56,.64,1)]`
        } ${dock.h === "left" ? "flex-row-reverse" : ""}`}
        style={
          dragPos
            ? { left: dragPos.x, top: dragPos.y, transform: "translate(-50%, -50%) scale(1.15)" }
            : undefined
        }
      >
        {!isOpen && (
          <div className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#0F172A]/90 border border-slate-800 text-xs font-semibold text-slate-200 shadow-md backdrop-blur-md select-none">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400"></span>
            </span>
            <span>OdontoIA</span>
          </div>
        )}

        <button
          type="button"
          onPointerDown={handleBubbleDown}
          onPointerMove={handleBubbleMove}
          onPointerUp={handleBubbleUp}
          onPointerCancel={() => {
            dragStart.current = null;
            setDragPos(null);
          }}
          className={`relative flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-white text-slate-950 border border-white/30 focus:outline-hidden select-none ${
            dragPos
              ? "shadow-2xl shadow-cyan-950/50 cursor-grabbing"
              : "shadow-xl shadow-slate-950/40 hover:bg-slate-200 hover:scale-105 active:scale-90 cursor-grab transition-all duration-200"
          }`}
          style={{ touchAction: "none" }}
          title="Arrastar para mover · clicar para abrir a OdontoIA"
          aria-label="Assistente virtual OdontoIA (arraste para mover, clique para abrir)"
        >
          <span key={squishKey} className="flex animate-bubble-squish pointer-events-none">
            {isOpen ? <X className="h-5 w-5 sm:h-6 sm:w-6" /> : <Sparkles className="h-5 w-5 sm:h-6 sm:w-6 text-brand-600" />}
          </span>
          {dragPos && (
            <span className="absolute inset-0 rounded-full border-2 border-cyan-400 animate-ping pointer-events-none" />
          )}
        </button>
      </div>

      {/* Painel do Chat */}
      {isOpen && (
        <>
          {/* Backdrop para mobile */}
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm sm:hidden"
            onClick={() => setIsOpen(false)}
          />

          <div className={`fixed ${panelPlacement} z-50 w-[calc(100vw-32px)] sm:w-[420px] h-[min(600px,calc(100dvh-130px))] rounded-3xl border border-slate-700/80 bg-[#0F172A] shadow-2xl shadow-slate-950/60 flex flex-col overflow-hidden animate-copilot-pop text-slate-100`}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-[#0B0F19]">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-cyan-400 to-brand-600 text-slate-950 flex items-center justify-center shadow-md shadow-cyan-950/50">
                    <Sparkles className="h-5 w-5 text-white" />
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 ring-2 ring-[#0B0F19]"></span>
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-white tracking-tight">OdontoIA</span>
                    <span className="text-[10px] font-semibold text-emerald-300">online</span>
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
                onClick={() => handleSend("O que está imprimindo agora?")}
                className="whitespace-nowrap px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white transition shrink-0"
              >
                Imprimindo agora
              </button>
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
                    className={`flex items-start gap-2.5 animate-msg-in ${
                      isAssistant ? "justify-start" : "justify-end"
                    }`}
                  >
                    {isAssistant && (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-brand-600 shrink-0 mt-0.5 shadow-sm">
                        <Bot className="h-3.5 w-3.5 text-white" />
                      </div>
                    )}

                    <div
                      className={`group relative max-w-[85%] rounded-2xl p-3 leading-relaxed whitespace-pre-wrap ${
                        isAssistant
                          ? "rounded-tl-md bg-[#0F172A] text-slate-100 border border-slate-800 shadow-md"
                          : "rounded-tr-md bg-white text-slate-950 font-medium shadow-md"
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
                <div className="flex items-start gap-2.5 animate-msg-in">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-brand-600 shrink-0 mt-0.5">
                    <Sparkles className="h-3.5 w-3.5 text-white" />
                  </div>
                  <div className="bg-[#0F172A] text-slate-200 border border-slate-800 shadow-md rounded-2xl rounded-tl-md px-3.5 py-2.5 flex items-center gap-1.5">
                    <span className="think-dot h-1.5 w-1.5 rounded-full bg-cyan-300" />
                    <span className="think-dot h-1.5 w-1.5 rounded-full bg-cyan-300" style={{ animationDelay: "0.15s" }} />
                    <span className="think-dot h-1.5 w-1.5 rounded-full bg-cyan-300" style={{ animationDelay: "0.3s" }} />
                    <span className="text-[11px] text-slate-400 ml-1">pensando…</span>
                  </div>
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
                className="h-9 w-9 p-0 rounded-full bg-white hover:bg-slate-200 active:scale-90 text-slate-950 shrink-0 transition disabled:opacity-40"
                title="Enviar mensagem"
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
