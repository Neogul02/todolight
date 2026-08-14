# todolight

조직 단위 공유 투두 보드. 방장이 팀원을 초대하고, 수락하면 같은 조직이 된다.
같은 조직의 멤버는 서로의 할 일을 한 화면에서 보고, 남의 할 일을 대신 처리하면서
메모를 남길 수 있다. 모든 변경은 실시간으로 동기화된다.

```
방장 → 초대 → 수락 → 같은 조직 → 서로의 보드 공유
```

## 시작하기

```bash
yarn install
cp .env.example .env   # 값 채우기
yarn dev               # http://localhost:3000
```

### 환경 변수

| 이름 | 설명 |
|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | publishable key (`sb_publishable_...`) |
| `SUPABASE_SERVICE_ROLE_KEY` | secret key (`sb_secret_...`) — **서버 전용** |
| `NEXT_PUBLIC_SITE_URL` | 앱 절대 URL |

## 기능

- **로그인·회원가입·비밀번호 재설정** — Supabase Auth (이메일 + 비밀번호)
- **조직** — 만든 사람이 방장. 이메일로 팀원 초대, 수락/거절, 역할(관리자) 지정, 내보내기
- **보드** — 멤버마다 컬럼 하나. 모바일은 한 화면에 한 명씩, 좌우로 밀어 팀원을 오간다.
  내 할 일이 항상 처음에 보인다
- **대시보드** — 모든 팀원의 할 일을 세로로 쌓아 위아래 스크롤로 한 번에 훑는 모드
- **할 일** — 추가·완료·마감일·삭제. 남의 컬럼에 직접 꽂아서 "이거 좀 해줘"도 가능
- **대신 처리** — 남의 할 일을 완료 처리하려면 메모를 반드시 남긴다.
  카드에 "OO가 대신 처리" 배지가 남는다
- **실시간** — `todos` / `todo_notes` 변경이 웹소켓으로 즉시 모두에게 반영
- **Discord 알림** — 할 일이 추가되거나 누가 대신 처리하면(메모 포함) 웹훅으로 알림.
  방장이 `/team`에서 채널 웹훅 URL을 넣으면 켜진다
- **지우기** — 카드 오른쪽 X로 바로 치운다. 소프트 삭제라 DB에는 남는다
- **테마** — 흰 배경 + 블랙이 기본(`ink`), 베이지(`sand`)도 선택 가능. 민트는 프리뷰(유료화 예정)
- **아바타** — 이름 첫 글자 + 색. 색을 고르지 않으면 계정 id로 자동 배정

## 스택

Next.js 16 (App Router) · React 19 · TypeScript 6 · TailwindCSS v4 ·
Supabase (Auth · Postgres · Realtime) · TanStack Query v5 · Framer Motion · Zod

배포는 Vercel 서버리스.

## 데이터베이스

스키마는 `supabase/migrations/`에 있다. RLS는 전 테이블에 걸려 있고,
조직 소속 판정은 `is_org_member` / `is_org_manager` / `shares_org_with`
(`security definer`) 함수로 처리해 정책 재귀를 피한다.

구조와 규칙의 자세한 설명은 [`CLAUDE.md`](./CLAUDE.md) 참고.

## 앞으로

- 유료 테마 결제 연동
- 할 일 드래그 정렬 UI (`reorderTodo` 서버 액션은 이미 있음)
- Swift iOS 앱 (웹앱 안정화 이후)
