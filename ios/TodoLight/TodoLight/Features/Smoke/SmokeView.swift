import SwiftUI
import TodoLightKit

/// 서버 경로가 끝까지 붙었는지 보는 임시 화면 — 보드가 이 자리를 대신한다(docs/ios-m2-setup.md §5).
struct SmokeView: View {
    @Environment(SessionStore.self) private var session
    @State private var text = "불러오는 중…"

    var body: some View {
        VStack(spacing: 20) {
            Text(text).font(.title3).multilineTextAlignment(.center)
            Button("로그아웃") { Task { await session.signOut() } }
        }
        .padding()
        .task {
            do {
                async let me = Backend.shared.api.fetchMyProfile()
                async let orgs = Backend.shared.api.fetchMyOrgs()
                let (profile, list) = try await (me, orgs)
                text = "\(profile.displayName) · 조직 \(list.count)개"
            } catch {
                text = "\(error)"
            }
        }
    }
}
