"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { USER_ROLES, UserRole } from "@/lib/constants";
import {
  UserCircle2,
  ChevronDown,
  LogOut,
  Shield,
  Settings,
  Users,
  Check,
  Activity,
  Layers,
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
    ADMIN: "bg-slate-900 text-white border-slate-800",
    CADISTA: "bg-blue-50 text-blue-700 border-blue-200",
    OPERADOR_IMPRESSAO: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 sm:h-16 lg:h-18 w-full items-center justify-between border-b border-slate-200/80 bg-white/95 px-3.5 sm:px-6 lg:px-8 backdrop-blur-md">
      {/* Left: Mobile Toggle & Breadcrumbs */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 -ml-1 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition focus:outline-hidden shrink-0"
          aria-label="Abrir menu de navegação"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="min-w-0 overflow-hidden">
          <Breadcrumbs />
        </div>
      </div>

      {/* Right: Operational Status & User Profile */}
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Status Operacional do Sistema */}
        <div className="hidden sm:flex items-center gap-2 rounded-full border border-slate-200/80 bg-slate-50/70 px-3 py-1 text-xs text-slate-600">
          <span className="relative flex h-2 w-2">
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="font-medium text-slate-700">
            {isSupabaseConnected ? "Nuvem Conectada" : "Linha de Produção Ativa"}
          </span>
        </div>

        {/* User Profile & Menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setProfileMenuOpen(!profileMenuOpen)}
            className="flex items-center gap-2.5 rounded-xl border border-slate-200/80 bg-white p-1.5 sm:px-3 sm:py-1.5 text-xs text-slate-700 shadow-xs hover:bg-slate-50 hover:border-slate-300 transition"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-white font-semibold text-xs shadow-xs">
              {user?.full_name?.charAt(0) || "U"}
            </div>
            
            <div className="hidden md:block text-left leading-tight">
              <span className="block font-semibold text-slate-800 text-xs">
                {user?.full_name || "Usuário"}
              </span>
              <span className="text-[10px] text-slate-400 font-medium">
                {activeRole ? ((USER_ROLES as Record<string, string>)[activeRole] || activeRole) : "Acesso Restrito"}
              </span>
            </div>

            <ChevronDown className="h-3.5 w-3.5 text-slate-400 ml-0.5" />
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
              <div className="absolute right-0 top-full mt-2 z-50 w-72 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl animate-in fade-in zoom-in-95">
                {/* Header do Menu */}
                <div className="p-3 border-b border-slate-100">
                  <div className="font-semibold text-xs text-slate-900">{user?.full_name || "Usuário"}</div>
                  <div className="text-[11px] text-slate-500 truncate mt-0.5">{user?.email || ""}</div>
                  <div className="mt-2 flex items-center gap-1.5">
                    <Badge className={activeRole ? roleColors[activeRole] : "bg-slate-900 text-white border-slate-800"}>
                      {activeRole ? ((USER_ROLES as Record<string, string>)[activeRole] || activeRole) : "Acesso Restrito"}
                    </Badge>
                  </div>
                </div>

                {/* Ações do Usuário */}
                <div className="p-1 space-y-0.5">
                  <Link
                    href="/admin/configuracoes"
                    onClick={() => setProfileMenuOpen(false)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-slate-700 hover:bg-slate-100 transition"
                  >
                    <Settings className="w-3.5 h-3.5 text-slate-500" />
                    <span>Configurações</span>
                  </Link>

                  <Link
                    href="/admin/usuarios"
                    onClick={() => setProfileMenuOpen(false)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-slate-700 hover:bg-slate-100 transition"
                  >
                    <Users className="w-3.5 h-3.5 text-slate-500" />
                    <span>Usuários</span>
                  </Link>

                  {/* Alternar Permissão (para administradores) */}
                  <div className="pt-1 mt-1 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setShowRoleSwitcher(!showRoleSwitcher)}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs text-slate-600 hover:bg-slate-100 transition"
                    >
                      <div className="flex items-center gap-2">
                        <Shield className="w-3.5 h-3.5 text-slate-500" />
                        <span>Alternar Visão de Perfil</span>
                      </div>
                      <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${showRoleSwitcher ? "rotate-180" : ""}`} />
                    </button>

                    {showRoleSwitcher && (
                      <div className="pl-6 pr-2 py-1 space-y-1 bg-slate-50/70 rounded-lg my-1">
                        {(Object.keys(USER_ROLES) as (keyof typeof USER_ROLES)[]).map((roleKey) => (
                          <button
                            key={roleKey}
                            type="button"
                            onClick={() => {
                              setActiveRole(roleKey);
                              setProfileMenuOpen(false);
                              setShowRoleSwitcher(false);
                            }}
                            className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[11px] text-slate-700 hover:bg-white transition"
                          >
                            <span>{USER_ROLES[roleKey]}</span>
                            {activeRole === roleKey && (
                              <Check className="h-3.5 w-3.5 text-brand-600" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Sair */}
                <div className="p-1 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={logout}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-rose-600 hover:bg-rose-50 transition"
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
