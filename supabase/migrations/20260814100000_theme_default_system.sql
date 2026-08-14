-- 기본 테마를 시스템 설정 따라가기로. 브라우저/OS가 다크면 다크로 연다.
-- 이미 직접 고른 사람의 값은 건드리지 않는다 — 그건 의사 표시다.
alter table public.profiles alter column theme set default 'system';
