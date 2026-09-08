-- RLS 정책의 auth.uid() / auth.jwt() 재평가 제거
--
-- 정책 식에 `auth.uid()`를 그냥 쓰면 Postgres가 **검사하는 행마다** 그 함수를 다시 부른다.
-- `(select auth.uid())`로 감싸면 InitPlan이 되어 문장당 한 번만 평가되고 결과가 재사용된다.
-- (Supabase 린터 `auth_rls_initplan`이 19건 잡아 준 것이 전부 이 모양이었다.)
--
-- **이 앱에서 이게 실제로 아픈 자리는 서버 액션이 아니라 실시간이다.** 서버 액션은
-- service role로 RLS를 우회하지만, `board-{orgId}` 채널의 변경 브로드캐스트는 **구독자마다,
-- 행마다** RLS를 다시 판정한다. 한 조직에 붙은 사람이 늘수록 이 비용이 그대로 곱해진다 —
-- 즉 "유저가 많아졌을 때" 정확히 먼저 무너지는 지점이다.
--
-- 정책의 **의미는 한 글자도 바뀌지 않는다.** 언제 평가하느냐만 바뀐다.

-- ──────────────────────────────────────────────
-- 헬퍼 함수 — 본문 안의 auth.uid()도 같은 이유로 감싼다
-- ──────────────────────────────────────────────
create or replace function public.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.org_members m
    where m.org_id = p_org and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_org_manager(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.org_members m
    where m.org_id = p_org and m.user_id = (select auth.uid()) and m.role in ('owner', 'admin')
  );
$$;

create or replace function public.shares_org_with(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.org_members me
    join public.org_members other on other.org_id = me.org_id
    where me.user_id = (select auth.uid()) and other.user_id = p_user
  );
$$;

-- ──────────────────────────────────────────────
-- profiles
-- ──────────────────────────────────────────────
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (id = (select auth.uid()) or public.shares_org_with(id));

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ──────────────────────────────────────────────
-- organizations
-- ──────────────────────────────────────────────
drop policy if exists organizations_insert on public.organizations;
create policy organizations_insert on public.organizations for insert
  with check (owner_id = (select auth.uid()));

drop policy if exists organizations_delete on public.organizations;
create policy organizations_delete on public.organizations for delete
  using (owner_id = (select auth.uid()));

-- ──────────────────────────────────────────────
-- org_members
-- ──────────────────────────────────────────────
drop policy if exists org_members_select on public.org_members;
create policy org_members_select on public.org_members for select
  using (user_id = (select auth.uid()) or public.is_org_member(org_id));

drop policy if exists org_members_delete on public.org_members;
create policy org_members_delete on public.org_members for delete
  using (public.is_org_manager(org_id) or user_id = (select auth.uid()));

-- ──────────────────────────────────────────────
-- org_invites — 이메일 비교는 JWT를 파싱한다. 행마다 다시 파싱하면 가장 비싸다.
-- ──────────────────────────────────────────────
drop policy if exists org_invites_select on public.org_invites;
create policy org_invites_select on public.org_invites for select
  using (
    public.is_org_member(org_id)
    or lower(email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  );

drop policy if exists org_invites_insert on public.org_invites;
create policy org_invites_insert on public.org_invites for insert
  with check (public.is_org_manager(org_id) and invited_by = (select auth.uid()));

drop policy if exists org_invites_update on public.org_invites;
create policy org_invites_update on public.org_invites for update
  using (
    public.is_org_manager(org_id)
    or lower(email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  );

-- ──────────────────────────────────────────────
-- todos — 실시간 브로드캐스트가 가장 많이 지나는 테이블이다
-- ──────────────────────────────────────────────
drop policy if exists todos_insert on public.todos;
create policy todos_insert on public.todos for insert
  with check (public.is_org_member(org_id) and created_by = (select auth.uid()));

drop policy if exists todos_delete on public.todos;
create policy todos_delete on public.todos for delete
  using (owner_id = (select auth.uid()) or public.is_org_manager(org_id));

-- ──────────────────────────────────────────────
-- todo_notes
-- ──────────────────────────────────────────────
drop policy if exists todo_notes_insert on public.todo_notes;
create policy todo_notes_insert on public.todo_notes for insert
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.todos t
      where t.id = todo_notes.todo_id and public.is_org_member(t.org_id)
    )
  );

drop policy if exists todo_notes_delete on public.todo_notes;
create policy todo_notes_delete on public.todo_notes for delete
  using (author_id = (select auth.uid()));

-- ──────────────────────────────────────────────
-- todo_participants
-- ──────────────────────────────────────────────
drop policy if exists todo_participants_insert on public.todo_participants;
create policy todo_participants_insert on public.todo_participants for insert
  with check (public.is_org_member(org_id) and user_id = (select auth.uid()));

drop policy if exists todo_participants_delete on public.todo_participants;
create policy todo_participants_delete on public.todo_participants for delete
  using (user_id = (select auth.uid()) or public.is_org_manager(org_id));

-- ──────────────────────────────────────────────
-- org_events
-- ──────────────────────────────────────────────
drop policy if exists org_events_insert on public.org_events;
create policy org_events_insert on public.org_events for insert
  with check (public.is_org_member(org_id) and created_by = (select auth.uid()));

drop policy if exists org_events_delete on public.org_events;
create policy org_events_delete on public.org_events for delete
  using (created_by = (select auth.uid()) or public.is_org_manager(org_id));

-- ──────────────────────────────────────────────
-- ledger_entries
-- ──────────────────────────────────────────────
drop policy if exists ledger_entries_insert on public.ledger_entries;
create policy ledger_entries_insert on public.ledger_entries for insert
  with check (public.is_org_member(org_id) and created_by = (select auth.uid()));

drop policy if exists ledger_entries_update on public.ledger_entries;
create policy ledger_entries_update on public.ledger_entries for update
  using (
    created_by = (select auth.uid())
    or payer_id = (select auth.uid())
    or public.is_org_manager(org_id)
  );
