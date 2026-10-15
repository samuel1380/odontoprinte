import { describe, it, expect } from "vitest";
import { AIService } from "../src/services/ai-service";

const card = (over: any) => ({
  id: over.id || Math.random().toString(),
  patient_code: "PAC1",
  patient_name: null,
  clinic_name: "OdontoPrime",
  batch_name: null,
  status: "NA_FILA",
  is_retry: false,
  last_failure_reason: null,
  ...over,
});

describe("buildAILabContext: contexto essencial da bancada", () => {
  it("prioriza falhas e impressão antes da espera e limita o tamanho", () => {
    const cards = [
      card({ id: "c1", status: "CONCLUIDO" }),
      card({ id: "w1", status: "NA_FILA" }),
      card({ id: "f1", status: "FALHOU", last_failure_reason: "Descolou" }),
      card({ id: "p1", status: "IMPRIMINDO" }),
    ];
    const ctx = AIService.buildAILabContext({
      casesRes: [],
      queueRes: { items: [] },
      printers: [],
      resins: [],
      overview: { printing: [], waitingModels: 1, failedCount: 1 },
      cards,
      batches: [],
    });
    expect(ctx.models[0].status).toBe("FALHOU");
    expect(ctx.models[0].motivo_falha).toBe("Descolou");
    expect(ctx.models[0].reimpressao).toBe(true);
    expect(ctx.models[1].status).toBe("IMPRIMINDO");
    expect(ctx.failedCount).toBe(1);
    expect(ctx.waitingModels).toBe(1);
  });

  it("mapeia mesas e inclui clínica do modelo", () => {
    const ctx = AIService.buildAILabContext({
      casesRes: [],
      queueRes: { items: [] },
      printers: [],
      resins: [],
      overview: null,
      cards: [card({ clinic_name: "Dra Maria", batch_name: "Impressão #2" })],
      batches: [
        { batch_name: "Impressão #2", batch_number: 2, status: "IMPRIMINDO", printer_name: "Saturn", items_count: 3 },
      ],
    });
    expect(ctx.models[0].clinica).toBe("Dra Maria");
    expect(ctx.models[0].mesa).toBe("Impressão #2");
    expect(ctx.batches[0]).toMatchObject({ mesa: "Impressão #2", status: "IMPRIMINDO" });
  });

  it("tolera overview ausente (banco antigo / offline)", () => {
    const ctx = AIService.buildAILabContext({
      casesRes: [],
      queueRes: { items: [{}, {}] },
      printers: [],
      resins: [],
      overview: null,
      cards: [],
      batches: [],
    });
    expect(ctx.printing).toEqual([]);
    expect(ctx.waitingModels).toBe(2);
    expect(ctx.failedCount).toBe(0);
  });
});
