# Raio-X de Conversão: sistema de entrega

Sistema que recebe o pagamento, coleta o briefing, gera a primeira parte da análise e controla o prazo da análise aprofundada.

A página de vendas (`index.html` na raiz do repositório) não é afetada por esta pasta.

## Comandos (dentro da pasta `sistema/`)

- `npm run dev`: abre o sistema em http://localhost:3000
- `npm test`: roda os testes automáticos
- `npm run simular -- compra`: imita a Hotmart enviando uma compra (também: `repetir`, `reembolso`, `pedido-reembolso`, `hottok-errado`)

## Configuração

Copie `.env.example` para `.env.local` e preencha. Com `DRY_RUN=true`, nada é enviado de verdade e nenhum crédito é gasto.

O banco é criado rodando os arquivos de `supabase/migrations/` no SQL Editor do Supabase, em ordem.
