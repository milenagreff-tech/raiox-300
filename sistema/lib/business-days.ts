// Dias úteis no Brasil: pula sábado, domingo e feriados nacionais (sem feriados regionais).
// Horário de Brasília (UTC-3, sem horário de verão desde 2019).

const BRT_OFFSET_MS = -3 * 60 * 60 * 1000;
export const DEADLINE_HOUR_BRT = 18; // o prazo vence às 18h do último dia útil

/** Data de Páscoa (calendário gregoriano). Retorna [mês 1-12, dia]. */
function easter(year: number): [number, number] {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return [month, day];
}

function key(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const cache = new Map<number, Set<string>>();

/** Feriados nacionais + Carnaval (segunda e terça), no formato AAAA-MM-DD. */
export function nationalHolidays(year: number): Set<string> {
  const cached = cache.get(year);
  if (cached) return cached;
  const fixed: [number, number][] = [
    [1, 1], // Confraternização Universal
    [4, 21], // Tiradentes
    [5, 1], // Dia do Trabalho
    [9, 7], // Independência
    [10, 12], // Nossa Senhora Aparecida
    [11, 2], // Finados
    [11, 15], // Proclamação da República
    [11, 20], // Dia da Consciência Negra
    [12, 25], // Natal
  ];
  const set = new Set(fixed.map(([m, d]) => key(year, m, d)));
  const [em, ed] = easter(year);
  const easterUtc = Date.UTC(year, em - 1, ed);
  for (const offset of [-48, -47, -2]) {
    // Carnaval (segunda e terça) e Sexta-feira Santa
    const dt = new Date(easterUtc + offset * 86400000);
    set.add(key(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()));
  }
  cache.set(year, set);
  return set;
}

/** "Data civil" em Brasília: um Date à meia-noite UTC que representa o dia em BRT. */
function brtDay(d: Date): Date {
  const shifted = new Date(d.getTime() + BRT_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
}

export function isBusinessDay(day: Date): boolean {
  const dow = day.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  return !nationalHolidays(day.getUTCFullYear()).has(key(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate()));
}

/**
 * Prazo: 18h (Brasília) do N-ésimo dia útil depois do dia do briefing.
 * O próprio dia do briefing não conta. Ex.: briefing na segunda, prazo quinta às 18h.
 */
export function addBusinessDaysDeadline(from: Date, n = 3): Date {
  let day = brtDay(from);
  let count = 0;
  while (count < n) {
    day = new Date(day.getTime() + 86400000);
    if (isBusinessDay(day)) count++;
  }
  // 18h em Brasília = 21h UTC
  return new Date(day.getTime() + (DEADLINE_HOUR_BRT * 3600000 - BRT_OFFSET_MS));
}

/** Formata uma data em Brasília, ex.: "quinta-feira, 12/11 às 18h". */
export function formatDeadline(d: Date): string {
  const s = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return s.replace(/,? (\d{2}):00$/, " às $1h").replace(/,? (\d{2}):(\d{2})$/, " às $1h$2");
}
