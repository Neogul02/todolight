# todolight iOS (Swift) 전환 계획

> 이 문서는 "웹앱을 Swift로 다시 만든다"가 아니라 **"지금 백엔드 위에 네이티브 클라이언트를
> 하나 더 붙인다"** 는 관점으로 쓰였다. 웹은 계속 산다(PC·안드로이드가 있다).
> 목표는 iOS에서만 되는 것 — 잠금화면·홈화면 위젯, 푸시, 햅틱, 오프라인 — 을 얻는 것이다.

작성 기준: 2026-09-02 · 웹 커밋 `51fa00d`

---

## 0. 결론 먼저

| 질문 | 답 |
|------|-----|
| 새 repo로 옮길까? | **아니다.** 같은 repo의 `ios/` 폴더. 이유는 [§9](#9-레포와-폴더-구조) |
| 폴더를 `apps/web`으로 재배치할까? | **지금은 하지 마라.** 얻는 게 정돈된 느낌뿐이고 Vercel·tsconfig·codegraph가 전부 root 기준이다 |
| 백엔드를 새로 만들까? | **아니다.** 서버 액션 함수를 그대로 두고 그 위에 얇은 `/api/v1` 어댑터만 얹는다 |
| Swift에서 Supabase를 직접 부를까? | **읽기만.** 쓰기는 API를 거친다. 이유는 [§2](#2-핵심-결정-왜-rls-직결이-아니라-공유-api인가) |
| 잠금화면은 무엇으로? | **WidgetKit 위젯이 본체**, Live Activity는 선택. 이유는 [§6](#6-잠금화면) |
| 가장 먼저 할 일은? | 코드가 아니라 [§1의 P0 세 가지](#p0--코드-쓰기-전에-끝내야-하는-것) |
| 출시는 어떻게 하나? | 절차 전체가 [`docs/ios-release.md`](./ios-release.md)에 있다 ([§10 M5](#m5--출시--2주)) |

---

## 1. 지금 코드베이스의 경계선

### 그대로 넘어가는 것 (자산)

- **DB 스키마와 마이그레이션** — 손댈 이유가 거의 없다. 추가되는 건 `device_tokens` 하나뿐.
- **서버 액션 41개의 로직** — 가드, zod 검증, Discord 알림, `position` 계산. 재작성 대상이 아니다.
- **`CLAUDE.md`에 적힌 결정들** — 이게 제일 값나가는 자산이다. 컬럼 정렬 규칙(지난 마감 → 오늘 →
  나중 → 마감 없음), "부탁" 배지 조건, `subjectParticle` 조사 처리, 소프트 삭제 + 실행취소,
  카드 펼침은 한 번에 하나, 테마 토큰 6종. **코드는 못 옮기지만 결정은 1:1로 옮긴다.**
  Swift로 다시 짜면서 이걸 안 보면 반드시 다른 앱이 된다.
- **`messages/{ko,en}.json`** — String Catalog(`.xcstrings`)로 변환 가능. [§8](#8-웹에서-못-가져오는-것)

### 못 넘어가는 것 (전부 다시 만든다)

`CLAUDE.md`의 모바일 레이아웃 절 전체가 여기 해당한다 — 그리고 대부분은 **네이티브에서 사라지는
문제다.** 웹에서 고생한 것의 절반은 브라우저를 앱처럼 보이게 하려는 싸움이었다.

| 웹에서 만든 것 | iOS에서 |
|---|---|
| `useCarousel` (스크롤 스냅 + 마우스 드래그 + 클릭 삼키기) | `TabView(.page)` 또는 `ScrollView(.horizontal).scrollTargetBehavior(.viewAligned)` — 공짜 |
| `BottomSheet` (포털·포커스 트랩·드래그 닫기) | `.sheet` + `.presentationDetents` — 공짜 |
| `useResizablePanel` (비율·2단 스냅·pointercancel) | `.presentationDetents([.fraction(0.24), .fraction(0.5)])` — 공짜 |
| `DuePicker` (네이티브 피커 회피용 가로 스크롤) | **직접 만든 것을 유지한다.** `DatePicker`는 웹의 `<input type="date">`와 같은 문제를 갖는다 |
| `app-viewport` / `--tabbar-h` / `pb-safe` dvh 산수 | `safeAreaInset`, `TabView` — 공짜 |
| iOS 확대 방지, `viewportFit`, `interactiveWidget` | 존재하지 않는 문제 |
| 스크롤바 숨기기, `cursor: pointer` 복구 | 존재하지 않는 문제 |
| 테마 토큰 CSS 변수 | `Theme` 구조체 + `Environment` 주입 ([§8](#8-웹에서-못-가져오는-것)) |
| 낙관적 반영 + 롤백(`useTodoMutations`) | **규칙을 그대로 옮긴다.** 스냅샷·롤백·`isTodoPending` 개념 전부 필요하다 |

### P0 — 코드 쓰기 전에 끝내야 하는 것

세 가지는 iOS와 무관하게 지금 웹에도 영향이 있고, iOS를 시작하면 고치기가 더 어려워진다.

#### P0-1. 실시간 채널이 인증 없이 붙어 있다 — ✅ 2026-09-02 확인·수정 완료

> **결론: (a)였다. 데이터 누출은 없었고, 실시간이 죽어 있었다.**
> 로그아웃 상태의 익명 클라이언트로 `todos`·`todo_notes`를 구독해 두고 다른 창에서
> 할 일을 추가·체크·메모해도 아무 이벤트도 오지 않았다. 같은 클라이언트에 실제 세션
> 토큰을 물리자(`realtime.setAuth`) 곧바로 들어왔다. 즉 Realtime은 RLS를 지키고 있었고,
> 앱이 익명으로 붙어 있어 `is_org_member(org_id)`를 통과하지 못했던 것이다.
>
> **조치**: `lib/supabase-realtime.ts`에 `accessToken` 콜백을 붙였다(하트비트마다 토큰을
> 다시 읽으므로 갱신을 놓칠 여지가 없다). 자세한 이유는 `CLAUDE.md`의 「실시간」 절.
>
> **프로브를 만들 때의 함정**: 익명 채널과 인증 채널을 *같은 클라이언트*에 만들면 안 된다.
> `signInWithPassword()`가 자동으로 `realtime.setAuth()`를 부르고, 그 토큰이 소켓에 붙은
> **모든 채널**에 밀려 들어가 익명 채널까지 재인증된다 — 처음 측정에서 실제로 이것 때문에
> 누출로 잘못 읽었다. 익명 프로브는 `persistSession: false`로 세션을 아예 못 읽게 만든
> 별도 클라이언트에서, 로그인하지 않은 창으로 돌린다.

`lib/supabase-realtime.ts`의 `getRealtimeClient()`는 anon 키만으로 클라이언트를 만들고,
코드베이스 어디에서도 `setAuth()`를 부르지 않는다(`grep -rn setAuth` → 없음).
`useBoardRealtime`의 `todo_notes` 구독에는 `org_id` 필터조차 없다.

둘 중 하나인데, **어느 쪽이든 조치가 필요하다**:

- **(a) Realtime이 RLS를 적용하고 있다면** → anon에게는 `is_org_member()`가 false라 아무 행도
  안 온다. 즉 실시간 동기화가 사실은 죽어 있고, `useOrgBoard`의 `staleTime: 30s` +
  포커스 재조회 안전망이 그걸 가려 왔다는 뜻이다.
- **(b) 적용하지 않고 있다면** → 브라우저 번들에 공개된 anon 키를 가진 누구나
  **모든 조직의 모든 할 일과 메모를 웹소켓으로 실시간 수신**할 수 있다.

**확인 방법 (2분):** 시크릿 창에서 로그아웃 상태로 콘솔에 아래를 붙이고, 다른 창에서 할 일을 하나 추가해 본다.

```js
const c = supabase.createClient(URL, ANON_KEY)
c.channel('probe').on('postgres_changes',
  { event: '*', schema: 'public', table: 'todos' }, p => console.log('LEAK', p)).subscribe()
```

**조치 (양쪽 공통):** 세션 토큰을 실시간 클라이언트에 물린다. 로그인/토큰 갱신 시
`client.realtime.setAuth(session.access_token)`을 부르고, `todo_notes` 구독에도 조직 필터를 건다.
Swift 클라이언트는 처음부터 이걸 지켜야 한다 — 안 그러면 iOS 보드가 조용히 안 움직인다.

#### P0-2. 계정 삭제가 없다 (App Store 심사 차단 사유)

App Store Review Guideline **5.1.1(v)**: 계정을 만들 수 있는 앱은 **앱 안에서 계정을 삭제**할 수
있어야 한다. 링크로 웹에 보내는 것도 안 된다(삭제 시작은 앱 안이어야 한다).
지금 todolight에는 이 경로가 아예 없다.

단순히 `auth.admin.deleteUser()`를 부르면 안 되고, **먼저 정할 게 있다**:

- 방장이 나가면 그 조직은? → (권장) 관리자 → 가입 순 멤버 순으로 소유권 자동 이양,
  혼자뿐이면 조직도 함께 삭제.
- 남긴 할 일·메모·가계부는? → 익명화(`display_name`을 "탈퇴한 사용자"로) vs 삭제.
  **익명화를 권한다** — 조직 가계부 합계가 사람이 나갔다고 바뀌면 그건 장부가 아니다.
- 소프트 삭제 원칙과의 관계 → 계정 삭제는 유일하게 되돌릴 수 없는 동작이다.
  `Button danger` + `BottomSheet` 확인 2단계(`TeamClient`의 `confirmKick` 패턴).

이건 웹에도 지금 넣는 게 맞다. iOS만의 요구가 아니라 원래 있어야 했던 것이다.

#### P0-3. Apple Developer Program 등록 ($99/년)

푸시·위젯·App Group·Keychain Sharing 전부 유료 계정 없이는 실기기 테스트가 안 된다.
등록 승인에 며칠 걸릴 수 있으니 제일 먼저 걸어 둔다.

---

## 2. 핵심 결정: 왜 RLS 직결이 아니라 공유 API인가

가장 쉬워 보이는 길은 `supabase-swift`로 앱이 DB를 직접 읽고 쓰고, RLS가 막게 두는 것이다.
**쓰기에서는 안 된다.** 이유는 지금 코드가 그렇게 만들어져 있지 않기 때문이다.

이 앱의 모든 서버 액션은 `getSupabaseAdmin()`(service_role, RLS 우회)으로 돌고, 권한은
`lib/guards.ts`의 TypeScript 가드가 판정한다. **RLS는 켜져 있지만 실제 집행 경로가 아니다.**
그래서 액션 가드와 RLS 정책 사이에 조용한 간극이 있다:

| 동작 | 액션 가드 | RLS 정책 | 간극 |
|---|---|---|---|
| 할 일 소프트 삭제 | 주인·만든이·관리자만 (`assertCanRemove`) | `todos_update`는 **멤버 전부** 허용 | 🔴 RLS 직결이면 아무나 남의 할 일을 지운다 |
| 메모 수정 | 작성자 본인만 | `todo_notes`에 **UPDATE 정책 자체가 없음** | 🔴 RLS 직결이면 수정이 아예 실패 |
| 초대 수락 | 본인 이메일 확인 후 `org_members` insert | `org_members_insert`는 **관리자만** | 🔴 초대받은 사람이 스스로 가입 불가 |
| 웹훅 URL 조회 | 관리자만 (`fetchOrgWebhook`) | `organizations_select`는 멤버 전부 | 🟡 Discord 웹훅 URL이 일반 멤버에게 노출 |
| Discord 알림 | `after()`로 응답 후 발송 | — | 🔴 클라이언트에서는 불가능 |
| `position` 계산 | 같은 컬럼 최상단 조회 후 −1 | — | 🟡 클라이언트가 하면 규칙이 두 벌 |

RLS를 이 간극만큼 보강하는 길도 있지만, 그러면 **같은 규칙이 TypeScript와 SQL 두 곳에 살게 된다.**
"지우기 권한"을 바꿀 때 두 군데를 고쳐야 하고, 한쪽만 고쳐도 아무 에러가 안 난다.

### 그래서: 읽기는 직결, 쓰기는 API

```
                 ┌─────────────────────────────────────────┐
   iOS 앱 ──읽기──▶│ Supabase PostgREST + Realtime (RLS)     │
      │            └─────────────────────────────────────────┘
      │                             ▲
      └──쓰기──▶ Vercel /api/v1/* ───┘ (service_role + 기존 가드)
                      │
   웹 ──서버 액션──────┘  ← 같은 함수를 부른다
```

- **읽기(SELECT)**: RLS는 SELECT에 대해서는 이미 정확하다(`is_org_member` 기반). 앱이 PostgREST를
  직접 읽으면 왕복이 하나 줄고, Realtime도 같은 커넥션에서 공짜로 얻는다.
- **쓰기**: `app/api/v1/*` route handler가 **기존 서버 액션 함수를 그대로 호출한다.**
  route handler는 3~5줄짜리 어댑터다. 로직은 한 벌로 남는다.
- **웹은 안 바뀐다.** 서버 액션은 RSC·`revalidatePath` 이점이 있어 그대로 두는 게 낫다.
  API는 iOS 전용 입구일 뿐, 웹을 API로 이주시키지 않는다.

### 왜 Supabase Edge Function이 아닌가

Edge Function(Deno)으로 쓰기 API를 만들면 로직을 **다시 써야 한다** — `next/server`의 `after()`,
`next-intl` 기반 `getActionT()`, zod 스키마가 전부 Next 런타임에 묶여 있다. 복붙하는 순간 두 벌이 된다.
Vercel(icn1)과 Supabase(ap-northeast-2)가 둘 다 서울이라 왕복 하나 추가는 실측상 무시 가능하다.

**단, APNs 발송만은 Edge Function이 맞다** — Postgres 트리거에서 바로 부를 수 있어야 하고
(§7), Next 요청 수명주기와 무관해야 하기 때문이다.

---

## 3. API 계약 (`/api/v1`)

### 3-1. 딱 하나 고치면 되는 것: Bearer 토큰 인증

웹 서버 액션은 `@supabase/ssr` 쿠키로 세션을 읽는다. iOS는 쿠키가 없고
`Authorization: Bearer <access_token>`을 보낸다. `app/actions/_base.ts`의 `getAuthUser()`
**한 함수만** 두 경로를 다 보게 만들면, 41개 액션 전부가 그대로 iOS에서도 동작한다.

```ts
// app/actions/_base.ts
export const getAuthUser = cache(async function getAuthUser(): Promise<AuthUser | null> {
  // 1) iOS: Authorization 헤더
  const bearer = (await headers()).get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (bearer) {
    // getClaims는 JWKS로 로컬 검증한다 — getUser(jwt)는 매번 Supabase로 왕복한다
    const { data } = await createSupabaseServerClient().then(c => c.auth.getClaims(bearer));
    const c = data?.claims;
    return c?.sub ? { id: c.sub as string, email: (c.email as string) ?? null } : null;
  }
  // 2) 웹: 기존 쿠키 경로 (그대로)
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  ...
});
```

> ⚠️ `auth.getUser(jwt)`가 아니라 `getClaims(jwt)`를 쓴다. 전자는 요청마다 Supabase Auth로
> 네트워크 왕복이 붙는다 — 위젯 타임라인 갱신처럼 짧게 여러 번 부르는 경로에서 티가 난다.

### 3-2. 라우트 형태

액션 이름을 그대로 쓴다. REST 명사 설계로 다시 짜면 이름이 두 벌이 되고, "이 액션이 어느
엔드포인트지"를 매번 뒤져야 한다.

```
POST /api/v1/todos/create        body: { orgId, title, ownerId?, dueDate?, id? }
POST /api/v1/todos/setStatus     body: { todoId, status }
POST /api/v1/todos/update
POST /api/v1/todos/reorder
POST /api/v1/todos/delete
POST /api/v1/todos/restore
POST /api/v1/todos/addNote
POST /api/v1/todos/updateNote
POST /api/v1/todos/deleteNote
POST /api/v1/todos/handleForMember
POST /api/v1/todos/join | leave
POST /api/v1/orgs/*              (create, invite, respondToInvite, removeMember, ...)
POST /api/v1/events/*
POST /api/v1/ledger/*
POST /api/v1/profile/update
POST /api/v1/devices/register    ← 새로 만드는 것 (§7)
POST /api/v1/account/delete      ← 새로 만드는 것 (P0-2)
```

어댑터는 이렇게 얇다:

```ts
// app/api/v1/todos/create/route.ts
import { createTodo } from '@/app/actions/todos';
export async function POST(req: Request) {
  return Response.json(await createTodo(await req.json()));
}
```

응답은 기존 `ApiResponse<T>` 그대로다 — Swift에서도 판별 유니온으로 디코딩한다.
`success: false`일 때도 HTTP 200이다(이미 웹이 그렇게 동작한다). Swift 쪽에서 이걸 잊고
상태 코드만 보면 에러를 통째로 놓친다. **[§8의 `APIResponse` 디코더](#8-웹에서-못-가져오는-것) 참고.**

### 3-3. 챙길 것

- **`Accept-Language` 헤더** — 액션 에러 문구는 `getActionT()`가 로케일별로 만든다. iOS가
  헤더를 안 보내면 전부 한국어로 나온다. `lib/negotiate-locale.ts`가 이미 헤더를 볼 줄 안다.
- **Rate limit** — 서버 액션은 원래 공개 POST였지만, 문서화된 API가 되면 표적이 된다.
  `/api/v1/*`에 IP+user 기준 상한을 건다.
- **버저닝** — 앱은 App Store 심사 때문에 강제 업데이트가 느리다. `v1` 경로를 절대 깨지 않고,
  바꿔야 하면 `v2`를 새로 판다. 오래된 앱 버전에 대한 최소 지원 정책을 문서에 박아 둔다.
- **`docs/api-v1.md`** — 엔드포인트별 요청/응답 타입 표. Swift 모델의 근거가 여기 하나여야 한다.

---

## 4. 인증

`supabase-swift`(Auth + PostgREST + Realtime + Storage)를 쓴다.

| 항목 | 결정 |
|---|---|
| 로그인 수단 | **Sign in with Apple을 1순위로 추가**, 이메일/비번은 유지 |
| 세션 저장 | Keychain (**공유 access group** — 위젯이 읽어야 한다) |
| Keychain 접근성 | `kSecAttrAccessibleAfterFirstUnlock` (§6에서 이게 왜 중요한지) |
| 토큰 갱신 | `supabase-swift`가 자동. 갱신될 때마다 `realtime.setAuth()` 재호출 필수 |
| 비밀번호 재설정 | 기존 웹 `/reset` 흐름 재사용 (`ASWebAuthenticationSession`) |

**Sign in with Apple을 권하는 이유** — 지금은 이메일/비번뿐이라 가이드라인 4.8이 강제하지는
않는다(제3자 소셜 로그인이 없으면 의무가 아니다). 하지만 iOS에서 비밀번호를 새로 만들게 하는 건
가입 이탈이 가장 큰 지점이고, Supabase가 `signInWithIdToken`으로 네이티브 Apple 로그인을
지원한다. 나중에 Google을 추가하면 그때는 Apple 로그인이 **의무**가 되므로, 미리 넣어 두면
그 시점에 할 일이 없다.

> ⚠️ Apple 로그인은 이메일 가리기(Private Relay)를 허용한다 → `@privaterelay.appleid.com`
> 주소가 들어온다. **초대는 이메일로 매칭된다**(`org_invites.email`). 가려진 주소로 가입한
> 사람은 초대장을 못 받는다. 초대 코드/링크 방식을 병행 지원할지 지금 정해 둘 것.

---

## 5. iOS 앱 구조

```
ios/
├── TodoLight.xcodeproj
├── TodoLight/                    앱 타깃 (SwiftUI, @main)
│   ├── Board/  Calendar/  Ledger/  Team/  Settings/
│   └── AppIntents/               위젯 상호작용용 인텐트
├── TodoLightWidgets/             위젯 확장 (잠금화면·홈화면·StandBy·Control)
├── TodoLightKit/                 ★ 로컬 SPM 패키지 — 앱과 위젯이 공유
│   ├── Models/                   Todo, Profile, Organization, ... (types/db.ts 대응)
│   ├── API/                      APIClient, APIResponse, 엔드포인트
│   ├── Store/                    SharedStore (App Group), SharedKeychain
│   ├── Theme/                    Theme.swift (생성물, §8)
│   └── Logic/                    정렬·배지·조사 규칙 (웹 결정의 Swift판)
└── Tools/
    ├── generate-theme.ts         globals.css → Theme+Tokens.swift
    └── generate-strings.ts       messages/*.json → Localizable.xcstrings
```

**`TodoLightKit`을 로컬 SPM 패키지로 두는 게 핵심이다.** 위젯 확장은 별도 프로세스라 앱의
코드를 자동으로 못 쓴다. 파일을 두 타깃에 동시 소속(target membership)시키는 흔한 방법은
빌드 시간과 "이 파일 어느 타깃이었지" 실수를 같이 늘린다. 패키지로 끊어 두면 의존이 단방향이고,
`import TodoLightKit` 한 줄로 끝난다.

### 기술 선택

| 항목 | 선택 | 이유 |
|---|---|---|
| 최소 지원 | **iOS 18** | 상호작용 위젯(17)·`ControlWidget`(18)이 둘 다 필요. iOS 26이 현행이라 18은 충분히 넓다 |
| UI | SwiftUI | 위젯이 SwiftUI 전용이라 UI 코드가 한 언어로 통일된다 |
| 상태 | `@Observable` + async/await | TanStack Query 대체품을 찾지 말고 얇게 직접 만든다 |
| 로컬 캐시 | **SwiftData** | 위젯이 앱 없이도 읽을 스냅샷이 필요하다(§6). 앱 시작 시 즉시 그릴 데이터도 |
| 실시간 | `supabase-swift` Realtime v2 | 웹 `useBoardRealtime`의 병합 규칙을 그대로 이식 |
| 의존성 | SPM만 | CocoaPods 넣지 말 것 |

### 오프라인 — 웹에 없던 것을 처음으로 만든다

네이티브에서는 "지하철에서 열었더니 빈 화면"이 용납되지 않는다.

- **읽기**: SwiftData에 마지막 스냅샷을 늘 유지. 앱은 캐시를 먼저 그리고 네트워크 결과로 덮는다.
- **쓰기**: 실패한 뮤테이션을 큐에 쌓고 온라인 복귀 시 재시도.
  - **`createTodo`가 클라이언트 id를 보낸다는 설계가 여기서 값을 한다** — 재시도가 중복 행을
    만들지 않는다. 이 규칙을 iOS에서도 반드시 지킬 것.
  - `setTodoStatus` 같은 멱등한 것만 자동 재시도. `addTodoNote`는 중복되면 곤란하니
    id를 클라이언트가 정하도록 API를 확장하거나(권장), 재시도 대상에서 뺀다.
- **충돌**: 서버가 최종 권한(last-write-wins). 웹과 같다. 편집 중 충돌 규칙(`editBase`)도 그대로.

---

## 6. 잠금화면

여기가 이 프로젝트의 진짜 목표다. iOS가 잠금화면에 무언가를 띄우는 수단은 **네 가지**이고,
서로 용도가 다르다. 하나를 다른 것으로 대신하려 하면 반드시 심사나 배터리에서 막힌다.

| 수단 | 무엇 | 갱신 | todolight에서 |
|---|---|---|---|
| **잠금화면 위젯** (WidgetKit accessory) | 시계 밑 작은 칸 | 타임라인 (하루 수십 회) | ✅ **본체** |
| **Live Activity** (ActivityKit) | 잠금화면 하단 큰 카드 + 다이내믹 아일랜드 | APNs 푸시 (즉시) | ⚠️ 조건부 (심사 위험) |
| **알림** (APNs) | 배너·알림센터 | 즉시 | ✅ 별도로 필요 |
| **ControlWidget** (iOS 18) | 잠금화면 하단 버튼(손전등 자리) | — | ✅ "빠른 추가" |

### 6-1. 잠금화면 위젯 — 무엇을 띄우나

세 가지 크기(family)를 다 지원해야 사용자가 자기 잠금화면에 맞춰 고른다.

```
accessoryInline      시계 위 한 줄       "오늘 3건 · 지난 마감 1"
accessoryCircular    작은 원             ◔ 3   (미완료 개수 + 진행 링)
accessoryRectangular 시계 밑 직사각형    오늘 마감 3건
                                        · 세탁소 맡기기
                                        · 회의록 정리          +1
```

**설정 가능해야 한다** (`AppIntentConfiguration`): 조직이 여럿이고 "내 것만"인지 "팀 전체"인지가
사람마다 다르다. 위젯 설정으로 `조직` × `범위(내 것 / 팀 전체 / 특정 팀원)`을 고르게 한다.

### 🔴 함정 1: 잠금화면 위젯은 색을 잃는다

잠금화면 위젯은 `WidgetRenderingMode.vibrant`로 그려진다 — **모든 색이 배경에서 뽑아낸
단색 반투명으로 변환된다.** 아바타 색 12종도, `lib/event-colors.ts`의 일정 색도, 상태색도
전부 같은 회백색이 된다.

`CLAUDE.md`의 "아바타는 사람을 구분하는 배경" 원칙이 잠금화면에서는 통째로 무너진다는 뜻이다.

**대응**: 잠금화면에서는 **색이 아니라 형태와 글자로 구분한다.**
- 사람 → 이름 첫 글자 (색 없이)
- 상태 → SF Symbol (`circle` / `circle.righthalf.filled` / `checkmark.circle.fill`)
- 지난 마감 → `exclamationmark` 기호. 빨강이 안 통한다
- `@Environment(\.widgetRenderingMode)`를 읽어 홈화면(fullColor)과 잠금화면(vibrant)에서
  다른 뷰를 그린다. 한 뷰로 둘 다 하려 들면 홈화면이 밋밋해지거나 잠금화면이 뭉개진다

### 🔴 함정 2: 타임라인 갱신은 실시간이 아니다

WidgetKit은 자주 보는 위젯에 대해 **하루 대략 40~70회** 정도의 갱신 예산을 준다(Apple이
숫자를 보장하지 않는다). 즉 위젯 혼자서는 "팀원이 방금 대신 처리해 줌"을 즉시 반영할 수 없다.

**세 경로를 다 깔아야 한다:**

```
① 앱이 살아 있을 때 (제일 흔함)
   앱이 데이터를 받을 때마다 App Group에 스냅샷(JSON) 저장
   → WidgetCenter.shared.reloadTimelines(ofKind: "TodoLightLockScreen")

② 앱이 죽어 있을 때 — 위젯이 직접 읽는다
   TimelineProvider가 공유 Keychain에서 세션 토큰을 꺼내 API/PostgREST 호출
   → 실패하면 App Group 스냅샷으로 떨어진다 (절대 빈 위젯을 그리지 않는다)

③ 즉시성이 필요할 때 — 무음 푸시
   서버가 content-available: 1 푸시 → 앱이 잠깐 깨어나 스냅샷 갱신 + reload
   ⚠️ 아껴 쓸 것. 남발하면 iOS가 전달 빈도를 줄여 버린다.
      "내 할 일이 대신 처리됨", "내 목록에 할 일이 꽂힘" 정도로 한정
```

**②를 위해 Keychain 접근성이 `kSecAttrAccessibleAfterFirstUnlock`이어야 한다.**
기본값인 `WhenUnlocked`면 잠금 상태에서 위젯이 토큰을 못 읽어 갱신이 통째로 실패한다.
`supabase-swift`의 기본 저장소 대신 커스텀 `AuthLocalStorage`를 구현해 access group과
접근성을 직접 지정한다. **앱과 위젯 확장 양쪽에 Keychain Sharing capability를 같은 그룹으로 켠다.**

### 6-2. 잠금화면에서 체크하기 (상호작용 위젯)

iOS 17+의 `Button(intent:)` / `Toggle(intent:)`로 위젯 안에서 바로 완료 처리할 수 있다.
`accessoryRectangular`에서 할 일 한 줄 옆 체크박스가 가장 자연스럽다.

```swift
struct ToggleTodoIntent: AppIntent {
    static let title: LocalizedStringResource = "할 일 완료"
    @Parameter var todoId: String

    func perform() async throws -> some IntentResult {
        // 웹 useTodoMutations의 규칙을 그대로 옮긴다
        SharedStore.optimisticallyToggle(todoId)      // 1. 먼저 스냅샷을 고친다
        do { try await API.setTodoStatus(todoId, .done) }   // 2. 서버
        catch { SharedStore.rollback(todoId); throw error } // 3. 실패하면 되돌린다
        WidgetCenter.shared.reloadTimelines(ofKind: kind)
        return .result()
    }
}
```

**함정**: 인텐트는 위젯 확장 프로세스에서 실행된다. 여기서도 세션 토큰이 필요하고, 위와 같은
Keychain 접근성 문제를 그대로 받는다. 그리고 잠금 상태에서 실행될 수 있으니
**민감한 동작(삭제·계정)은 위젯에 두지 않는다.** 완료 토글 정도만.

**햅틱**: 위젯 인텐트에서는 햅틱을 못 준다(`lib/haptics.ts`의 웹 구현과 마찬가지로 제약이 있다).
시각 피드백은 `reloadTimelines` 후 뷰가 바뀌는 것으로만 준다 — 그래서 낙관적 반영이 필수다.

### 6-3. Live Activity — 쓸 수는 있는데 조심할 것

```
잠금화면 카드로 크게 뜨고, APNs로 즉시 갱신되고, 다이내믹 아일랜드에도 나온다.
iOS 17.2+의 push-to-start 토큰으로 서버가 원격으로 시작시킬 수도 있다.
```

**🔴 심사 위험**: App Store 가이드라인상 Live Activity는 **시작과 끝이 정해진, 시간에 민감한
진행 중인 이벤트**를 위한 것이다 — 배달 추적, 경기 스코어, 탑승. "내 할 일 목록"을 상시
띄우는 용도는 **위젯의 대체품으로 판단되어 거부될 수 있다.** 실제로 그런 리젝 사례가 흔하다.

**제약**:
- 활성 갱신 최대 8시간, 이후 시스템이 종료. 잠금화면에는 최대 12시간까지 남았다가 사라진다.
- 즉 "항상 떠 있는 할 일 목록"은 기술적으로도 불가능하다.

**그래서 쓴다면 이렇게** — 시작과 끝이 있는 것에만:
- 사용자가 직접 시작하는 **"오늘 집중"** — 오늘 마감 N건을 담고 자정에 자동 종료.
  진행률이 실시간으로 줄어드는 게 보인다. 시작/끝이 명확하다.
- **"대신 처리 요청 중"** — 팀원에게 부탁한 할 일이 처리될 때까지. 처리되면 종료.

**판단**: M0~M3에서는 **넣지 않는다.** 위젯을 먼저 내고, 사용자가 실제로 원하는지 본 뒤
M5에서 위 두 시나리오 중 하나로 좁혀 시도한다. 거부되면 위젯만으로도 목표는 달성된 상태다.

### 6-4. ControlWidget (iOS 18) — 이게 의외로 답에 가깝다

iOS 18부터 잠금화면 하단 두 버튼(손전등·카메라 자리)과 제어 센터, 액션 버튼에
서드파티 컨트롤을 놓을 수 있다.

**"할 일 빠르게 추가"를 여기 둔다.** 잠금 상태에서 버튼 하나로 앱의 추가 화면이 바로 열린다.
"생각났을 때 바로 적는다"가 투두 앱의 핵심 동작인데, 지금 웹앱에서는 잠금 해제 → 홈 →
앱 아이콘 → 로딩 → 입력까지 다섯 단계다.

```swift
struct QuickAddControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "QuickAdd") {
            ControlWidgetButton(action: OpenQuickAddIntent()) {
                Label("할 일 추가", systemImage: "plus.circle")
            }
        }
    }
}
```

### 6-5. 곁다리로 따라오는 것 (거의 공짜)

- **홈화면 위젯** (`systemSmall/Medium/Large`) — 같은 데이터, 색이 살아 있는 버전. 위젯 코드를
  이미 썼으므로 뷰만 하나 더.
- **StandBy** (충전 중 가로) — `systemSmall`이 자동으로 쓰인다. 대응 코드가 거의 없다.
- **잠금화면 위젯은 iPad에도 나온다** (iPadOS 17+).

---

## 7. 푸시(APNs) 파이프라인

Discord 알림이 이미 있다. iOS 푸시는 **같은 이벤트에 채널을 하나 더 붙이는 것**이지 새 기능이 아니다.

### 7-1. 새 테이블

```sql
-- supabase/migrations/2026xxxx_device_tokens.sql
create table public.device_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  token       text not null,
  environment text not null check (environment in ('sandbox', 'production')),
  bundle_id   text not null,
  -- Live Activity를 원격으로 시작시키는 토큰 (iOS 17.2+). 없으면 null
  push_to_start_token text,
  locale      text not null default 'ko',
  updated_at  timestamptz not null default now(),
  unique (user_id, token)
);

alter table public.device_tokens enable row level security;
create policy device_tokens_own on public.device_tokens
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

푸시 수신 여부 설정은 `profiles`에 컬럼으로 붙인다(`show_done`·`show_ledger`와 같은 자리).
**기기를 옮겨도 같아야 하는 취향이므로 계정에 붙인다** — `CLAUDE.md`의 기존 판단과 동일.

### 7-2. 발송 경로

```
todos UPDATE (handled_by가 채워짐)
   │
   ├─ Postgres 트리거 ──▶ pg_net (비동기 HTTP) ──▶ Edge Function `push`
   │                                                    │
   │                                                    ├─ device_tokens 조회
   │                                                    ├─ .p8 키로 ES256 JWT 서명
   │                                                    └─ POST api.push.apple.com
   └─ (기존 Discord 경로는 그대로 서버 액션의 after()에서)
```

**`pg_net`을 쓰는 이유가 곧 기존 원칙이다** — `CLAUDE.md`의 "알림 실패가 본래 작업을 되돌리면
안 된다". `pg_net`은 비동기 큐라 HTTP 실패가 트랜잭션을 되돌리지 않는다. 트리거 안에서 동기
HTTP를 하면 할 일 체크 하나가 APNs 지연에 묶인다.

**APNs 발송만 Edge Function인 이유**: 트리거에서 부를 수 있어야 하고(Vercel도 가능하지만 서울 →
Vercel → APNs보다 Supabase 내부에서 나가는 게 짧다), Next 요청 수명주기와 무관해야 한다.

### 7-3. 어떤 이벤트에 보내나

기존 Discord 알림 지점과 맞춘다 + iOS에서만 의미 있는 것 둘:

| 이벤트 | Discord | APNs | 수신자 |
|---|:--:|:--:|---|
| 내 목록에 할 일이 꽂힘 (`createTodo`, ownerId ≠ 나) | ✅ | ✅ | 할 일 주인 |
| 내 할 일을 누가 대신 처리 (`handleForMember`) | ✅ | ✅ | 할 일 주인 |
| 초대 받음 (`inviteMember`) | ❌ | ✅ | 초대받은 사람 |
| 오늘 마감 요약 (아침 8시 KST) | ❌ | ✅ | 마감 있는 사람 (pg_cron) |
| 위젯 갱신용 무음 푸시 | ❌ | ✅(silent) | 조직 멤버 |

**보내지 않을 것**: 남의 할 일이 생기거나 완료될 때마다. 팀이 5명이면 하루에 수십 번이 되고,
그 시점부터 사용자는 알림을 통째로 끈다. Discord는 채널이라 괜찮지만 푸시는 다르다.

### 7-4. 챙길 것

- **`.p8` 키를 Vercel/Supabase 시크릿에 넣는다.** 레포에 절대 커밋 금지 —
  `.gitignore`에 `*.p8` 추가.
- **sandbox / production 분리.** 개발 빌드 토큰을 production 엔드포인트로 보내면 `BadDeviceToken`.
- **410 Unregistered 처리** — 앱을 지운 기기 토큰을 안 지우면 `device_tokens`가 쓰레기로 찬다.
- **알림 문구도 해요체** (`CLAUDE.md` 원칙). 로케일은 `device_tokens.locale`로.

---

## 8. 웹에서 못 가져오는 것 (그리고 자동 변환으로 메울 것)

### 테마 — 생성으로 동기화한다

테마는 6종이고 **유료화 계획이 있다**(`THEMES`의 `free: false`). 손으로 옮기면 테마를
추가할 때 두 곳을 고쳐야 하고, 반드시 한쪽만 고친 채로 출시된다.

`ios/Tools/generate-theme.ts`가 `app/globals.css`의 `:root[data-theme=...]` 블록과
`lib/themes.ts`를 읽어 `TodoLightKit/Theme/Theme+Tokens.swift`를 **생성**한다.
CI에서 "생성물이 최신인지" 검사한다(생성 후 `git diff --exit-code`).

```swift
// 생성물 예시 — 손으로 고치지 말 것
public extension Theme {
    static let nord = Theme(
        canvas: #colorLiteral(...), surface: ..., ink: ..., accent: ...
    )
}
```

앱에서는 `@Environment(\.theme)`로 주입한다. **뷰에 색을 하드코딩하지 않는다** — 웹의 원칙 그대로.

### i18n — String Catalog로 변환

`messages/{ko,en}.json` → `Localizable.xcstrings`. `generate-strings.ts`로 변환하고,
**API가 돌려주는 에러 문구는 번역하지 않고 그대로 띄운다**(서버가 이미 로케일에 맞춰 만든다).

### `ApiResponse` 디코딩

서버가 실패해도 HTTP 200 + `{success:false, error}`를 준다. 이걸 Swift에서 잊으면 에러가
전부 통과한다.

```swift
public enum APIResponse<T: Decodable>: Decodable {
    case success(T)
    case failure(String)

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        if try c.decode(Bool.self, forKey: .success) {
            self = .success(try c.decode(T.self, forKey: .data))
        } else {
            self = .failure(try c.decode(String.self, forKey: .error))
        }
    }
    private enum CodingKeys: String, CodingKey { case success, data, error }
}
```

### 옮겨야 하는 "결정" 목록 (코드가 아니라 규칙)

`TodoLightKit/Logic/`에 모으고, **각 규칙마다 `CLAUDE.md`의 해당 절을 주석으로 인용한다.**
그래야 나중에 "왜 이렇게 했지"가 다시 발생하지 않는다.

- 컬럼 정렬: 지난 마감 → 오늘 → 나중 → 마감 없음, 같은 마감이면 `position` 오름차순,
  완료는 맨 아래 최근 순
- 배지: `created_by ≠ owner_id` → "OOO이 부탁" / `handled_by ≠ owner_id` → "대신 처리"
- `subjectParticle` — 받침 있으면 "이", 없으면 "가", 한글이 아니면 "가"
- `position` = 최상단 − 1 (앞에 끼워 넣기)
- 소프트 삭제 + 실행취소(확인 창 없음) / 되돌릴 수 없는 것만 2단 확인
- 낙관적 반영 + 스냅샷 롤백, 편집 중 `editBase` 비교
- 날짜는 KST 기준 (`todayKST`, `formatRelativeDay`)
- 카드 펼침은 한 번에 하나

---

## 9. 레포와 폴더 구조

### 결론: 같은 repo, `ios/` 폴더. 새 repo를 만들지 않는다.

**왜 한 repo인가**

1. **DB 마이그레이션이 진짜 공유 자산이다.** `supabase/migrations/`를 고치면 웹과 iOS가 동시에
   영향받는다. repo가 둘이면 "마이그레이션 배포 → iOS 릴리스" 순서를 사람이 기억해야 하고,
   한 번 어긋나면 심사 대기 중인 앱이 깨진 스키마를 본다.
2. **API 계약이 코드로 이어져 있다.** `/api/v1`이 웹 repo에 있는데 iOS가 다른 repo면,
   엔드포인트를 바꾸는 PR이 두 개로 쪼개지고 리뷰가 계약 전체를 못 본다.
3. **`CLAUDE.md`가 두 클라이언트의 공통 헌법이다.** 나누면 반드시 한쪽만 갱신된다.
4. **릴리스 추적** — App Store 빌드 태그와 웹 배포가 같은 히스토리에 있으면
   "이 심사 중인 빌드는 어느 API 커밋을 보는가"가 `git log` 하나로 답이 나온다.

**Xcode와 JS가 한 repo에 있어도 충돌하지 않는다.** Vercel은 root directory 설정이 그대로라
`ios/`를 무시하고, `.gitignore`에 Xcode 항목만 추가하면 끝이다.

**나눠야 할 때** — 지금은 아니지만 이때는 다시 생각한다:
- iOS를 다른 사람/팀이 맡게 되고 웹 코드 접근을 막아야 할 때
- iOS가 별도 제품(다른 백엔드)이 될 때
- repo가 커져 `git clone`이 실질적으로 아플 때 (지금은 아니다)

### 폴더 재배치(`apps/web`)는 지금 하지 않는다

`apps/web` + `apps/ios` 모노레포가 "제대로 된" 모양처럼 보이지만, 지금 옮기면:
- Vercel의 Root Directory 재설정, `tsconfig.json`의 `@/*` paths, `.codegraph/` 인덱스,
  `eslint.config.mjs`, `next.config.mjs`가 전부 영향받는다
- 얻는 건 정돈된 느낌뿐이다. **실제로 공유되는 코드 패키지가 아직 없다.**

`packages/shared`에 둘 진짜 공유물(생성된 타입 등)이 생기는 시점에 하면 되고, 그때
`ios/` → `apps/ios`는 폴더 이동 한 번이다.

### 지금 추가할 것

```
todolight/
├── app/ components/ hooks/ lib/       (그대로)
├── app/api/v1/                        ← 새로 (§3)
├── supabase/migrations/               (공유 — 변경 시 양쪽 영향)
├── docs/
│   ├── ios-app-plan.md                ← 이 문서
│   ├── ios-release.md                 ← 출시 절차 (Xcode → App Store)
│   └── api-v1.md                      ← 엔드포인트 계약서 (M1에서 작성)
└── ios/                               ← 새로
```

`.gitignore`에 추가:

```gitignore
# Xcode
ios/**/xcuserdata/
ios/**/*.xcworkspace/xcuserdata/
ios/**/DerivedData/
ios/**/.swiftpm/
*.p8
*.p12
*.mobileprovision
```

`CLAUDE.md`에는 "iOS 계획은 `docs/ios-app-plan.md`" 한 줄만 추가한다 — 지금 49KB인 문서를
더 불리지 말 것.

---

## 10. 로드맵

각 단계는 **끝났는지 판정할 수 있는 기준**을 갖는다. "대충 되는 것 같다"로 다음으로 넘어가면
잠금화면 단계에서 인증·데이터 공유가 동시에 터진다.

### M0 — 기반 (코드 없이 끝내는 것) · 1주

- [ ] Apple Developer Program 등록 ($99/년, 승인 며칠)
- [x] **P0-1 실시간 인증 검증 및 수정** — [§1](#p0--코드-쓰기-전에-끝내야-하는-것) · 2026-09-02 완료
- [ ] **P0-2 계정 삭제** 설계 + 웹에 먼저 구현 (조직 소유권 이양 규칙 포함)
- [ ] Bundle ID, App Group(`group.com.<you>.todolight`), Keychain group 확정
- [ ] `ios/` 스캐폴딩, `.gitignore` 추가

✅ **완료 기준**: 웹에서 계정을 지울 수 있고, 실시간 채널이 인증된 상태로 붙는다.

### M1 — API 레이어 · 1주

- [ ] `getAuthUser()`에 Bearer 경로 추가 (§3-1) — **이거 하나가 41개 액션을 다 연다**
- [ ] `/api/v1/*` route handler 생성 (스크립트로 찍어도 된다, 어댑터가 3줄이다)
- [ ] `Accept-Language` 전달, rate limit
- [ ] `docs/api-v1.md` 작성
- [ ] curl로 전 엔드포인트 스모크 테스트 (vitest에 넣는다)

✅ **완료 기준**: `curl -H "Authorization: Bearer $TOKEN"`으로 할 일을 만들고 지우고 되살릴 수 있다.
웹은 아무것도 안 바뀐 채 그대로 동작한다.

### M2 — 앱 껍데기 · 2~3주

- [ ] `supabase-swift` 붙이기, 커스텀 `AuthLocalStorage`(공유 Keychain, AfterFirstUnlock)
- [ ] Sign in with Apple + 이메일 로그인
- [ ] `TodoLightKit` 모델 + `APIClient` + `APIResponse`
- [ ] 보드 화면 (가로 캐러셀, 카드, 체크, 추가) — 낙관적 반영 포함
- [ ] Realtime 구독 + 캐시 병합 (`useBoardRealtime` 규칙 이식)
- [ ] 테마 생성기 + 6종 적용

✅ **완료 기준**: 실기기에서 웹과 동시에 열어 두고, 한쪽에서 체크하면 반대쪽이 1초 안에 따라온다.

### M3 — 나머지 화면 + 오프라인 · 2주

- [ ] 달력, 가계부, 팀, 내 설정
- [ ] `DuePicker` Swift판
- [ ] SwiftData 캐시 + 오프라인 큐
- [ ] 계정 삭제 화면 (심사 필수)
- [ ] Privacy Manifest (`PrivacyInfo.xcprivacy`) — 2024년 5월부터 필수

✅ **완료 기준**: 비행기 모드로 앱을 열면 마지막 상태가 보이고, 체크한 게 온라인 복귀 후 반영된다.

### M4 — 잠금화면 🎯 · 2주

- [ ] App Group 스냅샷 저장소(`SharedStore`)
- [ ] 위젯 확장 + accessory 3종 (`vibrant` 대응 뷰 별도)
- [ ] `AppIntentConfiguration` (조직 · 범위 선택)
- [ ] `ToggleTodoIntent` — 잠금화면에서 체크
- [ ] 홈화면 위젯 + StandBy (거의 공짜)
- [ ] `QuickAddControl` (iOS 18 잠금화면 버튼)
- [ ] APNs 파이프라인 (`device_tokens` + Edge Function + 트리거)
- [ ] 무음 푸시로 위젯 갱신

✅ **완료 기준**: 기기를 잠근 채로 잠금화면에서 할 일을 체크하면 웹 보드가 따라 움직이고,
팀원이 웹에서 내 할 일을 대신 처리하면 30초 안에 잠금화면 위젯 숫자가 줄어든다.

### M5 — 출시 · 2주

절차 전체는 **[`docs/ios-release.md`](./ios-release.md)** 에 있다 — Xcode의 Archive부터
심사 제출까지, 어디서 무엇을 누르는지까지 적어 뒀다. 여기서는 항목만 센다.

**M5에 오기 전에 이미 끝나 있어야 하는 것** (여기서 시작하면 늦는다)

- [ ] 개인정보 처리방침 페이지 (`NEXT_PUBLIC_SITE_URL/privacy`) — 없으면 **제출 자체가 안 된다**
- [ ] 앱 안의 계정 삭제 경로 (M3) — Guideline 5.1.1(v), 링크로 웹에 보내는 것은 인정되지 않는다
- [ ] `PrivacyInfo.xcprivacy` (M3) — App Group `UserDefaults` 사유 코드 `CA92.1`
- [ ] 유료 테마를 어떻게 할지 결정 (§12-7) — iOS는 IAP 강제이고 웹 결제 유도는 리젝 사유다.
      **첫 출시에서는 전부 무료로 두는 쪽을 권한다**

**M5에서 하는 것**

- [ ] Bundle ID · App Group · APNs 키(`.p8`) 등록, 위젯 타겟에도 App Group 확인
- [ ] App Store Connect 앱 등록 (이름 30자, 스토어 전역 고유)
- [ ] Archive → 업로드 (Build 번호는 업로드마다 올린다)
- [ ] TestFlight 내부 테스트 — M2·M4의 완료 기준을 여기서 실기기로 재확인
- [ ] 스크린샷(6.9" iPhone) · App Privacy 설문 · 연령 등급
- [ ] **데모 계정 준비** — 조직·팀원·할 일이 들어 있어야 한다. 빈 계정은 Guideline 2.1 리젝 1위
- [ ] `/api/v1`이 프로덕션에서 동작하는지 확인하고 제출 시점 커밋에 태그
- [ ] 심사 제출 (첫 심사는 리젝을 기본값으로 잡고 일정 잡기)
- [ ] (선택) Live Activity — 위 시나리오 중 하나로 좁혀서

✅ **완료 기준**: App Store에서 받은 앱이 프로덕션 API를 보고 동작하고, 심사에 낸 빌드가
어느 커밋을 보는지 `git log`로 답할 수 있다.

---

## 11. 리스크

| 리스크 | 확률 | 영향 | 대응 |
|---|:--:|:--:|---|
| ~~실시간 데이터 노출 (P0-1 (b)안)~~ | — | — | **해소.** (a)로 판명, 2026-09-02 수정 |
| 계정 삭제 없어 심사 거부 | **확실** | 🔴 출시 불가 | M0에서 설계, M3에서 구현 |
| 잠금화면 위젯의 색 손실로 UX가 기대와 다름 | 높 | 🟡 | 초기에 실기기 확인. 형태·글자 기반 설계 |
| 위젯 갱신 예산 부족으로 "느린 위젯"처럼 보임 | 중 | 🟡 | 3경로 병행(§6-1). 사용자에게 실시간을 약속하지 않는다 |
| Live Activity 심사 거부 | 높 | 🟢 낮음 | M5 선택 항목. 없어도 목표 달성 |
| Apple 로그인 이메일 가리기 ↔ 이메일 초대 충돌 | 중 | 🟡 | 초대 링크/코드 방식 병행 (M2에서 결정) |
| Swift와 웹의 규칙이 서서히 갈라짐 | 높 | 🟡 | `TodoLightKit/Logic/`에 몰고 `CLAUDE.md` 절을 주석 인용 |
| 테마 추가 시 한쪽만 갱신 | 중 | 🟡 | 생성 스크립트 + CI에서 `git diff --exit-code` |

---

## 12. 열린 질문 (결정하고 이 문서에 답을 적을 것)

1. **계정 삭제 시 조직 소유권** — 자동 이양인가, 삭제 전에 사용자가 직접 지정하게 할 것인가?
2. **남긴 데이터** — 익명화(권장)인가 삭제인가? 가계부 합계가 바뀌어도 되는가?
3. **초대 방식** — Apple 이메일 가리기 때문에 초대 코드/링크를 병행할 것인가?
4. **위젯 기본 범위** — 처음 추가했을 때 "내 것만"인가 "팀 전체"인가?
5. **푸시 기본값** — 옵트인인가 옵트아웃인가? (`profiles`에 어떤 컬럼을 둘지)
6. **웹 PWA의 운명** — iOS 앱이 나오면 iOS 사파리에서 "앱 받기"를 안내할 것인가?
7. **유료 테마** — iOS에서는 In-App Purchase가 강제된다(수수료 15~30%). 웹 결제와 가격을
   맞출 것인가, iOS 가격을 따로 둘 것인가? `THEMES`의 `free: false`를 실제로 켜기 전에 결정.
