/**
 * Status do lote (pedido) derivado dos status dos itens dele.
 * O lote nunca tem status próprio gravado: sempre reflete os itens,
 * então nunca dessincroniza.
 */

export type BatchDerivedStatus =
  | "AGUARDANDO"
  | "PREPARANDO"
  | "IMPRIMINDO"
  | "IMPRESSO"
  | "CONCLUIDO"
  | "ERRO";

export const BATCH_STATUS_CONFIG: Record<
  BatchDerivedStatus,
  { label: string; chip: string }
> = {
  AGUARDANDO: { label: "Aguardando", chip: "bg-slate-800 text-slate-300 border-slate-700" },
  PREPARANDO: { label: "Preparando", chip: "bg-slate-100 text-slate-800 border-slate-200" },
  IMPRIMINDO: { label: "Imprimindo", chip: "bg-white text-slate-900 border-white" },
  IMPRESSO: { label: "Impresso", chip: "bg-slate-700 text-white border-slate-600" },
  CONCLUIDO: { label: "Concluído", chip: "bg-emerald-950 text-emerald-300 border-emerald-900" },
  ERRO: { label: "Erro", chip: "bg-red-950 text-red-300 border-red-900" },
};

/** Prioridade de exibição: o estágio mais avançado/urgente presente vence. */
export function deriveBatchStatus(
  itemStatuses: Array<string | null | undefined>
): BatchDerivedStatus {
  const list = itemStatuses.filter(Boolean) as string[];
  if (list.length === 0) return "AGUARDANDO";
  const terminal = (s: string) => s === "CONCLUIDO" || s === "CANCELADO";
  if (list.every(terminal)) return "CONCLUIDO";
  if (list.some((s) => s === "IMPRIMINDO")) return "IMPRIMINDO";
  if (list.some((s) => s === "FALHOU")) return "ERRO";
  if (list.some((s) => s === "IMPRESSO")) return "IMPRESSO";
  if (list.some((s) => s === "PREPARANDO")) return "PREPARANDO";
  return "AGUARDANDO";
}

/** Título do lote: "Impressão #4" (ou nome personalizado, se houver). */
export function batchTitle(batchName: string | null | undefined, batchNumber?: number | null): string {
  if (batchNumber !== null && batchNumber !== undefined) return `Impressão #${batchNumber}`;
  return batchName || "Impressão";
}
