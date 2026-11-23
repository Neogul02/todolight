-- 달력 쓰기 — 가계부(show_ledger)와 같은 방식. 끄면 탭바에서 달력 칸이 사라진다.
alter table public.profiles
  add column if not exists show_calendar boolean not null default true;
