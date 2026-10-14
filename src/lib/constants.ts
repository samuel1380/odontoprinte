export const DENTAL_FILE_TYPES = [
  { id: "MODELO_COM_FUROS", label: "Modelo de Trabalho (com furos para dentes)", description: "Base do modelo 3D com alvéolos/furos para assentamento de troqueis e dentes", category: "IMPRESSAO" },
  { id: "MODELO_DE_TRABALHO", label: "Modelo de Trabalho Sólido", description: "Modelo anatômico base de estudo ou alinhadores", category: "IMPRESSAO" },
  { id: "ANTAGONISTA", label: "Modelo Antagonista", description: "Arco oponente para conferência e ajuste oclusal", category: "IMPRESSAO" },
  { id: "TROQUEL", label: "Dentes / Troqueis (para encaixe)", description: "Dentes individualizados preparados para montagem no modelo impresso", category: "IMPRESSAO" },
  { id: "GENGIVA_ARTIFICIAL", label: "Máscara Gengival / Gengiva Flex", description: "Gengiva destacável para assentamento estético e emergência protética", category: "IMPRESSAO" },
  { id: "PLACA_MIORRELAXANTE", label: "Placa Miorrelaxante", description: "Dispositivo interoclusal para bruxismo e DTM", category: "IMPRESSAO" },
  { id: "ELEMENTO_PROVA", label: "Elemento para Prova Clínica", description: "Peça impressa de prova estética e adaptação de margem", category: "IMPRESSAO" },
  { id: "ELEMENTO_PROVISORIO", label: "Elemento Provisório", description: "Restauração transitória em resina 3D biocompatível", category: "IMPRESSAO" },
] as const;

export type DentalFileType = typeof DENTAL_FILE_TYPES[number]["id"];

export const FILE_TYPE_LABELS: Record<string, string> = {
  MODELO_COM_FUROS: "Modelo de Trabalho (com furos)",
  MODELO_DE_TRABALHO: "Modelo de Trabalho Sólido",
  ANTAGONISTA: "Modelo Antagonista",
  TROQUEL: "Dentes / Troqueis (para encaixe)",
  GENGIVA_ARTIFICIAL: "Máscara Gengival",
  PLACA_MIORRELAXANTE: "Placa Miorrelaxante",
  ELEMENTO_PROVA: "Elemento para Prova",
  ELEMENTO_PROVISORIO: "Elemento Provisório",
};

export const LAB_WORK_TYPES = [
  { id: "MODELO_COM_TROQUEL", label: "Modelo com Troquel", description: "Modelo anatômico com alvéolos e troqueis destacados" },
  { id: "MODELO_SEM_TROQUEL", label: "Modelo sem Troquel", description: "Modelo anatômico sólido, sem troqueis" },
  { id: "ANTAGONISTA", label: "Antagonista", description: "Arco oponente para conferência e ajuste oclusal" },
  { id: "GENGIVA", label: "Máscara Gengival", description: "Gengiva destacável / máscara flex" },
  { id: "PLACA", label: "Placa", description: "Placa miorrelaxante / bruxismo" },
  { id: "COROA", label: "Coroa", description: "Coroa unitária ou ponte fixa" },
  { id: "COROA_SOBRE_DENTE", label: "Coroa sobre Dente", description: "Preparo dental convencional" },
  { id: "COROA_SOBRE_IMPLANTE", label: "Coroa sobre Implante", description: "Com link ou orifício para assentamento sobre implante" },
  { id: "CERAMICA_DE_CARGA", label: "Cerâmica de Carga", description: "Resina cerâmica com alta carga de partículas" },
  { id: "OUTRO", label: "Outro", description: "Outros modelos, gengiva ou dispositivos" },
] as const;

export const LAB_WORK_TYPE_LABELS: Record<string, string> = {
  MODELO_COM_TROQUEL: "Modelo com Troquel",
  MODELO_SEM_TROQUEL: "Modelo sem Troquel",
  GENGIVA: "Máscara Gengival",
  PLACA: "Placa",
  COROA: "Coroa",
  COROA_SOBRE_DENTE: "Coroa sobre Dente",
  COROA_SOBRE_IMPLANTE: "Coroa sobre Implante",
  CERAMICA_DE_CARGA: "Cerâmica de Carga",
  OUTRO: "Outro",
  // Compatibilidade com enums antigos
  MODELO_COM_FUROS: "Modelo com Troquel",
  MODELO_DE_TRABALHO: "Modelo de Trabalho",
  ANTAGONISTA: "Antagonista",
  TROQUEL: "Troquel",
  GENGIVA_ARTIFICIAL: "Gengiva",
  PLACA_MIORRELAXANTE: "Placa",
  ELEMENTO_PROVA: "Elemento Prova",
  ELEMENTO_PROVISORIO: "Elemento Provisório",
};

export const PRINT_CARD_STATUS_CONFIG = {
  NA_FILA: { label: "Na Fila", color: "bg-slate-800 text-slate-300 border-slate-700", step: 1 },
  PREPARANDO: { label: "Preparando", color: "bg-indigo-500/20 text-indigo-300 border-indigo-500/40", step: 2 },
  IMPRIMINDO: { label: "Imprimindo", color: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40", step: 3 },
  IMPRESSO: { label: "Impresso", color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40", step: 4 },
  CONCLUIDO: { label: "Concluído", color: "bg-teal-500/20 text-teal-300 border-teal-500/40", step: 5 },
  FALHOU: { label: "Falhou", color: "bg-rose-500/20 text-rose-300 border-rose-500/40", step: 0 },
  CANCELADO: { label: "Cancelado", color: "bg-zinc-800 text-zinc-400 border-zinc-700", step: 0 },
} as const;

export const PROCESS_TYPES = {
  IMPRESSAO: "Impressão 3D (Resinas)",
} as const;

export type ProcessType = keyof typeof PROCESS_TYPES;

export const USER_ROLES = {
  ADMIN: "Administrador / Gestor",
  CADISTA: "Cadista (Design / Modelagem)",
  OPERADOR_IMPRESSAO: "Operador de Impressão 3D & Resinas",
} as const;

export type UserRole = keyof typeof USER_ROLES | "OPERADOR_RESINA" | "PROTETICO_ACABAMENTO";

export const ROLE_PERMISSIONS: Record<string, { label: string; description: string; paths: string[] }> = {
  ADMIN: {
    label: "Administrador / Gestor",
    description: "Acesso irrestrito a todos os setores do laboratório, configurações e auditoria.",
    paths: ["/dashboard", "/cadista/status", "/fila", "/resinas", "/calibracoes", "/impressoras", "/historico", "/admin/usuarios", "/admin/configuracoes"],
  },
  CADISTA: {
    label: "Cadista (Design / Modelagem)",
    description: "Criação de novos trabalhos e encaminhamento para a fila de impressão 3D.",
    paths: ["/dashboard", "/cadista/status", "/fila", "/historico"],
  },
  OPERADOR_IMPRESSAO: {
    label: "Operador de Impressão 3D & Resinas",
    description: "Gestão completa da esteira 3D: fila de impressão, envio de mesas, impressoras, resinas e calibrações.",
    paths: ["/dashboard", "/fila", "/impressoras", "/resinas", "/calibracoes", "/historico"],
  },
};

export const PRINTER_STATUS = {
  DISPONIVEL: { label: "Disponível", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  MANUTENCAO_VENCIDA: { label: "Manutenção Vencida", color: "bg-amber-50 text-amber-700 border-amber-200" },
  REPROVADA: { label: "Reprovada", color: "bg-rose-50 text-rose-700 border-rose-200" },
  INATIVA: { label: "Inativa", color: "bg-slate-50 text-slate-600 border-slate-200" },
} as const;

export const RESIN_STATUS = {
  AGUARDANDO_CALIBRACAO: { label: "Aguardando Calibração", color: "bg-amber-50 text-amber-700 border-amber-200" },
  CALIBRADA: { label: "Calibrada", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  REPROVADA: { label: "Reprovada", color: "bg-rose-50 text-rose-700 border-rose-200" },
} as const;

export const DEFAULT_SYSTEM_SETTINGS = {
  maintenance_interval_days: 7,
  calibration_hexagon_min: 9.99,
  calibration_hexagon_max: 10.01,
  normal_print_prefix: "A",
  retry_print_prefix: "00A",
};
