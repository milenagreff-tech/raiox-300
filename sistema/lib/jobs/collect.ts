import { erroColetaEmail } from "@/emails/erro-coleta";
import type { InstagramProvider } from "@/lib/instagram/types";
import { log } from "@/lib/log";
import { notifyAdmin } from "@/lib/messaging/admin";
import type { Mailer } from "@/lib/messaging/email";
import type { Job, Store } from "@/lib/store/types";

export interface JobDeps {
  store: Store;
  mailer: Mailer;
  provider: InstagramProvider;
  appUrl: string;
  adminEmail?: string | null;
  now?: () => Date;
}

export type JobOutcome = "concluido" | "nova_tentativa" | "falhou" | "ignorado";

/** Espera antes de cada nova tentativa: 2 min, 10 min, 30 min. Depois disso, desiste. */
export const RETRY_DELAYS_MIN = [2, 10, 30];
export const MAX_ATTEMPTS = RETRY_DELAYS_MIN.length + 1;

export function retryAt(attempts: number, now: Date): Date | null {
  const delay = RETRY_DELAYS_MIN[attempts - 1];
  return delay === undefined ? null : new Date(now.getTime() + delay * 60_000);
}

export async function runCollectJob(job: Job, deps: JobDeps): Promise<JobOutcome> {
  const now = deps.now?.() ?? new Date();
  const { store } = deps;
  const base = deps.appUrl.replace(/\/$/, "");

  const order = await store.findOrderById(job.orderId);
  const briefing = order ? await store.getBriefing(order.id) : null;
  if (!order || !briefing) {
    await store.failJob(job.id, "pedido ou briefing não encontrado");
    return "falhou";
  }
  if (order.status === "reembolsado" || order.pausedReason) {
    await store.completeJob(job.id);
    return "ignorado";
  }

  const handle = briefing.handle;
  const result = await deps.provider.getInstagramProfile(handle);

  await store.saveCollection({
    orderId: order.id,
    provider: deps.provider.name,
    handle,
    ok: result.ok,
    reason: result.ok ? null : result.reason,
    message: result.ok ? null : result.message,
    raw: result.raw ?? null,
    profile: result.ok ? result.profile : null,
  });

  // Sucesso: próxima etapa é gerar o relatório.
  if (result.ok) {
    await store.enqueueJob(order.id, "gerar_relatorio");
    await store.completeJob(job.id);
    log.info("coleta concluida", { orderId: order.id, posts: result.profile.posts.length });
    return "concluido";
  }

  // Problema no perfil: avisa o cliente (uma vez por @) e a Milena. Não adianta tentar de novo.
  if (result.reason === "nao_encontrado") {
    await store.updateOrder(order.id, { status: "erro" });
    const kind = `erro_coleta:${handle}`;
    if (!(await store.wasNotified(order.id, kind))) {
      try {
        const status = await deps.mailer.send(
          erroColetaEmail({
            to: order.buyerEmail,
            nome: order.buyerName,
            handle,
            briefingUrl: `${base}/briefing/${order.briefingToken}`,
          }),
        );
        await store.recordNotification(order.id, kind, status);
      } catch (err) {
        await store.recordNotification(order.id, kind, "falhou", (err as Error).message);
      }
    }
    await notifyAdmin(deps.mailer, deps.adminEmail, `Não consegui acessar ${handle}`, [
      `Cliente: ${order.buyerName ?? "(sem nome)"} · compra ${order.transactionId}`,
      `Motivo: perfil não encontrado, privado ou conta pessoal (${result.message}).`,
      "O cliente recebeu um e-mail pedindo para conferir o perfil e confirmar o @.",
    ]);
    await store.completeJob(job.id);
    log.warn("perfil inacessivel", { orderId: order.id });
    return "concluido";
  }

  // Erro temporário ou de configuração: tenta de novo mais tarde.
  if (result.reason === "configuracao" && job.attempts === 1) {
    await notifyAdmin(deps.mailer, deps.adminEmail, "Coleta parada: confira o token da Meta", [
      `A coleta do pedido ${order.transactionId} falhou por configuração: ${result.message}`,
      "Provavelmente o token da Meta expirou ou perdeu permissão. Gere um novo token e atualize META_ACCESS_TOKEN na Vercel.",
    ]);
  }

  const next = retryAt(job.attempts, now);
  if (next) {
    await store.retryJob(job.id, `${result.reason}: ${result.message}`, next);
    log.warn("coleta vai tentar de novo", { orderId: order.id, tentativa: job.attempts, motivo: result.reason });
    return "nova_tentativa";
  }

  await store.failJob(job.id, `${result.reason}: ${result.message}`);
  await notifyAdmin(deps.mailer, deps.adminEmail, `Coleta falhou de vez para ${handle}`, [
    `Cliente: ${order.buyerName ?? "(sem nome)"} · compra ${order.transactionId}`,
    `Foram ${job.attempts} tentativas. Último erro: ${result.reason}: ${result.message}`,
    "Confira o pedido no painel e use o botão de regenerar quando o problema estiver resolvido.",
  ]);
  log.error("coleta falhou de vez", { orderId: order.id, motivo: result.reason });
  return "falhou";
}
