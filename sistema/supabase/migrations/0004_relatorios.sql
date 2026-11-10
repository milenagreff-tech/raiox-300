-- Etapa 4: relatórios gerados.
-- Rode depois do 0003: SQL Editor > New query > colar > Run.

create table if not exists reports (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  version     integer not null,
  status      text not null check (status in ('pronto', 'enviado', 'revisar')),
  metrics     jsonb not null,
  content     jsonb,
  problems    jsonb,               -- motivos, quando a revisão automática barrou o texto
  writer      text not null,       -- 'claude' ou 'simulacao'
  usage       jsonb,               -- modelo e tokens usados (para acompanhar o custo)
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  unique (order_id, version)
);
create index if not exists reports_order_idx on reports (order_id, version desc);
alter table reports enable row level security;
