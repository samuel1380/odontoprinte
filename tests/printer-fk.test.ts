import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { OdontoPrintService } from "../src/services/odontoprint-service";

const Svc: any = OdontoPrintService;
const realGetSupabase = Svc.getSupabase.bind(Svc);

// Banco falso mutável entre chamadas (db.tabela = linhas visíveis no remoto).
function stubClient(db: Record<string, any[]>, opts?: { writeError?: any; rpcCode?: string }) {
  const writeTerminal = () => (opts?.writeError ? { error: opts.writeError } : { error: null, data: [] });
  const qb = (table: string, term?: any): any => {
    const t = term ?? { data: db[table] ?? [], error: null };
    const q: any = {
      select: () => qb(table),
      eq: () => qb(table, t),
      in: () => qb(table, t),
      order: () => qb(table, t),
      limit: () => qb(table, t),
      insert: async () => writeTerminal(),
      update: () => qb(table, writeTerminal()),
      delete: () => qb(table, writeTerminal()),
      upsert: async () => writeTerminal(),
      single: async () => ({ data: (db[table] ?? [])[0] ?? null, error: null }),
      // maybeSingle IGNORA o filtro eq: os testes usam 0 ou 1 linha por tabela.
      maybeSingle: async () => ({ data: (db[table] ?? [])[0] ?? null, error: null }),
      then: (resolve: any) => Promise.resolve(t).then(resolve),
    };
    return q;
  };
  return {
    from: (table: string) => qb(table),
    rpc: async () => ({ data: opts?.rpcCode ?? "A999", error: null }),
  };
}

function useRemote(db: Record<string, any[]>, opts?: { writeError?: any; rpcCode?: string }) {
  const client = stubClient(db, opts);
  Svc.getSupabase = () => ({ client, isConfigured: true, supabaseUrl: "test" });
}

beforeEach(() => {
  Svc.getSupabase = realGetSupabase;
});

afterEach(() => {
  Svc.getSupabase = realGetSupabase;
});

async function setupMesaComImpressora() {
  const db: Record<string, any[]> = {
    printers: [],
    resin_batches: [],
    resin_calibrations: [],
    print_batches: [],
    print_job_items: [],
    print_jobs: [],
    cases: [],
  };
  useRemote(db, { rpcCode: "A100" });
  const printer = await OdontoPrintService.createPrinter({
    name: "Saturn-FK",
    brand: "Elegoo",
    model: "Saturn 4",
    serial_number: "SN-FK-1",
  });
  const cards = await OdontoPrintService.createPrintCards([
    { patient: "PAC-FK", clinic: "Cli", cadista: "Cad", work_type: "COROA", file_name: "fk.stl" },
  ]);
  expect(cards.success).toBe(true);
  const order = await OdontoPrintService.createOrderBatch({ item_ids: cards.created_ids });
  expect(order.success).toBe(true);
  // Espelha no "banco" tudo que foi criado localmente
  const runs = await OdontoPrintService.getPrintRuns().catch(() => []);
  void runs;
  return { db, printer, order };
}

describe("blindagem FK ao iniciar impressão (printer/resina/calibração fantasma)", () => {
  it("impressora apagada no banco falha com mensagem clara (sem duplicate/estranho)", async () => {
    const { db, printer, order } = await setupMesaComImpressora();
    db.printers = []; // banco zerado / apagada em outro aparelho
    const res = await OdontoPrintService.startPrintBatchDirectly({
      batch_id: order.batch!.id,
      printer_id: printer.id,
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/banco central/);
  });

  it("resina apagada no banco falha pedindo outra resina", async () => {
    const { db, printer, order } = await setupMesaComImpressora();
    db.printers = [{ id: printer.id }];
    const resin = await OdontoPrintService.createResinBatch({
      brand: "B",
      resin_type: "Modelo",
      lot: "FK-LOTE",
      volume: 1000,
    });
    db.resin_batches = [{ id: resin.id }]; // existia no cadastro...
    const cal = await OdontoPrintService.registerCalibrationAttempt({
      resin_batch_id: resin.id,
      printer_id: printer.id,
      initial_exposure_time: 25,
      exposure_time: 2.2,
      lift_speed: 60,
      layer_height: 0.05,
      hexagon_size_mm: 10.0,
      lines_visible: true,
      numbers_visible: true,
      details_visible: true,
      wash_time: 5,
      cure_time: 10,
    });
    expect(cal.approved).toBe(true);
    db.resin_batches = []; // lote sumiu no banco
    db.resin_calibrations = [{ id: cal.calibration.id }];
    const res = await OdontoPrintService.startPrintBatchDirectly({
      batch_id: order.batch!.id,
      printer_id: printer.id,
      resin_batch_id: resin.id,
      calibration_id: cal.calibration.id,
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Resina não encontrada/);
  });

  it("sem resina calibrada e com banco configurado bloqueia com orientação", async () => {
    const { db, printer, order } = await setupMesaComImpressora();
    db.printers = [{ id: printer.id }];
    const res = await OdontoPrintService.startPrintBatchDirectly({
      batch_id: order.batch!.id,
      printer_id: printer.id,
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Nenhuma resina calibrada/);
  });

  it("getPrinters poda impressora que sumiu do banco (outro aparelho apagou)", async () => {
    const db: Record<string, any[]> = { printers: [], printer_maintenances: [] };
    useRemote(db, { rpcCode: "A101" });
    const printer = await OdontoPrintService.createPrinter({
      name: "Prune-Me",
      brand: "Elegoo",
      model: "Saturn 4",
      serial_number: "SN-PRUNE-1",
    });
    db.printers = [{ ...printer }];
    let list = await OdontoPrintService.getPrinters();
    expect(list.some((p) => p.id === printer.id)).toBe(true);
    db.printers = []; // apagada em outro aparelho
    list = await OdontoPrintService.getPrinters();
    expect(list.some((p) => p.id === printer.id)).toBe(false);
  });
});
