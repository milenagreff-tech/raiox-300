import { extractHashtags, type InstagramPost, type InstagramProvider, type PostType, type ProfileResult } from "./types";

// Coleta pela API oficial da Meta (Business Discovery).
// Só funciona para contas profissionais (Empresa ou Criador de conteúdo).
// Precisa do ID da sua conta do Instagram (META_IG_USER_ID) e de um token de usuário do sistema (META_ACCESS_TOKEN).

export const POSTS_LIMIT = 24;

const FIELDS = (username: string) =>
  `business_discovery.username(${username}){username,name,biography,website,followers_count,follows_count,media_count,profile_picture_url,` +
  `media.limit(${POSTS_LIMIT}){id,caption,like_count,comments_count,media_type,media_product_type,timestamp,permalink}}`;

interface MetaMedia {
  id: string;
  caption?: string;
  like_count?: number;
  comments_count?: number;
  media_type?: string;
  media_product_type?: string;
  timestamp?: string;
  permalink?: string;
}

interface MetaError {
  message?: string;
  code?: number;
  error_subcode?: number;
}

export function postType(m: Pick<MetaMedia, "media_type" | "media_product_type">): PostType {
  if (m.media_product_type === "REELS") return "reel";
  if (m.media_type === "CAROUSEL_ALBUM") return "carrossel";
  if (m.media_type === "VIDEO") return "video";
  return "imagem";
}

export function classifyMetaError(e: MetaError): { reason: "nao_encontrado" | "limite_fornecedor" | "erro_fornecedor" | "configuracao"; message: string } {
  const code = e.code ?? 0;
  const msg = e.message ?? "erro desconhecido";
  // 110 / 2207013: usuário não encontrado (inexistente, privado ou conta pessoal)
  if (code === 110 || e.error_subcode === 2207013) return { reason: "nao_encontrado", message: msg };
  if ([4, 17, 32, 613].includes(code) || e.error_subcode === 2207051) return { reason: "limite_fornecedor", message: msg };
  if (code === 190 || code === 10 || code === 200 || (code >= 200 && code < 300)) return { reason: "configuracao", message: msg };
  // 100 com "username" costuma ser perfil inexistente
  if (code === 100 && /business_discovery|username|cannot be found|does not exist/i.test(msg)) {
    return { reason: "nao_encontrado", message: msg };
  }
  return { reason: "erro_fornecedor", message: msg };
}

export function createMetaProvider(opts: {
  igUserId: string | undefined;
  accessToken: string | undefined;
  version?: string;
  fetchImpl?: typeof fetch;
}): InstagramProvider {
  const version = opts.version || "v23.0";
  const doFetch = opts.fetchImpl ?? fetch;

  return {
    name: "meta",
    async getInstagramProfile(handle: string): Promise<ProfileResult> {
      if (!opts.igUserId || !opts.accessToken) {
        return { ok: false, reason: "configuracao", message: "META_IG_USER_ID ou META_ACCESS_TOKEN não configurados" };
      }
      const username = handle.replace(/^@/, "");
      const url = new URL(`https://graph.facebook.com/${version}/${opts.igUserId}`);
      url.searchParams.set("fields", FIELDS(username));

      let res: Response;
      try {
        res = await doFetch(url, {
          headers: { Authorization: `Bearer ${opts.accessToken}` },
          signal: AbortSignal.timeout(30_000),
        });
      } catch (err) {
        return { ok: false, reason: "erro_fornecedor", message: `falha de rede: ${(err as Error).message}` };
      }

      let body: { business_discovery?: Record<string, unknown>; error?: MetaError };
      try {
        body = await res.json();
      } catch {
        return { ok: false, reason: "erro_fornecedor", message: `resposta inválida (HTTP ${res.status})` };
      }

      if (body.error) {
        const c = classifyMetaError(body.error);
        return { ok: false, reason: c.reason, message: c.message, raw: body };
      }
      const bd = body.business_discovery as
        | {
            username?: string;
            name?: string;
            biography?: string;
            website?: string;
            followers_count?: number;
            follows_count?: number;
            media_count?: number;
            profile_picture_url?: string;
            media?: { data?: MetaMedia[] };
          }
        | undefined;
      if (!bd) return { ok: false, reason: "nao_encontrado", message: "perfil não retornado pela Meta", raw: body };

      const posts: InstagramPost[] = (bd.media?.data ?? []).map((m) => {
        const caption = m.caption ?? "";
        return {
          id: m.id,
          type: postType(m),
          timestamp: m.timestamp ? new Date(m.timestamp).toISOString() : new Date(0).toISOString(),
          caption,
          likes: typeof m.like_count === "number" ? m.like_count : null,
          comments: typeof m.comments_count === "number" ? m.comments_count : null,
          hashtags: extractHashtags(caption),
          permalink: m.permalink ?? null,
        };
      });
      posts.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

      return {
        ok: true,
        raw: body,
        profile: {
          handle: `@${(bd.username ?? username).toLowerCase()}`,
          name: bd.name ?? null,
          biography: bd.biography ?? null,
          website: bd.website ?? null,
          category: null,
          followers: bd.followers_count ?? null,
          following: bd.follows_count ?? null,
          mediaCount: bd.media_count ?? null,
          profilePictureUrl: bd.profile_picture_url ?? null,
          posts,
          highlights: null,
          provider: "meta",
          fetchedAt: new Date().toISOString(),
        },
      };
    },
  };
}
