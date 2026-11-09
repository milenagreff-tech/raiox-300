import type { Metadata } from "next";
import { Shell } from "@/app/components/Shell";

export const metadata: Metadata = { title: "Política de privacidade · Milena IA" };

const CONTATO = "eu@milena.ia.br";

export default function PrivacidadePage() {
  return (
    <Shell>
      <article className="caixa texto-longo">
        <h1>Política de privacidade</h1>
        <p className="pequeno">Raio-X de Conversão · Milena IA · Atualizada em novembro de 2026</p>

        <h2>Quem cuida dos seus dados</h2>
        <p>
          A Milena IA é responsável pelos dados tratados no Raio-X de Conversão. Para qualquer assunto sobre os seus
          dados, escreva para <a href={`mailto:${CONTATO}`}>{CONTATO}</a>.
        </p>

        <h2>Quais dados usamos</h2>
        <ul>
          <li>Da compra (enviados pela plataforma de pagamento): nome, e-mail, telefone, código da compra e valor.</li>
          <li>Do briefing: o @ do Instagram, o link da bio ou site, o WhatsApp e a sua resposta sobre vendas.</li>
          <li>
            Do Instagram: <strong>apenas dados públicos</strong> do perfil informado, como nome, bio, link da bio,
            número de seguidores e de publicações, e as publicações recentes (legenda, data, curtidas e comentários).
            Não acessamos mensagens, senhas nem dados privados.
          </li>
        </ul>

        <h2>Para que usamos</h2>
        <ul>
          <li>Gerar e entregar o relatório automático e a análise aprofundada que você comprou.</li>
          <li>Enviar avisos sobre o seu pedido por e-mail.</li>
          <li>Enviar avisos pelo WhatsApp, somente se você marcar essa opção no briefing.</li>
        </ul>
        <p>
          A base legal é a execução do contrato de compra do Raio-X. O envio pelo WhatsApp depende do seu
          consentimento, que você pode retirar a qualquer momento.
        </p>

        <h2>Com quem compartilhamos</h2>
        <p>
          Usamos fornecedores para operar o serviço: a plataforma de pagamento (Hotmart), a hospedagem do sistema
          (Vercel), o banco de dados (Supabase), o envio de e-mails (Resend), a API oficial da Meta para ler os dados
          públicos do Instagram e a Anthropic (Claude) para ajudar a redigir o relatório. Alguns desses fornecedores
          processam dados fora do Brasil. Não vendemos nem cedemos seus dados para fins de publicidade.
        </p>

        <h2>Por quanto tempo guardamos</h2>
        <p>
          Guardamos os dados por 12 meses depois da compra, para suporte e para eventuais dúvidas sobre a análise.
          Depois disso, eles são apagados. Dados exigidos por lei (como os fiscais) podem ser mantidos pelo prazo legal.
        </p>

        <h2>Seus direitos</h2>
        <p>
          Pela Lei Geral de Proteção de Dados (LGPD), você pode pedir acesso, correção ou exclusão dos seus dados, além
          de informações sobre o uso deles. Para pedir a exclusão, escreva para{" "}
          <a href={`mailto:${CONTATO}`}>{CONTATO}</a> com o e-mail usado na compra. Respondemos em até 15 dias.
        </p>
      </article>
    </Shell>
  );
}
