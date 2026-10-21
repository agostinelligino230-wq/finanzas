-- 010: celulares que mandan las notificaciones de los bancos (Android).
-- Cada celular tiene su propio token (se guarda solo el hash) y se puede revocar sin cortar los otros.

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  platform text not null check (platform in ('android', 'ios')),
  model text,
  app_version text,
  listener_enabled boolean not null default false,
  rate_window timestamptz,
  rate_count int not null default 0,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);

alter table public.devices enable row level security;
revoke all on public.devices from anon, authenticated;
grant select (id, user_id, platform, model, app_version, listener_enabled, created_at, last_seen_at, revoked_at) on public.devices to authenticated;
drop policy if exists "Own rows" on public.devices;
create policy "Own rows" on public.devices for select using (auth.uid() = user_id);
create index if not exists devices_user_idx on public.devices (user_id);

-- Alta de un celular: devuelve el token UNA sola vez (en la base queda solo su hash).
create or replace function public.register_device(p_platform text, p_model text, p_app_version text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Tenés que iniciar sesión';
  end if;
  if p_platform not in ('android', 'ios') then
    raise exception 'Plataforma inválida';
  end if;
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.devices (user_id, token_hash, platform, model, app_version)
  values (auth.uid(), encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), p_platform, left(p_model, 80), left(p_app_version, 20))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'token', v_token);
end;
$$;

revoke all on function public.register_device(text, text, text) from public, anon;
grant execute on function public.register_device(text, text, text) to authenticated;

-- Cortar un celular: deja de poder mandar avisos (la app le pide volver a vincular).
create or replace function public.revoke_device(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.devices set revoked_at = now() where id = p_id and user_id = auth.uid() and revoked_at is null;
end;
$$;

revoke all on function public.revoke_device(uuid) from public, anon;
grant execute on function public.revoke_device(uuid) to authenticated;

-- Cupo por celular: cuántos avisos por minuto (lo usa la función notificaciones).
create or replace function public.take_device_quota(p_device uuid, p_count int, p_limit int, p_listener boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update public.devices
  set rate_count = case when rate_window is null or rate_window < now() - interval '1 minute' then p_count else rate_count + p_count end,
      rate_window = case when rate_window is null or rate_window < now() - interval '1 minute' then now() else rate_window end,
      last_seen_at = now(),
      listener_enabled = coalesce(p_listener, listener_enabled)
  where id = p_device and revoked_at is null
  returning rate_count into v_count;
  return v_count is not null and v_count <= p_limit;
end;
$$;

revoke all on function public.take_device_quota(uuid, int, int, boolean) from public, anon, authenticated;
grant execute on function public.take_device_quota(uuid, int, int, boolean) to service_role;
