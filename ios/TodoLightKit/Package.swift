// swift-tools-version: 6.0
import PackageDescription

/*
  TodoLightKit — 서버와 이야기하는 층. 화면은 여기 없다.

  **의존성이 없다.** supabase-swift는 앱 타깃이 갖고, 이 패키지는 "토큰을 달라"는 클로저만
  받는다(`APIClient`의 `tokenProvider`). 그래야 이 층을 테스트할 때 실제 로그인이 필요 없고,
  나중에 인증 SDK를 바꿔도 여기는 안 흔들린다.

  macOS를 플랫폼에 넣어 둔 이유는 하나다 — `swift test`가 시뮬레이터 없이 돌아야 CI와
  터미널에서 바로 검증된다. 앱 코드는 iOS 타깃에서만 쓴다.
*/
let package = Package(
    name: "TodoLightKit",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "TodoLightKit", targets: ["TodoLightKit"])
    ],
    targets: [
        .target(name: "TodoLightKit"),
        .testTarget(name: "TodoLightKitTests", dependencies: ["TodoLightKit"]),
    ]
)
