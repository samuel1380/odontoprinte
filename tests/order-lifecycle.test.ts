import { describe, it, expect, beforeEach } from "vitest";
import { OdontoPrintService } from "../src/services/odontoprint-service";
import { deriveBatchStatus } from "../src/lib/batch-status";

describe("AUDIT fila por pedidos (scratch)", () => {
  beforeEach(() => {
    if (typeof window !== "undefined") {
      localStorage.clear();
      sessionStorage.clear();
    }
  });

  it("fluxo completo: pedido -> avanco -> imprimir -> apagar", async () => {
    // 1. Pedido com 2 arquivos
    const up = await OdontoPrintService.createPrintCards([
      { patient: "PAC-1", clinic: "Cli", cadista: "Cad", work_type: "COROA", file_name: "um.stl", file_size: 10, file_hash: "h1" },
      { patient: "PAC-2", clinic: "Cli", cadista: "Cad", work_type: "COROA", file_name: "dois.stl", file_size: 20, file_hash: "h2" },
    ]);
    expect(up.success).toBe(true);
    expect(up.created_ids).toHaveLength(2);

    const ob = await OdontoPrintService.createOrderBatch({ item_ids: up.created_ids });
    expect(ob.success).toBe(true);
    expect(ob.batch!.batch_name).toBe("Impressão #1");

    let cards = await OdontoPrintService.getPrintCards();
    let mine = cards.filter((c) => c.batch_id === ob.batch!.id);
    expect(mine).toHaveLength(2);
    expect(deriveBatchStatus(mine.map((m) => m.status))).toBe("AGUARDANDO");

    // 2. Avança um item -> pedido vira Preparando
    await OdontoPrintService.updateCardStatus(mine[0].id, "PREPARANDO");
    cards = await OdontoPrintService.getPrintCards();
    mine = cards.filter((c) => c.batch_id === ob.batch!.id);
    expect(deriveBatchStatus(mine.map((m) => m.status))).toBe("PREPARANDO");

    // 3. Itens imprimíveis do pedido (espelho do handlePrintBatch)
    const printable = mine
      .filter((i) => ["NA_FILA", "PREPARANDO", "FALHOU"].includes(i.status))
      .map((i) => i.id);
    expect(printable).toHaveLength(2);

    // 4. Falha um item -> pedido vira Erro
    await OdontoPrintService.updateCardStatus(mine[1].id, "FALHOU", "teste");
    cards = await OdontoPrintService.getPrintCards();
    mine = cards.filter((c) => c.batch_id === ob.batch!.id);
    expect(deriveBatchStatus(mine.map((m) => m.status))).toBe("ERRO");

    // 5. Apaga o pedido: some lote + itens, mantém outros pedidos e pacientes
    const up2 = await OdontoPrintService.createPrintCards([
      { patient: "PAC-3", clinic: "Cli", cadista: "Cad", work_type: "COROA", file_name: "tres.stl" },
    ]);
    const ob2 = await OdontoPrintService.createOrderBatch({ item_ids: up2.created_ids });
    const del = await OdontoPrintService.deletePrintBatch(ob.batch!.id);
    expect(del.success).toBe(true);
    expect(del.removed_count).toBe(2);

    cards = await OdontoPrintService.getPrintCards();
    expect(cards.some((c) => c.batch_id === ob.batch!.id)).toBe(false);
    expect(cards.filter((c) => c.batch_id === ob2.batch!.id)).toHaveLength(1);
    const cases = await OdontoPrintService.getCases();
    expect(cases.some((c) => c.patient_code === "PAC-1")).toBe(true);

    // 6. Apagar pedido inexistente falha com mensagem clara
    const del2 = await OdontoPrintService.deletePrintBatch("00000000-0000-0000-0000-000000000000");
    expect(del2.success).toBe(false);
  });

  it("move modelo entre pedidos, faz bulk do grupo e junta falhas", async () => {
    const upA = await OdontoPrintService.createPrintCards([
      { patient: "PA", clinic: "Cli", cadista: "Cad", work_type: "COROA", file_name: "pa.stl" },
    ]);
    const upB = await OdontoPrintService.createPrintCards([
      { patient: "PB", clinic: "Cli", cadista: "Cad", work_type: "COROA", file_name: "pb.stl" },
    ]);
    const oA = await OdontoPrintService.createOrderBatch({ item_ids: upA.created_ids });
    const oB = await OdontoPrintService.createOrderBatch({ item_ids: upB.created_ids });

    // Mover modelo do pedido B para o A
    const mv = await OdontoPrintService.moveItemToBatch(upB.created_ids[0], oA.batch!.id);
    expect(mv.success).toBe(true);
    let cards = await OdontoPrintService.getPrintCards();
    expect(cards.find((c) => c.id === upB.created_ids[0])!.batch_id).toBe(oA.batch!.id);

    // Bulk: preparar todos do pedido A
    const bulk = await OdontoPrintService.bulkUpdateGroupStatus(
      [upA.created_ids[0], upB.created_ids[0]],
      "PREPARANDO"
    );
    expect(bulk.success).toBe(true);
    expect(bulk.moved).toBe(2);

    // Falha em um -> vira prioridade; juntar falhas cria a próxima impressão
    await OdontoPrintService.updateCardStatus(upA.created_ids[0], "FALHOU", "teste");
    const failed = await OdontoPrintService.getFailedPendingItems();
    expect(failed.some((i) => i.id === upA.created_ids[0])).toBe(true);

    const col = await OdontoPrintService.collectFailedIntoNewBatch();
    expect(col.success).toBe(true);
    expect(col.count).toBe(1);
    cards = await OdontoPrintService.getPrintCards();
    const collected = cards.find((c) => c.id === upA.created_ids[0])!;
    expect(collected.batch_id).toBe(col.batch!.id);
    // Falhados voltam à fila como prioridade (mantêm tentativas)
    expect(collected.status).toBe("NA_FILA");
    expect(collected.is_retry).toBe(true);

    // Sem falhas pendentes -> erro claro
    await OdontoPrintService.updateCardStatus(upA.created_ids[0], "CONCLUIDO");
    const col2 = await OdontoPrintService.collectFailedIntoNewBatch();
    expect(col2.success).toBe(false);

    // Visão da dashboard explica os grupos
    const overview = await OdontoPrintService.getPrintingOverview();
    expect(overview.waitingModels).toBeGreaterThanOrEqual(1);

    // Modelo imprimindo não troca de grupo
    await OdontoPrintService.updateCardStatus(upB.created_ids[0], "IMPRIMINDO");
    const blocked = await OdontoPrintService.moveItemToBatch(upB.created_ids[0], oB.batch!.id);
    expect(blocked.success).toBe(false);
  });
});
