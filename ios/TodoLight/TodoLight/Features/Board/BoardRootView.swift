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
    /// 받은 초대 — 프로필 시트와 조직 0개 화면이 같이 본다. 있으면 탭바 아바타에 빨간 점
    @State private var invites: [OrgInvite] = []
    /// 푸시한 화면에서 보드로 돌아올 때마다 올린다 — BoardView가 그 신호로 다시 읽는다
    @State private var refreshToken = 0
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
                .onChange(of: path) { old, p in
                    savedRoute = p.last == .me ? "me" : ""
                    if p.isEmpty && !old.isEmpty { refreshToken += 1 }
                }
                .navigationDestination(for: AppRoute.self) { route in
                    switch route {
                    case .me: MeView(userId: userId).appTopBar(tr("내 설정", "Settings"))
                    case .team:
                        if let org = activeOrg {
                            TeamView(org: org, userId: userId, onOrgsChanged: loadOrgs, onLeftOrg: leftOrg)
                                .appTopBar(tr("조직", "Org"))
                        }
                    case .newOrg:
                        NewOrgView { id in
                            // 고를 조직을 먼저 정한다 — 목록이 먼저 바뀌면 첫 조직의 보드가 잠깐 떴다가 버려진다
                            storedOrgId = id
                            await loadOrgs()
                        }
                        .appTopBar(tr("새 조직 만들기", "New org"))
                    }
                }
        }
    }

    @ViewBuilder private var content: some View {
        Group {
            if let org = activeOrg {
                BoardView(org: org, orgs: orgs ?? [], userId: userId, invites: invites, refreshToken: refreshToken,
                          onSwitchOrg: { storedOrgId = $0 }, onOpen: { path.append($0) }, onRespond: respond)
                    // 조직을 바꾸면 상태·채널을 통째로 새로 — 다른 조직의 행이 섞일 틈을 없앤다
                    .id(org.id)
            } else if orgs != nil {
                NoOrgView(invites: invites, onRespond: respond,
                          onCreate: { path.append(.newOrg) }, onSignOut: { Task { await session.signOut() } })
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
        async let list = Backend.shared.api.fetchMyOrgs()
        async let mine = try? Backend.shared.api.fetchMyInvites()
        do { orgs = try await list } catch { self.error = BoardStore.message(error) }
        if let mine = await mine { invites = mine.filter { $0.status == .pending } }
    }

    /// 수락하면 그 조직으로 바로 옮긴다 — 조직을 바꾸는 곳과 초대를 받는 곳이 같아야 "어디서 하더라"가 없다.
    /// 실패하면 이유를 돌려준다(초대 목록이 그 자리에 적는다).
    private func respond(_ inv: OrgInvite, _ accept: Bool) async -> String? {
        do {
            let res = try await Backend.shared.api.respondToInvite(inviteId: inv.id, accept: accept)
            invites.removeAll { $0.id == inv.id }
            if accept, let id = res.orgId { storedOrgId = id }
            await loadOrgs()
            return nil
        } catch {
            return BoardStore.message(error)
        }
    }

    /// 조직을 지웠거나 나왔다 — 조직 화면부터 닫고 목록을 다시 읽는다. 순서를 뒤집으면 마지막 조직일 때
    /// 조직 화면이 먼저 사라져(활성 조직이 없다) 닫을 화면도 없이 빈 페이지에 남는다.
    private func leftOrg() async {
        path.removeAll()
        await loadOrgs()
    }
}

/// 보드 밖의 화면들. 웹에서 팀·내 설정·새 조직이 따로 라우트인 것과 같은 묶음이다 —
/// 어쩌다 한 번 들어와 볼일 보고 나가는 화면이라 평범한 상단 바(뒤로가기)를 둔다.
enum AppRoute: Hashable {
    case me, team, newOrg
}

/// 조직이 하나도 없을 때 — 막다른 길이 되지 않게 받은 초대와 새 조직 만들기를 같이 둔다
private struct NoOrgView: View {
    @Environment(\.tokens) private var tk
    let invites: [OrgInvite]
    let onRespond: (OrgInvite, Bool) async -> String?
    let onCreate: () -> Void
    let onSignOut: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(tr("먼저 조직이 필요해요", "You need an org first")).font(.tl(22, .bold)).foregroundStyle(tk.ink)
                    Text(tr("할 일은 조직 단위로 나눠 봐요. 조직을 만들거나 받은 초대를 수락해 주세요.",
                            "To-dos are shared within an org. Create one or accept an invite."))
                        .font(.tlBodySm).foregroundStyle(tk.inkMuted)
                }
                ReceivedInvites(invites: invites, onRespond: onRespond)
                Button(tr("조직 만들기", "Create an org"), action: onCreate).buttonStyle(TLButtonStyle(fill: true))
                Button(tr("로그아웃", "Log out"), action: onSignOut).buttonStyle(TLButtonStyle(variant: .outline, fill: true))
            }
            .padding(24)
            .padding(.top, 40)
        }
        .background(CanvasBackground())
    }
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
