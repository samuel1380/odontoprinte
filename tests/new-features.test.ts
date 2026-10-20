import { describe, it, expect } from "vitest";
import { estimatePrintTime } from "../src/lib/print-time";
import { generateQRCodeMatrix, generateQRCodeSvg } from "../src/lib/qrcode";
import {
  parseFileName,
  detectVersionTag,
  detectWorkType,
  getWorkTypeBadgeInfo,
} from "../src/lib/parse-filename";
import { detectIslands } from "../src/lib/support-generator";
import { OdontoPrintService } from "../src/services/odontoprint-service";

describe("Novas Funcionalidades do OdontoPrint", () => {
  describe("Item 1: Previsão de Tempo de Impressão e Horário de Término", () => {
    it("calcula tempo e camadas corretamente para altura Z normal", () => {
      // 20mm de altura, camada 0.05mm -> 400 camadas
      const est = estimatePrintTime({ maxZMm: 20, layerHeightMm: 0.05 });
      expect(est.totalLayers).toBe(400);
      expect(est.totalSeconds).toBeGreaterThan(0);
      expect(est.totalMinutes).toBeGreaterThan(0);
      expect(est.formattedDuration).toContain("min");
      expect(est.formattedCompletion).toMatch(/^(Hoje|Amanhã) às \d{2}:\d{2}$/);
    });

    it("retorna 0 para altura zerada ou negativa", () => {
      const est = estimatePrintTime({ maxZMm: 0 });
      expect(est.totalLayers).toBe(0);
      expect(est.formattedDuration).toBe("0 min");
    });
  });

  describe("Item 3, 6 e 9: Identificação, Tags e Detecção de Versões/Duplicados", () => {
    it("detecta tags odontológicas (Alinhador, Guia, Troquel, Placa)", () => {
      expect(detectWorkType("ALINHADOR SETUP 03")).toBe("ALINHADOR");
      expect(detectWorkType("GUIA CIRURGICO PACIENTE 10")).toBe("GUIA_CIRURGICO");
      expect(detectWorkType("MODELO COM TROQUEL DR PAULO")).toBe("MODELO_COM_TROQUEL");
      expect(detectWorkType("PLACA BRUXISMO")).toBe("PLACA");
    });

    it("detecta versões atualizadas no nome do arquivo (v2, _final, etc)", () => {
      expect(detectVersionTag("Paciente_Silva_v2.stl")).toBe("v2");
      expect(detectVersionTag("Arcada_Superior_final.stl")).toBe("final");
      expect(detectVersionTag("Dente_rev1.stl")).toBe("rev1");
      expect(detectVersionTag("Modelo_Normal.stl")).toBeNull();
    });

    it("extrai paciente e versão através de parseFileName", () => {
      const parsed = parseFileName("ClinicaAlfa_Paciente102_Alinhador_v2.stl");
      expect(parsed.patient).toContain("PACIENTE102");
      expect(parsed.workType).toBe("ALINHADOR");
      expect(parsed.version).toBe("v2");
    });

    it("retorna estilos e badges corretos para tipos odontológicos", () => {
      const alignerBadge = getWorkTypeBadgeInfo("ALINHADOR");
      expect(alignerBadge.label).toBe("Alinhador");
      expect(alignerBadge.dotColor).toBe("#06b6d4");

      const guideBadge = getWorkTypeBadgeInfo("GUIA_CIRURGICO");
      expect(guideBadge.label).toBe("Guia Cirúrgico");

      const plateBadge = getWorkTypeBadgeInfo("PLACA");
      expect(plateBadge.label).toContain("Placa");
    });
  });

  describe("Item 5: Ficha de Bancada e Gerador de QR Code", () => {
    it("gera matriz de QR Code válida com cantos de localização (finder patterns)", () => {
      const matrix = generateQRCodeMatrix("https://odontoprint.app/fila");
      expect(matrix.length).toBeGreaterThanOrEqual(25);
      expect(matrix[0].length).toBe(matrix.length);

      // Canto superior esquerdo do finder (7x7 sólido no contorno)
      expect(matrix[0][0]).toBe(true);
      expect(matrix[0][6]).toBe(true);
      expect(matrix[6][0]).toBe(true);
    });

    it("gera SVG de QR Code completo e bem formatado", () => {
      const svg = generateQRCodeSvg("OP-MESA-109", 120);
      expect(svg).toContain("<svg");
      expect(svg).toContain("viewBox");
      expect(svg).toContain("<rect");
      expect(svg).toContain("</svg>");
    });
  });

  describe("Item 7: Detector de Ilhas Suspensas no Ar (Island Detector)", () => {
    it("detecta ilha suspensa quando triângulos apontam para baixo sem suporte", () => {
      // Triângulo suspenso a Z=10mm voltado para baixo (nz = -1)
      const positions = new Float32Array([
        0, 0, 10,
        5, 10, 10,
        10, 0, 10,
      ]);

      const islands = detectIslands(positions);
      expect(islands.length).toBe(1);
      expect(islands[0].z).toBe(10);
      expect(islands[0].isSupported).toBe(false);
    });

    it("reconhece quando a ilha está protegida por um pilar de suporte próximo", () => {
      const positions = new Float32Array([
        0, 0, 10,
        5, 10, 10,
        10, 0, 10,
      ]);

      // Pilar de suporte no centroide da ilha (x=5, y=3.33)
      const existingSupports = [{ x: 5, y: 3.33, zContact: 10 }];
      const islands = detectIslands(positions, existingSupports);
      expect(islands.length).toBe(0);
    });
  });

  describe("Item 4 e 8: Vida Útil FEP/LCD e Controle de Qualidade (QC)", () => {
    it("zera contador de FEP e LCD ao registrar troca", async () => {
      let printers = await OdontoPrintService.getPrinters();
      if (printers.length === 0) {
        await OdontoPrintService.createPrinter({
          name: "Anycubic Photon Mono X",
          brand: "Anycubic",
          model: "Mono X",
          serial_number: "TEST-01",
          active: true,
        });
        printers = await OdontoPrintService.getPrinters();
      }
      expect(printers.length).toBeGreaterThan(0);
      const testPrinter = printers[0];

      const resFep = await OdontoPrintService.resetPrinterConsumable(testPrinter.id, "FEP");
      expect(resFep.success).toBe(true);

      const resLcd = await OdontoPrintService.resetPrinterConsumable(testPrinter.id, "LCD");
      expect(resLcd.success).toBe(true);
    });

    it("registra foto e parecer de CQ para itens e lotes", async () => {
      const res = await OdontoPrintService.recordQualityControl({
        photo_url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        notes: "Peças inspecionadas, cura de 10 min 100% aprovada.",
      });
      expect(res.success).toBe(true);
    });
  });
});
