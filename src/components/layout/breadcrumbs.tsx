"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";

const ROUTE_LABELS: Record<string, string> = {
  dashboard: "Início",
  cadista: "CAD",
  status: "Novo Trabalho",
  fila: "Fila de Espera",
  fatiador: "Preparar Impressão",
  impressoes: "Impressões",
  impressoras: "Impressoras",
  fresagem: "Fresagem CNC",
  acabamento: "Acabamento & CQ",
  manutencao: "Manutenção",
  resinas: "Resinas",
  recebimento: "Cadastrar Resina",
  calibracoes: "Calibrações",
  nova: "Nova Calibração",
  historico: "Histórico",
  admin: "Administração",
  usuarios: "Usuários",
  configuracoes: "Configurações",
};

export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0 || pathname === "/dashboard") {
    return (
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
        <Home className="h-3.5 w-3.5 text-slate-400" />
        <span className="text-slate-600">/</span>
        <span className="font-semibold text-white">Dashboard</span>
      </div>
    );
  }

  return (
    <nav className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
      <Link
        href="/dashboard"
        className="flex items-center gap-1 text-slate-400 hover:text-white transition"
      >
        <Home className="h-3.5 w-3.5" />
      </Link>

      {segments.map((segment, index) => {
        const path = `/${segments.slice(0, index + 1).join("/")}`;
        const isLast = index === segments.length - 1;
        const label = ROUTE_LABELS[segment] || segment;

        return (
          <React.Fragment key={path}>
            <ChevronRight className="h-3 w-3 text-slate-600" />
            {isLast ? (
              <span className="font-semibold text-white capitalize truncate max-w-[120px] sm:max-w-[220px]">
                {label}
              </span>
            ) : (
              <Link
                href={path}
                className="text-slate-400 hover:text-white transition capitalize truncate max-w-[80px] sm:max-w-none hidden xs:inline"
              >
                {label}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
