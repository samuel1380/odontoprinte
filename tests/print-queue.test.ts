import { describe, it, expect, beforeEach } from "vitest";
import { OdontoPrintService } from "../src/services/odontoprint-service";

describe("Fila de Impressão 3D - Cadastro, Lotes, Duplicidade e Backup", () => {
  beforeEach(() => {
    // Limpa sessionStorage/localStorage no ambiente de teste
    if (typeof window !== "undefined") {
      localStorage.clear();
      sessionStorage.clear();
    }
  });

  it("cadastra cards de impressão com campos obrigatórios e caminho de backup virtual", async () => {
    const res = await OdontoPrintService.createPrintCards([
      {
        patient: "PAC-001",
        patient_name: "Camila Soares",
        clinic: "Clínica Dental Prime",
        cadista: "Lucas Cadista",
        work_type: "MODELO_COM_TROQUEL",
        priority: "NORMAL",
        file_name: "PAC001_SUPERIOR.stl",
        file_size: 15400000,
        file_hash: "hash12345",
      },
    ]);

    expect(res.success).toBe(true);
    expect(res.created_count).toBe(1);

    const cards = await OdontoPrintService.getPrintCards();
    const created = cards.find((c) => c.patient_code === "PAC-001");

    expect(created).toBeDefined();
    expect(created?.clinic_name).toBe("Clínica Dental Prime");
    expect(created?.cadista_name).toBe("Lucas Cadista");
    expect(created?.status).toBe("NA_FILA");
    expect(created?.file_size).toBe(15400000);
    expect(created?.file_hash).toBe("hash12345");
    // Conteúdo do arquivo nunca vai ao banco: só metadados
    expect(created?.file_url).toBeNull();
    expect(created?.backup_path).toBeNull();
  });

  it("detecta duplicidade de paciente ignorando maiúsculas, minúsculas e acentos", async () => {
    // Cadastra primeiro paciente com acento e minúscula
    await OdontoPrintService.createPrintCards([
      {
        patient: "josé alves",
        clinic: "Clínica Sorriso",
        cadista: "Cadista 1",
        work_type: "PLACA",
        file_name: "placa_jose.stl",
      },
    ]);

    // Tenta cadastrar novamente com "JOSÉ ALVES" ou "JOSE ALVES"
    const dupCheck = await OdontoPrintService.checkDuplicates([
      {
        patient: "JOSE ALVES", // sem acento e maiúsculo
        clinic: "Clínica Sorriso",
        work_type: "PLACA",
        file_name: "placa_jose_v2.stl",
      },
    ]);

    expect(dupCheck.has_duplicate).toBe(true);
    expect(dupCheck.matches.length).toBeGreaterThan(0);
    expect(dupCheck.matches[0].matched_item.patient_code).toBe("JOSÉ ALVES");
  });

  it("avança para CONCLUIDO sem gravar conteúdo de arquivo (só metadados)", async () => {
    await OdontoPrintService.createPrintCards([
      {
        patient: "PAC-META",
        clinic: "Clínica Alfa",
        cadista: "Cadista 2",
        work_type: "COROA",
        file_name: "coroa_alfa.stl",
        file_size: 15234567,
        file_hash: "hashmeta123",
      },
    ]);

    const cards = await OdontoPrintService.getPrintCards();
    const item = cards.find((c) => c.patient_code === "PAC-META")!;

    // Só metadados: nome, tamanho, hash. Nenhum conteúdo/dataURL.
    expect(item.file_name).toBe("coroa_alfa.stl");
    expect(item.file_size).toBe(15234567);
    expect(item.file_hash).toBe("hashmeta123");
    expect(item.file_url).toBeNull();

    // Atualiza status para CONCLUIDO
    await OdontoPrintService.updateCardStatus(item.id, "CONCLUIDO");

    const updatedCards = await OdontoPrintService.getPrintCards();
    const updatedItem = updatedCards.find((c) => c.id === item.id)!;

    expect(updatedItem.status).toBe("CONCLUIDO");
    expect(updatedItem.file_url).toBeNull();
  });

  it("agrupa cards em um lote e ao falhar o lote, TODOS os cards retornam para Na Fila com a tag Reimpressão", async () => {
    await OdontoPrintService.createPrintCards([
      {
        patient: "PAC-LOTE-1",
        clinic: "Clínica Lote",
        cadista: "Cadista 3",
        work_type: "MODELO_COM_TROQUEL",
        file_name: "modelo1.stl",
      },
      {
        patient: "PAC-LOTE-2",
        clinic: "Clínica Lote",
        cadista: "Cadista 3",
        work_type: "COROA",
        file_name: "coroa2.stl",
      },
    ]);

    const allCards = await OdontoPrintService.getPrintCards();
    const item1 = allCards.find((c) => c.patient_code === "PAC-LOTE-1")!;
    const item2 = allCards.find((c) => c.patient_code === "PAC-LOTE-2")!;

    // 1. Cria lote com os 2 cards
    const batchRes = await OdontoPrintService.createPrintBatch({
      batch_name: "Mesa #99 - Halot 8K",
      item_ids: [item1.id, item2.id],
      printer_name: "Halot 8K",
    });

    expect(batchRes.success).toBe(true);
    const batchId = batchRes.batch!.id;

    // Verifica que os cards foram para PREPARANDO e têm batch_id
    let cardsInBatch = await OdontoPrintService.getPrintCards();
    expect(cardsInBatch.find((c) => c.id === item1.id)?.status).toBe("PREPARANDO");
    expect(cardsInBatch.find((c) => c.id === item2.id)?.batch_name).toBe("Mesa #99 - Halot 8K");

    // 2. Falha o lote (mesa descolou)
    const failRes = await OdontoPrintService.failPrintBatch(batchId, "Mesa descolou no meio da impressão");
    expect(failRes.success).toBe(true);
    expect(failRes.affected_count).toBe(2);

    // 3. Regra Crítica: TODOS os cards do lote devem voltar para "NA_FILA" com is_retry = true
    const cardsAfterFail = await OdontoPrintService.getPrintCards();
    const item1After = cardsAfterFail.find((c) => c.id === item1.id)!;
    const item2After = cardsAfterFail.find((c) => c.id === item2.id)!;

    expect(item1After.status).toBe("NA_FILA");
    expect(item1After.is_retry).toBe(true);
    expect(item1After.priority).toBe("URGENTE");
    expect(item1After.retry_count).toBeGreaterThanOrEqual(1);
    expect(item1After.reprint_reason).toContain("Mesa descolou");

    expect(item2After.status).toBe("NA_FILA");
    expect(item2After.is_retry).toBe(true);
    expect(item2After.priority).toBe("URGENTE");
    expect(item2After.reprint_reason).toContain("Mesa descolou");
  });

  it("conclui a mesa de impressão com sucesso, marcando a mesa e os itens como CONCLUIDO", async () => {
    await OdontoPrintService.createPrintCards([
      {
        patient: "PAC-CONCLUIR-1",
        clinic: "Clínica Teste",
        cadista: "Operador 1",
        work_type: "MODELO_COM_TROQUEL",
        file_name: "modelo_ok.stl",
      },
    ]);
    const allCards = await OdontoPrintService.getPrintCards();
    const item = allCards.find((c) => c.patient_code === "PAC-CONCLUIR-1")!;
    const batchRes = await OdontoPrintService.createPrintBatch({
      batch_name: "Mesa Sucesso #1",
      item_ids: [item.id],
      printer_name: "Halot Mage",
    });
    expect(batchRes.success).toBe(true);
    const finishRes = await OdontoPrintService.finishPrintBatch(batchRes.batch!.id, "user-1", "Operador");
    expect(finishRes.success).toBe(true);
    expect(finishRes.completed_count).toBe(1);

    const cardsAfter = await OdontoPrintService.getPrintCards();
    const updated = cardsAfter.find((c) => c.id === item.id)!;
    expect(updated.status).toBe("CONCLUIDO");
  });
});
