import { Case, PrintJob, PrintJobItem, Printer, PrinterMaintenance, ResinBatch, ResinCalibration, PrintRun, DentalFileType } from "./database.types";

export type ResinCalibrationDetail = ResinCalibration & {
  resin_brand: string;
  resin_lot: string;
  printer_name: string;
  calibrated_at?: string;
};

export interface QueueItem {
  id: string; // print_job_item_id
  print_job_id: string;
  case_id: string;
  patient_code: string;
  patient_name: string | null;
  file_type: DentalFileType;
  status: PrintJobItem["status"];
  retry_count: number;
  is_retry: boolean;
  last_failure_reason?: string | null;
  last_run_code?: string | null;
  queue_entered_at: string;
  wait_seconds: number;
  priority: number;
}

export interface PatientQueueCard {
  case_id: string;
  patient_code: string;
  patient_name: string | null;
  queue_entered_at: string;
  items: QueueItem[];
}

export type PrinterCalculatedStatus = "DISPONIVEL" | "MANUTENCAO_VENCIDA" | "REPROVADA" | "INATIVA";

export interface PrinterWithStatus extends Printer {
  latest_maintenance?: PrinterMaintenance | null;
  days_since_maintenance?: number | null;
  calculated_status: PrinterCalculatedStatus;
  is_eligible_for_print: boolean;
}

export interface EligibleResinOption {
  resin_batch_id: string;
  brand: string;
  resin_type: string;
  lot: string;
  volume: number;
  volume_unit: string;
  calibration_id: string;
  calibration_number: number;
  layer_height: number;
  exposure_time: number;
  printer_id: string;
  finalized_at?: string | null;
}

export interface DashboardMetrics {
  jobs_waiting: number;
  items_in_queue: number;
  items_printing: number;
  items_completed_today: number;
  items_failed_total: number;
  reprints_pending: number;
  printers_available: number;
  printers_blocked: number;
  resins_calibrated: number;
  resins_awaiting: number;
}

export interface CaseTimelineEvent {
  id: string;
  timestamp: string;
  title: string;
  description: string;
  type: "CREATED" | "QUEUED" | "PREPARED" | "PRINTING" | "COMPLETED" | "FAILED" | "REPRINT" | "MILLING" | "FINISHING";
  badgeColor?: string;
  meta?: Record<string, any>;
}

export interface FinishingCaseItem {
  id: string; // print_job_item_id ou milling_id
  case_id: string;
  patient_code: string;
  patient_name: string | null;
  file_type: DentalFileType;
  has_sockets: boolean; // se é modelo com furos para encaixe de dentes
  origin: "IMPRESSAO" | "FRESAGEM";
  status: "AGUARDANDO_MONTAGEM" | "EM_MAQUIAGEM" | "APROVADO_CQ" | "EXPEDIDO";
  teeth_inserted?: boolean; // dentes encaixados nos furos
  occlusion_checked?: boolean; // oclusão verificada com antagonista
  glaze_applied?: boolean; // maquiagem / glaze aplicado
  assigned_technician?: string | null;
  finished_at?: string | null;
  created_at: string;
}

export type FinishingQueueItem = FinishingCaseItem;

export interface MillingItem {
  id: string;
  case_id: string;
  patient_code: string;
  patient_name: string | null;
  file_type: DentalFileType;
  material: "ZIRCONIA" | "PMMA" | "CERA";
  block_lot?: string;
  status: "AGUARDANDO_FRESAGEM" | "EM_USINAGEM" | "FRESADO_CONCLUIDO" | "FALHOU";
  started_at?: string | null;
  finished_at?: string | null;
  created_at: string;
}

export type MillingQueueItem = MillingItem;

export type PrintCardStatus =
  | "NA_FILA"
  | "PREPARANDO"
  | "IMPRIMINDO"
  | "IMPRESSO"
  | "CONCLUIDO"
  | "FALHOU"
  | "CANCELADO";

export type LabWorkType =
  | "MODELO_COM_TROQUEL"
  | "PLACA"
  | "COROA"
  | "COROA_SOBRE_DENTE"
  | "COROA_SOBRE_IMPLANTE"
  | "CERAMICA_DE_CARGA"
  | "OUTRO";

export interface PrintCardItem {
  id: string;
  case_id: string;
  print_job_id: string;
  patient_code: string;
  patient_name: string | null;
  clinic_name: string;
  cadista_name: string;
  work_type: LabWorkType | string;
  priority: "NORMAL" | "URGENTE";
  due_date?: string | null;
  material?: string | null;
  quantity: number;
  notes?: string | null;
  file_name: string;
  file_size?: number | null;
  file_hash?: string | null;
  file_url?: string | null;
  backup_path?: string | null;
  backup_done: boolean;
  backup_done_at?: string | null;
  status: PrintCardStatus;
  batch_id?: string | null;
  batch_name?: string | null;
  is_retry: boolean;
  retry_count: number;
  reprint_reason?: string | null;
  parent_item_id?: string | null;
  last_failure_reason?: string | null;
  last_run_code?: string | null;
  created_at: string;
  updated_at?: string;
  queue_entered_at: string;
}

export interface ActiveRunInfo {
  id: string;
  run_code: string;
  printer_name: string;
  started_at?: string | null;
  items_count: number;
  item_ids: string[];
}

export interface DuplicateCheckInput {
  patient: string;
  clinic: string;
  work_type: string;
  file_name: string;
  file_hash?: string;
}

export interface DuplicateMatch {
  matched_item: PrintCardItem;
  match_type: "EXACT_FILE" | "SAME_PATIENT_WORK" | "SAME_NAME_DIFFERENT_HASH";
  current_status: PrintCardStatus;
  status_label: string;
  created_at: string;
  batch_name?: string | null;
  cadista_name?: string;
  suggested_action: "REPRINT" | "NEW_VERSION" | "WARN_EXISTING";
  alert_level: "HIGH" | "MEDIUM" | "LOW";
  message: string;
}

export interface DuplicateCheckResult {
  has_duplicate: boolean;
  matches: DuplicateMatch[];
}

