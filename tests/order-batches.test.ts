import { describe, it, expect, beforeEach } from "vitest";
import { OdontoPrintService } from "../src/services/odontoprint-service";
import { deriveBatchStatus, batchTitle } from "../src/lib/batch-status";

describe("Pedidos (lotes): status derivado dos itens", () => {
  it("deriva Aguardando, Preparando, Imprimindo, Impresso, Concluído e Erro", () => {
    expect(deriveBatchStatus([])).toBe("AGUARDANDO");
    expect(deriveBatchStatus(["NA_FILA", "NA_FILA"])).toBe("AGUARDANDO");
    expect(deriveBatchStatus(["NA_FILA", "PREPARANDO"])).toBe("PREPARANDO");
    expect(deriveBatchStatus(["PREPARANDO", "IMPRIMINDO"])).toBe("IMPRIMINDO");
    expect(deriveBatchStatus(["IMPRESSO", "NA_FILA"])).toBe("IMPRESSO");
    expect(deriveBatchStatus(["CONCLUIDO", "CONCLUIDO"])).toBe("CONCLUIDO");
    expect(deriveBatchStatus(["NA_FILA", "FALHOU"])).toBe("ERRO");
  });

  it("título Impressão #N", () => {
    expect(batchTitle("Impressão #4", 4)).toBe("Impressão #4");
    expect(batchTitle(null, null)).toBe("Impressão");
  });
});

describe("Pedidos (lotes): criar pedido e apagar pedido", () => {
  beforeEach(() => {
    if (typeof window !== "undefined") {
      localStorage.clear();
      sessionStorage.clear();
    }
  });

  it("cada upload vira um pedido separado que nunca mistura itens", async () => {
    const first = await OdontoPrintService.createPrintCards([
      { patient: "PAC-A", clinic: "Cli", cadista: "Cad", work_type: "COROA", file_name: "a.stl" },
      { patient: "PAC-B", clinic: "Cli", cadista: "Cad", work_type: "COROA", file_name: "b.stl" },
    ]);
    const second = await OdontoPrintService.createPrintCards([
      { patient: "PAC-C", clinic: "Cli", cadista: "Cad", work_type: "COROA", file_name: "c.stl" },
    ]);
    expect(first.success).toBe(true);
    expect(second.success).toBe(true);

    const order1 = await OdontoPrintService.createOrderBatch({ item_ids: first.created_ids });
    const order2 = await OdontoPrintService.createOrderBatch({ item_ids: second.created_ids });
    expect(order1.success).toBe(true);
    expect(order2.success).toBe(true);
    expect(order1.batch!.batch_number).toBe(1);
    expect(order2.batch!.batch_number).toBe(2);
    expect(order1.batch!.batch_name).toBe("Impressão #1");

    const cards = await OdontoPrintService.getPrintCards();
    const inOrder1 = cards.filter((c) => c.batch_id === order1.batch!.id);
    const inOrder2 = cards.filter((c) => c.batch_id === order2.batch!.id);
    expect(inOrder1.map((c) => c.file_name).sort()).toEqual(["a.stl", "b.stl"]);
    expect(inOrder2.map((c) => c.file_name)).toEqual(["c.stl"]);
    // Pedido novo não muda o status dos itens
    expect(inOrder1.every((c) => c.status === "NA_FILA")).toBe(true);
  });

  it("apagar pedido remove lote e itens, mantendo os outros pedidos", async () => {
    const res = await OdontoPrintService.createPrintCards([
      { patient: "PAC-X", clinic: "Cli", cadista: "Cad", work_type: "COROA", file_name: "x.stl" },
    ]);
    const order = await OdontoPrintService.createOrderBatch({ item_ids: res.created_ids });

    const del = await OdontoPrintService.deletePrintBatch(order.batch!.id);
    expect(del.success).toBe(true);
    expect(del.removed_count).toBe(1);

    const cards = await OdontoPrintService.getPrintCards();
    expect(cards.some((c) => c.file_name === "x.stl")).toBe(false);
    const batches = await OdontoPrintService.getPrintBatches();
    expect(batches.some((b) => b.id === order.batch!.id)).toBe(false);
  });
});
