-- 할 일 넘기기 — 내 할 일을 다른 팀원 컬럼으로 옮긴다
--
-- `todos.owner_id`를 바꾸는 길은 원래 `updateTodo({ ownerId })`에 있었지만 화면이 없었고,
-- 서버는 **조직 멤버면 누구나** 남의 할 일 주인을 바꿀 수 있었다. 넘기기를 정식 기능으로
-- 올리면서 권한(주인 · 만든 사람 · 방장/관리자)과 부수 효과를 함수 하나로 묶는다.
--
-- ## given_by
-- 카드의 "OOO이 부탁" 배지는 `created_by <> owner_id`로 뜬다. 그런데 A가 부탁한 걸 내가 C에게
-- 넘기면 C의 카드에는 "A가 부탁"이 뜬다 — C의 목록에 넣은 건 나인데. 그래서 **마지막으로
-- 넘긴 사람**을 따로 적는다. `created_by`는 그대로 둔다(지울 권한이 거기 걸려 있다).
-- 인덱스는 만들지 않는다 — 다른 사람 FK들과 같은 이유(20260908115831 참고).
alter table public.todos
  add column if not exists given_by uuid references public.profiles(id);

-- ## give_todo
-- 한 트랜잭션에서:
--   1. 행을 잡고(for update) 권한 · 상태를 검사한다 — TS에서 검사하고 갱신하면 그 사이에 끼어든다.
--   2. 받는 사람 컬럼의 맨 위로 보낸다(insert_todo_at_top과 같은 advisory lock).
--   3. 받는 사람이 "같이하기" 참여자였으면 참여를 걷는다 — 주인이면서 참여자면 컬럼에 두 번 뜬다.
--   4. 메모가 있으면 함께 남긴다("이거 좀 부탁해요").
create or replace function public.give_todo(
  p_todo uuid,
  p_actor uuid,
  p_to uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_todo public.todos;
  v_role text;
  v_note public.todo_notes;
begin
  select * into v_todo
  from public.todos
  where id = p_todo and deleted_at is null
  for update;
  if not found then
    raise exception 'TODO_NOT_FOUND';
  end if;

  select role into v_role
  from public.org_members
  where org_id = v_todo.org_id and user_id = p_actor;
  if v_role is null then
    raise exception 'NOT_A_MEMBER';
  end if;

  if v_todo.owner_id <> p_actor
     and v_todo.created_by <> p_actor
     and v_role not in ('owner', 'admin') then
    raise exception 'CANNOT_GIVE';
  end if;

  -- 끝난 일을 넘기는 건 의미가 없고, 남의 "완료" 목록에 옛날 일이 끼어든다.
  if v_todo.status = 'done' then
    raise exception 'ALREADY_DONE';
  end if;

  if p_to = v_todo.owner_id then
    raise exception 'SAME_OWNER';
  end if;

  if not exists (
    select 1 from public.org_members
    where org_id = v_todo.org_id and user_id = p_to
  ) then
    raise exception 'TARGET_NOT_MEMBER';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_todo.org_id::text || ':' || p_to::text, 0));

  update public.todos
  set owner_id = p_to,
      given_by = p_actor,
      position = coalesce(
        (select min(position) from public.todos
         where org_id = v_todo.org_id and owner_id = p_to and deleted_at is null),
        1
      ) - 1
  where id = p_todo
  returning * into v_todo;

  delete from public.todo_participants
  where todo_id = p_todo and user_id = p_to;

  if p_note is not null and length(btrim(p_note)) > 0 then
    insert into public.todo_notes (todo_id, author_id, content)
    values (p_todo, p_actor, btrim(p_note))
    returning * into v_note;
  end if;

  return jsonb_build_object(
    'todo', to_jsonb(v_todo),
    'note', case when v_note.id is null then null else to_jsonb(v_note) end
  );
end;
$$;

-- actor를 파라미터로 믿는 함수다 — 열어 두면 아무 actor나 적어 남의 할 일을 옮길 수 있다.
revoke all on function public.give_todo(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.give_todo(uuid, uuid, uuid, text) to service_role;
