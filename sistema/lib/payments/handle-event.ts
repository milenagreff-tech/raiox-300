import { randomBytes } from "node:crypto";
import { confirmacaoCompraEmail } from "@/emails/confirmacao";
import { log } from "@/lib/log";
import type { Mailer } from "@/lib/messaging/email";
import type { Order, Store } from "@/lib/store/types";
import type { PaymentEvent } from "./types";

export interface HandleDeps {
  store: Store;
  mailer: Mailer;
  appUrl: string; // ex.: https://raio-x.milena.ia.br
  allowedProductId?: string | null; // se preenchido, ignora outros produtos
}

export type HandleResult =
  | { outcome: "duplicate" }
  | { outcome: "ignored"; reason: string }
  | { outcome: "order_created"; orderId: string; emailed: boolean }
  | { outcome: "order_exists"; orderId: string }
  | { outcome: "refunded"; orderId: string | null }
  | { outcome: "paused"; orderId: string | null };

// Tipos de evento que, se já recebidos, impedem um pedido de ficar ativo.
const REFUND_TYPES = ["PURCHASE_REFUNDED", "PURCHASE_CHARGEBACK", "PURCHASE_CANCELED"];

export function newToken(): string {
  return randomBytes(24).toString("base64url");
}

export const CONFIRMATION_KIND = "confirmacao_compra";

export async function sendConfirmation(order: Order, deps: Pick<HandleDeps, "store" | "mailer" | "appUrl">) {
  if (order.status === "reembolsado" || order.pausedReason) return false;
  if (await deps.store.wasNotified(order.id, CONFIRMATION_KIND)) return false;
  const briefingUrl = `${deps.appUrl.replace(/\/$/, "")}/briefing/${order.briefingToken}`;
  const msg = confirmacaoCompraEmail({
    to: order.buyerEmail,
    nome: order.buyerName,
    briefingUrl,
    transactionId: order.transactionId,
  });
  try {
    const status = await deps.mailer.send(msg);
    await deps.store.recordNotification(order.id, CONFIRMATION_KIND, status);
    return true;
  } catch (err) {
    // Não derruba o webhook: o pedido já existe e a rotina agendada tenta reenviar.
    log.error("falha ao enviar confirmacao", { orderId: order.id, erro: (err as Error).message });
    await deps.store.recordNotification(order.id, CONFIRMATION_KIND, "falhou", (err as Error).message);
    return false;
  }
}

export async function handlePaymentEvent(ev: PaymentEvent, deps: HandleDeps): Promise<HandleResult> {
  if (deps.allowedProductId && ev.product.id && ev.product.id !== deps.allowedProductId) {
    return { outcome: "ignored", reason: "outro produto" };
  }

  // 1) Idempotência: o mesmo evento só é processado uma vez.
  const isNew = await deps.store.recordEvent({
    gateway: ev.gateway,
    eventId: ev.eventId,
    eventType: ev.eventType,
    transactionId: ev.transactionId,
    payload: ev.raw,
  });
  if (!isNew) return { outcome: "duplicate" };

  if (ev.kind === "ignored") return { outcome: "ignored", reason: `evento ${ev.eventType}` };
  if (!ev.transactionId) return { outcome: "ignored", reason: "sem código de transação" };

  const existing = await deps.store.findOrderByTransaction(ev.gateway, ev.transactionId);

  // 2) Reembolso, estorno, chargeback ou cancelamento.
  if (ev.kind === "refunded") {
    if (existing) {
      await deps.store.updateOrder(existing.id, { status: "reembolsado", pausedReason: null });
      log.info("pedido reembolsado", { orderId: existing.id, evento: ev.eventType });
    }
    return { outcome: "refunded", orderId: existing?.id ?? null };
  }

  // 3) Pedido de reembolso em análise: pausa o pedido (nenhum envio automático).
  if (ev.kind === "refund_requested") {
    if (existing && existing.status !== "reembolsado") {
      await deps.store.updateOrder(existing.id, { pausedReason: "pedido de reembolso em análise" });
      log.warn("pedido pausado", { orderId: existing.id });
    }
    return { outcome: "paused", orderId: existing?.id ?? null };
  }

  // 4) Compra aprovada.
  if (existing) return { outcome: "order_exists", orderId: existing.id };

  if (!ev.buyer.email) {
    log.error("compra aprovada sem e-mail", { transacao: ev.transactionId });
    return { outcome: "ignored", reason: "sem e-mail do comprador" };
  }

  // Se o estorno chegou antes da aprovação (raro), o pedido já nasce reembolsado.
  const refundedBefore = await deps.store.hasRefundEvent(ev.gateway, ev.transactionId, REFUND_TYPES);

  const order = await deps.store.createOrder({
    gateway: ev.gateway,
    transactionId: ev.transactionId,
    buyerName: ev.buyer.name,
    buyerEmail: ev.buyer.email,
    buyerPhone: ev.buyer.phone,
    productId: ev.product.id,
    productName: ev.product.name,
    amountCents: ev.amountCents,
    currency: ev.currency,
    status: refundedBefore ? "reembolsado" : "pago",
    briefingToken: newToken(),
    paidAt: ev.paidAt ?? new Date(),
  });

  if (!order) {
    // Outro envio simultâneo criou o pedido primeiro.
    const again = await deps.store.findOrderByTransaction(ev.gateway, ev.transactionId);
    return { outcome: "order_exists", orderId: again?.id ?? "" };
  }

  log.info("pedido criado", { orderId: order.id, transacao: order.transactionId });
  const emailed = await sendConfirmation(order, deps);
  return { outcome: "order_created", orderId: order.id, emailed };
}
