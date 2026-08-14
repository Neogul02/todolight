-- 할 일 소프트 삭제 — 실수로 지워도 DB에는 남아 복구할 수 있게 한다
alter table public.todos add column if not exists deleted_at timestamptz;

-- 보드는 항상 살아 있는 행만 읽으므로 부분 인덱스로 좁힌다
drop index if exists todos_org_owner_idx;
create index if not exists todos_org_owner_alive_idx
  on public.todos (org_id, owner_id, status, position)
  where deleted_at is null;

-- 조직별 Discord 웹훅 — 없으면 서버의 DISCORD_WEBHOOK_URL로 떨어진다
alter table public.organizations add column if not exists discord_webhook_url text;
