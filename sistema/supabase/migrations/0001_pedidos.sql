-- Etapa 1: pedidos, eventos de pagamento e registro de envios.
-- Rode este arquivo no Supabase: SQL Editor > New query > colar > Run.

create extension if not exists pgcrypto;

-- Status do pedido ao longo da jornada.
do $$ begin
  create type order_status as enum (
    'pago',
    'briefing_recebido',
    'relatorio_enviado',
    'analise_entregue',
    'erro',
    'reembolsado'
  );
exception when duplicate_object then null; end $$;

create table if not exists orders (
  id               uuid primary key default gen_random_uuid(),
  gateway          text not null,                 -- 'hotmart' (depois 'kiwify', 'asaas')
  transaction_id   text not null,                 -- código da transação no gateway (ex.: HP123...)
  buyer_name       text,
  buyer_email      text not null,
  buyer_phone      text,
  product_id       text,
  product_name     text,
  amount_cents     integer,
  currency         text,
  status           order_status not null default 'pago',
  paused_reason    text,                          -- preenchido quando há pedido de reembolso em análise
  briefing_token   text not null unique,          -- link /briefing/[token]
  report_token     text unique,                   -- link /relatorio/[token] (etapa 4)
  paid_at          timestamptz,
  briefing_at      timestamptz,
  due_at           timestamptz,                   -- prazo da análise aprofundada (3 dias úteis após o briefing)
  delivered_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (gateway, transaction_id)                -- impede pedido duplicado
);

create index if not exists orders_email_idx on orders (lower(buyer_email));
create index if not exists orders_status_idx on orders (status);

-- Cada evento recebido do gateway, uma única vez (idempotência e auditoria).
create table if not exists payment_events (
  id             uuid primary key default gen_random_uuid(),
  gateway        text not null,
  event_id       text not null,
  event_type     text not null,
  transaction_id text,
  payload        jsonb not null,
  received_at    timestamptz not null default now(),
  unique (gateway, event_id)
);

create index if not exists payment_events_tx_idx on payment_events (gateway, transaction_id);

-- Registro de cada e-mail/WhatsApp, para não enviar o mesmo aviso duas vezes.
create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  kind        text not null,                      -- ex.: 'confirmacao_compra'
  channel     text not null default 'email',
  status      text not null,                      -- 'enviado' | 'simulado' | 'falhou'
  error       text,
  created_at  timestamptz not null default now(),
  unique (order_id, kind, channel)
);

-- Atualiza updated_at automaticamente.
create or replace function touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end $$ language plpgsql;

drop trigger if exists orders_touch on orders;
create trigger orders_touch before update on orders
  for each row execute function touch_updated_at();

-- Segurança: ninguém acessa estas tabelas pelo navegador.
-- Só o servidor do app, com a chave secreta (service role), lê e grava.
alter table orders enable row level security;
alter table payment_events enable row level security;
alter table notifications enable row level security;
