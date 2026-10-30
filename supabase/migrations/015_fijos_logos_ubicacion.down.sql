-- Deshace 015. Vuelve ingest_movement a su versión de la 009 y borra lo agregado.
-- Las fotos del bucket tickets hay que borrarlas desde el panel: Supabase no deja tocarlas por SQL.
select cron.unschedule('avisar-vencimientos') where exists (select 1 from cron.job where jobname = 'avisar-vencimientos');
drop policy if exists "Tickets propios: ver" on storage.objects;
drop policy if exists "Tickets propios: subir" on storage.objects;
drop policy if exists "Tickets propios: cambiar" on storage.objects;
drop policy if exists "Tickets propios: borrar" on storage.objects;
drop function if exists public.split_movement(uuid, numeric, text);
drop function if exists public.forget_locations();
drop function if exists public.set_movement_place(uuid, double precision, double precision, text, text);
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
          op_ref = coalesce(op_ref, nullif(p_mov->>'op_ref', ''))
      where id = v_movement;
    else
      v_trust := case when p_mov->>'trust' in ('verified', 'doubtful', 'legacy') then p_mov->>'trust' else 'doubtful' end;
      insert into public.movements (user_id, description, amount, category, movement_type, movement_date, paid, currency, original_amount, exchange_rate, source, external_id, created_at, trust, op_ref)
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
        nullif(p_mov->>'op_ref', '')
      )
      returning id into v_movement;
      v_outcome := 'new';
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
alter table public.user_settings drop column if exists location_enabled;
drop table if exists public.payees;
alter table public.movements
  drop column if exists note, drop column if exists photo_path, drop column if exists lat, drop column if exists lng, drop column if exists accuracy_m,
  drop column if exists place_name, drop column if exists place_address, drop column if exists located_at, drop column if exists counterparty_name,
  drop column if exists counterparty_ref, drop column if exists excluded;
alter table public.fixed_expenses
  drop column if exists provider, drop column if exists icon, drop column if exists color, drop column if exists currency, drop column if exists payment_method,
  drop column if exists card_id, drop column if exists reminder_days, drop column if exists variable, drop column if exists note;
