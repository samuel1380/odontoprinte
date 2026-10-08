"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { AICopilotDrawer } from "@/components/ai/ai-copilot-drawer";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-4">
        <div className="relative mb-5">
          <img
            src="/logo.jpg"
            alt="OdontoPrint"
            className="h-16 w-16 rounded-2xl object-contain bg-white p-1.5 shadow-xl shadow-brand-500/20 animate-pulse"
          />
        </div>
        <div className="h-5 w-5 rounded-full border-2 border-brand-400 border-t-transparent animate-spin mb-3" />
        <p className="text-xs text-slate-400 font-medium tracking-wide">Validando sessão corporativa...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Sidebar com gaveta responsiva para mobile/tablet e fixo em desktop */}
      <Sidebar
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />

      {/* Área de Conteúdo */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0 transition-all duration-300">
        <Topbar onOpenMobileMenu={() => setMobileMenuOpen(true)} />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 min-w-0 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Assistente IA Copiloto OdontoPrint (Groq / Mistral) acessível em todo o sistema */}
      <AICopilotDrawer />
    </div>
  );
}
