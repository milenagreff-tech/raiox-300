// Formato único de evento de pagamento. Cada gateway (Hotmart, Kiwify, Asaas)
// tem um adaptador que converte o JSON dele para este formato.

export type PaymentEventKind =
  | "approved" // compra aprovada
  | "refunded" // reembolso, estorno, chargeback ou cancelamento
  | "refund_requested" // pedido de reembolso em análise (pausa o pedido)
  | "ignored"; // eventos que não nos interessam (boleto impresso etc.)

export interface PaymentEvent {
  gateway: string;
  eventId: string;
  eventType: string; // nome original do evento no gateway
  kind: PaymentEventKind;
  transactionId: string | null;
  buyer: { name: string | null; email: string | null; phone: string | null };
  product: { id: string | null; name: string | null };
  amountCents: number | null;
  currency: string | null;
  paidAt: Date | null;
  raw: unknown;
}

export interface PaymentAdapter {
  gateway: string;
  /** Confere se a chamada veio mesmo do gateway. */
  verify(headers: Headers, rawBody: string): boolean;
  /** Converte o corpo recebido para o formato único. Lança erro se o JSON for inválido. */
  parse(rawBody: string): PaymentEvent;
}
