import { Resend } from "resend";
import { log } from "@/lib/log";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface Mailer {
  /** Retorna 'enviado' ou 'simulado'. Lança erro se o envio falhar. */
  send(msg: EmailMessage): Promise<"enviado" | "simulado">;
}

/** Não envia nada: só registra no log. Usado com DRY_RUN=true ou sem chave do Resend. */
export class ConsoleMailer implements Mailer {
  sent: EmailMessage[] = [];
  async send(msg: EmailMessage) {
    this.sent.push(msg);
    log.info("email simulado", { subject: msg.subject });
    return "simulado" as const;
  }
}

export class ResendMailer implements Mailer {
  private client: Resend;
  constructor(apiKey: string, private from: string, private replyTo?: string) {
    this.client = new Resend(apiKey);
  }
  async send(msg: EmailMessage) {
    const { error } = await this.client.emails.send({
      from: this.from,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      replyTo: this.replyTo,
    });
    if (error) throw new Error(`Resend: ${error.message}`);
    return "enviado" as const;
  }
}

export function mailerFromEnv(): Mailer {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (process.env.DRY_RUN === "true" || !key || !from) return new ConsoleMailer();
  return new ResendMailer(key, from, process.env.EMAIL_REPLY_TO || undefined);
}
