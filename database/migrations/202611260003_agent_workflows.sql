begin;
create schema agent_private;
revoke all on schema agent_private from public, anon, authenticated;
create table agent_private.runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  event_key text not null, trigger text not null, topic text not null,
  event text, scenario jsonb not null default '{}', result jsonb not null default '{}',
  status text not null default 'queued' check(status in
    ('queued','awaiting','approved','declined','open','confirmed','dismissed','automatic','done','failed')),
  attempts int not null default 0, scheduled_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(owner_id,event_key,topic)
);
create index on agent_private.runs(status,scheduled_at);
create index on agent_private.runs(owner_id,created_at desc);
create table agent_private.policies (
  owner_id uuid primary key references auth.users on delete cascade,
  suppress_duplicates boolean not null default false
);
create table agent_private.action_log (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users on delete cascade,
  run_id uuid not null references agent_private.runs on delete cascade,
  action text not null, created_at timestamptz not null default now()
);
create function agent_private.queue_event() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if TG_TABLE_NAME='transaction_sync_events' then
   insert into agent_private.runs(owner_id,event_key,trigger,topic)
   select new.user_id,'sync:'||new.id,'sync',topic from unnest(array['cash','recurring','reconciliation']) as topic
   on conflict do nothing;
 else
   insert into agent_private.runs(owner_id,event_key,trigger,topic,event)
   values(new.owner_id,'event:'||new.event_key,'event',
     case new.destination when 'anomaly-investigator' then 'anomaly' else 'cash' end,new.event_key)
   on conflict do nothing;
 end if;
 return new;
end $$;
revoke all on function agent_private.queue_event() from public;
create trigger agent_sync after insert on public.transaction_sync_events
for each row execute function agent_private.queue_event();
create trigger agent_signal after insert on public.finance_events
for each row execute function agent_private.queue_event();
alter table public.plaid_tokens add column item_id text unique;
commit;
