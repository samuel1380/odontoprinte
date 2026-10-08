"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileCheck2,
  ListOrdered,
  Scissors,
  Printer,
  FlaskConical,
  Compass,
  History,
  Users,
  Settings,
  ShieldAlert,
  Layers3,
  X,
  Cog,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { Badge } from "@/components/ui/badge";

interface NavItem {
  title: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
  roles?: string[];
}

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { activeRole } = useAuth();

  const navigation: { group: string; items: NavItem[] }[] = [
    {
      group: "Painel Geral",
      items: [
        {
          title: "Dashboard",
          href: "/dashboard",
          icon: LayoutDashboard,
        },
      ],
    },
    {
      group: "1. CAD & Modelagem",
      items: [
        {
          title: "Cadista: Novo Trabalho",
          href: "/cadista/status",
          icon: FileCheck2,
        },
      ],
    },
    {
      group: "2. Impressão 3D & Resinas",
      items: [
        {
          title: "Fila de Impressão (FIFO)",
          href: "/fila",
          icon: ListOrdered,
        },
        {
          title: "Fatiador / Preparo",
          href: "/fatiador",
          icon: Scissors,
        },
        {
          title: "Ordens de Impressão",
          href: "/impressoes",
          icon: Printer,
        },
        {
          title: "Parque de Impressoras",
          href: "/impressoras",
          icon: Layers3,
        },
        {
          title: "Lotes de Resina",
          href: "/resinas",
          icon: FlaskConical,
        },
        {
          title: "Calibrações Técnicas",
          href: "/calibracoes",
          icon: Compass,
        },
      ],
    },
    {
      group: "3. Fresagem CNC",
      items: [
        {
          title: "Fila de Fresagem",
          href: "/fresagem",
          icon: Cog,
        },
      ],
    },
    {
      group: "4. Bancada de Acabamento",
      items: [
        {
          title: "Montagem & Maquiagem",
          href: "/acabamento",
          icon: Sparkles,
        },
      ],
    },
    {
      group: "5. Rastreabilidade & Gestão",
      items: [
        {
          title: "Histórico Completo",
          href: "/historico",
          icon: History,
        },
        {
          title: "Usuários & Acessos",
          href: "/admin/usuarios",
          icon: Users,
          roles: ["ADMIN"],
        },
        {
          title: "Parâmetros do Sistema",
          href: "/admin/configuracoes",
          icon: Settings,
          roles: ["ADMIN"],
        },
      ],
    },
  ];

  return (
    <>
      {/* Backdrop para telas mobile/tablet */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-xs lg:hidden transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 sm:w-64 flex-col border-r border-slate-200/80 bg-white transition-transform duration-300 ease-in-out lg:z-30 lg:translate-x-0",
          isOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Brand Header com a nova Logo OdontoPrint */}
        <div className="flex h-16 lg:h-20 items-center justify-between border-b border-slate-200/80 px-4 sm:px-5">
          <Link href="/dashboard" onClick={onClose} className="flex items-center gap-3 group">
            <img
              src="/logo.jpg"
              alt="Logo OdontoPrint"
              className="h-9 w-9 lg:h-14 lg:w-14 rounded-xl lg:rounded-2xl object-contain shadow-xs lg:shadow-md border border-slate-200/80 p-0.5 lg:p-1 bg-white group-hover:scale-105 transition-all shrink-0"
            />
            <div>
              <div className="text-base lg:text-lg font-black tracking-wider text-slate-900 flex items-center">
                ODONTO<span className="text-brand-600">PRINT</span>
              </div>
              <p className="text-[9px] lg:text-[10px] font-bold tracking-tight text-slate-400 uppercase">
                Dental 3D Laboratory
              </p>
            </div>
          </Link>

          {/* Botão de Fechar Mobile */}
          <button
            type="button"
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
            aria-label="Fechar menu de navegação"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation List */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
          {navigation.map((section) => {
            const visibleItems = section.items.filter((item) => {
              if (activeRole === "ADMIN") return true;
              if (!item.roles) return true;
              return Boolean(activeRole && item.roles.includes(activeRole));
            });

            if (visibleItems.length === 0) return null;

            return (
              <div key={section.group}>
                <div className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {section.group}
                </div>
                <nav className="space-y-1">
                  {visibleItems.map((item) => {
                    const isActive = pathname === item.href;
                    const Icon = item.icon;

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onClose}
                        className={cn(
                          "group flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-semibold transition-all",
                          isActive
                            ? "bg-brand-50 text-brand-700 font-bold"
                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-4 w-4 shrink-0 transition-colors",
                            isActive
                              ? "text-brand-500"
                              : "text-slate-400 group-hover:text-slate-600"
                          )}
                        />
                        <span className="flex-1 truncate">{item.title}</span>
                        {item.badge && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            {item.badge}
                          </Badge>
                        )}
                      </Link>
                    );
                  })}
                </nav>
              </div>
            );
          })}
        </div>

        {/* Footer / Lab Station Status */}
        <div className="border-t border-slate-200/80 p-4 bg-slate-50/50">
          <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Ambiente</span>
              <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Operacional
              </span>
            </div>
            <div className="mt-2 text-xs font-semibold text-slate-800 flex items-center justify-between">
              <span>ODONTOPRINT LAB</span>
              <span className="text-[10px] font-normal text-slate-400">v2.4.0</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
