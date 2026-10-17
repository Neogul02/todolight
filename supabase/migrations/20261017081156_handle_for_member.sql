-- 대신 처리를 한 트랜잭션으로
--
-- `handleForMember`는 "완료 표시"와 "메모 insert"를 별개의 HTTP 요청 두 개로 동시에 보냈다.
-- 서버리스 인스턴스가 그 사이에 끝나거나 메모 쪽만 실패하면 **메모 없이 완료된 할 일**이 남는다 —
-- 대신 처리에서 메모를 강제하는 이유("남의 할 일이 말없이 사라지면 주인이 상황을 모른다")가
-- 바로 그 상태에서 무너진다. 멤버 확인까지 합쳐 왕복도 3→1로 준다.
--
-- 이미 끝난 할 일이면 막는다. 두 사람이 거의 동시에 대신 처리를 누르면 나중 사람이
-- handled_by를 덮어써서 "누가 처리했나"가 바뀌었다 — 행을 잡고(for update) 상태를 보면 그 틈이 없다.
create or replace function public.handle_for_member(
  p_todo uuid,
  p_actor uuid,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_todo public.todos;
  v_note public.todo_notes;
  v_profile public.profiles;
begin
  select * into v_todo
  from public.todos
  where id = p_todo and deleted_at is null
  for update;
  if not found then
    raise exception 'TODO_NOT_FOUND';
  end if;

  if not exists (
    select 1 from public.org_members
    where org_id = v_todo.org_id and user_id = p_actor
  ) then
    raise exception 'NOT_A_MEMBER';
  end if;

  if v_todo.status = 'done' then
    raise exception 'ALREADY_DONE';
  end if;

  update public.todos
  set status = 'done',
      completed_at = now(),
      handled_by = p_actor
  where id = p_todo
  returning * into v_todo;

  insert into public.todo_notes (todo_id, author_id, content)
  values (p_todo, p_actor, btrim(p_note))
  returning * into v_note;

  select * into v_profile from public.profiles where id = p_actor;

  return jsonb_build_object(
    'todo', to_jsonb(v_todo),
    'note', to_jsonb(v_note) || jsonb_build_object(
      'author_name', v_profile.display_name,
      'author_color', v_profile.avatar_color,
      'author_avatar_url', v_profile.avatar_url
    )
  );
end;
$$;

-- actor를 파라미터로 믿는 함수다 — service role만.
revoke all on function public.handle_for_member(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.handle_for_member(uuid, uuid, text) to service_role;
