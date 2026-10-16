import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { OdontoPrintService } from "../src/services/odontoprint-service";

const Svc: any = OdontoPrintService;
const realGetSupabase = Svc.getSupabase.bind(Svc);

function stubClient(db: Record<string, any[]>, opts?: { writeError?: any }) {
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
      maybeSingle: async () => ({ data: (db[table] ?? [])[0] ?? null, error: null }),
      then: (resolve: any) => Promise.resolve(t).then(resolve),
    };
    return q;
  };
  return {
    from: (table: string) => qb(table),
    rpc: async () => ({ data: "A999", error: null }),
  };
}

function useRemote(db: Record<string, any[]>, opts?: { writeError?: any }) {
  const client = stubClient(db, opts);
  Svc.getSupabase = () => ({ client, isConfigured: true, supabaseUrl: "test" });
}

beforeEach(() => {
  Svc.getSupabase = realGetSupabase;
});

afterEach(() => {
  Svc.getSupabase = realGetSupabase;
});

const CAL_PARAMS = (resin_batch_id: string, printer_id: string) => ({
  resin_batch_id,
  printer_id,
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

describe("blindagem FK ao salvar calibração", () => {
  it("lote fantasma no banco falha com mensagem clara e reverte", async () => {
    const db: Record<string, any[]> = { resin_batches: [], resin_calibrations: [], printers: [] };
    useRemote(db);
    const printer = await OdontoPrintService.createPrinter({
      name: "P-Cal",
      brand: "Elegoo",
      model: "Saturn 4",
      serial_number: "SN-CAL-1",
    });
    const resin = await OdontoPrintService.createResinBatch({
      brand: "B",
      resin_type: "Modelo",
      lot: "CAL-FANTASMA",
      volume: 1000,
    });
    db.printers = [{ id: printer.id }];
    // lote sumiu no banco
    const res = await OdontoPrintService.registerCalibrationAttempt(
      CAL_PARAMS(resin.id, printer.id)
    );
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Lote de resina não encontrado/);
  });

  it("impressora fantasma no banco falha com mensagem clara", async () => {
    const db: Record<string, any[]> = { resin_batches: [], resin_calibrations: [], printers: [] };
    useRemote(db);
    const printer = await OdontoPrintService.createPrinter({
      name: "P-Cal2",
      brand: "Elegoo",
      model: "Saturn 4",
      serial_number: "SN-CAL-2",
    });
    const resin = await OdontoPrintService.createResinBatch({
      brand: "B",
      resin_type: "Modelo",
      lot: "CAL-OK",
      volume: 1000,
    });
    db.resin_batches = [{ id: resin.id }];
    // impressora sumiu no banco
    const res = await OdontoPrintService.registerCalibrationAttempt(
      CAL_PARAMS(resin.id, printer.id)
    );
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Impressora não encontrada/);
  });

  it("tudo existindo salva com sucesso", async () => {
    const db: Record<string, any[]> = { resin_batches: [], resin_calibrations: [], printers: [] };
    useRemote(db);
    const printer = await OdontoPrintService.createPrinter({
      name: "P-Cal3",
      brand: "Elegoo",
      model: "Saturn 4",
      serial_number: "SN-CAL-3",
    });
    const resin = await OdontoPrintService.createResinBatch({
      brand: "B",
      resin_type: "Modelo",
      lot: "CAL-SUCESSO",
      volume: 1000,
    });
    db.printers = [{ id: printer.id }];
    db.resin_batches = [{ id: resin.id }];
    const res = await OdontoPrintService.registerCalibrationAttempt(
      CAL_PARAMS(resin.id, printer.id)
    );
    expect(res.success).toBe(true);
    expect(res.approved).toBe(true);
  });
});
