import { timingSafeEqual } from "node:crypto";
import type { PaymentAdapter, PaymentEvent, PaymentEventKind } from "./types";

// Webhook Hotmart versão 2.0.0. A Hotmart envia o "hottok" no cabeçalho
// X-HOTMART-HOTTOK; ele precisa ser igual ao configurado em HOTMART_HOTTOK.

const KIND_BY_EVENT: Record<string, PaymentEventKind> = {
  PURCHASE_APPROVED: "approved",
  PURCHASE_COMPLETE: "approved", // fim do prazo de garantia: mesma compra, não cria outro pedido
  PURCHASE_REFUNDED: "refunded",
  PURCHASE_CHARGEBACK: "refunded",
  PURCHASE_CANCELED: "refunded",
  PURCHASE_PROTEST: "refund_requested",
};

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export function createHotmartAdapter(hottok: string | undefined): PaymentAdapter {
  return {
    gateway: "hotmart",

    verify(headers) {
      if (!hottok) return false; // sem hottok configurado, recusa tudo
      const received = headers.get("x-hotmart-hottok");
      if (!received) return false;
      return safeEqual(received, hottok);
    },

    parse(rawBody): PaymentEvent {
      const body = JSON.parse(rawBody);
      const eventType = String(body?.event ?? "");
      const data = body?.data ?? {};
      const purchase = data.purchase ?? {};
      const buyer = data.buyer ?? {};
      const product = data.product ?? {};
      const price = purchase.price ?? {};

      const transactionId = str(purchase.transaction);
      const value = typeof price.value === "number" ? price.value : Number(price.value);
      const approvedMs = Number(purchase.approved_date);

      return {
        gateway: "hotmart",
        // O id do evento é único por envio; se faltar, montamos um a partir do tipo + transação.
        eventId: str(body?.id) ?? `${eventType}:${transactionId ?? "sem-transacao"}`,
        eventType,
        kind: KIND_BY_EVENT[eventType] ?? "ignored",
        transactionId,
        buyer: {
          name: str(buyer.name),
          email: str(buyer.email)?.toLowerCase() ?? null,
          phone: str(buyer.checkout_phone) ?? str(buyer.phone),
        },
        product: { id: str(product.id), name: str(product.name) },
        amountCents: Number.isFinite(value) ? Math.round(value * 100) : null,
        currency: str(price.currency_value),
        paidAt: Number.isFinite(approvedMs) && approvedMs > 0 ? new Date(approvedMs) : null,
        raw: body,
      };
    },
  };
}
