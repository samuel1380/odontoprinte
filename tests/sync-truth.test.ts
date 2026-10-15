import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { OdontoPrintService } from "../src/services/odontoprint-service";

// Supabase falso com encadeamento genérico (select/eq/in/order/insert/update/delete/upsert).
function stubClient(opts?: { writeError?: any; selectData?: Record<string, any[]> }) {
  const writeErr = opts?.writeError ?? null;
  const selectData = opts?.selectData ?? {};
  const writeTerminal = () => (writeErr ? { error: writeErr } : { error: null, data: [] });
  const qb = (table: string, terminal?: any): any => {
    const term = terminal ?? { data: selectData[table] ?? [], error: null };
    const q: any = {
      select: () => qb(table),
      eq: () => qb(table, term),
      in: () => qb(table, term),
      order: () => qb(table, term),
      limit: () => qb(table, term),
      insert: async () => writeTerminal(),
      update: () => qb(table, writeTerminal()),
      delete: () => qb(table, writeTerminal()),
      upsert: async () => writeTerminal(),
      single: async () => term,
      then: (resolve: any) => Promise.resolve(term).then(resolve),
    };
    return q;
  };
  return { from: (_table: string) => qb(_table) };
}

const Svc = OdontoPrintService as any;
const realGetSupabase = Svc.getSupabase.bind(Svc);

function useRemote(opts?: { writeError?: any; selectData?: Record<string, any[]> }) {
  const client = stubClient(opts);
  Svc.getSupabase = () => ({ client, isConfigured: true, supabaseUrl: "test" });
}

beforeEach(() => {
  Svc.getSupabase = realGetSupabase;
});

afterEach(() => {
  Svc.getSupabase = realGetSupabase;
});

describe("verdade nas escritas: falhou no banco = erro + rollback, sem fantasma", () => {
  it("criar resina com banco falhando lança erro e não deixa fantasma local", async () => {
    useRemote({ writeError: { message: "new row violates row-level security policy" } });
    await expect(
      OdontoPrintService.createResinBatch({
        brand: "X",
        resin_type: "Modelo",
        lot: "FANTASMA-1",
        volume: 1000,
      })
    ).rejects.toThrow(/Falha ao salvar resina/);

    useRemote({ selectData: { resin_batches: [] } });
    const list = await OdontoPrintService.getResinBatches();
    expect(list.some((b) => b.lot === "FANTASMA-1")).toBe(false);
  });

  it("apagar resina com banco falhando retorna erro e restaura tudo", async () => {
    useRemote({});
    const created = await OdontoPrintService.createResinBatch({
      brand: "Y",
      resin_type: "Modelo",
      lot: "RESTAURA-1",
      volume: 500,
    });
    expect(created.lot).toBe("RESTAURA-1");

    useRemote({ writeError: { message: "connection lost" } });
    const del = await OdontoPrintService.deleteResinBatch(created.id);
    expect(del.success).toBe(false);
    expect(del.error).toMatch(/connection lost/);

    useRemote({ selectData: { resin_batches: [] } });
    const list = await OdontoPrintService.getResinBatches();
    expect(list.some((b) => b.id === created.id)).toBe(true);
  });

  it("apagar mesa com banco falhando restaura mesa e itens", async () => {
    useRemote({});
    const res = await OdontoPrintService.createPrintCards([
      { patient: "PAC-SYNC", clinic: "Cli", cadista: "Cad", work_type: "COROA", file_name: "sync.stl" },
    ]);
    expect(res.success).toBe(true);
    const order = await OdontoPrintService.createOrderBatch({ item_ids: res.created_ids });
    expect(order.success).toBe(true);

    useRemote({ writeError: { message: "db down" } });
    const del = await OdontoPrintService.deletePrintBatch(order.batch!.id);
    expect(del.success).toBe(false);

    useRemote({ selectData: {} });
    const batches = await OdontoPrintService.getPrintBatches();
    expect(batches.some((b) => b.id === order.batch!.id)).toBe(true);
    const cards = await OdontoPrintService.getPrintCards();
    expect(cards.some((c) => c.file_name === "sync.stl")).toBe(true);
  });

  it("mesa apagada com sucesso não ressuscita mesmo se o banco ainda a listar", async () => {
    useRemote({});
    const res = await OdontoPrintService.createPrintCards([
      { patient: "PAC-TOMB", clinic: "Cli", cadista: "Cad", work_type: "COROA", file_name: "tomb.stl" },
    ]);
    const order = await OdontoPrintService.createOrderBatch({ item_ids: res.created_ids });
    const batchId = order.batch!.id;
    const del = await OdontoPrintService.deletePrintBatch(batchId);
    expect(del.success).toBe(true);

    // Simula outro aparelho / banco desatualizado ainda listando a mesa e o item
    useRemote({
      selectData: {
        print_batches: [{ id: batchId, batch_name: "Impressão #X", status: "AGUARDANDO", created_at: new Date().toISOString() }],
        print_job_items: [{ id: res.created_ids[0], batch_id: batchId, status: "AGUARDANDO_FILA", created_at: new Date().toISOString() }],
        print_jobs: [],
        cases: [],
      },
    });
    const batches = await OdontoPrintService.getPrintBatches();
    expect(batches.some((b) => b.id === batchId)).toBe(false);
    const cards = await OdontoPrintService.getPrintCards();
    expect(cards.some((c) => c.file_name === "tomb.stl")).toBe(false);
  });

  it("criar trabalho (cadista) com banco falhando retorna erro e não deixa fantasma", async () => {
    useRemote({ writeError: { message: "db down" } });
    const res = await OdontoPrintService.createCadistaCase({
      patient_code: "PAC-FANTASMA-CAD",
      process_type: "IMPRESSAO",
      selected_files: ["MODELO_DE_TRABALHO"],
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Falha ao salvar paciente/);

    useRemote({ selectData: { cases: [], print_jobs: [], print_job_items: [] } });
    const cases = await OdontoPrintService.getCases();
    expect(cases.some((c: any) => c.patient_code === "PAC-FANTASMA-CAD")).toBe(false);
  });
});
