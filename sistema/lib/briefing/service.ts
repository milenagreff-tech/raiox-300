import { createHash } from "node:crypto";
import { addBusinessDaysDeadline } from "@/lib/business-days";
import { normalizeInstagramHandle } from "@/lib/instagram/normalize";
import { log } from "@/lib/log";
import type { Briefing, Order, Store } from "@/lib/store/types";
import { type BriefingInput, type FieldErrors, validateBriefing } from "./validate";

export const RATE = {
  briefingPerToken: { limit: 10, windowSeconds: 3600 },
  lookupPerIp: { limit: 10, windowSeconds: 3600 },
  lookupPerCode: { limit: 5, windowSeconds: 3600 },
};

export const MSG = {
  tooMany: "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.",
  notFound: "Não encontramos este link de briefing. Use o botão do e-mail de confirmação da compra.",
  refunded: "Este pedido foi reembolsado, por isso o briefing não está mais disponível.",
  paused: "Este pedido está em análise. Se tiver dúvidas, responda o e-mail de confirmação da compra.",
};

// ---------- Estado da página /briefing/[token] ----------

export type BriefingPageState =
  | { kind: "nao_encontrado" }
  | { kind: "reembolsado" }
  | { kind: "pausado" }
  | { kind: "formulario"; firstName: string }
  | { kind: "recebido"; firstName: string; handle: string; canCorrect: boolean; collectFailed: boolean; dueAt: Date | null };

export function firstName(order: Order): string {
  return (order.buyerName ?? "").trim().split(/\s+/)[0] ?? "";
}

export function pageState(order: Order | null, briefing: Briefing | null): BriefingPageState {
  if (!order) return { kind: "nao_encontrado" };
  if (order.status === "reembolsado") return { kind: "reembolsado" };
  if (order.pausedReason) return { kind: "pausado" };
  if (!briefing) {
    // Sem briefing, só pedidos "pago" mostram o formulário.
    return order.status === "pago" ? { kind: "formulario", firstName: firstName(order) } : { kind: "nao_encontrado" };
  }
  const collectFailed = order.status === "erro";
  const finished = order.status === "analise_entregue";
  return {
    kind: "recebido",
    firstName: firstName(order),
    handle: briefing.handle,
    canCorrect: !finished && (collectFailed || briefing.handleCorrections < 1),
    collectFailed,
    dueAt: order.dueAt,
  };
}

export async function loadBriefingPage(store: Store, token: string): Promise<BriefingPageState> {
  if (!isPlausibleToken(token)) return { kind: "nao_encontrado" };
  const order = await store.findOrderByBriefingToken(token);
  const briefing = order ? await store.getBriefing(order.id) : null;
  return pageState(order, briefing);
}

function isPlausibleToken(token: string) {
  return /^[A-Za-z0-9_-]{20,64}$/.test(token);
}

// ---------- Envio do briefing ----------

export type SubmitResult =
  | { ok: true; dueAt: Date }
  | { ok: false; message?: string; errors?: FieldErrors };

export async function submitBriefing(
  store: Store,
  token: string,
  input: BriefingInput,
  now: Date = new Date(),
): Promise<SubmitResult> {
  if (!isPlausibleToken(token)) return { ok: false, message: MSG.notFound };
  if (!(await store.hitRateLimit(`briefing:${token}`, RATE.briefingPerToken.limit, RATE.briefingPerToken.windowSeconds))) {
    return { ok: false, message: MSG.tooMany };
  }

  const order = await store.findOrderByBriefingToken(token);
  if (!order) return { ok: false, message: MSG.notFound };
  if (order.status === "reembolsado") return { ok: false, message: MSG.refunded };
  if (order.pausedReason) return { ok: false, message: MSG.paused };
  if (order.status !== "pago") return { ok: false, message: "O briefing deste pedido já foi recebido." };

  const v = validateBriefing(input);
  if (!v.ok) return { ok: false, errors: v.errors };

  const dueAt = addBusinessDaysDeadline(now, 3);
  const r = await store.receiveBriefing(order.id, v.data, dueAt);
  if (r === "exists") return { ok: false, message: "O briefing deste pedido já foi recebido." };

  log.info("briefing recebido", { orderId: order.id });
  return { ok: true, dueAt };
}

// ---------- Correção do @ ----------

export type CorrectResult = { ok: true; handle: string } | { ok: false; message: string };

export async function submitCorrection(store: Store, token: string, instagram: string): Promise<CorrectResult> {
  if (!isPlausibleToken(token)) return { ok: false, message: MSG.notFound };
  if (!(await store.hitRateLimit(`briefing:${token}`, RATE.briefingPerToken.limit, RATE.briefingPerToken.windowSeconds))) {
    return { ok: false, message: MSG.tooMany };
  }
  const order = await store.findOrderByBriefingToken(token);
  if (!order) return { ok: false, message: MSG.notFound };
  if (order.status === "reembolsado") return { ok: false, message: MSG.refunded };
  if (order.pausedReason) return { ok: false, message: MSG.paused };
  if (order.status === "analise_entregue") return { ok: false, message: "A análise deste pedido já foi entregue." };

  const h = normalizeInstagramHandle(instagram);
  if (!h.ok) return { ok: false, message: h.error };

  const r = await store.correctHandle(order.id, h.handle);
  if (r === "no_corrections_left") {
    return { ok: false, message: "O @ deste pedido já foi corrigido uma vez. Para outra mudança, responda o e-mail da compra." };
  }
  if (r === "no_briefing") return { ok: false, message: "Preencha o briefing primeiro." };
  log.info("@ corrigido", { orderId: order.id });
  return { ok: true, handle: h.handle };
}

// ---------- Página de obrigado: e-mail + código da transação ----------

export type LookupResult = { ok: true; token: string } | { ok: false; message: string };

export function normalizeTransactionCode(code: string): string {
  return (code ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

export function hashIp(ip: string): string {
  return createHash("sha256").update(`raiox:${ip}`).digest("hex").slice(0, 32);
}

export async function lookupOrder(store: Store, email: string, code: string, ip: string): Promise<LookupResult> {
  const cleanEmail = (email ?? "").trim().toLowerCase();
  const cleanCode = normalizeTransactionCode(code);
  if (!cleanEmail.includes("@") || cleanEmail.length > 200) {
    return { ok: false, message: "Informe o e-mail usado na compra." };
  }
  if (!/^[A-Z0-9-]{6,40}$/.test(cleanCode)) {
    return { ok: false, message: "Informe o código da compra (começa com HP, está no e-mail da Hotmart)." };
  }

  const ipOk = await store.hitRateLimit(`obrigado:ip:${hashIp(ip)}`, RATE.lookupPerIp.limit, RATE.lookupPerIp.windowSeconds);
  const codeOk = await store.hitRateLimit(`obrigado:code:${cleanCode}`, RATE.lookupPerCode.limit, RATE.lookupPerCode.windowSeconds);
  if (!ipOk || !codeOk) return { ok: false, message: MSG.tooMany };

  const order = await store.findOrderByTransactionCode(cleanCode);
  // Mesma mensagem para "não existe" e "e-mail não confere", para não revelar dados.
  if (!order || order.buyerEmail.toLowerCase() !== cleanEmail) {
    return {
      ok: false,
      message:
        "Ainda não encontramos uma compra com este e-mail e código. Se você acabou de pagar, aguarde 1 ou 2 minutos e tente de novo. O e-mail de confirmação também tem um botão direto para o briefing.",
    };
  }
  if (order.status === "reembolsado") return { ok: false, message: MSG.refunded };
  return { ok: true, token: order.briefingToken };
}
