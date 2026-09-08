# /api/v1 — 네이티브 클라이언트용 HTTP 계층

> **Swift 모델의 근거는 이 문서 하나여야 한다.** 여기와 코드가 어긋나면 코드가 맞고 이 문서가
> 틀린 것이니 곧바로 고칠 것. 엔드포인트를 추가하면 표에 줄을 더한다.
>
> 작성 기준: 2026-09-08 · 커밋 `41e0026` 이후

이 계층은 **백엔드가 아니다.** 로직은 전부 `app/actions/*`의 서버 액션에 있고 웹이 매일 그걸
쓴다. 여기 있는 파일들은 JSON을 풀어 액션에 넘기고 결과를 그대로 돌려주는 세 줄짜리
어댑터다(`lib/api-v1.ts`의 `apiRoute`). **어댑터가 두꺼워지기 시작하면 웹과 앱의 규칙이
갈라지기 시작한 것이다** — 그때는 어댑터가 아니라 액션을 고친다.

---

## 1. 계약

### 요청

```http
POST /api/v1/<domain>/<action>
Authorization: Bearer <supabase access_token>
Accept-Language: ko            // 또는 en. 에러 문구의 언어를 정한다
Content-Type: application/json

{ ...본문... }
```

- **전부 POST다.** 조회도 POST다(`orgs/list`, `profile/me`처럼 본문이 없으면 `{}`를 보낸다).
  `/api/v1` 전체가 한 모양이면 Swift 클라이언트가 메서드 분기 없이 함수 하나로 끝난다.
- **토큰은 `supabase-swift`가 관리한다.** 로그인·갱신은 앱이 Supabase Auth와 직접 하고,
  거기서 나온 `session.accessToken`을 여기에 싣는다. 이 계층은 토큰을 발급하지 않는다.
- **`Accept-Language`를 반드시 보낼 것.** 안 보내면 서버가 한국어로 답한다
  (`lib/negotiate-locale.ts`). 액션이 던지는 에러 문구가 그대로 사용자에게 보이므로
  이 헤더 하나가 앱 전체의 에러 언어를 정한다.

### 응답

```ts
type ApiResponse<T> = { success: true; data: T } | { success: false; error: string };
```

**업무 오류도 HTTP 200이다.** "이 조직의 멤버가 아니에요", "제목을 입력해 주세요" 같은 것은
전부 `200 + {success:false, error}`로 온다 — 웹이 이미 그렇게 동작하고, 상태 코드로 갈래를
하나 더 만들면 두 클라이언트가 다른 규칙을 갖게 된다.

> ⚠️ **Swift 디코더가 상태 코드만 보고 넘어가면 에러를 통째로 놓친다.** 반드시 판별
> 유니온으로 읽을 것. 200을 성공으로 단정하는 코드는 이 API에서 반드시 틀린다.

상태 코드가 갈리는 경우는 셋뿐이다:

| 코드 | 언제 | 앱이 할 일 |
|---|---|---|
| `401` | 토큰이 없거나·위조·만료 | 토큰 갱신 후 재시도. 그래도 401이면 로그아웃 |
| `429` | 분당 120회 초과 | `Retry-After`(초)만큼 쉬었다 재시도 |
| `400` | 본문이 JSON이 아님 | **클라이언트 버그다.** 재시도하지 말 것 |

`401`은 인증 확인이 액션에 닿기 전에 어댑터에서 먼저 난다(`getAuthUser()`). 액션이 던지는
문구를 문자열로 맞춰 보면 로케일마다 깨지기 때문이다.

### 제한

분당 **120회 / 계정**. 고정 창이고 `Retry-After: 60`이 함께 온다.
사람이 손으로는 못 넘는 값이라, 걸린다면 재시도 루프를 의심할 것.
자세한 이유는 `supabase/migrations/20260908130018_api_rate_limit.sql`.

### 버저닝

**`v1` 경로를 깨지 않는다.** 웹은 배포하면 모두가 즉시 새 버전이지만 앱은 심사 + 사용자의
업데이트를 거쳐야 해서 구버전이 몇 달씩 살아 있다. 응답에 필드를 **더하는 것**은 안전하고
(Swift 디코더가 모르는 키를 무시하므로), 이름을 바꾸거나 빼는 것은 `v2`를 새로 파야 한다.

---

## 2. 엔드포인트

`T`는 `types/db.ts`의 타입이다. 본문이 `{}`인 것은 인증만으로 답이 정해지는 조회다.

### todos

| 경로 | 본문 | `data` |
|---|---|---|
| `todos/list` | `{ orgId }` | `{ todos: Todo[]; doneTotals: Record<userId, number> }` |
| `todos/create` | `{ orgId, title, ownerId?, dueDate?, id? }` | `Todo` |
| `todos/setStatus` | `{ todoId, status: 'todo'\|'doing'\|'done' }` | `Todo` |
| `todos/update` | `{ todoId, patch: { title?, dueDate?, ownerId? } }` | `Todo` |
| `todos/reorder` | `{ todoId, position: number }` | `Todo` |
| `todos/delete` | `{ todoId }` | `null` |
| `todos/restore` | `{ todoId }` | `null` |
| `todos/addNote` | `{ todoId, content }` | `TodoNote` |
| `todos/updateNote` | `{ noteId, content }` | `TodoNote` |
| `todos/deleteNote` | `{ noteId }` | `null` |
| `todos/handleForMember` | `{ todoId, note }` | `{ todo: Todo; note: TodoNote }` |
| `todos/join` | `{ todoId }` | `null` |
| `todos/leave` | `{ todoId }` | `null` |

- `todos/create`의 **`id`는 클라이언트가 정해서 보낸다.** 낙관적으로 그린 카드와 같은 id로
  저장해야 뒤이어 도착하는 실시간 INSERT가 같은 행으로 인식돼 카드가 둘로 늘지 않는다.
- `todos/list`는 **유계다.** 미완료는 전부, 완료는 **주인별 최근 20개**만 온다. 그보다
  오래된 완료는 `doneTotals`(주인별 완료 **총** 개수)에서 받은 개수를 빼서 숫자로만 안다.
- `dueDate`는 `YYYY-MM-DD` 또는 `null`.

### orgs

| 경로 | 본문 | `data` |
|---|---|---|
| `orgs/list` | `{}` | `(Organization & { role, member_count })[]` |
| `orgs/create` | `{ name }` | `Organization` |
| `orgs/members` | `{ orgId }` | `MemberSummary[]` |
| `orgs/rename` | `{ orgId, name }` | `null` |
| `orgs/updateImage` | `{ orgId, imageUrl: string\|null }` | `null` |
| `orgs/updateMemberOrder` | `{ orgId, orderedUserIds: string[] }` | `null` |
| `orgs/updateMemberRole` | `{ orgId, userId, role: 'admin'\|'member' }` | `null` |
| `orgs/removeMember` | `{ orgId, userId }` | `null` |
| `orgs/transferOwnership` | `{ orgId, newOwnerId }` | `null` |
| `orgs/delete` | `{ orgId }` | `null` |
| `orgs/invite` | `{ orgId, email }` | `OrgInvite & { registered: boolean }` |
| `orgs/invites` | `{ orgId }` | `(OrgInvite & { registered })[]` |
| `orgs/myInvites` | `{}` | `OrgInvite[]` |
| `orgs/respondToInvite` | `{ inviteId, accept: boolean }` | `{ orgId: string\|null }` |
| `orgs/revokeInvite` | `{ inviteId }` | `null` |
| `orgs/webhook` | `{ orgId }` | `string \| null` |
| `orgs/updateWebhook` | `{ orgId, webhookUrl }` | `null` |

- **`registered`는 "이 이메일로 가입한 계정이 있는가"다.** 이 앱은 초대 메일을 보내지
  않으므로, `false`면 앱이 사용자에게 "직접 알려 주세요"를 띄우고 공유 시트를 열어 줘야 한다.
- `orgs/webhook`은 방장·관리자만 값을 받는다. **Discord 웹훅 URL은 그 채널에 글을 쓸 수 있는
  자격이므로 로그에 남기지 말 것.**
- `orgs/delete`는 이 API에서 **유일하게 소프트 삭제가 아니다.** cascade로 그 조직의 할 일·
  메모·일정·가계부가 함께 사라진다. 확인 두 단계 없이 부르지 말 것.

### events

| 경로 | 본문 | `data` |
|---|---|---|
| `events/list` | `{ orgId }` | `OrgEvent[]` |
| `events/create` | `{ orgId, title, color, startDate, endDate }` | `OrgEvent` |
| `events/update` | `{ eventId, patch: { title?, color?, startDate?, endDate? } }` | `OrgEvent` |
| `events/delete` | `{ eventId }` | `null` |
| `events/restore` | `{ eventId }` | `null` |

- `color`는 색 값이 아니라 **키 문자열**이다. 실제 값은 웹의 `lib/event-colors.ts`에 있고,
  Swift 쪽에도 같은 키로 표를 만든다.
- 시작·끝을 거꾸로 넣으면 **막지 않고 뒤집어서 저장한다.**

### ledger

| 경로 | 본문 | `data` |
|---|---|---|
| `ledger/list` | `{ orgId, month: 'YYYY-MM' }` | `LedgerEntry[]` |
| `ledger/create` | `{ orgId, amount, title, spentOn, payerId? }` | `LedgerEntry` |
| `ledger/delete` | `{ id }` | `{ id }` |
| `ledger/restore` | `{ id }` | `LedgerEntry` |

- `amount`는 **원 단위 정수**다(소수점 없음, 0·음수 불가, 상한 1조).
  Swift에서 `Double`로 받지 말 것 — 합계에 오차가 쌓인다. `Int64`다.
- `spentOn`은 `created_at`과 다르다. 어제 쓴 걸 오늘 적는 게 정상 흐름이다.
- 합계는 서버가 주지 않는다. **클라이언트가 낸다** — 어차피 그 달 행을 전부 받는다.

### profile / account

| 경로 | 본문 | `data` |
|---|---|---|
| `profile/me` | `{}` | `Profile` |
| `profile/update` | `{ displayName?, avatarUrl?, theme?, locale?, showDone?, showLedger? }` | `Profile` |
| `account/delete` | `{}` | `null` |

- **`account/delete`는 되돌릴 수 없다.** App Store 5.1.1(v)가 요구하는 경로이고,
  성공하면 그 토큰은 더 이상 쓸 수 없다 — 앱은 즉시 로컬 세션을 지우고 로그인 화면으로 간다.
  방장인 조직의 소유권 이양과 혼자인 조직 삭제까지 서버가 알아서 한다.
- `avatarUrl`은 **우리 Storage의 `avatars/{userId}/` 아래**를 가리켜야 한다(서버가 검증한다).
  업로드 자체는 이 API가 아니라 Supabase Storage에 직접 한다.

---

## 3. 이 API를 거치지 않는 것

앱이 Supabase와 **직접** 이야기하는 자리가 셋 있다. 이걸 `/api/v1`로 끌어오면 Vercel
콜드 스타트가 자주 도는 경로에 얹힌다.

| | 어디로 | 왜 |
|---|---|---|
| 로그인·토큰 갱신 | Supabase Auth (`supabase-swift`) | 이 계층은 토큰을 발급하지 않는다 |
| 실시간 구독 | Supabase Realtime 웹소켓 | Vercel을 경유할 이유가 없다 |
| 사진 업로드 | Supabase Storage | 바이트를 서버리스 함수로 통과시킬 이유가 없다 |

읽기를 RLS 직결로 둘지 이 API로 받을지는 **아직 정하지 않았다** — 계획서 §2는 직결을
권한다(콜드 스타트를 피한다). 정하면 이 절을 고칠 것.

---

## 4. 아직 없는 것

- `devices/register` — APNs 토큰 등록(계획서 §7, M4)
- 읽기 경로의 ETag/If-None-Match — 위젯이 분 단위로 같은 답을 받아 오게 되면 그때
