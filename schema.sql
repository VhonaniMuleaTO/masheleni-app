create table categories (
  id uuid primary key default gen_random_uuid(),
  name text unique not null
);

create table budget_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('expense','income')),
  category_id uuid references categories,
  payment_method text not null check (payment_method in ('debit_order','manual')),
  due_day int check (due_day between 1 and 31),
  is_active boolean not null default true
);

create table monthly_budgets (
  id uuid primary key default gen_random_uuid(),
  month date unique not null,
  start_balance numeric not null default 0,
  end_balance numeric not null default 0
);

create table budget_entries (
  id uuid primary key default gen_random_uuid(),
  monthly_budget_id uuid references monthly_budgets not null,
  budget_item_id uuid references budget_items not null,
  planned numeric not null default 0,
  actual numeric not null default 0,
  paid boolean not null default false,
  unique (monthly_budget_id, budget_item_id)
);

alter table categories enable row level security;
alter table budget_items enable row level security;
alter table monthly_budgets enable row level security;
alter table budget_entries enable row level security;

create policy "authenticated full access" on categories
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated full access" on budget_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated full access" on monthly_budgets
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated full access" on budget_entries
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create view v_category_actuals as
select mb.month, c.name as category, sum(be.actual) as total_actual
from budget_entries be
join budget_items bi on bi.id = be.budget_item_id
left join categories c on c.id = bi.category_id
join monthly_budgets mb on mb.id = be.monthly_budget_id
where bi.type = 'expense'
group by mb.month, c.name;

create view v_monthly_totals as
select mb.month, mb.start_balance, mb.end_balance,
  sum(case when bi.type='expense' then be.planned else 0 end) as expense_planned,
  sum(case when bi.type='expense' then be.actual else 0 end) as expense_actual,
  sum(case when bi.type='income' then be.planned else 0 end) as income_planned,
  sum(case when bi.type='income' then be.actual else 0 end) as income_actual
from monthly_budgets mb
join budget_entries be on be.monthly_budget_id = mb.id
join budget_items bi on bi.id = be.budget_item_id
group by mb.month, mb.start_balance, mb.end_balance;
