-- 011: avisos propios de la app (D2). Cuando un movimiento entra por mail, el celular recibe «Entró $X de Galicia».
-- Cada celular guarda su token de Expo. Solo se maneja por RPC: así un token que pasa a otra cuenta
-- (cerrar sesión y entrar con otra) cambia de dueño sin chocar con las reglas de la tabla.

create table if not exists public.push_tokens (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('android', 'ios')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from anon, authenticated;
create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

-- Prender los avisos en este celular (o renovar el token).
create or replace function public.save_push_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Tenés que iniciar sesión';
  end if;
  if p_platform not in ('android', 'ios') or p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$' then
    raise exception 'Token inválido';
  end if;
  insert into public.push_tokens (token, user_id, platform)
  values (p_token, auth.uid(), p_platform)
  on conflict (token) do update set user_id = auth.uid(), platform = excluded.platform, last_seen_at = now();
end;
$$;

revoke all on function public.save_push_token(text, text) from public, anon;
grant execute on function public.save_push_token(text, text) to authenticated;

-- Apagar los avisos en este celular (también al cerrar sesión).
create or replace function public.delete_push_token(p_token text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.push_tokens where token = p_token and user_id = auth.uid();
$$;

revoke all on function public.delete_push_token(text) from public, anon;
grant execute on function public.delete_push_token(text) to authenticated;
