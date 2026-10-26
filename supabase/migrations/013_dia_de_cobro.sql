-- 013: día de cobro. «Tu mes» va de un cobro al siguiente (si cobrás el 5, del 5/10 al 4/11).
-- Se pide al entrar por primera vez (web y celular). Sin fila = todavía no se preguntó.
-- pay_day null y pay_last_business_day false = sin día fijo: el mes es el de calendario, como hasta hoy.

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pay_day smallint check (pay_day between 1 and 31),
  pay_last_business_day boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not (pay_last_business_day and pay_day is not null))
);

alter table public.user_settings enable row level security;
revoke all on public.user_settings from anon;

drop policy if exists "user_settings propios" on public.user_settings;
create policy "user_settings propios" on public.user_settings
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update on public.user_settings to authenticated;
