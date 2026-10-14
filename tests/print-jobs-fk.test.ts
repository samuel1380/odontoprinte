import { describe, it, expect, vi } from "vitest";
import { OdontoPrintService } from "../src/services/odontoprint-service";
import type { Case } from "../src/types/database.types";

// Cliente Supabase falso: responde SELECT com os ids existentes e captura INSERTs.
function stubClient(existingIds: string[], opts?: { insertError?: any }) {
  const inserted: any[][] = [];
  return {
    inserted,
    client: {
      from: (table: string) => {
        if (table !== "cases") throw new Error(`tabela inesperada: ${table}`);
        return {
          select: (_cols: string) => ({
            in: async (_col: string, ids: string[]) => ({
              data: ids.filter((id) => existingIds.includes(id)).map((id) => ({ id })),
              error: null,
            }),
          }),
          upsert: async () => ({ error: null }),
          insert: async (rows: any[]) => {
            inserted.push(rows);
            return { error: opts?.insertError ?? null };
          },
        };
      },
    },
  };
}

const staleCase = {
  id: "case-fantasma-1",
  patient_code: "PAC100",
  patient_name: "Maria",
  notes: "obs",
  created_by: "algum-user",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
} as Case;

describe("ensureCasesExist: blindagem contra print_jobs_case_id_fkey", () => {
  it("reinsere o caso fantasma (mesmo id, sem created_by) antes dos jobs", async () => {
    const { client, inserted } = stubClient(["case-novo-1"]);
    await OdontoPrintService.ensureCasesExist(
      client as any,
      ["case-novo-1", "case-fantasma-1"],
      [],
      [staleCase]
    );
    expect(inserted.length).toBe(1);
    expect(inserted[0].length).toBe(1);
    expect(inserted[0][0].id).toBe("case-fantasma-1");
    expect(inserted[0][0].patient_code).toBe("PAC100");
    expect(inserted[0][0].created_by).toBeNull();
  });

  it("não insere nada quando todos os casos já existem no banco", async () => {
    const { client, inserted } = stubClient(["case-novo-1", "case-fantasma-1"]);
    await OdontoPrintService.ensureCasesExist(
      client as any,
      ["case-novo-1", "case-fantasma-1"],
      [],
      [staleCase]
    );
    expect(inserted.length).toBe(0);
  });

  it("falha com mensagem clara quando não há dados locais para recuperar", async () => {
    const { client } = stubClient([]);
    await expect(
      OdontoPrintService.ensureCasesExist(client as any, ["case-inexistente"], [], [])
    ).rejects.toThrow(/Falha ao gravar pacientes/);
  });

  it("propaga erro de RLS/permissão com a dica de diagnóstico", async () => {
    const badClient = {
      from: () => ({
        select: () => ({
          in: async () => ({ data: null, error: { message: "new row violates row-level security policy" } }),
        }),
      }),
    };
    const hint = (m: string) => (/row.level.security/i.test(m) ? " (dica RLS)" : "");
    await expect(
      OdontoPrintService.ensureCasesExist(badClient as any, ["x"], [], [], hint)
    ).rejects.toThrow(/dica RLS/);
  });
});
