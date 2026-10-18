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

    private var activeOrg: OrganizationSummary? {
        orgs?.first { $0.id == storedOrgId } ?? orgs?.first
    }

    var body: some View {
        Group {
            if let org = activeOrg {
                BoardView(org: org, orgs: orgs ?? [], userId: userId) { storedOrgId = $0 }
                    // 조직을 바꾸면 상태·채널을 통째로 새로 — 다른 조직의 행이 섞일 틈을 없앤다
                    .id(org.id)
            } else if orgs != nil {
                ContentUnavailableView {
                    Label("아직 조직이 없어요", systemImage: "person.3")
                } description: {
                    Text("웹에서 조직을 만들거나 초대를 받아 주세요.")
                } actions: {
                    Button("로그아웃") { Task { await session.signOut() } }
                }
            } else if let error {
                ContentUnavailableView {
                    Label(error, systemImage: "wifi.exclamationmark")
                } actions: {
                    Button("다시 시도") { Task { await loadOrgs() } }
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
