-- 완료한 할 일을 보드에 보일지. 보드 툴바의 토글을 설정으로 내리면서 계정에 붙였다.
-- 기기를 옮겨도 같은 화면이 나와야 한다.
alter table public.profiles add column if not exists show_done boolean not null default true;
