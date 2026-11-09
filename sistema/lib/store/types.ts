// Interface do banco. A versão real usa o Supabase; os testes usam uma versão em memória.

export type OrderStatus =
  | "pago"
  | "briefing_recebido"
  | "relatorio_enviado"
  | "analise_entregue"
  | "erro"
  | "reembolsado";

export interface Order {
  id: string;
  gateway: string;
  transactionId: string;
  buyerName: string | null;
  buyerEmail: string;
  buyerPhone: string | null;
  productId: string | null;
  productName: string | null;
  amountCents: number | null;
  currency: string | null;
  status: OrderStatus;
  pausedReason: string | null;
  briefingToken: string;
  paidAt: Date | null;
  createdAt: Date;
}

export type NewOrder = Omit<Order, "id" | "createdAt" | "pausedReason"> & {
  pausedReason?: string | null;
};

export interface StoredEvent {
  gateway: string;
  eventId: string;
  eventType: string;
  transactionId: string | null;
  payload: unknown;
}

export type NotificationStatus = "enviado" | "simulado" | "falhou";

export interface Store {
  /** Grava o evento. Retorna false se ele já tinha sido recebido antes. */
  recordEvent(e: StoredEvent): Promise<boolean>;
  /** Já houve reembolso/estorno registrado para esta transação? */
  hasRefundEvent(gateway: string, transactionId: string, refundTypes: string[]): Promise<boolean>;
  findOrderByTransaction(gateway: string, transactionId: string): Promise<Order | null>;
  /** Cria o pedido. Retorna null se já existir pedido para a mesma transação. */
  createOrder(o: NewOrder): Promise<Order | null>;
  updateOrder(id: string, patch: Partial<Pick<Order, "status" | "pausedReason">>): Promise<void>;
  /** Já existe envio com sucesso deste tipo para o pedido? */
  wasNotified(orderId: string, kind: string, channel?: string): Promise<boolean>;
  recordNotification(
    orderId: string,
    kind: string,
    status: NotificationStatus,
    error?: string | null,
    channel?: string,
  ): Promise<void>;
}
