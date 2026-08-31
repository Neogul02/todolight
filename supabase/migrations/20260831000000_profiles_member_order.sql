-- 보드 캐러셀·대시보드에서 나 다음에 어떤 팀원이 나올지, 조직별로 직접 정한 순서.
-- 기기를 옮겨도 같은 순서가 나와야 해서 계정에 붙였다. 모양은 { [orgId]: string[] } —
-- 그 조직에서 마지막으로 정한, 나를 제외한 멤버 id 순서. 정한 적 없으면 빈 객체(이름순으로 떨어진다).
alter table public.profiles add column if not exists member_order jsonb not null default '{}'::jsonb;
