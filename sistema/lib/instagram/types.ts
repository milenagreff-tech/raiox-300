// Formato único do perfil coletado, seja qual for o fornecedor (Meta, Apify...).

export type PostType = "reel" | "carrossel" | "imagem" | "video";

export interface InstagramPost {
  id: string;
  type: PostType;
  timestamp: string; // ISO
  caption: string;
  likes: number | null; // null quando o dono esconde as curtidas
  comments: number | null;
  hashtags: string[];
  permalink: string | null;
}

export interface InstagramProfile {
  handle: string; // @usuario
  name: string | null;
  biography: string | null;
  website: string | null;
  category: string | null; // a API da Meta não fornece
  followers: number | null;
  following: number | null;
  mediaCount: number | null;
  profilePictureUrl: string | null;
  posts: InstagramPost[]; // mais recentes primeiro
  highlights: { title: string }[] | null; // null = o fornecedor não entrega
  provider: string;
  fetchedAt: string; // ISO
}

/** Motivos de falha. Os dois primeiros são problema do perfil; os outros, temporários ou de configuração. */
export type ProfileFailure =
  | "nao_encontrado" // não existe, é privado ou é conta pessoal
  | "sem_posts"
  | "limite_fornecedor" // limite de chamadas atingido: tentar mais tarde
  | "erro_fornecedor" // erro temporário: tentar mais tarde
  | "configuracao"; // token inválido/expirado: precisa de ação da Milena

export type ProfileResult =
  | { ok: true; profile: InstagramProfile; raw: unknown }
  | { ok: false; reason: ProfileFailure; message: string; raw?: unknown };

export interface InstagramProvider {
  name: string;
  getInstagramProfile(handle: string): Promise<ProfileResult>;
}

export function extractHashtags(caption: string): string[] {
  const tags = caption.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  return [...new Set(tags.map((t) => t.toLowerCase()))];
}
