create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default '' check(length(display_name)<=80)
);
create table public.equipment_catalogue (
 id text primary key, name text not null, category text not null, data jsonb not null,
 retired boolean not null default false
);
create table public.data_snapshots (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table public.oauth_client_grants (
 user_id uuid not null references auth.users(id) on delete cascade, client_id text not null,
 granted_at timestamptz not null default now(), revoked_at timestamptz,
 primary key(user_id,client_id)
);
create table public.tracker_state (
 user_id uuid primary key references auth.users(id) on delete cascade, revision integer not null default 0
);
create table public.user_equipment (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 identity_key text not null, catalogue_id text references public.equipment_catalogue(id),
 name text not null check(length(name) between 1 and 160), category text not null check(length(category) between 1 and 80),
 status text not null default 'missing' check(status in ('missing','building','owned','mastered')),
 priority boolean not null default false, notes text not null default '' check(length(notes)<=10000),
 parts jsonb not null default '{}' check(jsonb_typeof(parts)='object'), rank text not null default '' check(length(rank)<=80),
 revision integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(user_id,identity_key)
);
create index user_equipment_owner_idx on public.user_equipment(user_id,category,name);
create index user_equipment_catalogue_idx on public.user_equipment(catalogue_id);
create table public.import_previews (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 payload jsonb not null, expected_revision integer not null, created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '15 minutes', applied_at timestamptz, result jsonb
);
create index import_previews_owner_idx on public.import_previews(user_id,expires_at);

alter table public.profiles enable row level security;
alter table public.equipment_catalogue enable row level security;
alter table public.data_snapshots enable row level security;
alter table public.oauth_client_grants enable row level security;
alter table public.tracker_state enable row level security;
alter table public.user_equipment enable row level security;
alter table public.import_previews enable row level security;
revoke all on public.profiles,public.equipment_catalogue,public.data_snapshots,public.oauth_client_grants,public.tracker_state,public.user_equipment,public.import_previews from anon,authenticated;
grant select on public.equipment_catalogue,public.data_snapshots to anon,authenticated;
grant select,insert,update on public.profiles,public.oauth_client_grants,public.tracker_state,public.import_previews to authenticated;
grant select,insert,update,delete on public.user_equipment to authenticated;
grant all on public.profiles,public.equipment_catalogue,public.data_snapshots,public.oauth_client_grants,public.tracker_state,public.user_equipment,public.import_previews to service_role;
create policy catalogue_read on public.equipment_catalogue for select to anon,authenticated using(true);
create policy snapshot_read on public.data_snapshots for select to anon,authenticated using(true);
create policy profiles_read on public.profiles for select to authenticated using(id=(select auth.uid()) and (select auth.jwt()->>'client_id') is null);
create policy profiles_insert on public.profiles for insert to authenticated with check(id=(select auth.uid()) and (select auth.jwt()->>'client_id') is null);
create policy profiles_update on public.profiles for update to authenticated using(id=(select auth.uid()) and (select auth.jwt()->>'client_id') is null) with check(id=(select auth.uid()) and (select auth.jwt()->>'client_id') is null);
create policy grant_read on public.oauth_client_grants for select to authenticated using(user_id=(select auth.uid()));
create policy grant_insert on public.oauth_client_grants for insert to authenticated with check(user_id=(select auth.uid()) and (select auth.jwt()->>'client_id') is null);
create policy grant_update on public.oauth_client_grants for update to authenticated using(user_id=(select auth.uid()) and (select auth.jwt()->>'client_id') is null) with check(user_id=(select auth.uid()) and (select auth.jwt()->>'client_id') is null);
create function public.tracker_access() returns boolean language sql stable security invoker set search_path='' as $$
 select auth.uid() is not null and ((auth.jwt()->>'client_id') is null or exists(select 1 from public.oauth_client_grants g where g.user_id=auth.uid() and g.client_id=auth.jwt()->>'client_id' and g.revoked_at is null));
$$;
revoke all on function public.tracker_access() from public;
grant execute on function public.tracker_access() to authenticated;
create policy state_read on public.tracker_state for select to authenticated using(user_id=(select auth.uid()) and (select public.tracker_access()));
create policy state_insert on public.tracker_state for insert to authenticated with check(user_id=(select auth.uid()) and (select public.tracker_access()));
create policy state_update on public.tracker_state for update to authenticated using(user_id=(select auth.uid()) and (select public.tracker_access())) with check(user_id=(select auth.uid()) and (select public.tracker_access()));
create policy equipment_read on public.user_equipment for select to authenticated using(user_id=(select auth.uid()) and (select public.tracker_access()));
create policy equipment_insert on public.user_equipment for insert to authenticated with check(user_id=(select auth.uid()) and (select public.tracker_access()));
create policy equipment_update on public.user_equipment for update to authenticated using(user_id=(select auth.uid()) and (select public.tracker_access())) with check(user_id=(select auth.uid()) and (select public.tracker_access()));
create policy equipment_delete on public.user_equipment for delete to authenticated using(user_id=(select auth.uid()) and (select public.tracker_access()));
create policy preview_read on public.import_previews for select to authenticated using(user_id=(select auth.uid()) and (select public.tracker_access()));
create policy preview_insert on public.import_previews for insert to authenticated with check(user_id=(select auth.uid()) and (select public.tracker_access()));
create policy preview_update on public.import_previews for update to authenticated using(user_id=(select auth.uid()) and (select public.tracker_access())) with check(user_id=(select auth.uid()) and (select public.tracker_access()));

-- Return the list and its revision from one database statement/snapshot.
create function public.read_tracker() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
  'items',coalesce((select jsonb_agg(to_jsonb(e) order by e.name,e.id) from public.user_equipment e where e.user_id=auth.uid()),'[]'::jsonb),
  'revision',coalesce((select s.revision from public.tracker_state s where s.user_id=auth.uid()),0)
 );
$$;
revoke all on function public.read_tracker() from public;
grant execute on function public.read_tracker() to authenticated;

create function public.save_equipment(payload jsonb, item_id uuid default null, expected_revision integer default null)
 returns public.user_equipment language plpgsql security invoker set search_path='' as $$
declare result public.user_equipment; actor uuid:=auth.uid(); existing public.user_equipment;
begin
 if not public.tracker_access() then raise exception 'UNAUTHORIZED'; end if;
 insert into public.tracker_state(user_id) values(actor) on conflict do nothing;
 perform 1 from public.tracker_state where user_id=actor for update;
 if item_id is null then
  select * into existing from public.user_equipment where user_id=actor and identity_key=payload->>'identity_key';
  if found then return existing; end if;
  insert into public.user_equipment(user_id,identity_key,catalogue_id,name,category,status,priority,notes,parts,rank)
  values(actor,payload->>'identity_key',payload->>'catalogue_id',payload->>'name',payload->>'category',coalesce(payload->>'status','missing'),coalesce((payload->>'priority')::boolean,false),coalesce(payload->>'notes',''),coalesce(payload->'parts','{}'),coalesce(payload->>'rank','')) returning * into result;
 else
  select * into existing from public.user_equipment where id=item_id and user_id=actor for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if expected_revision is null or expected_revision<>existing.revision then raise exception 'CONFLICT'; end if;
  update public.user_equipment set name=coalesce(payload->>'name',name),category=coalesce(payload->>'category',category),identity_key=coalesce(payload->>'identity_key',identity_key),status=coalesce(payload->>'status',status),priority=coalesce((payload->>'priority')::boolean,priority),notes=coalesce(payload->>'notes',notes),parts=coalesce(payload->'parts',parts),rank=coalesce(payload->>'rank',rank),revision=revision+1,updated_at=now() where id=item_id and user_id=actor returning * into result;
 end if;
 update public.tracker_state set revision=revision+1 where user_id=actor;
 return result;
end $$;
revoke all on function public.save_equipment(jsonb,uuid,integer) from public;
grant execute on function public.save_equipment(jsonb,uuid,integer) to authenticated;

create function public.apply_equipment_import(preview_id uuid, replace_progress boolean default false)
 returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor uuid:=auth.uid(); preview public.import_previews; current_revision integer; entry jsonb; existing public.user_equipment; v_result jsonb; added integer:=0; updated integer:=0;
begin
 if not public.tracker_access() then raise exception 'UNAUTHORIZED'; end if;
 insert into public.tracker_state(user_id) values(actor) on conflict do nothing;
 select revision into current_revision from public.tracker_state where user_id=actor for update;
 select * into preview from public.import_previews where id=preview_id and user_id=actor for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if preview.applied_at is not null then return preview.result; end if;
 if preview.expires_at<now() then raise exception 'EXPIRED'; end if;
 if preview.expected_revision<>current_revision then raise exception 'CONFLICT'; end if;
 for entry in select value from jsonb_array_elements(preview.payload) loop
  select * into existing from public.user_equipment where user_id=actor and identity_key=entry->>'identity_key';
  if not found then perform public.save_equipment(entry); added:=added+1;
  elsif replace_progress then
   perform public.save_equipment(entry,existing.id,existing.revision); updated:=updated+1;
  end if;
 end loop;
 v_result:=jsonb_build_object('added',added,'updated',updated,'preserved',jsonb_array_length(preview.payload)-added-updated);
 update public.import_previews set applied_at=now(),result=v_result where id=preview_id and user_id=actor;
 return v_result;
end $$;
revoke all on function public.apply_equipment_import(uuid,boolean) from public;
grant execute on function public.apply_equipment_import(uuid,boolean) to authenticated;

create function public.reset_tracker(expected_revision integer) returns void language plpgsql security invoker set search_path='' as $$
declare rev integer;
begin
 if auth.uid() is null or (auth.jwt()->>'client_id') is not null then raise exception 'UNAUTHORIZED'; end if;
 insert into public.tracker_state(user_id) values(auth.uid()) on conflict do nothing;
 select revision into rev from public.tracker_state where user_id=auth.uid() for update;
 if rev<>expected_revision then raise exception 'CONFLICT'; end if;
 delete from public.user_equipment where user_id=auth.uid();
 update public.tracker_state set revision=revision+1 where user_id=auth.uid();
end $$;
revoke all on function public.reset_tracker(integer) from public;
grant execute on function public.reset_tracker(integer) to authenticated;

create function public.publish_catalogue(payload jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare i jsonb;
begin
 if jsonb_array_length(payload->'catalogue')<750 or payload->'primes'->'equipment'->'citrineprime' is null then raise exception 'INVALID_SNAPSHOT'; end if;
 update public.equipment_catalogue set retired=true;
 for i in select value from jsonb_array_elements(payload->'catalogue') loop
  insert into public.equipment_catalogue(id,name,category,data,retired) values(i->>'id',i->>'name',i->>'category',i,false)
  on conflict(id) do update set name=excluded.name,category=excluded.category,data=excluded.data,retired=false;
 end loop;
 insert into public.data_snapshots(id,data) values('current',payload->'primes') on conflict(id) do update set data=excluded.data,updated_at=now();
end $$;
revoke all on function public.publish_catalogue(jsonb) from public,anon,authenticated;
grant execute on function public.publish_catalogue(jsonb) to service_role;
