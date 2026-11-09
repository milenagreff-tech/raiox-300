import type { Metadata } from "next";
import { Aviso, Shell } from "@/app/components/Shell";
import { formatDeadline } from "@/lib/business-days";
import { loadBriefingPage, MSG } from "@/lib/briefing/service";
import { getStore } from "@/lib/store";
import { BriefingForm } from "./BriefingForm";
import { CorrectionForm } from "./CorrectionForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Seu briefing · Raio-X de Conversão",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function BriefingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const state = await loadBriefingPage(getStore(), token);

  if (state.kind === "nao_encontrado" || state.kind === "reembolsado" || state.kind === "pausado") {
    const msg = state.kind === "reembolsado" ? MSG.refunded : state.kind === "pausado" ? MSG.paused : MSG.notFound;
    return (
      <Shell>
        <div className="caixa">
          <h1>Briefing</h1>
          <Aviso tone="erro">{msg}</Aviso>
        </div>
      </Shell>
    );
  }

  if (state.kind === "formulario") {
    return (
      <Shell withPhoto>
        <h1>{state.firstName ? `${state.firstName}, falta pouco!` : "Falta pouco!"}</h1>
        <p className="intro">
          Preencha as informações abaixo (leva 2 minutos). Assim que você enviar, a primeira parte da sua análise chega
          no seu e-mail em alguns minutos.
        </p>
        <BriefingForm token={token} />
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="caixa">
        <h1>Briefing recebido</h1>
        {state.collectFailed ? (
          <Aviso tone="erro">
            Não conseguimos acessar o perfil <strong>{state.handle}</strong>. Confira se ele está público e configurado
            como conta profissional, ou envie o @ correto abaixo.
          </Aviso>
        ) : (
          <p>
            Perfil analisado: <strong>{state.handle}</strong>. O relatório automático chega no seu e-mail.
            {state.dueAt && (
              <>
                {" "}
                A análise aprofundada chega até <strong>{formatDeadline(state.dueAt)}</strong>.
              </>
            )}
          </p>
        )}
        {state.canCorrect && <CorrectionForm token={token} free={state.collectFailed} />}
      </div>
    </Shell>
  );
}
