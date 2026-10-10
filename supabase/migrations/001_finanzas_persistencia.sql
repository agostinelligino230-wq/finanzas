create table if not exists public.movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  description text not null,
  amount numeric(14,2) not null check (amount > 0),
  category text not null default 'otro',
  movement_type text not null check (movement_type in ('gasto', 'ingreso')),
  movement_date date not null,
  paid boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.movements enable row level security;
grant select, insert, update, delete on public.movements to authenticated;
create policy "Users can view their movements" on public.movements for select using (auth.uid() = user_id);
create policy "Users can insert their movements" on public.movements for insert with check (auth.uid() = user_id);
create policy "Users can update their movements" on public.movements for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their movements" on public.movements for delete using (auth.uid() = user_id);

create table if not exists public.fixed_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  amount numeric(14,2) not null check (amount > 0),
  category text not null default 'otro',
  due_day integer not null default 1 check (due_day between 1 and 31),
  paid boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.fixed_expenses enable row level security;
grant select, insert, update, delete on public.fixed_expenses to authenticated;
create policy "Users can view their fixed expenses" on public.fixed_expenses for select using (auth.uid() = user_id);
create policy "Users can insert their fixed expenses" on public.fixed_expenses for insert with check (auth.uid() = user_id);
create policy "Users can update their fixed expenses" on public.fixed_expenses for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their fixed expenses" on public.fixed_expenses for delete using (auth.uid() = user_id);

create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target numeric(14,2) not null check (target > 0),
  saved numeric(14,2) not null default 0 check (saved >= 0),
  period text not null default 'mensual' check (period in ('mensual', 'semestral', 'anual')),
  icon text not null default 'piggy',
  created_at timestamptz not null default now()
);

alter table public.savings_goals enable row level security;
grant select, insert, update, delete on public.savings_goals to authenticated;
create policy "Users can view their savings goals" on public.savings_goals for select using (auth.uid() = user_id);
create policy "Users can insert their savings goals" on public.savings_goals for insert with check (auth.uid() = user_id);
create policy "Users can update their savings goals" on public.savings_goals for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their savings goals" on public.savings_goals for delete using (auth.uid() = user_id);

create index if not exists movements_user_date_idx on public.movements (user_id, movement_date desc);
create index if not exists fixed_expenses_user_idx on public.fixed_expenses (user_id);
create index if not exists savings_goals_user_idx on public.savings_goals (user_id);
