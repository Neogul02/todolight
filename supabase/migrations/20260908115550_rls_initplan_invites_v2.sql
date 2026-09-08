-- org_invites 두 정책만 다시 — 린터가 인정하는 서브쿼리 모양으로 맞춘다.
--
-- 115503에서 `lower(coalesce((select auth.jwt() ->> 'email'), ''))`로 썼는데, 의미상으로는
-- 이미 InitPlan인데도 `auth_rls_initplan` 린트가 계속 걸렸다. 린터는 서브쿼리가
-- **`(select auth.jwt())` 그 모양 그대로**일 때만 인정한다 — JSON 추출과 lower/coalesce는
-- 서브쿼리 밖으로 뺀다. 판정 결과는 세 형태 모두 같고, 바뀌는 건 린트 통과 여부뿐이다.
-- (원격에는 이 사이에 중간 시도 하나가 더 적용돼 있다: 20260908115527. 여기에 흡수됐다.)

drop policy if exists org_invites_select on public.org_invites;
create policy org_invites_select on public.org_invites for select
  using (
    public.is_org_member(org_id)
    or lower(email) = lower(coalesce((select auth.jwt()) ->> 'email', ''))
  );

drop policy if exists org_invites_update on public.org_invites;
create policy org_invites_update on public.org_invites for update
  using (
    public.is_org_manager(org_id)
    or lower(email) = lower(coalesce((select auth.jwt()) ->> 'email', ''))
  );
