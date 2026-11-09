"use client";

import { useActionState } from "react";
import { Aviso } from "@/app/components/Shell";
import { type CorrectionFormState, sendCorrection } from "./actions";

export function CorrectionForm({ token, free }: { token: string; free: boolean }) {
  const [state, action, pending] = useActionState<CorrectionFormState, FormData>(sendCorrection.bind(null, token), {});

  if (state.done) {
    return (
      <Aviso tone="ok">
        Pronto! Vamos analisar o perfil <strong>{state.handle}</strong>. O relatório chega no seu e-mail em alguns minutos.
      </Aviso>
    );
  }

  return (
    <form action={action} className="form correcao">
      <h3>{free ? "Envie o @ de novo" : "Errou o @?"}</h3>
      <p className="pequeno">
        {free
          ? "Confira se o perfil está público e como conta profissional e envie de novo. Este reenvio não conta como correção."
          : "Você pode corrigir o @ uma única vez."}
      </p>
      {state.message && <Aviso tone="erro">{state.message}</Aviso>}
      <label className="campo">
        <span>Instagram correto</span>
        <input name="instagram" placeholder="@seunegocio" autoComplete="off" autoCapitalize="none" spellCheck={false} required />
      </label>
      <button className="botao botao-secundario" type="submit" disabled={pending}>
        {pending ? "Enviando..." : free ? "Enviar de novo" : "Corrigir o @"}
      </button>
    </form>
  );
}
