import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  Briefing,
  BriefingData,
  CollectionRecord,
  CorrectHandleResult,
  Job,
  NewReport,
  Report,
  ReportStatus,
  NewOrder,
  NotificationStatus,
  Order,
  ReceiveBriefingResult,
  Store,
  StoredEvent,
} from "./types";

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
  briefing_at: string | null;
  due_at: string | null;
  report_token: string | null;
  created_at: string;
};

type ReportRow = {
  id: string;
  order_id: string;
  version: number;
  status: ReportStatus;
  metrics: Report["metrics"];
  content: Report["content"];
  problems: string[] | null;
  writer: string;
  usage: unknown;
  created_at: string;
  sent_at: string | null;
};

function toReport(r: ReportRow): Report {
  return {
    id: r.id,
    orderId: r.order_id,
    version: r.version,
    status: r.status,
    metrics: r.metrics,
    content: r.content,
    problems: r.problems,
    writer: r.writer,
    usage: r.usage,
    createdAt: new Date(r.created_at),
    sentAt: r.sent_at ? new Date(r.sent_at) : null,
  };
}

type JobRow = {
  id: string;
  order_id: string;
  type: string;
  status: Job["status"];
  attempts: number;
  run_after: string;
  last_error: string | null;
};

type CollectionRow = {
  order_id: string;
  provider: string;
  handle: string;
  ok: boolean;
  reason: string | null;
  message: string | null;
  raw: unknown;
  profile: CollectionRecord["profile"];
  created_at: string;
};

type BriefingRow = {
  order_id: string;
  instagram_handle: string;
  site: string | null;
  whatsapp: string | null;
  whatsapp_consent: boolean;
  sales_pain: string | null;
  handle_corrections: number;
  created_at: string;
  updated_at: string;
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
    briefingAt: r.briefing_at ? new Date(r.briefing_at) : null,
    dueAt: r.due_at ? new Date(r.due_at) : null,
    reportToken: r.report_token,
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

  private async findOrderBy(column: string, value: string) {
    const { data, error } = await this.db.from("orders").select("*").eq(column, value).maybeSingle();
    if (error) throw new Error(`orders: ${error.message}`);
    return data ? toOrder(data as OrderRow) : null;
  }

  async findOrderByTransactionCode(transactionId: string) {
    return this.findOrderBy("transaction_id", transactionId);
  }

  async findOrderByBriefingToken(token: string) {
    return this.findOrderBy("briefing_token", token);
  }

  async findOrderById(id: string) {
    return this.findOrderBy("id", id);
  }

  async findOrderByReportToken(token: string) {
    return this.findOrderBy("report_token", token);
  }

  async ensureReportToken(orderId: string, newToken: string) {
    const { error } = await this.db.from("orders").update({ report_token: newToken }).eq("id", orderId).is("report_token", null);
    if (error) throw new Error(`orders: ${error.message}`);
    const o = await this.findOrderById(orderId);
    if (!o?.reportToken) throw new Error("não foi possível definir o link do relatório");
    return o.reportToken;
  }

  async saveReport(r: NewReport) {
    // Tenta a próxima versão; se duas gerações rodarem juntas, a restrição única evita versão repetida.
    for (let i = 0; i < 3; i++) {
      const latest = await this.getLatestReport(r.orderId);
      const { data, error } = await this.db
        .from("reports")
        .insert({
          order_id: r.orderId,
          version: (latest?.version ?? 0) + 1,
          status: r.status,
          metrics: r.metrics,
          content: r.content,
          problems: r.problems,
          writer: r.writer,
          usage: r.usage,
        })
        .select("*")
        .single();
      if (error?.code === UNIQUE_VIOLATION) continue;
      if (error) throw new Error(`reports: ${error.message}`);
      return toReport(data as ReportRow);
    }
    throw new Error("reports: conflito ao gravar a versão");
  }

  async getLatestReport(orderId: string, statuses?: ReportStatus[]) {
    let q = this.db.from("reports").select("*").eq("order_id", orderId);
    if (statuses) q = q.in("status", statuses);
    const { data, error } = await q.order("version", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error(`reports: ${error.message}`);
    return data ? toReport(data as ReportRow) : null;
  }

  async markReportSent(reportId: string) {
    const { error } = await this.db.from("reports").update({ status: "enviado", sent_at: new Date().toISOString() }).eq("id", reportId);
    if (error) throw new Error(`reports: ${error.message}`);
  }

  async enqueueJob(orderId: string, type: string, runAfter: Date = new Date()) {
    const { error } = await this.db.rpc("enqueue_job", {
      p_order_id: orderId,
      p_type: type,
      p_run_after: runAfter.toISOString(),
    });
    if (error) throw new Error(`enqueue_job: ${error.message}`);
  }

  async claimJobs(types: string[], limit: number, orderId?: string): Promise<Job[]> {
    const { data, error } = await this.db.rpc("claim_jobs", {
      p_types: types,
      p_limit: limit,
      p_order_id: orderId ?? null,
    });
    if (error) throw new Error(`claim_jobs: ${error.message}`);
    return ((data ?? []) as JobRow[]).map((r) => ({
      id: r.id,
      orderId: r.order_id,
      type: r.type,
      status: r.status,
      attempts: r.attempts,
      runAfter: new Date(r.run_after),
      lastError: r.last_error,
    }));
  }

  private async updateJob(id: string, row: Record<string, unknown>) {
    const { error } = await this.db.from("jobs").update(row).eq("id", id);
    if (error) throw new Error(`jobs: ${error.message}`);
  }

  async completeJob(id: string) {
    await this.updateJob(id, { status: "concluido", last_error: null });
  }

  async retryJob(id: string, err: string, runAfter: Date) {
    await this.updateJob(id, { status: "pendente", last_error: err.slice(0, 1000), run_after: runAfter.toISOString() });
  }

  async failJob(id: string, err: string) {
    await this.updateJob(id, { status: "falhou", last_error: err.slice(0, 1000) });
  }

  async saveCollection(c: CollectionRecord) {
    const { error } = await this.db.from("collections").insert({
      order_id: c.orderId,
      provider: c.provider,
      handle: c.handle,
      ok: c.ok,
      reason: c.reason,
      message: c.message,
      raw: c.raw ?? null,
      profile: c.profile,
    });
    if (error) throw new Error(`collections: ${error.message}`);
  }

  async getLatestCollection(orderId: string, onlyOk = false) {
    let q = this.db.from("collections").select("*").eq("order_id", orderId);
    if (onlyOk) q = q.eq("ok", true);
    const { data, error } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error(`collections: ${error.message}`);
    if (!data) return null;
    const r = data as CollectionRow;
    return {
      orderId: r.order_id,
      provider: r.provider,
      handle: r.handle,
      ok: r.ok,
      reason: r.reason,
      message: r.message,
      raw: r.raw,
      profile: r.profile,
      createdAt: new Date(r.created_at),
    };
  }

  async getBriefing(orderId: string): Promise<Briefing | null> {
    const { data, error } = await this.db.from("briefings").select("*").eq("order_id", orderId).maybeSingle();
    if (error) throw new Error(`briefings: ${error.message}`);
    if (!data) return null;
    const r = data as BriefingRow;
    return {
      orderId: r.order_id,
      handle: r.instagram_handle,
      site: r.site,
      whatsapp: r.whatsapp,
      whatsappConsent: r.whatsapp_consent,
      salesPain: r.sales_pain,
      handleCorrections: r.handle_corrections,
      createdAt: new Date(r.created_at),
      updatedAt: new Date(r.updated_at),
    };
  }

  async receiveBriefing(orderId: string, d: BriefingData, dueAt: Date): Promise<ReceiveBriefingResult> {
    const { data, error } = await this.db.rpc("receive_briefing", {
      p_order_id: orderId,
      p_handle: d.handle,
      p_site: d.site,
      p_whatsapp: d.whatsapp,
      p_consent: d.whatsappConsent,
      p_pain: d.salesPain,
      p_due_at: dueAt.toISOString(),
    });
    if (error) throw new Error(`receive_briefing: ${error.message}`);
    return data as ReceiveBriefingResult;
  }

  async correctHandle(orderId: string, handle: string): Promise<CorrectHandleResult> {
    const { data, error } = await this.db.rpc("correct_handle", { p_order_id: orderId, p_handle: handle });
    if (error) throw new Error(`correct_handle: ${error.message}`);
    return data as CorrectHandleResult;
  }

  async hitRateLimit(key: string, limit: number, windowSeconds: number) {
    const { data, error } = await this.db.rpc("hit_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) throw new Error(`hit_rate_limit: ${error.message}`);
    return data === true;
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
