-- 테마를 잉크 화이트(ink) / 잉크 블랙(ink-dark) 둘로 정리한다.
-- 사라진 테마(sand, mint)를 쓰던 계정은 화이트로 되돌린다.
update public.profiles set theme = 'ink' where theme not in ('ink', 'ink-dark');
