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
  briefingAt: Date | null;
  dueAt: Date | null;
  createdAt: Date;
}

export type NewOrder = Omit<Order, "id" | "createdAt" | "pausedReason" | "briefingAt" | "dueAt"> & {
  pausedReason?: string | null;
};

export interface Briefing {
  orderId: string;
  handle: string;
  site: string | null;
  whatsapp: string | null;
  whatsappConsent: boolean;
  salesPain: string | null;
  handleCorrections: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface BriefingData {
  handle: string;
  site: string | null;
  whatsapp: string;
  whatsappConsent: boolean;
  salesPain: string;
}

export interface StoredEvent {
  gateway: string;
  eventId: string;
  eventType: string;
  transactionId: string | null;
  payload: unknown;
}

export type NotificationStatus = "enviado" | "simulado" | "falhou";

export type ReceiveBriefingResult = "ok" | "exists";
export type CorrectHandleResult = "ok" | "no_corrections_left" | "no_briefing";

export interface Store {
  /** Grava o evento. Retorna false se ele já tinha sido recebido antes. */
  recordEvent(e: StoredEvent): Promise<boolean>;
  /** Já houve reembolso/estorno registrado para esta transação? */
  hasRefundEvent(gateway: string, transactionId: string, refundTypes: string[]): Promise<boolean>;
  findOrderByTransaction(gateway: string, transactionId: string): Promise<Order | null>;
  /** Busca pelo código da transação em qualquer gateway (página de obrigado). */
  findOrderByTransactionCode(transactionId: string): Promise<Order | null>;
  findOrderByBriefingToken(token: string): Promise<Order | null>;
  /** Cria o pedido. Retorna null se já existir pedido para a mesma transação. */
  createOrder(o: NewOrder): Promise<Order | null>;
  updateOrder(id: string, patch: Partial<Pick<Order, "status" | "pausedReason">>): Promise<void>;

  getBriefing(orderId: string): Promise<Briefing | null>;
  /**
   * Em uma única operação: grava o briefing, muda o pedido para "briefing_recebido",
   * define o prazo e coloca a coleta na fila. Retorna "exists" se já havia briefing.
   */
  receiveBriefing(orderId: string, data: BriefingData, dueAt: Date): Promise<ReceiveBriefingResult>;
  /**
   * Corrige o @ e coloca a coleta na fila de novo. Só uma correção por pedido,
   * exceto quando o pedido está em "erro" (coleta falhou): aí não conta como correção.
   */
  correctHandle(orderId: string, handle: string): Promise<CorrectHandleResult>;

  /** Registra uma tentativa e diz se ainda está dentro do limite. */
  hitRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean>;

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
