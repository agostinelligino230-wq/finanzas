-- 015: gasto fijo completo, logos y colores, detalle de cada movimiento y ubicación.
-- Todo es nuevo y opcional: los datos que ya están no cambian.

-- 1) Gasto fijo completo. start_month y end_month ya existen (migración 004).
alter table public.fixed_expenses add column if not exists provider text;
alter table public.fixed_expenses add column if not exists icon text;
alter table public.fixed_expenses add column if not exists color text;
alter table public.fixed_expenses add column if not exists currency text not null default 'ARS' check (currency in ('ARS', 'USD'));
alter table public.fixed_expenses add column if not exists payment_method text check (payment_method in ('debito', 'tarjeta', 'transferencia', 'efectivo'));
alter table public.fixed_expenses add column if not exists card_id uuid references public.credit_cards(id) on delete set null;
alter table public.fixed_expenses add column if not exists reminder_days int check (reminder_days between 0 and 5);
alter table public.fixed_expenses add column if not exists variable boolean not null default false;
alter table public.fixed_expenses add column if not exists note text;

-- 2) Detalle de cada movimiento: nota, foto, lugar, con quién fue y si en realidad no era un gasto.
alter table public.movements add column if not exists note text;
alter table public.movements add column if not exists photo_path text;
alter table public.movements add column if not exists lat double precision;
alter table public.movements add column if not exists lng double precision;
alter table public.movements add column if not exists accuracy_m int;
alter table public.movements add column if not exists place_name text;
alter table public.movements add column if not exists place_address text;
alter table public.movements add column if not exists located_at timestamptz;
alter table public.movements add column if not exists counterparty_name text;
alter table public.movements add column if not exists counterparty_ref text;
alter table public.movements add column if not exists excluded boolean not null default false;

-- 3) Destinatarios frecuentes: «match» es el CBU, CVU o alias (o el nombre, si el aviso no trae otra cosa).
create table if not exists public.payees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  match text not null,
  name text,
  icon text,
  color text,
  place_name text,
  created_at timestamptz not null default now(),
  unique (user_id, match)
);
alter table public.payees enable row level security;
revoke all on public.payees from anon;
grant select, insert, update, delete on public.payees to authenticated;
drop policy if exists "Own rows" on public.payees;
create policy "Own rows" on public.payees for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4) Interruptor de ubicación (user_settings es la tabla de ajustes de cada persona; sin fila, prendido).
alter table public.user_settings add column if not exists location_enabled boolean not null default true;

-- 5) La puerta de entrada ahora también guarda con quién fue y dónde estaba el celular.
--    p_mov suma: counterparty_name, counterparty_ref, lat, lng, accuracy_m (todos opcionales).
create or replace function public.ingest_movement(p_user uuid, p_mov jsonb, p_notice jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_channel text := p_notice->>'channel';
  v_key text := p_notice->>'notice_key';
  v_authentic boolean := coalesce((p_notice->>'authentic')::boolean, false);
  v_received timestamptz := coalesce((p_notice->>'received_at')::timestamptz, now());
  v_seen record;
  v_movement uuid;
  v_outcome text;
  v_when timestamptz;
  v_currency text;
  v_amount numeric;
  v_type text;
  v_trust text;
  v_located boolean;
begin
  if v_channel is null or v_key is null then
    raise exception 'Falta el canal o la clave del aviso';
  end if;

  -- Dos avisos de la misma persona no se procesan a la vez (push y mail del mismo movimiento pueden llegar juntos).
  perform pg_advisory_xact_lock(hashtext('ingest:' || p_user::text));

  -- El mismo aviso otra vez (Pub/Sub y la cola del celular reintentan): no se hace nada.
  select movement_id into v_seen from public.incoming_notices where user_id = p_user and channel = v_channel and notice_key = v_key;
  if found then
    return jsonb_build_object('outcome', 'repeated', 'movement_id', v_seen.movement_id);
  end if;

  if p_mov is null or jsonb_typeof(p_mov) = 'null' then
    v_outcome := case when p_notice->>'outcome' in ('discarded', 'unrecognized', 'error') then p_notice->>'outcome' else 'unrecognized' end;
  else
    v_when := coalesce((p_mov->>'datetime')::timestamptz, v_received);
    v_currency := case when p_mov->>'currency' = 'USD' then 'USD' else 'ARS' end;
    v_type := case when p_mov->>'type' = 'ingreso' then 'ingreso' else 'gasto' end;

    -- a) Mismo id externo: el mismo aviso ya se había cargado (por ejemplo, antes de que existiera este registro).
    select id into v_movement from public.movements where user_id = p_user and external_id = p_mov->>'external_id';
    if v_movement is not null then
      v_outcome := 'repeated';
    end if;

    -- b) Mismo número de operación de la misma entidad.
    if v_movement is null and nullif(p_mov->>'op_ref', '') is not null then
      select id into v_movement from public.movements
      where user_id = p_user and source = p_mov->>'source' and op_ref = p_mov->>'op_ref'
      order by created_at limit 1;
      if v_movement is not null then v_outcome := 'merged'; end if;
    end if;

    -- c) Misma entidad, tipo, moneda y monto, a 2 horas o menos, que todavía no tenga un aviso de esta misma vía.
    --    (Dos avisos iguales por la misma vía son dos compras de verdad.)
    if v_movement is null then
      v_amount := case when v_currency = 'USD' then nullif(p_mov->>'original', '')::numeric else (p_mov->>'amount')::numeric end;
      select m.id into v_movement from public.movements m
      where m.user_id = p_user and m.source = p_mov->>'source' and m.movement_type = v_type and m.currency = v_currency
        and (case when v_currency = 'USD' then m.original_amount else m.amount end) = v_amount
        and m.created_at between v_when - interval '2 hours' and v_when + interval '2 hours'
        and not exists (select 1 from public.incoming_notices n where n.movement_id = m.id and n.channel = v_channel)
        and not (v_channel = 'mail' and m.external_id ~ '^(mail|uala|wallbit):')
        and not (v_channel = 'push' and m.external_id like 'push:%')
      order by abs(extract(epoch from (m.created_at - v_when)))
      limit 1;
      if v_movement is not null then v_outcome := 'merged'; end if;
    end if;

    if v_movement is not null then
      -- Un aviso auténtico verifica el movimiento (aunque el primero haya llegado dudoso).
      update public.movements
      set trust = case when v_authentic and trust in ('doubtful', 'legacy') then 'verified' else trust end,
          op_ref = coalesce(op_ref, nullif(p_mov->>'op_ref', '')),
          counterparty_name = coalesce(counterparty_name, nullif(p_mov->>'counterparty_name', '')),
          counterparty_ref = coalesce(counterparty_ref, nullif(p_mov->>'counterparty_ref', ''))
      where id = v_movement;
    else
      v_trust := case when p_mov->>'trust' in ('verified', 'doubtful', 'legacy') then p_mov->>'trust' else 'doubtful' end;
      insert into public.movements (user_id, description, amount, category, movement_type, movement_date, paid, currency, original_amount, exchange_rate, source, external_id, created_at, trust, op_ref, counterparty_name, counterparty_ref)
      values (
        p_user,
        left(coalesce(p_mov->>'description', 'Movimiento'), 120),
        (p_mov->>'amount')::numeric,
        coalesce(p_mov->>'category', 'otro'),
        v_type,
        coalesce((p_mov->>'date')::date, (v_when at time zone 'America/Argentina/Buenos_Aires')::date),
        true,
        v_currency,
        nullif(p_mov->>'original', '')::numeric,
        nullif(p_mov->>'rate', '')::numeric,
        p_mov->>'source',
        p_mov->>'external_id',
        v_when,
        v_trust,
        nullif(p_mov->>'op_ref', ''),
        nullif(p_mov->>'counterparty_name', ''),
        nullif(p_mov->>'counterparty_ref', '')
      )
      returning id into v_movement;
      v_outcome := 'new';
    end if;

    -- La ubicación del celular se guarda una sola vez y solo si la persona no la apagó en Ajustes.
    v_located := nullif(p_mov->>'lat', '') is not null and nullif(p_mov->>'lng', '') is not null
      and coalesce((select location_enabled from public.user_settings where user_id = p_user), true);
    if v_located then
      update public.movements
      set lat = (p_mov->>'lat')::double precision, lng = (p_mov->>'lng')::double precision,
          accuracy_m = nullif(p_mov->>'accuracy_m', '')::numeric::int, located_at = v_when
      where id = v_movement and lat is null;
    end if;
  end if;

  insert into public.incoming_notices (user_id, channel, provider, notice_key, authentic, auth_detail, title, body, body_expires_at, received_at, outcome, parser, detail, movement_id)
  values (
    p_user, v_channel, p_notice->>'provider', v_key, v_authentic, p_notice->'auth_detail', left(p_notice->>'title', 300),
    case when v_received > now() - interval '30 days' then p_notice->>'body' end,
    case when p_notice->>'body' is not null then v_received + interval '30 days' end,
    v_received, v_outcome, p_notice->>'parser', left(p_notice->>'detail', 200), v_movement
  );

  return jsonb_build_object('outcome', v_outcome, 'movement_id', v_movement);
end;
$$;

revoke all on function public.ingest_movement(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_movement(uuid, jsonb, jsonb) to service_role;

-- 6) «¿Fue acá?» confirmado por la persona.
create or replace function public.set_movement_place(p_id uuid, p_lat double precision, p_lng double precision, p_place_name text, p_place_address text)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.movements
  set lat = p_lat, lng = p_lng, place_name = nullif(trim(p_place_name), ''), place_address = nullif(trim(p_place_address), ''), located_at = coalesce(located_at, now())
  where id = p_id and user_id = auth.uid();
$$;
revoke all on function public.set_movement_place(uuid, double precision, double precision, text, text) from public, anon;
grant execute on function public.set_movement_place(uuid, double precision, double precision, text, text) to authenticated;

-- 7) Borrar todas las ubicaciones guardadas (movimientos y destinatarios).
create or replace function public.forget_locations()
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.movements set lat = null, lng = null, accuracy_m = null, place_name = null, place_address = null, located_at = null
  where user_id = auth.uid() and (lat is not null or place_name is not null);
  update public.payees set place_name = null where user_id = auth.uid() and place_name is not null;
end;
$$;
revoke all on function public.forget_locations() from public, anon;
grant execute on function public.forget_locations() to authenticated;

-- 8) Dividir un movimiento en dos categorías: los dos cambios van juntos o no va ninguno.
create or replace function public.split_movement(p_id uuid, p_amount numeric, p_category text)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row public.movements%rowtype;
  v_new uuid;
begin
  select * into v_row from public.movements where id = p_id and user_id = auth.uid() for update;
  if not found then raise exception 'No existe el movimiento'; end if;
  if v_row.currency <> 'ARS' then raise exception 'Solo se dividen movimientos en pesos'; end if;
  if p_amount <= 0 or p_amount >= v_row.amount then raise exception 'El monto tiene que ser menor al total'; end if;
  update public.movements set amount = amount - p_amount where id = p_id;
  insert into public.movements (user_id, description, amount, category, movement_type, movement_date, paid, currency, source, created_at, trust, confirmed_at, note, lat, lng, accuracy_m, place_name, place_address, located_at, counterparty_name, counterparty_ref)
  values (v_row.user_id, v_row.description, p_amount, p_category, v_row.movement_type, v_row.movement_date, v_row.paid, 'ARS', v_row.source, v_row.created_at, v_row.trust, v_row.confirmed_at, v_row.note, v_row.lat, v_row.lng, v_row.accuracy_m, v_row.place_name, v_row.place_address, v_row.located_at, v_row.counterparty_name, v_row.counterparty_ref)
  returning id into v_new;
  return v_new;
end;
$$;
revoke all on function public.split_movement(uuid, numeric, text) from public, anon;
grant execute on function public.split_movement(uuid, numeric, text) to authenticated;

-- 9) Fotos de tickets: bucket privado, una carpeta por persona.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tickets', 'tickets', false, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;
drop policy if exists "Tickets propios: ver" on storage.objects;
create policy "Tickets propios: ver" on storage.objects for select to authenticated using (bucket_id = 'tickets' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Tickets propios: subir" on storage.objects;
create policy "Tickets propios: subir" on storage.objects for insert to authenticated with check (bucket_id = 'tickets' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Tickets propios: cambiar" on storage.objects;
create policy "Tickets propios: cambiar" on storage.objects for update to authenticated using (bucket_id = 'tickets' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Tickets propios: borrar" on storage.objects;
create policy "Tickets propios: borrar" on storage.objects for delete to authenticated using (bucket_id = 'tickets' and (storage.foldername(name))[1] = auth.uid()::text);

-- 10) Aviso de vencimientos: todos los días a las 9 de Argentina.
select cron.unschedule('avisar-vencimientos') where exists (select 1 from cron.job where jobname = 'avisar-vencimientos');
select cron.schedule(
  'avisar-vencimientos',
  '0 12 * * *',
  $$ select net.http_post(
       url := 'https://jlsqtygwaertmhurjwbj.supabase.co/functions/v1/notificaciones',
       headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)),
       body := '{"cron": true}'::jsonb
     ); $$
);
