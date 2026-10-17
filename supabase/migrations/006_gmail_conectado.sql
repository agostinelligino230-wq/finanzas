-- 006: conectar Gmail con un botón (permiso de solo lectura de Google) y lectura diaria automática

-- Permiso guardado de cada usuario. El permiso (refresh_token) nunca se puede leer desde la app.
create table if not exists public.gmail_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  refresh_token text not null,
  providers text[] not null default array['uala', 'mercadopago', 'wallbit', 'nacion', 'macro'],
  last_sync_at timestamptz,
  last_result jsonb,
  created_at timestamptz not null default now()
);

alter table public.gmail_links enable row level security;
revoke all on public.gmail_links from anon, authenticated;
grant select (user_id, email, name, providers, last_sync_at, last_result, created_at) on public.gmail_links to authenticated;
grant update (providers) on public.gmail_links to authenticated;
grant delete on public.gmail_links to authenticated;
drop policy if exists "Own rows" on public.gmail_links;
create policy "Own rows" on public.gmail_links for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Pedido de conexión en curso (dura 1 hora). Solo lo usa el servidor.
create table if not exists public.gmail_link_states (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  return_to text,
  created_at timestamptz not null default now()
);
alter table public.gmail_link_states enable row level security;
revoke all on public.gmail_link_states from anon, authenticated;

create or replace function public.start_gmail_link(p_return_to text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state text;
begin
  if auth.uid() is null then
    raise exception 'Tenés que iniciar sesión';
  end if;
  delete from public.gmail_link_states where created_at < now() - interval '1 hour';
  v_state := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.gmail_link_states (state, user_id, return_to) values (v_state, auth.uid(), p_return_to);
  return v_state;
end;
$$;

revoke all on function public.start_gmail_link(text) from public;
grant execute on function public.start_gmail_link(text) to authenticated;

-- Lectura automática todos los días (7:17 de Argentina).
create extension if not exists pg_net;
create extension if not exists pg_cron;
select cron.unschedule('leer-gmail') where exists (select 1 from cron.job where jobname = 'leer-gmail');
select cron.schedule(
  'leer-gmail',
  '17 10 * * *',
  $$ select net.http_post(url := 'https://jlsqtygwaertmhurjwbj.supabase.co/functions/v1/gmail', headers := '{"Content-Type": "application/json"}'::jsonb, body := '{"cron": true}'::jsonb); $$
);
