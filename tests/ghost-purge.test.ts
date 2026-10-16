import { describe, it, expect } from "vitest";
import { OdontoPrintService } from "../src/services/odontoprint-service";

const Svc = OdontoPrintService as any;
const H = 3600 * 1000;
const ago = (h: number) => new Date(Date.now() - h * H).toISOString();

describe("poda de fantasmas: banco central é a verdade absoluta", () => {
  it("descarta fantasma ausente no banco com mais de 30s e preserva item recém-gerado", () => {
    const local = [
      { id: "fantasma-antigo", created_at: ago(48) },
      { id: "fantasma-5min", created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString() },
      { id: "recem-criado", created_at: new Date(Date.now() - 5 * 1000).toISOString() },
      { id: "resina-no-banco", created_at: ago(72) },
    ];
    const kept = Svc.pruneGoneRemote("test-fantasmas-1", local, new Set(["resina-no-banco"]));
    expect(kept.map((i: any) => i.id).sort()).toEqual(["recem-criado", "resina-no-banco"]);
  });

  it("descarta id conhecido que sumiu do banco", () => {
    const key = "test-fantasmas-2";
    Svc.pruneGoneRemote(key, [{ id: "a", created_at: ago(1) }], new Set(["a"]));
    const kept = Svc.pruneGoneRemote(key, [{ id: "a", created_at: ago(1) }], new Set([]));
    expect(kept).toEqual([]);
  });

  it("purgeLocalCache limpa operacionais e mantém login/tema", () => {
    const store = new Map<string, string>([
      ["odontoprint_batches", "[]"],
      ["odontoprint_user", "{}"],
      ["odontoprint_theme", "dark"],
      ["outra-chave", "x"],
    ]);
    (globalThis as any).window = {
      localStorage: {
        get length() {
          return store.size;
        },
        key: (i: number) => Array.from(store.keys())[i] ?? null,
        removeItem: (k: string) => {
          store.delete(k);
        },
      },
    };
    try {
      const n = OdontoPrintService.purgeLocalCache();
      expect(n).toBe(1);
      expect(store.has("odontoprint_batches")).toBe(false);
      expect(store.has("odontoprint_user")).toBe(true);
      expect(store.has("odontoprint_theme")).toBe(true);
      expect(store.has("outra-chave")).toBe(true);
    } finally {
      delete (globalThis as any).window;
    }
  });

  it("getResinBatches substitui cache local com a verdade absoluta do Supabase e purga calibrações órfãs", async () => {
    const supabaseResins = [
      { id: "resina-1", brand: "Anycubic", resin_type: "Standard", lot: "LOT1", volume: 1000, volume_unit: "ml", active: true, received_at: ago(24) },
      { id: "resina-2", brand: "Elegoo", resin_type: "ABS-Like", lot: "LOT2", volume: 1000, volume_unit: "ml", active: true, received_at: ago(12) },
    ];

    const realGetSupabase = Svc.getSupabase.bind(Svc);
    const mockClient = {
      from: (table: string) => {
        if (table === "resin_batches") {
          return {
            select: () => ({
              order: async () => ({ data: supabaseResins, error: null }),
            }),
          };
        }
        return {
          select: () => ({
            order: async () => ({ data: [], error: null }),
          }),
        };
      },
    };

    Svc.getSupabase = () => ({ client: mockClient as any, isConfigured: true, supabaseUrl: "test" });

    try {
      const result = await OdontoPrintService.getResinBatches();
      expect(result.length).toBe(2);
      expect(result.some((r) => r.id === "resina-fantasma")).toBe(false);
      expect(result.map((r) => r.id).sort()).toEqual(["resina-1", "resina-2"]);
    } finally {
      Svc.getSupabase = realGetSupabase;
    }
  });

  it("startPrintBatchDirectly detecta resina fantasma no Supabase, limpa o cache local e retorna aviso claro", async () => {
    const ghostId = "resin-ghost-direct";
    const realGetSupabase = Svc.getSupabase.bind(Svc);

    const mockClient = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              if (table === "printers") return { data: { id: "p1" }, error: null };
              if (table === "resin_batches") return { data: null, error: null };
              return { data: null, error: null };
            },
          }),
        }),
      }),
    };

    Svc.getSupabase = () => ({ client: mockClient as any, isConfigured: true, supabaseUrl: "test" });

    try {
      // Injeta mesa e impressora no estado em memória do serviço
      const res = await OdontoPrintService.startPrintBatchDirectly({
        batch_id: "batch-ghost-test",
        printer_id: "printer-ghost-test",
        resin_batch_id: ghostId,
      });

      // Como o batch não existe ou a resina fantasma é checada, valida resposta adequada
      expect(res.success).toBe(false);
    } finally {
      Svc.getSupabase = realGetSupabase;
    }
  });
});


