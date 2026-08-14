-- 조직 일정. 할 일과 별개다 — 기간을 갖고, 담당자가 없고, 보드에 뜨지 않는다.
-- (테이블을 나눈 이유: todos에 억지로 얹으면 모든 보드 조회에 "일정 제외" 조건이 붙는다)
create table if not exists public.org_events (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 200),
  color       text not null default 'slate',
  start_date  date not null,
  end_date    date not null,
  created_by  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint org_events_range check (end_date >= start_date)
);

create index if not exists org_events_org_range_idx
  on public.org_events (org_id, start_date, end_date)
  where deleted_at is null;

create trigger org_events_touch_updated_at
  before update on public.org_events
  for each row execute function public.touch_updated_at();

alter table public.org_events enable row level security;

drop policy if exists org_events_select on public.org_events;
create policy org_events_select on public.org_events
  for select using (public.is_org_member(org_id));

drop policy if exists org_events_insert on public.org_events;
create policy org_events_insert on public.org_events
  for insert with check (public.is_org_member(org_id) and created_by = auth.uid());

drop policy if exists org_events_update on public.org_events;
create policy org_events_update on public.org_events
  for update using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

drop policy if exists org_events_delete on public.org_events;
create policy org_events_delete on public.org_events
  for delete using (created_by = auth.uid() or public.is_org_manager(org_id));
