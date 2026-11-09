import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { NewOrder, NotificationStatus, Order, Store, StoredEvent } from "./types";

const UNIQUE_VIOLATION = "23505";

type OrderRow = {
  id: string;
  gateway: string;
  transaction_id: string;
  buyer_name: string | null;
  buyer_email: string;
  buyer_phone: string | null;
  product_id: string | null;
  product_name: string | null;
  amount_cents: number | null;
  currency: string | null;
  status: Order["status"];
  paused_reason: string | null;
  briefing_token: string;
  paid_at: string | null;
  created_at: string;
};

function toOrder(r: OrderRow): Order {
  return {
    id: r.id,
    gateway: r.gateway,
    transactionId: r.transaction_id,
    buyerName: r.buyer_name,
    buyerEmail: r.buyer_email,
    buyerPhone: r.buyer_phone,
    productId: r.product_id,
    productName: r.product_name,
    amountCents: r.amount_cents,
    currency: r.currency,
    status: r.status,
    pausedReason: r.paused_reason,
    briefingToken: r.briefing_token,
    paidAt: r.paid_at ? new Date(r.paid_at) : null,
    createdAt: new Date(r.created_at),
  };
}

export class SupabaseStore implements Store {
  constructor(private db: SupabaseClient) {}

  static fromEnv(): SupabaseStore {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar configurados");
    return new SupabaseStore(createClient(url, key, { auth: { persistSession: false } }));
  }

  async recordEvent(e: StoredEvent) {
    const { error } = await this.db.from("payment_events").insert({
      gateway: e.gateway,
      event_id: e.eventId,
      event_type: e.eventType,
      transaction_id: e.transactionId,
      payload: e.payload,
    });
    if (error?.code === UNIQUE_VIOLATION) return false;
    if (error) throw new Error(`payment_events: ${error.message}`);
    return true;
  }

  async hasRefundEvent(gateway: string, transactionId: string, refundTypes: string[]) {
    const { count, error } = await this.db
      .from("payment_events")
      .select("id", { count: "exact", head: true })
      .eq("gateway", gateway)
      .eq("transaction_id", transactionId)
      .in("event_type", refundTypes);
    if (error) throw new Error(`payment_events: ${error.message}`);
    return (count ?? 0) > 0;
  }

  async findOrderByTransaction(gateway: string, transactionId: string) {
    const { data, error } = await this.db
      .from("orders")
      .select("*")
      .eq("gateway", gateway)
      .eq("transaction_id", transactionId)
      .maybeSingle();
    if (error) throw new Error(`orders: ${error.message}`);
    return data ? toOrder(data as OrderRow) : null;
  }

  async createOrder(o: NewOrder) {
    const { data, error } = await this.db
      .from("orders")
      .insert({
        gateway: o.gateway,
        transaction_id: o.transactionId,
        buyer_name: o.buyerName,
        buyer_email: o.buyerEmail,
        buyer_phone: o.buyerPhone,
        product_id: o.productId,
        product_name: o.productName,
        amount_cents: o.amountCents,
        currency: o.currency,
        status: o.status,
        paused_reason: o.pausedReason ?? null,
        briefing_token: o.briefingToken,
        paid_at: o.paidAt?.toISOString() ?? null,
      })
      .select("*")
      .single();
    if (error?.code === UNIQUE_VIOLATION) return null;
    if (error) throw new Error(`orders: ${error.message}`);
    return toOrder(data as OrderRow);
  }

  async updateOrder(id: string, patch: Partial<Pick<Order, "status" | "pausedReason">>) {
    const row: Record<string, unknown> = {};
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.pausedReason !== undefined) row.paused_reason = patch.pausedReason;
    const { error } = await this.db.from("orders").update(row).eq("id", id);
    if (error) throw new Error(`orders: ${error.message}`);
  }

  async wasNotified(orderId: string, kind: string, channel = "email") {
    const { count, error } = await this.db
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("order_id", orderId)
      .eq("kind", kind)
      .eq("channel", channel)
      .neq("status", "falhou");
    if (error) throw new Error(`notifications: ${error.message}`);
    return (count ?? 0) > 0;
  }

  async recordNotification(orderId: string, kind: string, status: NotificationStatus, error: string | null = null, channel = "email") {
    const { error: dbError } = await this.db
      .from("notifications")
      .upsert({ order_id: orderId, kind, channel, status, error }, { onConflict: "order_id,kind,channel" });
    if (dbError) throw new Error(`notifications: ${dbError.message}`);
  }
}
