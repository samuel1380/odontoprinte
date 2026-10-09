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
        map.set(item.id, item);
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
        await client.from("print_jobs").insert({ ...newJob, created_by: null });
        await client.from("print_job_items").insert(newItems);
      } catch (err) {
        console.error("Supabase insert error (fallback preserved):", err);
      }
    }

    return { success: true, case_id: caseId, job_id: jobId };
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

  // --- IMPRESSORAS E MANUTENÇÕES ---
  static async getPrinters(): Promise<PrinterWithStatus[]> {
    const settings = await this.getSettings();
    mockPrinters = loadLocal("odontoprint_printers", mockPrinters);
    mockMaintenances = loadLocal("odontoprint_maintenances", mockMaintenances);

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
          mockPrinters = mergeById(printersData, mockPrinters);
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

    mockPrinters = loadLocal("odontoprint_printers", mockPrinters);
    mockMaintenances = loadLocal("odontoprint_maintenances", mockMaintenances);

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

  static async createPrinter(params: Omit<Printer, "id" | "created_at" | "updated_at">): Promise<Printer> {
    const now = new Date().toISOString();
    const newPrinter: Printer = {
      id: crypto.randomUUID(),
      ...params,
      created_at: now,
      updated_at: now,
    };

    mockPrinters = loadLocal("odontoprint_printers", mockPrinters);
    mockPrinters.push(newPrinter);
    saveLocal("odontoprint_printers", mockPrinters);

    const { client, isConfigured } = this.getSupabase();
    if (isConfigured && client) {
      try {
        const { error } = await client.from("printers").insert(newPrinter);
        if (error) {
          console.warn("Supabase insert printer error:", error);
        }
      } catch (err) {
        console.warn("Supabase insert printer exception:", err);
      }
    }
    return newPrinter;
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
    mockResinBatches = loadLocal("odontoprint_resin_batches", mockResinBatches);
    const { client, isConfigured } = this.getSupabase();
    if (isConfigured && client) {
      try {
        const { data, error } = await client
          .from("resin_batches")
          .select("*")
          .order("received_at", { ascending: false });
        if (!error && data) {
          mockResinBatches = mergeById(data, mockResinBatches);
          saveLocal("odontoprint_resin_batches", mockResinBatches);
        }
      } catch (err) {
        console.warn("Supabase getResinBatches error:", err);
      }
    }
    return [...mockResinBatches].sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime());
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
      const parentJob = mockPrintJobs.find((j) => j.id === jobItem.print_job_id);
      if (parentJob) {
        const siblingItems = mockPrintJobItems.filter((i) => i.print_job_id === parentJob.id);
        const allCompleted = siblingItems.every((i) => i.status === "CONCLUIDO");
        parentJob.status = allCompleted ? "CONCLUIDO" : "PARCIAL";
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

  static async getPrintRunById(id: string) {
    const run = mockPrintRuns.find((r) => r.id === id);
    if (!run) return null;

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
    const c = mockCases.find((x) => x.id === caseId) || null;
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
    const printers = await this.getPrinters();
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

  static async getRecentActivities(): Promise<AuditLog[]> {
    return mockAuditLogs.slice(0, 10);
  }

  // ====================================================================
  // MÓDULO 2.B: FRESAGEM CNC (USINAGEM DE ZIRCÔNIA & PMMA)
  // ====================================================================
  static async getMillingItems(): Promise<MillingItem[]> {
    mockMillingItems = loadLocal<MillingItem[]>("odontoprint_milling_items", mockMillingItems);
    return mockMillingItems;
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
    return mockFinishingItems;
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
    mockPrintJobItems = loadLocal<PrintJobItem[]>("odontoprint_queue_items", mockPrintJobItems);
    const jobItem = mockPrintJobItems.find((i) => i.id === id);
    if (jobItem) {
      jobItem.status = "CONCLUIDO";
      saveLocal("odontoprint_queue_items", mockPrintJobItems);
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
    const { client, isConfigured } = this.getSupabase();
    const cleanEmail = params.email.trim().toLowerCase();
    const cleanName = params.full_name.trim();

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
          return { success: false, error: error.message };
        }

        if (data.user) {
          await client.from("profiles").upsert({
            id: data.user.id,
            full_name: cleanName,
            role: params.role,
            active: false, // PENDENTE DE APROVAÇÃO PELO ADMIN
          });
        }
      } catch (err: any) {
        return { success: false, error: err?.message || "Erro ao conectar com Supabase" };
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
        await client.from("profiles").update({ active: true }).eq("id", userId);
      } catch {
        // ignore
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
        await client.from("profiles").delete().eq("id", userId);
      } catch {
        // ignore
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
