import { buildExampleProfile } from "@/fixtures/perfil-exemplo";
import { createMetaProvider } from "./meta";
import type { InstagramProvider, ProfileResult } from "./types";

/**
 * Simulação: devolve o perfil de exemplo, sem gastar nada.
 * Alguns @ especiais testam os erros: @teste_privado, @teste_naoexiste, @teste_erro.
 */
export const dryRunProvider: InstagramProvider = {
  name: "simulacao",
  async getInstagramProfile(handle): Promise<ProfileResult> {
    if (handle === "@teste_privado" || handle === "@teste_naoexiste") {
      return { ok: false, reason: "nao_encontrado", message: "simulação: perfil não encontrado" };
    }
    if (handle === "@teste_erro") return { ok: false, reason: "erro_fornecedor", message: "simulação: erro temporário" };
    const profile = buildExampleProfile(handle);
    return { ok: true, profile, raw: { simulacao: true, profile } };
  },
};

/** Fornecedor em uso. Para trocar de fornecedor (ex.: Apify), basta criar outro adaptador e escolher aqui. */
export function getInstagramProvider(): InstagramProvider {
  if (process.env.DRY_RUN === "true") return dryRunProvider;
  return createMetaProvider({
    igUserId: process.env.META_IG_USER_ID,
    accessToken: process.env.META_ACCESS_TOKEN,
    version: process.env.META_GRAPH_VERSION,
  });
}

export async function getInstagramProfile(handle: string): Promise<ProfileResult> {
  return getInstagramProvider().getInstagramProfile(handle);
}
