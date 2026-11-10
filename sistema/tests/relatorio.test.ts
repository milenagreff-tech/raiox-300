import { describe, expect, it } from "vitest";
import { relatorioEmail } from "@/emails/relatorio";
import { buildExampleProfile } from "@/fixtures/perfil-exemplo";
import { runJobs } from "@/lib/jobs/worker";
import { computeMetrics } from "@/lib/metrics";
import { ConsoleMailer } from "@/lib/messaging/email";
import { MANDATORY_PHRASE, PUBLIC_DATA_NOTICE } from "@/lib/report/constants";
import { createDryRunWriter } from "@/lib/report/dryrun";
import type { ReportWriter } from "@/lib/report/generate";
import { generateReportContent } from "@/lib/report/generate";
import { checkReport, extractNumbers, removeDashes } from "@/lib/report/guardrails";
import { buildUserMessage } from "@/lib/report/prompt";
import type { ReportContent } from "@/lib/report/schema";
import { buildReportView } from "@/lib/report/view";
import { MemoryStore } from "@/lib/store/memory";

const NOW = new Date("2026-11-10T12:00:00Z");
const profile = buildExampleProfile("@docesdaana", NOW);
const metrics = computeMetrics(profile, NOW);
const input = { firstName: "Ana", salesPain: "Muita gente pergunta preço e some.", profile, metrics };
const source = buildUserMessage(input);
const ctx = { sourceText: source, bestPostIds: metrics.best.map((p) => p.id) };

function content(over: Partial<ReportContent> = {}): ReportContent {
  return {
    saudacao: "Oi, Ana!",
    retrato_do_perfil: [`Sua bio fala de bolos em Campinas e você tem ${(4820).toLocaleString("pt-BR")} seguidores.`],
    consistencia_e_formatos: [`Foram ${metrics.frequency.postsInWindow} posts no período.`],
    o_que_esta_funcionando: { introducao: "Dois posts se destacaram.", posts: metrics.best.map((p) => ({ id: p.id, por_que: "Mostrou bastidores." })) },
    pontos_de_atencao: [
      { titulo: "Bio", explicacao: "Falta dizer como comprar." },
      { titulo: "Legendas", explicacao: "Poucas chamam para a ação." },
      { titulo: "Link", explicacao: "O agregador tem muitas opções." },
    ],
    ajuste_da_semana: { titulo: "Bio mais clara", passos: ["Reescreva a primeira linha.", "Coloque o WhatsApp."] },
    ...over,
  };
}

describe("revisão automática do texto", () => {
  it("texto correto passa", () => {
    expect(checkReport(content(), ctx).problems).toEqual([]);
  });

  it("troca travessão por vírgula, sem precisar gerar de novo", () => {
    expect(removeDashes("Sua bio é boa — mas falta CTA.")).toBe("Sua bio é boa, mas falta CTA.");
    expect(removeDashes("Reels – seu formato forte – rendem mais.")).toBe("Reels, seu formato forte, rendem mais.");
    const r = checkReport(content({ saudacao: "Oi, Ana — tudo bem?" }), ctx);
    expect(r.problems).toEqual([]);
    expect(r.content.saudacao).toBe("Oi, Ana, tudo bem?");
  });

  it('barra "se fizer sentido"', () => {
    const r = checkReport(content({ saudacao: "Oi, Ana! Teste isso, se fizer sentido." }), ctx);
    expect(r.problems.join()).toContain("se fizer sentido");
  });

  it("barra número inventado e aceita números dos dados", () => {
    expect(extractNumbers("Você tem 4.820 seguidores e 3,2% de engajamento")).toEqual([4820, 3.2]);
    const r = checkReport(content({ consistencia_e_formatos: ["A média do mercado é 37% de engajamento."] }), ctx);
    expect(r.problems.join()).toContain("37");
  });

  it("barra promessa de faturamento", () => {
    const r = checkReport(content({ ajuste_da_semana: { titulo: "Isso vai dobrar suas vendas", passos: ["a"] } }), ctx);
    expect(r.problems.join()).toContain("prometeu");
  });

  it("exige exatamente 3 pontos de atenção e só os melhores posts", () => {
    const r = checkReport(
      content({
        pontos_de_atencao: [{ titulo: "a", explicacao: "b" }],
        o_que_esta_funcionando: { introducao: "x", posts: [{ id: "inventado", por_que: "y" }] },
      }),
      ctx,
    );
    expect(r.problems.join()).toContain("3");
    expect(r.problems.join()).toContain("inventado");
  });
});

describe("geração com segunda tentativa", () => {
  function scripted(outputs: ReportContent[]): ReportWriter & { messages: string[] } {
    const w = {
      name: "teste",
      messages: [] as string[],
      async write(msg: string) {
        w.messages.push(msg);
        return { content: outputs[Math.min(w.messages.length - 1, outputs.length - 1)], usage: { model: "teste", inputTokens: 100, outputTokens: 50 } };
      },
    };
    return w;
  }

  it("se a primeira versão falha na revisão, tenta de novo explicando o problema", async () => {
    const w = scripted([content({ saudacao: "Oi! Se fizer sentido, leia." }), content()]);
    const r = await generateReportContent(input, w);
    expect(r.ok).toBe(true);
    expect(r.attempts).toBe(2);
    expect(w.messages[1]).toContain("se fizer sentido");
  });

  it("se falha duas vezes, devolve os problemas (e não envia)", async () => {
    const bad = content({ saudacao: "Oi! Se fizer sentido, leia." });
    const r = await generateReportContent(input, scripted([bad, bad]));
    expect(r.ok).toBe(false);
  });
});

describe("frase obrigatória", () => {
  const report = {
    id: "r1", orderId: "o1", version: 1, status: "pronto" as const, metrics, content: content(),
    problems: null, writer: "teste", usage: null, createdAt: NOW, sentAt: null,
  };
  const view = buildReportView(report, "@docesdaana");

  it("aparece no topo e no fim do e-mail (HTML e texto)", () => {
    const email = relatorioEmail(view, { to: "ana@exemplo.com", reportUrl: "https://x/relatorio/abc" });
    const count = (s: string, sub: string) => s.split(sub).length - 1;
    expect(count(email.html, MANDATORY_PHRASE)).toBe(2);
    expect(email.html.indexOf(MANDATORY_PHRASE)).toBeLessThan(email.html.indexOf("1. Retrato do perfil"));
    expect(email.html.lastIndexOf(MANDATORY_PHRASE)).toBeGreaterThan(email.html.indexOf("5. Um ajuste rápido"));
    expect(email.text.startsWith(MANDATORY_PHRASE)).toBe(true);
    expect(count(email.text, MANDATORY_PHRASE)).toBe(2);
    expect(email.html).toContain(PUBLIC_DATA_NOTICE);
    expect(email.html).toContain("https://x/relatorio/abc");
  });

  it("a página usa a mesma estrutura com a frase e o aviso de dados públicos", () => {
    expect(view.mandatoryPhrase).toBe(MANDATORY_PHRASE);
    expect(view.publicDataNotice).toContain("dados públicos");
    expect(view.sections.funcionando.posts).toHaveLength(2);
  });
});

describe("fluxo completo: coleta, relatório e envio (simulação)", () => {
  it("gera, envia o e-mail com o link e muda o status para relatório enviado", async () => {
    const store = new MemoryStore();
    const order = (await store.createOrder({
      gateway: "hotmart", transactionId: "HP9", buyerName: "Ana Souza", buyerEmail: "ana@exemplo.com", buyerPhone: null,
      productId: "1", productName: "Raio-X", amountCents: 30000, currency: "BRL", status: "pago",
      briefingToken: "tokenDeTesteComTamanhoBom123", paidAt: NOW,
    }))!;
    await store.receiveBriefing(order.id, { handle: "@docesdaana", site: null, whatsapp: "+5511999998888", whatsappConsent: false, salesPain: "x" }, NOW);
    const mailer = new ConsoleMailer();
    const deps = {
      store, mailer, appUrl: "https://raio-x.exemplo", adminEmail: "eu@milena.ia.br",
      provider: { name: "teste", getInstagramProfile: async () => ({ ok: true as const, profile, raw: {} }) },
      writerFor: createDryRunWriter,
    };
    const r = await runJobs(deps, { orderId: order.id });
    expect(r.map((x) => [x.type, x.outcome])).toEqual([
      ["coletar", "concluido"],
      ["gerar_relatorio", "concluido"],
      ["enviar_relatorio", "concluido"],
    ]);
    const o = store.orders[0];
    expect(o.status).toBe("relatorio_enviado");
    expect(o.reportToken).toBeTruthy();
    expect(store.reports[0]).toMatchObject({ version: 1, status: "enviado", writer: "simulacao" });
    const sent = mailer.sent.filter((m) => m.to === "ana@exemplo.com");
    expect(sent).toHaveLength(1);
    expect(sent[0].html).toContain(`/relatorio/${o.reportToken}`);
    expect(sent[0].html).toContain(MANDATORY_PHRASE);
  });
});
