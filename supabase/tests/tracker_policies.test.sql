begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(10);
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000000001','tracker-policy-a@example.test'),
 ('00000000-0000-4000-8000-000000000002','tracker-policy-b@example.test');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*) from user_equipment),0::bigint,'new account is empty');
select lives_ok($$select public.save_equipment('{"name":"Policy frame","category":"Other","identity_key":"custom:other:policy frame","notes":"private"}')$$,'owner can add equipment');
select is((select count(*) from user_equipment),1::bigint,'owner can read their item');
select lives_ok($$select public.save_equipment('{"name":"Policy frame","category":"Other","identity_key":"custom:other:policy frame"}')$$,'repeated add succeeds');
select is((select count(*) from user_equipment),1::bigint,'repeated add does not duplicate');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*) from user_equipment),0::bigint,'another user cannot see first account');
select throws_ok($$insert into public.user_equipment(user_id,identity_key,name,category) values('00000000-0000-4000-8000-000000000001','forged','Forged','Other')$$,'42501',null,'cannot forge equipment ownership');
select throws_ok($$insert into public.equipment_catalogue(id,name,category,data) values('forged','Forged','Other','{}')$$,'42501',null,'ordinary users cannot change the catalogue');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","client_id":"unapproved"}',true);
select is((select count(*) from user_equipment),0::bigint,'unapproved OAuth client cannot read personal equipment');
set local role anon;
select throws_ok($$select * from public.user_equipment$$,'42501',null,'anonymous requests cannot read personal equipment');
select * from finish();
rollback;
