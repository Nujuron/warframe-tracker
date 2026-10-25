-- Evaluate each JWT once per statement, rather than once per candidate row.
alter policy profiles_read on public.profiles using(id=(select auth.uid()) and ((select auth.jwt())->>'client_id') is null);
alter policy profiles_insert on public.profiles with check(id=(select auth.uid()) and ((select auth.jwt())->>'client_id') is null);
alter policy profiles_update on public.profiles using(id=(select auth.uid()) and ((select auth.jwt())->>'client_id') is null) with check(id=(select auth.uid()) and ((select auth.jwt())->>'client_id') is null);
alter policy grant_insert on public.oauth_client_grants with check(user_id=(select auth.uid()) and ((select auth.jwt())->>'client_id') is null);
alter policy grant_update on public.oauth_client_grants using(user_id=(select auth.uid()) and ((select auth.jwt())->>'client_id') is null) with check(user_id=(select auth.uid()) and ((select auth.jwt())->>'client_id') is null);
