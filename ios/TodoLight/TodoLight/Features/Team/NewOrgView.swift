import SwiftUI
import TodoLightKit

/// 새 조직 만들기 — 웹 `app/(app)/orgs/new`. 만든 사람이 방장이 된다.
struct NewOrgView: View {
    @Environment(\.tokens) private var tk
    @Environment(\.dismiss) private var dismiss
    /// 만든 조직 id — 루트가 목록을 다시 읽고 그 조직으로 옮긴다
    let onCreated: (String) async -> Void

    @State private var name = ""
    @State private var busy = false
    @State private var error: String?
    @FocusState private var focused: Bool

    var body: some View {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        VStack(alignment: .leading, spacing: 12) {
            Text(tr("만든 사람이 방장이 돼요. 팀원은 이메일로 초대할 수 있어요.", "You become the owner. Invite teammates by email afterwards."))
                .font(.tlCaption).foregroundStyle(tk.inkMuted)
            VStack(alignment: .leading, spacing: 6) {
                Text(tr("조직 이름", "Org name")).font(.tl(13, .medium)).foregroundStyle(tk.inkSecondary)
                TextField("", text: $name, prompt: placeholder(tr("예) 마케팅팀", "e.g. Marketing"), tk))
                    .focused($focused)
                    .submitLabel(.done)
                    .onSubmit { Task { await create() } }
                    .tlField()
            }
            if let error { Text(error).font(.tlCaption).foregroundStyle(tk.danger) }
            Button(tr("만들기", "Create")) { Task { await create() } }
                .buttonStyle(TLButtonStyle(fill: true))
                .disabled(busy || trimmed.isEmpty)
                .padding(.top, 8)
            Spacer()
        }
        .padding(20)
        .background(CanvasBackground())
        .onAppear { focused = true }
    }

    private func create() async {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty, !busy else { return }
        busy = true
        defer { busy = false }
        do {
            let org = try await Backend.shared.api.createOrg(name: trimmed)
            dismiss()
            await onCreated(org.id)
        } catch {
            self.error = BoardStore.message(error)
        }
    }
}

/// 받은 초대 목록 — 프로필 시트 맨 위와 조직 0개 화면이 같이 쓴다.
/// 수락하면 그 조직으로 바로 옮긴다(웹과 같다).
struct ReceivedInvites: View {
    @Environment(\.tokens) private var tk
    let invites: [OrgInvite]
    /// 실패하면 이유를 돌려준다 — 이 목록 안에 적는다(바깥 토스트는 시트 뒤에 가려진다)
    let onRespond: (OrgInvite, Bool) async -> String?
    @State private var busyId: String?
    @State private var error: String?

    var body: some View {
        if !invites.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text(tr("받은 초대 \(invites.count)", "Invites \(invites.count)"))
                    .font(.tl(13, .semibold)).foregroundStyle(tk.inkSecondary).padding(.horizontal, 4)
                ForEach(invites) { inv in
                    VStack(alignment: .leading, spacing: 10) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(inv.orgName ?? tr("이름 없는 조직", "Unnamed org")).font(.tl(15, .semibold)).foregroundStyle(tk.ink)
                            Text(tr("\(inv.inviterName ?? "누군가")님이 초대 · \(Due.relative(Due.format(inv.createdAt)))",
                                    "Invited by \(inv.inviterName ?? "someone") · \(Due.relative(Due.format(inv.createdAt)))"))
                                .font(.tl(12)).foregroundStyle(tk.inkFaint)
                        }
                        HStack(spacing: 8) {
                            Button(tr("거절", "Decline")) { respond(inv, false) }
                                .buttonStyle(TLButtonStyle(variant: .outline, size: .sm, fill: true))
                            Button(tr("수락", "Accept")) { respond(inv, true) }
                                .buttonStyle(TLButtonStyle(size: .sm, fill: true))
                        }
                        .disabled(busyId != nil)
                    }
                    .padding(14)
                    .background(tk.accentSoft, in: RoundedRectangle(cornerRadius: 14))
                }
                if let error { Text(error).font(.tlCaption).foregroundStyle(tk.danger).padding(.horizontal, 4) }
            }
        }
    }

    private func respond(_ inv: OrgInvite, _ accept: Bool) {
        Task {
            busyId = inv.id
            error = await onRespond(inv, accept)
            busyId = nil
        }
    }
}
