import SwiftUI

@main
struct TodoLightApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var session = SessionStore()
    @State private var theme = ThemeStore()
    @State private var lang = LangStore()

    init() { AppFont.register() }

    var body: some Scene {
        WindowGroup {
            // 스크롤 막대는 그리지 않는다(웹 globals.css와 같은 원칙) — 하위 스크롤 뷰 전부에 내려간다
            ThemedRoot { RootView() }
                .scrollIndicators(.hidden)
                // 입력칸 밖을 누르면 키보드를 내린다(KeyboardDismiss.swift)
                .background(KeyboardDismissOnTap().allowsHitTesting(false))
                .environment(session)
                .environment(theme)
                .environment(lang)
                // 잠금화면 "할 일 추가" 버튼(위젯 확장의 QuickAddControl)
                .onOpenURL { url in if url.host() == "add" { QuickAdd.shared.request() } }
        }
    }
}

/// 로그인 여부로만 가른다.
struct RootView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.scenePhase) private var phase
    @Environment(\.accessibilityReduceMotion) private var reduce

    var body: some View {
        switch session.state {
        case .loading:
            CanvasBackground()
        case .signedOut:
            LoginView()
        case .signedIn(let userId):
            BoardRootView(userId: userId)
                // 앱 전환기·제어 센터를 열면 iOS가 지금 화면을 찍어 둔다 — 팀의 할 일과 가계부 금액이
                // 거기 그대로 남지 않게 흐린 판과 로고로 덮는다. 돌아오면 바로 걷는다.
                .overlay {
                    if phase != .active {
                        PrivacyCover().transition(.opacity)
                    }
                }
                .animation(reduce ? nil : .easeOut(duration: 0.15), value: phase)
        }
    }
}

/// 앱이 화면에서 비켜 있을 때의 덮개
private struct PrivacyCover: View {
    var body: some View {
        Rectangle().fill(.ultraThinMaterial)
            .overlay { LogoMark(size: 56) }
            .ignoresSafeArea()
            .accessibilityHidden(true)
    }
}
