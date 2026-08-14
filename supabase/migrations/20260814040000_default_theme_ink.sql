-- 기본 테마를 흰 배경(ink)으로 바꾼다. 샌드는 설정에서 고를 수 있는 선택지로 남는다.
alter table public.profiles alter column theme set default 'ink';
