create table if not exists public.fixed_expense_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fixed_expense_id uuid not null references public.fixed_expenses(id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  created_at timestamptz not null default now(),
  unique (fixed_expense_id, month)
);

alter table public.fixed_expense_payments enable row level security;

grant select, insert, update, delete
on public.fixed_expense_payments
to authenticated;

create policy "Users can view their fixed expense payments"
on public.fixed_expense_payments
for select
using (auth.uid() = user_id);

create policy "Users can insert their fixed expense payments"
on public.fixed_expense_payments
for insert
with check (auth.uid() = user_id);

create policy "Users can update their fixed expense payments"
on public.fixed_expense_payments
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their fixed expense payments"
on public.fixed_expense_payments
for delete
using (auth.uid() = user_id);

create index if not exists fixed_expense_payments_user_month_idx
on public.fixed_expense_payments (user_id, month);
