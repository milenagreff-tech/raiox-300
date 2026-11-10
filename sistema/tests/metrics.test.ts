import { describe, expect, it } from "vitest";
import { buildExampleProfile } from "@/fixtures/perfil-exemplo";
import type { InstagramPost, InstagramProfile } from "@/lib/instagram/types";
import { classifyLink, computeMetrics, hasCta } from "@/lib/metrics";

const NOW = new Date("2026-11-10T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

function post(i: number, d: number, extra: Partial<InstagramPost> = {}): InstagramPost {
  return { id: `p${i}`, type: "imagem", timestamp: daysAgo(d), caption: "", likes: 10, comments: 0, hashtags: [], permalink: null, ...extra };
}

function profile(posts: InstagramPost[], extra: Partial<InstagramProfile> = {}): InstagramProfile {
  return {
    handle: "@x", name: "X", biography: null, website: null, category: null, followers: 1000, following: 10,
    mediaCount: 100, profilePictureUrl: null, posts, highlights: null, provider: "teste", fetchedAt: NOW.toISOString(), ...extra,
  };
}

describe("frequência de postagem", () => {
  it("conta posts por semana nos últimos 60 dias", () => {
    // 6 posts dentro de 60 dias, 2 fora
    const m = computeMetrics(profile([1, 5, 10, 20, 40, 59, 70, 90].map((d, i) => post(i, d))), NOW);
    expect(m.frequency).toEqual({ windowDays: 60, postsInWindow: 6, postsPerWeek: 0.7, estimated: false });
    expect(m.daysSinceLastPost).toBe(1);
  });

  it("quando os 24 posts coletados cobrem menos de 60 dias, mede só o período coberto e marca como estimativa", () => {
    const posts = Array.from({ length: 24 }, (_, i) => post(i, i + 1)); // 1 post por dia, 24 dias
    const m = computeMetrics(profile(posts), NOW);
    expect(m.frequency.estimated).toBe(true);
    expect(m.frequency.windowDays).toBe(24);
    expect(m.frequency.postsPerWeek).toBe(7);
  });

  it("perfil sem posts não quebra", () => {
    const m = computeMetrics(profile([]), NOW);
    expect(m.frequency.postsPerWeek).toBeNull();
    expect(m.engagement.avgRatePercent).toBeNull();
    expect(m.best).toEqual([]);
    expect(m.formatMix).toEqual([]);
  });
});

describe("formatos e engajamento", () => {
  it("calcula o mix de formatos", () => {
    const m = computeMetrics(profile([post(1, 3, { type: "reel" }), post(2, 4, { type: "reel" }), post(3, 5, { type: "carrossel" }), post(4, 6)]), NOW);
    expect(m.formatMix).toEqual([
      { type: "reel", count: 2, percent: 50 },
      { type: "carrossel", count: 1, percent: 25 },
      { type: "imagem", count: 1, percent: 25 },
    ]);
  });

  it("engajamento médio = (curtidas + comentários) / seguidores, ignorando posts com curtidas escondidas", () => {
    const m = computeMetrics(profile([post(1, 3, { likes: 40, comments: 10 }), post(2, 4, { likes: 20, comments: 10 }), post(3, 5, { likes: null, comments: 99 })]), NOW);
    expect(m.engagement).toEqual({ postsWithLikes: 2, hiddenLikesPosts: 1, avgLikes: 30, avgComments: 10, avgRatePercent: 4 });
  });

  it("sem número de seguidores, não calcula taxa (em vez de inventar)", () => {
    const m = computeMetrics(profile([post(1, 3)], { followers: null }), NOW);
    expect(m.engagement.avgRatePercent).toBeNull();
    expect(m.engagement.avgLikes).toBe(10);
  });

  it("melhores e piores posts, deixando de fora posts com menos de 48h", () => {
    const posts = [
      post(1, 1, { likes: 999 }), // muito recente: fora do ranking
      post(2, 3, { likes: 100 }),
      post(3, 4, { likes: 50 }),
      post(4, 5, { likes: 5 }),
      post(5, 6, { likes: 80 }),
      post(6, 7, { likes: 1 }),
    ];
    const m = computeMetrics(profile(posts), NOW);
    expect(m.best.map((p) => p.id)).toEqual(["p2", "p5"]);
    expect(m.worst.map((p) => p.id)).toEqual(["p6", "p4"]);
    expect(m.best[0].engagementRate).toBe(10);
  });
});

describe("CTA e link da bio", () => {
  it("detecta chamadas para ação comuns", () => {
    expect(hasCta("Encomendas pelo link da bio")).toBe(true);
    expect(hasCta("Me chama no direct!")).toBe(true);
    expect(hasCta("Salva esse post")).toBe(true);
    expect(hasCta("Pedidos pelo WhatsApp")).toBe(true);
    expect(hasCta("Bom dia com cheirinho de café")).toBe(false);
    expect(hasCta(null)).toBe(false);
  });

  it("classifica o link da bio", () => {
    expect(classifyLink("https://linktr.ee/loja").type).toBe("agregador");
    expect(classifyLink("https://wa.me/5511999998888").type).toBe("whatsapp");
    expect(classifyLink("https://pay.kiwify.com.br/abc").type).toBe("checkout");
    expect(classifyLink("https://shopee.com.br/loja").type).toBe("loja");
    expect(classifyLink("http://mesaposta.milena.ia.br").type).toBe("site_proprio");
    expect(classifyLink(null)).toEqual({ url: null, type: null, domain: null });
  });

  it("perfil de exemplo: números coerentes", () => {
    const m = computeMetrics(buildExampleProfile("@docesdaana", NOW), NOW);
    expect(m.collectedPosts).toBe(24);
    expect(m.link.type).toBe("agregador");
    expect(m.bio.hasCta).toBe(false);
    expect(m.captions.withCta).toBeGreaterThanOrEqual(4);
    expect(m.frequency.postsPerWeek).toBeGreaterThan(1.5);
    expect(m.best).toHaveLength(2);
  });
});
