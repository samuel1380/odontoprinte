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
});
