import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { OdontoPrintService } from "../src/services/odontoprint-service";

const Svc: any = OdontoPrintService;
const realGetSupabase = Svc.getSupabase.bind(Svc);

// Stub encadeável com rpc programável e insert falhando sob demanda.
function stubClient(opts?: {
  rpcCodes?: (string | { error: any })[];
  failFirstInsertWith?: any;
  selectData?: Record<string, any[]>;
}) {
  const rpcQueue = [...(opts?.rpcCodes ?? [])];
  const rpcCalls: any[] = [];
  const tableInserts: Record<string, number> = {};
  const writeTerminal = (table: string) => {
    tableInserts[table] = (tableInserts[table] || 0) + 1;
    if (table === "print_runs" && opts?.failFirstInsertWith && tableInserts[table] === 1) {
      return { error: opts.failFirstInsertWith };
    }
    return { error: null, data: [] };
  };
  const qb = (table: string, term?: any): any => {
    const t = term ?? { data: opts?.selectData?.[table] ?? [], error: null };
    const q: any = {
      select: () => qb(table),
      eq: () => qb(table, t),
      in: () => qb(table, t),
      order: () => qb(table, t),
      limit: () => qb(table, t),
      insert: async (_rows: any) => writeTerminal(table),
      update: () => qb(table, writeTerminal(table)),
      delete: () => qb(table, writeTerminal(table)),
      upsert: async () => writeTerminal(table),
      single: async () => ({ data: opts?.selectData?.[table]?.[0] ?? null, error: null }),
      then: (resolve: any) => Promise.resolve(t).then(resolve),
    };
    return q;
  };
  const client = {
    from: (table: string) => qb(table),
    rpc: async (fn: string, args: any) => {
      rpcCalls.push({ fn, args });
      const next = rpcQueue.shift();
      if (next && typeof next === "object") return { data: null, error: (next as any).error };
      return { data: next ?? null, error: null };
    },
  };
  return { client, rpcCalls, getInserts: () => tableInserts["print_runs"] || 0 };
}

function useRemote(stub: { client: any }) {
  Svc.getSupabase = () => ({ client: stub.client, isConfigured: true, supabaseUrl: "test" });
}

beforeEach(() => {
  Svc.getSupabase = realGetSupabase;
});

afterEach(() => {
  Svc.getSupabase = realGetSupabase;
});

async function setupMesa() {
  const cards = await OdontoPrintService.createPrintCards([
    { patient: "PAC-RUN", clinic: "Cli", cadista: "Cad", work_type: "COROA", file_name: "run.stl" },
  ]);
  expect(cards.success).toBe(true);
  return cards.created_ids;
}

describe("run_code à prova de concorrência (23505)", () => {
  it("usa o código da RPC atômica do banco quando disponível", async () => {
    const stub = stubClient({ rpcCodes: ["A042"] });
    useRemote(stub);
    const code = await OdontoPrintService.generatePrintCode(false);
    expect(code).toBe("A042");
    expect(stub.rpcCalls[0]).toMatchObject({ fn: "generate_print_run_code", args: { p_has_retry: false } });
  });

  it("colisão 23505 gera código NOVO e conclui (mata o duplicate key)", async () => {
    const stub = stubClient({
      rpcCodes: ["A044"],
      failFirstInsertWith: {
        code: "23505",
        message: 'duplicate key value violates unique constraint "print_runs_run_code_key"',
      },
    });
    useRemote(stub);
    const ids = await setupMesa();
    const res = await OdontoPrintService.startPrintRun({
      run_code: "A043",
      printer_id: "printer-1",
      resin_batch_id: "resin-1",
      calibration_id: "calib-1",
      item_ids: ids,
      supports_confirmed: true,
      resin_manipulated: true,
      has_retry: false,
    });
    expect(res.success).toBe(true);
    expect(res.run.run_code).toBe("A044");
    expect(stub.getInserts()).toBe(2);
  });

  it("RPC fora do ar usa o contador local (offline/demo) sem quebrar", async () => {
    const stub = stubClient({ rpcCodes: [{ error: { message: "down" } }] });
    useRemote(stub);
    const code = await OdontoPrintService.generatePrintCode(false);
    expect(code).toMatch(/^A\d{3}$/);
  });

  it("isRunCodeConflict só casa com o conflito de run_code", () => {
    expect(Svc.isRunCodeConflict({ code: "23505" })).toBe(true);
    expect(
      Svc.isRunCodeConflict({ message: 'duplicate key value violates unique constraint "print_runs_run_code_key"' })
    ).toBe(true);
    expect(Svc.isRunCodeConflict({ code: "23503", message: "foreign key" })).toBe(false);
    expect(Svc.isRunCodeConflict(null)).toBe(false);
  });
});
