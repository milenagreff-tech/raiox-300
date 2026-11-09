"use client";

import { useActionState } from "react";
import { Aviso } from "@/app/components/Shell";
import { findPurchase, type LookupState } from "./actions";

export function LookupForm() {
  const [state, action, pending] = useActionState<LookupState, FormData>(findPurchase, {});
  return (
    <form action={action} className="caixa form">
      {state.message && <Aviso tone="erro">{state.message}</Aviso>}
      <label className="campo">
        <span>E-mail usado na compra</span>
        <input name="email" type="email" autoComplete="email" defaultValue={state.email} required />
      </label>
      <label className="campo">
        <span>Código da compra</span>
        <input
          name="code"
          defaultValue={state.code}
          placeholder="HP1234567890"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          required
        />
        <small>Está no e-mail de confirmação da Hotmart e no nosso e-mail de confirmação.</small>
      </label>
      <button className="botao" type="submit" disabled={pending}>
        {pending ? "Buscando..." : "Abrir meu briefing"}
      </button>
    </form>
  );
}
