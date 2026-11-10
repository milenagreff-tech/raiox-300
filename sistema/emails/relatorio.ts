import type { EmailMessage } from "@/lib/messaging/email";
import { type ReportView, SECTION_TITLES } from "@/lib/report/view";
import { brand, button, emailLayout, escapeHtml } from "./layout";

const h2 = (t: string) =>
  `<h2 style="font-family:Arial Black,Arial,sans-serif;font-size:19px;margin:32px 0 12px;padding:6px 10px;background:${brand.turquesa};border:3px solid ${brand.preto};display:inline-block">${escapeHtml(t)}</h2>`;
const p = (t: string) => `<p style="margin:0 0 12px">${escapeHtml(t)}</p>`;
const phraseBox = (t: string) =>
  `<div style="background:${brand.amarelo};border:3px solid ${brand.preto};box-shadow:4px 4px 0 ${brand.preto};padding:14px 16px;font-weight:700;font-size:17px;margin:8px 0 20px">${escapeHtml(t)}</div>`;

export function relatorioEmail(v: ReportView, p2: { to: string; reportUrl: string }): EmailMessage {
  const subject = `Seu Raio-X de Conversão: primeira parte (${v.handle})`;
  const s = v.sections;

  const cards = v.cards
    .map(
      (c) => `<td style="width:50%;padding:6px;vertical-align:top">
        <div style="border:3px solid ${brand.preto};padding:10px;background:#fff">
          <div style="font-size:13px;color:#444">${escapeHtml(c.label)}</div>
          <div style="font-family:Arial Black,Arial,sans-serif;font-size:20px">${escapeHtml(c.value)}</div>
          ${c.note ? `<div style="font-size:12px;color:#555">${escapeHtml(c.note)}</div>` : ""}
        </div></td>`,
    )
    .reduce<string[]>((rows, cell, i) => {
      if (i % 2 === 0) rows.push(cell);
      else rows[rows.length - 1] += cell;
      return rows;
    }, [])
    .map((r) => `<tr>${r}</tr>`)
    .join("");

  const html = emailLayout(
    subject,
    `
    ${phraseBox(v.mandatoryPhrase)}
    <p style="font-size:18px;font-weight:700">${escapeHtml(v.greeting)}</p>
    <p style="font-size:14px;color:#444">${escapeHtml(v.publicDataNotice)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0">${cards}</table>

    ${h2(SECTION_TITLES.retrato)}${s.retrato.map(p).join("")}
    ${h2(SECTION_TITLES.consistencia)}${s.consistencia.map(p).join("")}
    ${h2(SECTION_TITLES.funcionando)}${p(s.funcionando.intro)}
    ${s.funcionando.posts
      .map(
        (b) => `<div style="border:3px solid ${brand.preto};padding:12px;margin:0 0 12px;background:${brand.offwhite}">
          <strong>${escapeHtml(b.label)}</strong> · ${escapeHtml(b.stats)}
          ${b.caption ? `<div style="font-size:14px;color:#444;margin:6px 0">"${escapeHtml(b.caption)}"</div>` : ""}
          <div>${escapeHtml(b.why)}</div>
          ${b.permalink ? `<div style="margin-top:6px"><a href="${escapeHtml(b.permalink)}">Ver o post</a></div>` : ""}
        </div>`,
      )
      .join("")}
    ${h2(SECTION_TITLES.atencao)}
    ${s.atencao.map((a, i) => `<p style="margin:0 0 4px"><strong>${i + 1}. ${escapeHtml(a.title)}</strong></p>${p(a.text)}`).join("")}
    ${h2(SECTION_TITLES.ajuste)}
    <p style="margin:0 0 8px"><strong>${escapeHtml(s.ajuste.title)}</strong></p>
    <ol style="padding-left:20px;margin:0 0 16px">${s.ajuste.steps.map((x) => `<li style="margin:0 0 6px">${escapeHtml(x)}</li>`).join("")}</ol>

    <p style="margin:28px 0">${button(p2.reportUrl, "Ver relatório e baixar PDF")}</p>
    ${phraseBox(v.mandatoryPhrase)}
    <p>Um abraço,<br><strong>Milena</strong></p>`,
  );

  const text = [
    v.mandatoryPhrase,
    "",
    v.greeting,
    v.publicDataNotice,
    "",
    ...v.cards.map((c) => `${c.label}: ${c.value}${c.note ? ` (${c.note})` : ""}`),
    "",
    SECTION_TITLES.retrato,
    ...s.retrato,
    "",
    SECTION_TITLES.consistencia,
    ...s.consistencia,
    "",
    SECTION_TITLES.funcionando,
    s.funcionando.intro,
    ...s.funcionando.posts.map((b) => `${b.label} (${b.stats}): ${b.why}`),
    "",
    SECTION_TITLES.atencao,
    ...s.atencao.map((a, i) => `${i + 1}. ${a.title}: ${a.text}`),
    "",
    SECTION_TITLES.ajuste,
    s.ajuste.title,
    ...s.ajuste.steps.map((x, i) => `${i + 1}) ${x}`),
    "",
    `Relatório completo e PDF: ${p2.reportUrl}`,
    "",
    v.mandatoryPhrase,
    "",
    "Um abraço,",
    "Milena",
  ].join("\n");

  return { to: p2.to, subject, html, text };
}
