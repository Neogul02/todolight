-- Discord 알림을 걷어 냈다(앱 푸시 알림으로 바꾼다). 웹훅 URL은 그 채널에 글을 쓸 수 있는
-- 자격이라 쓰지 않는 채로 DB에 남겨 둘 이유가 없다.
alter table public.organizations drop column if exists discord_webhook_url;
