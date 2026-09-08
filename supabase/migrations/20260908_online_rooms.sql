-- Ephemeral matches only. No public table writes or room listing.
create table public.kp_online_rooms (
 id uuid primary key default gen_random_uuid(),
 code text not null unique,
 host_id uuid not null references auth.users(id) on delete cascade,
 guest_id uuid references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now() + interval '45 minutes',
 closed boolean not null default false,
 constraint different_players check (host_id <> guest_id)
);
alter table public.kp_online_rooms enable row level security;
revoke all on public.kp_online_rooms from anon, authenticated;
grant select on public.kp_online_rooms to authenticated;
create policy kp_room_members on public.kp_online_rooms for select to authenticated
 using ((select auth.uid()) in (host_id, guest_id) and not closed and expires_at > now());
create index kp_online_guest on public.kp_online_rooms(guest_id);
create index kp_online_host on public.kp_online_rooms(host_id);

create table public.kp_online_limits (
 key text primary key, count integer not null default 1,
 expires_at timestamptz not null
);
alter table public.kp_online_limits enable row level security;
revoke all on public.kp_online_limits from anon, authenticated;

create function public.kp_online_rate_limit(p_key text, p_max integer, p_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
 delete from public.kp_online_limits where expires_at < now();
 insert into public.kp_online_limits(key, expires_at) values (p_key, now()+make_interval(secs=>p_seconds))
 on conflict(key) do update set count=public.kp_online_limits.count+1 returning count into n;
 return n <= p_max;
end $$;
revoke all on function public.kp_online_rate_limit(text,integer,integer) from public, anon, authenticated;
grant execute on function public.kp_online_rate_limit(text,integer,integer) to service_role;

create function public.kp_online_join(p_code text,p_user uuid)
returns setof public.kp_online_rooms language plpgsql security definer set search_path = '' as $$
begin
 return query update public.kp_online_rooms set guest_id=p_user
 where code=p_code and guest_id is null and host_id<>p_user and not closed and expires_at>now()
 returning *;
end $$;
revoke all on function public.kp_online_join(text,uuid) from public, anon, authenticated;
grant execute on function public.kp_online_join(text,uuid) to service_role;

-- Two directions have separate write permissions: guests cannot forge host snapshots.
create policy kp_online_receive on realtime.messages for select to authenticated
 using (extension='broadcast' and exists (
 select 1 from public.kp_online_rooms r where
 (select realtime.topic()) in ('kp:'||r.id::text||':host','kp:'||r.id::text||':guest')
 and (select auth.uid()) in (r.host_id,r.guest_id) and not r.closed and r.expires_at>now()));
create policy kp_online_send on realtime.messages for insert to authenticated
 with check (extension='broadcast' and exists (
 select 1 from public.kp_online_rooms r where not r.closed and r.expires_at>now() and
 (((select realtime.topic())='kp:'||r.id::text||':host' and (select auth.uid())=r.host_id)
 or ((select realtime.topic())='kp:'||r.id::text||':guest' and (select auth.uid())=r.guest_id))));

-- Clean up only service-created game identities; never touch ordinary accounts.
create function public.kp_online_cleanup() returns void
language plpgsql security definer set search_path = '' as $$
begin
 delete from public.kp_online_rooms where expires_at<now() or (closed and created_at<now()-interval '5 minutes');
 delete from auth.users where id in (select id from auth.users
 where raw_app_meta_data->>'kp_ephemeral'='true' and created_at<now()-interval '2 hours'
 and not exists(select 1 from public.kp_online_rooms r where auth.users.id in(r.host_id,r.guest_id)) limit 30);
end $$;
revoke all on function public.kp_online_cleanup() from public, anon, authenticated;
grant execute on function public.kp_online_cleanup() to service_role;
