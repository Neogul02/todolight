import SwiftUI

@main
struct TodoLightApp: App {
    @State private var session = SessionStore()
    @State private var theme = ThemeStore()
    @State private var lang = LangStore()

    init() { AppFont.register() }

    var body: some Scene {
        WindowGroup {
            ThemedRoot { RootView() }
                .environment(session)
                .environment(theme)
                .environment(lang)
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
