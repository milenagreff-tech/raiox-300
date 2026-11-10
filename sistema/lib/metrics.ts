import type { InstagramPost, InstagramProfile, PostType } from "@/lib/instagram/types";

// Métricas objetivas calculadas no código (sem IA). O Claude só redige a partir delas.

export const FREQ_WINDOW_DAYS = 60;
/** Posts com menos de 48h ainda estão acumulando curtidas: ficam fora do ranking de melhores e piores. */
export const MIN_POST_AGE_HOURS = 48;

export type LinkType = "agregador" | "whatsapp" | "checkout" | "loja" | "site_proprio" | "instagram" | "outro";

export interface PostSummary {
  id: string;
  type: PostType;
  date: string; // ISO
  likes: number | null;
  comments: number | null;
  interactions: number | null; // curtidas + comentários
  engagementRate: number | null; // % sobre seguidores
  caption: string;
  permalink: string | null;
  hasCta: boolean;
}

export interface Metrics {
  followers: number | null;
  following: number | null;
  totalPosts: number | null;
  collectedPosts: number;
  oldestCollectedDate: string | null;
  newestCollectedDate: string | null;
  daysSinceLastPost: number | null;
  frequency: {
    windowDays: number; // período realmente medido (pode ser menor que 60 se os posts coletados não cobrem 60 dias)
    postsInWindow: number;
    postsPerWeek: number | null;
    estimated: boolean; // true quando o período medido é menor que 60 dias
  };
  formatMix: { type: PostType; count: number; percent: number }[];
  engagement: {
    postsWithLikes: number;
    hiddenLikesPosts: number;
    avgLikes: number | null;
    avgComments: number | null;
    avgRatePercent: number | null; // média de (curtidas + comentários) / seguidores
  };
  best: PostSummary[];
  worst: PostSummary[];
  bio: { text: string | null; length: number; hasCta: boolean };
  link: { url: string | null; type: LinkType | null; domain: string | null };
  captions: { withCta: number; total: number; percentWithCta: number | null; avgHashtags: number | null };
}

const CTA_PATTERNS = [
  /link\s+(na|da)\s+bio/i,
  /\b(me\s+)?chama\s+(no|na|pelo|pela)\s+(direct|dm|whats|whatsapp|inbox|privado)/i,
  /\bme\s+chama\b/i,
  /\b(manda|mande|envie|envia)\s+(uma\s+)?(mensagem|msg|dm|direct|um\s+oi)/i,
  /\b(clique|clica|acesse|acessa|toque|toca)\b/i,
  /\b(comente|comenta|comentem)\b/i,
  /\b(salve|salva|salvem)\b/i,
  /\b(compartilhe|compartilha|marque|marca\s+(um|uma|alguém|quem))\b/i,
  /\b(garanta|garante|compre|compra\s+já|agende|agenda\s+(já|agora|seu|sua)|reserve|inscreva|encomende|peça|pede\s+já)\b/i,
  /\bencomendas?\s+(pelo|pela|no|na|via|até)\b/i,
  /\b(whatsapp|wpp|zap)\b/i,
  /\b(direct|dm)\b/i,
  /👇|⬇️|👉/u,
];

export function hasCta(text: string | null | undefined): boolean {
  if (!text) return false;
  return CTA_PATTERNS.some((r) => r.test(text));
}

const LINK_RULES: [LinkType, RegExp][] = [
  ["whatsapp", /(^|\.)wa\.me$|whatsapp\.com$|^api\.whatsapp/i],
  ["agregador", /linktr\.ee|beacons\.ai|bio\.link|lnk\.bio|taplink|campsite\.bio|linkin\.bio|milkshake\.app|solo\.to|linkme|linkbio|allmylinks|carrd\.co/i],
  ["checkout", /kiwify|hotmart|eduzz|monetizze|mpago|mercadopago|pagseguro|pag\.ae|asaas|perfectpay|ticto|braip|stripe/i],
  ["loja", /shopee|mercadolivre|mercadolibre|nuvemshop|lojaintegrada|shopify|tray\.com|wix(site)?|ifood|elo7|magalu|amazon/i],
  ["instagram", /instagram\.com$/i],
];

export function classifyLink(url: string | null | undefined): Metrics["link"] {
  if (!url) return { url: null, type: null, domain: null };
  let domain: string;
  try {
    domain = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return { url, type: "outro", domain: null };
  }
  const match = LINK_RULES.find(([, re]) => re.test(domain));
  return { url, type: match ? match[0] : "site_proprio", domain };
}

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const DAY = 86_400_000;

function summarize(p: InstagramPost, followers: number | null): PostSummary {
  const interactions = p.likes === null ? null : p.likes + (p.comments ?? 0);
  return {
    id: p.id,
    type: p.type,
    date: p.timestamp,
    likes: p.likes,
    comments: p.comments,
    interactions,
    engagementRate: interactions !== null && followers ? round((interactions / followers) * 100, 2) : null,
    caption: p.caption,
    permalink: p.permalink,
    hasCta: hasCta(p.caption),
  };
}

export function computeMetrics(profile: InstagramProfile, now: Date = new Date(), postsLimit = 24): Metrics {
  const posts = [...profile.posts].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const followers = profile.followers && profile.followers > 0 ? profile.followers : null;
  const times = posts.map((p) => new Date(p.timestamp).getTime());

  // Frequência: posts por semana nos últimos 60 dias.
  // Se coletamos o máximo de posts e o mais antigo é mais novo que 60 dias, o período medido é menor (estimativa).
  const windowStart = now.getTime() - FREQ_WINDOW_DAYS * DAY;
  const oldest = times.length ? Math.min(...times) : null;
  const truncated = posts.length >= postsLimit && oldest !== null && oldest > windowStart;
  const windowDays = truncated ? Math.max(1, Math.round((now.getTime() - (oldest as number)) / DAY)) : FREQ_WINDOW_DAYS;
  const postsInWindow = times.filter((t) => t >= now.getTime() - windowDays * DAY).length;

  const typeCounts = new Map<PostType, number>();
  for (const p of posts) typeCounts.set(p.type, (typeCounts.get(p.type) ?? 0) + 1);
  const formatMix = [...typeCounts.entries()]
    .map(([type, count]) => ({ type, count, percent: round((count / posts.length) * 100, 0) }))
    .sort((a, b) => b.count - a.count);

  const summaries = posts.map((p) => summarize(p, followers));
  const withLikes = summaries.filter((s) => s.likes !== null);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const avgLikes = avg(withLikes.map((s) => s.likes as number));
  const avgComments = avg(withLikes.map((s) => s.comments ?? 0));
  const avgRate = followers ? avg(withLikes.map((s) => ((s.interactions as number) / followers) * 100)) : null;

  const rankable = withLikes
    .filter((s) => now.getTime() - new Date(s.date).getTime() >= MIN_POST_AGE_HOURS * 3_600_000)
    .sort((a, b) => (b.interactions as number) - (a.interactions as number));
  const best = rankable.slice(0, 2);
  const worst = rankable.length >= 4 ? rankable.slice(-2).reverse() : [];

  const captionsWithCta = posts.filter((p) => hasCta(p.caption)).length;
  const hashtagCounts = posts.map((p) => p.hashtags.length);

  return {
    followers: profile.followers,
    following: profile.following,
    totalPosts: profile.mediaCount,
    collectedPosts: posts.length,
    oldestCollectedDate: posts.length ? posts[posts.length - 1].timestamp : null,
    newestCollectedDate: posts.length ? posts[0].timestamp : null,
    daysSinceLastPost: posts.length ? Math.floor((now.getTime() - times[0]) / DAY) : null,
    frequency: {
      windowDays,
      postsInWindow,
      postsPerWeek: posts.length ? round(postsInWindow / (windowDays / 7), 1) : null,
      estimated: truncated,
    },
    formatMix,
    engagement: {
      postsWithLikes: withLikes.length,
      hiddenLikesPosts: posts.length - withLikes.length,
      avgLikes: avgLikes === null ? null : Math.round(avgLikes),
      avgComments: avgComments === null ? null : round(avgComments, 1),
      avgRatePercent: avgRate === null ? null : round(avgRate, 2),
    },
    best,
    worst,
    bio: { text: profile.biography, length: (profile.biography ?? "").length, hasCta: hasCta(profile.biography) },
    link: classifyLink(profile.website),
    captions: {
      withCta: captionsWithCta,
      total: posts.length,
      percentWithCta: posts.length ? round((captionsWithCta / posts.length) * 100, 0) : null,
      avgHashtags: posts.length ? round(avg(hashtagCounts) as number, 1) : null,
    },
  };
}
