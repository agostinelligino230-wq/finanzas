-- 009: carga instantánea. Cada aviso (mail o notificación del celular) entra por una sola puerta
-- (ingest_movement), queda anotado en incoming_notices y, si es el mismo movimiento que ya llegó
-- por otra vía, se une en vez de duplicarse.

-- 1) Movimientos: de dónde sale la confianza, la confirmación de la persona y el número de operación.
--    manual   = lo cargó la persona (suma)
--    legacy   = entró por Gmail antes de este cambio, o de una entidad con dominios sin confirmar (suma, sin sello)
--    verified = tiene al menos un aviso auténtico: app oficial del banco o mail con firma DKIM oficial (suma, con sello)
--    doubtful = ningún aviso auténtico, o lo leyó el lector genérico / la IA (no suma hasta que la persona lo confirma)
alter table public.movements add column if not exists trust text not null default 'manual';
alter table public.movements drop constraint if exists movements_trust_check;
alter table public.movements add constraint movements_trust_check check (trust in ('manual', 'legacy', 'verified', 'doubtful'));
alter table public.movements add column if not exists confirmed_at timestamptz;
alter table public.movements add column if not exists op_ref text;

-- Lo que ya entró por Gmail sigue sumando igual: ningún saldo cambia el día del deploy.
update public.movements set trust = 'legacy' where trust = 'manual' and external_id ~ '^(mail|uala|wallbit):';

create index if not exists movements_user_source_op_idx on public.movements (user_id, source, op_ref) where op_ref is not null;
create index if not exists movements_user_pair_idx on public.movements (user_id, source, movement_type, currency, created_at);

-- 2) Registro de avisos: cada mail o notificación que llegó, qué se hizo con él y a qué movimiento quedó unido.
--    El texto completo se guarda 30 días (para corregir lectores) y después se borra solo.
create table if not exists public.incoming_notices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('mail', 'push')),
  provider text,
  notice_key text not null,
  authentic boolean not null default false,
  auth_detail jsonb,
  title text,
  body text,
  body_expires_at timestamptz,
  received_at timestamptz not null default now(),
  outcome text not null check (outcome in ('new', 'merged', 'repeated', 'discarded', 'unrecognized', 'error')),
  parser text check (parser is null or parser in ('rule', 'generic', 'ai')),
  detail text,
  movement_id uuid references public.movements(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, channel, notice_key)
);

alter table public.incoming_notices enable row level security;
revoke all on public.incoming_notices from anon, authenticated;
grant select on public.incoming_notices to authenticated;
drop policy if exists "Own rows" on public.incoming_notices;
create policy "Own rows" on public.incoming_notices for select using (auth.uid() = user_id);
create index if not exists incoming_notices_movement_idx on public.incoming_notices (movement_id);
create index if not exists incoming_notices_user_received_idx on public.incoming_notices (user_id, received_at desc);
create index if not exists incoming_notices_body_expires_idx on public.incoming_notices (body_expires_at) where body is not null;

-- 3) Gmail al instante: hasta dónde se leyó (history_id), cuándo vence el aviso y un bloqueo por cuenta.
alter table public.gmail_links add column if not exists history_id text;
alter table public.gmail_links add column if not exists watch_expires_at timestamptz;
alter table public.gmail_links add column if not exists push_lease_until timestamptz;
alter table public.gmail_links add column if not exists last_push_at timestamptz;
grant select (watch_expires_at, last_push_at) on public.gmail_links to authenticated;

-- Toma el bloqueo de una cuenta si está libre (o venció). Lo usa solo gmail-push.
create or replace function public.take_gmail_lease(p_user uuid, p_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.gmail_links
  set push_lease_until = now() + make_interval(secs => p_seconds)
  where user_id = p_user and (push_lease_until is null or push_lease_until < now());
  return found;
end;
$$;

revoke all on function public.take_gmail_lease(uuid, int) from public, anon, authenticated;
grant execute on function public.take_gmail_lease(uuid, int) to service_role;

-- 4) La única puerta de entrada de los movimientos automáticos.
--    p_mov: {type, amount, currency, original, rate, description, category, source, external_id, op_ref, date, datetime, trust} o null
--    p_notice: {channel, provider, notice_key, authentic, auth_detail, title, body, received_at, parser, outcome?, detail?}
--    Devuelve {outcome: new|merged|repeated|discarded|unrecognized, movement_id}.
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

-- 5) La app se entera al instante (Realtime respeta la seguridad por usuario en altas y cambios).
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'movements') then
    alter publication supabase_realtime add table public.movements;
  end if;
end $$;

-- 6) Todos los días se borra el texto completo de los avisos con más de 30 días (queda lo que se sacó de cada uno).
select cron.unschedule('borrar-textos-avisos') where exists (select 1 from cron.job where jobname = 'borrar-textos-avisos');
select cron.schedule('borrar-textos-avisos', '40 6 * * *', $$ update public.incoming_notices set body = null where body is not null and body_expires_at < now(); $$);
