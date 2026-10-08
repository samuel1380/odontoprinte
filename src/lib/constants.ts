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
    paths: ["/dashboard", "/cadista/status", "/fila", "/fatiador", "/impressoes", "/resinas", "/calibracoes", "/impressoras", "/historico", "/admin/usuarios", "/admin/configuracoes"],
  },
  CADISTA: {
    label: "Cadista (Design / Modelagem)",
    description: "Criação de novos trabalhos e encaminhamento para a fila de impressão 3D.",
    paths: ["/dashboard", "/cadista/status", "/fila", "/historico"],
  },
  OPERADOR_IMPRESSAO: {
    label: "Operador de Impressão 3D & Resinas",
    description: "Gestão completa da esteira 3D: fila de impressão, fatiamento, impressoras, resinas e calibrações.",
    paths: ["/dashboard", "/fila", "/fatiador", "/impressoes", "/impressoras", "/resinas", "/calibracoes", "/historico"],
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
