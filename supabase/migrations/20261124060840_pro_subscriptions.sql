-- todolight Pro — 방장이 Pro면 그 사람이 방장인 조직은 인원 제한(5명)이 없다.
-- 결제한 곳(apple/web)과 상관없이 이 표 하나가 답한다. 쓰기는 서버(service_role)만.
create table public.pro_subscriptions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  source text not null check (source in ('apple', 'web')),
  product_id text not null,
  original_transaction_id text not null unique,
  environment text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.pro_subscriptions enable row level security;

create policy "pro_subscriptions_select_own" on public.pro_subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.pro_subscriptions from anon, authenticated;
