-- 004: dólares, montos por mes en gastos fijos, tarjetas de crédito y conexión con Ualá (Gmail)

-- 1) Movimientos en dólares. "amount" sigue siendo en pesos (así todos los totales funcionan);
--    se guarda además el monto original y la cotización usada al cargarlo.
alter table public.movements add column if not exists currency text not null default 'ARS';
alter table public.movements add column if not exists original_amount numeric;
alter table public.movements add column if not exists exchange_rate numeric;
alter table public.movements add column if not exists source text;
alter table public.movements add column if not exists external_id text;
create unique index if not exists movements_user_external_idx on public.movements (user_id, external_id);

-- 2) Gastos fijos: desde / hasta qué mes rigen y montos que cambian mes a mes.
alter table public.fixed_expenses add column if not exists start_month text;
alter table public.fixed_expenses add column if not exists end_month text;
alter table public.fixed_expense_payments add column if not exists amount numeric;

create table if not exists public.fixed_expense_amounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fixed_expense_id uuid not null references public.fixed_expenses(id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  amount numeric not null check (amount >= 0),
  created_at timestamptz not null default now(),
  unique (fixed_expense_id, month)
);

-- 3) Tarjetas de crédito, sus compras en cuotas / cargos fijos y los resúmenes mensuales.
create table if not exists public.credit_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#5B6CF0',
  due_day int check (due_day is null or due_day between 1 and 31),
  created_at timestamptz not null default now()
);

create table if not exists public.card_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null references public.credit_cards(id) on delete cascade,
  description text not null,
  kind text not null check (kind in ('cuotas', 'fijo')),
  amount numeric not null check (amount >= 0),
  installments int check (installments is null or installments between 1 and 120),
  first_month text not null check (first_month ~ '^[0-9]{4}-[0-9]{2}$'),
  end_month text check (end_month is null or end_month ~ '^[0-9]{4}-[0-9]{2}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.card_statements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null references public.credit_cards(id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  total numeric not null default 0,
  total_usd numeric not null default 0,
  due_date date,
  paid boolean not null default false,
  source text,
  created_at timestamptz not null default now(),
  unique (card_id, month)
);

-- 4) Código personal para que el programa de Gmail cargue movimientos en tu cuenta.
create table if not exists public.import_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now(),
  last_import_at timestamptz,
  last_result jsonb
);

-- Seguridad: cada usuario ve y modifica solo lo suyo.
do $$
declare t text;
begin
  foreach t in array array['fixed_expense_amounts', 'credit_cards', 'card_items', 'card_statements', 'import_tokens'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists "Own rows" on public.%I', t);
    execute format('create policy "Own rows" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
  end loop;
end $$;

create index if not exists fixed_expense_amounts_user_idx on public.fixed_expense_amounts (user_id);
create index if not exists card_items_user_idx on public.card_items (user_id);
create index if not exists card_statements_user_idx on public.card_statements (user_id, month);

-- 5) Función que usa el programa de Gmail. Solo funciona con un código válido
--    y solo agrega transferencias (sin repetir) y resúmenes de la tarjeta.
create or replace function public.import_uala(p_token text, p_transfers jsonb, p_statements jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_card uuid;
  v_added int := 0;
  v_statements int := 0;
  v_count int;
  r jsonb;
begin
  select user_id into v_user from public.import_tokens where token = p_token;
  if v_user is null then
    raise exception 'Código inválido';
  end if;

  for r in select * from jsonb_array_elements(coalesce(p_transfers, '[]'::jsonb)) loop
    insert into public.movements (user_id, description, amount, category, movement_type, movement_date, paid, currency, source, external_id, created_at)
    values (
      v_user,
      left(coalesce(r->>'description', 'Transferencia'), 120),
      (r->>'amount')::numeric,
      'transferencias',
      'gasto',
      (r->>'date')::date,
      true,
      'ARS',
      'uala',
      r->>'id',
      coalesce((r->>'datetime')::timestamptz, now())
    )
    on conflict (user_id, external_id) do nothing;
    get diagnostics v_count = row_count;
    v_added := v_added + v_count;
  end loop;

  if jsonb_array_length(coalesce(p_statements, '[]'::jsonb)) > 0 then
    select id into v_card from public.credit_cards
    where user_id = v_user and lower(name) like 'ual%'
    order by created_at limit 1;
    if v_card is null then
      insert into public.credit_cards (user_id, name, color) values (v_user, 'Ualá', '#2F80ED') returning id into v_card;
    end if;
    for r in select * from jsonb_array_elements(p_statements) loop
      insert into public.card_statements (user_id, card_id, month, total, total_usd, due_date, source)
      values (v_user, v_card, r->>'month', (r->>'total')::numeric, coalesce((r->>'total_usd')::numeric, 0), (r->>'due_date')::date, 'gmail')
      on conflict (card_id, month) do update
        set total = excluded.total, total_usd = excluded.total_usd, due_date = excluded.due_date;
      v_statements := v_statements + 1;
    end loop;
  end if;

  update public.import_tokens
  set last_import_at = now(), last_result = jsonb_build_object('movimientos', v_added, 'resumenes', v_statements)
  where user_id = v_user;

  return jsonb_build_object('movimientos', v_added, 'resumenes', v_statements);
end;
$$;

revoke all on function public.import_uala(text, jsonb, jsonb) from public;
grant execute on function public.import_uala(text, jsonb, jsonb) to anon, authenticated;
