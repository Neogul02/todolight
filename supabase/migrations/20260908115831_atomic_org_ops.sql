-- 여러 문장으로 나뉘어 있던 작업을 원자적 연산 하나로 모은다
--
-- **supabase-js에는 트랜잭션이 없다.** `.from(...).insert()`는 각각 별개의 HTTP 요청이라,
-- 서버 액션이 두 문장을 연달아 보내는 순간 그 사이에서 죽으면 절반만 반영된 상태가 남는다.
-- 지금 코드가 `createOrg`에서 "멤버 등록이 실패하면 조직을 지운다"는 보상 로직을 손으로
-- 들고 있는 게 그 증거다 — 보상 로직 자체도 실패할 수 있다.
--
-- 함수 하나는 곧 트랜잭션 하나다. 아래 넷은 전부 "다 되거나 아무것도 안 되거나"가 된다.
-- 덤으로 왕복 횟수도 줄어든다(조직 생성 2회 → 1회, 할 일 추가 2회 → 1회).
--
-- **actor를 파라미터로 받는다.** 서버 액션은 service role로 부르므로 함수 안에서
-- `auth.uid()`를 읽으면 NULL이다. 대신 `requireAuth()`가 확인한 사용자 id를 넘긴다 —
-- 그래서 이 함수들은 **클라이언트가 직접 부를 수 있으면 안 된다**(아무 actor나 적어 넣으면
-- 그대로 권한 상승이 된다). 파일 맨 아래에서 anon·authenticated의 실행 권한을 회수한다.

-- ──────────────────────────────────────────────
-- 조직 생성 — 조직과 방장 멤버 행이 같이 생긴다
-- ──────────────────────────────────────────────
create or replace function public.create_org_with_owner(p_name text, p_owner uuid)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org public.organizations;
begin
  insert into public.organizations (name, owner_id)
  values (p_name, p_owner)
  returning * into v_org;

  insert into public.org_members (org_id, user_id, role)
  values (v_org.id, p_owner, 'owner');

  return v_org;
end;
$$;

-- ──────────────────────────────────────────────
-- 소유권 이양
--
-- `organizations.owner_id`와 `org_members.role` **둘 다** 옮겨야 한다. 한쪽만 바뀌면
-- `is_org_manager`(role을 본다)와 화면(owner_id를 본다)이 서로 다른 답을 낸다.
--
-- 조직 행을 먼저 `for update`로 잠근다. 방장 둘이 동시에 이양을 시도하는 일은 없지만
-- (방장은 하나다), **이양과 조직 삭제가 겹치는 경우**는 실제로 가능하다 — 잠그지 않으면
-- 삭제된 조직에 새 방장을 앉히는 갱신이 통과할 수 있다.
-- ──────────────────────────────────────────────
create or replace function public.transfer_org_ownership(
  p_org uuid,
  p_actor uuid,
  p_new_owner uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner
  from public.organizations
  where id = p_org
  for update;

  if v_owner is null then
    raise exception 'ORG_NOT_FOUND';
  end if;
  if v_owner <> p_actor then
    raise exception 'NOT_OWNER';
  end if;
  if p_new_owner = p_actor then
    raise exception 'ALREADY_OWNER';
  end if;
  if not exists (
    select 1 from public.org_members
    where org_id = p_org and user_id = p_new_owner
  ) then
    raise exception 'NOT_A_MEMBER';
  end if;

  -- 새 방장부터 올린다. 순서를 뒤집어 옛 방장을 먼저 내리면, 그 사이에 다른 트랜잭션이
  -- 이 조직을 보면 방장이 하나도 없는 상태로 보인다.
  update public.org_members set role = 'owner'
  where org_id = p_org and user_id = p_new_owner;

  -- 물러난 방장은 **관리자로 남긴다.** 팀원으로 떨어뜨리면 방금까지 조직을 운영하던 사람이
  -- 초대 한 번 못 보내게 되는데, 그건 이양이 아니라 강등이다.
  update public.org_members set role = 'admin'
  where org_id = p_org and user_id = p_actor;

  update public.organizations set owner_id = p_new_owner
  where id = p_org;
end;
$$;

-- ──────────────────────────────────────────────
-- 조직 삭제 — 방장만. cascade가 할 일·메모·일정·가계부·멤버·초대를 함께 가져간다.
--
-- 이 앱에서 지우기는 전부 소프트 삭제지만 조직만은 예외다. 소프트 삭제는 "실수로 지웠을 때
-- 되돌린다"를 위한 것이고 그래서 확인 없이 바로 지울 수 있는데, 조직 삭제는 확인을 두 번
-- 거치는 동작이라 실수로 눌릴 일이 없다. 반대로 남겨 두면 모든 조회에 "지워진 조직 제외"가
-- 붙고, 한 번 빠뜨리면 지운 조직이 목록에 다시 나타난다.
-- ──────────────────────────────────────────────
create or replace function public.delete_org(p_org uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner
  from public.organizations
  where id = p_org
  for update;

  if v_owner is null then
    raise exception 'ORG_NOT_FOUND';
  end if;
  if v_owner <> p_actor then
    raise exception 'NOT_OWNER';
  end if;

  delete from public.organizations where id = p_org;
end;
$$;

-- ──────────────────────────────────────────────
-- 할 일을 컬럼 맨 위에 넣기
--
-- 예전에는 "맨 위 position을 읽고 → 그보다 작은 값으로 insert"를 **왕복 두 번**에 나눠
-- 했다. 그 사이에 다른 사람이 같은 컬럼에 넣으면 둘이 같은 값을 읽어 같은 position으로
-- 저장된다. 지금은 눈에 띄는 사고가 아니지만(정렬 동점은 created_at으로 갈린다),
-- position이 double인 이유가 "사이에 끼워 넣기"라서 값이 겹치기 시작하면 앞으로 만들
-- 드래그 정렬이 곧바로 무너진다.
--
-- 컬럼(조직 × 주인) 단위 advisory lock으로 **같은 컬럼에 들어오는 삽입만** 줄 세운다.
-- 다른 컬럼·다른 조직은 서로 기다리지 않는다. 트랜잭션이 끝나면 자동으로 풀린다.
-- ──────────────────────────────────────────────
create or replace function public.insert_todo_at_top(
  p_id uuid,
  p_org uuid,
  p_owner uuid,
  p_title text,
  p_due date,
  p_created_by uuid
)
returns public.todos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_todo public.todos;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_org::text || ':' || p_owner::text, 0));

  insert into public.todos (id, org_id, owner_id, title, due_date, position, created_by)
  values (
    coalesce(p_id, gen_random_uuid()),
    p_org,
    p_owner,
    p_title,
    p_due,
    coalesce(
      (select min(position) from public.todos
       where org_id = p_org and owner_id = p_owner and deleted_at is null),
      1
    ) - 1,
    p_created_by
  )
  returning * into v_todo;

  return v_todo;
end;
$$;

-- ──────────────────────────────────────────────
-- 실행 권한
--
-- 네 함수 모두 **행위자를 파라미터로 믿는다.** PostgREST는 public 스키마의 함수를 그대로
-- RPC로 노출하므로, 권한을 회수하지 않으면 로그인한 아무나 `p_actor`에 남의 id를 적어
-- 남의 조직을 지울 수 있다. service role만 부를 수 있게 잠근다.
-- ──────────────────────────────────────────────
revoke all on function public.create_org_with_owner(text, uuid) from public, anon, authenticated;
revoke all on function public.transfer_org_ownership(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.delete_org(uuid, uuid) from public, anon, authenticated;
revoke all on function public.insert_todo_at_top(uuid, uuid, uuid, text, date, uuid) from public, anon, authenticated;

grant execute on function public.create_org_with_owner(text, uuid) to service_role;
grant execute on function public.transfer_org_ownership(uuid, uuid, uuid) to service_role;
grant execute on function public.delete_org(uuid, uuid) to service_role;
grant execute on function public.insert_todo_at_top(uuid, uuid, uuid, text, date, uuid) to service_role;

-- ──────────────────────────────────────────────
-- 인덱스
--
-- 린터는 인덱스 없는 FK를 10개 잡아 주지만, 그 린트의 전제는 "부모 행이 지워질 때 자식을
-- 훑는다"이다. 이 스키마에서 부모가 실제로 지워지는 경로는 **조직 삭제 하나뿐**이다 —
-- `profiles`는 계정 삭제 뒤에도 묘비로 남으므로(20260908115046) 영영 지워지지 않는다.
-- 그래서 사람 id를 가리키는 FK 9개(todos.owner_id·created_by·handled_by,
-- todo_notes.author_id, ledger_entries.payer_id·created_by, org_events.created_by,
-- todo_participants.user_id, organizations.owner_id)에는 인덱스를 만들지 않는다.
-- 앱이 그 컬럼 단독으로 조회하는 곳도 없다(할 일은 늘 `(org_id, owner_id)`로 읽고
-- 그건 `todos_org_owner_alive_idx`가 덮는다). 쓰기마다 갱신할 인덱스만 아홉 개 늘 뿐이다.
--
-- 예외가 org_invites다. 조직 삭제 cascade가 `org_id`로 훑는데 지금 있는 인덱스는
-- `(org_id, lower(email)) where status='pending'`이라 **거절·취소된 초대를 못 덮는다.**
-- 조직 삭제를 사용자가 직접 누를 수 있게 되는 순간 이게 seq scan이 된다.
-- ──────────────────────────────────────────────
create index if not exists org_invites_org_idx on public.org_invites (org_id);
