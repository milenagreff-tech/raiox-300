"use client";

import { useActionState } from "react";
import { Aviso } from "@/app/components/Shell";
import { type BriefingFormState, sendBriefing } from "./actions";

export const DISCLAIMER =
  "Para gerar sua análise, seu perfil do Instagram precisa estar público e configurado como conta profissional (Empresa ou Criador de conteúdo). Usamos apenas dados públicos do perfil. Cada compra dá direito à análise de um único perfil.";

export function BriefingForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<BriefingFormState, FormData>(sendBriefing.bind(null, token), {});

  if (state.done) {
    return (
      <div className="caixa">
        <h2>Recebido!</h2>
        <p className="destaque">
          Estamos preparando o seu relatório. Ele chega no seu e-mail em alguns minutos.
        </p>
        <p>
          A análise aprofundada, com link da bio, atendimento e funil, chega até <strong>{state.deadline}</strong>.
        </p>
        <p className="pequeno">Pode fechar esta página.</p>
      </div>
    );
  }

  const v = state.values ?? {};
  const e = state.errors ?? {};

  return (
    <form action={action} className="caixa form" noValidate>
      {state.message && <Aviso tone="erro">{state.message}</Aviso>}

      <Aviso>{DISCLAIMER}</Aviso>

      <label className="campo">
        <span>Instagram (o @ ou o link do perfil) *</span>
        <input
          name="instagram"
          defaultValue={v.instagram}
          placeholder="@seunegocio"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          required
          aria-invalid={!!e.instagram}
        />
        {e.instagram && <small className="erro">{e.instagram}</small>}
      </label>

      <label className="campo">
        <span>Link da bio ou site (opcional)</span>
        <input name="site" defaultValue={v.site} placeholder="linktr.ee/seunegocio" inputMode="url" aria-invalid={!!e.site} />
        {e.site && <small className="erro">{e.site}</small>}
      </label>

      <label className="campo">
        <span>WhatsApp com DDD *</span>
        <input
          name="whatsapp"
          defaultValue={v.whatsapp}
          placeholder="(11) 99999-8888"
          inputMode="tel"
          autoComplete="tel"
          required
          aria-invalid={!!e.whatsapp}
        />
        {e.whatsapp && <small className="erro">{e.whatsapp}</small>}
      </label>

      <label className="check">
        <input type="checkbox" name="whatsappConsent" />
        <span>Aceito receber o link do meu relatório e avisos sobre a análise pelo WhatsApp.</span>
      </label>

      <label className="campo">
        <span>O que mais te incomoda nas vendas hoje? *</span>
        <textarea name="salesPain" defaultValue={v.salesPain} rows={4} maxLength={1000} required aria-invalid={!!e.salesPain} />
        {e.salesPain && <small className="erro">{e.salesPain}</small>}
      </label>

      <p className="pequeno">
        Ao enviar, você concorda com a nossa <a href="/privacidade">política de privacidade</a>.
      </p>

      <button className="botao" type="submit" disabled={pending}>
        {pending ? "Enviando..." : "Enviar e receber meu relatório"}
      </button>
    </form>
  );
}
