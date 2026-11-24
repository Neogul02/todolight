-- 일본어 추가 — 가입할 때 넘어온 언어가 ja여도 그대로 받는다
create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  insert into public.profiles (id, email, display_name, locale)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1)),
    case when new.raw_user_meta_data ->> 'locale' in ('ko', 'en', 'ja')
      then new.raw_user_meta_data ->> 'locale'
      else 'ko'
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;
