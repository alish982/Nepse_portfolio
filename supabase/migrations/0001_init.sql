-- NEPSE Portfolio Tracker: schema, RLS, signup trigger.
-- Run in the Supabase SQL editor (or `supabase db push`).
-- Also turn OFF "Confirm email" in Authentication -> Providers -> Email.

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 60),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- -------------------------------------------------------------- portfolios
create table public.portfolios (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now()
);
create unique index portfolios_user_name_key on public.portfolios (user_id, lower(btrim(name)));
create index portfolios_user_idx on public.portfolios (user_id, created_at);

-- ------------------------------------------------------------ transactions
create table public.transactions (
  id           uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios (id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  symbol       text not null check (symbol ~ '^[A-Z0-9]{1,15}$'),
  company_name text check (company_name is null or char_length(company_name) <= 200),
  type         text not null check (type in ('buy', 'sell')),
  quantity     integer not null check (quantity > 0),
  price        numeric(14, 2) not null check (price > 0),
  fees         numeric(12, 2) not null default 0 check (fees >= 0),
  txn_date     date not null,
  created_at   timestamptz not null default now()
);
create index transactions_portfolio_idx on public.transactions (portfolio_id, txn_date, created_at);
create index transactions_user_idx on public.transactions (user_id);

-- --------------------------------------------- market cache (server-only)
-- Durable fallback for market data. RLS is enabled with NO policies, so only the
-- service-role key (used server-side only) can read or write it.
create table public.market_cache (
  key        text primary key,
  payload    jsonb not null,
  updated_at timestamptz not null default now()
);

-- --------------------------------------------------------------------- RLS
alter table public.profiles     enable row level security;
alter table public.portfolios   enable row level security;
alter table public.transactions enable row level security;
alter table public.market_cache enable row level security;

create policy "profiles: read own"   on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy "profiles: update own" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "portfolios: select own" on public.portfolios for select to authenticated
  using (user_id = (select auth.uid()));
create policy "portfolios: insert own" on public.portfolios for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "portfolios: update own" on public.portfolios for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "portfolios: delete own" on public.portfolios for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "transactions: select own" on public.transactions for select to authenticated
  using (user_id = (select auth.uid()));
-- A transaction may only be written into a portfolio the user owns.
create policy "transactions: insert own" on public.transactions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.portfolios p
                where p.id = portfolio_id and p.user_id = (select auth.uid()))
  );
create policy "transactions: update own" on public.transactions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.portfolios p
                where p.id = portfolio_id and p.user_id = (select auth.uid()))
  );
create policy "transactions: delete own" on public.transactions for delete to authenticated
  using (user_id = (select auth.uid()));

-- Anonymous visitors get nothing.
revoke all on public.profiles, public.portfolios, public.transactions, public.market_cache from anon;
revoke all on public.market_cache from authenticated;

-- ------------------------------------------------------- signup bootstrap
-- Creates the profile and a default portfolio atomically with the auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  insert into public.portfolios (user_id, name) values (new.id, 'Main Portfolio');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
