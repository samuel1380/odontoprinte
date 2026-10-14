import { createClient } from "@/lib/supabase/client";
import {
  Case,
  PrintJob,
  PrintJobItem,
  Printer,
  PrinterMaintenance,
  ResinBatch,
  ResinCalibration,
  PrintRun,
  PrintRunItem,
  AuditLog,
  SystemSettings,
  DentalFileType,
  ProcessType,
  Profile,
  UserRole,
  PrintBatch,
  PrintItemHistory,
} from "@/types/database.types";
import {
  QueueItem,
  PatientQueueCard,
  PrinterWithStatus,
  EligibleResinOption,
  DashboardMetrics,
  CaseTimelineEvent,
  FinishingCaseItem,
  MillingItem,
  PrintCardItem,
  PrintCardStatus,
  LabWorkType,
  DuplicateCheckInput,
  DuplicateCheckResult,
  DuplicateMatch,
} from "@/types/domain";
import {
  validateMaintenanceChecklist,
  calculatePrinterStatus,
  validateResinCalibration,
  formatPrintRunCode,
  MaintenanceChecklistInput,
  ResinCalibrationInput,
} from "@/lib/business-rules";
import { DEFAULT_SYSTEM_SETTINGS, FILE_TYPE_LABELS } from "@/lib/constants";
import { validateAccessRequest, translateSupabaseAuthError } from "@/lib/auth-errors";

// ====================================================================
// ====================================================================
// INITIAL DEMO STATE & LOCAL PERSISTENCE HELPERS
// ====================================================================
function loadLocal<T>(key: string, fallback: T): T {
  if (typeof window !== "undefined") {
    try {
      const data = localStorage.getItem(key);
      if (data) return JSON.parse(data);
    } catch {
      // ignore
    }
  }
  return fallback;
}

function saveLocal<T>(key: string, val: T): void {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch {
      // ignore
    }
  }
}

function getUpdatedTime(item: any): number {
  const t = item?.updated_at || item?.created_at || 0;
  const n = new Date(t).getTime();
  return isNaN(n) ? 0 : n;
}

function mergeById<T extends { id: string }>(
  remoteList: T[] | null | undefined,
  localList: T[] | null | undefined
): T[] {
  const map = new Map<string, T>();
  if (Array.isArray(localList)) {
    for (const item of localList) {
      if (item && item.id) {
        map.set(item.id, item);
      }
    }
  }
  if (Array.isArray(remoteList)) {
    for (const item of remoteList) {
      if (item && item.id) {
        const existing = map.get(item.id);
        // CORREÇÃO fila->CONCLUIDO: antes o remoto (antigo) sempre
        // sobrescrevia o local (novo), revertendo o avanço de status
        // logo após o clique. Agora vence quem tem updated_at maior.
        if (!existing) {
          map.set(item.id, item);
        } else {
          map.set(item.id, getUpdatedTime(item) >= getUpdatedTime(existing) ? item : existing);
        }
      }
    }
  }
  return Array.from(map.values());
}

let mockSettings: SystemSettings = {
  id: "90000000-0000-0000-0000-000000000001",
  maintenance_interval_days: 7,
  calibration_hexagon_min: 9.99,
  calibration_hexagon_max: 10.01,
  normal_print_prefix: "A",
  retry_print_prefix: "00A",
  updated_at: new Date().toISOString(),
};

let mockPrinters: Printer[] = [];
let mockMaintenances: PrinterMaintenance[] = [];
let mockResinBatches: ResinBatch[] = [];
let mockCalibrations: ResinCalibration[] = [];
let mockCases: Case[] = [];
let mockPrintJobs: PrintJob[] = [];
let mockPrintJobItems: PrintJobItem[] = [];
let mockPrintRuns: PrintRun[] = [];
let mockPrintRunItems: PrintRunItem[] = [];
let mockAuditLogs: AuditLog[] = [];
let mockMillingItems: MillingItem[] = [];
let mockFinishingItems: FinishingCaseItem[] = [];
let mockPrintBatches: PrintBatch[] = [];
let mockPrintItemHistory: PrintItemHistory[] = [];

let normalSeqCounter = 0;
let retrySeqCounter = 0;

// ====================================================================
// ODONTOPRINT SERVICE CLASS
// ====================================================================
export class OdontoPrintService {
  private static getSupabase() {
    return createClient();
  }

  // --- SETTINGS ---
  static async getSettings(): Promise<SystemSettings> {
    mockSettings = loadLocal("odontoprint_system_settings", mockSettings);
    const { client, isConfigured } = this.getSupabase();
    if (isConfigured && client) {
      try {
        const { data, error } = await client.from("system_settings").select("*").limit(1).single();
        if (!error && data) {
          mockSettings = { ...mockSettings, ...data };
          saveLocal("odontoprint_system_settings", mockSettings);
          return mockSettings;
        }
      } catch (err) {
        console.warn("Supabase getSettings error:", err);
      }
    }
    return mockSettings;
  }

  static async updateSettings(settings: Partial<SystemSettings>): Promise<SystemSettings> {
    mockSettings = loadLocal("odontoprint_system_settings", mockSettings);
    mockSettings = {
      ...mockSettings,
      ...settings,
      updated_at: new Date().toISOString(),
    };
    saveLocal("odontoprint_system_settings", mockSettings);

    const { client, isConfigured } = this.getSupabase();
    if (isConfigured && client) {
      try {
        if (mockSettings.id && mockSettings.id !== "90000000-0000-0000-0000-000000000001") {
          await client.from("system_settings").update(settings).eq("id", mockSettings.id);
        } else {
          const { data: current } = await client.from("system_settings").select("id").limit(1).single();
          if (current?.id) {
            mockSettings.id = current.id;
            saveLocal("odontoprint_system_settings", mockSettings);
            await client.from("system_settings").update(settings).eq("id", current.id);
          }
        }
      } catch (err) {
        console.warn("Supabase updateSettings error:", err);
      }
    }
    return mockSettings;
  }

  // --- CASISTA: CRIAR CASO / TRABALHO ---
  static async createCadistaCase(params: {
    patient_code: string;
    patient_name?: string;
    notes?: string;
    process_type: ProcessType;
    selected_files: DentalFileType[];
    user_id?: string;
  }): Promise<{ success: boolean; case_id: string; job_id: string; error?: string }> {
    // REGRA FUNDAMENTAL: Se nenhum item for selecionado, NÃO criar
    if (!params.selected_files || params.selected_files.length === 0) {
      return {
        success: false,
        case_id: "",
        job_id: "",
        error: "Selecione pelo menos um arquivo para continuar.",
      };
    }

    const cleanCode = params.patient_code.trim().toUpperCase();
    if (!cleanCode) {
      return { success: false, case_id: "", job_id: "", error: "O código do paciente/trabalho é obrigatório." };
    }

    const caseId = crypto.randomUUID();
    const eventId = crypto.randomUUID();
    const jobId = crypto.randomUUID();
    const now = new Date().toISOString();

    const newCase: Case = {
      id: caseId,
      patient_code: cleanCode,
      patient_name: params.patient_name?.trim() || null,
      notes: params.notes?.trim() || null,
      created_by: params.user_id || null,
      created_at: now,
      updated_at: now,
    };

    const newJob: PrintJob = {
      id: jobId,
      case_id: caseId,
      source_status_event_id: eventId,
      queue_entered_at: now,
      status: "AGUARDANDO",
      priority: 1,
      created_by: params.user_id || null,
      created_at: now,
      updated_at: now,
    };

    const millingFileTypes = ["COROA_FRESADA", "ELEMENTO_CARGA_CERAMICA"];

    // Separação inteligente: se o Cadista escolheu Fresagem ou itens de fresagem, vai para a fila de Fresagem
    const millingFiles = params.selected_files.filter(
      (f) => millingFileTypes.includes(f) || params.process_type === "FRESAGEM"
    );
    // Itens de manufatura aditiva vão para a Fila FIFO de Impressão 3D
    const printFiles = params.selected_files.filter(
      (f) => !millingFileTypes.includes(f) && params.process_type !== "FRESAGEM"
    );

    // Registra na fila de Fresagem CNC se houver itens de usinagem
    for (const f of millingFiles) {
      mockMillingItems.unshift({
        id: crypto.randomUUID(),
        case_id: caseId,
        patient_code: cleanCode,
        patient_name: params.patient_name?.trim() || null,
        file_type: f,
        material: f === "ELEMENTO_CARGA_CERAMICA" ? "ZIRCONIA" : "PMMA",
        status: "AGUARDANDO_FRESAGEM",
        created_at: now,
      });
    }

    // Registra na fila de Impressão 3D se houver modelos/troqueis
    const newItems: PrintJobItem[] = (printFiles.length > 0 ? printFiles : (params.process_type === "IMPRESSAO" ? params.selected_files : [])).map((fileType) => ({
      id: crypto.randomUUID(),
      print_job_id: jobId,
      file_type: fileType,
      status: "AGUARDANDO_FILA",
      retry_count: 0,
      is_retry: false,
      created_at: now,
      updated_at: now,
    }));

    // Persist in mock state & localStorage
    mockCases = loadLocal("odontoprint_cases", mockCases);
    mockCases.unshift(newCase);
    saveLocal("odontoprint_cases", mockCases);

    if (millingFiles.length > 0) {
      mockMillingItems = loadLocal("odontoprint_milling_items", mockMillingItems);
      saveLocal("odontoprint_milling_items", mockMillingItems);
    }

    if (newItems.length > 0) {
      mockPrintJobs = loadLocal("odontoprint_jobs", mockPrintJobs);
      mockPrintJobs.unshift(newJob);
      saveLocal("odontoprint_jobs", mockPrintJobs);

      mockPrintJobItems = loadLocal("odontoprint_job_items", mockPrintJobItems);
      mockPrintJobItems.unshift(...newItems);
      saveLocal("odontoprint_job_items", mockPrintJobItems);
    }

    // Audit log
    mockAuditLogs = loadLocal("odontoprint_audit_logs", mockAuditLogs);
    mockAuditLogs.unshift({
      id: crypto.randomUUID(),
      user_id: params.user_id || null,
      action: "TRABALHO_CRIADO",
      entity_type: "cases",
      entity_id: caseId,
      new_data: {
        patient_code: cleanCode,
        process_type: params.process_type,
        items: params.selected_files.map((f) => FILE_TYPE_LABELS[f]),
      },
      created_at: now,
    });
    saveLocal("odontoprint_audit_logs", mockAuditLogs);

    // If live Supabase is connected, persist to DB
    const { client, isConfigured } = this.getSupabase();
    if (isConfigured && client) {
      try {
        let { error: caseErr } = await client.from("cases").insert(newCase);
        if (caseErr && (caseErr.message?.includes("foreign key") || (caseErr as any).code === "23503")) {
          await client.from("cases").insert({ ...newCase, created_by: null });
        }
        await client.from("case_status_events").insert({
          id: eventId,
          case_id: caseId,
          process_type: params.process_type,
          notes: params.notes || null,
          created_by: null,
          created_at: now,
        });
        if (newItems.length > 0) {
          await client.from("print_jobs").insert({ ...newJob, created_by: null });
          await client.from("print_job_items").insert(newItems);
        }
      } catch (err) {
        console.error("Supabase insert error (fallback preserved):", err);
      }
    }

    return { success: true, case_id: caseId, job_id: jobId };
  }

  static async createCaseWithItems(params: {
    patient_code: string;
    patient_name?: string;
    clinical_notes?: string;
    files: Array<{
      file_type: DentalFileType | string;
      file_name?: string;
      label?: string;
      category?: string;
    }>;
    user_id?: string;
  }): Promise<{ id: string; patient_code: string; success: boolean } | null> {
    const selectedFiles = params.files.map((f) => f.file_type as DentalFileType);
    const res = await this.createCadistaCase({
      patient_code: params.patient_code,
      patient_name: params.patient_name,
      notes: params.clinical_notes,
      process_type: "IMPRESSAO",
      selected_files: selectedFiles,
      user_id: params.user_id,
    });
    if (!res.success) return null;
    return { id: res.case_id, patient_code: params.patient_code, success: true };
  }

  // --- CASOS / PACIENTES ---
  static async getCases(): Promise<Case[]> {
    mockCases = loadLocal("odontoprint_cases", mockCases);
    const { client, isConfigured } = this.getSupabase();
    if (isConfigured && client) {
      try {
        const { data, error } = await client.from("cases").select("*").order("created_at", { ascending: false });
        if (!error && data) {
          mockCases = mergeById(data, mockCases);
          saveLocal("odontoprint_cases", mockCases);
        }
      } catch (err) {
        console.warn("Supabase getCases error:", err);
      }
    }
    return [...mockCases].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  // --- FILA DE IMPRESSÃO (FIFO) ---
  static async getQueue(): Promise<{ items: QueueItem[]; cards: PatientQueueCard[] }> {
    const settings = await this.getSettings();

    mockPrintJobItems = loadLocal("odontoprint_job_items", mockPrintJobItems);
    mockPrintJobs = loadLocal("odontoprint_jobs", mockPrintJobs);
    mockCases = loadLocal("odontoprint_cases", mockCases);

    const { client, isConfigured } = this.getSupabase();
    if (isConfigured && client) {
      try {
        const { data: jobItems, error: jiErr } = await client.from("print_job_items").select("*");
        const { data: jobs, error: jErr } = await client.from("print_jobs").select("*");
        const { data: cases, error: cErr } = await client.from("cases").select("*");

        if (!jiErr && jobItems) {
          mockPrintJobItems = mergeById(jobItems, mockPrintJobItems);
          saveLocal("odontoprint_job_items", mockPrintJobItems);
        }
        if (!jErr && jobs) {
          mockPrintJobs = mergeById(jobs, mockPrintJobs);
          saveLocal("odontoprint_jobs", mockPrintJobs);
        }
        if (!cErr && cases) {
          mockCases = mergeById(cases, mockCases);
          saveLocal("odontoprint_cases", mockCases);
        }
      } catch (err) {
        console.warn("Supabase getQueue error:", err);
      }
    }

    mockPrintJobItems = loadLocal("odontoprint_job_items", mockPrintJobItems);
    mockPrintJobs = loadLocal("odontoprint_jobs", mockPrintJobs);
    mockCases = loadLocal("odontoprint_cases", mockCases);

    // Filtra itens aguardando na fila
    const waitingItems = mockPrintJobItems.filter((i) => i.status === "AGUARDANDO_FILA");

    // Enriquece com dados do job e caso
    const enriched: QueueItem[] = waitingItems.map((item) => {
      const job = mockPrintJobs.find((j) => j.id === item.print_job_id);
      const caseItem = job ? mockCases.find((c) => c.id === job.case_id) : null;
      const enteredAt = job?.queue_entered_at || item.created_at;
      const waitSeconds = Math.max(0, Math.floor((Date.now() - new Date(enteredAt).getTime()) / 1000));

      return {
        id: item.id,
        print_job_id: item.print_job_id,
        case_id: caseItem?.id || "",
        patient_code: caseItem?.patient_code || "PAC-???",
        patient_name: caseItem?.patient_name || null,
        file_type: item.file_type,
        status: item.status,
        retry_count: item.retry_count,
        is_retry: item.is_retry,
        last_failure_reason: item.last_failure_reason || null,
        last_run_code: item.last_run_code || null,
        queue_entered_at: enteredAt,
        wait_seconds: waitSeconds,
        priority: job?.priority || 1,
      };
    });

    // Ordenação FIFO: primeiro quem entrou primeiro (queue_entered_at asc), com prioridade para reimpressões
    enriched.sort((a, b) => {
      if (a.is_retry !== b.is_retry) return a.is_retry ? -1 : 1;
      return new Date(a.queue_entered_at).getTime() - new Date(b.queue_entered_at).getTime();
    });

    // Agrupa em cards de paciente
    const cardsMap = new Map<string, PatientQueueCard>();
    for (const item of enriched) {
      if (!cardsMap.has(item.case_id)) {
        cardsMap.set(item.case_id, {
          case_id: item.case_id,
          patient_code: item.patient_code,
          patient_name: item.patient_name,
          queue_entered_at: item.queue_entered_at,
          items: [],
        });
      }
      cardsMap.get(item.case_id)!.items.push(item);
    }

    const cards = Array.from(cardsMap.values());
    return { items: enriched, cards };
  }

  static async getQueueItems(): Promise<QueueItem[]> {
    const res = await this.getQueue();
    return res.items;
  }

  // ====================================================================
  // MÓDULO: FILA DE IMPRESSÃO 3D AVANÇADA (CARDS, LOTES, DUPLICIDADE, BACKUP)
  // ====================================================================

  private static normalizeText(str: string): string {
    if (!str) return "";
    return str
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  static mapDbStatusToCardStatus(status: string): PrintCardStatus {
    switch (status) {
      case "AGUARDANDO_FILA":
      case "NA_FILA":
        return "NA_FILA";
      case "EM_PREPARO":
      case "PREPARANDO":
        return "PREPARANDO";
      case "EM_IMPRESSAO":
      case "IMPRIMINDO":
        return "IMPRIMINDO";
      case "PRONTO_ACABAMENTO":
      case "IMPRESSO":
        return "IMPRESSO";
      case "CONCLUIDO":
        return "CONCLUIDO";
      case "FALHOU_REIMPRESSAO":
      case "FALHOU":
        return "FALHOU";
      case "CANCELADO":
        return "CANCELADO";
      default:
        return "NA_FILA";
    }
  }

  static mapCardStatusToDbStatus(status: PrintCardStatus): string {
    switch (status) {
      case "NA_FILA":
        return "AGUARDANDO_FILA";
      case "PREPARANDO":
        return "EM_PREPARO";
      case "IMPRIMINDO":
        return "EM_IMPRESSAO";
      case "IMPRESSO":
        return "PRONTO_ACABAMENTO";
      case "CONCLUIDO":
        return "CONCLUIDO";
      case "FALHOU":
        return "FALHOU_REIMPRESSAO";
      case "CANCELADO":
        return "CANCELADO";
    }
  }

  static getLastUsedPreferences(): { clinic: string; cadista: string } {
    return {
      clinic: loadLocal("odontoprint_last_clinic", "Clínica Principal"),
      cadista: loadLocal("odontoprint_last_cadista", "Cadista"),
    };
  }

  static saveLastUsedPreferences(clinic: string, cadista: string): void {
    if (clinic) saveLocal("odontoprint_last_clinic", clinic);
    if (cadista) saveLocal("odontoprint_last_cadista", cadista);
  }

  static async getPrintCards(filters?: {
    status?: PrintCardStatus | "TODOS";
    clinic?: string;
    cadista?: string;
    batch_id?: string;
    is_retry?: boolean;
    search?: string;
    today?: boolean;
  }): Promise<PrintCardItem[]> {
    mockPrintJobItems = loadLocal("odontoprint_job_items", mockPrintJobItems);
    mockPrintJobs = loadLocal("odontoprint_jobs", mockPrintJobs);
    mockCases = loadLocal("odontoprint_cases", mockCases);
    mockPrintBatches = loadLocal("odontoprint_batches", mockPrintBatches);

    const { client, isConfigured } = this.getSupabase();
    if (isConfigured && client) {
      try {
        const { data: jobItems, error: jiErr } = await client.from("print_job_items").select("*");
        const { data: jobs, error: jErr } = await client.from("print_jobs").select("*");
        const { data: cases, error: cErr } = await client.from("cases").select("*");
        const { data: batches, error: bErr } = await client.from("print_batches").select("*");

        if (!jiErr && jobItems) {
          mockPrintJobItems = mergeById(jobItems, mockPrintJobItems);
          saveLocal("odontoprint_job_items", mockPrintJobItems);
        }
        if (!jErr && jobs) {
          mockPrintJobs = mergeById(jobs, mockPrintJobs);
          saveLocal("odontoprint_jobs", mockPrintJobs);
        }
        if (!cErr && cases) {
          mockCases = mergeById(cases, mockCases);
          saveLocal("odontoprint_cases", mockCases);
        }
        if (!bErr && batches) {
          mockPrintBatches = mergeById(batches, mockPrintBatches);
          saveLocal("odontoprint_batches", mockPrintBatches);
        }
      } catch (err) {
        console.warn("Supabase getPrintCards error:", err);
      }
    }

    const cards: PrintCardItem[] = mockPrintJobItems.map((item) => {
      const job = mockPrintJobs.find((j) => j.id === item.print_job_id);
      const caseItem = job ? mockCases.find((c) => c.id === job.case_id) : null;
      const batch = item.batch_id ? mockPrintBatches.find((b) => b.id === item.batch_id) : null;
      const enteredAt = job?.queue_entered_at || item.created_at || new Date().toISOString();
      const patientCode = caseItem?.patient_code || "PAC-SEM-CODIGO";
      const clinicName = item.clinic_name || "Clínica Geral";
      const cadistaName = item.cadista_name || "Cadista";
      const cardStatus = this.mapDbStatusToCardStatus(item.status);
      const fileName = item.file_name || `${patientCode}_${item.file_type || "MODELO"}.stl`;
      const backupPath = item.backup_path || null;
      const backupDone = item.backup_done ?? false;

      return {
        id: item.id,
        case_id: caseItem?.id || "",
        print_job_id: item.print_job_id,
        patient_code: patientCode,
        patient_name: caseItem?.patient_name || null,
        clinic_name: clinicName,
        cadista_name: cadistaName,
        work_type: item.work_type || item.file_type || "MODELO_COM_TROQUEL",
        priority: item.priority || (job?.priority && job.priority > 1 ? "URGENTE" : "NORMAL"),
        due_date: item.due_date || null,
        material: item.material || null,
        quantity: item.quantity || 1,
        notes: item.notes || caseItem?.notes || null,
        file_name: fileName,
        file_size: item.file_size || null,
        file_hash: item.file_hash || null,
        file_url: item.file_url || null,
        backup_path: backupPath,
        backup_done: backupDone,
        backup_done_at: item.backup_done_at || null,
        status: cardStatus,
        batch_id: item.batch_id || null,
        batch_name: batch?.batch_name || item.batch_name || null,
        is_retry: Boolean(item.is_retry),
        retry_count: item.retry_count || item.reprint_count || 0,
        reprint_reason: item.reprint_reason || item.last_failure_reason || null,
        parent_item_id: item.parent_item_id || null,
        last_failure_reason: item.last_failure_reason || null,
        last_run_code: (item as any).last_run_code || null,
        created_at: item.created_at || new Date().toISOString(),
        updated_at: item.updated_at || item.created_at,
        queue_entered_at: enteredAt,
      };
    });

    let filtered = cards;

    if (filters) {
      if (filters.status && filters.status !== "TODOS") {
        filtered = filtered.filter((c) => c.status === filters.status);
      }
      if (filters.clinic && filters.clinic !== "TODAS") {
        filtered = filtered.filter((c) => c.clinic_name.toLowerCase() === filters.clinic!.toLowerCase());
      }
      if (filters.cadista && filters.cadista !== "TODOS") {
        filtered = filtered.filter((c) => c.cadista_name.toLowerCase() === filters.cadista!.toLowerCase());
      }
      if (filters.batch_id) {
        filtered = filtered.filter((c) => c.batch_id === filters.batch_id);
      }
      if (filters.is_retry) {
        filtered = filtered.filter((c) => c.is_retry);
      }
      if (filters.today) {
        const todayStr = new Date().toISOString().split("T")[0];
        filtered = filtered.filter((c) => c.created_at.startsWith(todayStr) || (c.updated_at && c.updated_at.startsWith(todayStr)));
      }
      if (filters.search && filters.search.trim()) {
        const q = this.normalizeText(filters.search);
        filtered = filtered.filter((c) => {
          return (
            this.normalizeText(c.patient_code).includes(q) ||
            (c.patient_name && this.normalizeText(c.patient_name).includes(q)) ||
            this.normalizeText(c.clinic_name).includes(q) ||
            this.normalizeText(c.cadista_name).includes(q) ||
            this.normalizeText(c.file_name).includes(q) ||
            this.normalizeText(String(c.work_type)).includes(q)
          );
        });
      }
    }

    filtered.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority === "URGENTE" ? -1 : 1;
      if (a.is_retry !== b.is_retry) return a.is_retry ? -1 : 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return filtered;
  }

  static async checkDuplicates(inputs: DuplicateCheckInput[]): Promise<DuplicateCheckResult> {
    const existingCards = await this.getPrintCards();
    const matches: DuplicateMatch[] = [];

    for (const input of inputs) {
      const normPatient = this.normalizeText(input.patient);
      const normClinic = this.normalizeText(input.clinic);
      const normFileName = input.file_name.toLowerCase().trim();

      for (const card of existingCards) {
        const cardPatientCode = this.normalizeText(card.patient_code);
        const cardPatientName = card.patient_name ? this.normalizeText(card.patient_name) : "";
        const cardClinic = this.normalizeText(card.clinic_name);
        const cardFileName = card.file_name.toLowerCase().trim();

        const isExactHash = Boolean(input.file_hash && card.file_hash && input.file_hash === card.file_hash);
        const isSameName = normFileName === cardFileName;
        const isSamePatient = normPatient === cardPatientCode || (Boolean(cardPatientName) && normPatient === cardPatientName);
        const isSameClinic = normClinic === cardClinic;
        const isSameWorkType = input.work_type === card.work_type;

        let matchType: DuplicateMatch["match_type"] | null = null;
        if (isExactHash) {
          matchType = "EXACT_FILE";
        } else if (isSamePatient && isSameClinic && isSameWorkType) {
          matchType = isSameName ? "EXACT_FILE" : "SAME_PATIENT_WORK";
        } else if (isSameName && isSamePatient) {
          matchType = "SAME_NAME_DIFFERENT_HASH";
        }

        if (matchType) {
          let suggestedAction: DuplicateMatch["suggested_action"] = "WARN_EXISTING";
          let alertLevel: DuplicateMatch["alert_level"] = "HIGH";
          let message = "";

          if (card.status === "FALHOU") {
            suggestedAction = "REPRINT";
            alertLevel = "LOW";
            message = `O trabalho anterior de ${card.patient_code} falhou. Recomenda-se cadastrar como REIMPRESSÃO vinculada ao original.`;
          } else if (card.status === "IMPRESSO" || card.status === "CONCLUIDO") {
            suggestedAction = "REPRINT";
            alertLevel = "HIGH";
            message = `ATENÇÃO: Este trabalho já foi ${card.status === "CONCLUIDO" ? "concluído" : "impresso"} em ${new Date(card.created_at).toLocaleDateString("pt-BR")}. Provável duplicidade acidental!`;
          } else if (card.status === "NA_FILA" || card.status === "PREPARANDO" || card.status === "IMPRIMINDO") {
            suggestedAction = "WARN_EXISTING";
            alertLevel = "HIGH";
            message = `ALERTA: Este trabalho já está na esteira ativa (Status: ${card.status}). Evite duplicar para não imprimir duas vezes!`;
          }

          if (matchType === "SAME_NAME_DIFFERENT_HASH" || (matchType === "SAME_PATIENT_WORK" && !isExactHash)) {
            suggestedAction = "NEW_VERSION";
            message += " (Arquivo com novo hash detectado: pode ser uma nova versão/ajuste enviada pelo cadista).";
          }

          matches.push({
            matched_item: card,
            match_type: matchType,
            current_status: card.status,
            status_label: card.status,
            created_at: card.created_at,
            batch_name: card.batch_name,
            cadista_name: card.cadista_name,
            suggested_action: suggestedAction,
            alert_level: alertLevel,
            message,
          });
          break;
        }
      }
    }

    return {
      has_duplicate: matches.length > 0,
      matches,
    };
  }

  static async createPrintCards(
    cardsToCreate: Array<{
      patient: string;
      patient_name?: string;
      clinic: string;
      cadista: string;
      work_type: string;
      priority?: "NORMAL" | "URGENTE";
      due_date?: string;
      material?: string;
      quantity?: number;
      notes?: string;
      file_name: string;
      file_size?: number;
      file_hash?: string;
      is_retry?: boolean;
      reprint_reason?: string;
      parent_item_id?: string;
    }>,
    user_id?: string,
    user_name?: string
  ): Promise<{ success: boolean; created_count: number; created_ids: string[]; error?: string }> {
    if (!cardsToCreate || cardsToCreate.length === 0) {
      return { success: false, created_count: 0, created_ids: [], error: "Nenhum arquivo ou item para cadastrar." };
    }

    mockPrintJobItems = loadLocal("odontoprint_job_items", mockPrintJobItems);
    mockPrintJobs = loadLocal("odontoprint_jobs", mockPrintJobs);
    mockCases = loadLocal("odontoprint_cases", mockCases);
    mockPrintItemHistory = loadLocal("odontoprint_item_history", mockPrintItemHistory);
    mockAuditLogs = loadLocal("odontoprint_audit_logs", mockAuditLogs);

    const now = new Date().toISOString();
    const createdItems: PrintJobItem[] = [];
    const historyEntries: PrintItemHistory[] = [];
    const newCaseIds: string[] = [];
    const newJobIds: string[] = [];
    const casesToInsert: Case[] = [];
    const jobsToInsert: PrintJob[] = [];

    if (cardsToCreate[0]) {
      this.saveLastUsedPreferences(cardsToCreate[0].clinic, cardsToCreate[0].cadista);
    }

    for (const card of cardsToCreate) {
      const patientCode = card.patient.trim().toUpperCase();
      let existingCase =
        mockCases.find((c) => this.normalizeText(c.patient_code) === this.normalizeText(patientCode)) ||
        casesToInsert.find((c) => this.normalizeText(c.patient_code) === this.normalizeText(patientCode));

      let caseId = existingCase?.id;
      if (!caseId) {
        caseId = crypto.randomUUID();
        newCaseIds.push(caseId);
        const newCase: Case = {
          id: caseId,
          patient_code: patientCode,
          patient_name: card.patient_name?.trim() || null,
          notes: card.notes || null,
          created_by: user_id || null,
          created_at: now,
          updated_at: now,
        };
        casesToInsert.push(newCase);
        mockCases.unshift(newCase);
      }

      const jobId = crypto.randomUUID();
      newJobIds.push(jobId);
      const newJob: PrintJob = {
        id: jobId,
        case_id: caseId,
        queue_entered_at: now,
        status: "AGUARDANDO",
        priority: card.priority === "URGENTE" ? 2 : 1,
        created_by: user_id || null,
        created_at: now,
        updated_at: now,
      };
      jobsToInsert.push(newJob);
      mockPrintJobs.unshift(newJob);

      const itemId = crypto.randomUUID();

      // Somente metadados do arquivo vão ao banco central (nome, tamanho,
      // hash). O conteúdo 3D nunca é armazenado: fica na pasta do laboratório.
      const newItem: PrintJobItem = {
        id: itemId,
        print_job_id: jobId,
        file_type: "MODELO_DE_TRABALHO" as DentalFileType,
        status: "AGUARDANDO_FILA",
        retry_count: card.is_retry ? 1 : 0,
        is_retry: Boolean(card.is_retry),
        clinic_name: card.clinic.trim(),
        cadista_name: card.cadista.trim(),
        work_type: card.work_type,
        priority: card.priority || "NORMAL",
        due_date: card.due_date || null,
        material: card.material || null,
        quantity: card.quantity || 1,
        notes: card.notes || null,
        file_name: card.file_name,
        file_size: card.file_size || null,
        file_hash: card.file_hash || null,
        file_url: null,
        backup_path: null,
        backup_done: false,
        parent_item_id: card.parent_item_id || null,
        reprint_count: card.is_retry ? 1 : 0,
        reprint_reason: card.reprint_reason || null,
        created_at: now,
        updated_at: now,
      };

      createdItems.push(newItem);
      mockPrintJobItems.unshift(newItem);

      const hist: PrintItemHistory = {
        id: crypto.randomUUID(),
        item_id: itemId,
        from_status: null,
        to_status: "NA_FILA",
        changed_by: user_id || null,
        changed_by_name: user_name || card.cadista,
        notes: card.is_retry ? `Item criado como REIMPRESSÃO: ${card.reprint_reason || "Sem motivo"}` : "Item cadastrado na esteira 3D.",
        created_at: now,
      };
      historyEntries.push(hist);
      mockPrintItemHistory.unshift(hist);
    }

    saveLocal("odontoprint_cases", mockCases);
    saveLocal("odontoprint_jobs", mockPrintJobs);
    saveLocal("odontoprint_job_items", mockPrintJobItems);
    saveLocal("odontoprint_item_history", mockPrintItemHistory);

    // Evento agrupado para "Atividades recentes" (ex.: "adicionou 4 arquivos")
    const createAudit = {
      id: crypto.randomUUID(),
      user_id: user_id || null,
      action: "PRINT_CARDS_CREATED",
      entity_type: "cases",
      entity_id: null as string | null,
      new_data: {
        count: createdItems.length,
        clinic: cardsToCreate[0]?.clinic?.trim() || null,
        patient_codes: Array.from(new Set(cardsToCreate.map((c) => c.patient.trim().toUpperCase()))).slice(0, 5),
      },
      created_at: now,
    };
    mockAuditLogs.unshift(createAudit as any);
    saveLocal("odontoprint_audit_logs", mockAuditLogs);

    const { client, isConfigured } = this.getSupabase();
    if (isConfigured && client) {
      try {
        // Gravação no banco central com checagem real de erro.
        // Persiste exclusivamente os novos registros criados nesta chamada com updated_at válido
        if (casesToInsert.length > 0) {
          let { error: caseErr } = await client.from("cases").upsert(casesToInsert);
          if (caseErr && (caseErr.message?.includes("foreign key") || (caseErr as any).code === "23503")) {
            const safeCases = casesToInsert.map((c) => ({ ...c, created_by: null }));
            const retry = await client.from("cases").upsert(safeCases);
            caseErr = retry.error;
          }
          if (caseErr) throw new Error(`Falha ao gravar pacientes: ${caseErr.message}`);
        }

        if (jobsToInsert.length > 0) {
          let { error: jobErr } = await client.from("print_jobs").insert(jobsToInsert);
          if (jobErr && (jobErr.message?.includes("foreign key") || (jobErr as any).code === "23503")) {
            const safeJobs = jobsToInsert.map((j) => ({ ...j, created_by: null }));
            const retry = await client.from("print_jobs").insert(safeJobs);
            jobErr = retry.error;
          }
          if (jobErr) throw new Error(`Falha ao gravar trabalhos: ${jobErr.message}`);
        }

        const { error: itemErr } = await client.from("print_job_items").insert(createdItems);
        if (itemErr) throw new Error(`Falha ao gravar itens da fila: ${itemErr.message}`);
        const { error: histErr } = await client.from("print_item_history").insert(historyEntries);
        if (histErr) console.warn("Supabase createPrintCards (histórico) error:", histErr);
        try {
          await client.from("audit_logs").insert(createAudit);
        } catch (auditErr) {
          console.warn("Supabase createPrintCards (atividades) error:", auditErr);
        }
      } catch (err: any) {
        console.warn("Supabase createPrintCards persist error:", err);
        // Reverte o salvamento local para não criar fila fantasma
        // visível só neste aparelho (causa do bug relatado).
        const createdIds = new Set(createdItems.map((i) => i.id));
        const histIds = new Set(historyEntries.map((h) => h.id));
        mockPrintJobItems = loadLocal("odontoprint_job_items", mockPrintJobItems).filter((i) => !createdIds.has(i.id));
        mockPrintJobs = loadLocal("odontoprint_jobs", mockPrintJobs).filter((j) => !newJobIds.includes(j.id));
        mockCases = loadLocal("odontoprint_cases", mockCases).filter((c) => !newCaseIds.includes(c.id));
        mockPrintItemHistory = loadLocal("odontoprint_item_history", mockPrintItemHistory).filter((h) => !histIds.has(h.id));
        saveLocal("odontoprint_job_items", mockPrintJobItems);
        saveLocal("odontoprint_jobs", mockPrintJobs);
        saveLocal("odontoprint_cases", mockCases);
        saveLocal("odontoprint_item_history", mockPrintItemHistory);
        return {
          success: false,
          created_count: 0,
          created_ids: [],
          error: err?.message || "Não foi possível gravar no banco central. Verifique a conexão e tente de novo.",
        };
      }
    }

    return { success: true, created_count: createdItems.length, created_ids: createdItems.map((i) => i.id) };
  }

  static async updateCardStatus(
    id: string,
    newStatus: PrintCardStatus,
    notes?: string,
    user_id?: string,
    user_name?: string
  ): Promise<{ success: boolean; error?: string }> {
    mockPrintJobItems = loadLocal("odontoprint_job_items", mockPrintJobItems);
    mockPrintItemHistory = loadLocal("odontoprint_item_history", mockPrintItemHistory);
    mockAuditLogs = loadLocal("odontoprint_audit_logs", mockAuditLogs);
    mockPrintJobs = loadLocal("odontoprint_jobs", mockPrintJobs);
    mockFinishingItems = loadLocal("odontoprint_finishing_items", mockFinishingItems);

    const item = mockPrintJobItems.find((i) => i.id === id);
    if (!item) return { success: false, error: "Item de impressão não encontrado." };

    const oldStatus = this.mapDbStatusToCardStatus(item.status);
    const now = new Date().toISOString();

    // Guarda contra duplo clique / transição repetida.
    if (oldStatus === newStatus) {
      return { success: true };
    }

    item.status = this.mapCardStatusToDbStatus(newStatus) as any;
    item.updated_at = now;

    // VOLTAR ETAPA: se saiu de CONCLUIDO para uma etapa anterior,
    // reabre a bancada se já tinha aprovado.
    const order: Record<string, number> = {
      NA_FILA: 0,
      PREPARANDO: 1,
      IMPRIMINDO: 2,
      IMPRESSO: 3,
      CONCLUIDO: 4,
    };
    const isStepBack =
      oldStatus in order && newStatus in order && order[newStatus] < order[oldStatus];
    if (isStepBack && oldStatus === "CONCLUIDO") {
      const finishing = mockFinishingItems.find((f) => f.id === item.id);
      if (finishing && finishing.status === "APROVADO_CQ") {
        finishing.status = "AGUARDANDO_MONTAGEM";
        delete (finishing as any).finished_at;
        saveLocal("odontoprint_finishing_items", mockFinishingItems);
      }
    }

    if (newStatus === "FALHOU") {
      item.last_failure_reason = notes || "Falha técnica informada pelo operador.";
      item.is_retry = true;
      item.priority = "URGENTE";
      item.retry_count = (item.retry_count || 0) + 1;
      item.reprint_count = (item.reprint_count || 0) + 1;
      item.reprint_reason = notes || "Falha na impressão";
    }

    // IMPRESSO (PRONTO_ACABAMENTO) alimenta a bancada de acabamento,
    // para o item não "sumir" entre a fila e o acabamento.
    if (newStatus === "IMPRESSO") {
      const parentJobForFinishing = mockPrintJobs.find((j) => j.id === item.print_job_id);
      const parentCaseForFinishing = parentJobForFinishing
        ? mockCases.find((c) => c.id === parentJobForFinishing.case_id)
        : null;
      if (!mockFinishingItems.some((f) => f.id === item.id)) {
        const hasSockets =
          item.file_type === "MODELO_COM_FUROS" || item.file_type === "MODELO_DE_TRABALHO";
        mockFinishingItems.unshift({
          id: item.id,
          case_id: parentJobForFinishing?.case_id || parentCaseForFinishing?.id || "",
          patient_code: parentCaseForFinishing?.patient_code || "PAC",
          patient_name: parentCaseForFinishing?.patient_name || null,
          file_type: item.file_type,
          has_sockets: hasSockets,
          origin: "IMPRESSAO",
          status: "AGUARDANDO_MONTAGEM",
          teeth_inserted: false,
          occlusion_checked: false,
          glaze_applied: false,
          created_at: now,
        });
        saveLocal("odontoprint_finishing_items", mockFinishingItems);
      }
    }

    // Sincroniza o job pai (antes o Kanban nunca atualizava o print_jobs,
    // então dashboard/histórico ficavam presos em AGUARDANDO/PARCIAL).
    const parentJob = mockPrintJobs.find((j) => j.id === item.print_job_id);
    if (parentJob) {
      const siblings = mockPrintJobItems.filter((i) => i.print_job_id === parentJob.id);
      const isPrintDone = (s: string) => s === "CONCLUIDO" || s === "PRONTO_ACABAMENTO";
      if (siblings.length > 0 && siblings.every((i) => isPrintDone(i.status))) {
        parentJob.status = "CONCLUIDO";
      } else if (siblings.some((i) => i.status !== "AGUARDANDO_FILA")) {
        parentJob.status = "PARCIAL";
      }
      (parentJob as any).updated_at = now;
      saveLocal("odontoprint_jobs", mockPrintJobs);
    }

    const hist: PrintItemHistory = {
      id: crypto.randomUUID(),
      item_id: id,
      from_status: oldStatus,
      to_status: newStatus,
      changed_by: user_id || null,
      changed_by_name: user_name || "Operador 3D",
      notes: notes || null,
      created_at: now,
    };
    mockPrintItemHistory.unshift(hist);

    mockAuditLogs.unshift({
      id: crypto.randomUUID(),
      user_id: user_id || null,
      action: `STATUS_CARD_${newStatus}`,
      entity_type: "print_job_items",
      entity_id: id,
      old_data: { status: oldStatus },
      new_data: { status: newStatus, notes },
      created_at: now,
    });

    saveLocal("odontoprint_job_items", mockPrintJobItems);
    saveLocal("odontoprint_item_history", mockPrintItemHistory);
    saveLocal("odontoprint_audit_logs", mockAuditLogs);

    const { client, isConfigured } = this.getSupabase();
    if (isConfigured && client) {
      try {
        // Tenta o update completo; se o banco ainda não tem as colunas
        // da fila avançada, cai para o mínimo (status + updated_at).
        const fullPayload: Record<string, any> = {
          status: item.status,
          priority: item.priority,
          last_failure_reason: item.last_failure_reason,
          retry_count: item.retry_count,
          is_retry: item.is_retry,
          updated_at: now,
        };
        const { error: fullErr } = await client.from("print_job_items").update(fullPayload).eq("id", id);
        if (fullErr) {
          const msg = `${fullErr.message || ""} ${(fullErr as any).details || ""} ${(fullErr as any).hint || ""}`;
          const isMissingColumn =
            /column|last_failure_reason|retry_count|is_retry|schema cache|PGRST/i.test(msg);
          if (isMissingColumn) {
            const { error: minErr } = await client
              .from("print_job_items")
              .update({ status: item.status, updated_at: now })
              .eq("id", id);
            if (minErr) console.warn("Supabase updateCardStatus (fallback mínimo) error:", minErr);
          } else {
            console.warn("Supabase updateCardStatus error:", fullErr);
          }
        }
        if (parentJob) {
          const { error: jobErr } = await client
            .from("print_jobs")
            .update({ status: parentJob.status, updated_at: now })
            .eq("id", parentJob.id);
          if (jobErr) console.warn("Supabase updateCardStatus (job pai) error:", jobErr);
        }
        // Histórico é auxiliar: nunca pode quebrar o avanço de status.
        try {
          await client.from("print_item_history").insert(hist);
        } catch (histErr) {
          console.warn("Supabase updateCardStatus (history) error:", histErr);
        }
      } catch (err) {
        console.warn("Supabase updateCardStatus error:", err);
      }
    }

    return { success: true };
  }

  static async createPrintBatch(params: {
    batch_name: string;
    item_ids: string[];
    printer_name?: string;
    printer_id?: string;
    user_id?: string;
    user_name?: string;
  }): Promise<{ success: boolean; batch?: PrintBatch; error?: string }> {
    if (!params.item_ids || params.item_ids.length === 0) {
      return { success: false, error: "Selecione pelo menos um card para montar o lote/placa." };
    }

    mockPrintBatches = loadLocal("odontoprint_batches", mockPrintBatches);
    mockPrintJobItems = loadLocal("odontoprint_job_items", mockPrintJobItems);
    mockPrintItemHistory = loadLocal("odontoprint_item_history", mockPrintItemHistory);

    const batchId = crypto.randomUUID();
    const now = new Date().toISOString();

    const newBatch: PrintBatch = {
      id: batchId,
      batch_name: params.batch_name.trim(),
      printer_name: params.printer_name?.trim() || null,
      printer_id: params.printer_id || null,
      status: "EM_PREPARO",
      created_by: params.user_id || null,
      created_at: now,
      updated_at: now,
    };

    mockPrintBatches.unshift(newBatch);

    for (const itemId of params.item_ids) {
      const card = mockPrintJobItems.find((i) => i.id === itemId);
      if (card) {
        card.batch_id = batchId;
        card.batch_name = newBatch.batch_name;
        if (card.status === "AGUARDANDO_FILA") {
          card.status = "EM_PREPARO";
        }
        card.updated_at = now;

        mockPrintItemHistory.unshift({
          id: crypto.randomUUID(),
          item_id: itemId,
          from_status: "NA_FILA",
          to_status: "PREPARANDO",
          changed_by: params.user_id || null,
          changed_by_name: params.user_name || "Operador",
          notes: `Vinculado ao lote de impressão: ${newBatch.batch_name}`,
          created_at: now,
        });
      }
    }

    saveLocal("odontoprint_batches", mockPrintBatches);
    saveLocal("odontoprint_job_items", mockPrintJobItems);
    saveLocal("odontoprint_item_history", mockPrintItemHistory);

    const { client, isConfigured } = this.getSupabase();
    if (isConfigured && client) {
      try {
        const { error: batchErr } = await client.from("print_batches").insert(newBatch);
        if (batchErr) console.warn("Supabase createPrintBatch (batch) error:", batchErr);
        for (const itemId of params.item_ids) {
          const { error: itemErr } = await client.from("print_job_items").update({
            batch_id: batchId,
            batch_name: newBatch.batch_name,
            status: "EM_PREPARO",
            updated_at: now,
          }).eq("id", itemId);
          if (itemErr) {
            // Banco sem migration 20261013: tenta só o status.
            const { error: retryErr } = await client.from("print_job_items").update({
              status: "EM_PREPARO",
              updated_at: now,
            }).eq("id", itemId);
            if (retryErr) console.warn("Supabase createPrintBatch (item) error:", retryErr);
          }
        }
      } catch (err) {
        console.warn("Supabase createPrintBatch error:", err);
      }
    }

    return { success: true, batch: newBatch };
  }

  static async failPrintBatch(
    batchId: string,
    reason?: string,
    user_id?: string,
    user_name?: string
  ): Promise<{ success: boolean; affected_count: number; error?: string }> {
    mockPrintBatches = loadLocal("odontoprint_batches", mockPrintBatches);
    mockPrintJobItems = loadLocal("odontoprint_job_items", mockPrintJobItems);
    mockPrintItemHistory = loadLocal("odontoprint_item_history", mockPrintItemHistory);

    const batch = mockPrintBatches.find((b) => b.id === batchId);
    if (!batch) return { success: false, affected_count: 0, error: "Lote não encontrado." };

    const now = new Date().toISOString();
    const failReason = reason?.trim() || "Falha técnica na mesa/lote de impressão";

    batch.status = "FALHOU";
    batch.failure_reason = failReason;
    batch.updated_at = now;

    let affectedCount = 0;
    for (const card of mockPrintJobItems) {
      if (card.batch_id === batchId) {
        const oldStatus = this.mapDbStatusToCardStatus(card.status);
        card.status = "AGUARDANDO_FILA";
        card.is_retry = true;
        card.retry_count = (card.retry_count || 0) + 1;
        card.reprint_count = (card.reprint_count || 0) + 1;
        card.last_failure_reason = failReason;
        card.reprint_reason = failReason;
        card.updated_at = now;
        affectedCount++;

        mockPrintItemHistory.unshift({
          id: crypto.randomUUID(),
          item_id: card.id,
          from_status: oldStatus,
          to_status: "NA_FILA",
          changed_by: user_id || null,
          changed_by_name: user_name || "Operador",
          notes: `LOTE FALHOU (${batch.batch_name}): ${failReason}. Retornado para a Fila de Impressão como Reimpressão.`,
          created_at: now,
        });
      }
    }

    saveLocal("odontoprint_batches", mockPrintBatches);
    saveLocal("odontoprint_job_items", mockPrintJobItems);
    saveLocal("odontoprint_item_history", mockPrintItemHistory);

    const { client, isConfigured } = this.getSupabase();
    if (isConfigured && client) {
      try {
        await client.from("print_batches").update({
          status: "FALHOU",
          failure_reason: failReason,
          updated_at: now,
        }).eq("id", batchId);

        await client.from("print_job_items").update({
          status: "AGUARDANDO_FILA",
          is_retry: true,
          last_failure_reason: failReason,
          reprint_reason: failReason,
          updated_at: now,
        }).eq("batch_id", batchId);
      } catch (err) {
        console.warn("Supabase failPrintBatch error:", err);
      }
    }

    return { success: true, affected_count: affectedCount };
  }

  /**
   * Atualiza a impressora vinculada a uma mesa.
   */
  static async updateBatchPrinter(
    batchId: string,
    printerId: string,
    printerName: string
  ): Promise<{ success: boolean; error?: string }> {
    mockPrintBatches = loadLocal("odontoprint_batches", mockPrintBatches);
    const batch = mockPrintBatches.find((b) => b.id === batchId);
    if (!batch) return { success: false, error: "Mesa não encontrada." };
    const now = new Date().toISOString();
    batch.printer_id = printerId;
    batch.printer_name = printerName;
    batch.updated_at = now;
    saveLocal("odontoprint_batches", mockPrintBatches);

    const { client, isConfigured } = this.getSupabase();
    if (isConfigured && client) {
      try {
        await client
          .from("print_batches")
          .update({
            printer_id: printerId,
            printer_name: printerName,
            updated_at: now,
          })
          .eq("id", batchId);
      } catch (err) {
        console.warn("Supabase updateBatchPrinter error:", err);
      }
    }
    return { success: true };
  }

  /**
   * Cria um pedido/mesa para os itens recém-enviados.
   * Cada mesa é independente: vincula SOMENTE os itens informados,
   * sem alterar o status deles (continuam Aguardando).
   */
  static async createOrderBatch(params: {
    item_ids: string[];
    batch_name?: string;
    printer_id?: string | null;
    printer_name?: string | null;
    user_id?: string;
    user_name?: string;
  }): Promise<{ success: boolean; batch?: PrintBatch; error?: string }> {
    if (!params.item_ids || params.item_ids.length === 0) {
      return { success: false, error: "Nenhum item para formar o pedido." };
    }

    mockPrintBatches = loadLocal("odontoprint_batches", mockPrintBatches);
    mockPrintJobItems = loadLocal("odontoprint_job_items", mockPrintJobItems);
    mockPrintItemHistory = loadLocal("odontoprint_item_history", mockPrintItemHistory);

    const batchId = crypto.randomUUID();
    const now = new Date().toISOString();
    const nextNumber =
      mockPrintBatches.reduce((max, b) => Math.max(max, (b as any).batch_number || 0), 0) + 1;

    const newBatch: PrintBatch = {
      id: batchId,
      batch_name: params.batch_name?.trim() || `Impressão #${nextNumber}`,
      batch_number: nextNumber,
      printer_name: params.printer_name?.trim() || null,
      printer_id: params.printer_id || null,
      status: "AGUARDANDO",
      created_by: params.user_id || null,
      created_at: now,
      updated_at: now,
    };

    mockPrintBatches.unshift(newBatch);

    for (const itemId of params.item_ids) {
      const card = mockPrintJobItems.find((i) => i.id === itemId);
      if (card) {
        card.batch_id = batchId;
        card.batch_name = newBatch.batch_name;
        card.updated_at = now;
        mockPrintItemHistory.unshift({
          id: crypto.randomUUID(),
          item_id: itemId,
          from_status: this.mapDbStatusToCardStatus(card.status),
          to_status: this.mapDbStatusToCardStatus(card.status),
          changed_by: params.user_id || null,
          changed_by_name: params.user_name || "Operador",
          notes: `Incluído no pedido ${newBatch.batch_name}`,
          created_at: now,
        });
      }
    }

    saveLocal("odontoprint_batches", mockPrintBatches);
    saveLocal("odontoprint_job_items", mockPrintJobItems);
    saveLocal("odontoprint_item_history", mockPrintItemHistory);

    const { client, isConfigured } = this.getSupabase();
    if (isConfigured && client) {
      try {
        let { error: batchErr } = await client.from("print_batches").insert(newBatch);
        // Colisão de numeração entre dois aparelhos: busca o maior número
        // real no banco e tenta uma vez com o próximo livre.
        if (batchErr && /duplicate|unique/i.test(`${batchErr.message || ""} ${(batchErr as any).details || ""}`)) {
          try {
            const { data: existing } = await client.from("print_batches").select("id, batch_number");
            const maxRemote = (existing || []).reduce(
              (m: number, b: any) => Math.max(m, Number(b?.batch_number) || 0),
              nextNumber
            );
            newBatch.batch_number = maxRemote + 1;
            newBatch.batch_name = `Impressão #${newBatch.batch_number}`;
            for (const card of mockPrintJobItems) {
              if (card.batch_id === batchId) {
                card.batch_name = newBatch.batch_name;
                card.updated_at = now;
              }
            }
            mockPrintBatches = mockPrintBatches.map((b) => (b.id === batchId ? { ...newBatch } : b));
            saveLocal("odontoprint_batches", mockPrintBatches);
            saveLocal("odontoprint_job_items", mockPrintJobItems);
            const retry = await client.from("print_batches").insert(newBatch);
            batchErr = retry.error;
          } catch (retryErr) {
            console.warn("Supabase createOrderBatch (retry número) error:", retryErr);
          }
        }
        if (batchErr) console.warn("Supabase createOrderBatch (batch) error:", batchErr);
        for (const itemId of params.item_ids) {
          const { error: itemErr } = await client.from("print_job_items").update({
            batch_id: batchId,
            batch_name: newBatch.batch_name,
            updated_at: now,
          }).eq("id", itemId);
          if (itemErr) console.warn("Supabase createOrderBatch (item) error:", itemErr);
        }
        try {
          await client.from("print_item_history").insert(
            mockPrintItemHistory.filter((h) => params.item_ids.includes(h.item_id)).slice(0, params.item_ids.length)
          );
        } catch (histErr) {
          console.warn("Supabase createOrderBatch (history) error:", histErr);
        }
      } catch (err) {
        console.warn("Supabase createOrderBatch error:", err);
      }
    }

    return { success: true, batch: newBatch };
  }

  /**
   * Move um modelo de um pedido para outro (ou para "Sem lote" com null).
   * Usado para juntar modelos no mesmo grupo = mesma impressão da máquina.
   */
  static async moveItemToBatch(
    itemId: string,
    targetBatchId: string | null,
    user_id?: string,
    user_name?: string
  ): Promise<{ success: boolean; error?: string }> {
    mockPrintJobItems = loadLocal("odontoprint_job_items", mockPrintJobItems);
    mockPrintBatches = loadLocal("odontoprint_batches", mockPrintBatches);
    mockPrintItemHistory = loadLocal("odontoprint_item_history", mockPrintItemHistory);

    const item = mockPrintJobItems.find((i) => i.id === itemId);
    if (!item) return { success: false, error: "Modelo não encontrado." };
    if (item.status === "EM_IMPRESSAO") {
      return { success: false, error: "Modelo está imprimindo na máquina e não pode trocar de grupo agora." };
    }

    const now = new Date().toISOString();
    const target = targetBatchId ? mockPrintBatches.find((b) => b.id === targetBatchId) : null;
    if (targetBatchId && !target) return { success: false, error: "Pedido de destino não encontrado." };

    const fromName = item.batch_name || "Sem lote";
    item.batch_id = target ? target.id : null;
    item.batch_name = target ? target.batch_name : null;
    item.updated_at = now;

    mockPrintItemHistory.unshift({
      id: crypto.randomUUID(),
      item_id: itemId,
      from_status: this.mapDbStatusToCardStatus(item.status),
      to_status: this.mapDbStatusToCardStatus(item.status),
      changed_by: user_id || null,
      changed_by_name: user_name || "Operador",
      notes: `Movido de "${fromName}" para "${item.batch_name || "Sem lote"}"`,
      created_at: now,
    });

    saveLocal("odontoprint_job_items", mockPrintJobItems);
    saveLocal("odontoprint_item_history", mockPrintItemHistory);

    const { client, isConfigured } = this.getSupabase();
    if (isConfigured && client) {
      try {
        const { error: itemErr } = await client.from("print_job_items").update({
          batch_id: item.batch_id,
          batch_name: item.batch_name,
          updated_at: now,
        }).eq("id", itemId);
        if (itemErr) console.warn("Supabase moveItemToBatch (item) error:", itemErr);
        try {
          await client.from("print_item_history").insert(
            mockPrintItemHistory.filter((h) => h.item_id === itemId).slice(0, 1)
          );
        } catch (histErr) {
          console.warn("Supabase moveItemToBatch (history) error:", histErr);
        }
      } catch (err) {
        console.warn("Supabase moveItemToBatch error:", err);
      }
    }

    return { success: true };
  }

  /** Itens com falha aguardando a próxima impressão (prioridade). */
  static async getFailedPendingItems(): Promise<PrintJobItem[]> {
    mockPrintJobItems = loadLocal("odontoprint_job_items", mockPrintJobItems);
    const { client, isConfigured } = this.getSupabase();
    if (isConfigured && client) {
      try {
        const { data, error } = await client
          .from("print_job_items")
          .select("*")
          .or("status.eq.FALHOU_REIMPRESSAO,and(is_retry.eq.true,status.in.(AGUARDANDO_FILA,EM_PREPARO))");
        if (!error && data) {
          mockPrintJobItems = mergeById(data, mockPrintJobItems);
          saveLocal("odontoprint_job_items", mockPrintJobItems);
        }
      } catch (err) {
        console.warn("Supabase getFailedPendingItems error:", err);
      }
    }
    return mockPrintJobItems.filter(
      (i) =>
        i.status === "FALHOU_REIMPRESSAO" ||
        (i.is_retry && (i.status === "AGUARDANDO_FILA" || i.status === "EM_PREPARO"))
    );
  }

  /**
   * Junta todas as falhas pendentes num novo pedido = próxima impressão.
   * Falhados voltam à fila como prioridade (mantêm a contagem de tentativas).
   */
  static async collectFailedIntoNewBatch(params?: {
    user_id?: string;
    user_name?: string;
  }): Promise<{ success: boolean; batch?: PrintBatch; count?: number; error?: string }> {
    const failed = await this.getFailedPendingItems();
    if (failed.length === 0) {
      return { success: false, error: "Não há modelos com falha aguardando." };
    }
    const res = await this.createOrderBatch({
      item_ids: failed.map((i) => i.id),
      user_id: params?.user_id,
      user_name: params?.user_name || "Operador",
    });
    if (!res.success || !res.batch) {
      return { success: false, error: res.error || "Não foi possível juntar as falhas." };
    }
    // Falhados retornam à fila dentro do novo pedido (prioridade)
    for (const item of failed) {
      if (item.status === "FALHOU_REIMPRESSAO") {
        await this.updateCardStatus(item.id, "NA_FILA", "Retornou como prioridade da próxima impressão", params?.user_id, params?.user_name || "Operador");
      }
    }
    return { success: true, batch: res.batch, count: failed.length };
  }

  /** Transições em lote permitidas por item (grupo inteiro de uma vez). */
  private static bulkEligibleFrom(to: "PREPARANDO" | "IMPRESSO" | "CONCLUIDO" | "FALHOU"): string[] {
    switch (to) {
      case "PREPARANDO":
        return ["NA_FILA"];
      case "IMPRESSO":
        return ["IMPRIMINDO"];
      case "CONCLUIDO":
        return ["IMPRESSO"];
      case "FALHOU":
        return ["NA_FILA", "PREPARANDO", "IMPRIMINDO", "IMPRESSO"];
    }
  }

  /**
   * Move o grupo inteiro para um status (só itens elegíveis mudam).
   * "IMPRIMINDO" não entra aqui de propósito: impressão de verdade nasce
   * no fatiador (cria mesa/código); a UI direciona para lá.
   */
  static async bulkUpdateGroupStatus(
    itemIds: string[],
    to: "PREPARANDO" | "IMPRESSO" | "CONCLUIDO" | "FALHOU",
    opts?: { reason?: string; user_id?: string; user_name?: string }
  ): Promise<{ success: boolean; moved: number; skipped: number; error?: string }> {
    if (!itemIds || itemIds.length === 0) {
      return { success: false, moved: 0, skipped: 0, error: "Grupo sem itens." };
    }
    mockPrintJobItems = loadLocal("odontoprint_job_items", mockPrintJobItems);
    const eligible = OdontoPrintService.bulkEligibleFrom(to);
    let moved = 0;
    let skipped = 0;
    for (const id of itemIds) {
      const item = mockPrintJobItems.find((i) => i.id === id);
      if (!item) {
        skipped++;
        continue;
      }
      const current = OdontoPrintService.mapDbStatusToCardStatus(item.status);
      if (!eligible.includes(current)) {
        skipped++;
        continue;
      }
      const res = await OdontoPrintService.updateCardStatus(id, to, opts?.reason, opts?.user_id, opts?.user_name);
      if (res.success) moved++;
      else skipped++;
    }
    if (moved === 0) {
      return { success: false, moved, skipped, error: "Nenhum item do grupo podia mudar para esse status." };
    }
    return { success: true, moved, skipped };
  }

  /**
   * Inicia a impressão de uma mesa diretamente vinculando a uma impressora.
   * Cria a ordem oficial (PrintRun), atualiza todos os itens para IMPRIMINDO
   * e marca a mesa como em execução na máquina.
   */
  static async startPrintBatchDirectly(params: {
    batch_id: string;
    printer_id: string;
    user_id?: string;
    user_name?: string;
  }): Promise<{ success: boolean; run_code?: string; run_id?: string; error?: string }> {
    mockPrintBatches = loadLocal("odontoprint_batches", mockPrintBatches);
    mockPrintJobItems = loadLocal("odontoprint_job_items", mockPrintJobItems);
    mockPrinters = loadLocal("odontoprint_printers", mockPrinters);

    const batch = mockPrintBatches.find((b) => b.id === params.batch_id);
    if (!batch) return { success: false, error: "Mesa não encontrada." };

    const printer = mockPrinters.find((p) => p.id === params.printer_id);
    if (!printer) return { success: false, error: "Impressora não encontrada." };

    const items = mockPrintJobItems.filter((i) => i.batch_id === params.batch_id);
    const printableItems = items.filter((i) =>
      ["AGUARDANDO_FILA", "EM_PREPARO", "FALHOU_REIMPRESSAO"].includes(i.status)
    );

    if (printableItems.length === 0) {
      return { success: false, error: "Não há modelos prontos para imprimir nesta mesa." };
    }

    const hasRetry = printableItems.some((i) => i.is_retry);
    const runCode = await this.generatePrintCode(hasRetry);

    const options = await this.getEligibleOptions();
    const resin =
      options.resins.find((r) => r.printer_id === params.printer_id) || options.resins[0];

    const runRes = await this.startPrintRun({
      run_code: runCode,
      printer_id: printer.id,
      resin_batch_id: resin?.resin_batch_id || "mock-resin",
      calibration_id: resin?.calibration_id || "mock-calib",
      item_ids: printableItems.map((i) => i.id),
      supports_confirmed: true,
      resin_manipulated: true,
      user_id: params.user_id,
    });

    if (!runRes.success) {
      return { success: false, error: runRes.error || "Erro ao iniciar execução da impressão." };
    }

    batch.printer_id = printer.id;
    batch.printer_name = printer.name;
    batch.status = "IMPRIMINDO";
    batch.updated_at = new Date().toISOString();
    saveLocal("odontoprint_batches", mockPrintBatches);

    const { client, isConfigured } = this.getSupabase();
    if (isConfigured && client) {
      try {
        await client
          .from("print_batches")
          .update({
            printer_id: printer.id,
            printer_name: printer.name,
            status: "IMPRIMINDO",
            updated_at: batch.updated_at,
          })
          .eq("id", batch.id);
      } catch (err) {
        console.warn("Supabase startPrintBatchDirectly error:", err);
      }
    }

    return { success: true, run_code: runCode, run_id: runRes.run?.id };
  }

  /**
   * Apaga um pedido (lote) e seus itens da fila.
   * Remove referências (mesas, histórico, acabamento) e os trabalhos
   * que ficarem vazios. Os pacientes (cases) são mantidos.
   */
  static async deletePrintBatch(batchId: string): Promise<{ success: boolean; removed_count: number; error?: string }> {
    mockPrintBatches = loadLocal("odontoprint_batches", mockPrintBatches);
    mockPrintJobItems = loadLocal("odontoprint_job_items", mockPrintJobItems);
    mockPrintRunItems = loadLocal("odontoprint_print_run_items", mockPrintRunItems);
    mockPrintItemHistory = loadLocal("odontoprint_item_history", mockPrintItemHistory);
    mockFinishingItems = loadLocal("odontoprint_finishing_items", mockFinishingItems);
    mockPrintJobs = loadLocal("odontoprint_jobs", mockPrintJobs);

    const batch = mockPrintBatches.find((b) => b.id === batchId);
    if (!batch) return { success: false, removed_count: 0, error: "Pedido não encontrado." };

    const itemIds = new Set(mockPrintJobItems.filter((i) => i.batch_id === batchId).map((i) => i.id));
    const removedCount = itemIds.size;
    const affectedJobIds = new Set(
      mockPrintJobItems.filter((i) => itemIds.has(i.id)).map((i) => i.print_job_id)
    );

    mockPrintRunItems = mockPrintRunItems.filter((ri) => !itemIds.has(ri.print_job_item_id));
    mockPrintItemHistory = mockPrintItemHistory.filter((h) => !itemIds.has(h.item_id));
    mockFinishingItems = mockFinishingItems.filter((f) => !itemIds.has(f.id));
    mockPrintJobItems = mockPrintJobItems.filter((i) => !itemIds.has(i.id));
    mockPrintBatches = mockPrintBatches.filter((b) => b.id !== batchId);
    // Trabalhos que ficaram sem nenhum item são removidos junto
    const remainingJobIds = new Set(mockPrintJobItems.map((i) => i.print_job_id));
    const emptiedJobIds = Array.from(affectedJobIds).filter((j) => !remainingJobIds.has(j));
    mockPrintJobs = mockPrintJobs.filter((j) => remainingJobIds.has(j.id));

    saveLocal("odontoprint_print_run_items", mockPrintRunItems);
    saveLocal("odontoprint_item_history", mockPrintItemHistory);
    saveLocal("odontoprint_finishing_items", mockFinishingItems);
    saveLocal("odontoprint_job_items", mockPrintJobItems);
    saveLocal("odontoprint_batches", mockPrintBatches);
    saveLocal("odontoprint_jobs", mockPrintJobs);

    const { client, isConfigured } = this.getSupabase();
    if (isConfigured && client) {
      try {
        if (itemIds.size > 0) {
          const ids = Array.from(itemIds);
          await client.from("print_run_items").delete().in("print_job_item_id", ids);
          await client.from("print_item_history").delete().in("item_id", ids);
          await client.from("print_job_items").delete().in("id", ids);
        }
        await client.from("print_batches").delete().eq("id", batchId);
        if (emptiedJobIds.length > 0) {
          await client.from("print_jobs").delete().in("id", emptiedJobIds);
        }
      } catch (err) {
        console.warn("Supabase deletePrintBatch error:", err);
      }
    }

    return { success: true, removed_count: removedCount };
  }

  static async getPrintBatches(): Promise<Array<PrintBatch & { items_count: number }>> {
    mockPrintBatches = loadLocal("odontoprint_batches", mockPrintBatches);
    mockPrintJobItems = loadLocal("odontoprint_job_items", mockPrintJobItems);

    const { client, isConfigured } = this.getSupabase();
    if (isConfigured && client) {
      try {
        const { data, error } = await client.from("print_batches").select("*").order("created_at", { ascending: false });
        if (!error && data) {
          mockPrintBatches = mergeById(data, mockPrintBatches);
          saveLocal("odontoprint_batches", mockPrintBatches);
        }
      } catch (err) {
        console.warn("Supabase getPrintBatches error:", err);
      }
    }

    return mockPrintBatches.map((b) => ({
      ...b,
      items_count: mockPrintJobItems.filter((i) => i.batch_id === b.id).length,
    }));
  }

  static async getPatientPrintHistory(patientQuery: string): Promise<PrintCardItem[]> {
    const allCards = await this.getPrintCards();
    const q = this.normalizeText(patientQuery);
    return allCards.filter(
      (c) =>
        this.normalizeText(c.patient_code).includes(q) ||
        (Boolean(c.patient_name) && this.normalizeText(c.patient_name!).includes(q))
    );
  }

  static async getCardHistory(itemId: string): Promise<PrintItemHistory[]> {
    mockPrintItemHistory = loadLocal("odontoprint_item_history", mockPrintItemHistory);
    const { client, isConfigured } = this.getSupabase();
    if (isConfigured && client) {
      try {
        const { data, error } = await client
          .from("print_item_history")
          .select("*")
          .eq("item_id", itemId)
          .order("created_at", { ascending: false });
        if (!error && data) {
          mockPrintItemHistory = mergeById(data, mockPrintItemHistory);
          saveLocal("odontoprint_item_history", mockPrintItemHistory);
        }
      } catch (err) {
        console.warn("Supabase getCardHistory error:", err);
      }
    }
    return mockPrintItemHistory
      .filter((h) => h.item_id === itemId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  // --- IMPRESSORAS E MANUTENÇÕES ---
  static async getPrinters(): Promise<PrinterWithStatus[]> {
    const settings = await this.getSettings();
    const deletedPrinters = new Set(loadLocal<string[]>("odontoprint_deleted_printers", []));
    mockPrinters = loadLocal<Printer[]>("odontoprint_printers", mockPrinters).filter((p) => !deletedPrinters.has(p.id));
    mockMaintenances = loadLocal<PrinterMaintenance[]>("odontoprint_maintenances", mockMaintenances);

    const { client, isConfigured } = this.getSupabase();
    if (isConfigured && client) {
      try {
        const { data: printersData, error: pErr } = await client
          .from("printers")
          .select("*")
          .order("name", { ascending: true });
        const { data: maintData, error: mErr } = await client
          .from("printer_maintenances")
          .select("*")
          .order("performed_at", { ascending: false });

        if (!pErr && printersData) {
          const activePrintersData = printersData.filter((p: Printer) => !deletedPrinters.has(p.id));
          mockPrinters = mergeById(activePrintersData, mockPrinters);
          saveLocal("odontoprint_printers", mockPrinters);
        }
        if (!mErr && maintData) {
          mockMaintenances = mergeById(maintData, mockMaintenances);
          saveLocal("odontoprint_maintenances", mockMaintenances);
        }
      } catch (err) {
        console.warn("Supabase getPrinters error:", err);
      }
    }

    mockPrinters = loadLocal<Printer[]>("odontoprint_printers", mockPrinters).filter((p) => !deletedPrinters.has(p.id));
    mockMaintenances = loadLocal<PrinterMaintenance[]>("odontoprint_maintenances", mockMaintenances);

    return mockPrinters.map((printer) => {
      const printerMaint = mockMaintenances
        .filter((m) => m.printer_id === printer.id)
        .sort((a, b) => new Date(b.performed_at).getTime() - new Date(a.performed_at).getTime());

      const latest = printerMaint[0] || null;
      const statusInfo = calculatePrinterStatus(printer, latest, settings.maintenance_interval_days);

      return {
        ...printer,
        latest_maintenance: latest,
        days_since_maintenance: statusInfo.daysSince,
        calculated_status: statusInfo.status,
        is_eligible_for_print: statusInfo.isEligible,
      };
    });
  }

  static async getPrinterById(id: string): Promise<{
    printer: PrinterWithStatus | null;
    maintenances: PrinterMaintenance[];
  }> {
    const printers = await this.getPrinters();
    const printer = printers.find((p) => p.id === id) || null;
    mockMaintenances = loadLocal("odontoprint_maintenances", mockMaintenances);
    const maintenances = mockMaintenances
      .filter((m) => m.printer_id === id)
      .sort((a, b) => new Date(b.performed_at).getTime() - new Date(a.performed_at).getTime());

    return { printer, maintenances };
  }

  static async createPrinter(params: Omit<Printer, "id" | "created_at" | "updated_at" | "active"> & { active?: boolean }): Promise<Printer> {
    const now = new Date().toISOString();
    const newPrinter: Printer = {
      id: crypto.randomUUID(),
      active: params.active ?? true,
      ...params,
      created_at: now,
      updated_at: now,
    };

    // Remove do conjunto de deletadas caso tenha sido reaproveitado
    const deleted = loadLocal<string[]>("odontoprint_deleted_printers", []).filter((d) => d !== newPrinter.id);
    saveLocal("odontoprint_deleted_printers", deleted);

    mockPrinters = loadLocal("odontoprint_printers", mockPrinters);
    mockPrinters.push(newPrinter);
    saveLocal("odontoprint_printers", mockPrinters);

    const { client, isConfigured } = this.getSupabase();
    if (isConfigured && client) {
      try {
        const { error } = await client.from("printers").insert(newPrinter);
        if (error) {
          console.error("Supabase insert printer error:", error);
        }
      } catch (err) {
        console.error("Supabase insert printer exception:", err);
      }
    }
    return newPrinter;
  }

  static async deletePrinter(id: string): Promise<{ success: boolean; error?: string }> {
    // 1. Registra no conjunto de deletadas para evitar re-surgimento em merges
    const deleted = loadLocal<string[]>("odontoprint_deleted_printers", []);
    if (!deleted.includes(id)) {
      deleted.push(id);
      saveLocal("odontoprint_deleted_printers", deleted);
    }

    // 2. Remove do estado e localStorage de impressoras
    mockPrinters = loadLocal<Printer[]>("odontoprint_printers", mockPrinters).filter((p) => p.id !== id);
    saveLocal("odontoprint_printers", mockPrinters);

    // 3. Remove manutenções, calibrações e impressões vinculadas localmente
    mockMaintenances = loadLocal<PrinterMaintenance[]>("odontoprint_maintenances", mockMaintenances).filter((m) => m.printer_id !== id);
    saveLocal("odontoprint_maintenances", mockMaintenances);

    mockCalibrations = loadLocal<ResinCalibration[]>("odontoprint_calibrations", mockCalibrations).filter((c) => c.printer_id !== id);
    saveLocal("odontoprint_calibrations", mockCalibrations);

    mockPrintRuns = loadLocal<PrintRun[]>("odontoprint_print_runs", mockPrintRuns).filter((r) => r.printer_id !== id);
    saveLocal("odontoprint_print_runs", mockPrintRuns);

    // 4. Executa DELETE no Supabase em ordem segura de dependências
    const { client, isConfigured } = this.getSupabase();
    if (isConfigured && client) {
      try {
        await client.from("print_runs").delete().eq("printer_id", id);
        await client.from("resin_calibrations").delete().eq("printer_id", id);
        await client.from("printer_maintenances").delete().eq("printer_id", id);
        const { error } = await client.from("printers").delete().eq("id", id);
        if (error) {
          console.error("Supabase delete printer error:", error);
        }
      } catch (err) {
        console.error("Supabase delete printer exception:", err);
      }
    }

    // 5. Registra log de auditoria
    mockAuditLogs = loadLocal("odontoprint_audit_logs", mockAuditLogs);
    mockAuditLogs.unshift({
      id: crypto.randomUUID(),
      user_id: null,
      action: "IMPRESSORA_EXCLUIDA",
      entity_type: "printers",
      entity_id: id,
      new_data: { id },
      created_at: new Date().toISOString(),
    });
    saveLocal("odontoprint_audit_logs", mockAuditLogs);

    return { success: true };
  }

  static async addPrinterMaintenance(params: {
    printer_id: string;
    checklist: MaintenanceChecklistInput;
    notes?: string;
    performed_by?: string;
  }): Promise<{ success: boolean; maintenance: PrinterMaintenance; approved: boolean }> {
    const approved = validateMaintenanceChecklist(params.checklist);
    const now = new Date().toISOString();

    const newMaint: PrinterMaintenance = {
      id: crypto.randomUUID(),
      printer_id: params.printer_id,
      performed_at: now,
      leveling_ok: params.checklist.leveling_ok,
      cleaning_ok: params.checklist.cleaning_ok,
      fep_integrity_ok: params.checklist.fep_integrity_ok,
      led_integrity_ok: params.checklist.led_integrity_ok,
      black_points_led: params.checklist.black_points_led,
      low_led_luminosity: params.checklist.low_led_luminosity,
      protective_film_ok: params.checklist.protective_film_ok,
      notes: params.notes || null,
      approved,
      performed_by: params.performed_by || null,
      created_at: now,
    };

    mockMaintenances = loadLocal("odontoprint_maintenances", mockMaintenances);
    mockMaintenances.unshift(newMaint);
    saveLocal("odontoprint_maintenances", mockMaintenances);

    const { client, isConfigured } = this.getSupabase();
    if (isConfigured && client) {
      try {
        let { error: maintErr } = await client.from("printer_maintenances").insert(newMaint);
        if (maintErr && (maintErr.message?.includes("foreign key") || (maintErr as any).code === "23503")) {
          await client.from("printer_maintenances").insert({ ...newMaint, performed_by: null });
        }
      } catch (err) {
        console.error("Supabase insert maintenance exception:", err);
      }
    }

    mockPrinters = loadLocal("odontoprint_printers", mockPrinters);
    const printer = mockPrinters.find((p) => p.id === params.printer_id);
    mockAuditLogs = loadLocal("odontoprint_audit_logs", mockAuditLogs);
    mockAuditLogs.unshift({
      id: crypto.randomUUID(),
      user_id: params.performed_by || null,
      action: approved ? "MANUTENCAO_APROVADA" : "MANUTENCAO_REPROVADA",
      entity_type: "printers",
      entity_id: params.printer_id,
      new_data: {
        printer_name: printer?.name,
        approved,
        notes: params.notes,
      },
      created_at: now,
    });
    saveLocal("odontoprint_audit_logs", mockAuditLogs);

    return { success: true, maintenance: newMaint, approved };
  }

  // --- RESINAS E CALIBRAÇÕES ---
  static async getResinBatches(): Promise<ResinBatch[]> {
    const deletedResins = new Set(loadLocal<string[]>("odontoprint_deleted_resins", []));
    mockResinBatches = loadLocal<ResinBatch[]>("odontoprint_resin_batches", mockResinBatches).filter((b) => !deletedResins.has(b.id));

    const { client, isConfigured } = this.getSupabase();
    if (isConfigured && client) {
      try {
        const { data, error } = await client
          .from("resin_batches")
          .select("*")
          .order("received_at", { ascending: false });
        if (!error && data) {
          const activeResins = data.filter((b: ResinBatch) => !deletedResins.has(b.id));
          mockResinBatches = mergeById(activeResins, mockResinBatches);
          saveLocal("odontoprint_resin_batches", mockResinBatches);
        }
      } catch (err) {
        console.warn("Supabase getResinBatches error:", err);
      }
    }
    return [...mockResinBatches]
      .filter((b) => !deletedResins.has(b.id))
      .sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime());
  }

  static async getResinBatchById(id: string): Promise<{
    batch: ResinBatch | null;
    calibrations: (ResinCalibration & { printer_name?: string })[];
  }> {
    const batches = await this.getResinBatches();
    const batch = batches.find((b) => b.id === id) || null;
    mockCalibrations = loadLocal("odontoprint_calibrations", mockCalibrations);
    mockPrinters = loadLocal("odontoprint_printers", mockPrinters);

    const calibrations = mockCalibrations
      .filter((c) => c.resin_batch_id === id)
      .sort((a, b) => b.calibration_number - a.calibration_number)
      .map((c) => ({
        ...c,
        printer_name: mockPrinters.find((p) => p.id === c.printer_id)?.name,
      }));

    return { batch, calibrations };
  }

  static async createResinBatch(params: {
    brand: string;
    resin_type: string;
    lot: string;
    volume: number;
    volume_unit?: string;
    notes?: string;
    created_by?: string;
  }): Promise<ResinBatch> {
    const now = new Date().toISOString();
    const newBatch: ResinBatch = {
      id: crypto.randomUUID(),
      brand: params.brand.trim(),
      resin_type: params.resin_type.trim(),
      lot: params.lot.trim().toUpperCase(),
      volume: params.volume,
      volume_unit: params.volume_unit || "ml",
      received_at: now,
      status: "AGUARDANDO_CALIBRACAO",
      active: true,
      created_by: params.created_by || null,
      created_at: now,
      updated_at: now,
    };

    // Remove do conjunto de deletadas caso tenha sido reaproveitado
    const deleted = loadLocal<string[]>("odontoprint_deleted_resins", []).filter((d) => d !== newBatch.id);
    saveLocal("odontoprint_deleted_resins", deleted);

    mockResinBatches = loadLocal("odontoprint_resin_batches", mockResinBatches);
    mockResinBatches.unshift(newBatch);
    saveLocal("odontoprint_resin_batches", mockResinBatches);

    const { client, isConfigured } = this.getSupabase();
    if (isConfigured && client) {
      try {
        let { error } = await client.from("resin_batches").insert(newBatch);
        if (error && (error.message?.includes("foreign key") || (error as any).code === "23503")) {
          const { error: retryErr } = await client.from("resin_batches").insert({
            ...newBatch,
            created_by: null,
          });
          error = retryErr;
        }
        if (error) {
          console.error("Supabase insert resin_batch error:", error);
        }
      } catch (err) {
        console.error("Supabase insert resin_batch exception:", err);
      }
    }

    mockAuditLogs = loadLocal("odontoprint_audit_logs", mockAuditLogs);
    mockAuditLogs.unshift({
      id: crypto.randomUUID(),
      user_id: params.created_by || null,
      action: "RECEBIMENTO_RESINA",
      entity_type: "resin_batches",
      entity_id: newBatch.id,
      new_data: { brand: newBatch.brand, type: newBatch.resin_type, lot: newBatch.lot },
      created_at: now,
    });
    saveLocal("odontoprint_audit_logs", mockAuditLogs);

    return newBatch;
  }

  static async deleteResinBatch(id: string): Promise<{ success: boolean; error?: string }> {
    // 1. Registra no conjunto de deletadas para evitar re-surgimento em merges
    const deleted = loadLocal<string[]>("odontoprint_deleted_resins", []);
    if (!deleted.includes(id)) {
      deleted.push(id);
      saveLocal("odontoprint_deleted_resins", deleted);
    }

    // 2. Remove do estado e localStorage de lotes de resina
    mockResinBatches = loadLocal<ResinBatch[]>("odontoprint_resin_batches", mockResinBatches).filter((b) => b.id !== id);
    saveLocal("odontoprint_resin_batches", mockResinBatches);

    // 3. Remove calibrações e impressões vinculadas localmente
    mockCalibrations = loadLocal<ResinCalibration[]>("odontoprint_calibrations", mockCalibrations).filter((c) => c.resin_batch_id !== id);
    saveLocal("odontoprint_calibrations", mockCalibrations);

    mockPrintRuns = loadLocal<PrintRun[]>("odontoprint_print_runs", mockPrintRuns).filter((r) => r.resin_batch_id !== id);
    saveLocal("odontoprint_print_runs", mockPrintRuns);

    // 4. Executa DELETE no Supabase em ordem segura de dependências
    const { client, isConfigured } = this.getSupabase();
    if (isConfigured && client) {
      try {
        await client.from("print_runs").delete().eq("resin_batch_id", id);
        await client.from("resin_calibrations").delete().eq("resin_batch_id", id);
        const { error } = await client.from("resin_batches").delete().eq("id", id);
        if (error) {
          console.error("Supabase delete resin_batch error:", error);
        }
      } catch (err) {
        console.error("Supabase delete resin_batch exception:", err);
      }
    }

    // 5. Registra log de auditoria
    mockAuditLogs = loadLocal("odontoprint_audit_logs", mockAuditLogs);
    mockAuditLogs.unshift({
      id: crypto.randomUUID(),
      user_id: null,
      action: "LOTE_RESINA_EXCLUIDO",
      entity_type: "resin_batches",
      entity_id: id,
      new_data: { id },
      created_at: new Date().toISOString(),
    });
    saveLocal("odontoprint_audit_logs", mockAuditLogs);

    return { success: true };
  }

  // --- DIAGNÓSTICO E TESTE DE CONEXÃO COM O BANCO DE DADOS SUPABASE ---
  static async testDatabaseConnection(): Promise<{
    configured: boolean;
    url?: string;
    connected: boolean;
    error?: string;
  }> {
    const { client, isConfigured, supabaseUrl } = this.getSupabase();
    if (!isConfigured || !client) {
      return {
        configured: false,
        connected: false,
        error: "Chaves do Supabase não configuradas no ambiente ou localStorage.",
      };
    }

    try {
      const { data, error } = await client.from("printers").select("id").limit(1);
      if (error) {
        return {
          configured: true,
          url: supabaseUrl,
          connected: false,
          error: `${error.message || error.code || "Erro ao consultar Supabase"} (Código: ${(error as any).code || "42501 - Verifique o RLS no Supabase"})`,
        };
      }
      return {
        configured: true,
        url: supabaseUrl,
        connected: true,
      };
    } catch (err: any) {
      return {
        configured: true,
        url: supabaseUrl,
        connected: false,
        error: err?.message || "Exceção ao comunicar com Supabase.",
      };
    }
  }

  static async getCalibrations(): Promise<(ResinCalibration & { resin_brand: string; resin_lot: string; printer_name: string })[]> {
    mockCalibrations = loadLocal("odontoprint_calibrations", mockCalibrations);
    mockResinBatches = loadLocal("odontoprint_resin_batches", mockResinBatches);
    mockPrinters = loadLocal("odontoprint_printers", mockPrinters);

    const { client, isConfigured } = this.getSupabase();
    if (isConfigured && client) {
      try {
        const { data, error } = await client
          .from("resin_calibrations")
          .select("*")
          .order("created_at", { ascending: false });
        if (!error && data) {
          mockCalibrations = mergeById(data, mockCalibrations);
          saveLocal("odontoprint_calibrations", mockCalibrations);
        }
      } catch (err) {
        console.warn("Supabase getCalibrations error:", err);
      }
    }

    mockCalibrations = loadLocal("odontoprint_calibrations", mockCalibrations);
    await Promise.all([this.getPrinters(), this.getResinBatches()]);
    mockResinBatches = loadLocal("odontoprint_resin_batches", mockResinBatches);
    mockPrinters = loadLocal("odontoprint_printers", mockPrinters);

    return mockCalibrations.map((cal) => {
      const batch = mockResinBatches.find((b) => b.id === cal.resin_batch_id);
      const printer = mockPrinters.find((p) => p.id === cal.printer_id);
      return {
        ...cal,
        resin_brand: batch ? `${batch.brand} (${batch.resin_type})` : "Desconhecida",
        resin_lot: batch ? batch.lot : "—",
        printer_name: printer ? printer.name : "Desconhecida",
      };
    });
  }

  static async registerCalibrationAttempt(params: {
    resin_batch_id: string;
    printer_id: string;
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
    created_by?: string;
  }): Promise<{
    success: boolean;
    approved: boolean;
    calibration: ResinCalibration;
    errorReason?: string;
  }> {
    const settings = await this.getSettings();
    const validation = validateResinCalibration({
      hexagon_size_mm: params.hexagon_size_mm,
      lines_visible: params.lines_visible,
      numbers_visible: params.numbers_visible,
      details_visible: params.details_visible,
      minHex: settings.calibration_hexagon_min,
      maxHex: settings.calibration_hexagon_max,
    });

    mockCalibrations = loadLocal("odontoprint_calibrations", mockCalibrations);
    const existing = mockCalibrations.filter(
      (c) => c.resin_batch_id === params.resin_batch_id && c.printer_id === params.printer_id
    );
    const nextNumber = existing.length + 1;
    const now = new Date().toISOString();

    const newCal: ResinCalibration = {
      id: crypto.randomUUID(),
      resin_batch_id: params.resin_batch_id,
      printer_id: params.printer_id,
      calibration_number: nextNumber,
      initial_exposure_time: params.initial_exposure_time,
      exposure_time: params.exposure_time,
      lift_speed: params.lift_speed,
      layer_height: params.layer_height,
      hexagon_size_mm: params.hexagon_size_mm,
      lines_visible: params.lines_visible,
      numbers_visible: params.numbers_visible,
      details_visible: params.details_visible,
      wash_time: params.wash_time,
      cure_time: params.cure_time,
      status: validation.approved ? "APROVADA" : "REPROVADA",
      finalized_at: validation.approved ? now : null,
      created_by: params.created_by || null,
      created_at: now,
    };

    mockCalibrations.unshift(newCal);
    saveLocal("odontoprint_calibrations", mockCalibrations);

    // Se aprovada, marca o lote como CALIBRADA
    if (validation.approved) {
      mockResinBatches = loadLocal("odontoprint_resin_batches", mockResinBatches);
      const batch = mockResinBatches.find((b) => b.id === params.resin_batch_id);
      if (batch) {
        batch.status = "CALIBRADA";
        saveLocal("odontoprint_resin_batches", mockResinBatches);
      }
    }

    const { client, isConfigured } = this.getSupabase();
    if (isConfigured && client) {
      try {
        let { error: calErr } = await client.from("resin_calibrations").insert(newCal);
        if (calErr && (calErr.message?.includes("foreign key") || (calErr as any).code === "23503")) {
          await client.from("resin_calibrations").insert({ ...newCal, created_by: null });
        }
        if (validation.approved) {
          await client.from("resin_batches").update({ status: "CALIBRADA" }).eq("id", params.resin_batch_id);
        }
      } catch (err) {
        console.error("Supabase insert calibration exception:", err);
      }
    }

    mockAuditLogs = loadLocal("odontoprint_audit_logs", mockAuditLogs);
    mockAuditLogs.unshift({
      id: crypto.randomUUID(),
      user_id: params.created_by || null,
      action: validation.approved ? "CALIBRACAO_APROVADA" : "CALIBRACAO_REPROVADA",
      entity_type: "resin_calibrations",
      entity_id: newCal.id,
      new_data: {
        attempt: nextNumber,
        hex: params.hexagon_size_mm,
        approved: validation.approved,
        reason: validation.errorReason,
      },
      created_at: now,
    });
    saveLocal("odontoprint_audit_logs", mockAuditLogs);

    return {
      success: true,
      approved: validation.approved,
      calibration: newCal,
      errorReason: validation.errorReason,
    };
  }

  // --- FATIADOR: OPÇÕES ELEGÍVEIS ---
  static async getEligibleOptions(): Promise<{
    printers: PrinterWithStatus[];
    resins: EligibleResinOption[];
  }> {
    const allPrinters = await this.getPrinters();
    const eligiblePrinters = allPrinters.filter((p) => p.is_eligible_for_print);

    await this.getCalibrations();
    await this.getResinBatches();

    mockCalibrations = loadLocal("odontoprint_calibrations", mockCalibrations);
    mockResinBatches = loadLocal("odontoprint_resin_batches", mockResinBatches);

    // Resinas com calibração aprovada
    const approvedCalibrations = mockCalibrations.filter((c) => c.status === "APROVADA");
    const resins: EligibleResinOption[] = [];

    for (const cal of approvedCalibrations) {
      const batch = mockResinBatches.find((b) => b.id === cal.resin_batch_id && b.active);
      if (batch) {
        resins.push({
          resin_batch_id: batch.id,
          brand: batch.brand,
          resin_type: batch.resin_type,
          lot: batch.lot,
          volume: batch.volume,
          volume_unit: batch.volume_unit,
          calibration_id: cal.id,
          calibration_number: cal.calibration_number,
          layer_height: cal.layer_height,
          exposure_time: cal.exposure_time,
          printer_id: cal.printer_id,
          finalized_at: cal.finalized_at,
        });
      }
    }

    return {
      printers: eligiblePrinters,
      resins,
    };
  }

  // --- NOMENCLATURA E EXECUÇÃO DE IMPRESSÃO ---
  static async generatePrintCode(hasRetry: boolean): Promise<string> {
    const settings = await this.getSettings();
    if (hasRetry) {
      retrySeqCounter += 1;
      return formatPrintRunCode(retrySeqCounter, true, settings.normal_print_prefix, settings.retry_print_prefix);
    } else {
      normalSeqCounter += 1;
      return formatPrintRunCode(normalSeqCounter, false, settings.normal_print_prefix, settings.retry_print_prefix);
    }
  }

  static async startPrintRun(params: {
    run_code: string;
    printer_id: string;
    resin_batch_id: string;
    calibration_id: string;
    item_ids: string[];
    supports_confirmed: boolean;
    resin_manipulated: boolean;
    user_id?: string;
  }): Promise<{ success: boolean; run: PrintRun; error?: string }> {
    if (!params.supports_confirmed || !params.resin_manipulated) {
      return { success: false, run: null as any, error: "As verificações pré-impressão devem ser confirmadas." };
    }
    if (!params.item_ids || params.item_ids.length === 0) {
      return { success: false, run: null as any, error: "Nenhum modelo selecionado para impressão." };
    }

    const now = new Date().toISOString();
    const newRun: PrintRun = {
      id: crypto.randomUUID(),
      run_code: params.run_code,
      printer_id: params.printer_id,
      resin_batch_id: params.resin_batch_id,
      calibration_id: params.calibration_id,
      supports_confirmed: params.supports_confirmed,
      resin_manipulated: params.resin_manipulated,
      status: "EM_IMPRESSAO",
      started_at: now,
      created_by: params.user_id || null,
      created_at: now,
      updated_at: now,
    };

    mockPrintRuns = loadLocal("odontoprint_print_runs", mockPrintRuns);
    mockPrintRuns.unshift(newRun);
    saveLocal("odontoprint_print_runs", mockPrintRuns);

    mockPrintRunItems = loadLocal("odontoprint_print_run_items", mockPrintRunItems);
    mockPrintJobItems = loadLocal("odontoprint_job_items", mockPrintJobItems);

    const runItemsToInsert: PrintRunItem[] = [];
    // Vincula itens à impressão e atualiza status para EM_IMPRESSAO
    for (const itemId of params.item_ids) {
      const runItem: PrintRunItem = {
        id: crypto.randomUUID(),
        print_run_id: newRun.id,
        print_job_item_id: itemId,
        result: "PENDENTE",
        created_at: now,
      };
      runItemsToInsert.push(runItem);
      mockPrintRunItems.push(runItem);

      const item = mockPrintJobItems.find((i) => i.id === itemId);
      if (item) {
        item.status = "EM_IMPRESSAO";
        item.last_run_code = params.run_code;
      }
    }
    saveLocal("odontoprint_print_run_items", mockPrintRunItems);
    saveLocal("odontoprint_job_items", mockPrintJobItems);

    const { client, isConfigured } = this.getSupabase();
    if (isConfigured && client) {
      try {
        let { error: runErr } = await client.from("print_runs").insert(newRun);
        if (runErr && (runErr.message?.includes("foreign key") || (runErr as any).code === "23503")) {
          await client.from("print_runs").insert({ ...newRun, created_by: null });
        }
        await client.from("print_run_items").insert(runItemsToInsert);
        for (const itemId of params.item_ids) {
          await client.from("print_job_items").update({ status: "EM_IMPRESSAO", last_run_code: params.run_code }).eq("id", itemId);
        }
      } catch (err) {
        console.error("Supabase startPrintRun error:", err);
      }
    }

    mockPrinters = loadLocal("odontoprint_printers", mockPrinters);
    const printer = mockPrinters.find((p) => p.id === params.printer_id);
    mockAuditLogs = loadLocal("odontoprint_audit_logs", mockAuditLogs);
    mockAuditLogs.unshift({
      id: crypto.randomUUID(),
      user_id: params.user_id || null,
      action: "IMPRESSAO_INICIADA",
      entity_type: "print_runs",
      entity_id: newRun.id,
      new_data: {
        run_code: params.run_code,
        printer: printer?.name,
        items_count: params.item_ids.length,
      },
      created_at: now,
    });
    saveLocal("odontoprint_audit_logs", mockAuditLogs);

    return { success: true, run: newRun };
  }

  static async finalizePrintRun(params: {
    run_id: string;
    failed_items: { item_id: string; reason?: string }[];
    user_id?: string;
  }): Promise<{ success: boolean; completed_count: number; failed_count: number; error?: string }> {
    mockPrintRuns = loadLocal("odontoprint_print_runs", mockPrintRuns);
    const run = mockPrintRuns.find((r) => r.id === params.run_id);
    if (!run) return { success: false, completed_count: 0, failed_count: 0, error: "Impressão não encontrada." };
    if (run.status === "FINALIZADA") {
      return { success: false, completed_count: 0, failed_count: 0, error: "Esta impressão já foi finalizada." };
    }

    const now = new Date().toISOString();
    run.status = "FINALIZADA";
    run.finished_at = now;
    saveLocal("odontoprint_print_runs", mockPrintRuns);

    mockPrintRunItems = loadLocal("odontoprint_print_run_items", mockPrintRunItems);
    mockPrintJobItems = loadLocal("odontoprint_job_items", mockPrintJobItems);
    mockFinishingItems = loadLocal("odontoprint_finishing_items", mockFinishingItems);
    mockPrintJobs = loadLocal("odontoprint_jobs", mockPrintJobs);
    mockCases = loadLocal("odontoprint_cases", mockCases);
    mockAuditLogs = loadLocal("odontoprint_audit_logs", mockAuditLogs);

    const runItems = mockPrintRunItems.filter((ri) => ri.print_run_id === run.id);
    const failedMap = new Map(params.failed_items.map((f) => [f.item_id, f.reason]));

    let completedCount = 0;
    let failedCount = 0;

    for (const ri of runItems) {
      const jobItem = mockPrintJobItems.find((i) => i.id === ri.print_job_item_id);
      if (!jobItem) continue;

      if (failedMap.has(jobItem.id)) {
        // FALHOU: Volta para fila em vermelho como REIMPRESSÃO
        failedCount++;
        const failureReason = failedMap.get(jobItem.id) || "Falha não especificada na impressão";
        ri.result = "FALHOU";
        ri.failure_reason = failureReason;

        jobItem.status = "AGUARDANDO_FILA";
        jobItem.retry_count += 1;
        jobItem.is_retry = true;
        jobItem.last_failure_reason = failureReason;
        jobItem.last_run_code = run.run_code;

        mockAuditLogs.unshift({
          id: crypto.randomUUID(),
          user_id: params.user_id || null,
          action: "ITEM_REIMPRESSAO",
          entity_type: "print_job_items",
          entity_id: jobItem.id,
          new_data: {
            item_type: FILE_TYPE_LABELS[jobItem.file_type],
            run_code: run.run_code,
            retry_count: jobItem.retry_count,
            reason: failureReason,
          },
          created_at: now,
        });
      } else {
        // CONCLUÍDO NA IMPRESSÃO 3D -> Lavagem, Pós-Cura e Envio para Bancada de Acabamento
        completedCount++;
        ri.result = "CONCLUIDO";
        jobItem.status = "PRONTO_ACABAMENTO";

        const parentJob = mockPrintJobs.find((j) => j.id === jobItem.print_job_id);
        const parentCase = mockCases.find((c) => c.id === parentJob?.case_id);
        const hasSockets = jobItem.file_type === "MODELO_COM_FUROS" || jobItem.file_type === "MODELO_DE_TRABALHO";

        mockFinishingItems.unshift({
          id: jobItem.id,
          case_id: parentJob?.case_id || "",
          patient_code: parentCase?.patient_code || "PAC",
          patient_name: parentCase?.patient_name || null,
          file_type: jobItem.file_type,
          has_sockets: hasSockets,
          origin: "IMPRESSAO",
          status: "AGUARDANDO_MONTAGEM",
          teeth_inserted: false,
          occlusion_checked: false,
          glaze_applied: false,
          created_at: now,
        });

        mockAuditLogs.unshift({
          id: crypto.randomUUID(),
          user_id: params.user_id || null,
          action: "ITEM_ENVIADO_ACABAMENTO",
          entity_type: "print_job_items",
          entity_id: jobItem.id,
          new_data: {
            item_type: FILE_TYPE_LABELS[jobItem.file_type],
            run_code: run.run_code,
            has_sockets: hasSockets,
          },
          created_at: now,
        });
      }

      // Atualiza status do job pai
      // CORREÇÃO: sucesso na impressão vira PRONTO_ACABAMENTO (bancada),
      // então o job só fecha quando todos estão em PRONTO_ACABAMENTO/CONCLUIDO.
      const parentJob = mockPrintJobs.find((j) => j.id === jobItem.print_job_id);
      if (parentJob) {
        const siblingItems = mockPrintJobItems.filter((i) => i.print_job_id === parentJob.id);
        const isPrintStageDone = (s: string) => s === "CONCLUIDO" || s === "PRONTO_ACABAMENTO";
        const allCompleted = siblingItems.length > 0 && siblingItems.every((i) => isPrintStageDone(i.status));
        parentJob.status = allCompleted ? "CONCLUIDO" : "PARCIAL";
        (parentJob as any).updated_at = now;
      }
    }

    saveLocal("odontoprint_print_run_items", mockPrintRunItems);
    saveLocal("odontoprint_job_items", mockPrintJobItems);
    saveLocal("odontoprint_finishing_items", mockFinishingItems);
    saveLocal("odontoprint_jobs", mockPrintJobs);
    saveLocal("odontoprint_audit_logs", mockAuditLogs);

    const { client, isConfigured } = this.getSupabase();
    if (isConfigured && client) {
      try {
        await client.from("print_runs").update({ status: "FINALIZADA", finished_at: now }).eq("id", run.id);

        for (const ri of runItems) {
          await client.from("print_run_items").update({
            result: ri.result,
            failure_reason: ri.failure_reason || null,
          }).eq("id", ri.id);

          const jobItem = mockPrintJobItems.find((i) => i.id === ri.print_job_item_id);
          if (jobItem) {
            await client.from("print_job_items").update({
              status: jobItem.status,
              retry_count: jobItem.retry_count,
              is_retry: jobItem.is_retry,
              last_failure_reason: jobItem.last_failure_reason || null,
              last_run_code: jobItem.last_run_code || null,
            }).eq("id", jobItem.id);

            const parentJob = mockPrintJobs.find((j) => j.id === jobItem.print_job_id);
            if (parentJob) {
              await client.from("print_jobs").update({
                status: parentJob.status,
              }).eq("id", parentJob.id);
            }
          }
        }
      } catch (err) {
        console.warn("Supabase finalizePrintRun error:", err);
      }
    }

    mockAuditLogs.unshift({
      id: crypto.randomUUID(),
      user_id: params.user_id || null,
      action: "IMPRESSAO_FINALIZADA",
      entity_type: "print_runs",
      entity_id: run.id,
      new_data: {
        run_code: run.run_code,
        completed: completedCount,
        failed: failedCount,
      },
      created_at: now,
    });
    saveLocal("odontoprint_audit_logs", mockAuditLogs);

    return { success: true, completed_count: completedCount, failed_count: failedCount };
  }

  static async getPrintRuns(): Promise<(PrintRun & { printer_name: string; resin_brand: string; items_count: number })[]> {
    mockPrintRuns = loadLocal("odontoprint_print_runs", mockPrintRuns);
    mockPrintRunItems = loadLocal("odontoprint_print_run_items", mockPrintRunItems);
    mockPrinters = loadLocal("odontoprint_printers", mockPrinters);
    mockResinBatches = loadLocal("odontoprint_resin_batches", mockResinBatches);

    const { client, isConfigured } = this.getSupabase();
    if (isConfigured && client) {
      try {
        const { data: runsData, error: rErr } = await client.from("print_runs").select("*").order("created_at", { ascending: false });
        const { data: runItemsData, error: riErr } = await client.from("print_run_items").select("*");
        if (!rErr && runsData) {
          mockPrintRuns = mergeById(runsData, mockPrintRuns);
          saveLocal("odontoprint_print_runs", mockPrintRuns);
        }
        if (!riErr && runItemsData) {
          mockPrintRunItems = mergeById(runItemsData, mockPrintRunItems);
          saveLocal("odontoprint_print_run_items", mockPrintRunItems);
        }
      } catch (err) {
        console.warn("Supabase getPrintRuns error:", err);
      }
    }

    mockPrintRuns = loadLocal("odontoprint_print_runs", mockPrintRuns);
    mockPrintRunItems = loadLocal("odontoprint_print_run_items", mockPrintRunItems);
    mockPrinters = loadLocal("odontoprint_printers", mockPrinters);
    mockResinBatches = loadLocal("odontoprint_resin_batches", mockResinBatches);

    return mockPrintRuns.map((r) => {
      const printer = mockPrinters.find((p) => p.id === r.printer_id);
      const batch = mockResinBatches.find((b) => b.id === r.resin_batch_id);
      const itemsCount = mockPrintRunItems.filter((ri) => ri.print_run_id === r.id).length;
      return {
        ...r,
        printer_name: printer?.name || "Desconhecida",
        resin_brand: batch ? `${batch.brand} (${batch.resin_type})` : "Desconhecida",
        items_count: itemsCount,
      };
    });
  }

  // Resumo das impressões EM ANDAMENTO com os itens vinculados.
  // Usado pela Fila para mostrar o andamento (código, impressora, tempo).
  static async getActiveRunsWithItems(): Promise<import("@/types/domain").ActiveRunInfo[]> {
    const runs = await this.getPrintRuns();
    mockPrintRunItems = loadLocal("odontoprint_print_run_items", mockPrintRunItems);
    return runs
      .filter((r) => r.status === "EM_IMPRESSAO")
      .map((r) => {
        const itemIds = mockPrintRunItems
          .filter((ri) => ri.print_run_id === r.id)
          .map((ri) => ri.print_job_item_id);
        return {
          id: r.id,
          run_code: r.run_code,
          printer_name: r.printer_name,
          started_at: r.started_at || r.created_at,
          items_count: itemIds.length,
          item_ids: itemIds,
        };
      })
      .sort(
        (a, b) =>
          new Date(a.started_at || 0).getTime() - new Date(b.started_at || 0).getTime()
      );
  }

  /**
   * Visão geral das impressões para a Dashboard, explicada em linguagem
   * simples: o que está imprimindo (mesa + pedidos + impressora + tempo),
   * quantos pedidos aguardam e quantas falhas têm prioridade.
   */
  static async getPrintingOverview(): Promise<{
    printing: Array<{
      id: string;
      run_code: string;
      printer_name: string;
      started_at?: string | null;
      items_count: number;
      group_titles: string[];
    }>;
    waitingGroups: number;
    waitingModels: number;
    failedCount: number;
  }> {
    const [runs, cards, batches] = await Promise.all([
      this.getActiveRunsWithItems(),
      this.getPrintCards(),
      this.getPrintBatches(),
    ]);

    const cardById = new Map(cards.map((c) => [c.id, c]));
    const titleByBatchId = new Map<string, string>();
    for (const b of batches) {
      const n = (b as any).batch_number;
      titleByBatchId.set(b.id, n ? `Impressão #${n}` : b.batch_name);
    }

    const printing = runs.map((r) => {
      const titles = new Set<string>();
      for (const itemId of r.item_ids) {
        const card = cardById.get(itemId);
        if (card?.batch_id && titleByBatchId.has(card.batch_id)) {
          titles.add(titleByBatchId.get(card.batch_id)!);
        }
      }
      return {
        id: r.id,
        run_code: r.run_code,
        printer_name: r.printer_name,
        started_at: r.started_at,
        items_count: r.item_ids.length,
        group_titles: Array.from(titles),
      };
    });

    const waiting = cards.filter((c) => c.status === "NA_FILA" || c.status === "PREPARANDO");
    const waitingBatchIds = new Set(
      waiting.map((c) => c.batch_id || "avulsos")
    );
    const failed = cards.filter(
      (c) =>
        c.status === "FALHOU" ||
        (c.is_retry && (c.status === "NA_FILA" || c.status === "PREPARANDO"))
    );

    return {
      printing,
      waitingGroups: waitingBatchIds.size,
      waitingModels: waiting.length,
      failedCount: failed.length,
    };
  }

  static async getPrintRunById(id: string) {
    mockPrintRuns = loadLocal("odontoprint_print_runs", mockPrintRuns);
    let run = mockPrintRuns.find((r) => r.id === id);

    const { client, isConfigured } = this.getSupabase();
    if (!run && isConfigured && client) {
      try {
        const { data, error } = await client.from("print_runs").select("*").eq("id", id).single();
        if (!error && data) {
          run = data;
          mockPrintRuns = mergeById([data], mockPrintRuns);
          saveLocal("odontoprint_print_runs", mockPrintRuns);
        }
      } catch (err) {
        console.warn("Supabase getPrintRunById error:", err);
      }
    }

    if (!run) return null;

    mockPrinters = loadLocal("odontoprint_printers", mockPrinters);
    mockResinBatches = loadLocal("odontoprint_resin_batches", mockResinBatches);
    mockCalibrations = loadLocal("odontoprint_calibrations", mockCalibrations);
    mockPrintRunItems = loadLocal("odontoprint_print_run_items", mockPrintRunItems);
    mockPrintJobItems = loadLocal("odontoprint_job_items", mockPrintJobItems);
    mockPrintJobs = loadLocal("odontoprint_jobs", mockPrintJobs);
    mockCases = loadLocal("odontoprint_cases", mockCases);

    const printer = mockPrinters.find((p) => p.id === run.printer_id);
    const batch = mockResinBatches.find((b) => b.id === run.resin_batch_id);
    const calibration = mockCalibrations.find((c) => c.id === run.calibration_id);

    const runItems = mockPrintRunItems.filter((ri) => ri.print_run_id === run.id);
    const itemsEnriched = runItems.map((ri) => {
      const jobItem = mockPrintJobItems.find((i) => i.id === ri.print_job_item_id);
      const job = jobItem ? mockPrintJobs.find((j) => j.id === jobItem.print_job_id) : null;
      const caseItem = job ? mockCases.find((c) => c.id === job.case_id) : null;

      return {
        ...ri,
        file_type: jobItem?.file_type || ("MODELO_DE_TRABALHO" as DentalFileType),
        retry_count: jobItem?.retry_count || 0,
        patient_code: caseItem?.patient_code || "PAC-???",
        patient_name: caseItem?.patient_name || null,
      };
    });

    return {
      ...run,
      printer,
      batch,
      calibration,
      items: itemsEnriched,
    };
  }

  // --- HISTÓRICO & TIMELINE ---
  static async getHistory(filters?: {
    search?: string;
    status?: string;
  }): Promise<{
    cases: (Case & { items_count: number; status: string; completed_count: number })[];
  }> {
    await this.getCases();
    await this.getQueue();
    const query = filters?.search?.toLowerCase().trim() || "";

    const results = mockCases
      .map((c) => {
        const jobs = mockPrintJobs.filter((j) => j.case_id === c.id);
        const jobIds = new Set(jobs.map((j) => j.id));
        const items = mockPrintJobItems.filter((i) => jobIds.has(i.print_job_id));
        const completed = items.filter((i) => i.status === "CONCLUIDO").length;

        let generalStatus = "AGUARDANDO";
        if (items.length > 0 && completed === items.length) generalStatus = "CONCLUIDO";
        else if (items.some((i) => i.is_retry)) generalStatus = "REIMPRESSAO";
        else if (items.some((i) => i.status === "EM_IMPRESSAO")) generalStatus = "EM_IMPRESSAO";

        return {
          ...c,
          items_count: items.length,
          status: generalStatus,
          completed_count: completed,
        };
      })
      .filter((c) => {
        if (!query) return true;
        return (
          c.patient_code.toLowerCase().includes(query) ||
          (c.patient_name && c.patient_name.toLowerCase().includes(query)) ||
          (c.notes && c.notes.toLowerCase().includes(query))
        );
      });

    return { cases: results };
  }

  static async getCaseTimeline(caseId: string): Promise<{
    caseData: Case | null;
    items: PrintJobItem[];
    timeline: CaseTimelineEvent[];
  }> {
    mockCases = loadLocal("odontoprint_cases", mockCases);
    mockPrintJobs = loadLocal("odontoprint_jobs", mockPrintJobs);
    mockPrintJobItems = loadLocal("odontoprint_job_items", mockPrintJobItems);
    mockPrintRuns = loadLocal("odontoprint_print_runs", mockPrintRuns);
    mockPrintRunItems = loadLocal("odontoprint_print_run_items", mockPrintRunItems);
    mockPrinters = loadLocal("odontoprint_printers", mockPrinters);
    mockResinBatches = loadLocal("odontoprint_resin_batches", mockResinBatches);

    let c = mockCases.find((x) => x.id === caseId) || null;

    const { client, isConfigured } = this.getSupabase();
    if (!c && isConfigured && client) {
      try {
        const { data: caseRow } = await client.from("cases").select("*").eq("id", caseId).single();
        if (caseRow) {
          c = caseRow;
          mockCases = mergeById([caseRow], mockCases);
          saveLocal("odontoprint_cases", mockCases);

          const { data: jobs } = await client.from("print_jobs").select("*").eq("case_id", caseId);
          if (jobs) {
            mockPrintJobs = mergeById(jobs, mockPrintJobs);
            saveLocal("odontoprint_jobs", mockPrintJobs);
            const jobIds = jobs.map((j: any) => j.id);
            if (jobIds.length > 0) {
              const { data: jobItems } = await client.from("print_job_items").select("*").in("print_job_id", jobIds);
              if (jobItems) {
                mockPrintJobItems = mergeById(jobItems, mockPrintJobItems);
                saveLocal("odontoprint_job_items", mockPrintJobItems);
              }
            }
          }
        }
      } catch (err) {
        console.warn("Supabase getCaseTimeline fetch error:", err);
      }
    }

    if (!c) return { caseData: null, items: [], timeline: [] };

    const jobs = mockPrintJobs.filter((j) => j.case_id === caseId);
    const jobIds = new Set(jobs.map((j) => j.id));
    const items = mockPrintJobItems.filter((i) => jobIds.has(i.print_job_id));

    const timeline: CaseTimelineEvent[] = [];

    // 1. Criação
    timeline.push({
      id: `created-${c.id}`,
      timestamp: c.created_at,
      title: "Trabalho Cadastrado pelo Cadista",
      description: `Código do paciente ${c.patient_code} registrado. ${items.length} modelos odontológicos solicitados.`,
      type: "CREATED",
      badgeColor: "bg-blue-100 text-blue-800",
    });

    // 2. Fila
    for (const job of jobs) {
      timeline.push({
        id: `queued-${job.id}`,
        timestamp: job.queue_entered_at,
        title: "Entrada na Fila de Impressão (FIFO)",
        description: `Arquivos posicionados na fila prioritária de impressão.`,
        type: "QUEUED",
        badgeColor: "bg-cyan-100 text-cyan-800",
      });
    }

    // 3. Impressões vinculadas aos itens
    const itemIds = new Set(items.map((i) => i.id));
    const runItems = mockPrintRunItems.filter((ri) => itemIds.has(ri.print_job_item_id));

    for (const ri of runItems) {
      const run = mockPrintRuns.find((r) => r.id === ri.print_run_id);
      const item = items.find((i) => i.id === ri.print_job_item_id);
      const printer = run ? mockPrinters.find((p) => p.id === run.printer_id) : null;
      const resin = run ? mockResinBatches.find((b) => b.id === run.resin_batch_id) : null;
      const itemLabel = item ? FILE_TYPE_LABELS[item.file_type] : "Item";

      if (run?.started_at) {
        timeline.push({
          id: `start-${ri.id}`,
          timestamp: run.started_at,
          title: `Impressão Iniciada: ${run.run_code}`,
          description: `Modelo ${itemLabel} alocado na impressora ${printer?.name || "N/A"} com resina ${resin?.brand || "N/A"} (Lote ${resin?.lot || "N/A"}).`,
          type: "PRINTING",
          badgeColor: "bg-indigo-100 text-indigo-800",
        });
      }

      if (run?.finished_at) {
        if (ri.result === "FALHOU") {
          timeline.push({
            id: `failed-${ri.id}`,
            timestamp: run.finished_at,
            title: `Falha Reportada: ${itemLabel} (Reimpressão)`,
            description: `Motivo: ${ri.failure_reason || "Falha técnica"}. Item incrementou tentativa (${item?.retry_count}ª tentativa) e retornou à fila em vermelho.`,
            type: "FAILED",
            badgeColor: "bg-red-100 text-red-800",
          });
        } else if (ri.result === "CONCLUIDO") {
          timeline.push({
            id: `done-${ri.id}`,
            timestamp: run.finished_at,
            title: `Impressão Aprovada: ${itemLabel}`,
            description: `Modelo impresso com sucesso e inspecionado sem avarias na ordem ${run.run_code}.`,
            type: "COMPLETED",
            badgeColor: "bg-emerald-100 text-emerald-800",
          });
        }
      }
    }

    // 4. Eventos de Fresagem CNC
    const caseMilling = mockMillingItems.filter((m) => m.case_id === caseId);
    for (const m of caseMilling) {
      if (m.started_at) {
        timeline.push({
          id: `mill-start-${m.id}`,
          timestamp: m.started_at,
          title: `Usinagem CNC: ${FILE_TYPE_LABELS[m.file_type] || m.file_type}`,
          description: `Bloco de ${m.material} (${m.block_lot || "Lote"}) carregado na fresadora.`,
          type: "MILLING",
          badgeColor: "bg-purple-100 text-purple-800",
        });
      }
      if (m.finished_at && m.status === "FRESADO_CONCLUIDO") {
        timeline.push({
          id: `mill-done-${m.id}`,
          timestamp: m.finished_at,
          title: `Fresagem Concluída: ${FILE_TYPE_LABELS[m.file_type] || m.file_type}`,
          description: `Peça usinada com sucesso e despachada para a Bancada de Acabamento & Maquiagem.`,
          type: "MILLING",
          badgeColor: "bg-purple-100 text-purple-800",
        });
      }
    }

    // 5. Eventos de Bancada de Acabamento, Montagem & Maquiagem
    const caseFinishing = mockFinishingItems.filter((f) => f.case_id === caseId);
    for (const f of caseFinishing) {
      if (f.finished_at && f.status === "APROVADO_CQ") {
        timeline.push({
          id: `finish-done-${f.id}`,
          timestamp: f.finished_at,
          title: `Bancada: Montagem & Maquiagem Aprovada no CQ`,
          description: `Dentes assentados nos furos do modelo, oclusão testada, glaze aplicado e peça liberada para entrega.`,
          type: "FINISHING",
          badgeColor: "bg-amber-100 text-amber-800",
        });
      }
    }

    timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return {
      caseData: c,
      items,
      timeline,
    };
  }

  // --- DASHBOARD E AUDITORIA ---
  static async getDashboardMetrics(): Promise<DashboardMetrics> {
    const [printers] = await Promise.all([
      this.getPrinters(),
      this.getQueue(),
      this.getResinBatches(),
    ]);
    const availablePrinters = printers.filter((p) => p.calculated_status === "DISPONIVEL").length;
    const blockedPrinters = printers.length - availablePrinters;

    const waitingItems = mockPrintJobItems.filter((i) => i.status === "AGUARDANDO_FILA");
    const printingItems = mockPrintJobItems.filter((i) => i.status === "EM_IMPRESSAO");
    const completedItems = mockPrintJobItems.filter((i) => i.status === "CONCLUIDO");
    const failedItems = mockPrintJobItems.filter((i) => i.retry_count > 0);
    const reprintsPending = mockPrintJobItems.filter((i) => i.status === "AGUARDANDO_FILA" && i.is_retry);

    const jobsWaiting = mockPrintJobs.filter((j) => j.status === "AGUARDANDO").length;
    const calibratedResins = mockResinBatches.filter((b) => b.status === "CALIBRADA").length;
    const awaitingResins = mockResinBatches.filter((b) => b.status === "AGUARDANDO_CALIBRACAO").length;

    return {
      jobs_waiting: jobsWaiting,
      items_in_queue: waitingItems.length,
      items_printing: printingItems.length,
      items_completed_today: completedItems.length,
      items_failed_total: failedItems.length,
      reprints_pending: reprintsPending.length,
      printers_available: availablePrinters,
      printers_blocked: blockedPrinters,
      resins_calibrated: calibratedResins,
      resins_awaiting: awaitingResins,
    };
  }

  static async getRecentActivities(limit: number = 10): Promise<import("@/lib/activity-feed").ActivityItem[]> {
    const { buildActivityFeed } = await import("@/lib/activity-feed");
    mockAuditLogs = loadLocal<AuditLog[]>("odontoprint_audit_logs", mockAuditLogs);
    const { client, isConfigured } = this.getSupabase();
    if (isConfigured && client) {
      try {
        // Sobe eventos locais ainda não centralizados (idempotente por id)
        const pending = mockAuditLogs.slice(0, 60);
        if (pending.length > 0) {
          await client.from("audit_logs").upsert(pending, { onConflict: "id" });
        }
      } catch {
        // segue com o que houver
      }
      try {
        const { data, error } = await client.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(40);
        if (!error && data) {
          mockAuditLogs = mergeById(data, mockAuditLogs);
          saveLocal("odontoprint_audit_logs", mockAuditLogs);
        }
      } catch (err) {
        console.warn("Supabase getRecentActivities error:", err);
      }
    }

    // Resolve nome de quem fez (em vez do UUID)
    const users = new Map<string, string>();
    if (isConfigured && client) {
      try {
        const { data } = await client.from("profiles").select("id, full_name");
        for (const p of data || []) {
          if (p?.id && p?.full_name) users.set(p.id, p.full_name);
        }
      } catch {
        // segue sem nomes do banco
      }
    }
    try {
      const localUsers = loadLocal<(Profile & { email?: string })[]>("odontoprint_all_users", []);
      for (const u of localUsers) {
        if (u?.id && (u as any)?.full_name && !users.has(u.id)) users.set(u.id, (u as any).full_name);
      }
    } catch {
      // ignore
    }

    return buildActivityFeed(mockAuditLogs as any, users, { limit });
  }

  // ====================================================================
  // MÓDULO 2.B: FRESAGEM CNC (USINAGEM DE ZIRCÔNIA & PMMA)
  // ====================================================================
  static async getMillingItems(): Promise<MillingItem[]> {
    mockMillingItems = loadLocal<MillingItem[]>("odontoprint_milling_items", mockMillingItems);
    return mockMillingItems;
  }

  static async getMillingQueue(): Promise<MillingItem[]> {
    return this.getMillingItems();
  }

  static async startMilling(id: string, block_lot: string, user_id?: string): Promise<{ success: boolean; error?: string }> {
    mockMillingItems = loadLocal<MillingItem[]>("odontoprint_milling_items", mockMillingItems);
    const item = mockMillingItems.find((m) => m.id === id);
    if (!item) return { success: false, error: "Item de fresagem não encontrado." };

    item.status = "EM_USINAGEM";
    item.block_lot = block_lot;
    item.started_at = new Date().toISOString();
    saveLocal("odontoprint_milling_items", mockMillingItems);

    mockAuditLogs.unshift({
      id: crypto.randomUUID(),
      user_id: user_id || null,
      action: "FRESAGEM_INICIADA",
      entity_type: "milling_items",
      entity_id: id,
      new_data: { patient_code: item.patient_code, file_type: item.file_type, block_lot },
      created_at: item.started_at,
    });
    saveLocal("odontoprint_audit_logs", mockAuditLogs);

    return { success: true };
  }

  static async finalizeMilling(
    id: string,
    success: boolean,
    failureReason?: string,
    user_id?: string
  ): Promise<{ success: boolean; error?: string }> {
    mockMillingItems = loadLocal<MillingItem[]>("odontoprint_milling_items", mockMillingItems);
    mockFinishingItems = loadLocal<FinishingCaseItem[]>("odontoprint_finishing_items", mockFinishingItems);
    const item = mockMillingItems.find((m) => m.id === id);
    if (!item) return { success: false, error: "Item de fresagem não encontrado." };

    const now = new Date().toISOString();
    item.finished_at = now;

    if (!success) {
      item.status = "FALHOU";
      saveLocal("odontoprint_milling_items", mockMillingItems);
      mockAuditLogs.unshift({
        id: crypto.randomUUID(),
        user_id: user_id || null,
        action: "FRESAGEM_FALHOU",
        entity_type: "milling_items",
        entity_id: id,
        new_data: { patient_code: item.patient_code, reason: failureReason || "Falha técnica na usinagem" },
        created_at: now,
      });
      saveLocal("odontoprint_audit_logs", mockAuditLogs);
      return { success: true };
    }

    item.status = "FRESADO_CONCLUIDO";
    saveLocal("odontoprint_milling_items", mockMillingItems);

    // Envia os dentes fresados para a Bancada de Acabamento & Maquiagem para encaixe nos furos do modelo!
    mockFinishingItems.unshift({
      id: item.id,
      case_id: item.case_id,
      patient_code: item.patient_code,
      patient_name: item.patient_name,
      file_type: item.file_type,
      has_sockets: false,
      origin: "FRESAGEM",
      status: "AGUARDANDO_MONTAGEM",
      teeth_inserted: false,
      occlusion_checked: false,
      glaze_applied: false,
      created_at: now,
    });
    saveLocal("odontoprint_finishing_items", mockFinishingItems);

    mockAuditLogs.unshift({
      id: crypto.randomUUID(),
      user_id: user_id || null,
      action: "FRESAGEM_CONCLUIDA",
      entity_type: "milling_items",
      entity_id: id,
      new_data: { patient_code: item.patient_code, file_type: item.file_type },
      created_at: now,
    });
    saveLocal("odontoprint_audit_logs", mockAuditLogs);

    return { success: true };
  }

  // ====================================================================
  // MÓDULO 3: BANCADA DE ACABAMENTO, MONTAGEM DE DENTES & MAQUIAGEM
  // ====================================================================
  static async getFinishingItems(): Promise<FinishingCaseItem[]> {
    mockFinishingItems = loadLocal<FinishingCaseItem[]>("odontoprint_finishing_items", mockFinishingItems);

    const { client, isConfigured } = this.getSupabase();
    if (isConfigured && client) {
      try {
        const { data: readyItems, error } = await client
          .from("print_job_items")
          .select("id, file_type, print_job_id, created_at, status")
          .eq("status", "PRONTO_ACABAMENTO");

        if (!error && readyItems && readyItems.length > 0) {
          const { data: jobs } = await client.from("print_jobs").select("id, case_id");
          const { data: cases } = await client.from("cases").select("id, patient_code, patient_name");

          const jobsMap = new Map((jobs || []).map((j: any) => [j.id, j.case_id]));
          const casesMap = new Map((cases || []).map((c: any) => [c.id, c]));

          for (const item of readyItems) {
            const exists = mockFinishingItems.some((f) => f.id === item.id);
            if (!exists) {
              const caseId = jobsMap.get(item.print_job_id) || "";
              const caseObj: any = casesMap.get(caseId);
              const hasSockets = item.file_type === "MODELO_COM_FUROS" || item.file_type === "MODELO_DE_TRABALHO";

              mockFinishingItems.push({
                id: item.id,
                case_id: caseId,
                patient_code: caseObj?.patient_code || "PAC",
                patient_name: caseObj?.patient_name || null,
                file_type: item.file_type,
                has_sockets: hasSockets,
                origin: "IMPRESSAO",
                status: "AGUARDANDO_MONTAGEM",
                teeth_inserted: false,
                occlusion_checked: false,
                glaze_applied: false,
                created_at: item.created_at,
              });
            }
          }
          saveLocal("odontoprint_finishing_items", mockFinishingItems);
        }
      } catch (err) {
        console.warn("Supabase getFinishingItems error:", err);
      }
    }

    return mockFinishingItems;
  }

  static async getFinishingQueue(): Promise<FinishingCaseItem[]> {
    return this.getFinishingItems();
  }

  static async updateFinishingChecklist(params: {
    id: string;
    teeth_inserted?: boolean;
    occlusion_checked?: boolean;
    glaze_applied?: boolean;
    technician_name?: string;
  }): Promise<{ success: boolean; item?: FinishingCaseItem; error?: string }> {
    mockFinishingItems = loadLocal<FinishingCaseItem[]>("odontoprint_finishing_items", mockFinishingItems);
    const item = mockFinishingItems.find((f) => f.id === params.id);
    if (!item) return { success: false, error: "Trabalho não encontrado na bancada de acabamento." };

    if (params.teeth_inserted !== undefined) item.teeth_inserted = params.teeth_inserted;
    if (params.occlusion_checked !== undefined) item.occlusion_checked = params.occlusion_checked;
    if (params.glaze_applied !== undefined) item.glaze_applied = params.glaze_applied;
    if (params.technician_name) item.assigned_technician = params.technician_name;

    if (item.teeth_inserted || item.glaze_applied) {
      item.status = "EM_MAQUIAGEM";
    }

    saveLocal("odontoprint_finishing_items", mockFinishingItems);
    return { success: true, item };
  }

  static async updateFinishingCheck(
    id: string,
    field: "teeth_inserted" | "occlusion_checked" | "glaze_applied",
    value: boolean,
    user_id?: string
  ): Promise<{ success: boolean; item?: FinishingCaseItem; error?: string }> {
    return this.updateFinishingChecklist({
      id,
      [field]: value,
      technician_name: user_id,
    });
  }

  static async approveFinishingCase(
    id: string,
    notes?: string,
    user_id?: string
  ): Promise<{ success: boolean; error?: string }> {
    mockFinishingItems = loadLocal<FinishingCaseItem[]>("odontoprint_finishing_items", mockFinishingItems);
    const item = mockFinishingItems.find((f) => f.id === id);
    if (!item) return { success: false, error: "Trabalho não encontrado na bancada de acabamento." };

    const now = new Date().toISOString();
    item.status = "APROVADO_CQ";
    item.finished_at = now;
    saveLocal("odontoprint_finishing_items", mockFinishingItems);

    // Atualiza status final do item correspondente de impressão para concluído total
    mockPrintJobItems = loadLocal<PrintJobItem[]>("odontoprint_job_items", mockPrintJobItems);
    mockPrintJobs = loadLocal("odontoprint_jobs", mockPrintJobs);
    const jobItem = mockPrintJobItems.find((i) => i.id === id);
    if (jobItem) {
      jobItem.status = "CONCLUIDO";
      jobItem.updated_at = now;
      saveLocal("odontoprint_job_items", mockPrintJobItems);

      // CORREÇÃO: o job pai também precisa fechar no localStorage
      // (antes só fechava no Supabase, então o Kanban/histórico local
      // nunca mostrava CONCLUIDO).
      const parentJob = mockPrintJobs.find((j) => j.id === jobItem.print_job_id);
      if (parentJob) {
        const siblings = mockPrintJobItems.filter((i) => i.print_job_id === parentJob.id);
        if (siblings.length > 0 && siblings.every((i) => i.status === "CONCLUIDO")) {
          parentJob.status = "CONCLUIDO";
        } else {
          parentJob.status = "PARCIAL";
        }
        (parentJob as any).updated_at = now;
        saveLocal("odontoprint_jobs", mockPrintJobs);
      }
    }

    const { client, isConfigured } = this.getSupabase();
    if (isConfigured && client) {
      try {
        await client.from("print_job_items").update({ status: "CONCLUIDO" }).eq("id", id);
        if (jobItem?.print_job_id) {
          const siblingItems = mockPrintJobItems.filter((i) => i.print_job_id === jobItem.print_job_id);
          const allCompleted = siblingItems.every((i) => i.status === "CONCLUIDO");
          if (allCompleted) {
            await client.from("print_jobs").update({ status: "CONCLUIDO" }).eq("id", jobItem.print_job_id);
          }
        }
      } catch (err) {
        console.warn("Supabase approveFinishingCase error:", err);
      }
    }

    mockAuditLogs = loadLocal<AuditLog[]>("odontoprint_audit_logs", mockAuditLogs);
    mockAuditLogs.unshift({
      id: crypto.randomUUID(),
      user_id: user_id || null,
      action: "ACABAMENTO_APROVADO",
      entity_type: "finishing_cases",
      entity_id: id,
      new_data: {
        patient_code: item.patient_code,
        teeth_inserted: item.teeth_inserted,
        glaze_applied: item.glaze_applied,
        notes,
      },
      created_at: now,
    });
    saveLocal("odontoprint_audit_logs", mockAuditLogs);

    return { success: true };
  }

  // --- GESTÃO DE USUÁRIOS E SOLICITAÇÕES DE ACESSO ---
  static async getUsers(): Promise<(Profile & { email?: string })[]> {
    let localUsers = loadLocal<(Profile & { email?: string })[]>("odontoprint_all_users", []);

    const { client, isConfigured } = this.getSupabase();
    if (isConfigured && client) {
      try {
        const { data, error } = await client
          .from("profiles")
          .select("*")
          .order("created_at", { ascending: false });
        if (!error && data && data.length > 0) {
          const merged = mergeById(data as (Profile & { email?: string })[], localUsers);
          saveLocal("odontoprint_all_users", merged);
          return merged;
        }
      } catch {
        // fallback para local
      }
    }

    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("odontoprint_all_users");
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          // ignore
        }
      }
    }

    const defaultUsers = [
      {
        id: "u1",
        full_name: "Administrador do Laboratório",
        email: "admin@odontoprint.com.br",
        role: "ADMIN" as UserRole,
        active: true,
        created_at: new Date().toISOString(),
      },
      {
        id: "u2",
        full_name: "Dra. Juliana Ribeiro",
        email: "juliana.cad@odontoprint.com.br",
        role: "CADISTA" as UserRole,
        active: true,
        created_at: new Date().toISOString(),
      },
      {
        id: "u3",
        full_name: "Lucas Mendes",
        email: "lucas.print@odontoprint.com.br",
        role: "OPERADOR_IMPRESSAO" as UserRole,
        active: true,
        created_at: new Date().toISOString(),
      },
    ];

    if (typeof window !== "undefined") {
      localStorage.setItem("odontoprint_all_users", JSON.stringify(defaultUsers));
    }

    return defaultUsers;
  }

  static async requestUserAccess(params: {
    full_name: string;
    email: string;
    password?: string;
    role: UserRole;
  }): Promise<{ success: boolean; error?: string }> {
    const validationError = validateAccessRequest(params);
    if (validationError) {
      return { success: false, error: validationError };
    }

    const { client, isConfigured } = this.getSupabase();
    const cleanEmail = params.email.trim().toLowerCase();
    const cleanName = params.full_name.trim();

    // Duplicidade checada no banco central (antes só olhava o aparelho local)
    if (isConfigured && client) {
      try {
        const { data: existing } = await client
          .from("profiles")
          .select("id")
          .eq("email", cleanEmail)
          .limit(1);
        if (existing && existing.length > 0) {
          return { success: false, error: "Este e-mail já possui cadastro ou solicitação pendente." };
        }
      } catch {
        // segue para o fluxo normal se a checagem falhar
      }
    }

    if (isConfigured && client && params.password) {
      try {
        const { data, error } = await client.auth.signUp({
          email: cleanEmail,
          password: params.password,
          options: {
            data: {
              full_name: cleanName,
              role: params.role,
            },
          },
        });

        if (error) {
          return { success: false, error: translateSupabaseAuthError(error.message) };
        }

        if (data.user) {
          const { error: profileErr } = await client.from("profiles").upsert({
            id: data.user.id,
            full_name: cleanName,
            email: cleanEmail,
            role: params.role,
            active: false, // PENDENTE DE APROVAÇÃO PELO ADMIN
          });
          if (profileErr) {
            console.warn("requestUserAccess (perfil) error:", profileErr);
          }
        }
      } catch (err: any) {
        return { success: false, error: translateSupabaseAuthError(err?.message || "") };
      }
    }

    if (typeof window !== "undefined") {
      const current = await this.getUsers();
      const existing = current.find((u) => u.email === cleanEmail);
      if (existing) {
        return { success: false, error: "Este e-mail já possui uma solicitação ou cadastro no sistema." };
      }

      const newUser = {
        id: crypto.randomUUID(),
        full_name: cleanName,
        email: cleanEmail,
        password: params.password,
        role: params.role,
        active: false, // PENDENTE
        created_at: new Date().toISOString(),
      };
      const updated = [newUser, ...current];
      localStorage.setItem("odontoprint_all_users", JSON.stringify(updated));
    }

    return { success: true };
  }

  static async approveUser(userId: string): Promise<boolean> {
    const { client, isConfigured } = this.getSupabase();
    if (isConfigured && client) {
      try {
        const { error } = await client.from("profiles").update({ active: true }).eq("id", userId);
        if (error) {
          console.warn("approveUser error:", error);
          return false;
        }
      } catch {
        return false;
      }
    }

    if (typeof window !== "undefined") {
      const current = await this.getUsers();
      const updated = current.map((u) => {
        if (u.id === userId) {
          return { ...u, active: true };
        }
        return u;
      });
      localStorage.setItem("odontoprint_all_users", JSON.stringify(updated));
    }

    return true;
  }

  static async rejectUser(userId: string): Promise<boolean> {
    const { client, isConfigured } = this.getSupabase();
    if (isConfigured && client) {
      try {
        // Recusar = remover o perfil; a conta auth órfã não entra
        // (login exige perfil ativo).
        const { error } = await client.from("profiles").delete().eq("id", userId);
        if (error) {
          console.warn("rejectUser error:", error);
          return false;
        }
      } catch {
        return false;
      }
    }

    if (typeof window !== "undefined") {
      const current = await this.getUsers();
      const updated = current.filter((u) => u.id !== userId);
      localStorage.setItem("odontoprint_all_users", JSON.stringify(updated));
    }

    return true;
  }

  static async updateUserRole(userId: string, role: UserRole): Promise<boolean> {
    const { client, isConfigured } = this.getSupabase();
    if (isConfigured && client) {
      try {
        await client.from("profiles").update({ role }).eq("id", userId);
      } catch {
        // ignore
      }
    }

    if (typeof window !== "undefined") {
      const current = await this.getUsers();
      const updated = current.map((u) => {
        if (u.id === userId) {
          return { ...u, role };
        }
        return u;
      });
      localStorage.setItem("odontoprint_all_users", JSON.stringify(updated));
    }

    return true;
  }
}
