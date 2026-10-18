import SwiftUI

@main
struct TodoLightApp: App {
    @State private var session = SessionStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
        }
    }
}

/// 로그인 여부로만 가른다.
struct RootView: View {
    @Environment(SessionStore.self) private var session

    var body: some View {
        switch session.state {
        case .loading:
            ProgressView()
        case .signedOut:
            LoginView()
        case .signedIn(let userId):
            BoardRootView(userId: userId)
        }
    }
}
