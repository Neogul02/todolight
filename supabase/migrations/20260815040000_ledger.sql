-- 가계부 — 조직이 쓴 돈을 적어 두고 합계를 본다.
--
-- todos에 얹지 않은 이유는 org_events와 같다: 담당자 대신 "낸 사람"이 있고, 완료 상태가 없고,
-- 보드에 뜨지 않는다. 억지로 합치면 모든 보드 조회에 "가계부 제외" 조건이 붙고 한 번 빠뜨리면
-- 지출이 할 일 컬럼으로 새어 나온다.
create table if not exists public.ledger_entries (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  -- 돈을 낸 사람. 남을 대신 적어 줄 수 있어서 created_by와 다를 수 있다.
  payer_id    uuid not null references public.profiles (id) on delete cascade,
  -- 원 단위 정수. 원화는 소수점이 없으니 numeric을 쓸 이유가 없고,
  -- double은 합계를 낼 때 오차가 쌓인다.
  amount      bigint not null check (amount > 0 and amount <= 1000000000000),
  title       text not null,
  -- 쓴 날(KST 기준 날짜 문자열). created_at과 다르다 — 어제 쓴 걸 오늘 적는 일이 흔하다.
  spent_on    date not null,
  created_by  uuid not null references public.profiles (id) on delete cascade,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 화면은 "조직 × 한 달"만 읽는다 — 살아 있는 행만 담는 부분 인덱스로 충분하다
create index if not exists ledger_entries_org_month_idx
  on public.ledger_entries (org_id, spent_on desc)
  where deleted_at is null;

drop trigger if exists ledger_entries_touch_updated_at on public.ledger_entries;
create trigger ledger_entries_touch_updated_at
  before update on public.ledger_entries
  for each row execute function public.touch_updated_at();

alter table public.ledger_entries enable row level security;

-- 공유 가계부라 멤버면 누구나 읽고 적는다(할 일과 같은 원칙).
drop policy if exists ledger_entries_select on public.ledger_entries;
create policy ledger_entries_select on public.ledger_entries
  for select using (public.is_org_member(org_id));

drop policy if exists ledger_entries_insert on public.ledger_entries;
create policy ledger_entries_insert on public.ledger_entries
  for insert with check (public.is_org_member(org_id) and created_by = auth.uid());

-- 지우기는 소프트 삭제(update)라 update 정책이 곧 삭제 권한이다.
-- 적은 사람·낸 사람 본인이나 방장만.
drop policy if exists ledger_entries_update on public.ledger_entries;
create policy ledger_entries_update on public.ledger_entries
  for update using (
    created_by = auth.uid() or payer_id = auth.uid() or public.is_org_manager(org_id)
  );

-- realtime: select 정책이 있어야 구독한 클라이언트에 변경분이 전달된다
alter table public.ledger_entries replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ledger_entries') then
    alter publication supabase_realtime add table public.ledger_entries;
  end if;
end
$$;

-- 가계부를 쓰지 않는 사람에게는 헤더 버튼까지 감춘다.
-- show_done과 같은 성격의 값이라 계정(profiles)에 둔다 — 기기를 옮겨도 같은 화면이어야 한다.
alter table public.profiles
  add column if not exists show_ledger boolean not null default true;
