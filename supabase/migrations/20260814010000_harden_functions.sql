-- search_path 고정 (search_path 가로채기 방지)
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 가입 트리거 함수는 트리거로만 실행되면 된다 — REST rpc 노출 제거
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- RLS 헬퍼는 정책 평가에 필요하므로 authenticated 권한은 남기고, 미인증(anon)만 막는다
revoke execute on function public.is_org_member(uuid) from anon;
revoke execute on function public.is_org_manager(uuid) from anon;
revoke execute on function public.shares_org_with(uuid) from anon;
