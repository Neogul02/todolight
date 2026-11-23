-- 앱 푸시 알림.
--
-- push_devices  기기마다 APNs 토큰 하나. 같은 토큰이 다른 계정으로 다시 등록되면(로그아웃 → 다른
--               계정 로그인) 주인을 갈아 끼운다 — 그래서 토큰이 기본 키다.
-- push_log      보낸 알림 기록. 같은 할 일을 짧은 시간에 여러 번 고칠 때 한 번으로 묶는 데 쓴다
--               (서버리스라 프로세스 메모리로는 셀 수 없다).
-- profiles      알림 묶음 세 개를 켜고 끈다. 팀원이 올린 할 일은 하루 수십 개라 기본 끔.
--
-- 전부 서버(서비스 롤)만 읽고 쓴다 — 정책 없이 RLS만 켠다.

create table if not exists public.push_devices (
  token      text primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  platform   text not null default 'ios' check (platform in ('ios')),
  updated_at timestamptz not null default now()
);
create index if not exists push_devices_user_idx on public.push_devices (user_id);
alter table public.push_devices enable row level security;

create table if not exists public.push_log (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null,
  ref_id     text,
  created_at timestamptz not null default now()
);
create index if not exists push_log_recent_idx on public.push_log (user_id, kind, ref_id, created_at desc);
alter table public.push_log enable row level security;

alter table public.profiles
  add column if not exists notify_my_todos boolean not null default true,
  add column if not exists notify_org boolean not null default true,
  add column if not exists notify_team_todos boolean not null default false;

-- 아침 9시(KST = UTC 0시) 오늘 마감 알림. 비밀값은 Vault(`cron_secret`) = Vercel `CRON_SECRET`.
-- 도메인을 바꾸면 여기 URL도 고칠 것.
select cron.unschedule('push-morning-digest')
where exists (select 1 from cron.job where jobname = 'push-morning-digest');

select cron.schedule(
  'push-morning-digest',
  '0 0 * * *',
  $$
    select net.http_post(
      url := 'https://todolight.vercel.app/api/cron/digest',
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
      ),
      timeout_milliseconds := 30000
    );
  $$
);
