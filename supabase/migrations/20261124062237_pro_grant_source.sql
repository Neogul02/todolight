-- 결제 없이 운영자가 준 Pro(출시 전 내 조직 등)를 결제분과 구분한다 — 앱이 "구독 관리" 대신 다른 안내를 띄운다
alter table public.pro_subscriptions drop constraint pro_subscriptions_source_check;
alter table public.pro_subscriptions add constraint pro_subscriptions_source_check
  check (source in ('apple', 'web', 'grant'));

-- (적용 때 운영자 계정 하나에 grant 행을 함께 넣었다 — 계정 id는 저장소에 남기지 않는다)
