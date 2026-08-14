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
    ├── board/            메인 보드 — 멤버별 컬럼 가로 스냅 캐러셀. 앱의 사실상 유일한 화면
    ├── team/             멤버 목록, 초대 발송·취소, 역할 변경, 조직 이름 변경, Discord 웹훅
    ├── me/               프로필(이름·아바타 사진/색)·테마 설정
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

도메인별 파일: `orgs.ts`(조직·멤버·초대) · `todos.ts`(할 일·메모·대신 처리) · `profile.ts`.

`ApiResponse<T>`는 `{success:true, data} | {success:false, error}` 판별 유니온이라
좁히기가 되려면 `strictNullChecks`가 켜져 있어야 한다 — `tsconfig.json`에서 켜 뒀다.
(`strict`는 꺼져 있고 `strictNullChecks`만 따로 켠 상태)

## DB 스키마

```
profiles        id (FK auth.users), email, display_name, avatar_color, avatar_url, theme, created_at
organizations   id, name, owner_id, discord_webhook_url, created_at
org_members     id, org_id, user_id, role('owner'|'admin'|'member'), joined_at   UNIQUE(org_id,user_id)
org_invites     id, org_id, email, invited_by, status('pending'|'accepted'|'declined'|'revoked'),
                created_at, responded_at
                — (org_id, lower(email)) WHERE status='pending' 부분 유니크 인덱스
todos           id, org_id, owner_id, title, status('todo'|'doing'|'done'), due_date,
                position(double), created_by, handled_by, completed_at, deleted_at,
                created_at, updated_at
todo_notes      id, todo_id, author_id, content, created_at
```

- `todos.owner_id`가 보드에서 어느 컬럼에 놓일지를 결정한다. `created_by`와 다르면
  남이 대신 꽂아 넣은 할 일이다.
- `handled_by`가 `owner_id`와 다르면 "남이 대신 처리해 줌" 배지가 뜬다.
- `position`은 double이라 앞/사이에 끼워 넣을 때 뒤 항목들을 다시 쓸 필요가 없다.
- **삭제는 전부 소프트 삭제다.** `deleted_at`만 찍고 행은 남긴다 — 카드 오른쪽 X는 확인 창 없이
  바로 눌리므로 실수해도 되돌릴 수 있어야 한다. 모든 조회에 `.is('deleted_at', null)`를
  빠뜨리지 말 것(부분 인덱스 `todos_org_owner_alive_idx`도 이 조건 기준이다).

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

### 셸 구조 — 화면은 보드 하나

```
헤더 (--header-h)   [←(보드 밖일 때)] [조직 이름 ▾] ......... [아바타]
툴바 (--board-toolbar-h)  멤버 칩 + 완료 보임/숨김 토글
보드                가로 스냅 캐러셀
```

**하단 탭바는 두지 않는다.** 이 앱의 화면은 공유 투두 보드 하나뿐이고,
팀 관리·내 설정·로그아웃은 자주 쓰지 않으므로 아바타 탭 시트(`MENU`) 안에 있다.
보드 툴바에도 멤버 칩과 완료 토글 외의 버튼을 새로 붙이지 말 것 — 메인 기능을 가린다.

**받은 초대는 전용 화면을 두지 않는다.** 초대를 받는다는 건 결국 "어느 조직을 볼지"의
문제라서, 조직 전환 시트 맨 위에서 바로 수락·거절한다. 대기 중인 초대가 있으면 헤더의
조직 이름 옆에 **작은 빨간 점**만 띄운다(숫자 배지는 화면을 시끄럽게 만든다).
수락하면 그 조직으로 바로 전환하고 시트를 닫는다 — 수락하고 또 고르게 하면 한 단계가 남는다.
시트를 밖에서 열어야 하면 `useApp()`의 `openOrgSheet`를 쓴다.

높이 상수는 `app/globals.css`의 `:root`에 `--header-h` · `--board-toolbar-h`로 두고
미디어 쿼리에서 값만 바꾼다. `board-viewport`가 `100dvh`에서 이 둘과 세이프 에어리어를 빼기 때문에,
보드는 **페이지가 늘어나지 않고** 컬럼 내부만 세로 스크롤한다.
세로로 흐르는 페이지(팀/초대/내 설정/조직 생성)는 끝에 `pb-safe`를 붙인다.

### 세이프 에어리어

`layout.tsx`의 `viewportFit: 'cover'`가 있어야 `env(safe-area-inset-*)`가 0이 아니다.
이게 빠지면 `pb-safe` · `board-viewport`의 홈 인디케이터 회피가 통째로 무효가 된다.
유틸리티는 `pb-safe` · `pt-safe` · `px-safe`.

### 마감일 입력

`components/DueStepper.tsx` — 달력도 키보드도 띄우지 않는다. **오늘이 기본값**이고 좌우 버튼으로
하루씩 밀고 당긴다. 가운데를 누르면 "마감 없음"으로 토글된다.
`<input type="date">`로 되돌리지 말 것 — 모바일에서 네이티브 피커가 화면 절반을 덮어서,
할 일 하나 넣는 데 드는 동작이 배로 늘어난다.

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
- 현재 위치는 스크롤 위치에서 역산해(`syncActiveIndex`) 상단 멤버 칩 하이라이트에 반영한다.
  멤버 칩을 탭하면 `scrollIntoView`로 그 컬럼으로 이동한다.

**대시보드** — 툴바의 대시보드 버튼으로 전환. 모든 멤버를 세로로 쌓아 위아래 스크롤로 한 번에
훑는다(`sm:`부터 2열, `lg:`부터 3열). `MemberColumn`에 `stacked`를 주면 뷰포트 높이 고정과
내부 스크롤을 끄고 내용만큼만 자란다.

완료한 할 일은 **기본으로 보인다**(`showDone` 초기값 `true`). 팀원이 뭘 끝냈는지가 곧 공유의
목적이라서 숨기는 쪽을 선택지로 뒀다.

### 그 밖의 iOS 대응

- 이메일 입력에는 `autoCapitalize="none"` · `autoCorrect="off"` · `inputMode="email"` 필수 —
  iOS가 첫 글자를 대문자로 바꿔 로그인이 실패한다
- 입력 폰트는 모바일에서 16px 미만이면 Safari가 화면을 강제 확대한다
  (`globals.css`의 미디어 쿼리가 `!important`로 막아 둠)
- 드롭다운 대신 `components/BottomSheet.tsx`를 쓴다 — 터치에서 `onBlur` 타이밍이 어긋나
  메뉴가 먼저 닫혀버린다. 아래로 끌어내리면 닫힌다
- 크롬 UI(헤더·툴바·버튼)에는 `no-select`를 붙이되, 할 일 제목·메모는 복사할 수 있어야 하므로
  `body` 전체에 `user-select: none`을 걸지 말 것

### 아이콘

`app/icon.svg`(파비콘)와 `app/apple-icon.tsx`(홈 화면용 180px PNG, `next/og`의 ImageResponse)
둘 다 베이지 배경 + 검정 "Todo" 텍스트다. iOS는 SVG 터치 아이콘을 제대로 다루지 않아
apple-icon만 PNG로 그린다.

### 안내 문구 말투

사용자에게 보이는 모든 문구는 **해요체**로 쓴다 — 토스트, 빈 화면, 폼 설명, 그리고
**서버 액션이 throw하는 에러 메시지까지**. 액션 에러는 `wrap()`을 거쳐 그대로 토스트에 뜨기
때문에 "~할 수 없습니다"가 하나만 섞여도 바로 튄다.
개발자만 보는 문구(`OrgContext`의 훅 사용 오류 등)는 예외다.

### 위험한 동작

`Button`의 `danger`는 **꽉 채운 빨강**이고 되돌릴 수 없는 동작에만 쓴다.
멤버 내보내기처럼 복구 수단이 없는 건 빨간 버튼 하나로 끝내지 않고
`BottomSheet` 확인을 한 단계 더 둔다(`TeamClient`의 `pendingKick` 패턴).
반면 할 일 X는 소프트 삭제라 확인 없이 바로 지운다 — 복구 가능한 것과 아닌 것을 구분한다.

### 아바타

프로필 사진이 있으면 사진, 없으면 **이름 첫 글자 + 색**으로 사람을 구분한다
(`lib/avatar.ts`, `components/Avatar.tsx`).
색을 고르지 않은 사용자는 `getAvatarColor(null, userId)`가 id 해시로 하나를 결정적으로 배정하므로,
가입 직후에도 팀원끼리 색이 겹치지 않고 안정적이다. 저장 컬럼은 `profiles.avatar_color`
(색 키 문자열, 예: `sea`). 팔레트는 12색이고, 늘릴 때는 `AVATAR_COLORS`에만 추가하면 된다.
색은 화이트·블랙 두 테마 위에서 모두 읽히도록 중간 밝기로 골랐다.

**사진 업로드**(`lib/avatar-upload.ts`)는 Supabase Storage의 `avatars` 버킷을 쓴다.

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

### 상태를 effect로 만들지 말 것

`react-hooks/set-state-in-effect` 규칙이 켜져 있다. localStorage처럼 React 밖의 값은
`useEffect` + `setState`가 아니라 `useSyncExternalStore`로 읽는다 (`hooks/useActiveOrg.ts` 참고).

## 디자인 시스템

테마는 **잉크 화이트(`ink`, 기본)** 와 **잉크 블랙(`ink-dark`)** 둘뿐이다.
같은 잉크 계열의 명암만 뒤집은 것이라 어느 쪽이든 톤이 차갑게 튀지 않는다.
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
- 할 일 드래그 정렬 UI (`reorderTodo` 액션은 이미 있고 프론트만 없음)
- Swift iOS 앱 — 웹앱 안정화 후 검토. 서버 액션 대신 쓸 REST/Edge Function 레이어가 필요해진다.
