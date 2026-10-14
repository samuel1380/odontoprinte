import { describe, it, expect } from "vitest";
import { parseFileName, stripExtension, normalizeToken } from "../src/lib/parse-filename";

describe("parseFileName: leitura do nome do arquivo", () => {
  it("extrai paciente do primeiro pedaço (comportamento antigo)", () => {
    const r = parseFileName("PAC123_MODELO.stl");
    expect(r.patient).toBe("PAC123");
    expect(r.clinic).toBeNull();
  });

  it("identifica clínica cadastrada + paciente + troquel", () => {
    const r = parseFileName("OdontoPrime_PAC45_Troquel.stl", ["OdontoPrime", "Sorriso Mais"]);
    expect(r.clinic).toBe("OdontoPrime");
    expect(r.patient).toBe("PAC45");
    expect(r.workType).toBe("MODELO_COM_TROQUEL");
  });

  it("entende padrão 'DRA NOME - código - peça'", () => {
    const r = parseFileName("DRA MARIA - 102 - PLACA.stl");
    expect(r.clinic).toBe("DRA MARIA");
    expect(r.patient).toBe("102");
    expect(r.workType).toBe("PLACA");
  });

  it("detecta modelo SEM troquel antes de confundir com COM", () => {
    const r = parseFileName("clinicaX_PAC77_sem_troquel.stl", ["clinicaX"]);
    expect(r.workType).toBe("MODELO_SEM_TROQUEL");
    expect(r.patient).toBe("PAC77");
  });

  it("detecta antagonista, gengiva e coroa sobre implante", () => {
    expect(parseFileName("PAC10_antagonista.stl").workType).toBe("ANTAGONISTA");
    expect(parseFileName("PAC10_gengiva.stl").workType).toBe("GENGIVA");
    expect(parseFileName("COROA IMPLANTE 205 DR PAULO.stl").workType).toBe("COROA_SOBRE_IMPLANTE");
  });

  it("não confunde medida (10MM) nem ano com paciente", () => {
    const r = parseFileName("PAC200_modelo_10mm.stl");
    expect(r.patient).toBe("PAC200");
  });

  it("ignora acentos e maiúsculas na clínica conhecida", () => {
    const r = parseFileName("odontoprime_pac9_modelo.stl", ["OdontoPrime"]);
    expect(r.clinic).toBe("OdontoPrime");
    expect(r.patient).toBe("PAC9");
  });

  it("retorna nulls quando não há o que extrair", () => {
    const r = parseFileName("modelo.stl");
    expect(r.patient).toBe("MODELO");
    expect(r.clinic).toBeNull();
    expect(r.workType).toBeNull();
  });

  it("stripExtension e normalizeToken", () => {
    expect(stripExtension("A.3MF")).toBe("A");
    expect(stripExtension("sem-extensao")).toBe("sem-extensao");
    expect(normalizeToken("João  da  Silva")).toBe("JOAO DA SILVA");
  });
});
