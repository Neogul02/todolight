# M2 — Xcode 프로젝트 만들기

> `ios/TodoLightKit`(서버와 이야기하는 층)은 이미 있고 테스트도 돈다. 여기서는 그 위에
> **앱 타깃**을 얹는다. `.xcodeproj`는 Xcode가 만들어야 해서 이 문서가 그 설정값을 갖는다.
>
> 작성 기준: 2026-09-08 · Xcode 26.6 / Swift 6.3

---

## 1. 프로젝트 생성

Xcode → **File ▸ New ▸ Project ▸ iOS ▸ App**

| 항목 | 값 | 왜 |
|---|---|---|
| Product Name | `TodoLight` | |
| Organization Identifier | `com.<본인>` | Bundle ID가 `com.<본인>.todolight`이 된다 |
| Interface | **SwiftUI** | |
| Language | **Swift** | |
| Testing System | **Swift Testing** | 패키지 테스트와 같은 걸 쓴다 |
| Storage | **None** | SwiftData는 M3에서 오프라인 캐시를 붙일 때 직접 넣는다 |
| 저장 위치 | 이 repo의 **`ios/`** | `ios/TodoLight/TodoLight.xcodeproj`가 된다 |

**Minimum Deployment: iOS 17.0.** 잠금화면 위젯 자체는 16부터지만, 위젯 안에서 바로 체크하는
버튼(`AppIntent` 기반 상호작용 위젯)이 17부터다 — 그게 M4의 핵심이라 17이 하한이다.
iOS 18 전용인 잠금화면 컨트롤(`QuickAddControl`)만 `@available`로 따로 감싼다.

> **`ios/` 안에 만들 것.** repo 밖에 만들면 백엔드를 고칠 때 두 곳을 오가게 되고,
> 그게 바로 같은 repo를 쓰기로 한 이유가 사라지는 지점이다(`docs/ios-app-plan.md` §9).

---

## 2. 패키지 붙이기

### TodoLightKit (로컬)

**File ▸ Add Package Dependencies… ▸ Add Local…** → `ios/TodoLightKit` 선택
→ 앱 타깃의 **Frameworks, Libraries, and Embedded Content**에 `TodoLightKit` 추가.

### supabase-swift

**File ▸ Add Package Dependencies…** → `https://github.com/supabase/supabase-swift`

필요한 product는 **`Supabase`** 하나다(Auth·Realtime·Storage가 그 안에 있다).

> **왜 `TodoLightKit`이 이걸 안 갖는가**: 그 층은 "토큰을 달라"는 클로저만 받는다.
> 인증 SDK를 패키지에 넣으면 그 층을 테스트할 때마다 실제 로그인이 필요해지고,
> 나중에 인증을 바꾸면 API 층까지 흔들린다.

---

## 3. 설정값

### Info.plist

**추가할 것이 없다.** 모든 통신이 HTTPS라 ATS 예외가 필요 없고,
`/api/v1`은 표준 포트를 쓴다. (예외를 넣고 싶어지면 그건 URL이 틀린 것이다.)

### Build Settings

- **Swift Language Version: 6** — `TodoLightKit`이 엄격 동시성으로 빌드된다.
  앱 타깃을 5로 두면 경계에서 경고가 쏟아진다.

### 나중에(M4) 켤 것 — 지금은 필요 없다

| Capability | 언제 | 유료 계정 |
|---|---|---|
| App Groups (`group.com.<본인>.todolight`) | 위젯이 본체와 데이터를 나눠 쓸 때 | 필요 |
| Push Notifications | 위젯 갱신용 무음 푸시 | 필요 |
| Keychain Sharing | 위젯이 토큰을 읽어야 할 때 | 필요 |

**M2는 무료 계정으로 끝난다.** 시뮬레이터 빌드와 SwiftUI 개발에는 유료 프로그램이 필요 없다.

---

## 4. 인증 붙이기 (앱 타깃에 둘 코드)

`TodoLightKit`은 토큰 문자열만 있으면 되므로, 앱 쪽에서 supabase-swift와 이어 준다.

```swift
// TodoLight/Services/Backend.swift
import Foundation
import Supabase
import TodoLightKit

@MainActor
final class Backend {
    static let shared = Backend()

    let supabase = SupabaseClient(
        supabaseURL: URL(string: "https://rscexhqsilstyogzatye.supabase.co")!,
        supabaseKey: "<NEXT_PUBLIC_SUPABASE_ANON_KEY 값>"
    )

    private(set) lazy var api = APIClient(
        baseURL: URL(string: "https://todolight.vercel.app")!
    ) { [supabase] in
        /*
          **갱신은 SDK가 한다.** `session`은 만료가 가까우면 알아서 refresh하고 새 토큰을
          돌려준다 — 우리가 만료를 재거나 타이머를 두면 반드시 한 번은 놓친다.
          로그아웃 상태에서는 throw하므로 nil로 떨어뜨려 401을 받게 둔다.
        */
        try? await supabase.auth.session.accessToken
    }
}
```

> ⚠️ anon key는 브라우저 번들에도 들어가는 **공개 키**라 앱에 넣어도 된다.
> `SUPABASE_SERVICE_ROLE_KEY`는 절대 앱에 넣지 말 것 — 그건 RLS를 통째로 우회한다.

### 로그인

```swift
try await Backend.shared.supabase.auth.signIn(email: email, password: password)
// 이후 api 호출은 자동으로 Bearer가 붙는다
```

> supabase-swift의 정확한 심볼 이름은 붙이는 버전에 따라 다를 수 있다
> (`session.accessToken` / `signIn(email:password:)`). 컴파일 에러가 나면 그 버전의
> 헤더를 열어 확인할 것 — 이 문서보다 패키지가 맞다.

---

## 5. 첫 화면으로 확인하기

붙었는지 보는 가장 짧은 길:

```swift
struct SmokeView: View {
    @State private var text = "…"

    var body: some View {
        Text(text).task {
            do {
                let me = try await Backend.shared.api.fetchMyProfile()
                let orgs = try await Backend.shared.api.fetchMyOrgs()
                text = "\(me.displayName) · 조직 \(orgs.count)개"
            } catch {
                text = "\(error)"
            }
        }
    }
}
```

여기까지 되면 **서버 쪽 일은 끝난 것이다.** 남은 M2는 전부 화면이다.

---

## 6. M2에서 만들 화면과, 옮겨야 하는 결정

`CLAUDE.md`가 그 결정 목록이다. **코드는 못 옮기지만 결정은 1:1로 옮긴다** — 안 보고 짜면
반드시 다른 앱이 된다. 이미 `TodoLightKit/BoardRules.swift`에 옮겨 둔 것도 있다.

| 화면 | 반드시 지킬 결정 | 어디에 |
|---|---|---|
| 보드 캐러셀 | 내 컬럼이 항상 첫 번째. 한 화면에 한 명 | `CLAUDE.md` 「보드 / 대시보드 두 모드」 |
| 컬럼 정렬 | 지난 마감 → 오늘 → 나중 → 마감 없음, 완료는 맨 아래 최근순 | `BoardRules.split` ✅ |
| 카드 배지 | `createdBy != ownerId` → "OOO이 부탁", 조사는 받침 따라 | `BoardRules` ✅ |
| 완료 접기 | 3개만 펴고 나머지는 접는다. **안 받아 온 것과 섞지 말 것** | `CLAUDE.md` 「보드 조회를 유계로」 |
| 카드 펼침 | 한 번에 하나. 순서는 메모 → 입력 → 동작 | 「카드 펼침은 한 번에 하나」 |
| 지우기 | 소프트 삭제 + 실행취소. 확인 창을 묻지 않는다 | 「위험한 동작」 |
| 낙관적 반영 | 추가 시 **id를 클라이언트가 정한다**(실시간과 겹치지 않게) | `Endpoints.createTodo` ✅ |
| 마감 피커 | 네이티브 `DatePicker`를 쓰지 말 것 — 화면 절반을 덮는다 | 「날짜 입력 — DuePicker」 |
| 테마 | 6종. 컴포넌트에 색을 하드코딩하지 말 것 | 「디자인 시스템」 |

**네이티브에서 사라지는 것**(다시 만들지 말 것): 캐러셀 스냅·드래그, 바텀시트 포털·포커스
트랩, 리사이즈 패널, `dvh` 산수, iOS 확대 방지, 스크롤바 숨기기.
각각 `ScrollView(.horizontal).scrollTargetBehavior(.viewAligned)` · `.sheet` ·
`.presentationDetents` · `safeAreaInset`으로 끝난다.

---

## 7. 아직 정하지 않은 것

- **읽기를 RLS 직결로 할지 `/api/v1`로 받을지.** 계획서 §2는 직결을 권한다(Vercel 콜드
  스타트를 자주 도는 경로에서 뺀다). 실시간은 어차피 직결이므로, 읽기까지 직결로 하면
  `/api/v1`은 쓰기 전용이 된다. M2에서 보드를 붙여 보고 정한다.
- **Sign in with Apple.** 지금 웹은 이메일+비밀번호뿐이라 Guideline 4.8에 걸리지 않지만,
  네이티브에서는 로그인 마찰이 훨씬 크게 느껴진다. 넣으면 서버의 `getAuthUser()`는
  그대로 동작한다(같은 Supabase JWT다).
