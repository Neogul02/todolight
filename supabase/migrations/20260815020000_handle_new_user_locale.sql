-- 가입 시 브라우저 언어(로그인 화면에서 이미 negotiate된 값)를 profiles.locale에 심는다.
-- 안 하면 기본값 'ko'로 만들어졌다가, 로그인 직후 AppShell의 쿠키 동기화가 그 'ko'를
-- "계정에 저장된 진짜 값"으로 취급해 모처럼 맞춰 둔 언어를 도로 한국어로 되돌린다.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, locale)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1)),
    case when new.raw_user_meta_data ->> 'locale' in ('ko', 'en')
      then new.raw_user_meta_data ->> 'locale'
      else 'ko'
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
