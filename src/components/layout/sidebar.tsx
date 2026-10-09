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
      group: "Principal",
      items: [
        {
          title: "Início (Dashboard)",
          href: "/dashboard",
          icon: LayoutDashboard,
        },
        {
          title: "Novo Trabalho",
          href: "/cadista/status",
          icon: FileCheck2,
        },
        {
          title: "Fila de Espera",
          href: "/fila",
          icon: ListOrdered,
        },
      ],
    },
    {
      group: "Produção 3D",
      items: [
        {
          title: "Preparar Impressão",
          href: "/fatiador",
          icon: Scissors,
        },
        {
          title: "Impressões em Andamento",
          href: "/impressoes",
          icon: Printer,
        },
        {
          title: "Acabamento & CQ",
          href: "/acabamento",
          icon: Sparkles,
        },
        {
          title: "Fresagem CNC",
          href: "/fresagem",
          icon: Cog,
        },
      ],
    },
    {
      group: "Equipamentos & Materiais",
      items: [
        {
          title: "Impressoras",
          href: "/impressoras",
          icon: Layers3,
        },
        {
          title: "Resinas",
          href: "/resinas",
          icon: FlaskConical,
        },
        {
          title: "Calibrações",
          href: "/calibracoes",
          icon: Compass,
        },
      ],
    },
    {
      group: "Administração",
      items: [
        {
          title: "Histórico Completo",
          href: "/historico",
          icon: History,
        },
        {
          title: "Configurações",
          href: "/admin/configuracoes",
          icon: Settings,
          roles: ["ADMIN"],
        },
        {
          title: "Usuários",
          href: "/admin/usuarios",
          icon: Users,
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
          className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-xs lg:hidden transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[260px] max-w-[85vw] lg:w-64 flex-col border-r border-slate-800 bg-[#0B0F19] text-slate-100 transition-transform duration-300 ease-in-out lg:z-30 lg:translate-x-0",
          isOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Brand Header */}
        <div className="flex h-14 sm:h-16 lg:h-18 items-center justify-between border-b border-slate-800 px-4 sm:px-5">
          <Link href="/dashboard" onClick={onClose} className="flex items-center gap-3 group">
            <img
              src="/logo.jpg"
              alt="Logo OdontoPrint"
              className="h-9 w-9 rounded-xl object-contain border border-white/20 p-0.5 bg-white shadow-xs group-hover:scale-105 transition-all shrink-0"
            />
            <div>
              <div className="text-sm font-black tracking-wider text-white flex items-center leading-none">
                ODONTO<span className="text-cyan-400">PRINT</span>
              </div>
              <p className="text-[9px] font-bold tracking-tight text-slate-400 uppercase mt-1">
                Dental 3D Lab
              </p>
            </div>
          </Link>

          {/* Botão de Fechar Mobile */}
          <button
            type="button"
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition"
            aria-label="Fechar menu de navegação"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation List */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {navigation.map((section) => {
            const visibleItems = section.items.filter((item) => {
              if (activeRole === "ADMIN") return true;
              if (!item.roles) return true;
              return Boolean(activeRole && item.roles.includes(activeRole));
            });

            if (visibleItems.length === 0) return null;

            return (
              <div key={section.group}>
                <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
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
                          "group flex items-center gap-2.5 rounded-full px-3.5 py-2 text-xs font-medium transition-all",
                          isActive
                            ? "bg-white text-slate-950 font-semibold shadow-xs"
                            : "text-slate-400 hover:bg-slate-800/80 hover:text-white"
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-4 w-4 shrink-0 transition-colors",
                            isActive ? "text-slate-950" : "text-slate-400 group-hover:text-white"
                          )}
                        />
                        <span className="flex-1 truncate">{item.title}</span>
                        {item.badge && (
                          <Badge
                            variant={isActive ? "dark" : "secondary"}
                            className="text-[10px] px-2 py-0.5 rounded-full"
                          >
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
        <div className="border-t border-slate-800 p-3.5 bg-slate-950/40">
          <div className="rounded-2xl border border-slate-800 bg-[#0F172A] p-2.5 shadow-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-xs font-semibold text-slate-200">Laboratório Online</span>
            </div>
            <span className="text-[10px] font-medium text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
              Bancada
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}
