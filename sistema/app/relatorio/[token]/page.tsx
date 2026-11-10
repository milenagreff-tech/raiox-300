import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getStore } from "@/lib/store";
import { buildReportView, SECTION_TITLES } from "@/lib/report/view";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Seu Raio-X de Conversão · Milena IA",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default async function RelatorioPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) notFound();
  const store = getStore();
  const order = await store.findOrderByReportToken(token);
  if (!order || order.status === "reembolsado") notFound();
  const report = await store.getLatestReport(order.id, ["pronto", "enviado"]);
  const briefing = await store.getBriefing(order.id);
  if (!report?.content || !briefing) notFound();

  const v = buildReportView(report, briefing.handle);
  const s = v.sections;

  return (
    <>
      <header className="topo">
        <div className="topo-inner">
          <span className="marca">Milena IA</span>
          <span className="chip chip-amarelo">Raio-X de Conversão</span>
        </div>
      </header>
      <main className="container relatorio">
        <div className="frase-obrigatoria">{v.mandatoryPhrase}</div>

        <div className="rel-cabecalho">
          <div>
            <p className="chip chip-rosa">{v.handle}</p>
            <h1>{v.greeting}</h1>
            <p className="pequeno">
              {v.publicDataNotice} Gerado em {v.generatedAt}.
            </p>
            <PrintButton />
          </div>
          <Image src="/foto-milena.jpg" alt="Milena, da Milena IA" width={1086} height={1448} sizes="140px" className="foto foto-rel" />
        </div>

        <section className="cards">
          {v.cards.map((c) => (
            <div className="card" key={c.label}>
              <span className="card-label">{c.label}</span>
              <strong className="card-valor">{c.value}</strong>
              {c.note && <span className="card-nota">{c.note}</span>}
            </div>
          ))}
        </section>

        <section className="secao">
          <h2>{SECTION_TITLES.retrato}</h2>
          {s.retrato.map((t, i) => <p key={i}>{t}</p>)}
        </section>

        <section className="secao">
          <h2>{SECTION_TITLES.consistencia}</h2>
          {s.consistencia.map((t, i) => <p key={i}>{t}</p>)}
        </section>

        <section className="secao">
          <h2>{SECTION_TITLES.funcionando}</h2>
          <p>{s.funcionando.intro}</p>
          {s.funcionando.posts.map((b) => (
            <div className="post-destaque" key={b.label}>
              <p>
                <strong>{b.label}</strong> · {b.stats}
              </p>
              {b.caption && <blockquote>{b.caption}</blockquote>}
              <p>{b.why}</p>
              {b.permalink && (
                <a href={b.permalink} target="_blank" rel="noopener noreferrer" className="nao-imprimir">
                  Ver o post
                </a>
              )}
            </div>
          ))}
        </section>

        <section className="secao">
          <h2>{SECTION_TITLES.atencao}</h2>
          <ol className="atencao">
            {s.atencao.map((a) => (
              <li key={a.title}>
                <strong>{a.title}</strong>
                <p>{a.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="secao">
          <h2>{SECTION_TITLES.ajuste}</h2>
          <p>
            <strong>{s.ajuste.title}</strong>
          </p>
          <ol>
            {s.ajuste.steps.map((x, i) => <li key={i}>{x}</li>)}
          </ol>
        </section>

        <div className="frase-obrigatoria">{v.mandatoryPhrase}</div>
        <p className="pequeno">Milena IA · Raio-X de Conversão · {v.handle}</p>
      </main>
    </>
  );
}
