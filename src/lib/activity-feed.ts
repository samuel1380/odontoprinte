/**
 * Feed de "Atividades recentes" em português claro.
 * Formato: [Quem] [fez o quê] [em qual item] — [quando]
 */

export type ActivityKind =
  | "added"
  | "printed"
  | "failed"
  | "reprint"
  | "done"
  | "info"
  | "warning";

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  /** Frase principal: "Maria marcou como Impresso: Coroa – João Silva" */
  title: string;
  /** Complemento curto: "Clínica Sorriso" */
  detail?: string | null;
  created_at: string;
  /** "há 5 min", "hoje às 14:30", "ontem às 16:10" */
  relative: string;
  href?: string;
  count?: number;
}

/** Tempo relativo em português, sem timestamp bruto. */
export function formatRelativeTime(iso: string, nowMs: number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "";
  const diff = Math.max(0, nowMs - t);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora mesmo";
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.floor(mins / 60);
  const d = new Date(t);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const sameDay = new Date(nowMs).toDateString() === d.toDateString();
  if (sameDay) return hours < 6 ? `há ${hours} h` : `hoje às ${hh}:${mm}`;
  const yesterday = new Date(nowMs - 86400000).toDateString() === d.toDateString();
  if (yesterday) return `ontem às ${hh}:${mm}`;
  const dd = String(d.getDate()).padStart(2, "0");
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mo} às ${hh}:${mm}`;
}

interface RawLog {
  id: string;
  user_id?: string | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  old_data?: any;
  new_data?: any;
  created_at: string;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function pickName(nd: any): { patient: string; clinic: string; work: string } {
  const patient =
    str(nd?.patient_code) ||
    str(nd?.patient) ||
    (str(nd?.patient_name) ? str(nd?.patient_name) : "");
  const patientName = str(nd?.patient_name);
  const clinic = str(nd?.clinic) || str(nd?.clinic_name);
  const work =
    str(nd?.work_type) ||
    str(nd?.item_type) ||
    str(nd?.file_type) ||
    str(nd?.file_name) ||
    "";
  return {
    patient: patientName && patientName !== patient ? `${patient} (${patientName})` : patient,
    clinic,
    work,
  };
}

function actorName(log: RawLog, users: Map<string, string>): string {
  const byId = log.user_id ? users.get(log.user_id) : undefined;
  if (byId) return byId;
  const inline =
    str(log.new_data?.changed_by_name) ||
    str(log.new_data?.user_name) ||
    str(log.new_data?.technician);
  return inline || "Equipe";
}

/**
 * Constrói itens de feed a partir dos logs brutos (mais recentes primeiro).
 * Agrupa criações em sequência do mesmo autor ("adicionou 4 arquivos").
 */
export function buildActivityFeed(
  logs: RawLog[],
  users: Map<string, string>,
  opts?: { limit?: number; nowMs?: number }
): ActivityItem[] {
  const nowMs = opts?.nowMs ?? Date.now();
  const limit = opts?.limit ?? 15;
  const sorted = [...logs].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const items: ActivityItem[] = [];

  const linkFor = (log: RawLog): string | undefined => {
    if (log.entity_type === "print_runs" && log.entity_id) return `/impressoes/${log.entity_id}`;
    if (log.entity_type === "printers" && log.entity_id) return `/impressoras/${log.entity_id}`;
    if (log.entity_type === "resin_batches" && log.entity_id) return `/resinas/${log.entity_id}`;
    if (
      log.entity_type === "print_job_items" ||
      log.entity_type === "cases" ||
      log.entity_type === "finishing_cases" ||
      log.entity_type === "milling_items"
    )
      return "/fila";
    return "/historico";
  };

  const push = (item: ActivityItem) => {
    if (items.length < limit * 3) items.push(item);
  };

  for (const log of sorted) {
    const nd = log.new_data || {};
    const who = actorName(log, users);
    const { patient, clinic, work } = pickName(nd);
    const itemLabel = [work, patient].filter(Boolean).join(" – ") || "item";
    const href = linkFor(log);
    const relative = formatRelativeTime(log.created_at, nowMs);

    switch (log.action) {
      case "PRINT_CARDS_CREATED": {
        const count = Number(nd.count) || 1;
        push({
          id: log.id,
          kind: "added",
          title:
            count > 1
              ? `${who} adicionou ${count} arquivos na fila`
              : `${who} adicionou 1 arquivo na fila`,
          detail: [clinic, patient].filter(Boolean).join(" · ") || undefined,
          created_at: log.created_at,
          relative,
          href: "/fila",
          count,
        });
        break;
      }
      case "TRABALHO_CRIADO": {
        push({
          id: log.id,
          kind: "added",
          title: `${who} cadastrou o trabalho ${str(nd.patient_code) || "novo"}`,
          detail: [str(nd.patient_name), clinic].filter(Boolean).join(" · ") || undefined,
          created_at: log.created_at,
          relative,
          href: "/fila",
        });
        break;
      }
      case "ITEM_REIMPRESSAO": {
        push({
          id: log.id,
          kind: "reprint",
          title: `Atenção: ${itemLabel} voltou para a fila (reimpressão)`,
          detail: str(nd.reason) || str(nd.failure_reason) || undefined,
          created_at: log.created_at,
          relative,
          href,
        });
        break;
      }
      case "ITEM_CONCLUIDO":
      case "ITEM_ENVIADO_ACABAMENTO": {
        push({
          id: log.id,
          kind: "printed",
          title: `${who} marcou como Impresso: ${itemLabel}`,
          detail: [str(nd.run_code) ? `Mesa ${nd.run_code}` : "", clinic]
            .filter(Boolean)
            .join(" · ") || undefined,
          created_at: log.created_at,
          relative,
          href,
        });
        break;
      }
      case "ACABAMENTO_APROVADO": {
        push({
          id: log.id,
          kind: "done",
          title: `${who} aprovou no controle de qualidade: ${itemLabel}`,
          detail: clinic || undefined,
          created_at: log.created_at,
          relative,
          href: "/acabamento",
        });
        break;
      }
      case "IMPRESSAO_INICIADA": {
        push({
          id: log.id,
          kind: "info",
          title: `${who} iniciou a mesa ${str(nd.run_code) || ""}`.trim(),
          detail: `${Number(nd.items_count) || 0} modelo(s) · ${str(nd.printer) || "impressora"}`,
          created_at: log.created_at,
          relative,
          href,
        });
        break;
      }
      case "IMPRESSAO_FINALIZADA": {
        const done = Number(nd.completed ?? nd.completed_count) || 0;
        const failed = Number(nd.failed ?? nd.failed_count) || 0;
        push({
          id: log.id,
          kind: failed > 0 ? "warning" : "done",
          title: failed > 0
            ? `Mesa ${str(nd.run_code)} concluída com ${failed} falha(s)`
            : `Mesa ${str(nd.run_code)} concluída: ${done} aprovado(s)`,
          detail: failed > 0 ? `${failed} peça(s) voltaram para a fila` : undefined,
          created_at: log.created_at,
          relative,
          href,
        });
        break;
      }
      case "LOTE_FALHOU":
      case "MANUTENCAO_REPROVADA":
      case "CALIBRACAO_REPROVADA":
      case "FRESAGEM_FALHOU": {
        push({
          id: log.id,
          kind: "failed",
          title: `${who} registrou falha: ${itemLabel}`,
          detail: str(nd.reason) || str(nd.failure_reason) || undefined,
          created_at: log.created_at,
          relative,
          href,
        });
        break;
      }
      case "MANUTENCAO_APROVADA":
      case "CALIBRACAO_APROVADA":
      case "RECEBIMENTO_RESINA":
      case "FRESAGEM_CONCLUIDA":
      case "FRESAGEM_INICIADA":
      case "IMPRESSORA_EXCLUIDO":
      case "IMPRESSORA_EXCLUIDA":
      case "LOTE_RESINA_EXCLUIDO": {
        push({
          id: log.id,
          kind: log.action.includes("FALH") || log.action.includes("EXCLU") ? "warning" : "done",
          title: `${who} atualizou: ${humanizeAction(log.action)}${itemLabel !== "item" ? ` (${itemLabel})` : ""}`,
          detail: undefined,
          created_at: log.created_at,
          relative,
          href,
        });
        break;
      }
      default: {
        // Qualquer ação nova ou de status: frase genérica, nunca ID/JSON
        if (log.action.startsWith("STATUS_CARD_")) {
          const to = log.action.replace("STATUS_CARD_", "");
          push({
            id: log.id,
            kind: to === "FALHOU" ? "failed" : to === "CONCLUIDO" ? "done" : "info",
            title: `${who} moveu ${itemLabel} para ${humanizeStatus(to)}`,
            detail: clinic || undefined,
            created_at: log.created_at,
            relative,
            href,
          });
        } else {
          push({
            id: log.id,
            kind: "info",
            title: `${who} registrou uma atualização${itemLabel !== "item" ? `: ${itemLabel}` : ""}`,
            detail: undefined,
            created_at: log.created_at,
            relative,
            href,
          });
        }
      }
    }
  }

  return items.slice(0, limit);
}

function humanizeStatus(s: string): string {
  const map: Record<string, string> = {
    NA_FILA: "Na fila",
    PREPARANDO: "Preparando",
    IMPRIMINDO: "Imprimindo",
    IMPRESSO: "Impresso",
    CONCLUIDO: "Concluído",
    FALHOU: "Falhou",
    CANCELADO: "Cancelado",
  };
  return map[s] || s;
}

function humanizeAction(a: string): string {
  return a
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
