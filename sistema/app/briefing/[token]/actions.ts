"use server";

import { after } from "next/server";
import { formatDeadline } from "@/lib/business-days";
import { depsFromEnv, runJobs } from "@/lib/jobs/worker";
import { submitBriefing, submitCorrection } from "@/lib/briefing/service";
import type { FieldErrors } from "@/lib/briefing/validate";
import { log } from "@/lib/log";
import { getStore } from "@/lib/store";

export interface BriefingFormState {
  done?: boolean;
  deadline?: string;
  message?: string;
  errors?: FieldErrors;
  values?: Record<string, string>;
}

/** Depois de responder à cliente, processa a fila daquele pedido (coleta e, depois, relatório). */
function processLater(orderId: string) {
  after(async () => {
    try {
      await runJobs(depsFromEnv(), { orderId, maxJobs: 5 });
    } catch (err) {
      log.error("erro ao processar após o briefing", { orderId, erro: (err as Error).message });
    }
  });
}

const GENERIC_ERROR = "Não conseguimos salvar agora. Tente de novo em alguns instantes.";

function field(fd: FormData, name: string, max = 2000): string {
  return String(fd.get(name) ?? "").slice(0, max);
}

export async function sendBriefing(token: string, _prev: BriefingFormState, fd: FormData): Promise<BriefingFormState> {
  const values = {
    instagram: field(fd, "instagram", 300),
    site: field(fd, "site", 400),
    whatsapp: field(fd, "whatsapp", 40),
    salesPain: field(fd, "salesPain", 1200),
  };
  try {
    const r = await submitBriefing(getStore(), token, {
      ...values,
      whatsappConsent: fd.get("whatsappConsent") === "on",
    });
    if (r.ok) {
      processLater(r.orderId);
      return { done: true, deadline: formatDeadline(r.dueAt) };
    }
    return { message: r.message, errors: r.errors, values };
  } catch (err) {
    log.error("erro ao salvar briefing", { erro: (err as Error).message });
    return { message: GENERIC_ERROR, values };
  }
}

export interface CorrectionFormState {
  done?: boolean;
  handle?: string;
  message?: string;
}

export async function sendCorrection(token: string, _prev: CorrectionFormState, fd: FormData): Promise<CorrectionFormState> {
  try {
    const r = await submitCorrection(getStore(), token, field(fd, "instagram", 300));
    if (!r.ok) return { message: r.message };
    processLater(r.orderId);
    return { done: true, handle: r.handle };
  } catch (err) {
    log.error("erro ao corrigir @", { erro: (err as Error).message });
    return { message: GENERIC_ERROR };
  }
}
