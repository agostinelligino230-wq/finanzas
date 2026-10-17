-- 007: leer el resumen en PDF de cada tarjeta que llega al Gmail conectado

-- Más datos del resumen: cierre, pago mínimo y el detalle de consumos.
alter table public.card_statements add column if not exists closing_date date;
alter table public.card_statements add column if not exists min_payment numeric;
alter table public.card_statements add column if not exists details jsonb;
alter table public.card_statements add column if not exists message_id text;

-- Las cuotas que salen del resumen se reconocen para no duplicarlas mes a mes.
alter table public.card_items add column if not exists source text;
alter table public.card_items add column if not exists external_key text;
create unique index if not exists card_items_external_key_idx on public.card_items (card_id, external_key);

-- Cada tarjeta cuyo resumen llega por mail. La clave del PDF (si la guardás) nunca se puede leer desde la app.
create table if not exists public.statement_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  label text not null,
  provider text,
  brand text,
  card_id uuid references public.credit_cards(id) on delete set null,
  last_message_id text,
  last_mail_at timestamptz,
  last_subject text,
  analyzed_message_id text,
  analyzed_at timestamptz,
  status text not null default 'nuevo',
  result jsonb,
  auto boolean not null default false,
  dismissed boolean not null default false,
  password_saved boolean not null default false,
  pdf_password text,
  created_at timestamptz not null default now(),
  unique (user_id, key)
);

alter table public.statement_sources enable row level security;
revoke all on public.statement_sources from anon, authenticated;
grant select (id, user_id, key, label, provider, brand, card_id, last_message_id, last_mail_at, last_subject, analyzed_message_id, analyzed_at, status, result, auto, dismissed, password_saved, created_at) on public.statement_sources to authenticated;
grant update (auto, dismissed) on public.statement_sources to authenticated;
grant delete on public.statement_sources to authenticated;
drop policy if exists "Own rows" on public.statement_sources;
create policy "Own rows" on public.statement_sources for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
