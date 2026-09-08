# ios/

todolight의 네이티브 클라이언트. **백엔드는 웹과 같은 것을 쓴다** —
`app/actions/*`의 서버 액션을 `/api/v1`을 통해 부른다(`docs/api-v1.md`).

```
ios/
├── TodoLightKit/          ← 서버와 이야기하는 층 (SPM 로컬 패키지, 지금 있는 것)
│   ├── Sources/TodoLightKit/
│   │   ├── APIResponse.swift   판별 유니온 — 200인데 실패인 응답을 읽는다
│   │   ├── Coding.swift        인코딩/디코딩 규칙 (둘이 서로 다르다)
│   │   ├── FieldPatch.swift    "손대지 않음"과 "비움"을 구분하는 삼상태
│   │   ├── Models.swift        types/db.ts와 1:1
│   │   ├── APIClient.swift     Bearer · 401/429/400 · Accept-Language
│   │   ├── Endpoints.swift     엔드포인트 42개
│   │   └── BoardRules.swift    컬럼 정렬·조사 — 웹과 같아야 하는 규칙
│   └── Tests/                  27개 (그중 4개는 실서버, 기본 건너뜀)
└── TodoLight/             ← 앱 타깃 (.xcodeproj). 아직 없다 — docs/ios-m2-setup.md 참고
```

## 왜 같은 repo인가

백엔드를 웹과 공유하는 게 이 계획의 전부다. repo가 갈리면 API를 고칠 때 두 곳을 오가며
맞춰야 하고, 그러다 한 번 어긋나면 "앱에서만 안 되는" 버그가 된다.
자세한 근거는 `docs/ios-app-plan.md` §9.

## 지금 바로 되는 것

```bash
cd ios/TodoLightKit
swift build
swift test                 # 23개. 네트워크 없이 돈다

# 실서버까지 확인하려면 (토큰이 필요하다)
TODOLIGHT_BASE_URL=https://todolight.vercel.app \
TODOLIGHT_TOKEN=<access_token> \
swift test --filter LiveAPI
```

## 이 패키지가 지키는 것

- **의존성이 없다.** supabase-swift는 앱 타깃이 갖고, 여기는 "토큰을 달라"는 클로저만 받는다.
  그래서 테스트에 로그인이 필요 없고, 인증 SDK를 바꿔도 이 층은 안 흔들린다.
- **화면이 없다.** SwiftUI는 앱 타깃에 둔다. 여기 있는 `BoardRules`는 그리는 방법이 아니라
  **정렬 규칙**이다 — 웹과 앱이 같은 목록을 다른 순서로 보여 주면 버그다.
