begin;
alter table public.plaid_tokens
  add column sync_cursor text,
  add column transactions jsonb not null default '{}',
  add column sync_revision bigint not null default 0;

create table public.transaction_sync_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  completed_at timestamptz not null default now(),
  changed_transaction_ids text[] not null
);
alter table public.transaction_sync_events enable row level security;
revoke all on public.transaction_sync_events from public, anon, authenticated;
grant select, insert on public.transaction_sync_events to service_role;

create function public.commit_transaction_sync(owner_id uuid, expected_token text,
  revision bigint, next_cursor text, changes jsonb, removed text[])
returns boolean language plpgsql set search_path = '' as $$
begin
  update public.plaid_tokens set transactions = (transactions - removed) || changes,
    sync_cursor = next_cursor, sync_revision = sync_revision + 1
    where id = owner_id and token = expected_token and sync_revision = revision;
  if not found then return false; end if;
  if changes <> '{}'::jsonb or cardinality(removed) > 0 then
    insert into public.transaction_sync_events(user_id, changed_transaction_ids)
      values (owner_id, array(select jsonb_object_keys(changes) union select unnest(removed)));
  end if;
  return true;
end;
$$;
revoke all on function public.commit_transaction_sync from public, anon, authenticated;
grant execute on function public.commit_transaction_sync to service_role;
commit;
