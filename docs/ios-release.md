# todolight iOS 출시 — Xcode에서 App Store까지

만든 앱을 내보내는 절차. 위에서부터 한 번씩 하면 된다.

| 항목 | 값 |
|---|---|
| 앱 Bundle ID | `com.neogul02.todolight` |
| 위젯 Bundle ID | `com.neogul02.todolight.widgets` |
| App Group (키체인 공유 겸용) | `group.com.neogul02.todolight` |
| 버전 | `MARKETING_VERSION` = 1.0.0, 빌드 번호 = `CURRENT_PROJECT_VERSION` (`ios/TodoLight/project.yml`) |
| 개인정보 처리방침 | <https://todolight.vercel.app/legal/privacy> (로그인 없이 열림) |
| 이용약관 | <https://todolight.vercel.app/legal/terms> |

## 1. Apple Developer Program

developer.apple.com에서 등록한다. **$99/년**, 개인은 보통 1~2일 걸린다.

## 2. Xcode 서명

```bash
cd ios/TodoLight && xcodegen generate   # .xcodeproj는 git에 없다 — 여기서 만든다
open TodoLight.xcodeproj
```

- **TodoLight**와 **TodoLightWidgets** 두 타깃 모두 Signing & Capabilities → Team에 결제한 계정을 고른다.
  자동 서명이 Bundle ID와 App Group을 알아서 등록한다.
- 팀을 고르면 `project.yml`의 `DEVELOPMENT_TEAM`에도 그 팀 ID를 적어 둔다 — 안 그러면
  `xcodegen generate`를 다시 돌릴 때마다 빈칸으로 돌아간다.

## 3. App Store Connect에 앱 등록

appstoreconnect.apple.com → 앱 → + → 새로운 앱. 플랫폼 iOS, Bundle ID는 위 표의 앱 ID, SKU는 아무 문자열.

### todolight Pro 구독 상품

앱 → 수익화 → 구독 → 구독 그룹 **todolight Pro**를 만들고 상품 셋을 넣는다(ID는 코드와 같아야 한다):

| 제품 ID | 기간 | 가격 |
|---|---|---|
| `com.neogul02.todolight.pro.monthly` | 1개월 | $1.99 |
| `com.neogul02.todolight.pro.halfyear` | 6개월 | $10.99 (월 대비 8% 할인) |
| `com.neogul02.todolight.pro.yearly` | 1년 | $19.99 (월 대비 16% 할인) |

- 한국 가격은 Apple이 달러 가격에 맞춰 자동으로 채운다 — 그대로 두거나 가까운 값으로 고친다.
- 앱 → App 정보 → **App Store 서버 알림**: 운영·샌드박스 둘 다
  `https://todolight.vercel.app/api/billing/apple-notifications`, 버전 2.
- 비즈니스 → **유료 앱 계약**에 서명하고 은행·세금 정보를 넣어야 상품이 살아난다.
- **App Store 소규모 비즈니스 프로그램**을 신청하면 수수료가 30% → 15%다.
- 심사 제출 때 구독 상품도 함께 제출한다(첫 구독은 앱 버전과 같이 심사된다).

## 4. Archive와 업로드

1. Xcode 상단 기기를 **Any iOS Device (arm64)** 로 바꾼다.
2. Product → **Archive**.
3. Organizer → **Distribute App** → App Store Connect → Upload.

- 올릴 때마다 **빌드 번호를 올린다**(`CURRENT_PROJECT_VERSION`). 같은 번호는 거절된다.
- 수출 규정 질문은 뜨지 않는다 — `ITSAppUsesNonExemptEncryption = false`가 들어 있다.

## 5. TestFlight

업로드한 빌드가 처리되면(10~30분) TestFlight에 뜬다. 심사 전에 실제 폰에서 꼭 확인한다:

- 가입 → 조직 만들기 → 초대 → 다른 계정으로 수락
- 웹과 동시에 열어 두고 한쪽에서 체크하면 바로 따라오는지(실시간)
- 홈·잠금화면 위젯, 위젯에서 바로 끝내기, 잠금화면 「할 일 추가」 버튼

## 6. 스토어 정보

- **스크린샷**: 6.9인치 iPhone 세트가 필수다. 시뮬레이터에서 ⌘S로 찍으면 해상도가 맞는다.
  보드 · 달력 · 할 일 펼침 · 위젯 4~5장.
- **개인정보 처리방침 URL · 지원 URL**: 위 표의 주소.
- **App Privacy 설문** — `PrivacyInfo.xcprivacy`와 같아야 한다. 추적은 **안 함**, 전부 「계정에 연결됨 · 앱 기능」:
  이메일 · 이름 · 사진 · 기타 사용자 콘텐츠(할 일·메모·일정) · 사용자 ID · 구입 내역.
- 카테고리는 생산성.

## 7. 심사 제출

- **데모 계정이 필수다.** 심사자는 계정을 만들지 않는다. 조직 · 팀원 · 할 일이 이미 들어 있는 계정의
  이메일·비밀번호를 Review Notes에 적는다. 제출 직전에 그 계정으로 로그인되는지 다시 확인한다.
- Review Notes에 위젯 확인 방법을 적는다: 「홈 화면을 길게 눌러 + → todolight → 내 할 일」.
- 첫 심사는 리젝을 한 번 받을 각오로 일정을 잡는다(보통 1~2일, 재심사는 더 빠르다).

## 걸리기 쉬운 곳

- **계정 삭제(5.1.1(v))** — 구현돼 있다. 웹 `/me`와 iOS 내 설정 맨 아래(`deleteMyAccount`).
- **Sign in with Apple(4.8)** — 이메일·비밀번호 로그인만 있어서 필요 없다. 구글·카카오 같은
  외부 로그인을 넣는 순간 함께 넣어야 한다.
- **심사자는 프로덕션 서버를 본다** — 심사 중에는 `/api/v1`의 응답 모양을 바꾸지 않는다.

## 제출 직전 체크리스트

- [ ] 빌드 번호를 올렸다
- [ ] 두 타깃 모두 Team이 잡혀 있다
- [ ] 개인정보 처리방침 URL이 로그인 없이 열린다
- [ ] App Privacy 설문이 `PrivacyInfo.xcprivacy`와 같다
- [ ] **데모 계정이 조직 · 팀원 · 할 일을 갖고 있고 지금 로그인된다**
- [ ] TestFlight에서 가입·초대·실시간·위젯을 실제 폰으로 확인했다
