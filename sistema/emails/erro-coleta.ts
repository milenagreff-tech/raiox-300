import type { EmailMessage } from "@/lib/messaging/email";
import { button, emailLayout, escapeHtml } from "./layout";

export function erroColetaEmail(p: { to: string; nome: string | null; handle: string; briefingUrl: string }): EmailMessage {
  const primeiroNome = (p.nome ?? "").trim().split(/\s+/)[0] || "";
  const saudacao = primeiroNome ? `Oi, ${primeiroNome}!` : "Oi!";
  const subject = "Não consegui acessar seu perfil do Instagram";

  const html = emailLayout(
    subject,
    `
    <h1 style="font-family:Arial Black,Arial,sans-serif;font-size:22px;margin:0 0 16px">${escapeHtml(saudacao)}</h1>
    <p>Tentei acessar o perfil <strong>${escapeHtml(p.handle)}</strong> para preparar a primeira parte da sua análise, mas não consegui.</p>
    <p>Isso costuma acontecer por um destes motivos:</p>
    <ul style="padding-left:20px">
      <li>o perfil está <strong>privado</strong>;</li>
      <li>o perfil é uma <strong>conta pessoal</strong> (precisa ser conta profissional: Empresa ou Criador de conteúdo);</li>
      <li>o @ foi digitado com algum erro.</li>
    </ul>
    <p><strong>Como mudar para conta profissional</strong> (grátis, leva 1 minuto): no Instagram, toque em Configurações, depois em "Tipo de conta e ferramentas" e em "Mudar para conta profissional".</p>
    <p>Depois é só confirmar o @ no botão abaixo. Esse reenvio não conta como correção.</p>
    <p style="margin:28px 0">${button(p.briefingUrl, "Confirmar meu @")}</p>
    <p>Se tiver qualquer dúvida, é só responder este e-mail.</p>
    <p>Um abraço,<br><strong>Milena</strong></p>`,
  );

  const text = [
    saudacao,
    "",
    `Tentei acessar o perfil ${p.handle} para preparar a primeira parte da sua análise, mas não consegui.`,
    "",
    "Isso costuma acontecer quando o perfil está privado, é uma conta pessoal (precisa ser conta profissional: Empresa ou Criador de conteúdo) ou o @ foi digitado com erro.",
    "",
    'Para mudar para conta profissional: Configurações > "Tipo de conta e ferramentas" > "Mudar para conta profissional".',
    "",
    "Depois, confirme o @ aqui (não conta como correção):",
    p.briefingUrl,
    "",
    "Um abraço,",
    "Milena",
  ].join("\n");

  return { to: p.to, subject, html, text };
}
