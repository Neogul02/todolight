-- 같이하기: 할 일 하나를 여러 사람이 함께한다. owner_id는 그대로 두고(원래 주인·컬럼 배치
-- 기준), 참여자만 이 테이블에 얹는다 — 완료 상태는 todos.status 하나를 그대로 공유한다.
create table if not exists public.todo_participants (
  id          uuid primary key default gen_random_uuid(),
  todo_id     uuid not null references public.todos (id) on delete cascade,
  org_id      uuid not null references public.organizations (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  joined_at   timestamptz not null default now(),
  unique (todo_id, user_id)
);

create index if not exists todo_participants_todo_idx on public.todo_participants (todo_id);
create index if not exists todo_participants_org_user_idx on public.todo_participants (org_id, user_id);

alter table public.todo_participants enable row level security;

drop policy if exists todo_participants_select on public.todo_participants;
create policy todo_participants_select on public.todo_participants
  for select using (public.is_org_member(org_id));

drop policy if exists todo_participants_insert on public.todo_participants;
create policy todo_participants_insert on public.todo_participants
  for insert with check (public.is_org_member(org_id) and user_id = auth.uid());

drop policy if exists todo_participants_delete on public.todo_participants;
create policy todo_participants_delete on public.todo_participants
  for delete using (user_id = auth.uid() or public.is_org_manager(org_id));

-- realtime: select 정책이 있어야 구독한 클라이언트에 변경분이 실제로 전달된다
-- (org_events는 이 블록을 빠뜨렸던 전례가 있다 — 이번엔 처음부터 챙긴다)
alter table public.todo_participants replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'todo_participants') then
    alter publication supabase_realtime add table public.todo_participants;
  end if;
end
$$;
