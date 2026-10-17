-- 005: pago mensual de cada tarjeta (se conecta con gastos e inicio) e importador de varias cuentas por mail

-- 1) Qué banco o billetera es cada tarjeta (ualá, naranja, santander...).
alter table public.credit_cards add column if not exists provider text;

-- 2) Pago del resumen de cada tarjeta, mes por mes.
create table if not exists public.card_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null references public.credit_cards(id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  amount numeric not null check (amount >= 0),
  created_at timestamptz not null default now(),
  unique (card_id, month)
);

alter table public.card_payments enable row level security;
grant select, insert, update, delete on public.card_payments to authenticated;
drop policy if exists "Own rows" on public.card_payments;
create policy "Own rows" on public.card_payments for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists card_payments_user_idx on public.card_payments (user_id, month);

-- 3) Importador general: movimientos de Ualá, Mercado Pago, Wallbit, Banco Nación, Banco Macro...
--    Cada movimiento llega con un id único, así nunca se carga dos veces.
create or replace function public.import_cuentas(p_token text, p_movements jsonb, p_statements jsonb)
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

  for r in select * from jsonb_array_elements(coalesce(p_movements, '[]'::jsonb)) loop
    if coalesce((r->>'amount')::numeric, 0) <= 0 then continue; end if;
    insert into public.movements (user_id, description, amount, category, movement_type, movement_date, paid, currency, original_amount, exchange_rate, source, external_id, created_at)
    values (
      v_user,
      left(coalesce(r->>'description', 'Movimiento'), 120),
      (r->>'amount')::numeric,
      coalesce(r->>'category', 'otro'),
      case when r->>'type' = 'ingreso' then 'ingreso' else 'gasto' end,
      (r->>'date')::date,
      true,
      case when r->>'currency' = 'USD' then 'USD' else 'ARS' end,
      nullif(r->>'original', '')::numeric,
      nullif(r->>'rate', '')::numeric,
      r->>'source',
      r->>'id',
      coalesce((r->>'datetime')::timestamptz, now())
    )
    on conflict (user_id, external_id) do nothing;
    get diagnostics v_count = row_count;
    v_added := v_added + v_count;
  end loop;

  for r in select * from jsonb_array_elements(coalesce(p_statements, '[]'::jsonb)) loop
    v_card := null;
    select id into v_card from public.credit_cards
    where user_id = v_user and (provider = r->>'provider' or lower(name) like lower(coalesce(r->>'card', '')) || '%')
    order by created_at limit 1;
    if v_card is null then
      insert into public.credit_cards (user_id, name, color, provider)
      values (v_user, coalesce(r->>'card', 'Tarjeta'), coalesce(r->>'color', '#5B6CF0'), r->>'provider')
      returning id into v_card;
    end if;
    insert into public.card_statements (user_id, card_id, month, total, total_usd, due_date, source)
    values (v_user, v_card, r->>'month', (r->>'total')::numeric, coalesce((r->>'total_usd')::numeric, 0), (r->>'due_date')::date, 'gmail')
    on conflict (card_id, month) do update
      set total = excluded.total, total_usd = excluded.total_usd, due_date = excluded.due_date;
    v_statements := v_statements + 1;
  end loop;

  update public.import_tokens
  set last_import_at = now(), last_result = jsonb_build_object('movimientos', v_added, 'resumenes', v_statements)
  where user_id = v_user;

  return jsonb_build_object('movimientos', v_added, 'resumenes', v_statements);
end;
$$;

revoke all on function public.import_cuentas(text, jsonb, jsonb) from public;
grant execute on function public.import_cuentas(text, jsonb, jsonb) to anon, authenticated;

-- La tarjeta de Ualá que creó el importador anterior queda marcada como Ualá.
update public.credit_cards set provider = 'uala' where provider is null and lower(name) like 'ual%';
