-- /api/v1의 사람 단위 요청 제한
--
-- 서버 액션은 원래도 공개 POST였지만, 문서화된 API가 되면 표적이 된다. 다만 실제로 막아야
-- 하는 건 악의보다 **폭주하는 클라이언트**다 — 앱의 재시도 루프가 잘못 돌면 그 한 대가
-- DB를 하루 종일 두들긴다.
--
-- **왜 인메모리가 아니라 테이블인가**: Vercel 서버리스는 요청마다 다른 인스턴스에서 돌 수
-- 있고 인스턴스는 수시로 죽는다. 프로세스 메모리에 센 숫자는 아무것도 세지 못한다.
-- Redis를 새로 붙이는 대신 이미 있는 Postgres를 쓴다 — 창 하나에 upsert 한 번이고,
-- Vercel(icn1)과 Supabase(ap-northeast-2)가 같은 서울이라 왕복이 짧다.
--
-- **고정 창(fixed window)이다.** 창 경계에서 최대 2배까지 몰릴 수 있는 게 이 방식의 한계인데,
-- 여기서 재는 건 "사람이 손으로는 못 넘는 수"라 그 2배도 문제가 되지 않는다. 슬라이딩 창은
-- 요청마다 기록을 남겨야 해서 이 목적에 비해 비싸다.
create table if not exists public.api_rate_limits (
  bucket        text primary key,   -- "{user_id}:{창 번호}"
  window_start  timestamptz not null,
  hits          int not null default 0
);

create index if not exists api_rate_limits_window_idx on public.api_rate_limits (window_start);

-- 이 표는 service role만 만진다(아래 함수 경유). 클라이언트에 열 이유가 전혀 없다.
alter table public.api_rate_limits enable row level security;

/*
  세고 판정하는 것을 **한 문장으로** 한다. 읽고→더하고→쓰면 그 사이에 낀 요청이 새 나간다.
  `on conflict do update ... returning`이 원자적이라 동시에 들어와도 정확히 센다.
*/
create or replace function public.api_rate_check(
  p_key text,
  p_limit int,
  p_window_seconds int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_epoch bigint := floor(extract(epoch from clock_timestamp()) / p_window_seconds)::bigint;
  v_start timestamptz := to_timestamp(v_epoch * p_window_seconds);
  v_hits  int;
begin
  insert into public.api_rate_limits (bucket, window_start, hits)
  values (p_key || ':' || v_epoch, v_start, 1)
  on conflict (bucket) do update set hits = public.api_rate_limits.hits + 1
  returning hits into v_hits;

  -- 지난 창의 행은 아무도 안 본다. 별도 크론을 두는 대신 **새 창이 열릴 때만**(hits = 1)
  -- 한 번 쓸어 낸다 — 매 요청마다 지우면 그게 더 비싸고, 안 지우면 표가 영원히 자란다.
  if v_hits = 1 then
    delete from public.api_rate_limits where window_start < now() - interval '1 hour';
  end if;

  return v_hits <= p_limit;
end;
$$;

-- actor(p_key)를 파라미터로 믿는 함수다 — 클라이언트가 부르면 남의 한도를 태울 수 있다
revoke all on function public.api_rate_check(text, int, int) from public, anon, authenticated;
grant execute on function public.api_rate_check(text, int, int) to service_role;
