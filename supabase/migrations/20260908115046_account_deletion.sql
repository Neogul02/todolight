-- 계정 삭제 (App Store Review Guideline 5.1.1(v))
--
-- 계정을 만들 수 있는 앱은 앱 안에서 계정을 삭제할 수 있어야 한다. 지금은 그 경로가 없다.
--
-- 그런데 `auth.admin.deleteUser()`를 그냥 부르면 안 된다. profiles가 auth.users에서
-- cascade로 딸려 나가고, 거기서 다시 줄줄이 이어진다:
--
--   auth.users → profiles → organizations(owner_id)  → 그 조직의 todos·events·ledger 전부
--                         → todos(owner_id, created_by)
--                         → todo_notes(author_id)
--                         → ledger_entries(payer_id, created_by)
--
-- 즉 한 사람이 탈퇴하면 **그 사람이 만든 조직이 통째로**, 남의 컬럼에 넣어 준 할 일이,
-- 남이 보고 있는 카드의 메모가, 조직 가계부에서 그 사람이 낸 줄까지 전부 사라진다.
-- 가계부 합계가 사람이 나갔다고 바뀌면 그건 장부가 아니다.
--
-- 그래서 auth.users → profiles의 cascade만 끊고, **profiles 행은 묘비로 남긴다.**
-- 로그인 수단(auth.users)은 진짜로 지우고, 조직에 남긴 기록은 이름·이메일·사진을 지운 채
-- 남는다. 소프트 삭제가 앱 전체의 원칙이기도 하다 — 계정 삭제만은 되돌릴 수 없지만,
-- 되돌릴 수 없는 건 "그 사람의 계정"이지 "팀의 기록"이 아니다.
--
-- FK를 없애면 profiles.id가 auth.users를 참조하지 않는 그냥 uuid가 된다. 그게 맞다 —
-- 묘비에는 대응하는 계정이 없다. 살아 있는 행은 handle_new_user 트리거가 auth.users에서
-- 만들어 주므로 id가 어긋날 길이 없다.

alter table public.profiles drop constraint if exists profiles_id_fkey;

-- 묘비 표시. 이름·이메일·사진을 지우는 것과 별개로 "이 행은 탈퇴한 사람"이라는 사실이
-- 필요하다 — 같은 이메일로 다시 가입하면 새 auth.users id로 새 프로필이 생기고,
-- 옛 행은 남은 기록의 작성자로만 남아야 한다.
alter table public.profiles add column if not exists deleted_at timestamptz;

-- 탈퇴한 사람의 프로필은 아무도 SELECT할 수 없어야 한다. `shares_org_with`는 org_members를
-- 보는데 탈퇴하면서 그 행이 사라지므로 이미 자연히 막히지만, 정책을 읽는 사람이 그 연결을
-- 짚어 봐야만 알 수 있다. 조건을 눈에 보이게 적어 둔다.
comment on column public.profiles.deleted_at is
  '계정을 삭제한 시각. 채워져 있으면 auth.users에 대응하는 계정이 없는 묘비 행이다 — '
  '남긴 할 일·메모·가계부의 작성자를 가리키는 용도로만 남는다.';
