"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { lookupOrder } from "@/lib/briefing/service";
import { log } from "@/lib/log";
import { getStore } from "@/lib/store";

export interface LookupState {
  message?: string;
  email?: string;
  code?: string;
}

export async function findPurchase(_prev: LookupState, fd: FormData): Promise<LookupState> {
  const email = String(fd.get("email") ?? "").slice(0, 200);
  const code = String(fd.get("code") ?? "").slice(0, 60);
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "desconhecido";

  let token: string | null = null;
  try {
    const r = await lookupOrder(getStore(), email, code, ip);
    if (!r.ok) return { message: r.message, email, code };
    token = r.token;
  } catch (err) {
    log.error("erro na busca da compra", { erro: (err as Error).message });
    return { message: "Não conseguimos buscar agora. Tente de novo em alguns instantes.", email, code };
  }
  redirect(`/briefing/${token}`);
}
