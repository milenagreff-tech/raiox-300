// Moldura visual dos e-mails, com a identidade da Milena IA.
// E-mail não aceita fontes externas de forma confiável, então usamos fontes de reserva parecidas.

export const brand = {
  turquesa: "#00B4C8",
  rosa: "#E5195E",
  verde: "#3DE82F",
  amarelo: "#FFEA00",
  preto: "#111111",
  offwhite: "#F7F4EC",
};

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function button(href: string, label: string, bg = brand.amarelo): string {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;background:${bg};color:${brand.preto};font-weight:800;text-decoration:none;padding:14px 22px;border:3px solid ${brand.preto};box-shadow:4px 4px 0 ${brand.preto};font-family:Arial Black,Arial,sans-serif;font-size:15px">${escapeHtml(label)}</a>`;
}

export function emailLayout(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;background:${brand.offwhite};color:${brand.preto};font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${brand.offwhite}">
    <tr><td align="center" style="padding:24px 12px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:3px solid ${brand.preto};box-shadow:6px 6px 0 ${brand.preto}">
        <tr><td style="background:${brand.turquesa};padding:18px 24px;border-bottom:3px solid ${brand.preto}">
          <span style="font-family:Arial Black,Arial,sans-serif;font-size:20px;color:${brand.preto}">Milena IA · Raio-X de Conversão</span>
        </td></tr>
        <tr><td style="padding:28px 24px;font-size:16px;line-height:1.55">
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:3px solid ${brand.preto};font-size:12px;color:#555">
          Milena IA · Você recebeu este e-mail porque comprou o Raio-X de Conversão.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
