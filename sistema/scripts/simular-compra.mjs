// Simula a Hotmart chamando o webhook. Uso:
//   npm run simular -- compra        (compra aprovada)
//   npm run simular -- repetir       (envia a mesma compra de novo: não pode duplicar)
//   npm run simular -- reembolso     (reembolsa a compra)
//   npm run simular -- hottok-errado (deve ser recusado)
// Variáveis opcionais: APP_URL (padrão http://localhost:3000), TRANSACAO (padrão HPTESTE0001)

import { readFileSync, existsSync } from "node:fs";

function loadEnvLocal() {
  if (!existsSync(".env.local")) return {};
  return Object.fromEntries(
    readFileSync(".env.local", "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
  );
}

const env = { ...loadEnvLocal(), ...process.env };
const acao = process.argv[2] ?? "compra";
const base = env.SIMULAR_URL ?? "http://localhost:3000";
const transacao = env.TRANSACAO ?? "HPTESTE0001";

const tipos = {
  compra: "PURCHASE_APPROVED",
  repetir: "PURCHASE_APPROVED",
  reembolso: "PURCHASE_REFUNDED",
  "pedido-reembolso": "PURCHASE_PROTEST",
  "hottok-errado": "PURCHASE_APPROVED",
};
const evento = tipos[acao];
if (!evento) {
  console.error(`Ação desconhecida: ${acao}. Use: ${Object.keys(tipos).join(", ")}`);
  process.exit(1);
}

const body = {
  id: `simulado-${evento}-${transacao}`,
  creation_date: Date.now(),
  event: evento,
  version: "2.0.0",
  data: {
    product: { id: Number(env.HOTMART_PRODUCT_ID || 123456), name: "Raio-X de Conversão" },
    buyer: { name: "Cliente Teste", email: env.SIMULAR_EMAIL ?? "teste@exemplo.com", checkout_phone: "11999998888" },
    purchase: { transaction: transacao, status: "APPROVED", approved_date: Date.now(), price: { value: 300, currency_value: "BRL" } },
  },
};

const hottok = acao === "hottok-errado" ? "errado" : env.HOTMART_HOTTOK ?? "";
const res = await fetch(`${base}/api/webhooks/hotmart`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-hotmart-hottok": hottok },
  body: JSON.stringify(body),
});
console.log(`${acao}: HTTP ${res.status}`, await res.text());
