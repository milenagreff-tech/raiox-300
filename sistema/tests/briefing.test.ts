import { describe, expect, it } from "vitest";
import { lookupOrder, pageState, RATE, submitBriefing, submitCorrection } from "@/lib/briefing/service";
import { normalizeWhatsapp, validateBriefing } from "@/lib/briefing/validate";
import { MemoryStore } from "@/lib/store/memory";

const TOKEN = "tokenDeTesteComTamanhoBom123";
const valid = {
  instagram: "instagram.com/LojaDaAna",
  site: "linktr.ee/lojadaana",
  whatsapp: "(11) 99999-8888",
  whatsappConsent: true,
  salesPain: "Muita gente pergunta preço e some.",
};

async function setup(status: "pago" | "reembolsado" = "pago") {
  const store = new MemoryStore();
  const order = await store.createOrder({
    gateway: "hotmart",
    transactionId: "HP1234567890",
    buyerName: "Ana Souza",
    buyerEmail: "ana@exemplo.com",
    buyerPhone: null,
    productId: "1",
    productName: "Raio-X",
    amountCents: 30000,
    currency: "BRL",
    status,
    briefingToken: TOKEN,
    paidAt: new Date(),
  });
  return { store, order: order! };
}

describe("validação do briefing", () => {
  it("normaliza WhatsApp brasileiro", () => {
    expect(normalizeWhatsapp("(11) 99999-8888")).toBe("+5511999998888");
    expect(normalizeWhatsapp("+55 21 3333-4444")).toBe("+552133334444");
    expect(normalizeWhatsapp("99999-8888")).toBeNull(); // sem DDD
    expect(normalizeWhatsapp("(11) 89999-8888")).toBeNull(); // celular sem o 9
  });

  it("aponta cada campo com problema", () => {
    const r = validateBriefing({ instagram: "instagram.com/p/abc", site: "nao é link", whatsapp: "123", whatsappConsent: false, salesPain: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["instagram", "salesPain", "site", "whatsapp"]);
  });

  it("site é opcional", () => {
    expect(validateBriefing({ ...valid, site: "" }).ok).toBe(true);
  });
});

describe("envio do briefing", () => {
  it("salva, muda o status, define o prazo e coloca a coleta na fila", async () => {
    const { store, order } = await setup();
    const r = await submitBriefing(store, TOKEN, valid, new Date("2026-11-09T13:00:00Z"));
    expect(r.ok).toBe(true);
    const b = await store.getBriefing(order.id);
    expect(b).toMatchObject({ handle: "@lojadaana", whatsapp: "+5511999998888", whatsappConsent: true });
    expect(store.orders[0].status).toBe("briefing_recebido");
    expect(store.orders[0].dueAt?.toISOString()).toBe("2026-11-12T21:00:00.000Z");
    expect(store.jobs).toEqual([expect.objectContaining({ orderId: order.id, type: "coletar", status: "pendente" })]);
  });

  it("aceita só um briefing por pedido", async () => {
    const { store } = await setup();
    await submitBriefing(store, TOKEN, valid);
    const r = await submitBriefing(store, TOKEN, { ...valid, instagram: "@outra" });
    expect(r.ok).toBe(false);
    expect(store.briefings).toHaveLength(1);
    expect(store.briefings[0].handle).toBe("@lojadaana");
  });

  it("recusa token inexistente e pedido reembolsado", async () => {
    const { store } = await setup("reembolsado");
    expect((await submitBriefing(store, "tokenQueNaoExisteNoBanco12345", valid)).ok).toBe(false);
    expect((await submitBriefing(store, TOKEN, valid)).ok).toBe(false);
    expect(store.briefings).toHaveLength(0);
  });

  it("recusa pedido pausado (pedido de reembolso em análise)", async () => {
    const { store, order } = await setup();
    await store.updateOrder(order.id, { pausedReason: "pedido de reembolso em análise" });
    expect((await submitBriefing(store, TOKEN, valid)).ok).toBe(false);
  });

  it("não salva quando os dados são inválidos", async () => {
    const { store } = await setup();
    const r = await submitBriefing(store, TOKEN, { ...valid, instagram: "https://instagram.com/reel/abc" });
    expect(r.ok).toBe(false);
    expect(store.briefings).toHaveLength(0);
  });

  it("limita tentativas por token", async () => {
    const { store } = await setup();
    for (let i = 0; i < RATE.briefingPerToken.limit; i++) await submitBriefing(store, TOKEN, { ...valid, whatsapp: "x" });
    const r = await submitBriefing(store, TOKEN, valid);
    expect(r).toMatchObject({ ok: false, message: expect.stringContaining("Muitas tentativas") });
  });
});

describe("correção do @", () => {
  it("permite corrigir uma única vez", async () => {
    const { store } = await setup();
    await submitBriefing(store, TOKEN, valid);
    store.jobs[0].status = "concluido";
    expect(await submitCorrection(store, TOKEN, "@lojadaana_oficial")).toMatchObject({ ok: true, handle: "@lojadaana_oficial" });
    expect(store.jobs.filter((j) => j.status === "pendente")).toHaveLength(1);
    expect((await submitCorrection(store, TOKEN, "@outra")).ok).toBe(false);
    expect(store.briefings[0].handle).toBe("@lojadaana_oficial");
  });

  it("se a coleta falhou, reenviar o @ não conta como correção", async () => {
    const { store, order } = await setup();
    await submitBriefing(store, TOKEN, valid);
    await store.updateOrder(order.id, { status: "erro" });
    expect((await submitCorrection(store, TOKEN, "@lojadaana")).ok).toBe(true);
    expect(store.briefings[0].handleCorrections).toBe(0);
    expect(store.orders[0].status).toBe("briefing_recebido");
    // A correção normal continua disponível
    expect(pageState(store.orders[0], store.briefings[0])).toMatchObject({ kind: "recebido", canCorrect: true });
  });
});

describe("página de obrigado", () => {
  it("encontra o pedido com e-mail e código corretos (sem diferenciar maiúsculas)", async () => {
    const { store } = await setup();
    expect(await lookupOrder(store, " ANA@exemplo.com ", "hp1234567890", "1.2.3.4")).toEqual({ ok: true, token: TOKEN });
  });

  it("não revela nada quando o e-mail não confere", async () => {
    const { store } = await setup();
    const wrongEmail = await lookupOrder(store, "outra@exemplo.com", "HP1234567890", "1.2.3.4");
    const wrongCode = await lookupOrder(store, "ana@exemplo.com", "HP0000000000", "1.2.3.4");
    expect(wrongEmail.ok).toBe(false);
    expect(wrongEmail).toEqual(wrongCode);
  });

  it("limita tentativas por código de compra", async () => {
    const { store } = await setup();
    for (let i = 0; i < RATE.lookupPerCode.limit; i++) await lookupOrder(store, "x@x.com", "HP1234567890", `9.9.9.${i}`);
    const r = await lookupOrder(store, "ana@exemplo.com", "HP1234567890", "5.5.5.5");
    expect(r).toMatchObject({ ok: false, message: expect.stringContaining("Muitas tentativas") });
  });
});
