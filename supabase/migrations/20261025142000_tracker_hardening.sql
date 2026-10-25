-- Supabase's default event-trigger helper is not an application RPC.
do $$
begin
 if to_regprocedure('public.rls_auto_enable()') is not null then
  revoke execute on function public.rls_auto_enable() from public,anon,authenticated;
 end if;
end $$;

-- Hosted projects enable safe-update checks, including inside invoker RPCs.
create or replace function public.publish_catalogue(payload jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare i jsonb;
begin
 if jsonb_array_length(payload->'catalogue')<750 or payload->'primes'->'equipment'->'citrineprime' is null then raise exception 'INVALID_SNAPSHOT'; end if;
 update public.equipment_catalogue set retired=true where retired=false;
 for i in select value from jsonb_array_elements(payload->'catalogue') loop
  insert into public.equipment_catalogue(id,name,category,data,retired) values(i->>'id',i->>'name',i->>'category',i,false)
  on conflict(id) do update set name=excluded.name,category=excluded.category,data=excluded.data,retired=false;
 end loop;
 insert into public.data_snapshots(id,data) values('current',payload->'primes') on conflict(id) do update set data=excluded.data,updated_at=now();
end $$;
