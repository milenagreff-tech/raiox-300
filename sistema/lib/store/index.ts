import { MemoryStore } from "./memory";
import { SupabaseStore } from "./supabase";
import type { Store } from "./types";

let memory: MemoryStore | null = null;

/**
 * Banco usado pelo app. Sem Supabase configurado e com DRY_RUN=true, usa um banco
 * em memória (os dados somem ao reiniciar), útil só para testar no computador.
 */
export function getStore(): Store {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return SupabaseStore.fromEnv();
  if (process.env.DRY_RUN === "true") {
    memory ??= new MemoryStore();
    return memory;
  }
  throw new Error("Banco não configurado: preencha SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY");
}
