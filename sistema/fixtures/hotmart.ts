// Eventos de exemplo da Hotmart (webhook versão 2.0.0), usados nos testes e no simulador.

export function hotmartEvent(
  event: string,
  opts: { id?: string; transaction?: string; productId?: number; email?: string } = {},
) {
  return {
    id: opts.id ?? `evt-${event}-${opts.transaction ?? "HP0001"}`,
    creation_date: 1762700000000,
    event,
    version: "2.0.0",
    data: {
      product: { id: opts.productId ?? 123456, ucode: "abc", name: "Raio-X de Conversão" },
      buyer: {
        name: "Ana Paula Souza",
        email: opts.email ?? "Ana.Teste@exemplo.com",
        checkout_phone: "11999998888",
      },
      purchase: {
        transaction: opts.transaction ?? "HP0001",
        status: event === "PURCHASE_APPROVED" ? "APPROVED" : event.replace("PURCHASE_", ""),
        approved_date: 1762700000000,
        price: { value: 300, currency_value: "BRL" },
      },
    },
  };
}
