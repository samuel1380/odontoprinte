export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "ADMIN" | "CADISTA" | "OPERADOR_RESINA" | "OPERADOR_IMPRESSAO" | "PROTETICO_ACABAMENTO";
export type ProcessType = "FRESAGEM" | "IMPRESSAO";
export type DentalFileType =
  | "MODELO_COM_FUROS"
  | "MODELO_DE_TRABALHO"
  | "ANTAGONISTA"
  | "TROQUEL"
  | "GENGIVA_ARTIFICIAL"
  | "COROA_FRESADA"
  | "PLACA_MIORRELAXANTE"
  | "ELEMENTO_PROVA"
  | "ELEMENTO_PROVISORIO"
  | "ELEMENTO_CARGA_CERAMICA";

export type PrintJobStatus = "AGUARDANDO" | "PARCIAL" | "CONCLUIDO" | "CANCELADO";
export type PrintItemStatus =
  | "AGUARDANDO_FILA"
  | "EM_PREPARO"
  | "EM_IMPRESSAO"
  | "PRONTO_ACABAMENTO"
  | "CONCLUIDO"
  | "FALHOU_REIMPRESSAO";

export type ResinBatchStatus = "AGUARDANDO_CALIBRACAO" | "CALIBRADA" | "REPROVADA";
export type CalibrationStatus = "EM_ANDAMENTO" | "APROVADA" | "REPROVADA";
export type PrintRunStatus = "PREPARADA" | "EM_IMPRESSAO" | "FINALIZADA" | "CANCELADA";
export type PrintRunItemResult = "PENDENTE" | "CONCLUIDO" | "FALHOU";

export interface Profile {
  id: string;
  full_name: string;
  email?: string | null;
  role: UserRole;
  active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface SystemSettings {
  id: string;
  maintenance_interval_days: number;
  calibration_hexagon_min: number;
  calibration_hexagon_max: number;
  normal_print_prefix: string;
  retry_print_prefix: string;
  updated_at: string;
}

export interface Case {
  id: string;
  patient_code: string;
  patient_name: string | null;
  notes: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface CaseStatusEvent {
  id: string;
  case_id: string;
  process_type: ProcessType;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
}

export interface PrintJob {
  id: string;
  case_id: string;
  source_status_event_id?: string | null;
  queue_entered_at: string;
  status: PrintJobStatus;
  priority: number;
  created_by?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface PrintJobItem {
  id: string;
  print_job_id: string;
  file_type: DentalFileType;
  status: PrintItemStatus;
  retry_count: number;
  is_retry: boolean;
  last_failure_reason?: string | null;
  last_run_code?: string | null;
  // Campos aprimorados do laboratório
  clinic_name?: string | null;
  cadista_name?: string | null;
  work_type?: string | null;
  priority?: "NORMAL" | "URGENTE";
  due_date?: string | null;
  material?: string | null;
  quantity?: number;
  notes?: string | null;
  file_name?: string | null;
  file_size?: number | null;
  file_hash?: string | null;
  file_url?: string | null;
  backup_path?: string | null;
  backup_done?: boolean;
  backup_done_at?: string | null;
  batch_id?: string | null;
  batch_name?: string | null;
  parent_item_id?: string | null;
  reprint_count?: number;
  reprint_reason?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface Printer {
  id: string;
  name: string;
  brand: string;
  model: string;
  serial_number: string;
  maintenance_contact?: string | null;
  active: boolean;
  /** Medidas da mesa/chapa em mm (editável; null = detectar pelo modelo) */
  plate_width_mm?: number | null;
  plate_depth_mm?: number | null;
  plate_height_mm?: number | null;
  created_at: string;
  updated_at?: string;
}

export interface PrinterMaintenance {
  id: string;
  printer_id: string;
  performed_at: string;
  leveling_ok: boolean;
  cleaning_ok: boolean;
  fep_integrity_ok: boolean;
  led_integrity_ok: boolean;
  black_points_led: boolean;
  low_led_luminosity: boolean;
  protective_film_ok: boolean;
  notes?: string | null;
  approved: boolean;
  performed_by?: string | null;
  created_at: string;
}

export interface ResinBatch {
  id: string;
  brand: string;
  resin_type: string;
  lot: string;
  volume: number;
  volume_unit: string;
  received_at: string;
  status: ResinBatchStatus;
  active: boolean;
  created_by?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface ResinCalibration {
  id: string;
  resin_batch_id: string;
  printer_id: string;
  calibration_number: number;
  initial_exposure_time: number;
  exposure_time: number;
  lift_speed: number;
  layer_height: number;
  hexagon_size_mm: number;
  lines_visible: boolean;
  numbers_visible: boolean;
  details_visible: boolean;
  wash_time: number;
  cure_time: number;
  status: CalibrationStatus;
  finalized_at?: string | null;
  created_by?: string | null;
  created_at: string;
}

export interface PrintRun {
  id: string;
  run_code: string;
  printer_id: string;
  resin_batch_id: string;
  calibration_id: string;
  supports_confirmed: boolean;
  resin_manipulated: boolean;
  status: PrintRunStatus;
  started_at?: string | null;
  finished_at?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface PrintRunItem {
  id: string;
  print_run_id: string;
  print_job_item_id: string;
  result: PrintRunItemResult;
  failure_reason?: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id?: string | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  old_data?: Json | null;
  new_data?: Json | null;
  created_at: string;
}

export interface PrintBatch {
  id: string;
  batch_name: string;
  batch_number?: number | null;
  printer_name?: string | null;
  printer_id?: string | null;
  status: "AGUARDANDO" | "EM_PREPARO" | "IMPRIMINDO" | "CONCLUIDO" | "FALHOU";
  failure_reason?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface PrintItemHistory {
  id: string;
  item_id: string;
  from_status?: string | null;
  to_status: string;
  changed_by?: string | null;
  changed_by_name?: string | null;
  notes?: string | null;
  created_at: string;
}

