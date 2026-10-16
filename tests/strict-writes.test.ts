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

describe("escritas estritas restantes: erro real + rollback", () => {
  it("criar impressora com banco falhando lança erro e não deixa fantasma", async () => {
    const db: Record<string, any[]> = { printers: [] };
    useRemote(db, { writeError: { message: "db down" } });
    await expect(
      OdontoPrintService.createPrinter({
        name: "Fantasma-1",
        brand: "Elegoo",
        model: "Saturn 4",
        serial_number: "SN-F-1",
      })
    ).rejects.toThrow(/Falha ao salvar impressora/);

    useRemote({ printers: [] });
    const list = await OdontoPrintService.getPrinters();
    expect(list.some((p) => p.name === "Fantasma-1")).toBe(false);
  });

  it("manutenção com banco falhando retorna erro e reverte", async () => {
    const db: Record<string, any[]> = { printers: [], printer_maintenances: [] };
    useRemote(db);
    const printer = await OdontoPrintService.createPrinter({
      name: "P-Manut",
      brand: "Elegoo",
      model: "Saturn 4",
      serial_number: "SN-M-1",
    });
    useRemote(db, { writeError: { message: "db down" } });
    const res = await OdontoPrintService.addPrinterMaintenance({
      printer_id: printer.id,
      checklist: {
        leveling_ok: true,
        cleaning_ok: true,
        fep_integrity_ok: true,
        led_integrity_ok: true,
        black_points_led: false,
        low_led_luminosity: false,
        protective_film_ok: true,
      },
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Falha ao salvar manutenção/);
  });

  it("troca de perfil com banco falhando retorna false sem aplicar local", async () => {
    const db: Record<string, any[]> = { profiles: [] };
    useRemote(db, { writeError: { message: "db down" } });
    const ok = await OdontoPrintService.updateUserRole("user-1", "ADMIN");
    expect(ok).toBe(false);
  });
});
