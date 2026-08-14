-- 아바타를 이모지에서 색상 키로 바꾼다. 기존 이모지 값은 의미가 없으므로 버리고,
-- 색이 비어 있으면 사용자 id 해시로 자동 배정한다(lib/avatar.ts의 getAvatarColor).
alter table public.profiles rename column avatar_emoji to avatar_color;
update public.profiles set avatar_color = null;
