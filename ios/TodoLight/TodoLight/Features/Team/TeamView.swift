import PhotosUI
import SwiftUI
import TodoLightKit

/// 조직(팀) 화면 — 웹 `app/(app)/team/TeamClient.tsx`.
/// 초대(방장·관리자) → 멤버 → 조직 설정(방장·관리자) → 조직 삭제(방장).
///
/// 멤버 목록에는 사람만 둔다. 역할 변경·내보내기 버튼을 행마다 늘어놓으면 멤버가 늘수록 목록이
/// 버튼밭이 되고 되돌릴 수 없는 빨간 버튼이 늘 떠 있게 된다 — 행을 누른 사람 것만 시트로 연다.
struct TeamView: View {
    @Environment(\.tokens) private var tk
    let org: OrganizationSummary
    let userId: String
    /// 이름·역할·멤버 수가 바뀌면 루트의 조직 목록을 다시 읽는다
    let onOrgsChanged: () async -> Void
    /// 조직을 지웠거나 나왔다 — 루트가 이 화면을 닫고 목록을 다시 읽는다
    let onLeftOrg: () async -> Void

    @State private var members: [MemberSummary] = []
    @State private var invites: [OrgInvite] = []
    @State private var loading = true
    @State private var email = ""
    @State private var orgName = ""
    @State private var webhook: String?
    @State private var savedWebhook: String?
    @State private var managing: MemberSummary?
    @State private var deleteOpen = false
    @State private var imageItem: PhotosPickerItem?
    @State private var uploading = false
    @State private var toast: String?
    @State private var busy = false

    private var api: APIClient { Backend.shared.api }
    private var isOwner: Bool { org.role == .owner }
    private var isManager: Bool { org.role == .owner || org.role == .admin }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header
                if isManager { inviteCard }
                membersCard
                if isManager { settingsCard }
                if isOwner { deleteCard }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 20)
        }
        .background(CanvasBackground())
        .overlay(alignment: .bottom) { Toast(message: $toast) }
        .task { await load() }
        .onAppear { orgName = org.name }
        .onChange(of: imageItem) { _, item in if let item { Task { await uploadImage(item) } } }
        .sheet(item: $managing) { m in
            MemberManageSheet(org: org, member: m, userId: userId) { message in
                toast = message
                await load()
                await onOrgsChanged()
            } onLeft: {
                await onLeftOrg()
            }
        }
        .sheet(isPresented: $deleteOpen) {
            DeleteOrgSheet(org: org) {
                await onLeftOrg()
            }
        }
    }

    // MARK: 머리 — 조직 아이콘 · 이름 · 멤버 수 (상단 바 제목은 '조직'이라 이름이 겹치지 않는다)

    private var header: some View {
        HStack(spacing: 12) {
            OrgIconView(name: org.name, imageUrl: org.imageUrl, seed: org.id, size: 48)
            VStack(alignment: .leading, spacing: 2) {
                Text(org.name).font(.tl(22, .bold)).foregroundStyle(tk.ink).lineLimit(1)
                Text(tr("멤버 \(org.memberCount)명", plural(org.memberCount, "member")))
                    .font(.tlCaption).foregroundStyle(tk.inkMuted)
            }
        }
    }

    // MARK: 초대

    private var inviteCard: some View {
        PageCard {
            Text(tr("팀원 초대", "Invite teammates")).font(.tlTitle).foregroundStyle(tk.ink)
            Text(tr("이메일을 넣으면 그 사람이 로그인할 때 초대장이 떠요.", "Enter an email — they see the invite next time they log in."))
                .font(.tlCaption).foregroundStyle(tk.inkMuted).padding(.top, 4)
            // 메일이 나가지 않는다는 사실을 초대하기 **전에** 말한다 — 보내고 나서 알면 늦다
            Text(tr("초대 메일은 따로 가지 않아요. 아직 가입하지 않은 사람에게는 직접 알려 줘야 해요.",
                    "No invitation email is sent. You will need to tell anyone who has not signed up yet."))
                .font(.tlCaption).foregroundStyle(tk.inkFaint).padding(.top, 2)
            HStack(spacing: 8) {
                TextField("", text: $email, prompt: placeholder("teammate@company.com", tk))
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.send)
                    .onSubmit { Task { await sendInvite() } }
                    .tlField()
                Button(tr("초대", "Invite")) { Task { await sendInvite() } }
                    .buttonStyle(TLButtonStyle())
                    .disabled(busy || email.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            .padding(.top, 12)

            if !invites.isEmpty {
                VStack(spacing: 6) {
                    ForEach(invites) { inviteRow($0) }
                }
                .padding(.top, 12)
            }
        }
    }

    private func inviteRow(_ inv: OrgInvite) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Text(inv.email).font(.tl(14)).foregroundStyle(tk.inkSecondary).lineLimit(1)
                Spacer()
                Text(Due.relative(Due.format(inv.createdAt))).font(.tl(11)).foregroundStyle(tk.inkFaint)
                Button(tr("취소", "Cancel")) { Task { await revoke(inv) } }
                    .buttonStyle(TLButtonStyle(variant: .outline, size: .sm))
            }
            // 아직 가입하지 않은 사람에게만 — 이미 쓰는 사람은 앱을 열면 초대장을 본다
            if inv.registered == false {
                Rectangle().fill(tk.hairline).frame(height: 1)
                HStack {
                    Text(tr("아직 가입하지 않았어요", "Has not signed up yet")).font(.tl(12)).foregroundStyle(tk.inkMuted)
                    Spacer()
                    // 공유 문구에 이메일을 싣되 링크에는 싣지 않는다 — 주소창·기록에 남을 이유가 없다
                    ShareLink(item: shareMessage(inv.email)) {
                        Text(tr("알려 주기", "Send it yourself")).font(.tl(13, .medium)).foregroundStyle(tk.ink)
                            .padding(.horizontal, 12).frame(height: 32)
                            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(tk.hairlineStrong))
                    }
                }
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
        .background(tk.canvasSoft, in: RoundedRectangle(cornerRadius: 12))
    }

    // MARK: 멤버

    private var membersCard: some View {
        PageCard {
            Text(tr("멤버", "Members")).font(.tlTitle).foregroundStyle(tk.ink)
            VStack(spacing: 2) {
                if loading {
                    ForEach(0..<3, id: \.self) { _ in RoundedRectangle(cornerRadius: 12).fill(tk.canvasSoft).frame(height: 48) }
                }
                ForEach(members) { m in
                    let rights = Rights(org: org, member: m, userId: userId)
                    Button { if rights.any { managing = m } } label: {
                        HStack(spacing: 12) {
                            AvatarView(member: m, size: 32)
                            HStack(spacing: 4) {
                                Text(m.displayName).font(.tl(15, .medium)).foregroundStyle(tk.ink).lineLimit(1)
                                if m.userId == userId { Text(tr("(나)", "(You)")).font(.tl(12)).foregroundStyle(tk.inkFaint) }
                            }
                            Spacer()
                            if m.role != .member { BadgeView(m.role == .owner ? tr("방장", "Owner") : tr("관리자", "Admin")) }
                            if rights.any {
                                Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(tk.inkFaint)
                            }
                        }
                        .padding(.horizontal, 8).frame(minHeight: 52)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(RowPressStyle())
                    .disabled(!rights.any)
                }
            }
            .padding(.top, 8)
        }
    }

    // MARK: 조직 설정 — 이미지 · 이름 · Discord

    private var settingsCard: some View {
        let nameChanged = !orgName.trimmingCharacters(in: .whitespaces).isEmpty && orgName.trimmingCharacters(in: .whitespaces) != org.name
        let hookChanged = webhook != nil && webhook != savedWebhook
        return PageCard {
            Text(tr("조직 설정", "Org settings")).font(.tlTitle).foregroundStyle(tk.ink)
            HStack(spacing: 12) {
                OrgIconView(name: org.name, imageUrl: org.imageUrl, seed: org.id, size: 48)
                PhotosPicker(selection: $imageItem, matching: .images) {
                    Text(uploading ? tr("올리는 중…", "Uploading…") : org.imageUrl == nil ? tr("이미지 올리기", "Upload image") : tr("이미지 바꾸기", "Change image"))
                }
                .buttonStyle(TLButtonStyle(variant: .outline, size: .sm, fill: true))
                .disabled(uploading)
                if org.imageUrl != nil {
                    Button(tr("삭제", "Delete")) { Task { await clearImage() } }
                        .buttonStyle(TLButtonStyle(variant: .outline, size: .sm))
                        .disabled(uploading)
                }
            }
            .padding(.top, 12)
            labeled(tr("이름", "Name")) {
                TextField("", text: $orgName).submitLabel(.done).tlField()
            }
            labeled(tr("Discord 알림", "Discord notifications")) {
                TextField("", text: Binding(get: { webhook ?? "" }, set: { webhook = $0 }),
                          prompt: placeholder("https://discord.com/api/webhooks/…", tk))
                    .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    .tlField()
                Text(tr("할 일 추가와 대신 처리를 이 채널로 알려요. 비우면 꺼져요.", "New to-dos and handoffs post here. Leave blank to turn it off."))
                    .font(.tlCaption).foregroundStyle(tk.inkFaint)
            }
            Button(tr("저장", "Save")) { Task { await saveSettings(rename: nameChanged, hook: hookChanged) } }
                .buttonStyle(TLButtonStyle(fill: true))
                .disabled(busy || !(nameChanged || hookChanged))
                .padding(.top, 16)
        }
    }

    /// 맨 아래 — 카드 제목과 버튼이 같은 말이라 제목은 빼고 설명 + 버튼만 둔다
    private var deleteCard: some View {
        PageCard {
            Text(tr("이 조직과 안에 있는 모든 것을 지워요. 되돌릴 수 없어요.", "Deletes this organization and everything in it. This cannot be undone."))
                .font(.tlCaption).foregroundStyle(tk.inkMuted)
            Button(tr("조직 삭제", "Delete organization")) { deleteOpen = true }
                .buttonStyle(TLButtonStyle(variant: .danger, fill: true))
                .padding(.top, 16)
        }
    }

    // MARK: 조각


    private func labeled<C: View>(_ label: String, @ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.tl(13, .medium)).foregroundStyle(tk.inkSecondary)
            content()
        }
        .padding(.top, 16)
    }


    // MARK: 동작

    private func load() async {
        async let m = api.fetchMembers(orgId: org.id)
        async let i: [OrgInvite]? = isManager ? try? await api.fetchOrgInvites(orgId: org.id) : nil
        async let w: String?? = isManager ? try? await api.fetchWebhook(orgId: org.id) : nil
        if let list = try? await m { members = list }
        if let list = await i { invites = list.filter { $0.status == .pending } }
        if let hook = await w {
            savedWebhook = hook ?? ""
            if webhook == nil { webhook = hook ?? "" }
        }
        loading = false
    }

    private func sendInvite() async {
        let value = email.trimmingCharacters(in: .whitespaces)
        guard !value.isEmpty else { return }
        busy = true
        defer { busy = false }
        do {
            let inv = try await api.invite(orgId: org.id, email: value)
            email = ""
            toast = inv.registered == false
                ? tr("초대했어요. 아직 가입하지 않은 분이라 직접 알려 주셔야 해요.", "Invited. They have not signed up yet, so you will need to tell them.")
                : tr("초대장을 보냈어요.", "Invite sent.")
            await load()
        } catch {
            toast = BoardStore.message(error)
        }
    }

    private func revoke(_ inv: OrgInvite) async {
        do {
            try await api.revokeInvite(inviteId: inv.id)
            invites.removeAll { $0.id == inv.id }
        } catch {
            toast = BoardStore.message(error)
        }
    }

    private func shareMessage(_ email: String) -> String {
        tr("\(org.name)에 초대했어요.\n\(email) 주소로 가입하면 초대장이 떠요.\n\(AppConfig.apiBaseURL.absoluteString)",
           "You are invited to \(org.name).\nSign up with \(email) and the invitation will be waiting.\n\(AppConfig.apiBaseURL.absoluteString)")
    }

    private func saveSettings(rename: Bool, hook: Bool) async {
        busy = true
        defer { busy = false }
        do {
            if rename { try await api.renameOrg(orgId: org.id, name: orgName.trimmingCharacters(in: .whitespaces)) }
            if hook, let webhook {
                try await api.updateWebhook(orgId: org.id, webhookUrl: webhook.trimmingCharacters(in: .whitespaces))
                savedWebhook = webhook
            }
            toast = tr("저장했어요", "Saved")
            if rename { await onOrgsChanged() }
        } catch {
            toast = BoardStore.message(error)
        }
    }

    /// 조직 아이콘 — 가운데를 잘라 256px로 줄여 `{orgId}/icon.webp` 하나에 덮어쓴다(웹과 같은 경로)
    private func uploadImage(_ item: PhotosPickerItem) async {
        imageItem = nil
        uploading = true
        defer { uploading = false }
        do {
            guard let data = try await item.loadTransferable(type: Data.self),
                  let jpeg = MeView.squareJPEG(data, side: 256) else { throw CancellationError() }
            let storage = Backend.shared.supabase.storage.from("org-images")
            let path = "\(org.id)/icon.webp"
            try await storage.upload(path, data: jpeg, options: .init(contentType: "image/jpeg", upsert: true))
            let url = try storage.getPublicURL(path: path).absoluteString + "?v=\(Int(Date().timeIntervalSince1970 * 1000))"
            try await api.updateOrgImage(orgId: org.id, imageUrl: url)
            toast = tr("조직 이미지를 바꿨어요.", "Org image updated.")
            await onOrgsChanged()
        } catch {
            toast = error is CancellationError ? tr("사진을 읽지 못했어요", "Couldn't read that photo") : BoardStore.message(error)
        }
    }

    private func clearImage() async {
        uploading = true
        defer { uploading = false }
        do {
            _ = try await Backend.shared.supabase.storage.from("org-images").remove(paths: ["\(org.id)/icon.webp"])
            try await api.updateOrgImage(orgId: org.id, imageUrl: nil)
            toast = tr("조직 이미지를 지웠어요", "Org image removed.")
            await onOrgsChanged()
        } catch {
            toast = BoardStore.message(error)
        }
    }
}

/// 이 멤버에게 내가 할 수 있는 것 — 웹 TeamClient의 canManage와 같은 규칙
private struct Rights {
    let isSelf: Bool
    let canChangeRole: Bool
    let canTransfer: Bool
    let canRemove: Bool
    var any: Bool { canChangeRole || canRemove }

    init(org: OrganizationSummary, member m: MemberSummary, userId: String) {
        isSelf = m.userId == userId
        let isOwner = org.role == .owner
        let isManager = org.role == .owner || org.role == .admin
        canChangeRole = isOwner && !isSelf && m.role != .owner
        // 넘길 수 있는 조건은 역할을 바꿀 수 있는 조건과 같다 — 방장인 내가, 나 아닌 멤버에게
        canTransfer = canChangeRole
        canRemove = isSelf ? m.role != .owner : isManager && m.role != .owner
    }
}

/// 멤버 관리 시트 — 역할 · 방장 넘기기 · 내보내기/나가기. 되돌릴 수 없는 둘은 이 안에서 한 번 더 묻는다.
private struct MemberManageSheet: View {
    @Environment(\.tokens) private var tk
    @Environment(\.dismiss) private var dismiss
    let org: OrganizationSummary
    let member: MemberSummary
    let userId: String
    let onChanged: (String) async -> Void
    let onLeft: () async -> Void

    @State private var confirm: Confirm?
    @State private var busy = false
    @State private var error: String?

    private enum Confirm { case kick, transfer }
    private var api: APIClient { Backend.shared.api }

    var body: some View {
        let rights = Rights(org: org, member: member, userId: userId)
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                AvatarView(member: member, size: 40)
                Text(member.displayName).font(.tlTitle).foregroundStyle(tk.ink)
            }
            .padding(.bottom, 4)

            switch confirm {
            case .transfer:
                confirmBox(
                    tr("\(member.displayName)님에게 방장을 넘겨요.", "Make \(member.displayName) the owner of this organization."),
                    tr("넘기면 나는 관리자가 돼요. 되돌리려면 새 방장이 다시 넘겨 줘야 해요.", "You become an admin. To undo it, the new owner has to transfer it back."),
                    action: tr("넘길래요", "Transfer")
                ) {
                    try await api.transferOwnership(orgId: org.id, newOwnerId: member.userId)
                    await onChanged(tr("방장을 넘겼어요.", "Ownership transferred."))
                }
            case .kick:
                confirmBox(
                    tr("\(member.displayName)님을 이 조직에서 내보내요.", "This removes \(member.displayName) from the org."),
                    tr("내보내면 이 조직의 보드를 더 이상 볼 수 없어요. 그동안 쌓인 할 일과 메모는 그대로 남아요. 다시 부르려면 초대를 새로 보내야 해요.",
                       "They'll lose access to this org's board. Their to-dos and notes stay as they are. You'd need to send a new invite to bring them back."),
                    action: tr("내보내기", "Remove")
                ) {
                    try await api.removeMember(orgId: org.id, userId: member.userId)
                    await onChanged(tr("멤버를 내보냈어요.", "Member removed."))
                }
            case nil:
                if rights.canChangeRole {
                    Button(member.role == .admin ? tr("관리자 해제", "Remove admin") : tr("관리자로", "Make admin")) {
                        run {
                            try await api.updateMemberRole(orgId: org.id, userId: member.userId, role: member.role == .admin ? .member : .admin)
                            await onChanged(tr("역할을 바꿨어요.", "Role updated."))
                        }
                    }
                    .buttonStyle(TLButtonStyle(variant: .outline, fill: true))
                }
                if rights.canTransfer {
                    Button(tr("방장 넘기기", "Transfer ownership")) { confirm = .transfer }
                        .buttonStyle(TLButtonStyle(variant: .outline, fill: true))
                }
                if rights.canRemove {
                    // 나가기는 나 자신의 일이라 한 번 더 묻지 않는다(웹과 같다)
                    Button(rights.isSelf ? tr("나가기", "Leave") : tr("내보내기", "Remove")) {
                        if rights.isSelf {
                            run {
                                try await api.removeMember(orgId: org.id, userId: member.userId)
                                await onLeft()
                            }
                        } else {
                            confirm = .kick
                        }
                    }
                    .buttonStyle(TLButtonStyle(variant: .danger, fill: true))
                }
            }
            if let error { Text(error).font(.tlCaption).foregroundStyle(tk.danger) }
        }
        .padding(20)
        .frame(maxHeight: .infinity, alignment: .top)
        .disabled(busy)
        .presentationDetents([.medium])
        .presentationBackground(tk.glassBgStrong)
        .presentationDragIndicator(.visible)
    }

    private func confirmBox(_ title: String, _ detail: String, action: String, _ work: @escaping () async throws -> Void) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                Text(title).font(.tlBodySm).foregroundStyle(tk.ink)
                Text(detail).font(.tlCaption).foregroundStyle(tk.inkMuted)
            }
            .padding(14)
            .background(tk.canvasSoft, in: RoundedRectangle(cornerRadius: 12))
            HStack(spacing: 8) {
                Button(tr("취소", "Cancel")) { confirm = nil }.buttonStyle(TLButtonStyle(variant: .outline, fill: true))
                Button(action) { run(work) }.buttonStyle(TLButtonStyle(variant: .danger, fill: true))
            }
        }
    }

    private func run(_ work: @escaping () async throws -> Void) {
        Task {
            busy = true
            do {
                try await work()
                dismiss()
            } catch {
                self.error = BoardStore.message(error)
            }
            busy = false
        }
    }
}

/// 조직 삭제 확인 — 아이콘과 이름을 보여 준다(조직 여러 개를 오가면 지금 어디에 서 있는지 헷갈린다).
/// "정말 삭제할까요?"만 묻지 않고 무엇이 사라지는지, 다른 멤버는 어떻게 되는지 적는다.
private struct DeleteOrgSheet: View {
    @Environment(\.tokens) private var tk
    @Environment(\.dismiss) private var dismiss
    let org: OrganizationSummary
    let onDeleted: () async -> Void
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 12) {
                OrgIconView(name: org.name, imageUrl: org.imageUrl, seed: org.id, size: 40)
                Text(org.name).font(.tlTitle).foregroundStyle(tk.ink)
            }
            VStack(alignment: .leading, spacing: 8) {
                Text(tr("이 조직의 할 일·메모·일정·가계부가 전부 사라져요. 할 일 지우기와 달리 되살릴 수 없어요.",
                        "Every todo, note, event, and ledger entry in this organization is gone. Unlike deleting a todo, this cannot be restored."))
                Text(tr("멤버 \(org.memberCount)명이 이 조직에서 나가게 돼요. 다시 모으려면 조직을 새로 만들어 초대해야 해요.",
                        "All \(org.memberCount) members lose access. Bringing them back means creating a new organization and inviting them again."))
            }
            .font(.tlBodySm).foregroundStyle(tk.ink)
            .padding(14)
            .background(tk.canvasSoft, in: RoundedRectangle(cornerRadius: 12))
            Text(tr("이 동작은 되돌릴 수 없어요.", "This cannot be undone.")).font(.tlCaption).foregroundStyle(tk.danger)
            if let error { Text(error).font(.tlCaption).foregroundStyle(tk.danger) }
            HStack(spacing: 8) {
                Button(tr("취소", "Cancel")) { dismiss() }.buttonStyle(TLButtonStyle(variant: .outline, fill: true))
                Button(busy ? tr("지우는 중…", "Deleting…") : tr("삭제할래요", "Delete")) {
                    Task {
                        busy = true
                        do {
                            try await Backend.shared.api.deleteOrg(orgId: org.id)
                            dismiss()
                            await onDeleted()
                        } catch {
                            self.error = BoardStore.message(error)
                        }
                        busy = false
                    }
                }
                .buttonStyle(TLButtonStyle(variant: .danger, fill: true))
            }
            .disabled(busy)
        }
        .padding(20)
        .frame(maxHeight: .infinity, alignment: .top)
        .presentationDetents([.medium, .large])
        .presentationBackground(tk.glassBgStrong)
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(busy)
    }
}

/// 조직 아이콘 — 사람 아바타와 구분되게 원이 아니라 둥근 사각형. 없으면 첫 글자 + 조직 id 색(웹 OrgIcon)
struct OrgIconView: View {
    let name: String
    let imageUrl: String?
    let seed: String
    var size: CGFloat = 32

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: size * 0.25, style: .continuous)
        Group {
            if let url = imageUrl.flatMap(URL.init(string:)) {
                AsyncImage(url: url) { $0.resizable().scaledToFill() } placeholder: { initial }
            } else {
                initial
            }
        }
        .frame(width: size, height: size)
        .clipShape(shape)
    }

    private var initial: some View {
        let c = AvatarView.color(key: nil, seed: seed)
        return ZStack {
            c.bg
            Text(BoardRules.initial(of: name)).font(.tl(size * 0.4, .semibold)).foregroundStyle(c.ink)
        }
    }
}

