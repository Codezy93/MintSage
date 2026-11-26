begin;
create table public.finance_plans (
  owner_id uuid primary key references auth.users on delete cascade,
  revision bigint not null default 1,
  settings jsonb not null
);
create table public.finance_snapshots (
  owner_id uuid references auth.users on delete cascade,
  day date not null, recorded_at timestamptz not null default now(), inventory jsonb not null,
  primary key (owner_id,day)
);
create table public.finance_events (
  owner_id uuid references auth.users on delete cascade,
  event_key text not null, destination text not null, evidence jsonb not null,
  status text not null default 'pending' check(status in ('pending','reviewed','dismissed','confirmed')),
  created_at timestamptz not null default now(), primary key(owner_id,event_key)
);
alter table public.finance_plans enable row level security;
alter table public.finance_snapshots enable row level security;
alter table public.finance_events enable row level security;
revoke all on public.finance_plans, public.finance_snapshots, public.finance_events from public,anon,authenticated;
grant select,insert,update on public.finance_plans,public.finance_snapshots,public.finance_events to service_role;
alter table public.plaid_tokens add column history_checked timestamptz, add column history_ready boolean not null default false;
commit;
