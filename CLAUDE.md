# todolight — CLAUDE.md

## 프로젝트 개요

조직 단위 공유 투두 보드. 방장이 팀원을 이메일로 초대하고, 수락하면 같은 조직이 된다.
같은 조직의 멤버는 서로의 할 일 목록을 한 화면에서 보고, 남의 할 일을 대신 처리하면서
메모를 남길 수 있다. 모든 변경은 웹소켓으로 실시간 동기화된다.

핵심 흐름: `방장 → 초대 → 수락 → 같은 조직 → 서로의 보드 공유`

## 기술 스택

| 항목 | 버전 |
|------|------|
| Next.js | 16.2.1 (App Router, Turbopack) |
| React | 19.2 |
| TypeScript | 6 |
| TailwindCSS | v4 (`@theme` + CSS 변수 토큰) |
| Supabase | @supabase/ssr ^0.12, @supabase/supabase-js ^2 |
| TanStack Query | v5 |
| Framer Motion | v12 |
| Sonner | 토스트 |
| Zod | 서버 액션 입력 검증 |
| Yarn | 패키지 매니저 |

배포 대상은 Vercel 서버리스. Supabase 프로젝트는 `rscexhqsilstyogzatye` (ap-northeast-2).

## 개발 명령어

```bash
yarn dev    # 개발 서버
yarn build  # 프로덕션 빌드 (타입 체크 포함)
yarn lint   # ESLint
```

## 환경 변수

```
NEXT_PUBLIC_SUPABASE_URL         Supabase 프로젝트 URL
NEXT_PUBLIC_SUPABASE_ANON_KEY    publishable key (sb_publishable_...)
SUPABASE_SERVICE_ROLE_KEY        secret key (sb_secret_...) — 서버 액션 전용, 절대 클라이언트 노출 금지
NEXT_PUBLIC_SITE_URL             앱 절대 URL
```

## 아키텍처

### 인증

**Next.js 16은 `middleware.ts` 대신 `proxy.ts`를 쓴다. `middleware.ts`를 만들면 충돌 에러가 난다.**

```
proxy.ts                  ← 보호 라우트 세션 검증 (getClaims()로 JWT 로컬 검증)
                             /board /team /me /orgs → 미인증이면 /login?next=... 리다이렉트
app/auth/callback/route.ts ← 메일 링크(PKCE code)를 세션으로 교환하는 자리
app/(app)/layout.tsx      ← 서버 컴포넌트에서 사용자·조직·프로필 로드 후 AppShell에 주입
app/(app)/AppShell.tsx    ← 클라이언트 셸: 헤더, 조직 전환 시트, 아바타 메뉴 시트, 테마 적용
```

- 로그인/회원가입은 `app/login/LoginForm.tsx`에서 `supabase.auth.signInWithPassword()` /
  `signUp()`으로 직접 처리한다. 가입 시 `auth.users` 트리거(`handle_new_user`)가
  `public.profiles` row를 자동 생성한다.
- **비밀번호 재설정**: `/reset`에서 `resetPasswordForEmail()`로 메일 발송 →
  메일 링크가 `/auth/callback?next=/reset/confirm`으로 돌아옴 →
  라우트 핸들러가 `exchangeCodeForSession()`으로 쿠키에 세션을 심음 →
  `/reset/confirm`에서 `updateUser({ password })`.
  **코드 교환은 반드시 서버에서** 한다 — PKCE 검증자가 `@supabase/ssr`의 쿠키에 있다.
  `next` 파라미터는 앱 내부 경로만 받는다(열린 리다이렉트 방지).
  Supabase 대시보드의 **Redirect URLs에 배포 도메인을 등록**해야 링크가 동작한다.
- **서버 액션은 공개 POST 엔드포인트다** — proxy.ts의 페이지 보호가 적용되지 않는다.
  모든 액션은 첫 줄에서 `requireAuth()`를 호출하고, 조직 관련 작업은 추가로
  `requireMembership()` / `requireManager()` / `assertMember()`로 소속·역할을 다시 검사한다.
  새 액션을 만들 때 이 가드를 빠뜨리지 말 것.

### Supabase 클라이언트 4종

| 파일 | 용도 | 키 |
|------|------|----|
| `lib/supabase-admin.ts` | 서버 액션 전용 DB 작업 (RLS 우회) | SERVICE_ROLE / secret |
| `lib/supabase-server.ts` | 서버 컴포넌트·액션의 인증 확인 (`@supabase/ssr`) | ANON |
| `lib/supabase-browser.ts` | 클라이언트 로그인/로그아웃 | ANON |
| `lib/supabase-realtime.ts` | 실시간 채널 전용 싱글턴 | ANON |

`getSupabaseAdmin()`은 지연 생성이다 — 최상위에서 만들면 환경 변수 없는 빌드 단계에서 터진다.

### 라우트 구조

```
app/
├── page.tsx              랜딩 (로그인 상태면 /board로 리다이렉트)
├── login/                로그인·회원가입
└── (app)/                ← proxy.ts 보호 + AppShell 래핑
    ├── board/            메인 보드 — 멤버별 컬럼 가로 스냅 캐러셀. 앱의 중심 화면
    ├── ledger/           가계부 — 조직이 쓴 돈을 달 단위로 적고 합계를 본다
    ├── team/             초대 · 멤버 · 조직 설정(아이콘·이름·Discord) 세 카드
    ├── me/               프로필·테마·언어·화면 설정. 저장 버튼 없이 즉시 저장한다
    └── orgs/new/         새 조직 만들기
```

### 서버 액션

`app/actions/_base.ts`의 `wrap()`으로 `ApiResponse<T>` 판별 유니온을 반환한다:

```typescript
export async function fetchXxx(): Promise<ApiResponse<T>> {
  return wrap(async () => {
    const user = await requireAuth()
    ...
  })
}
```

도메인별 파일: `orgs.ts`(조직·멤버·초대) · `todos.ts`(할 일·메모·대신 처리) · `events.ts`(일정) ·
`ledger.ts`(가계부) · `profile.ts`.

`ApiResponse<T>`는 `{success:true, data} | {success:false, error}` 판별 유니온이라
좁히기가 되려면 `strictNullChecks`가 켜져 있어야 한다 — `tsconfig.json`에서 켜 뒀다.
(`strict`는 꺼져 있고 `strictNullChecks`만 따로 켠 상태)

## DB 스키마

```
profiles        id (FK auth.users), email, display_name, avatar_color, avatar_url,
                theme, locale, show_done, show_ledger, created_at
                — show_avatars 컬럼이 남아 있지만 코드에서는 쓰지 않는다(설정을 없앴다)
organizations   id, name, owner_id, image_url, discord_webhook_url, created_at
org_members     id, org_id, user_id, role('owner'|'admin'|'member'), joined_at   UNIQUE(org_id,user_id)
org_invites     id, org_id, email, invited_by, status('pending'|'accepted'|'declined'|'revoked'),
                created_at, responded_at
                — (org_id, lower(email)) WHERE status='pending' 부분 유니크 인덱스
todos           id, org_id, owner_id, title, status('todo'|'doing'|'done'), due_date,
                position(double), created_by, handled_by, completed_at, deleted_at,
                created_at, updated_at
todo_notes      id, todo_id, author_id, content, created_at
org_events      id, org_id, title, color, start_date, end_date, created_by,
                created_at, updated_at, deleted_at
                — CHECK (end_date >= start_date)
todo_participants id, todo_id, org_id, user_id, joined_at   UNIQUE(todo_id, user_id)
ledger_entries  id, org_id, payer_id, amount(bigint, 원 단위), title, spent_on(date),
                created_by, deleted_at, created_at, updated_at
                — CHECK (amount > 0 and amount <= 1000000000000)
```

- `todos.owner_id`가 보드에서 어느 컬럼에 놓일지를 결정한다. `created_by`와 다르면
  남이 부탁한 할 일이고, 카드에 **"OOO이 부탁"** 배지가 뜬다 —
  추가할 때 뜬 토스트는 금방 사라지고 부탁한 본인 말고는 아무도 못 보기 때문에,
  "이거 왜 내 목록에 있지"를 카드에서 바로 알 수 있어야 한다.
- `handled_by`가 `owner_id`와 다르면 "남이 대신 처리해 줌" 배지가 뜬다.
- `position`은 double이라 앞/사이에 끼워 넣을 때 뒤 항목들을 다시 쓸 필요가 없다.
- **삭제는 전부 소프트 삭제다.** `deleted_at`만 찍고 행은 남긴다 — 카드 오른쪽 X는 확인 창 없이
  바로 눌리므로 실수해도 되돌릴 수 있어야 한다. 모든 조회에 `.is('deleted_at', null)`를
  빠뜨리지 말 것(부분 인덱스 `todos_org_owner_alive_idx`도 이 조건 기준이다).

### 일정(org_events)은 할 일이 아니다

**테이블을 나눈 이유**: 기간을 갖고, 담당자가 없고, 보드에 뜨지 않는다.
`todos`에 억지로 얹으면 모든 보드 조회에 "일정 제외" 조건이 붙고 한 번 빠뜨리면 새어 나온다.
지금은 `fetchOrgTodos`가 `todos`만 읽으므로 보드에 섞일 길 자체가 없다.

- 색은 키 문자열이고 실제 값은 `lib/event-colors.ts`가 갖는다(아바타 색보다 진하다 —
  아바타는 사람을 구분하는 배경이고 일정은 얇은 띠라 눈에 걸려야 한다).
- 시작·끝을 거꾸로 넣으면 막지 않고 **뒤집어서 저장한다**(`normalizeRange`).
- 지우는 건 만든 사람이나 방장만. 할 일과 같이 소프트 삭제다.
- 달력에서 날짜별로 쓰려면 기간을 펼쳐야 한다 — 하루마다 전체 일정을 훑으면
  O(날짜 × 일정)이라, `CalendarView`가 시작일부터 종료일까지 한 번만 훑어 map을 만든다.
- 달력 띠는 칸 사이 간격만큼 좌우로 넓혀(`-ml-1` / `-mr-1`) 기간이 끊기지 않고 이어져 보이게
  하고, 시작일·종료일에서만 모서리를 둥글게 해 어디서 시작하고 끝나는지 드러낸다.
- **줄(lane)은 일정마다 고정한다**(`assignLanes`). 날짜별로 그때그때 쌓으면 위 일정이 끝나는
  순간 아래 일정이 한 줄 위로 튀어서, 같은 일정의 띠가 주 중간에 위아래로 꺾여 보인다.
  겹치지 않는 일정끼리는 같은 줄을 다시 쓴다(구간 분할).
- **칸 단위가 아니라 세그먼트 단위로 그린다.** 세그먼트 = 한 주 안에서 이어지는 구간 하나.
  칸마다 그리면 두 가지가 어긋난다 — 모서리 둥글기를 칸 기준으로 판정해 기간 중간에서
  둥글어지고, 이름을 얹은 넓은 띠 아래에 칸별 띠가 겹쳐 그려진다.
- 세그먼트는 **일정 시작 · 주 경계 · 달 경계**에서 시작하고, 끝은
  `min(일정 끝, 그 주 토요일, 그 달 말일)`이다. **달 경계를 안 끊으면 말일 다음의 빈 칸
  (다음 달 자리) 위로 띠가 흘러간다.**
- 모서리는 세그먼트가 아니라 **일정 기준**으로 둥글린다 — 시작 세그먼트의 왼쪽,
  끝 세그먼트의 오른쪽만. 잘린 쪽을 각지게 둬야 다음 주·다음 달로 이어진다는 게 보인다.
- 폭은 `calc(100% * n + 4px * (n-1))` — 칸 폭 × 칸 수 + 칸 사이 간격.
  이름은 세그먼트마다 다시 적는다(긴 일정이 이름 없는 띠가 되지 않게).
- **띠에는 `pointer-events-none`이 필수다.** 세그먼트는 시작 칸 button의 자식인데 폭이
  여러 칸에 걸쳐 있어서, 클릭을 받으면 28일 위를 눌러도 그 세그먼트가 시작한 23일이 선택된다.
  날짜 선택은 칸이 받아야 한다.

### 가계부(ledger_entries)도 할 일이 아니다

일정과 같은 이유로 테이블을 나눴다 — 담당자 대신 **낸 사람**이 있고, 완료 상태가 없고,
보드에 뜨지 않는다. 화면도 보드의 한 뷰가 아니라 나란한 패널이다:
보드와 달력은 같은 `todos` 캐시를 다르게 그린 것이지만 가계부는 데이터도 연산도 다르다.
그래서 `ViewPager`가 패널을 **처음 열릴 때만 마운트한다** — 가계부를 한 번도 안 본 사람에게는
이 쿼리도 실시간 채널도 아예 돌지 않는다.

- `amount`는 **원 단위 bigint**다. 원화는 소수점이 없어 `numeric`을 쓸 이유가 없고,
  `double`은 합계를 낼 때 오차가 쌓인다. 상한(1조)은 DB `check`와 zod가 **같은 값**을
  들고 있다 — 한쪽만 고치면 raw DB 에러가 그대로 토스트에 뜬다.
- `spent_on`은 `created_at`과 다르다. 어제 쓴 걸 오늘 적는 게 정상 흐름이다.
- **달 단위로 본다.** 범위가 없으면 합계가 영원히 커지기만 해서 숫자가 의미를 잃는다.
  쿼리 캐시 키도 달 단위(`['ledger', orgId, month]`)다.
- 합계는 **클라이언트에서 낸다.** 어차피 그 달 행을 전부 그리고 있어서 집계 쿼리를 따로
  보내면 왕복만 늘고, 실시간으로 한 줄이 들어왔을 때 목록과 합계가 어긋날 여지가 생긴다.
- **낙관적 반영을 하지 않는다.** 할 일 체크와 달리 연타하는 동작이 아니고, 합계가
  잠깐이라도 틀린 값을 보여 주는 쪽이 200ms 기다리는 것보다 나쁘다.
- 실시간은 행 병합 대신 조직 단위 invalidate다 — 들어온 행이 지금 보는 달인지 판정하는
  분기를 캐시 병합에 넣으면 달을 넘길 때 어긋날 거리가 하나 는다. 한 달치는 몇십 줄이다.
- 지우는 건 적은 사람·낸 사람 본인이나 방장만. 할 일과 같이 소프트 삭제다.
- 쓸지 말지는 `profiles.show_ledger`에 있다. 끄면 헤더 세그먼트·탭바에서 버튼이 사라지고,
  `?view=ledger`로 직접 열면 조용히 튕기지 않고 "설정으로 가기" 안내를 띄운다.
  이미 가계부를 보고 있는 동안에는 버튼을 남긴다 — 다른 기기에서 끄면 나갈 길이 사라진다.

### RLS

`is_org_member(org)` · `is_org_manager(org)` · `shares_org_with(user)` 세 개의
`security definer` 함수로 정책을 쓴다 — `org_members` 정책 안에서 `org_members`를 다시
조회하면 무한 재귀가 나기 때문이다.

`todos`는 조직 멤버라면 누구나 SELECT/INSERT/UPDATE할 수 있다(대신 처리가 핵심 기능이라
의도된 것). 다만 DELETE만은 주인 본인이나 방장으로 제한한다.

### Discord 알림

`lib/discord.ts`의 `notifyDiscord()`로 웹훅에 임베드를 쏜다. 알림을 보내는 시점:

- **할 일 추가** (`createTodo`) — 누가 누구 목록에 무엇을 넣었는지
- **대신 처리** (`handleForMember`) — 처리자·주인·내용·남긴 메모

원칙 두 가지:

1. **알림 실패가 본래 작업을 되돌리면 안 된다.** `notifyDiscord()`는 절대 throw하지 않고
   실패를 로그로만 남긴다.
2. **응답을 막지 않는다.** 호출은 `next/server`의 `after()` 안에서 한다. 서버리스에서도
   응답 후 실행이 보장된다.

웹훅 URL은 `organizations.discord_webhook_url`(방장이 `/team`에서 설정)이 우선이고,
비어 있으면 서버 환경 변수 `DISCORD_WEBHOOK_URL`로 떨어진다.

### 실시간

`lib/supabase-realtime.ts` 싱글턴 클라이언트로 채널을 만든다:

- `board-{orgId}` — `todos` 변경을 `org_id` 필터로 구독. INSERT/UPDATE는 TanStack Query
  캐시에 직접 병합하고, `todo_notes` 변경은 작성자 이름 조인이 필요해서 invalidate로 처리한다.
  **소프트 삭제는 DELETE가 아니라 `deleted_at`을 채우는 UPDATE로 오므로**, 병합 전에
  `row.deleted_at`을 보고 캐시에서 걷어낸다.
- `presence-{orgId}` — 접속자 표시용 Presence

`todos` / `todo_notes`는 `replica identity full` + `supabase_realtime` publication에 등록되어 있다.

## 모바일 레이아웃 (iPhone 15 Pro / 16 Pro 우선)

기준 뷰포트는 **393×852**(15 Pro)와 **402×874**(16 Pro). 데스크톱은 `sm:`(640px) 이상에서 갈라진다.

### 셸 구조 — 매일 보는 세 화면은 한 페이지다

```
PC     헤더 (--header-h)   [←] [조직아이콘 이름] ...... [▣][▤]|[▦][₩] [아바타●]
모바일 헤더 없음 — 아바타·뒤로가기는 콘텐츠 위에 뜨는 플로팅 버튼, 뷰 전환은 하단 탭바

본문   app-viewport 안의 패널 트랙 : [보드|대시보드] · 달력 · 가계부
```

**보드 · 달력 · 가계부는 라우트가 아니라 `/board` 한 페이지의 패널이다**
(`app/(app)/ViewPager.tsx`). 예전엔 `/board` · `/calendar` · `/ledger` 세 라우트였는데,
전환마다 (1) 레이아웃이 인증·조직·프로필을 await하는 탓에 RSC 왕복이 붙고 (2) 클라이언트
상태가 통째로 날아갔다 — 가계부에 적다 만 금액, 캐러셀 위치, 목록 스크롤이 매번 처음으로
돌아갔다. 전환 애니메이션을 아무리 손봐도 이 둘은 남는다.
지금은 세 패널이 한 트랙 위에 나란히 서 있고 바뀌는 건 트랙의 `translateX`뿐이라,
전환에 **네트워크 요청이 0건**이고 재마운트도 없다.

- 어느 패널인지는 `?view=board|calendar|ledger`가 들고, `AppShell`이 첫 값만 읽는다.
  이후 전환은 **`history.replaceState`로 주소만 갈아끼운다** — Next 네비게이션이 아니라서
  왕복이 없고, 히스토리에 패널마다 항목이 쌓이지 않는다(뒤로가기 한 번이 직전 화면으로 간다).
  모르는 `view` 값은 `parseAppView`가 보드로 떨어뜨린다.
- `/calendar` · `/ledger`는 **리다이렉트만 남긴다.** 북마크·홈 화면 바로가기를 살려 두는 값이다.
- 패널은 **처음 열릴 때 마운트하고 그 뒤로는 유지한다.** 처음부터 셋을 다 켜면 한 번도 안 본
  가계부의 쿼리와 실시간 채널까지 돌고, 매번 언마운트하면 애초에 고치려던 상태 손실이 그대로다.
- **바깥 트랙에 제스처를 붙이지 않는다.** 보드 패널 안이 이미 멤버별 가로 캐러셀이고 달력은
  좌우로 밀어 달을 넘긴다 — 바깥에 또 가로 제스처를 두면 어느 쪽이 먹을지 손이 예측할 수 없다.
- 비활성 패널에는 `inert`를 준다. 화면 밖 버튼에 Tab이 앉지 않고 포인터도 막힌다.
  다만 **`overflow`는 활성/비활성 상관없이 `auto`로 둘 것** — 비활성일 때 `hidden`으로 바꾸면
  스크롤이 불가능해지며 `scrollTop`이 0으로 잘려서, 이 화면을 만든 이유가 거기서 무너진다.
- 조직 단위로 하나뿐이어야 하는 것(`useBoardRealtime` · `useOrgPresence` · 대신 처리 시트)은
  **ViewPager가 갖는다.** 패널마다 부르면 `board-{orgId}` 채널이 두 번 열린다 —
  예전엔 보드와 달력이 각자 불렀지만 라우트가 달라 동시에 떠 있을 일이 없었다.
- 조직이 하나도 없을 때의 안내도 ViewPager 한 곳이다(예전엔 세 화면에 거의 같은 코드로 세 벌).

**시트는 `document.body`로 포털한다**(`BottomSheet`). `position: fixed`는 조상에 `transform`이
있으면 뷰포트가 아니라 **그 조상** 기준으로 배치된다 — 트랙에 `translateX`가 상시 걸려 있어서,
포털이 없으면 달력 일정 시트·대신 처리 시트가 화면 밖으로 밀려난다.

**멤버 칩은 보드 뷰에서 늘 띄운다.** 멤버가 늘수록 원하는 사람까지 좌우로 미는 손이
많아지는데 칩을 누르면 한 번에 간다 — 칩이 값을 하는 건 오히려 사람이 많을 때다.
한때 "둘 이하면 감춘다"로 둔 적이 있는데, 아껴지는 44px보다 목적지로 바로 가는 쪽이 크다.

**프로필(아바타) 시트 하나에 다 모여 있다** — 받은 초대 → 조직 전환 → 관리(팀·내 설정) →
로그아웃. 헤더 왼쪽의 조직 이름은 누르면 보드로 가는 링크이고, 조직은 안 바뀐다.
조직을 바꾸는 곳과 초대를 받는 곳이 같아야 "어디서 하더라"가 없다.
시트를 밖에서 열려면 `useApp()`의 `openMenu`를 쓴다.

대기 중인 초대가 있으면 아바타에 **작은 빨간 점**만 띄운다(숫자 배지는 시끄럽다).
수락하면 그 조직으로 바로 전환하고 시트를 닫는다.

보드 패널 안쪽은 화면 폭으로 **보드/대시보드** 둘로 갈린다(`boardMode`).
**대시보드는 PC 전용이다**(`hidden sm:grid`). 폰에서는 멤버가 늘수록 세로로 한없이 길어져
"누가 무엇을 들고 있나"가 오히려 안 보이고, 그 일은 좌우로 미는 보드가 이미 한다.
창을 줄여 넘어온 경우에도 `boardMode`를 보드로 떨어뜨린다(버튼이 없어 되돌아갈 길이 없으므로).
달력(`CalendarView`)은 보드가 "누가 무엇을 들고 있나"라면 "언제 몰려 있나"를 보는 화면이다.
월 격자에 날짜별 미완료 개수를 찍고, 날짜를 누르면 그 날 마감인 조직 전체 할 일이 담당자와
함께 나온다. 마감 없는 할 일은 아래에 따로 모은다. 보드와 달력은 **같은 쿼리 캐시**를 쓴다.

### 모바일 플로팅 컨트롤 — 콘텐츠를 가리지 않는다

모바일에는 헤더가 없고 아바타(우상단)·뒤로가기(좌상단)·탭바(하단)가 콘텐츠 **위에 뜬다**.
뜨는 것이므로 자리를 빼앗지 않는 게 원칙이다.

- **하단 탭바는 알약 하나뿐이고 그 좌우로는 화면이 그대로 보인다.** 감싸는 `nav`는 가로로
  꽉 차 있지만 `pointer-events-none`이라 없는 것과 같고, 알약만 `pointer-events-auto`다 —
  안 그러면 알약 옆 빈 자리를 눌렀을 때 밑의 카드가 아니라 투명한 띠가 탭을 먹는다.
- **`app-viewport`에서 `--tabbar-h`를 빼지 않는다.** 빼면 화면 아래 76px이 아무것도 없는
  죽은 띠로 남아, 알약 하나 띄우려고 화면 밑동을 통째로 가린 꼴이 된다.
  콘텐츠는 화면 끝까지 내려가고 알약이 그 위에 뜬다(알약은 `backdrop-blur`라 밑이 비친다).
  대신 **스크롤 영역 쪽에서 `pb-tabbar`로** 마지막 줄이 알약에 가리지 않을 만큼만 비운다 —
  `MemberColumn`의 목록(캐러셀일 때만), 대시보드 격자, 달력 목록 패널, 가계부 `main`.
- **아바타에는 배경 원판을 깔지 않는다.** 44px 원판 안에 24px 사진을 넣으면 사진 둘레로
  20px짜리 테가 둘려서, 사진이 이미 원인데 원이 두 겹으로 보인다. 버튼은 44px 그대로라
  터치 타깃은 줄지 않는다(보이는 것만 작다). 빨간 점은 버튼이 아니라 **사진 가장자리**에
  붙인다 — 버튼 모서리에 두면 사진에서 떨어져 혼자 떠 보인다.
  뒤로가기 화살표는 얇은 선이라 콘텐츠 위에서 읽히려면 판이 필요해서 판을 남겼다.

높이 상수는 `app/globals.css`의 `:root`에 `--header-h` · `--board-toolbar-h` · `--tabbar-h`로
두고 미디어 쿼리에서 값만 바꾼다(모바일은 헤더 0 · 탭바 76px, PC는 그 반대).
`app-viewport`가 `100dvh`에서 헤더와 세이프 에어리어를 빼 **패널 높이를 고정**하고,
패널 안쪽은 flex로 나눈다 — 멤버 칩 툴바는 있는 만큼만 먹고 나머지를 캐러셀이 가져간다.
화면마다 dvh 산수를 다시 하지 않는다(예전 `board-viewport`/`calendar-viewport`가 그랬고,
칩이 없을 때 `--board-toolbar-h`를 인라인 `0px`로 덮는 보정까지 딸려 왔다).

### 로딩 표시

보드는 스피너가 아니라 `BoardSkeleton`을 쓴다. 실제 컬럼과 **같은 폭·높이**(`w-full` /
`sm:w-[330px]`, `h-full`)를 써야 데이터가 도착해도 레이아웃이 튀지 않는다.

### 커서

Tailwind v4 preflight는 버튼 커서를 `default`로 되돌린다. 터치에서는 티가 안 나지만
데스크톱에서는 "누를 수 있는 것"이라는 신호가 통째로 사라진다 —
`globals.css`에서 `button:not(:disabled)` 등에 `cursor: pointer`를 다시 준다.

### 접근성

- 포커스 링은 `globals.css`의 `:focus-visible` 하나로 잡는다. 요소마다 붙이면 새로 만든
  버튼에서 반드시 빠뜨린다. 마우스 클릭에는 뜨지 않는다(`:focus`가 아니라 `:focus-visible`).
  - **거기에 `border-radius`를 박지 말 것.** 이 규칙은 레이어 밖이라 Tailwind의 `rounded-*`를
    전부 이긴다 — 값을 하나 박아 두면 `rounded-xl` 입력창이 포커스되는 순간 각진 상자가 된다.
  - 입력 요소는 `outline-offset: -2px`로 **안쪽에** 그린다. 카드 안에서 폭을 꽉 채우는 칸이
    많아서, 밖으로 그리면 카드 패딩 위로 삐져나오고 `overflow-hidden`에 한쪽만 잘려 나간다.
- `BottomSheet`는 `role="dialog"` + `aria-modal` + Tab 순환 트랩을 갖는다. 열 때 첫 항목에
  포커스를 주고, 닫을 때 열기 전 요소로 되돌린다.
- `prefers-reduced-motion: reduce`에서 애니메이션·트랜지션·스무스 스크롤을 전역으로 끈다.

### 세이프 에어리어

`layout.tsx`의 `viewportFit: 'cover'`가 있어야 `env(safe-area-inset-*)`가 0이 아니다.
이게 빠지면 `pb-safe` · `board-viewport`의 홈 인디케이터 회피가 통째로 무효가 된다.
유틸리티는 `pb-safe` · `pt-safe` · `px-safe`.

### 날짜 입력 — DuePicker

`components/DuePicker.tsx` — 달력도 키보드도 띄우지 않는다. 날짜가 가로로 늘어서 있고
좌우로 밀어 고른다. 열릴 때 선택된 날짜가 화면 가운데 오도록 스크롤을 맞춘다.

`<input type="date">`로 되돌리지 말 것 — 모바일에서 네이티브 피커가 화면 절반을 덮는다.
하루씩 밀고 당기는 −/+ 버튼으로도 되돌리지 말 것 — "다음 주 화요일"까지 가는 데 손이 너무 많이 간다.

**마감일과 가계부의 쓴 날이 같은 피커를 쓴다.** 화면마다 다른 피커를 만들면 한쪽에서 고친
조작감이 다른 쪽에 안 따라온다 — 기준일·범위·"없음" 칸만 프롭으로 연다.

| | `anchor` | 범위 | `allowNone` |
|---|---|---|---|
| 마감일 | 오늘(기본) | 뒤로 2주 · 앞으로 석 달 | 있음 |
| 가계부 쓴 날 | 보고 있는 달 1일 | 그 달 전체 | 없음 |

- 범위는 `anchor` 기준으로 세지만 **"오늘/어제/내일" 라벨은 늘 실제 오늘 기준**이다.
- 가계부가 `anchor`를 쓰는 이유: 오늘 기준으로 늘어놓으면 7월을 보면서 적은 지출이 8월로
  저장돼 목록에서 사라진다. 달을 넘기면 `key={month}`로 다시 마운트해 스크롤도 다시 잡는다.
- 가운데 정렬은 `offsetLeft`가 아니라 **두 `getBoundingClientRect()`의 차이**로 잰다.
  `offsetLeft`는 스크롤러가 아니라 가장 가까운 positioned 조상 기준이라, 스크롤러가
  positioned가 아니면(대부분 그렇다) 선택 날짜가 화면 밖으로 밀린다.

### 할 일 쓰기 동작 — useTodoMutations

보드의 모든 쓰기(추가·체크·수정·삭제·되살리기·메모)는 `hooks/useTodoMutations.ts`를 거친다.
서버 액션을 컴포넌트에서 직접 부르지 말 것 — 낙관적 반영과 롤백이 흩어지면 금방 어긋난다.

- **추가·체크·삭제·수정은 낙관적으로 반영한다.** 모바일에서 서버 왕복(200~500ms)을 기다리면
  탭이 씹힌 것처럼 느껴진다.
- **추가는 행 id를 클라이언트가 정해서 보낸다**(`createTodo`의 `id`). 임시 id로 그렸다가
  나중에 바꾸면 그 사이 도착한 실시간 INSERT가 다른 id로 보여 카드가 둘로 늘어난다.
  같은 id면 실시간 병합이 그냥 같은 행 갱신이 된다.
  (예전에는 `MemberColumn`이 `createTodo`를 직접 부르고 응답 뒤 목록을 통째로 다시 읽어서,
  추가 한 번에 서버 왕복 두 번 ~700ms 동안 화면이 멈춰 있었다.)
- `onMutate`는 **반드시 `cancelQueries`를 먼저 await한다.** `onSettled`마다 invalidate가
  돌기 때문에 이전 refetch가 날아다니는 상황이 흔한데, 그게 낙관적 패치보다 늦게 도착하면
  방금 바꾼 값을 옛날 값으로 덮어써서 체크가 저 혼자 풀린 것처럼 보인다.
- 실패하면 `onMutate`가 잡아 둔 스냅샷으로 롤백하고 이유를 토스트로 알린다.
- `handled_by` / `completed_at`은 **서버와 같은 규칙으로 미리 채운다** — 안 그러면
  "대신 처리" 배지가 한 번 깜빡인다.
- 메모는 작성자 이름·아바타 조인이 필요해서 낙관적으로 그리지 않는다.
- **지우기는 실행취소 토스트를 띄운다**(`lib/toast.ts`의 `showUndo`). 소프트 삭제라
  `restoreTodo`로 되살릴 수 있고, 확인 창을 묻는 것보다 이쪽이 빠르고 안전하다.

### 편집 중 실시간 충돌

카드 인라인 수정은 편집을 시작한 순간의 값을 `editBase` ref에 잡아 두고, 저장할 때 그 값과
비교해 "안 바뀜"을 판정한다. **현재 `todo.title`과 비교하면 안 된다** — 편집하는 동안 실시간으로
들어온 남의 수정이 "내가 바꾼 것"으로 오인돼 그대로 덮어써진다.

### 컬럼 안 정렬

급한 것부터 위로 — **지난 마감 → 오늘 → 나중 → 마감 없음**. 마감이 같으면 나중에 넣은 것이
위로 온다(`position`은 새 할 일일수록 작다). 완료한 일은 맨 아래에 **최근 끝낸 순**으로 쌓는다.
`MemberColumn`이 클라이언트에서 정렬한다 — 서버는 `position` 순으로만 준다.

### 카드 펼침은 한 번에 하나

펼침 상태는 `BoardClient`의 `openTodo` 하나뿐이고 **보드/대시보드 중 어느 쪽에서 열었는지도
같이 담는다**. 전환이 헤더에서 일어나서 보드가 그 변화를 감지할 수 없기 때문에, 렌더할 때
비교해 다른 쪽의 펼침은 무시한다(상태를 하나 더 두지 않고 같은 결과). 여러 개가 동시에 열려
있으면 컬럼이 길어져 무엇이 남았는지 한눈에 안 들어온다. 다른 카드를 열거나, 레이아웃을
바꾸거나, 다른 멤버로 이동하면 접힌다.

펼친 내용의 순서는 **메모 목록 → 메모 입력 → 동작 버튼(수정 · 같이하기)**이다.
자주 하는 일이 메모 한 줄이라 그게 먼저 와야 하고, 동작을 한곳에 모아야 내 할 일과 남의
할 일에서 버튼이 있는 자리가 같다. "대신 처리"는 여기 없다 — 체크박스가 그 일을 한다.

### 할 일 카드 정렬

체크박스 · 제목 · X 세 칸은 **모두 `py-2`로 위 패딩을 맞춰** 첫 줄 기준선이 겹치게 한다.
그 패딩이 곧 터치 영역이다(아이콘 20px + 상하 8px = 36px).
음수 마진으로 위치를 미세 조정하지 말 것 — 폰트나 줄 높이가 바뀌면 바로 어긋난다.

### 터치 타깃

`components/ui.tsx`의 `Button` / `Input`은 모바일에서 크고 `sm:`에서 조밀해진다
(`md` 기준 48px → 40px). Apple HIG 최소 44pt에 맞춘 것이니 개별 화면에서 임의로 줄이지 말 것.
할 일 체크박스처럼 시각 요소가 작아야 하는 경우에는 **패딩으로 탭 영역만 넓힌다**
(`TodoCard`의 `-my-1 p-2.5` 패턴).

### 보드 / 대시보드 두 모드

**보드**(기본) — 멤버별 컬럼의 가로 스냅 캐러셀. 손가락으로 좌우로 밀어 팀원을 오간다.
내 컬럼이 항상 첫 번째라 열자마자 내 할 일부터 보인다.

- 모바일은 **한 화면에 한 명만** 보여야 한다. 컬럼 폭은 `w-full`(스크롤 컨테이너의 콘텐츠
  폭)이고, 스크롤러에 `scroll-pl-3`을 준다. 이 `scroll-pl`이 없으면 두 번째 컬럼부터
  스냅 기준이 패딩을 무시해 옆 컬럼이 삐져나온다. `100vw`로 잡는 것도 금물 —
  스크롤바 폭만큼 어긋난다.
- `sm:` 이상은 330px 고정이라 여러 명이 한눈에 들어온다.
- **마우스 드래그로 밀 수 있다**(`hooks/useCarousel.ts`). 터치는 네이티브 스크롤이 이미
  좋지만(관성·스냅·컬럼 내부 세로 스크롤이 전부 공짜), 마우스에는 그런 게 없어서
  가로 스크롤바를 찾거나 shift+휠을 눌러야 했다.
  - `pointerType === 'mouse'`일 때만 붙인다. 입력 요소 위에서 시작하면 무시한다.
  - 4px 넘게 움직여야 드래그로 친다. 그 전에는 그냥 클릭이다.
  - 드래그 중에는 `scroll-snap-type: none` — 켜진 채로는 칸마다 걸려 손을 따라오지 않는다.
    놓을 때 스냅을 되돌리고 가장 가까운 칸으로 직접 보낸다(브라우저가 항상 붙여 주지 않는다).
  - **드래그 끝 지점의 클릭 한 번을 capture에서 삼킨다.** 안 그러면 컬럼을 밀었을 뿐인데
    그 자리의 할 일이 완료 처리된다.
  - `user-select`는 드래그하는 동안만 잠근다. 상시로 걸면 할 일 제목·메모를 복사할 수 없다.
  - **무한 순환은 하지 않는다.** 복제본을 앞뒤에 덧대는 방식이었는데, 되감기 타이밍·복제본
    상태·스크롤 튐까지 딸려 오는 것에 비해 얻는 게 적었다.
- 스크롤러 DOM은 ref가 아니라 **state로도 들고 있는다**. 보드는 뷰 전환 애니메이션이 끝난
  뒤에야 마운트되기 때문에, ref만 보고 이펙트를 걸면 첫 실행 때 null이라 드래그 리스너가
  영영 붙지 않는다.
- 현재 위치는 스크롤 위치에서 역산해 상단 멤버 칩 하이라이트에 반영한다.
  멤버 칩을 탭하면 그 컬럼으로 부드럽게 이동한다.

**대시보드** — 툴바의 대시보드 버튼으로 전환. 모든 멤버를 세로로 쌓아 위아래 스크롤로 한 번에
훑는다(`sm:`부터 2열, `lg:`부터 3열). `MemberColumn`에 `stacked`를 주면 뷰포트 높이 고정과
내부 스크롤을 끄고 내용만큼만 자란다.

뷰 전환은 `AnimatePresence mode="wait"` + opacity·y 8px다.
**transform은 바깥 래퍼에만 건다** — 스크롤 스냅 컨테이너 자체에 걸면 스냅 위치가 어긋나서,
캐러셀은 `motion.div` 안에 별도 `div`로 감싸 두었다. 모션 최소화는
`useReducedMotion()`으로 따로 처리한다 — framer-motion은 CSS 미디어 쿼리를 따르지 않는다.

캐러셀 `resetKey`는 `` `${activeOrgId}:${mode}` ``다. 대시보드에 다녀오면 캐러셀이 다시
마운트되는데, 그때 위치를 안 잡으면 스크롤이 0에 남아 엉뚱한 사람부터 보인다.
보드는 언제 열어도 내 할 일부터 보여야 한다.

완료한 할 일 표시 여부는 **보드가 아니라 설정(`/me`)에 있고 `profiles.show_done`에 저장한다.**
기기를 옮겨도 같은 화면이어야 하는 취향이지, 화면마다 껐다 켜는 값이 아니다.
기본은 보임 — 팀원이 뭘 끝냈는지가 곧 공유의 목적이다.

### 달력 목록 패널 — 끌어서 크기 조절

목록은 **늘 화면에 있다.** 날짜를 눌러야만 나타나면 목록이 있다는 것 자체를 모르는 사람이
생긴다. 손잡이를 위아래로 끌면 목록이 커지고 그만큼 달력이 줄어든다(`useResizablePanel`).

**높이를 바꾸는 곳은 손잡이 하나뿐이다.** 한때 날짜를 누르면 목록을 반쯤 펴 주기도 했는데,
날짜를 누르는 건 대부분 "이 날 뭐 있나" 훑는 동작이라 누를 때마다 보려던 달력이 줄어들었다.
날짜 탭은 **고른 날짜만 바꾼다** — 목록 내용은 따라 바뀌지만 높이는 그대로다.

- 높이는 px가 아니라 **컨테이너 대비 비율**이다. 주소창이 접혔다 펴지며 dvh가 실시간으로
  바뀌는데 px로 잡아 두면 그때마다 비율이 어긋난다.
- 스냅은 **2단뿐이다**(`0.24 / 0.5`). 그보다 더 올리면 달력 칸이 날짜 숫자도 겨우 들어가는
  높이로 눌려 달력이라기보다 찌그러진 격자가 된다 — 목록을 그만큼 크게 보고 싶다면
  그건 달력 화면이 할 일이 아니다.
- 놓으면 **시작한 칸의 바로 옆 칸**으로 붙지 "가장 가까운 칸"으로 붙지 않는다 —
  가장 가까운 칸으로 붙이면 손가락을 조금 크게 움직였을 때 두 칸이 한 번에 뛴다.
- 손잡이는 끌 수도 있고 **누를 수도** 있다(다음 단계로). 작은 화면에서 몇 픽셀을 정확히
  끄는 것보다 한 번 누르는 쪽이 빠를 때가 많다. `touch-none`이 없으면 브라우저가 이 세로
  제스처를 페이지 스크롤로 먹는다.
- 실제로 줄어들게 하려고 격자는 `flex-1 min-h-0` + `auto-rows-fr`이다(`sm:`은 예전대로
  `aspect-[6/7]`). 칸에 `aspect`를 걸면 폭이 높이를 정해 버려 아무리 끌어도 잘리기만 한다.
- **칸에 `overflow-hidden`을 걸지 말 것.** 일정 띠는 시작 칸의 자식인데 폭이
  `calc(100% * n)`으로 여러 칸에 걸쳐 있어서, 칸에서 잘라 내면 띠가 시작한 하루만 남고
  나머지 날은 빈칸이 된다(기간 일정이 중간중간 끊겨 보인다).
- 칸이 납작해지면 띠 3줄(52px)이 안 들어가므로 **점 모드**로 바꾼다.

### 달력 넘기기

좌우로 밀어 달을 옮긴다(`hooks/useHorizontalSwipe.ts`). 스크롤 컨테이너가 아니라 그냥 영역이라
네이티브 스크롤을 쓸 수 없어 포인터 이동을 직접 잰다.

- **세로가 더 크면 손을 뗀다** — 페이지를 스크롤하려는 것이다. `touch-action: pan-y`로
  세로 스크롤은 브라우저에 남긴다.
- 민 자리에 날짜 칸이 있으면 그게 눌린다 — 캐러셀과 같이 클릭 한 번을 capture에서 삼킨다.

### 폼의 키보드 흐름 — lib/forms.ts

`<form>` 안의 텍스트 입력에서 Enter는 브라우저가 **곧바로 폼을 제출한다**(implicit
submission). 그래서 `enterKeyHint="next"`라고 적어 놓고 실제로는 넘어가지 않는 칸이
여럿 있었다 — 절반만 채운 채 제출되거나, 제출 조건을 못 넘겨 아무 일도 안 일어난 것처럼 보였다.

- 중간 칸: `enterKeyHint="next"` + `onKeyDown={e => focusNextOnEnter(e, nextRef.current)}`
- 마지막 칸: `done`/`go`/`send`만 주고 브라우저의 기본 제출에 맡긴다
- `<form>` 밖의 홀로 있는 칸(내 설정의 이름): `submitOnEnter(e, run)`
- **`isComposing` 검사가 필수다.** 한글을 조합하는 중의 Enter는 글자를 확정하는 키다 —
  안 거르면 "커피"를 치고 넘어가는 순간 마지막 글자가 끊긴다.
- ref를 **엘리먼트로** 넘긴다(`focusNextOnEnter(e, ref.current)`). ref나 ref를 읽는 함수를
  렌더 중에 넘기면 `react-hooks/refs`가 막고, 값은 키를 누르는 순간에 읽는 게 맞다.

여러 줄 입력(`<Textarea>`, 대신 처리 메모)에는 붙이지 않는다 — 거기서 Enter는 줄바꿈이다.

### 설정은 즉시 저장한다

`/me`에는 저장 버튼이 없다. 테마와 언어는 고르는 순간 화면이 이미 바뀌고 사진은 고르는 즉시
올라가는데, 그 상태에서 저장 버튼만 남겨 두면 "어떤 건 눌러야 남고 어떤 건 안 눌러도 남는지"를
화면이 설명하지 못한다. 이름만 예외로 입력이 멎은 뒤(700ms) 보낸다.
실패하면 토스트로 알리고 **값을 되돌린다** — 무엇을 어떤 값으로 되돌릴지는 호출한 쪽이 안다.

고른 표시는 `border-accent bg-accent-soft`로 준다. `surface-alt`만으로는 어두운 테마에서
카드 배경과 거의 같은 색이라 무엇을 골랐는지 보이지 않는다.

### 스크롤 막대는 그리지 않는다

`globals.css`가 전역으로 감춘다(`scrollbar-width: none` + `::-webkit-scrollbar`).
이 앱은 스크롤 영역이 겹겹이다 — 멤버 컬럼 안, 가로 캐러셀, 시트 내용, 달력 목록, 날짜 피커.
그때마다 회색 막대가 카드 위에 얹혀 테두리가 두 겹처럼 보이고, 가로 스크롤러에서는 막대가
차지한 높이만큼 칸이 위로 밀린다. 스크롤과 키보드 이동은 그대로다 — 그리는 것만 끈다.
컴포넌트마다 따로 붙이지 말 것.

### 그 밖의 iOS 대응

- 이메일 입력에는 `autoCapitalize="none"` · `autoCorrect="off"` · `inputMode="email"` 필수 —
  iOS가 첫 글자를 대문자로 바꿔 로그인이 실패한다
- 입력 폰트는 모바일에서 16px 미만이면 Safari가 화면을 강제 확대한다
  (`globals.css`의 미디어 쿼리가 `!important`로 막아 둠)
- 그래도 확대되는 경우가 있어 viewport에 `maximumScale: 1`을 둔다. iOS 10부터 Safari는
  **사용자의 핀치 줌은 이 값과 무관하게 늘 허용**하므로 막히는 건 자동 확대뿐이다.
  `userScalable: false`는 쓰지 말 것 — 그건 의도가 다르고 접근성을 실제로 깬다
- `interactiveWidget: 'resizes-content'` — 키보드가 올라오면 뷰포트를 줄여서 콘텐츠가
  키보드 뒤로 숨지 않게 한다
- 드롭다운 대신 `components/BottomSheet.tsx`를 쓴다 — 터치에서 `onBlur` 타이밍이 어긋나
  메뉴가 먼저 닫혀버린다. 아래로 끌어내리면 닫힌다
- 시트 내용은 `max-h-[70dvh]`로 스크롤한다. 패널 전체를 스크롤 컨테이너로 만들면
  드래그로 닫기와 엉킨다
- 토스트는 sonner의 `richColors`를 쓰지 않는다 — 자체 팔레트라 잉크 블랙에서 흰 박스로 튄다.
  `toastOptions.classNames`로 시맨틱 토큰을 직접 입힌다
- sonner 기본 폭은 356px 고정이라 393px 화면에서 좌우 여백까지 더하면 넘친다.
  `globals.css`에서 `[data-sonner-toaster]`의 `--width`를 좁힌다(미디어 쿼리 불필요)
- 크롬 UI(헤더·툴바·버튼)에는 `no-select`를 붙이되, 할 일 제목·메모는 복사할 수 있어야 하므로
  `body` 전체에 `user-select: none`을 걸지 말 것

### 아이콘

`app/icon.svg`(파비콘)와 `app/apple-icon.tsx`(홈 화면용 180px PNG, `next/og`의 ImageResponse)
둘 다 베이지 배경 + 검정 "Todo" 텍스트다. iOS는 SVG 터치 아이콘을 제대로 다루지 않아
apple-icon만 PNG로 그린다.

### 사람 이름 뒤 조사

`subjectParticle(name)` — 받침이 있으면 "이", 없으면 "가".
"최진형이 부탁" / "최진우가 부탁". 하나로 고정하면 반드시 한쪽이 어색해진다.
한글이 아니면(영문·숫자) "가"로 둔다.

### 안내 문구 말투

사용자에게 보이는 모든 문구는 **해요체**로 쓴다 — 토스트, 빈 화면, 폼 설명, 그리고
**서버 액션이 throw하는 에러 메시지까지**. 액션 에러는 `wrap()`을 거쳐 그대로 토스트에 뜨기
때문에 "~할 수 없습니다"가 하나만 섞여도 바로 튄다.
개발자만 보는 문구(`OrgContext`의 훅 사용 오류 등)는 예외다.

### 위험한 동작

`Button`의 `danger`는 **꽉 채운 빨강**이고 되돌릴 수 없는 동작에만 쓴다.
멤버 내보내기처럼 복구 수단이 없는 건 빨간 버튼 하나로 끝내지 않고
`BottomSheet` 확인을 한 단계 더 둔다(`TeamClient`의 멤버 관리 시트 안에서 `confirmKick`으로
한 번 더 묻는 패턴). 멤버 목록 자체에는 버튼을 늘어놓지 않는다 — 멤버가 늘수록 목록이
버튼밭이 되고, 되돌릴 수 없는 빨간 버튼이 늘 떠 있게 된다. 행을 누른 사람 것만 시트로 연다.
반면 할 일 X는 소프트 삭제라 확인 없이 바로 지운다 — 복구 가능한 것과 아닌 것을 구분한다.

### 아바타

프로필 사진이 있으면 사진, 없으면 **이름 첫 글자 + 색**으로 사람을 구분한다
(`lib/avatar.ts`, `components/Avatar.tsx`).
색을 고르지 않은 사용자는 `getAvatarColor(null, userId)`가 id 해시로 하나를 결정적으로 배정하므로,
가입 직후에도 팀원끼리 색이 겹치지 않고 안정적이다. 저장 컬럼은 `profiles.avatar_color`
(색 키 문자열, 예: `sea`). **색은 고르게 하지 않는다** — 계정 id에서 결정적으로 배정하므로
설정 화면을 늘리지 않으면서 팀원끼리 잘 겹치지 않는다. 팔레트는 12색이고 밝은·어두운 테마
양쪽에서 읽히는 중간 밝기다.

**"남의 사진 숨기기" 설정은 두지 않는다.** 아바타는 사람을 구분하려고 있는 것이고 사진을
지우면 구분이 오히려 흐려진다. 그 설정 하나 때문에 `Avatar`가 앱 컨텍스트를 읽어야 했고,
그래서 아바타 하나 그리는 데 클라이언트 컴포넌트가 필요했다.

**사진 업로드**(`lib/image-upload.ts`)는 Supabase Storage를 쓴다.
사람 아바타는 `avatars`, 조직 아이콘은 `org-images` 버킷이다.

- 원본을 그대로 올리지 않는다 — 캔버스로 가운데를 정사각형으로 잘라 **256px webp**로 줄인다
  (폰 사진 3~5MB → 보통 20KB대).
- 경로는 사용자마다 하나로 고정(`{userId}/avatar.webp`)하고 `upsert`로 덮어쓴다.
  파일이 쌓이지 않는 대신 브라우저가 옛 이미지를 캐시하므로, 저장하는 URL 끝에
  `?v={timestamp}`를 붙여 무효화한다.
- 버킷은 **public**이다. 서명 URL 만료를 관리할 필요가 없고 아바타는 새어도 피해가 없다.
  쓰기는 `storage.objects` 정책이 `(storage.foldername(name))[1] = auth.uid()`로 막는다 —
  즉 남의 폴더에는 못 올린다.
- 사진은 "저장" 버튼을 기다리지 않고 고르는 즉시 업로드·반영한다. 업로드가 끝났는데 저장을
  또 눌러야 하면 올라간 건지 알 수 없다.

**조직 아이콘**(`components/OrgIcon.tsx`)은 사람 아바타와 구분되도록 원이 아니라 **둥근 사각형**이다.
없으면 조직 이름 첫 글자 + 조직 id에서 뽑은 색. 헤더의 조직 이름 왼쪽, 조직 시트, 팀 화면에 나온다.
업로드는 방장/관리자만 — `org-images` 버킷 정책이
`public.is_org_manager((storage.foldername(name))[1]::uuid)`로 막는다(경로 첫 폴더가 조직 id).

### 상태를 effect로 만들지 말 것

`react-hooks/set-state-in-effect` 규칙이 켜져 있다. localStorage처럼 React 밖의 값은
`useEffect` + `setState`가 아니라 `useSyncExternalStore`로 읽는다 (`hooks/useActiveOrg.ts` 참고).

## 디자인 시스템

테마는 6개다. 윗줄이 기본 3종(**시스템**(기본) · 화이트 · 다크), 아랫줄이 널리 쓰이는
팔레트 3종(**Solarized** · **Nord** · **Dracula**)이다. 3열 격자에 두 줄로 맞춘 것이라
개수를 바꾸면 격자가 어그러진다.

팔레트 테마는 원본 공식 색을 그대로 쓰되 상태색만 배경 대비에 맞게 조정했다
(예: Solarized의 green/red를 밝은 크림 배경 위에서 읽히도록 낮춤).
Nord·Dracula는 강조색을 각 팔레트의 상징색(Frost `#88c0d0`, Purple `#bd93f9`)으로 둔다 —
그래야 그 테마를 고른 티가 난다.

- `system`은 칠해지는 값이 아니라 "기기 설정을 따른다"는 뜻이다.
  `resolveTheme(preference, prefersDark)`가 실제 `data-theme` 값을 정하고,
  시스템을 고른 동안에는 `matchMedia` 구독을 유지해 설정이 바뀌면 바로 따라간다.
- **첫 페인트 전에 칠해야 한다.** React가 붙은 뒤에 칠하면 다크를 쓰는 사람에게 흰 화면이
  한 번 번쩍인다 — `layout.tsx`의 렌더 블로킹 인라인 스크립트가 localStorage를 읽어 먼저 칠한다.
  테마를 추가하면 그 스크립트의 목록도 함께 고칠 것.
- `:root`가 밝은 기본값을 깔고 각 테마 블록은 달라지는 토큰만 덮는다.
  어두운 테마들은 그림자와 `color-scheme`만 공통 블록에서 덮고, 상태색은 팔레트마다 다르므로
  각자 갖는다 — 밝은 배경용 상태색을 어두운 배경에 그대로 쓰면 칩이 눈을 찌른다.
- `resolveTheme`은 모르는 값이 오면 기기 설정으로 떨어진다. 테마를 없앨 때 DB에 남은
  옛 값이 화면을 깨뜨리지 않는다(다만 설정 화면에서 아무것도 선택돼 보이지 않으니 정리할 것).

컴포넌트는 항상 시맨틱 토큰만 쓴다:

```
bg-canvas / bg-canvas-soft / bg-surface / bg-surface-alt
text-ink / text-ink-secondary / text-ink-muted / text-ink-faint / text-ink-invert
border-hairline / border-hairline-strong
bg-accent / text-accent-ink
```

토큰 실값은 `app/globals.css`의 `:root[data-theme="..."]` 블록에 있다.
**새 테마를 추가할 때는 이 블록 하나와 `lib/themes.ts`의 `THEMES` 배열만 건드리면 된다** —
컴포넌트에 하드코딩된 색이 들어가면 테마 유료화가 깨진다.

테마 선택값은 `profiles.theme`에 저장하고 localStorage(`todolight_theme`)에 캐시해서
로드 시 깜빡임을 막는다.

## 주의사항

- **`middleware.ts` 절대 생성 금지** — Next.js 16에서 `proxy.ts`와 충돌
- 보호 라우트를 추가하면 `proxy.ts`의 `PROTECTED_PREFIXES`와 `config.matcher` 양쪽에 등록
- `lib/supabase-admin.ts`는 서버에서만 import (`server-only` 가드가 걸려 있음)
- 모든 서버 액션은 `requireAuth()` + 조직 소속 검사로 시작
- 컴포넌트에 색을 하드코딩하지 말 것 (테마 토큰만 사용)
- 날짜 표시는 KST 기준 (`lib/utils.ts`의 `todayKST`, `formatRelativeDay`)

## 향후 계획

- 유료 테마 결제 연동 (현재 `THEMES`의 `free: false` 항목이 자리만 잡아 둔 상태)
- 할 일 드래그 정렬 UI (`position`이 double이라 서버 액션만 새로 만들면 된다)
- Swift iOS 앱 — 웹앱 안정화 후 검토. 서버 액션 대신 쓸 REST/Edge Function 레이어가 필요해진다.
