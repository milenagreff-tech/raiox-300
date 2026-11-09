-- Etapa 2: briefing, fila de processamento e limite de tentativas.
-- Rode depois do 0001: SQL Editor > New query > colar > Run.

create table if not exists briefings (
  order_id            uuid primary key references orders(id) on delete cascade,  -- um briefing por pedido
  instagram_handle    text not null,
  site                text,
  whatsapp            text,
  whatsapp_consent    boolean not null default false,
  sales_pain          text,
  handle_corrections  integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Fila de tarefas (coletar perfil, gerar relatório, enviar).
create table if not exists jobs (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  type        text not null,
  status      text not null default 'pendente'
              check (status in ('pendente', 'processando', 'concluido', 'falhou')),
  attempts    integer not null default 0,
  run_after   timestamptz not null default now(),
  last_error  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- No máximo uma tarefa ativa do mesmo tipo por pedido.
create unique index if not exists jobs_one_active
  on jobs (order_id, type) where status in ('pendente', 'processando');
create index if not exists jobs_queue_idx on jobs (status, run_after);

-- Tentativas (página de obrigado e briefing), para barrar abuso.
create table if not exists rate_limits (
  id          bigserial primary key,
  key         text not null,
  created_at  timestamptz not null default now()
);
create index if not exists rate_limits_key_idx on rate_limits (key, created_at);

drop trigger if exists briefings_touch on briefings;
create trigger briefings_touch before update on briefings
  for each row execute function touch_updated_at();
drop trigger if exists jobs_touch on jobs;
create trigger jobs_touch before update on jobs
  for each row execute function touch_updated_at();

alter table briefings enable row level security;
alter table jobs enable row level security;
alter table rate_limits enable row level security;

-- Recebe o briefing numa única operação (ou tudo, ou nada).
create or replace function receive_briefing(
  p_order_id uuid, p_handle text, p_site text, p_whatsapp text,
  p_consent boolean, p_pain text, p_due_at timestamptz
) returns text language plpgsql as $$
begin
  insert into briefings (order_id, instagram_handle, site, whatsapp, whatsapp_consent, sales_pain)
  values (p_order_id, p_handle, p_site, p_whatsapp, p_consent, p_pain)
  on conflict (order_id) do nothing;
  if not found then return 'exists'; end if;

  update orders set status = 'briefing_recebido', briefing_at = now(), due_at = p_due_at
  where id = p_order_id and status = 'pago';

  insert into jobs (order_id, type) values (p_order_id, 'coletar')
  on conflict (order_id, type) where status in ('pendente', 'processando') do nothing;
  return 'ok';
end $$;

-- Corrige o @. Uma correção por pedido; se a coleta falhou (status 'erro'), não conta.
create or replace function correct_handle(p_order_id uuid, p_handle text)
returns text language plpgsql as $$
declare v_free boolean;
begin
  select status = 'erro' into v_free from orders where id = p_order_id for update;
  if not exists (select 1 from briefings where order_id = p_order_id) then return 'no_briefing'; end if;

  update briefings
     set instagram_handle = p_handle,
         handle_corrections = handle_corrections + case when v_free then 0 else 1 end
   where order_id = p_order_id and (v_free or handle_corrections < 1);
  if not found then return 'no_corrections_left'; end if;

  update orders set status = 'briefing_recebido' where id = p_order_id and status = 'erro';
  insert into jobs (order_id, type) values (p_order_id, 'coletar')
  on conflict (order_id, type) where status in ('pendente', 'processando') do nothing;
  return 'ok';
end $$;

-- Registra uma tentativa e responde se ainda está dentro do limite.
create or replace function hit_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql as $$
declare v_count integer;
begin
  delete from rate_limits where key = p_key and created_at < now() - interval '1 day';
  select count(*) into v_count from rate_limits
   where key = p_key and created_at >= now() - make_interval(secs => p_window_seconds);
  insert into rate_limits (key) values (p_key);
  return v_count < p_limit;
end $$;

-- Só o servidor do app (service role) pode chamar estas funções.
revoke all on function receive_briefing(uuid, text, text, text, boolean, text, timestamptz) from public, anon, authenticated;
revoke all on function correct_handle(uuid, text) from public, anon, authenticated;
revoke all on function hit_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function receive_briefing(uuid, text, text, text, boolean, text, timestamptz) to service_role;
grant execute on function correct_handle(uuid, text) to service_role;
grant execute on function hit_rate_limit(text, integer, integer) to service_role;
