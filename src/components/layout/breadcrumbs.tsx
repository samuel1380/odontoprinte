"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";

const ROUTE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  cadista: "Cadista",
  status: "Atualização de Status",
  fila: "Fila de Impressão (FIFO)",
  fatiador: "Fatiador & Preparo",
  impressoes: "Impressões",
  impressoras: "Impressoras 3D",
  fresagem: "Fila de Fresagem CNC",
  acabamento: "Bancada de Acabamento",
  manutencao: "Checklist de Manutenção",
  resinas: "Lotes de Resina",
  recebimento: "Recebimento de Resina",
  calibracoes: "Calibrações Técnicas",
  nova: "Nova Calibração",
  historico: "Histórico & Rastreabilidade",
  admin: "Administração",
  usuarios: "Controle de Usuários",
  configuracoes: "Parâmetros do Sistema",
};

export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0 || pathname === "/dashboard") {
    return (
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        <Home className="h-3.5 w-3.5 text-slate-400" />
        <span>/</span>
        <span className="font-semibold text-slate-800">Dashboard</span>
      </div>
    );
  }

  return (
    <nav className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
      <Link
        href="/dashboard"
        className="flex items-center gap-1 text-slate-400 hover:text-slate-700 transition"
      >
        <Home className="h-3.5 w-3.5" />
      </Link>

      {segments.map((segment, index) => {
        const path = `/${segments.slice(0, index + 1).join("/")}`;
        const isLast = index === segments.length - 1;
        const label = ROUTE_LABELS[segment] || segment;

        return (
          <React.Fragment key={path}>
            <ChevronRight className="h-3 w-3 text-slate-400" />
            {isLast ? (
              <span className="font-semibold text-slate-900 capitalize truncate max-w-[120px] sm:max-w-[220px]">
                {label}
              </span>
            ) : (
              <Link
                href={path}
                className="text-slate-500 hover:text-slate-800 transition capitalize truncate max-w-[80px] sm:max-w-none hidden xs:inline"
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
