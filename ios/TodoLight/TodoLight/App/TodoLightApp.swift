import SwiftUI

@main
struct TodoLightApp: App {
    @State private var session = SessionStore()
    @State private var theme = ThemeStore()
    @State private var lang = LangStore()

    init() { AppFont.register() }

    var body: some Scene {
        WindowGroup {
            // 스크롤 막대는 그리지 않는다(웹 globals.css와 같은 원칙) — 하위 스크롤 뷰 전부에 내려간다
            ThemedRoot { RootView() }
                .scrollIndicators(.hidden)
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

    var body: some View {
        switch session.state {
        case .loading:
            CanvasBackground()
        case .signedOut:
            LoginView()
        case .signedIn(let userId):
            BoardRootView(userId: userId)
        }
    }
}
