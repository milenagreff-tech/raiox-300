import type { Metadata } from "next";
import { Shell } from "@/app/components/Shell";
import { LookupForm } from "./LookupForm";

export const metadata: Metadata = {
  title: "Obrigada pela compra · Raio-X de Conversão",
  robots: { index: false, follow: false },
};

export default function ObrigadoPage() {
  return (
    <Shell withPhoto>
      <h1>Obrigada pela compra!</h1>
      <p className="intro">
        Seu Raio-X de Conversão começa agora. Informe o e-mail da compra e o código da transação para abrir o seu
        briefing. Se preferir, use o botão do e-mail de confirmação que acabamos de enviar.
      </p>
      <LookupForm />
    </Shell>
  );
}
