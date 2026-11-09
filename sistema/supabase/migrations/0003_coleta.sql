-- Etapa 3: coleta do Instagram e funções da fila.
-- Rode depois do 0002: SQL Editor > New query > colar > Run.

-- Resultado de cada coleta (JSON bruto guardado para a análise aprofundada).
create table if not exists collections (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  provider    text not null,
  handle      text not null,
  ok          boolean not null,
  reason      text,
  message     text,
  raw         jsonb,
  profile     jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists collections_order_idx on collections (order_id, created_at desc);
alter table collections enable row level security;

-- Coloca uma tarefa na fila sem duplicar uma ativa do mesmo tipo.
create or replace function enqueue_job(p_order_id uuid, p_type text, p_run_after timestamptz default now())
returns void language sql as $$
  insert into jobs (order_id, type, run_after) values (p_order_id, p_type, p_run_after)
  on conflict (order_id, type) where status in ('pendente', 'processando') do nothing;
$$;

-- Pega tarefas prontas e marca como "processando". "skip locked" impede que duas
-- execuções simultâneas peguem a mesma tarefa. Tarefas presas há mais de 10 minutos
-- (ex.: o servidor caiu no meio) voltam para a fila.
create or replace function claim_jobs(p_types text[], p_limit integer, p_order_id uuid default null)
returns setof jobs language plpgsql as $$
begin
  update jobs set status = 'pendente'
   where status = 'processando' and updated_at < now() - interval '10 minutes';

  return query
  update jobs set status = 'processando', attempts = attempts + 1
   where id in (
     select id from jobs
      where status = 'pendente' and run_after <= now() and type = any(p_types)
        and (p_order_id is null or order_id = p_order_id)
      order by run_after
      limit p_limit
      for update skip locked
   )
  returning *;
end $$;

revoke all on function enqueue_job(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function claim_jobs(text[], integer, uuid) from public, anon, authenticated;
grant execute on function enqueue_job(uuid, text, timestamptz) to service_role;
grant execute on function claim_jobs(text[], integer, uuid) to service_role;
