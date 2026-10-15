"use client";

import React from "react";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * Alternador sol/lua com animação de mola: o botão desliza, o ícone
 * gira e troca com crossfade, e o brilho do track transiciona junto.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle, mounted } = useTheme();
  const isLight = theme === "light";

  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={isLight}
      aria-label={isLight ? "Ativar modo escuro" : "Ativar modo claro"}
      title={isLight ? "Modo escuro" : "Modo claro"}
      className={cn(
        "relative flex h-8 w-[60px] shrink-0 items-center rounded-full border px-1 transition-colors duration-500",
        isLight
          ? "border-amber-300/60 bg-gradient-to-r from-amber-100 to-sky-100"
          : "border-slate-700 bg-slate-900",
        className
      )}
    >
      {/* brilho que acompanha o modo */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 rounded-full transition-opacity duration-500",
          isLight ? "opacity-100" : "opacity-0"
        )}
        style={{ boxShadow: "inset 0 0 12px rgba(251,191,36,0.35)" }}
      />
      {/* botão deslizante */}
      <span
        aria-hidden
        className="relative z-10 flex h-6 w-6 items-center justify-center rounded-full shadow-md transition-all duration-500 ease-[cubic-bezier(.34,1.56,.64,1)]"
        style={{
          transform: isLight ? "translateX(0)" : "translateX(28px)",
          background: isLight ? "#f59e0b" : "#0f172a",
          boxShadow: isLight
            ? "0 0 10px rgba(245,158,11,0.8)"
            : "0 0 10px rgba(148,163,184,0.35)",
        }}
      >
        <Sun
          className={cn(
            "absolute h-4 w-4 text-white transition-all duration-500",
            isLight ? "rotate-0 scale-100 opacity-100" : "rotate-180 scale-0 opacity-0"
          )}
        />
        <Moon
          className={cn(
            "absolute h-4 w-4 text-cyan-300 transition-all duration-500",
            isLight ? "-rotate-180 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"
          )}
        />
      </span>
      {/* ícones fantasma nas pontas */}
      <Sun
        aria-hidden
        className={cn(
          "absolute left-[7px] h-3.5 w-3.5 transition-all duration-500",
          isLight ? "scale-0 opacity-0" : "scale-100 text-slate-500 opacity-70"
        )}
      />
      <Moon
        aria-hidden
        className={cn(
          "absolute right-[7px] h-3.5 w-3.5 transition-all duration-500",
          isLight ? "scale-100 text-slate-500 opacity-70" : "scale-0 opacity-0"
        )}
      />
      {!mounted && <span className="sr-only">Carregando tema…</span>}
    </button>
  );
}
