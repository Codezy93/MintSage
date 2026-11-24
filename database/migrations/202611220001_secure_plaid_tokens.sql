begin;

alter table public.plaid_tokens enable row level security;

revoke all privileges on table public.plaid_tokens
  from public, anon, authenticated, service_role;
revoke all privileges (id, token) on table public.plaid_tokens
  from public, anon, authenticated, service_role;
grant select, insert, update on table public.plaid_tokens to service_role;

drop policy if exists "Users can insert their own plaid token" on public.plaid_tokens;
drop policy if exists "Users can read their own plaid token" on public.plaid_tokens;
drop policy if exists "Users can update their own plaid token" on public.plaid_tokens;

commit;
