import type { ReportContent } from "./schema";

// Checagens automáticas do texto gerado, antes de qualquer envio.

export interface GuardrailResult {
  content: ReportContent; // já com as correções automáticas (travessões)
  problems: string[]; // problemas que exigem gerar de novo
}

const FORBIDDEN_PHRASE = /se\s+fizer\s+sentido/i;
const PROMISE = /\b(vai|v[aã]o|ir[aá]|garant\w*)\s+(vender|faturar|dobrar|triplicar|aumentar\s+(as\s+|suas\s+|seu\s+)?(vendas|faturamento))|\bgarant\w*\s+(resultado|vendas|faturamento)|\b(dobrar|triplicar)\s+(as\s+|suas\s+)?(vendas|faturamento)/i;

/** Troca travessões (— e –) usados como pontuação por vírgula. */
export function removeDashes(s: string): string {
  return s
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/,\s*,/g, ",")
    .replace(/,\s*([.!?:;])/g, "$1")
    .replace(/^,\s*/, "");
}

function mapStrings(c: ReportContent, f: (s: string) => string): ReportContent {
  return {
    saudacao: f(c.saudacao),
    retrato_do_perfil: c.retrato_do_perfil.map(f),
    consistencia_e_formatos: c.consistencia_e_formatos.map(f),
    o_que_esta_funcionando: {
      introducao: f(c.o_que_esta_funcionando.introducao),
      posts: c.o_que_esta_funcionando.posts.map((p) => ({ id: p.id, por_que: f(p.por_que) })),
    },
    pontos_de_atencao: c.pontos_de_atencao.map((p) => ({ titulo: f(p.titulo), explicacao: f(p.explicacao) })),
    ajuste_da_semana: { titulo: f(c.ajuste_da_semana.titulo), passos: c.ajuste_da_semana.passos.map(f) },
  };
}

export function allText(c: ReportContent): string {
  const parts: string[] = [];
  mapStrings(c, (s) => {
    parts.push(s);
    return s;
  });
  return parts.join("\n");
}

/** Números escritos no padrão brasileiro: "4.820" -> 4820, "3,2" -> 3.2, "45%" -> 45. */
export function extractNumbers(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/g)) {
    out.push(Number(m[0].replace(/\./g, "").replace(",", ".")));
  }
  return out;
}

/**
 * Números que o texto pode citar: todos os que aparecem nos dados enviados (métricas, bio,
 * legendas, resposta da cliente), mais números pequenos de contagem (0 a 10) e os prazos fixos do produto.
 */
export function allowedNumbers(sourceText: string): Set<number> {
  const set = new Set<number>(Array.from({ length: 11 }, (_, i) => i));
  for (const n of [24, 48, 60]) set.add(n);
  for (const n of extractNumbers(sourceText)) set.add(n);
  // números com ponto decimal no JSON (ex.: 2.35) também valem
  for (const m of sourceText.matchAll(/\d+\.\d+/g)) set.add(Number(m[0]));
  return set;
}

function isAllowed(n: number, allowed: Set<number>): boolean {
  if (allowed.has(n)) return true;
  // aceita arredondamentos de um número permitido (ex.: 2,35 citado como 2,4 ou 2)
  for (const a of allowed) {
    if (Math.round(a) === n || Math.round(a * 10) / 10 === n) return true;
  }
  return false;
}

export function checkReport(
  content: ReportContent,
  ctx: { sourceText: string; bestPostIds: string[] },
): GuardrailResult {
  const fixed = mapStrings(content, (s) => removeDashes(s.trim()));
  const problems: string[] = [];
  const text = allText(fixed);

  if (FORBIDDEN_PHRASE.test(text)) problems.push('usou a expressão proibida "se fizer sentido"');
  if (PROMISE.test(text)) problems.push("prometeu resultado de vendas ou faturamento");

  const allowed = allowedNumbers(ctx.sourceText);
  const invented = [...new Set(extractNumbers(text).filter((n) => !isAllowed(n, allowed)))];
  if (invented.length) problems.push(`citou números que não estão nos dados: ${invented.join(", ")}`);

  if (fixed.pontos_de_atencao.length !== 3) problems.push(`trouxe ${fixed.pontos_de_atencao.length} pontos de atenção (o certo é 3)`);
  if (fixed.retrato_do_perfil.length === 0 || fixed.consistencia_e_formatos.length === 0) problems.push("deixou seção vazia");
  if (fixed.ajuste_da_semana.passos.length === 0) problems.push("ajuste da semana sem passos");

  const posts = fixed.o_que_esta_funcionando.posts;
  if (posts.length > 2) problems.push("citou mais de 2 posts em 'o que está funcionando'");
  const unknown = posts.filter((p) => !ctx.bestPostIds.includes(p.id));
  if (unknown.length) problems.push(`citou posts fora da lista de melhores: ${unknown.map((p) => p.id).join(", ")}`);

  return { content: fixed, problems };
}
