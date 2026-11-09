import { describe, expect, it } from "vitest";
import { addBusinessDaysDeadline, formatDeadline, isBusinessDay, nationalHolidays } from "@/lib/business-days";

// Horários em Brasília (UTC-3). 18h BRT = 21h UTC.
const brt = (iso: string) => new Date(`${iso}-03:00`);

describe("dias úteis", () => {
  it("calcula a Páscoa e os feriados móveis", () => {
    const h = nationalHolidays(2026); // Páscoa 2026: 5 de abril
    expect(h.has("2026-04-03")).toBe(true); // Sexta-feira Santa
    expect(h.has("2026-02-16")).toBe(true); // Carnaval segunda
    expect(h.has("2026-02-17")).toBe(true); // Carnaval terça
    expect(h.has("2026-11-20")).toBe(true); // Consciência Negra
  });

  it("fim de semana não é dia útil", () => {
    expect(isBusinessDay(new Date(Date.UTC(2026, 10, 7)))).toBe(false); // sábado
    expect(isBusinessDay(new Date(Date.UTC(2026, 10, 9)))).toBe(true); // segunda
  });

  it("briefing na segunda: prazo na quinta às 18h", () => {
    expect(addBusinessDaysDeadline(brt("2026-11-09T10:00:00")).toISOString()).toBe("2026-11-12T21:00:00.000Z");
  });

  it("briefing na sexta à noite: prazo na quarta às 18h", () => {
    expect(addBusinessDaysDeadline(brt("2026-11-06T23:30:00")).toISOString()).toBe("2026-11-11T21:00:00.000Z");
  });

  it("briefing no sábado: conta segunda, terça e quarta", () => {
    expect(addBusinessDaysDeadline(brt("2026-11-07T09:00:00")).toISOString()).toBe("2026-11-11T21:00:00.000Z");
  });

  it("pula feriado nacional (20/11/2026 é sexta)", () => {
    // Quarta 18/11: quinta 19, (sexta 20 feriado), segunda 23, terça 24
    expect(addBusinessDaysDeadline(brt("2026-11-18T15:00:00")).toISOString()).toBe("2026-11-24T21:00:00.000Z");
  });

  it("usa o dia de Brasília, não o de Londres (23h30 de segunda em BRT)", () => {
    // 23h30 de segunda em BRT já é terça em UTC; o prazo deve ser quinta, não sexta.
    expect(addBusinessDaysDeadline(brt("2026-11-09T23:30:00")).toISOString()).toBe("2026-11-12T21:00:00.000Z");
  });

  it("formata o prazo em português", () => {
    expect(formatDeadline(new Date("2026-11-12T21:00:00.000Z"))).toBe("quinta-feira, 12/11 às 18h");
  });
});
