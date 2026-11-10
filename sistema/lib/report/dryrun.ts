import type { GenerateInput, ReportWriter } from "./generate";

const FORMAT_NAMES: Record<string, string> = { reel: "reels", carrossel: "carrosséis", imagem: "imagens", video: "vídeos" };
const br = (n: number) => n.toLocaleString("pt-BR");

/**
 * Modo de simulação (DRY_RUN=true): monta um texto de exemplo a partir das métricas,
 * sem chamar a IA e sem gastar nada. Serve para testar o fluxo e o visual.
 */
export function createDryRunWriter(input: GenerateInput): ReportWriter {
  return {
    name: "simulacao",
    async write() {
      const m = input.metrics;
      const nome = input.firstName || "tudo bem";
      const formatos = m.formatMix.map((f) => `${f.count} ${FORMAT_NAMES[f.type] ?? f.type}`).join(", ");
      const freq =
        m.frequency.postsPerWeek === null
          ? "Não foi possível medir a frequência, porque não encontramos posts públicos."
          : `Nos últimos ${m.frequency.windowDays} dias foram ${m.frequency.postsInWindow} posts, uma média de ${br(m.frequency.postsPerWeek)} por semana.`;
      const eng =
        m.engagement.avgRatePercent === null
          ? "Não foi possível medir o engajamento médio com os dados públicos."
          : `O engajamento médio ficou em ${br(m.engagement.avgRatePercent)}% dos seguidores por post.`;

      return {
        usage: { model: "simulacao", inputTokens: 0, outputTokens: 0 },
        content: {
          saudacao: `Oi, ${nome}! [Texto de simulação, gerado sem IA.]`,
          retrato_do_perfil: [
            m.bio.text
              ? `Sua bio tem ${m.bio.length} caracteres e ${m.bio.hasCta ? "já traz" : "ainda não traz"} uma chamada clara para a pessoa comprar ou falar com você.`
              : "Seu perfil está sem bio, então quem chega não entende de imediato o que você oferece.",
            m.link.url
              ? `O link da bio leva para ${m.link.domain ?? m.link.url}, do tipo ${m.link.type}.`
              : "Não há link na bio, então o caminho até a compra depende do direct.",
          ],
          consistencia_e_formatos: [freq, `Entre os posts analisados há ${formatos}.`, eng],
          o_que_esta_funcionando: {
            introducao: m.best.length ? "Estes foram os posts com mais interações:" : "Não foi possível medir os melhores posts.",
            posts: m.best.map((p) => ({ id: p.id, por_que: "Exemplo de explicação: formato e legenda chamaram a conversa." })),
          },
          pontos_de_atencao: [
            { titulo: "Chamada para ação", explicacao: `${m.captions.withCta} de ${m.captions.total} legendas convidam a pessoa a agir.` },
            { titulo: "Caminho até a compra", explicacao: "Exemplo de ponto de atenção sobre o link da bio." },
            { titulo: "Constância", explicacao: "Exemplo de ponto de atenção sobre frequência." },
          ],
          ajuste_da_semana: {
            titulo: "Exemplo de ajuste rápido",
            passos: ["Reescreva a primeira linha da bio dizendo o que você vende.", "Termine as próximas legendas com um convite claro."],
          },
        },
      };
    },
  };
}
