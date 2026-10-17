-- 홈 화면 앱 콜드 스타트 줄이기 — 낮 시간에 5분마다 앱을 두드려 서버리스 인스턴스를 깨워 둔다
--
-- 홈 화면 아이콘으로 앱을 열면 2초 가까이 흰 화면(스플래시)이 떴다. 재 보니 데이터는 원인이
-- 아니었다(가장 큰 조직 보드가 50KB · 쿼리 9ms). 범인은 **콜드 스타트 두 번**이다 —
-- `/board`는 proxy를 거쳐 페이지로 가는데, 한동안 아무도 안 쓰면 둘 다 잠들어 있어서
-- 각각 ~0.9초씩 깨어나는 시간이 직렬로 붙는다(깨어 있으면 0.1~0.2초).
--
-- 그래서 Supabase에서 앱을 주기적으로 부른다(Vercel Hobby의 cron은 하루 한 번이 한계라 못 쓴다).
-- - `/board` — 미인증이라 proxy가 /login으로 돌려보낸다. proxy만 깨우고 DB는 안 건드린다.
-- - `/`      — 랜딩 페이지. 페이지 함수를 깨운다(쿠키가 없어 Supabase 왕복도 없다).
-- 둘 다 인증이 필요 없고 데이터를 읽지 않는다.
--
-- 시간대: KST 07:00~23:59 = UTC 22:00~14:59. 새벽엔 쓰는 사람이 없으니 쉬게 둔다
-- (그 시간 첫 진입만 예전처럼 느리다). 하루 약 400회 — Vercel 무료 한도에 한참 못 미친다.
-- 도메인을 바꾸면 여기 URL도 고칠 것.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.unschedule('keep-app-warm')
where exists (select 1 from cron.job where jobname = 'keep-app-warm');

select cron.schedule(
  'keep-app-warm',
  '*/5 22,23,0-14 * * *',
  $$
    select net.http_get(url := 'https://todolight.vercel.app/board', timeout_milliseconds := 10000);
    select net.http_get(url := 'https://todolight.vercel.app/', timeout_milliseconds := 10000);
  $$
);
