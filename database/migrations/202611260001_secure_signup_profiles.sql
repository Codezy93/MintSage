begin;
alter table public.users enable row level security;
revoke all privileges on table public.users from public, anon, authenticated;
grant select, update (name, phone) on public.users to authenticated;

create function public.create_signup_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.users(id, name, phone)
    values (new.id, new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'phone');
  return new;
end;
$$;
revoke all on function public.create_signup_profile() from public, anon, authenticated;
create trigger create_mintsage_profile after insert on auth.users
for each row execute function public.create_signup_profile();

insert into public.users(id, name, phone)
select id, raw_user_meta_data->>'name', raw_user_meta_data->>'phone' from auth.users
on conflict (id) do nothing;
commit;
