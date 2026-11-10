import { randomBytes } from "node:crypto";
import { relatorioEmail } from "@/emails/relatorio";
import { firstName } from "@/lib/briefing/service";
import { log } from "@/lib/log";
import { notifyAdmin } from "@/lib/messaging/admin";
import { computeMetrics } from "@/lib/metrics";
import { ConfigWriterError, generateReportContent, TemporaryWriterError } from "@/lib/report/generate";
import { buildReportView } from "@/lib/report/view";
import type { Job } from "@/lib/store/types";
import { type JobDeps, type JobOutcome, retryAt } from "./collect";

export async function runGenerateReportJob(job: Job, deps: JobDeps): Promise<JobOutcome> {
  const { store } = deps;
  const now = deps.now?.() ?? new Date();
  if (!deps.writerFor) throw new Error("redator do relatório não configurado");

  const order = await store.findOrderById(job.orderId);
  const briefing = order ? await store.getBriefing(order.id) : null;
  const collection = order ? await store.getLatestCollection(order.id, true) : null;
  if (!order || !briefing || !collection?.profile) {
    await store.failJob(job.id, "pedido, briefing ou coleta não encontrados");
    return "falhou";
  }
  if (order.status === "reembolsado" || order.pausedReason) {
    await store.completeJob(job.id);
    return "ignorado";
  }

  const metrics = computeMetrics(collection.profile, now);
  const input = { firstName: firstName(order), salesPain: briefing.salesPain, profile: collection.profile, metrics };
  const writer = deps.writerFor(input);

  let result;
  try {
    result = await generateReportContent(input, writer);
  } catch (err) {
    const message = (err as Error).message;
    if (err instanceof ConfigWriterError && job.attempts === 1) {
      await notifyAdmin(deps.mailer, deps.adminEmail, "Relatório parado: confira a chave da Anthropic", [
        `O relatório da compra ${order.transactionId} não foi gerado: ${message}`,
        "Confira a chave ANTHROPIC_API_KEY na Vercel e se há crédito em console.anthropic.com.",
      ]);
    }
    const next = err instanceof TemporaryWriterError || err instanceof ConfigWriterError ? retryAt(job.attempts, now) : null;
    if (next) {
      await store.retryJob(job.id, message, next);
      return "nova_tentativa";
    }
    await store.failJob(job.id, message);
    await notifyAdmin(deps.mailer, deps.adminEmail, `Relatório não foi gerado para ${briefing.handle}`, [
      `Compra ${order.transactionId}. Erro: ${message}`,
      "Use o botão de regenerar no painel quando o problema estiver resolvido.",
    ]);
    log.error("geracao do relatorio falhou", { orderId: order.id, erro: message });
    return "falhou";
  }

  const usage = { tentativas: result.attempts, chamadas: result.usage };

  // A revisão automática barrou duas vezes: não envia, a Milena revisa.
  if (!result.ok) {
    await store.saveReport({ orderId: order.id, status: "revisar", metrics, content: result.content, problems: result.problems, writer: writer.name, usage });
    await notifyAdmin(deps.mailer, deps.adminEmail, `Relatório de ${briefing.handle} precisa de revisão`, [
      `A revisão automática barrou o texto duas vezes: ${result.problems.join("; ")}.`,
      "O relatório NÃO foi enviado ao cliente. Abra o pedido no painel para revisar ou regenerar.",
    ]);
    await store.completeJob(job.id);
    log.warn("relatorio barrado pela revisao", { orderId: order.id });
    return "concluido";
  }

  await store.ensureReportToken(order.id, randomBytes(24).toString("base64url"));
  await store.saveReport({ orderId: order.id, status: "pronto", metrics, content: result.content, problems: null, writer: writer.name, usage });
  await store.enqueueJob(order.id, "enviar_relatorio");
  await store.completeJob(job.id);
  log.info("relatorio gerado", { orderId: order.id, tentativas: result.attempts });
  return "concluido";
}

export async function runSendReportJob(job: Job, deps: JobDeps): Promise<JobOutcome> {
  const { store } = deps;
  const now = deps.now?.() ?? new Date();
  const order = await store.findOrderById(job.orderId);
  const briefing = order ? await store.getBriefing(order.id) : null;
  const report = order ? await store.getLatestReport(order.id) : null;
  if (!order || !briefing || !report || !order.reportToken) {
    await store.failJob(job.id, "pedido, relatório ou link não encontrados");
    return "falhou";
  }
  if (order.status === "reembolsado" || order.pausedReason || report.status !== "pronto") {
    await store.completeJob(job.id);
    return "ignorado";
  }

  const kind = `relatorio_v${report.version}`;
  if (!(await store.wasNotified(order.id, kind))) {
    const reportUrl = `${deps.appUrl.replace(/\/$/, "")}/relatorio/${order.reportToken}`;
    const msg = relatorioEmail(buildReportView(report, briefing.handle), { to: order.buyerEmail, reportUrl });
    try {
      const status = await deps.mailer.send(msg);
      await store.recordNotification(order.id, kind, status);
    } catch (err) {
      const message = (err as Error).message;
      await store.recordNotification(order.id, kind, "falhou", message);
      const next = retryAt(job.attempts, now);
      if (next) {
        await store.retryJob(job.id, message, next);
        return "nova_tentativa";
      }
      await store.failJob(job.id, message);
      await notifyAdmin(deps.mailer, deps.adminEmail, `E-mail do relatório não saiu para ${briefing.handle}`, [
        `Compra ${order.transactionId}. Erro: ${message}`,
        `O relatório está pronto na página: ${reportUrl}`,
      ]);
      return "falhou";
    }
  }

  await store.markReportSent(report.id);
  if (order.status === "briefing_recebido" || order.status === "erro") {
    await store.updateOrder(order.id, { status: "relatorio_enviado" });
  }
  await store.completeJob(job.id);
  log.info("relatorio enviado", { orderId: order.id, versao: report.version });
  return "concluido";
}
