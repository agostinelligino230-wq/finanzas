-- 014: Mercado Pago por API (versión de prueba).
-- La persona da permiso en la pantalla oficial de Mercado Pago (OAuth) y la app trae sus movimientos
-- sin depender de los mails. Sirve para comparar lo que da la API con lo que ya entra por mail y avisos:
-- cada movimiento entra por la misma puerta (ingest_movement), así que si ya estaba se une en vez de duplicarse.

-- 1) Conexión de cada usuario. Los permisos (tokens) se guardan cifrados y nunca se pueden leer desde la app.
create table if not exists public.mp_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  mp_user_id text not null,
  nickname text,
  email text,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  last_sync_at timestamptz,
  last_result jsonb,
  report_requested_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.mp_links enable row level security;
revoke all on public.mp_links from anon, authenticated;
grant select (user_id, nickname, email, last_sync_at, last_result, created_at) on public.mp_links to authenticated;
drop policy if exists "Own rows" on public.mp_links;
create policy "Own rows" on public.mp_links for select using (auth.uid() = user_id);

-- 2) Pedido de conexión en curso (dura 1 hora). Solo lo usa el servidor.
create table if not exists public.mp_link_states (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  return_to text,
  created_at timestamptz not null default now()
);
alter table public.mp_link_states enable row level security;
revoke all on public.mp_link_states from anon, authenticated;

create or replace function public.start_mp_link(p_return_to text)
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
  delete from public.mp_link_states where created_at < now() - interval '1 hour';
  v_state := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.mp_link_states (state, user_id, return_to) values (v_state, auth.uid(), p_return_to);
  return v_state;
end;
$$;

revoke all on function public.start_mp_link(text) from public;
grant execute on function public.start_mp_link(text) to authenticated;

-- 3) Los movimientos que llegan por API quedan anotados en el registro de avisos con el canal "api".
alter table public.incoming_notices drop constraint if exists incoming_notices_channel_check;
alter table public.incoming_notices add constraint incoming_notices_channel_check check (channel in ('mail', 'push', 'api'));
