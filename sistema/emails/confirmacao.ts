import type { EmailMessage } from "@/lib/messaging/email";
import { brand, button, emailLayout, escapeHtml } from "./layout";

export function confirmacaoCompraEmail(p: {
  to: string;
  nome: string | null;
  briefingUrl: string;
  transactionId: string;
}): EmailMessage {
  const primeiroNome = (p.nome ?? "").trim().split(/\s+/)[0] || "";
  const saudacao = primeiroNome ? `Oi, ${primeiroNome}!` : "Oi!";
  const subject = "Compra confirmada: preencha seu briefing";

  const html = emailLayout(
    subject,
    `
    <h1 style="font-family:Arial Black,Arial,sans-serif;font-size:24px;margin:0 0 16px">${escapeHtml(saudacao)}</h1>
    <p>Seu pagamento do <strong>Raio-X de Conversão</strong> foi confirmado. Obrigada pela confiança!</p>
    <p>Para eu começar, preciso de 4 informações rápidas (leva 2 minutos):</p>
    <ul style="padding-left:20px">
      <li>o @ do seu Instagram (público e profissional);</li>
      <li>o link da sua bio ou site, se tiver;</li>
      <li>seu WhatsApp com DDD;</li>
      <li>o que mais te incomoda nas vendas hoje.</li>
    </ul>
    <p style="margin:28px 0">${button(p.briefingUrl, "Preencher meu briefing")}</p>
    <p>Assim que você enviar, a primeira parte da sua análise chega neste e-mail em alguns minutos. A análise aprofundada eu entrego em até 3 dias úteis.</p>
    <p style="background:${brand.offwhite};border:2px solid ${brand.preto};padding:12px;font-size:14px">
      Código da sua compra: <strong>${escapeHtml(p.transactionId)}</strong><br>
      Guarde este código. Ele também é pedido na página de obrigado.
    </p>
    <p>Um abraço,<br><strong>Milena</strong></p>`,
  );

  const text = [
    saudacao,
    "",
    "Seu pagamento do Raio-X de Conversão foi confirmado. Obrigada pela confiança!",
    "",
    "Preencha seu briefing (leva 2 minutos):",
    p.briefingUrl,
    "",
    "Assim que você enviar, a primeira parte da sua análise chega neste e-mail em alguns minutos. A análise aprofundada eu entrego em até 3 dias úteis.",
    "",
    `Código da sua compra: ${p.transactionId}`,
    "",
    "Um abraço,",
    "Milena",
  ].join("\n");

  return { to: p.to, subject, html, text };
}
