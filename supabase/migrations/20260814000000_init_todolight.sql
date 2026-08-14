-- todolight 초기 스키마
-- 조직(organizations) → 멤버(org_members) → 각자의 할 일(todos) → 대신 처리 메모(todo_notes)

create extension if not exists "pgcrypto";

-- ──────────────────────────────────────────────
-- profiles : auth.users 1:1 확장
-- ──────────────────────────────────────────────
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text,
  display_name  text not null default '이름 없음',
  avatar_emoji  text,
  theme         text not null default 'sand',
  created_at    timestamptz not null default now()
);

-- 가입 시 프로필 자동 생성
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ──────────────────────────────────────────────
-- organizations / org_members
-- ──────────────────────────────────────────────
create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists public.org_members (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at  timestamptz not null default now(),
  unique (org_id, user_id)
);

create index if not exists org_members_user_idx on public.org_members (user_id);
create index if not exists org_members_org_idx  on public.org_members (org_id);

-- ──────────────────────────────────────────────
-- org_invites : 방장이 이메일로 초대 → 수락하면 org_members 생성
-- ──────────────────────────────────────────────
create table if not exists public.org_invites (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  email         text not null,
  invited_by    uuid not null references public.profiles (id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'revoked')),
  created_at    timestamptz not null default now(),
  responded_at  timestamptz
);

-- 같은 조직에 같은 이메일로 대기 중인 초대는 하나만
create unique index if not exists org_invites_pending_uniq
  on public.org_invites (org_id, lower(email))
  where status = 'pending';
create index if not exists org_invites_email_idx on public.org_invites (lower(email));

-- ──────────────────────────────────────────────
-- todos
-- ──────────────────────────────────────────────
create table if not exists public.todos (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  -- 이 할 일의 주인. 보드에서 어느 컬럼에 놓일지 결정한다.
  owner_id      uuid not null references public.profiles (id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 500),
  status        text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  due_date      date,
  position      double precision not null default 0,
  created_by    uuid not null references public.profiles (id) on delete cascade,
  -- 완료 처리한 사람. owner_id와 다르면 "남이 대신 처리해 줌".
  handled_by    uuid references public.profiles (id) on delete set null,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists todos_org_owner_idx on public.todos (org_id, owner_id, status, position);
create index if not exists todos_org_updated_idx on public.todos (org_id, updated_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists todos_touch_updated_at on public.todos;
create trigger todos_touch_updated_at
  before update on public.todos
  for each row execute function public.touch_updated_at();

-- ──────────────────────────────────────────────
-- todo_notes : 대신 처리하면서 남기는 간단 메모
-- ──────────────────────────────────────────────
create table if not exists public.todo_notes (
  id          uuid primary key default gen_random_uuid(),
  todo_id     uuid not null references public.todos (id) on delete cascade,
  author_id   uuid not null references public.profiles (id) on delete cascade,
  content     text not null check (char_length(content) between 1 and 1000),
  created_at  timestamptz not null default now()
);

create index if not exists todo_notes_todo_idx on public.todo_notes (todo_id, created_at);

-- ──────────────────────────────────────────────
-- 헬퍼 (RLS 재귀 방지용 security definer)
-- ──────────────────────────────────────────────
create or replace function public.is_org_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.org_members m
    where m.org_id = p_org and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_org_manager(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.org_members m
    where m.org_id = p_org and m.user_id = auth.uid() and m.role in ('owner', 'admin')
  );
$$;

-- 내가 속한 조직의 멤버들 (프로필 노출 범위 판단용)
create or replace function public.shares_org_with(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.org_members me
    join public.org_members other on other.org_id = me.org_id
    where me.user_id = auth.uid() and other.user_id = p_user
  );
$$;

-- ──────────────────────────────────────────────
-- RLS
-- ──────────────────────────────────────────────
alter table public.profiles      enable row level security;
alter table public.organizations enable row level security;
alter table public.org_members   enable row level security;
alter table public.org_invites   enable row level security;
alter table public.todos         enable row level security;
alter table public.todo_notes    enable row level security;

-- profiles: 본인 + 같은 조직 멤버만 조회, 수정은 본인만
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (id = auth.uid() or public.shares_org_with(id));

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- organizations: 멤버만 조회, 생성은 본인이 owner일 때만
drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations
  for select using (public.is_org_member(id));

drop policy if exists organizations_insert on public.organizations;
create policy organizations_insert on public.organizations
  for insert with check (owner_id = auth.uid());

drop policy if exists organizations_update on public.organizations;
create policy organizations_update on public.organizations
  for update using (public.is_org_manager(id)) with check (public.is_org_manager(id));

drop policy if exists organizations_delete on public.organizations;
create policy organizations_delete on public.organizations
  for delete using (owner_id = auth.uid());

-- org_members: 같은 조직 멤버끼리 조회, 관리는 owner/admin
drop policy if exists org_members_select on public.org_members;
create policy org_members_select on public.org_members
  for select using (user_id = auth.uid() or public.is_org_member(org_id));

drop policy if exists org_members_insert on public.org_members;
create policy org_members_insert on public.org_members
  for insert with check (public.is_org_manager(org_id));

drop policy if exists org_members_delete on public.org_members;
create policy org_members_delete on public.org_members
  for delete using (public.is_org_manager(org_id) or user_id = auth.uid());

drop policy if exists org_members_update on public.org_members;
create policy org_members_update on public.org_members
  for update using (public.is_org_manager(org_id)) with check (public.is_org_manager(org_id));

-- org_invites: 조직 멤버 또는 초대받은 당사자
drop policy if exists org_invites_select on public.org_invites;
create policy org_invites_select on public.org_invites
  for select using (
    public.is_org_member(org_id)
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists org_invites_insert on public.org_invites;
create policy org_invites_insert on public.org_invites
  for insert with check (public.is_org_manager(org_id) and invited_by = auth.uid());

drop policy if exists org_invites_update on public.org_invites;
create policy org_invites_update on public.org_invites
  for update using (
    public.is_org_manager(org_id)
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- todos: 조직 멤버는 전부 조회. 생성은 조직 멤버, 수정/삭제도 조직 멤버
-- (대신 처리 기능이 핵심이라 남의 할 일도 수정할 수 있어야 한다)
drop policy if exists todos_select on public.todos;
create policy todos_select on public.todos
  for select using (public.is_org_member(org_id));

drop policy if exists todos_insert on public.todos;
create policy todos_insert on public.todos
  for insert with check (public.is_org_member(org_id) and created_by = auth.uid());

drop policy if exists todos_update on public.todos;
create policy todos_update on public.todos
  for update using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

-- 삭제는 주인이나 관리자만 — 남의 할 일을 지워버리는 사고 방지
drop policy if exists todos_delete on public.todos;
create policy todos_delete on public.todos
  for delete using (owner_id = auth.uid() or public.is_org_manager(org_id));

-- todo_notes: 해당 할 일이 속한 조직의 멤버
drop policy if exists todo_notes_select on public.todo_notes;
create policy todo_notes_select on public.todo_notes
  for select using (
    exists (select 1 from public.todos t where t.id = todo_id and public.is_org_member(t.org_id))
  );

drop policy if exists todo_notes_insert on public.todo_notes;
create policy todo_notes_insert on public.todo_notes
  for insert with check (
    author_id = auth.uid()
    and exists (select 1 from public.todos t where t.id = todo_id and public.is_org_member(t.org_id))
  );

drop policy if exists todo_notes_delete on public.todo_notes;
create policy todo_notes_delete on public.todo_notes
  for delete using (author_id = auth.uid());

-- ──────────────────────────────────────────────
-- Realtime — 보드 동기화 대상 테이블만 publication에 등록
-- ──────────────────────────────────────────────
alter table public.todos replica identity full;
alter table public.todo_notes replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'todos'
  ) then
    alter publication supabase_realtime add table public.todos;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'todo_notes'
  ) then
    alter publication supabase_realtime add table public.todo_notes;
  end if;
end
$$;
