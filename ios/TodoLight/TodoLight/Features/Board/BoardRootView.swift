import SwiftUI
import TodoLightKit

/// 로그인 뒤 첫 화면 — 조직을 고르고 그 조직의 보드를 띄운다.
/// 마지막으로 보던 조직을 기억한다(웹의 `todolight_active_org`와 같은 역할).
struct BoardRootView: View {
    let userId: String
    @Environment(SessionStore.self) private var session
    @AppStorage("activeOrgId") private var storedOrgId = ""
    @State private var orgs: [OrganizationSummary]?
    @State private var error: String?
    @State private var path: [AppRoute] = []
    /// 언어를 바꾸면 루트가 새로 만들어진다 — 내 설정에서 바꿨으면 거기로 돌아와야 한다
    @SceneStorage("route") private var savedRoute = ""

    private var activeOrg: OrganizationSummary? {
        orgs?.first { $0.id == storedOrgId } ?? orgs?.first
    }

    var body: some View {
        NavigationStack(path: $path) {
            content
                .toolbar(.hidden, for: .navigationBar)
                .onAppear { if savedRoute == "me", path.isEmpty { path = [.me] } }
                .onChange(of: path) { _, p in savedRoute = p.last == .me ? "me" : "" }
                .navigationDestination(for: AppRoute.self) { route in
                    switch route {
                    case .me: MeView(userId: userId).appTopBar(tr("내 설정", "Settings"))
                    }
                }
        }
    }

    @ViewBuilder private var content: some View {
        Group {
            if let org = activeOrg {
                BoardView(org: org, orgs: orgs ?? [], userId: userId, onSwitchOrg: { storedOrgId = $0 }, onOpen: { path.append($0) })
                    // 조직을 바꾸면 상태·채널을 통째로 새로 — 다른 조직의 행이 섞일 틈을 없앤다
                    .id(org.id)
            } else if orgs != nil {
                ContentUnavailableView {
                    Label(tr("아직 조직이 없어요", "No orgs yet"), systemImage: "person.3")
                } description: {
                    Text(tr("웹에서 조직을 만들거나 초대를 받아 주세요.", "Create an org on the web or accept an invite."))
                } actions: {
                    Button(tr("로그아웃", "Log out")) { Task { await session.signOut() } }
                }
            } else if let error {
                ContentUnavailableView {
                    Label(error, systemImage: "wifi.exclamationmark")
                } actions: {
                    Button(tr("다시 시도", "Try again")) { Task { await loadOrgs() } }
                }
            } else {
                ProgressView()
            }
        }
        .task { await loadOrgs() }
    }

    private func loadOrgs() async {
        error = nil
        do { orgs = try await Backend.shared.api.fetchMyOrgs() } catch { self.error = BoardStore.message(error) }
    }
}

/// 보드 밖의 화면들. 웹에서 팀·내 설정·새 조직이 따로 라우트인 것과 같은 묶음이다 —
/// 어쩌다 한 번 들어와 볼일 보고 나가는 화면이라 평범한 상단 바(뒤로가기)를 둔다.
enum AppRoute: Hashable {
    case me
}

extension View {
    /// 웹 팀·설정 화면의 상단 바 — 뒤로가기 + 제목. 색은 테마 토큰을 따른다.
    func appTopBar(_ title: String) -> some View {
        modifier(AppTopBar(title: title))
    }
}

private struct AppTopBar: ViewModifier {
    @Environment(\.tokens) private var tk
    let title: String

    func body(content: Content) -> some View {
        content
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(tk.glassBg, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
    }
}
