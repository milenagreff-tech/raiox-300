import { describe, expect, it } from "vitest";
import { buildExampleProfile } from "@/fixtures/perfil-exemplo";
import { MAX_ATTEMPTS, retryAt } from "@/lib/jobs/collect";
import { HANDLERS, runJobs } from "@/lib/jobs/worker";

const ONLY_COLLECT = { coletar: HANDLERS.coletar };
import { classifyMetaError, createMetaProvider, postType } from "@/lib/instagram/meta";
import type { InstagramProvider, ProfileResult } from "@/lib/instagram/types";
import { ConsoleMailer } from "@/lib/messaging/email";
import { MemoryStore } from "@/lib/store/memory";

// ---------- Adaptador da Meta (sem chamar a internet) ----------

function fakeFetch(body: unknown, status = 200) {
  const calls: { url: string; auth: string | null }[] = [];
  const impl = (async (url: URL | string, init?: RequestInit) => {
    calls.push({ url: String(url), auth: new Headers(init?.headers).get("authorization") });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { impl, calls };
}

const metaOk = {
  business_discovery: {
    username: "LojaDaAna",
    name: "Loja da Ana",
    biography: "Bolos artesanais",
    website: "https://linktr.ee/lojadaana",
    followers_count: 1000,
    follows_count: 200,
    media_count: 50,
    media: {
      data: [
        { id: "1", caption: "Antigo #Bolo", like_count: 10, comments_count: 1, media_type: "IMAGE", media_product_type: "FEED", timestamp: "2026-10-01T12:00:00+0000" },
        { id: "2", caption: "Reel novo #bolo #Doce", comments_count: 5, media_type: "VIDEO", media_product_type: "REELS", timestamp: "2026-11-01T12:00:00+0000" },
        { id: "3", media_type: "CAROUSEL_ALBUM", media_product_type: "FEED", like_count: 30, comments_count: 2, timestamp: "2026-10-15T12:00:00+0000" },
      ],
    },
  },
  id: "17841400000000000",
};

describe("adaptador da Meta", () => {
  it("monta a chamada e converte a resposta para o formato único", async () => {
    const f = fakeFetch(metaOk);
    const p = createMetaProvider({ igUserId: "999", accessToken: "tok", fetchImpl: f.impl });
    const r = await p.getInstagramProfile("@lojadaana");
    expect(f.calls[0].url).toContain("graph.facebook.com/v27.0/999");
    expect(decodeURIComponent(f.calls[0].url)).toContain("business_discovery.username(lojadaana)");
    expect(f.calls[0].auth).toBe("Bearer tok");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.profile).toMatchObject({ handle: "@lojadaana", followers: 1000, following: 200, mediaCount: 50, category: null, highlights: null });
    // mais recente primeiro; curtidas escondidas viram null
    expect(r.profile.posts.map((x) => [x.id, x.type, x.likes])).toEqual([
      ["2", "reel", null],
      ["3", "carrossel", 30],
      ["1", "imagem", 10],
    ]);
    expect(r.profile.posts[0].hashtags).toEqual(["#bolo", "#doce"]);
    expect(r.profile.posts[1].caption).toBe("");
  });

  it("perfil inexistente, privado ou pessoal vira 'nao_encontrado'", async () => {
    const f = fakeFetch({ error: { message: "Invalid user id", code: 110, error_subcode: 2207013 } }, 400);
    const r = await createMetaProvider({ igUserId: "1", accessToken: "t", fetchImpl: f.impl }).getInstagramProfile("@x");
    expect(r).toMatchObject({ ok: false, reason: "nao_encontrado" });
  });

  it("classifica limite de chamadas e token inválido", () => {
    expect(classifyMetaError({ code: 4 }).reason).toBe("limite_fornecedor");
    expect(classifyMetaError({ code: 190, message: "Error validating access token" }).reason).toBe("configuracao");
    expect(classifyMetaError({ code: 1, message: "unknown" }).reason).toBe("erro_fornecedor");
  });

  it("sem token configurado não chama a Meta", async () => {
    const f = fakeFetch(metaOk);
    const r = await createMetaProvider({ igUserId: undefined, accessToken: undefined, fetchImpl: f.impl }).getInstagramProfile("@x");
    expect(r).toMatchObject({ ok: false, reason: "configuracao" });
    expect(f.calls).toHaveLength(0);
  });

  it("tipos de post", () => {
    expect(postType({ media_type: "VIDEO", media_product_type: "REELS" })).toBe("reel");
    expect(postType({ media_type: "VIDEO", media_product_type: "FEED" })).toBe("video");
    expect(postType({ media_type: "CAROUSEL_ALBUM" })).toBe("carrossel");
    expect(postType({ media_type: "IMAGE" })).toBe("imagem");
  });
});

// ---------- Tarefa de coleta ----------

function provider(results: ProfileResult[]): InstagramProvider & { calls: number } {
  const p = {
    name: "teste",
    calls: 0,
    async getInstagramProfile() {
      const r = results[Math.min(p.calls, results.length - 1)];
      p.calls++;
      return r;
    },
  };
  return p;
}

const okResult: ProfileResult = { ok: true, profile: buildExampleProfile("@lojadaana"), raw: { bruto: 1 } };
const notFound: ProfileResult = { ok: false, reason: "nao_encontrado", message: "não existe" };
const temporary: ProfileResult = { ok: false, reason: "erro_fornecedor", message: "instável" };

async function setup(results: ProfileResult[]) {
  const store = new MemoryStore();
  const order = (await store.createOrder({
    gateway: "hotmart", transactionId: "HP1", buyerName: "Ana Souza", buyerEmail: "ana@exemplo.com", buyerPhone: null,
    productId: "1", productName: "Raio-X", amountCents: 30000, currency: "BRL", status: "pago",
    briefingToken: "tokenDeTesteComTamanhoBom123", paidAt: new Date(),
  }))!;
  await store.receiveBriefing(order.id, { handle: "@lojadaana", site: null, whatsapp: "+5511999998888", whatsappConsent: false, salesPain: "x" }, new Date());
  const mailer = new ConsoleMailer();
  const prov = provider(results);
  const deps = { store, mailer, provider: prov, appUrl: "https://raio-x.exemplo", adminEmail: "eu@milena.ia.br" };
  return { store, order, mailer, prov, deps };
}

describe("tarefa de coleta", () => {
  it("sucesso: guarda o JSON bruto e coloca a geração do relatório na fila", async () => {
    const { store, order, deps } = await setup([okResult]);
    const r = await runJobs(deps, { orderId: order.id, handlers: ONLY_COLLECT });
    expect(r).toEqual([expect.objectContaining({ type: "coletar", outcome: "concluido" })]);
    expect(store.collections[0]).toMatchObject({ ok: true, handle: "@lojadaana", raw: { bruto: 1 } });
    expect(store.jobs.map((j) => [j.type, j.status])).toEqual([
      ["coletar", "concluido"],
      ["gerar_relatorio", "pendente"],
    ]);
  });

  it("perfil inacessível: status 'erro', e-mail ao cliente (uma vez por @) e aviso para a Milena", async () => {
    const { store, order, mailer, deps } = await setup([notFound]);
    await runJobs(deps, { orderId: order.id, handlers: ONLY_COLLECT });
    expect(store.orders[0].status).toBe("erro");
    const toClient = mailer.sent.filter((m) => m.to === "ana@exemplo.com");
    const toAdmin = mailer.sent.filter((m) => m.to === "eu@milena.ia.br");
    expect(toClient).toHaveLength(1);
    expect(toClient[0].subject).toBe("Não consegui acessar seu perfil do Instagram");
    expect(toClient[0].html).toContain("/briefing/tokenDeTesteComTamanhoBom123");
    expect(toAdmin).toHaveLength(1);
    expect(store.collections[0]).toMatchObject({ ok: false, reason: "nao_encontrado" });

    // O cliente reenvia o mesmo @ (correção grátis) e ainda falha: não recebe o mesmo e-mail de novo.
    await store.correctHandle(order.id, "@lojadaana");
    await runJobs(deps, { orderId: order.id, handlers: ONLY_COLLECT });
    expect(mailer.sent.filter((m) => m.to === "ana@exemplo.com")).toHaveLength(1);
  });

  it("erro temporário: tenta de novo com espera e desiste depois do limite", async () => {
    const { store, order, mailer, prov, deps } = await setup([temporary]);
    await runJobs(deps, { orderId: order.id, handlers: ONLY_COLLECT });
    const job = store.jobs[0];
    expect(job.status).toBe("pendente");
    expect(job.runAfter.getTime()).toBeGreaterThan(Date.now() + 60_000);

    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      job.runAfter = new Date(0); // simula a passagem do tempo
      await runJobs(deps, { orderId: order.id, handlers: ONLY_COLLECT });
    }
    expect(prov.calls).toBe(MAX_ATTEMPTS);
    expect(job.status).toBe("falhou");
    expect(store.orders[0].status).toBe("briefing_recebido"); // não é culpa do cliente
    expect(mailer.sent.filter((m) => m.to === "ana@exemplo.com")).toHaveLength(0);
    expect(mailer.sent.filter((m) => m.to === "eu@milena.ia.br")).toHaveLength(1);
  });

  it("pedido reembolsado no meio do caminho: não coleta", async () => {
    const { store, order, prov, deps } = await setup([okResult]);
    await store.updateOrder(order.id, { status: "reembolsado" });
    const r = await runJobs(deps, { orderId: order.id, handlers: ONLY_COLLECT });
    expect(r[0].outcome).toBe("ignorado");
    expect(prov.calls).toBe(0);
  });

  it("esperas entre tentativas: 2, 10 e 30 minutos", () => {
    const now = new Date("2026-11-09T12:00:00Z");
    expect(retryAt(1, now)?.toISOString()).toBe("2026-11-09T12:02:00.000Z");
    expect(retryAt(2, now)?.toISOString()).toBe("2026-11-09T12:10:00.000Z");
    expect(retryAt(3, now)?.toISOString()).toBe("2026-11-09T12:30:00.000Z");
    expect(retryAt(4, now)).toBeNull();
  });
});
