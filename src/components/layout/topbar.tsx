"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { USER_ROLES, UserRole } from "@/lib/constants";
import {
  ChevronDown,
  LogOut,
  Shield,
  Settings,
  Users,
  Check,
  Menu
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "./breadcrumbs";

interface TopbarProps {
  onOpenMobileMenu?: () => void;
}

export function Topbar({ onOpenMobileMenu }: TopbarProps) {
  const { user, activeRole, setActiveRole, logout, isSupabaseConnected } = useAuth();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [showRoleSwitcher, setShowRoleSwitcher] = useState(false);

  const roleColors: Record<string, string> = {
    ADMIN: "bg-white text-slate-950 border-transparent font-semibold",
    CADISTA: "bg-cyan-950 text-cyan-300 border-cyan-800/60",
    OPERADOR_IMPRESSAO: "bg-emerald-950 text-emerald-300 border-emerald-800/60",
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 sm:h-16 lg:h-18 w-full items-center justify-between border-b border-slate-800 bg-[#0B0F19]/90 px-3.5 sm:px-6 lg:px-8 backdrop-blur-md">
      {/* Left: Mobile Toggle & Breadcrumbs */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 -ml-1 rounded-full text-slate-300 hover:bg-slate-800 hover:text-white transition focus:outline-hidden shrink-0"
          aria-label="Abrir menu de navegação"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="min-w-0 overflow-hidden">
          <Breadcrumbs />
        </div>
      </div>

      {/* Right: Operational Status & User Profile */}
      <div className="flex items-center gap-2.5 sm:gap-3">
        {/* Status Operacional do Sistema */}
        <div className="hidden sm:flex items-center gap-2 rounded-full border border-slate-800 bg-[#0F172A] px-3.5 py-1 text-xs text-slate-300 shadow-xs">
          <span className="relative flex h-2 w-2">
            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400"></span>
          </span>
          <span className="font-medium text-slate-200">
            {isSupabaseConnected ? "Nuvem Conectada" : "Linha Ativa"}
          </span>
        </div>

        {/* User Profile & Menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setProfileMenuOpen(!profileMenuOpen)}
            className="flex items-center gap-2 rounded-full border border-slate-800 bg-[#0F172A] p-1 sm:px-3 sm:py-1 text-xs text-slate-200 shadow-xs hover:bg-slate-800 transition"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-slate-950 font-bold text-xs shadow-xs">
              {user?.full_name?.charAt(0) || "U"}
            </div>

            <div className="hidden md:block text-left leading-tight pr-1">
              <span className="block font-semibold text-white text-xs">
                {user?.full_name || "Usuário"}
              </span>
              <span className="text-[10px] text-slate-400 font-medium">
                {activeRole ? ((USER_ROLES as Record<string, string>)[activeRole] || activeRole) : "Operador"}
              </span>
            </div>

            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </button>

          {profileMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => {
                  setProfileMenuOpen(false);
                  setShowRoleSwitcher(false);
                }}
              />
              <div className="absolute right-0 top-full mt-2 z-50 w-72 rounded-2xl border border-slate-800 bg-[#0F172A] p-2 shadow-2xl animate-in fade-in zoom-in-95 text-slate-200">
                {/* Header do Menu */}
                <div className="p-3 border-b border-slate-800">
                  <div className="font-semibold text-xs text-white">{user?.full_name || "Usuário"}</div>
                  <div className="text-[11px] text-slate-400 truncate mt-0.5">{user?.email || ""}</div>
                  <div className="mt-2 flex items-center gap-1.5">
                    <Badge className={activeRole ? roleColors[activeRole] : "bg-white text-slate-950"}>
                      {activeRole ? ((USER_ROLES as Record<string, string>)[activeRole] || activeRole) : "Acesso Restrito"}
                    </Badge>
                  </div>
                </div>

                {/* Ações do Usuário */}
                <div className="p-1 space-y-0.5">
                  <Link
                    href="/admin/configuracoes"
                    onClick={() => setProfileMenuOpen(false)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 hover:text-white transition"
                  >
                    <Settings className="w-3.5 h-3.5 text-slate-400" />
                    <span>Configurações</span>
                  </Link>

                  <Link
                    href="/admin/usuarios"
                    onClick={() => setProfileMenuOpen(false)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 hover:text-white transition"
                  >
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    <span>Usuários</span>
                  </Link>

                  {/* Alternar Permissão (para administradores) */}
                  <div className="pt-1 mt-1 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setShowRoleSwitcher(!showRoleSwitcher)}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 hover:text-white transition"
                    >
                      <div className="flex items-center gap-2">
                        <Shield className="w-3.5 h-3.5 text-slate-400" />
                        <span>Alternar Visão de Perfil</span>
                      </div>
                      <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${showRoleSwitcher ? "rotate-180" : ""}`} />
                    </button>

                    {showRoleSwitcher && (
                      <div className="pl-6 pr-2 py-1 space-y-1 bg-slate-950/60 rounded-lg my-1 border border-slate-800">
                        {(Object.keys(USER_ROLES) as (keyof typeof USER_ROLES)[]).map((roleKey) => (
                          <button
                            key={roleKey}
                            type="button"
                            onClick={() => {
                              setActiveRole(roleKey);
                              setProfileMenuOpen(false);
                              setShowRoleSwitcher(false);
                            }}
                            className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[11px] text-slate-300 hover:text-white hover:bg-slate-800 transition"
                          >
                            <span>{USER_ROLES[roleKey]}</span>
                            {activeRole === roleKey && (
                              <Check className="h-3.5 w-3.5 text-cyan-400" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Sair */}
                <div className="p-1 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={logout}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-rose-400 hover:bg-rose-950/40 hover:text-rose-300 transition"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Encerrar Sessão</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
