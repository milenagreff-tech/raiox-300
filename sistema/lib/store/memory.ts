import { randomUUID } from "node:crypto";
import type {
  Briefing,
  BriefingData,
  CorrectHandleResult,
  NewOrder,
  NotificationStatus,
  Order,
  ReceiveBriefingResult,
  Store,
  StoredEvent,
} from "./types";

export interface MemoryJob {
  id: string;
  orderId: string;
  type: string;
  status: "pendente" | "processando" | "concluido" | "falhou";
}

// Banco em memória: usado nos testes automáticos e no modo de simulação sem Supabase.
export class MemoryStore implements Store {
  events: StoredEvent[] = [];
  orders: Order[] = [];
  briefings: Briefing[] = [];
  jobs: MemoryJob[] = [];
  attempts: { key: string; at: number }[] = [];
  notifications: { orderId: string; kind: string; channel: string; status: NotificationStatus; error: string | null }[] = [];

  async recordEvent(e: StoredEvent) {
    if (this.events.some((x) => x.gateway === e.gateway && x.eventId === e.eventId)) return false;
    this.events.push(e);
    return true;
  }

  async hasRefundEvent(gateway: string, transactionId: string, refundTypes: string[]) {
    return this.events.some(
      (x) => x.gateway === gateway && x.transactionId === transactionId && refundTypes.includes(x.eventType),
    );
  }

  async findOrderByTransaction(gateway: string, transactionId: string) {
    return this.orders.find((o) => o.gateway === gateway && o.transactionId === transactionId) ?? null;
  }

  async findOrderByTransactionCode(transactionId: string) {
    return this.orders.find((o) => o.transactionId === transactionId) ?? null;
  }

  async findOrderByBriefingToken(token: string) {
    return this.orders.find((o) => o.briefingToken === token) ?? null;
  }

  async createOrder(o: NewOrder) {
    if (await this.findOrderByTransaction(o.gateway, o.transactionId)) return null;
    const order: Order = {
      ...o,
      pausedReason: o.pausedReason ?? null,
      briefingAt: null,
      dueAt: null,
      id: randomUUID(),
      createdAt: new Date(),
    };
    this.orders.push(order);
    return order;
  }

  async updateOrder(id: string, patch: Partial<Pick<Order, "status" | "pausedReason">>) {
    const o = this.orders.find((x) => x.id === id);
    if (o) Object.assign(o, patch);
  }

  async getBriefing(orderId: string) {
    return this.briefings.find((b) => b.orderId === orderId) ?? null;
  }

  private enqueue(orderId: string, type: string) {
    const active = this.jobs.some(
      (j) => j.orderId === orderId && j.type === type && (j.status === "pendente" || j.status === "processando"),
    );
    if (!active) this.jobs.push({ id: randomUUID(), orderId, type, status: "pendente" });
  }

  async receiveBriefing(orderId: string, data: BriefingData, dueAt: Date): Promise<ReceiveBriefingResult> {
    if (await this.getBriefing(orderId)) return "exists";
    const now = new Date();
    this.briefings.push({ orderId, ...data, handleCorrections: 0, createdAt: now, updatedAt: now });
    const o = this.orders.find((x) => x.id === orderId);
    if (o && o.status === "pago") Object.assign(o, { status: "briefing_recebido", briefingAt: now, dueAt });
    this.enqueue(orderId, "coletar");
    return "ok";
  }

  async correctHandle(orderId: string, handle: string): Promise<CorrectHandleResult> {
    const b = await this.getBriefing(orderId);
    if (!b) return "no_briefing";
    const o = this.orders.find((x) => x.id === orderId);
    const free = o?.status === "erro";
    if (!free && b.handleCorrections >= 1) return "no_corrections_left";
    b.handle = handle;
    if (!free) b.handleCorrections += 1;
    b.updatedAt = new Date();
    if (o && o.status === "erro") o.status = "briefing_recebido";
    this.enqueue(orderId, "coletar");
    return "ok";
  }

  async hitRateLimit(key: string, limit: number, windowSeconds: number) {
    const since = Date.now() - windowSeconds * 1000;
    const recent = this.attempts.filter((a) => a.key === key && a.at >= since).length;
    this.attempts.push({ key, at: Date.now() });
    return recent < limit;
  }

  async wasNotified(orderId: string, kind: string, channel = "email") {
    return this.notifications.some(
      (n) => n.orderId === orderId && n.kind === kind && n.channel === channel && n.status !== "falhou",
    );
  }

  async recordNotification(orderId: string, kind: string, status: NotificationStatus, error: string | null = null, channel = "email") {
    const i = this.notifications.findIndex((n) => n.orderId === orderId && n.kind === kind && n.channel === channel);
    const row = { orderId, kind, channel, status, error };
    if (i >= 0) this.notifications[i] = row;
    else this.notifications.push(row);
  }
}
