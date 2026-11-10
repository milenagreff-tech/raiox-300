import type { Metrics, PostSummary } from "@/lib/metrics";
import type { Report } from "@/lib/store/types";
import { MANDATORY_PHRASE, PUBLIC_DATA_NOTICE } from "./constants";

// Monta o conteúdo pronto para exibir. A página e o e-mail usam exatamente esta mesma estrutura.

const FORMAT_LABEL: Record<string, string> = { reel: "Reels", carrossel: "Carrossel", imagem: "Imagem", video: "Vídeo" };
const POST_LABEL: Record<string, string> = { reel: "Reel", carrossel: "Carrossel", imagem: "Imagem", video: "Vídeo" };
const br = (n: number) => n.toLocaleString("pt-BR");

export interface MetricCard {
  label: string;
  value: string;
  note?: string;
}

export interface BestPostView {
  label: string; // "Reels de 12/10"
  why: string;
  caption: string;
  stats: string; // "530 interações (11% dos seguidores)"
  permalink: string | null;
}

export interface ReportView {
  mandatoryPhrase: string;
  publicDataNotice: string;
  handle: string;
  greeting: string;
  generatedAt: string; // "10/11/2026"
  cards: MetricCard[];
  sections: {
    retrato: string[];
    consistencia: string[];
    funcionando: { intro: string; posts: BestPostView[] };
    atencao: { title: string; text: string }[];
    ajuste: { title: string; steps: string[] };
  };
}

export function metricCards(m: Metrics): MetricCard[] {
  const top = m.formatMix[0];
  return [
    { label: "Seguidores", value: m.followers === null ? "não disponível" : br(m.followers) },
    {
      label: "Posts por semana",
      value: m.frequency.postsPerWeek === null ? "sem posts" : br(m.frequency.postsPerWeek),
      note: m.frequency.estimated ? `estimado em ${m.frequency.windowDays} dias` : `últimos ${m.frequency.windowDays} dias`,
    },
    {
      label: "Engajamento médio",
      value: m.engagement.avgRatePercent === null ? "não medido" : `${br(m.engagement.avgRatePercent)}%`,
      note: "interações por post sobre seguidores",
    },
    {
      label: "Formato mais usado",
      value: top ? FORMAT_LABEL[top.type] ?? top.type : "sem posts",
      note: top ? `${top.percent}% dos posts analisados` : undefined,
    },
    {
      label: "Legendas com chamada para ação",
      value: m.captions.total ? `${m.captions.withCta} de ${m.captions.total}` : "sem posts",
    },
    {
      label: "Último post",
      value: m.daysSinceLastPost === null ? "sem posts" : m.daysSinceLastPost === 0 ? "hoje" : `há ${m.daysSinceLastPost} dia${m.daysSinceLastPost === 1 ? "" : "s"}`,
    },
  ];
}

function postView(p: PostSummary, why: string): BestPostView {
  const date = new Date(p.date).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
  const caption = p.caption.length > 220 ? `${p.caption.slice(0, 220).trimEnd()}...` : p.caption;
  const stats =
    p.interactions === null
      ? "curtidas escondidas"
      : `${br(p.interactions)} interações${p.engagementRate !== null ? ` (${br(p.engagementRate)}% dos seguidores)` : ""}`;
  return { label: `${POST_LABEL[p.type] ?? p.type} de ${date}`, why, caption, stats, permalink: p.permalink };
}

export function buildReportView(report: Report, handle: string): ReportView {
  const c = report.content;
  if (!c) throw new Error("relatório sem conteúdo");
  const byId = new Map(report.metrics.best.map((p) => [p.id, p]));
  return {
    mandatoryPhrase: MANDATORY_PHRASE,
    publicDataNotice: PUBLIC_DATA_NOTICE,
    handle,
    greeting: c.saudacao,
    generatedAt: report.createdAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }),
    cards: metricCards(report.metrics),
    sections: {
      retrato: c.retrato_do_perfil,
      consistencia: c.consistencia_e_formatos,
      funcionando: {
        intro: c.o_que_esta_funcionando.introducao,
        posts: c.o_que_esta_funcionando.posts
          .filter((p) => byId.has(p.id))
          .map((p) => postView(byId.get(p.id) as PostSummary, p.por_que)),
      },
      atencao: c.pontos_de_atencao.map((p) => ({ title: p.titulo, text: p.explicacao })),
      ajuste: { title: c.ajuste_da_semana.titulo, steps: c.ajuste_da_semana.passos },
    },
  };
}

export const SECTION_TITLES = {
  retrato: "1. Retrato do perfil",
  consistencia: "2. Consistência e formatos",
  funcionando: "3. O que está funcionando",
  atencao: "4. Três pontos de atenção",
  ajuste: "5. Um ajuste rápido para esta semana",
};
