-- 보드 조회를 유계로 만들고 왕복 세 번을 한 번으로 합친다
--
-- `fetchOrgTodos`는 조직의 **모든** 미삭제 할 일 + 모든 메모 + 모든 참여자를 읽었다.
-- 완료한 할 일은 영원히 쌓이기만 하므로 이 조회는 무한히 커진다 — 보드를 열 때마다,
-- invalidate될 때마다 전부 넘어온다. 실제 데이터로 재 보니 살아 있는 127건 중 **미완료는
-- 18건**이었다. 나머지 109건은 매번 실려 오지만 화면에는 사람당 3개만 펼쳐진다.
--
-- 미완료는 전부 준다 — "지금 해야 할 일"이라 사람이 감당할 만큼만 쌓여 자연히 유계이고,
-- 컬럼 정렬(지난 마감 → 오늘 → 나중 → 마감 없음)이 전체를 봐야 성립한다.
-- **완료는 주인별 최근 N개만** 주고 그보다 오래된 것은 개수(`done_totals`)만 준다.
-- 보드가 이미 완료를 3개만 펼치고 나머지를 "+N개 더 보기"로 접고 있어서, 이 모양이
-- 화면이 원래 하던 일과 정확히 맞는다.
--
-- 대가: 달력에서 **아주 오래전에 끝낸 할 일**은 그 날짜를 눌러도 안 나온다(미완료는 전부
-- 있으므로 월 격자의 "남은 개수"와 미완료 목록은 그대로다). 달력은 "언제 몰려 있나"를 보는
-- 화면이라 미완료가 본체이고, 그 대가로 매 조회가 유계가 된다.
create or replace function public.fetch_org_board(
  p_org uuid,
  p_actor uuid,
  p_done_limit int default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  -- 멤버 검사도 여기서 한다 — 예전에는 이것만으로 왕복이 하나 더 있었다.
  if not exists (
    select 1 from public.org_members
    where org_id = p_org and user_id = p_actor
  ) then
    raise exception 'NOT_A_MEMBER';
  end if;

  with ranked as (
    select
      t.*,
      case when t.status = 'done' then
        row_number() over (
          partition by t.owner_id
          order by t.completed_at desc nulls last, t.updated_at desc
        )
      end as done_rank
    from public.todos t
    where t.org_id = p_org and t.deleted_at is null
  ),
  kept as (
    select * from ranked
    where status <> 'done' or done_rank <= p_done_limit
  )
  select jsonb_build_object(
    'todos', coalesce((
      select jsonb_agg(to_jsonb(k) - 'done_rank' order by k.position, k.created_at)
      from kept k
    ), '[]'::jsonb),

    -- 메모는 **돌려주는 할 일의 것만.** 작성자 이름·아바타 조인이 필요해서 여기서 함께 만든다.
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id,
        'todo_id', n.todo_id,
        'author_id', n.author_id,
        'content', n.content,
        'created_at', n.created_at,
        'author_name', p.display_name,
        'author_color', p.avatar_color,
        'author_avatar_url', p.avatar_url
      ) order by n.created_at)
      from public.todo_notes n
      join kept k on k.id = n.todo_id
      join public.profiles p on p.id = n.author_id
    ), '[]'::jsonb),

    'participants', coalesce((
      select jsonb_agg(jsonb_build_object('todo_id', tp.todo_id, 'user_id', tp.user_id))
      from public.todo_participants tp
      join kept k on k.id = tp.todo_id
    ), '[]'::jsonb),

    -- 주인별 완료 **총** 개수. 화면은 여기서 실제로 받은 개수를 빼서
    -- "이보다 오래된 것이 몇 개 더 있는지"를 말한다.
    'done_totals', coalesce((
      select jsonb_object_agg(owner_id, n)
      from (
        select owner_id, count(*)::int as n
        from ranked
        where status = 'done'
        group by owner_id
      ) s
    ), '{}'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- actor를 파라미터로 믿으므로 클라이언트가 부를 수 있으면 안 된다(「동시 요청과 원자성」)
revoke all on function public.fetch_org_board(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.fetch_org_board(uuid, uuid, int) to service_role;

-- 완료 할 일을 주인별 최근순으로 잘라 내는 것이 이 조회의 핵심 작업이 됐다.
-- 기존 `todos_org_owner_alive_idx`는 정렬 키가 `(status, position)`이라 completed_at 정렬을
-- 못 돕는다. 완료 행만 담는 부분 인덱스를 따로 둔다 — 미완료 조회에는 영향이 없고,
-- 인덱스가 커지는 속도도 딱 "완료한 할 일"만큼이다.
create index if not exists todos_org_owner_done_idx
  on public.todos (org_id, owner_id, completed_at desc)
  where deleted_at is null and status = 'done';
