// Converte o que o cliente digitou (@, nome ou link) em "@usuario".
// Rejeita links que não sejam de perfil (post, reel, stories etc.).

export type HandleResult = { ok: true; handle: string } | { ok: false; error: string };

const NOT_PROFILE = new Set([
  "p", "reel", "reels", "tv", "stories", "explore", "accounts", "direct", "about",
  "developer", "legal", "privacy", "web", "challenge", "s", "share",
]);

const HOSTS = new Set(["instagram.com", "www.instagram.com", "m.instagram.com", "instagr.am", "www.instagr.am"]);

// Regras do Instagram: até 30 caracteres, letras, números, ponto e sublinhado;
// sem ponto no começo, no fim ou dois pontos seguidos.
const USERNAME = /^(?!\.)(?!.*\.\.)(?!.*\.$)[a-z0-9._]{1,30}$/;

export function normalizeInstagramHandle(input: string): HandleResult {
  const raw = (input ?? "").trim();
  if (!raw) return { ok: false, error: "Informe o @ ou o link do seu perfil do Instagram." };

  let candidate = raw;

  // É link quando tem http(s), uma barra, ou começa com o domínio do Instagram.
  // Sem isso, "milena.ia" ou "loja.com" são tratados como nomes de usuário (o Instagram permite pontos).
  const looksLikeUrl =
    !raw.startsWith("@") && (/^https?:\/\//i.test(raw) || raw.includes("/") || /^(www\.|m\.)?instagr(am\.com|\.am)$/i.test(raw));
  if (looksLikeUrl) {
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
      return { ok: false, error: "Esse link não parece válido. Envie o @ do perfil, por exemplo @seunegocio." };
    }
    if (!HOSTS.has(url.hostname.toLowerCase())) {
      return { ok: false, error: "Esse link não é do Instagram. Envie o @ ou o link do seu perfil no Instagram." };
    }
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return { ok: false, error: "Faltou o nome do perfil no link." };
    if (NOT_PROFILE.has(parts[0].toLowerCase()) || parts.length > 1) {
      return {
        ok: false,
        error: "Esse é o link de um post, reel ou story. Envie o link do perfil (instagram.com/seunegocio) ou só o @.",
      };
    }
    candidate = parts[0];
  }

  candidate = candidate.replace(/^@+/, "").toLowerCase();
  if (NOT_PROFILE.has(candidate)) return { ok: false, error: "Esse não é um nome de perfil válido." };
  if (!USERNAME.test(candidate)) {
    return {
      ok: false,
      error: "O @ só pode ter letras, números, ponto e sublinhado (até 30 caracteres), sem espaços.",
    };
  }
  return { ok: true, handle: `@${candidate}` };
}
