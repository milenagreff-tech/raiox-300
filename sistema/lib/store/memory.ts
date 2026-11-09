import { randomUUID } from "node:crypto";
import type { NewOrder, NotificationStatus, Order, Store, StoredEvent } from "./types";

// Banco em memória: usado nos testes automáticos e no modo de simulação sem Supabase.
export class MemoryStore implements Store {
  events: StoredEvent[] = [];
  orders: Order[] = [];
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

  async createOrder(o: NewOrder) {
    if (await this.findOrderByTransaction(o.gateway, o.transactionId)) return null;
    const order: Order = { ...o, pausedReason: o.pausedReason ?? null, id: randomUUID(), createdAt: new Date() };
    this.orders.push(order);
    return order;
  }

  async updateOrder(id: string, patch: Partial<Pick<Order, "status" | "pausedReason">>) {
    const o = this.orders.find((x) => x.id === id);
    if (o) Object.assign(o, patch);
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
