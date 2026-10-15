import { describe, it, expect } from "vitest";
import { OdontoPrintService } from "../src/services/odontoprint-service";

async function setupMesa() {
  const printer = await OdontoPrintService.createPrinter({
    name: "Saturn-Teste",
    brand: "Elegoo",
    model: "Saturn 4",
    serial_number: "SN-RESIN-1",
  });
  const resinA = await OdontoPrintService.createResinBatch({
    brand: "Marca A",
    resin_type: "Modelo",
    lot: "LOTE-A",
    volume: 1000,
  });
  const resinB = await OdontoPrintService.createResinBatch({
    brand: "Marca B",
    resin_type: "Modelo",
    lot: "LOTE-B",
    volume: 1000,
  });
  const calA = await OdontoPrintService.registerCalibrationAttempt({
    resin_batch_id: resinA.id,
    printer_id: printer.id,
    initial_exposure_time: 25,
    exposure_time: 2.2,
    lift_speed: 60,
    layer_height: 0.05,
    hexagon_size_mm: 10.0,
    lines_visible: true,
    numbers_visible: true,
    details_visible: true,
    wash_time: 5,
    cure_time: 10,
  });
  const calB = await OdontoPrintService.registerCalibrationAttempt({
    resin_batch_id: resinB.id,
    printer_id: printer.id,
    initial_exposure_time: 28,
    exposure_time: 2.5,
    lift_speed: 60,
    layer_height: 0.05,
    hexagon_size_mm: 10.0,
    lines_visible: true,
    numbers_visible: true,
    details_visible: true,
    wash_time: 5,
    cure_time: 10,
  });
  expect(calA.approved).toBe(true);
  expect(calB.approved).toBe(true);

  const cards = await OdontoPrintService.createPrintCards([
    { patient: "PAC-RESIN", clinic: "Cli", cadista: "Cad", work_type: "COROA", file_name: "resin.stl" },
  ]);
  const order = await OdontoPrintService.createOrderBatch({ item_ids: cards.created_ids });
  return { printer, resinA, resinB, calA, calB, order };
}

describe("resina da mesa: escolha ao iniciar impressão", () => {
  it("usa a resina escolhida (lote + calibração) na ordem criada", async () => {
    const { printer, resinB, calB, order } = await setupMesa();
    const res = await OdontoPrintService.startPrintBatchDirectly({
      batch_id: order.batch!.id,
      printer_id: printer.id,
      resin_batch_id: resinB.id,
      calibration_id: calB.calibration.id,
    });
    expect(res.success).toBe(true);
    const runs = await OdontoPrintService.getPrintRuns();
    const run = runs.find((r) => r.id === res.run_id);
    expect(run?.resin_batch_id).toBe(resinB.id);
    expect(run?.calibration_id).toBe(calB.calibration.id);
  });

  it("rejeita resina sem calibração aprovada para a impressora", async () => {
    const { printer, order } = await setupMesa();
    const res = await OdontoPrintService.startPrintBatchDirectly({
      batch_id: order.batch!.id,
      printer_id: printer.id,
      resin_batch_id: "lote-inexistente",
      calibration_id: "cal-inexistente",
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/sem calibração aprovada/);
  });

  it("sem resina informada mantém o comportamento automático anterior", async () => {
    const { printer, order } = await setupMesa();
    const options = await OdontoPrintService.getEligibleOptions();
    const firstEligible = options.resins.find((r) => r.printer_id === printer.id);
    expect(firstEligible).toBeDefined();
    const res = await OdontoPrintService.startPrintBatchDirectly({
      batch_id: order.batch!.id,
      printer_id: printer.id,
    });
    expect(res.success).toBe(true);
    const runs = await OdontoPrintService.getPrintRuns();
    const run = runs.find((r) => r.id === res.run_id);
    // mesma resina que o fluxo automático escolheria
    expect(run?.resin_batch_id).toBe(firstEligible!.resin_batch_id);
    expect(run?.calibration_id).toBe(firstEligible!.calibration_id);
  });
});
