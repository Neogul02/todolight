# todolight iOS 출시 — Xcode에서 App Store까지

> 이 문서는 [`ios-app-plan.md`](./ios-app-plan.md)의 **M5(출시)** 를 실행 가능한 절차로 푼 것이다.
> 계획서가 "무엇을 만들까"라면 이 문서는 "만든 것을 어떻게 내보내나"다.
>
> 작성 기준: 2026-09-02

---

## 0. 전체 흐름

```
Apple Developer 등록 → 식별자(Bundle ID · App Group · APNs 키) 등록
  → Xcode 서명 설정 → Archive → App Store Connect 업로드
  → TestFlight 테스트 → 스토어 정보(스크린샷 · 개인정보) 작성
  → 심사 제출 → 승인 → 출시
```

**Xcode가 하는 일은 가운데 `Archive → 업로드` 두 단계뿐이다.** 나머지는 전부 웹
(developer.apple.com · appstoreconnect.apple.com)에서 한다. 처음 하는 사람이 여기서 헷갈린다 —
"Xcode로 배포한다"고 말하지만 실제 시간의 대부분은 웹 콘솔에서 쓴다.

---

## 1. 준비 — Apple Developer Program

계획서 [P0-3](./ios-app-plan.md#p0--코드-쓰기-전에-끝내야-하는-것)과 같은 항목이다. **$99/년.**

- 개인 등록은 보통 1~2일, 법인은 D-U-N-S 번호가 필요해 몇 주 걸린다.
- 가입하는 Apple ID에 **2단계 인증**이 켜져 있어야 한다.
- **이 계정이 앱의 주인이 된다.** 나중에 옮기는 건 매우 번거로우니 어느 계정을 쓸지 처음에 정한다.

유료 계정 없이는 푸시 · 위젯 · App Group · Keychain Sharing이 실기기에서 전부 안 된다.
즉 잠금화면(M4)은 이게 없으면 시작조차 못 한다.

---

## 2. 식별자 등록 (developer.apple.com → Certificates, IDs & Profiles)

todolight는 위젯 + 푸시 + App Group을 쓰므로 등록할 것이 앱 하나가 아니다.

| 항목 | 값 예시 | 비고 |
|---|---|---|
| 앱 Bundle ID | `com.jinhyeong.todolight` | **한 번 정하면 못 바꾼다** |
| 위젯 확장 Bundle ID | `com.jinhyeong.todolight.widget` | 반드시 앱 ID로 시작해야 한다 |
| App Group | `group.com.jinhyeong.todolight` | 앱↔위젯 스냅샷 공유(계획서 §6-1 `SharedStore`) |
| Keychain Group | `com.jinhyeong.todolight.shared` | 위젯이 세션 토큰을 읽으려면 필요(계획서 §4) |
| APNs Auth Key | `.p8` 파일 | 푸시 발송용 |

Bundle ID를 만들 때 Capabilities에서 **App Groups · Push Notifications · Sign in with Apple**을
켜 둔다.

> ⚠️ **APNs 키(`.p8`)는 한 번만 다운로드된다.** 재다운로드가 없고, 잃어버리면 폐기 후 재발급이다.
> 계획서 §9의 `.gitignore`에 `*.p8`이 들어간 이유가 이것이다 — 커밋하면 그 키를 가진 누구나
> 이 앱에 푸시를 쏠 수 있다.

---

## 3. Xcode 서명 · 버전 설정

타겟 → **Signing & Capabilities** 탭에서:

- **Team**을 개발자 계정으로 선택
- **Automatically manage signing** 체크 — 인증서와 프로비저닝 프로파일을 Xcode가 만든다.
  처음에는 무조건 자동으로 한다. 수동 서명은 CI를 붙일 때(§11) 배운다.
- `+ Capability`로 App Groups · Push Notifications · Keychain Sharing · Sign in with Apple 추가
- **위젯 타겟에도 App Groups를 똑같이 추가한다.** 여기를 빠뜨리는 것이 가장 흔한 실수다 —
  앱은 정상인데 위젯만 빈 화면이 나오고, 코드에는 아무 문제가 없어 원인을 찾기 어렵다.

### 버전 두 개를 구분한다

| 필드 | Xcode 표기 | 뜻 |
|---|---|---|
| `MARKETING_VERSION` | Version `1.0.0` | 사람이 보는 버전. 스토어에 표시된다 |
| `CURRENT_PROJECT_VERSION` | Build `1` | 업로드마다 **반드시 증가**해야 한다 |

같은 Version으로 Build만 올려 여러 번 업로드하는 것이 정상이다
(TestFlight에 `1.0.0 (1)`, `1.0.0 (2)`…로 쌓인다). Build를 안 올리면 업로드가 거부된다.

---

## 4. App Store Connect에 앱 등록

appstoreconnect.apple.com → My Apps → **+** → New App

- **이름(30자)** — 스토어 전역에서 고유해야 한다. "Todolight"가 이미 있으면 못 쓴다. 미리 확인한다.
- **Primary Language** · **Bundle ID**(§2에서 만든 것) · **SKU**(내부 식별자, 예: `todolight-ios`)

빌드가 없어도 된다. 앱 "자리"만 먼저 만들어 두는 단계다.

---

## 5. Archive와 업로드 — Xcode가 실제로 하는 일

1. 실행 대상을 시뮬레이터가 아니라 **Any iOS Device (arm64)** 로 바꾼다.
   시뮬레이터로 두면 Archive 메뉴가 비활성화된다.
2. **Product → Archive**
3. 끝나면 **Organizer**가 자동으로 뜬다 (수동: Window → Organizer)
4. **Distribute App → App Store Connect → Upload**
5. Xcode가 검증(Validate) 후 업로드한다

업로드 후 **처리(Processing)에 5~30분** 걸리고, 끝나면 메일이 온다.

### 여기서 막히는 것들

- **앱 아이콘에 알파 채널이 있으면 거부된다.** 웹의 `app/icon.svg`를 그대로 쓸 수 없다 —
  배경을 채운 불투명 PNG로 다시 뽑는다(`app/apple-icon.tsx`와 같은 베이지 배경 + 검정 "Todo").
- **`Info.plist`의 사용 목적 설명.** 알림 권한, 사진 접근(프로필·조직 아이콘 업로드)을 쓰면
  `NSPhotoLibraryUsageDescription` 같은 문자열이 반드시 있어야 하고 **내용도 구체적**이어야 한다.
  "사진에 접근합니다"만 쓰면 심사에서 걸린다. 문구는 **해요체**로 쓴다(`CLAUDE.md`의 말투 규칙은
  네이티브 앱에도 그대로 적용된다).
- **Privacy Manifest(`PrivacyInfo.xcprivacy`)** — 계획서 M3 항목. App Group 공유에 `UserDefaults`를
  쓰면 사유 코드 `CA92.1`을 적어야 한다. 없으면 업로드 직후 경고 메일이 오고, 심사에서 막힐 수 있다.

---

## 6. TestFlight — 심사 전에 반드시 거친다

빌드 처리가 끝나면 TestFlight 탭에 나타난다.

먼저 **수출 규정(Export Compliance)** 질문이 뜬다. todolight는 HTTPS만 쓰므로 면제 대상이지만
**답은 해야 한다.** 매번 묻는 게 귀찮으면 `Info.plist`에
`ITSAppUsesNonExemptEncryption = false`를 넣는다.

| 테스터 | 인원 | 심사 |
|---|---|---|
| 내부(Internal) | App Store Connect 계정에 초대된 최대 100명 | **없음 — 즉시 설치** |
| 외부(External) | 최대 10,000명 | 첫 배포 시 Beta App Review (보통 하루 이내) |

**빌드는 90일 후 만료된다.**

계획서 M2 · M4의 완료 기준 — "웹과 동시에 열어 두고 한쪽에서 체크하면 1초 안에 따라온다",
"잠금화면에서 체크하면 웹 보드가 움직인다" — 을 확인하는 곳이 여기다.
시뮬레이터로는 푸시도 위젯 갱신 예산도 제대로 못 본다.

---

## 7. 스토어 정보 (시간이 제일 많이 드는 단계)

### 스크린샷

현재 필수는 **6.9인치 iPhone** 세트다(iPad를 지원하면 13인치도). 시뮬레이터에서 ⌘S로 찍으면
정확한 해상도로 나온다. 보드 · 달력 · 가계부 · 잠금화면 위젯 4~5장이면 충분하다.

### 개인정보 처리방침 URL — 필수

없으면 제출 자체가 안 된다. `NEXT_PUBLIC_SITE_URL/privacy` 같은 페이지를 웹에 만들어야 한다.
Next.js 라우트 하나면 되니 **M5에 오기 전에 미리 해 둔다.**

### App Privacy 설문

todolight가 실제로 수집하는 것을 정직하게 답한다. 여기 답한 내용과 앱 동작이 다르면 리젝 사유다.

| 데이터 | 목적 | 계정 연결 |
|---|---|---|
| 이메일 주소 | 앱 기능 | 연결됨 |
| 사용자 콘텐츠(할 일 · 메모 · 가계부) | 앱 기능 | 연결됨 |
| 사용자 ID | 앱 기능 | 연결됨 |
| 추적(Tracking) | — | **하지 않음** |

그 밖에 카테고리(생산성) · 연령 등급 설문 · 가격 · 지원 URL을 채운다.

---

## 8. 심사 제출

빌드를 고르고 **Add for Review → Submit**. 제출 폼에서 세 가지를 더 묻는다.

1. **광고 식별자(IDFA) 사용** → 아니오
2. **콘텐츠 권리** → 제3자 콘텐츠 없음
3. **App Review 정보 — 여기가 핵심이다**

### 데모 계정은 선택이 아니다

todolight는 **로그인 없이는 아무것도 못 보는 앱**이다. 그래서 심사자에게 줄 계정이
반드시 필요하고, 그 계정은:

- 실제로 로그인이 되어야 하고
- **조직에 이미 소속돼 있고, 팀원과 할 일 · 일정 · 가계부 항목이 들어 있어야 한다**

빈 계정을 주면 심사자는 빈 화면만 보고 **Guideline 2.1(정보 부족)** 으로 리젝한다.
첫 심사 리젝 사유 1위가 이것이다.

Review Notes에는 위젯 검수 절차도 적는다 — "홈화면 길게 누르기 → 위젯 추가 → Todolight →
잠금화면에도 동일" 같은 재현 경로가 없으면 심사자가 기능을 못 찾는다.

**심사 기간은 보통 24~48시간.** 리젝되면 Resolution Center에서 대화하고 고쳐 재제출한다
(재심사는 대개 더 빠르다). 계획서 M5의 "첫 심사는 리젝을 기본값으로 잡고 일정 잡기"가 이것이다.

---

## 9. 출시와 업데이트

승인 후 세 가지 중 고른다:

- **자동 출시** (승인 즉시)
- **수동 출시** (버튼을 눌러야 나간다 — **첫 출시는 이쪽을 권한다**)
- 지정 날짜

**단계적 출시(Phased Release)** 는 7일에 걸쳐 자동 업데이트를 퍼뜨린다. 업데이트에서만 의미가 있다.

이후 업데이트는 같은 사이클의 반복이다:
코드 수정 → Version/Build 올리기 → Archive → 업로드 → 새 버전 만들고 제출.

---

## 10. todolight에서 특히 걸릴 곳

### ① 계정 삭제 (5.1.1(v)) — 확실히 걸린다

계획서 [P0-2](./ios-app-plan.md#p0--코드-쓰기-전에-끝내야-하는-것) 그대로다.
계정을 만들 수 있는 앱은 **앱 안에서** 삭제할 수 있어야 하고, 웹으로 보내는 링크는 인정되지 않는다.
M0에서 설계하고 M3에서 구현한다. 계획서 §12의 열린 질문 1·2(소유권 이양 · 데이터 익명화)에
답이 나와 있어야 구현할 수 있다.

### ② 유료 테마 (3.1.1) — 열린 질문 7번

iOS에서 디지털 콘텐츠를 팔면 **In-App Purchase가 강제**되고 수수료는 15~30%다.
더 중요한 것은 **앱 안에서 웹 결제로 유도하는 것 자체가 리젝 사유**라는 점이다.
`lib/themes.ts`의 `free: false`를 실제로 켜기 전에 결론을 내야 한다.
**첫 출시에서는 전부 무료로 두고 나중에 붙이는 쪽이 안전하다** — 결제는 그 자체로 심사 표면이
넓어지는 항목이라, 첫 심사에 같이 얹으면 무엇 때문에 리젝됐는지 분리하기 어려워진다.

### ③ Sign in with Apple (4.8)

이메일/비밀번호만 있으면 필수가 아니다. 그러나 **제3자 로그인(Google · 카카오 등)을 하나라도
넣는 순간 Sign in with Apple도 같이 넣어야 한다.** 계획서 M2에 SIWA가 들어 있으니 문제없다.
다만 Apple의 이메일 가리기와 이메일 초대의 충돌은 계획서 §11의 리스크 항목 그대로 남는다.

### ④ 심사자는 프로덕션 서버를 본다

`/api/v1`이 Vercel 프로덕션에 배포돼 있어야 하고, **심사 중에 그 엔드포인트를 깨뜨리는 배포를
하면 안 된다.** 계획서 §9가 "심사 중인 빌드는 어느 API 커밋을 보는가"를 `git log` 하나로
답하려고 한 repo를 고른 이유가 여기서 현실이 된다. 심사 제출 시점의 커밋에 태그를 남긴다.

### ⑤ P0-1(실시간 인증)은 출시 전에 반드시 끝낸다

만약 계획서 P0-1의 (b)안 — anon 키로 전 조직 데이터가 새는 상태 — 이라면, 앱을 내는 순간
그 키가 앱 번들에도 들어간다. 지금은 브라우저 번들에만 있지만 성격은 같고, 범위만 넓어진다.

---

## 11. 나중에: CI 자동화

손으로 Archive하는 것이 지겨워지면 **App Store Connect API 키(`.p8`)** 를 만들고
`xcodebuild archive` + `-exportArchive`, 또는 fastlane으로 CI에서 돌린다.
이때 처음으로 수동 서명이 필요해진다.

**첫 몇 번은 반드시 손으로 한다.** 자동화는 어디가 왜 실패하는지 아는 사람만 고칠 수 있다.

---

## 부록 — 제출 직전 체크리스트

- [ ] Build 번호를 올렸다
- [ ] 앱 아이콘에 알파 채널이 없다
- [ ] `Info.plist` 사용 목적 설명이 전부 있고 해요체다
- [ ] `PrivacyInfo.xcprivacy`가 있고 `UserDefaults` 사유 코드가 들어 있다
- [ ] 위젯 타겟에 App Group이 켜져 있다
- [ ] 개인정보 처리방침 URL이 실제로 열린다
- [ ] App Privacy 설문이 실제 수집 항목과 일치한다
- [ ] **데모 계정이 조직 · 팀원 · 할 일을 갖고 있고 지금 로그인된다**
- [ ] Review Notes에 위젯 재현 절차가 있다
- [ ] 앱 안에 계정 삭제 경로가 있다
- [ ] 유료 테마가 꺼져 있다(또는 IAP로 구현돼 있다)
- [ ] `/api/v1`이 프로덕션에서 동작하고, 그 커밋에 태그를 남겼다
