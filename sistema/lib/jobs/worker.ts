import { getInstagramProvider } from "@/lib/instagram/provider";
import { log } from "@/lib/log";
import { mailerFromEnv } from "@/lib/messaging/email";
import { getStore } from "@/lib/store";
import type { Job } from "@/lib/store/types";
import { createDryRunWriter } from "@/lib/report/dryrun";
import { createClaudeWriter } from "@/lib/report/generate";
import { type JobDeps, type JobOutcome, runCollectJob } from "./collect";
import { runGenerateReportJob, runSendReportJob } from "./report";

export type JobHandler = (job: Job, deps: JobDeps) => Promise<JobOutcome>;

/** Tarefas que este sistema sabe executar. */
export const HANDLERS: Record<string, JobHandler> = {
  coletar: runCollectJob,
  gerar_relatorio: runGenerateReportJob,
  enviar_relatorio: runSendReportJob,
};

export function depsFromEnv(): JobDeps {
  return {
    store: getStore(),
    mailer: mailerFromEnv(),
    provider: getInstagramProvider(),
    appUrl: process.env.APP_URL ?? "http://localhost:3000",
    adminEmail: process.env.ADMIN_EMAIL,
    writerFor: (input) =>
      process.env.DRY_RUN === "true" ? createDryRunWriter(input) : createClaudeWriter(process.env.ANTHROPIC_API_KEY),
  };
}

/**
 * Processa a fila. Com orderId, só as tarefas daquele pedido (usado logo após o briefing);
 * sem orderId, as próximas tarefas de qualquer pedido (usado pela rotina agendada).
 * Repete enquanto houver tarefas novas (ex.: coletar gera "gerar_relatorio").
 */
export async function runJobs(
  deps: JobDeps,
  opts: { orderId?: string; maxJobs?: number; handlers?: Record<string, JobHandler> } = {},
): Promise<{ id: string; type: string; outcome: JobOutcome | "erro_interno" }[]> {
  const handlers = opts.handlers ?? HANDLERS;
  const types = Object.keys(handlers);
  const maxJobs = opts.maxJobs ?? 10;
  const done: { id: string; type: string; outcome: JobOutcome | "erro_interno" }[] = [];

  while (done.length < maxJobs) {
    const [job] = await deps.store.claimJobs(types, 1, opts.orderId);
    if (!job) break;
    try {
      const outcome = await handlers[job.type](job, deps);
      done.push({ id: job.id, type: job.type, outcome });
    } catch (err) {
      // Erro inesperado no código: devolve para a fila com espera, para não travar.
      const message = (err as Error).message;
      log.error("erro interno ao processar tarefa", { jobId: job.id, tipo: job.type, erro: message });
      await deps.store.retryJob(job.id, `erro interno: ${message}`, new Date(Date.now() + 10 * 60_000)).catch(() => {});
      done.push({ id: job.id, type: job.type, outcome: "erro_interno" });
    }
  }
  return done;
}
