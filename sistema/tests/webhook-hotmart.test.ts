import { describe, expect, it } from "vitest";
import { hotmartEvent } from "@/fixtures/hotmart";
import { ConsoleMailer } from "@/lib/messaging/email";
import { handlePaymentEvent } from "@/lib/payments/handle-event";
import { createHotmartAdapter } from "@/lib/payments/hotmart";
import { MemoryStore } from "@/lib/store/memory";

const HOTTOK = "segredo-de-teste";
const adapter = createHotmartAdapter(HOTTOK);

function setup(allowedProductId: string | null = null) {
  const store = new MemoryStore();
  const mailer = new ConsoleMailer();
  const deps = { store, mailer, appUrl: "https://raio-x.exemplo", allowedProductId };
  const send = (body: object) => handlePaymentEvent(adapter.parse(JSON.stringify(body)), deps);
  return { store, mailer, send };
}

describe("assinatura (hottok)", () => {
  it("aceita hottok correto", () => {
    expect(adapter.verify(new Headers({ "x-hotmart-hottok": HOTTOK }), "{}")).toBe(true);
  });
  it("recusa hottok errado ou ausente", () => {
    expect(adapter.verify(new Headers({ "x-hotmart-hottok": "outro" }), "{}")).toBe(false);
    expect(adapter.verify(new Headers(), "{}")).toBe(false);
  });
  it("recusa tudo se o hottok não estiver configurado", () => {
    const semConfig = createHotmartAdapter(undefined);
    expect(semConfig.verify(new Headers({ "x-hotmart-hottok": "" }), "{}")).toBe(false);
  });
});

describe("compra aprovada", () => {
  it("cria o pedido com os dados certos e envia o e-mail com o link do briefing", async () => {
    const { store, mailer, send } = setup();
    const r = await send(hotmartEvent("PURCHASE_APPROVED"));
    expect(r.outcome).toBe("order_created");
    expect(store.orders).toHaveLength(1);
    const o = store.orders[0];
    expect(o).toMatchObject({
      transactionId: "HP0001",
      buyerEmail: "ana.teste@exemplo.com",
      buyerName: "Ana Paula Souza",
      buyerPhone: "11999998888",
      amountCents: 30000,
      status: "pago",
    });
    expect(o.briefingToken.length).toBeGreaterThanOrEqual(30);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0].subject).toBe("Compra confirmada: preencha seu briefing");
    expect(mailer.sent[0].html).toContain(`/briefing/${o.briefingToken}`);
    expect(mailer.sent[0].text).toContain("HP0001");
    expect(mailer.sent[0].html).toContain("Oi, Ana!");
  });
});

describe("duplicidade", () => {
  it("o mesmo evento repetido não cria pedido nem e-mail duplicado", async () => {
    const { store, mailer, send } = setup();
    await send(hotmartEvent("PURCHASE_APPROVED"));
    const r = await send(hotmartEvent("PURCHASE_APPROVED"));
    expect(r.outcome).toBe("duplicate");
    expect(store.orders).toHaveLength(1);
    expect(mailer.sent).toHaveLength(1);
  });

  it("evento diferente da mesma compra (ex.: PURCHASE_COMPLETE) não cria outro pedido", async () => {
    const { store, mailer, send } = setup();
    await send(hotmartEvent("PURCHASE_APPROVED"));
    const r = await send(hotmartEvent("PURCHASE_COMPLETE"));
    expect(r.outcome).toBe("order_exists");
    expect(store.orders).toHaveLength(1);
    expect(mailer.sent).toHaveLength(1);
  });
});

describe("estorno e reembolso", () => {
  for (const ev of ["PURCHASE_REFUNDED", "PURCHASE_CHARGEBACK", "PURCHASE_CANCELED"]) {
    it(`${ev} muda o status para reembolsado`, async () => {
      const { store, send } = setup();
      await send(hotmartEvent("PURCHASE_APPROVED"));
      const r = await send(hotmartEvent(ev));
      expect(r.outcome).toBe("refunded");
      expect(store.orders[0].status).toBe("reembolsado");
    });
  }

  it("estorno que chega antes da aprovação faz o pedido nascer reembolsado e sem e-mail", async () => {
    const { store, mailer, send } = setup();
    await send(hotmartEvent("PURCHASE_REFUNDED"));
    await send(hotmartEvent("PURCHASE_APPROVED"));
    expect(store.orders[0].status).toBe("reembolsado");
    expect(mailer.sent).toHaveLength(0);
  });

  it("pedido de reembolso em análise pausa o pedido", async () => {
    const { store, send } = setup();
    await send(hotmartEvent("PURCHASE_APPROVED"));
    const r = await send(hotmartEvent("PURCHASE_PROTEST"));
    expect(r.outcome).toBe("paused");
    expect(store.orders[0].status).toBe("pago");
    expect(store.orders[0].pausedReason).toBeTruthy();
  });
});

describe("filtros", () => {
  it("ignora compras de outro produto", async () => {
    const { store, send } = setup("999");
    const r = await send(hotmartEvent("PURCHASE_APPROVED", { productId: 123456 }));
    expect(r.outcome).toBe("ignored");
    expect(store.orders).toHaveLength(0);
  });

  it("ignora eventos que não interessam (ex.: boleto impresso)", async () => {
    const { store, send } = setup();
    const r = await send(hotmartEvent("PURCHASE_BILLET_PRINTED"));
    expect(r.outcome).toBe("ignored");
    expect(store.orders).toHaveLength(0);
  });
});

describe("falha no envio do e-mail", () => {
  it("não perde o pedido e registra a falha para reenvio", async () => {
    const store = new MemoryStore();
    const mailer = { send: async () => { throw new Error("fora do ar"); } };
    const r = await handlePaymentEvent(adapter.parse(JSON.stringify(hotmartEvent("PURCHASE_APPROVED"))), {
      store,
      mailer,
      appUrl: "https://x",
    });
    expect(r).toMatchObject({ outcome: "order_created", emailed: false });
    expect(store.notifications[0].status).toBe("falhou");
  });
});
