create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('gasto', 'ingreso')),
  icon text not null default 'Tag',
  color text not null default '#607D8B',
  created_at timestamptz not null default now()
);

alter table public.categories enable row level security;

grant select, insert, update, delete
on public.categories
to authenticated;

create policy "Users can view their categories"
on public.categories
for select
using (auth.uid() = user_id);

create policy "Users can insert their categories"
on public.categories
for insert
with check (auth.uid() = user_id);

create policy "Users can update their categories"
on public.categories
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their categories"
on public.categories
for delete
using (auth.uid() = user_id);

create index if not exists categories_user_idx
on public.categories (user_id);
