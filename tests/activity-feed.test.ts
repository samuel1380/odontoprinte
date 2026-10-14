import { describe, it, expect } from "vitest";
import { formatRelativeTime, buildActivityFeed } from "../src/lib/activity-feed";

const NOW = new Date("2026-10-14T15:00:00").getTime();

describe("Atividades recentes: tempo relativo em português", () => {
  it("formata agora, minutos, hoje, ontem e data", () => {
    expect(formatRelativeTime(new Date(NOW - 20_000).toISOString(), NOW)).toBe("agora mesmo");
    expect(formatRelativeTime(new Date(NOW - 5 * 60_000).toISOString(), NOW)).toBe("há 5 min");
    expect(formatRelativeTime(new Date(NOW - 2 * 3_600_000).toISOString(), NOW)).toBe("há 2 h");
    expect(formatRelativeTime("2026-10-14T08:05:00", NOW)).toMatch(/hoje às 08:05/);
    expect(formatRelativeTime("2026-10-13T16:10:00", NOW)).toBe("ontem às 16:10");
    expect(formatRelativeTime("2026-10-01T09:00:00", NOW)).toBe("01/10 às 09:00");
  });
});

describe("Atividades recentes: frases claras sem ID/JSON", () => {
  const users = new Map([["u1", "Maria"]]);

  it("criação agrupada, reimpressão, impressão e conclusão", () => {
    const items = buildActivityFeed(
      [
        {
          id: "a1",
          user_id: "u1",
          action: "PRINT_CARDS_CREATED",
          entity_type: "cases",
          new_data: { count: 4, clinic: "Clínica Sorriso" },
          created_at: new Date(NOW - 5 * 60_000).toISOString(),
        },
        {
          id: "a2",
          user_id: "u1",
          action: "ITEM_REIMPRESSAO",
          entity_type: "print_job_items",
          entity_id: "00000000-0000-0000-0000-000000000099",
          new_data: { item_type: "Coroa", run_code: "A007" },
          created_at: new Date(NOW - 60 * 60_000).toISOString(),
        },
        {
          id: "a3",
          user_id: null,
          action: "STATUS_CARD_CONCLUIDO",
          entity_type: "print_job_items",
          new_data: { status: "CONCLUIDO", patient_code: "PAC-10" },
          created_at: new Date(NOW - 2 * 60_000).toISOString(),
        },
      ],
      users,
      { nowMs: NOW }
    );

    expect(items).toHaveLength(3);
    // Mais recentes primeiro
    expect(items[0].title).toContain("Concluído");
    expect(items[1].title).toBe("Maria adicionou 4 arquivos na fila");
    expect(items[1].detail).toContain("Clínica Sorriso");
    expect(items[2].title).toMatch(/reimpressão/i);
    // Nunca ID, JSON ou termo técnico bruto
    for (const item of items) {
      expect(item.title).not.toMatch(/00000000/);
      expect(item.title).not.toMatch(/[{}"]/);
      expect(item.title).not.toMatch(/STATUS_CARD|ITEM_REIMPRESSAO/);
      expect(item.relative).not.toMatch(/T\d{2}:\d{2}:\d{2}/);
    }
  });

  it("ação desconhecida vira frase genérica, nunca em branco", () => {
    const items = buildActivityFeed(
      [
        {
          id: "x1",
          action: "ALGO_NOVO_QUALQUER",
          entity_type: "cases",
          created_at: new Date(NOW - 60_000).toISOString(),
        },
      ],
      new Map(),
      { nowMs: NOW }
    );
    expect(items).toHaveLength(1);
    expect(items[0].title.length).toBeGreaterThan(0);
  });
});
