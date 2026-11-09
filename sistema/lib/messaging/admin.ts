import { emailLayout, escapeHtml } from "@/emails/layout";
import { log } from "@/lib/log";
import type { Mailer } from "./email";

/** Aviso para a Milena. Nunca derruba o processo: se o e-mail falhar, só registra no log. */
export async function notifyAdmin(
  mailer: Mailer,
  adminEmail: string | null | undefined,
  subject: string,
  lines: string[],
  link?: { href: string; label: string },
): Promise<void> {
  if (!adminEmail) {
    log.warn("ADMIN_EMAIL não configurado; aviso não enviado", { assunto: subject });
    return;
  }
  const html = emailLayout(
    subject,
    `<h1 style="font-family:Arial Black,Arial,sans-serif;font-size:20px;margin:0 0 16px">${escapeHtml(subject)}</h1>
     ${lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("")}
     ${link ? `<p><a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a></p>` : ""}`,
  );
  try {
    await mailer.send({
      to: adminEmail,
      subject: `[Raio-X] ${subject}`,
      html,
      text: [...lines, link ? `${link.label}: ${link.href}` : ""].join("\n"),
    });
  } catch (err) {
    log.error("falha ao avisar a admin", { assunto: subject, erro: (err as Error).message });
  }
}
