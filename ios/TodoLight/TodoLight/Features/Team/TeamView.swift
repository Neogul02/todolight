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
    /// 서버에 있는 이름 — 이것과 다를 때만 보낸다
    @State private var savedOrgName = ""
    @State private var managing: MemberSummary?
    @State private var deleteOpen = false
    @State private var imageItem: PhotosPickerItem?
    @State private var uploading = false
    @State private var toast: String?
    @State private var busy = false
    @State private var plan: OrgPlan?
    @State private var proOpen = false

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
        .onAppear { orgName = org.name; savedOrgName = org.name }
        // 조직 이름도 내 설정의 이름처럼 저장 버튼 없이 — 입력이 멎으면(700ms) 조용히 보낸다
        .task(id: orgName) { await saveNameAfterPause() }
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
        .sheet(isPresented: $proOpen, onDismiss: { Task { await load() } }) {
            ProSheet(userId: userId)
        }
    }

    // MARK: 머리 — 조직 아이콘 · 이름 · 멤버 수 (상단 바 제목은 '조직'이라 이름이 겹치지 않는다)

    private var header: some View {
        HStack(spacing: 12) {
            OrgIconView(name: org.name, imageUrl: org.imageUrl, seed: org.id, size: 48)
            VStack(alignment: .leading, spacing: 2) {
                Text(org.name).font(.tl(22, .bold)).foregroundStyle(tk.ink).lineLimit(1)
                Text(tr("멤버 \(org.memberCount)명", plural(org.memberCount, "member"), "メンバー \(org.memberCount)人"))
                    .font(.tlCaption).foregroundStyle(tk.inkMuted)
            }
        }
    }

    // MARK: 초대

    private var inviteCard: some View {
        PageCard {
            Text(tr("팀원 초대", "Invite teammates", "メンバーを招待")).font(.tlTitle).foregroundStyle(tk.ink)
            if let plan, plan.isFull, let limit = plan.seatLimit {
                // 무료 조직의 인원이 다 찼다 — 서버도 같은 규칙으로 막는다(문구만 미리 보여 준다)
                Text(isOwner
                     ? tr("무료 조직은 \(limit)명까지예요. Pro로 올리면 더 초대할 수 있어요.",
                          "Free orgs can have up to \(limit) people. Upgrade to Pro to invite more.", "無料のチームは\(limit)人までです。Proにするとさらに招待できます。")
                     : tr("무료 조직은 \(limit)명까지예요. 방장이 Pro를 쓰면 더 초대할 수 있어요.",
                          "Free orgs can have up to \(limit) people. The owner can upgrade to Pro to invite more.", "無料のチームは\(limit)人までです。オーナーがProを使うと、さらに招待できます。"))
                    .font(.tlBodySm).foregroundStyle(tk.inkSecondary).padding(.top, 4)
                if isOwner {
                    Button(tr("Pro 알아보기", "See Pro", "Proを詳しく見る")) { proOpen = true }
                        .buttonStyle(TLButtonStyle(variant: .primary, fill: true))
                        .padding(.top, 12)
                }
            } else {
                inviteForm
            }

            if !invites.isEmpty {
                VStack(spacing: 6) {
                    ForEach(invites) { inviteRow($0) }
                }
                .padding(.top, 12)
            }
        }
    }

    @ViewBuilder
    private var inviteForm: some View {
            // 메일이 나가지 않는다는 사실을 초대하기 **전에** 말한다 — 보내고 나서 알면 늦다
            Text(tr("초대 메일은 가지 않아요. 아직 가입 안 한 사람에게는 직접 알려 주세요.",
                    "No invite email is sent. Let people who haven't signed up know yourself.", "招待メールは送られません。まだ登録していない人には、直接知らせてください。"))
                .font(.tlCaption).foregroundStyle(tk.inkMuted).padding(.top, 4)
            HStack(spacing: 8) {
                TextField("", text: $email, prompt: placeholder("teammate@company.com", tk))
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.send)
                    .onSubmit { Task { await sendInvite() } }
                    .tlField()
                Button(tr("초대", "Invite", "招待")) { Task { await sendInvite() } }
                    .buttonStyle(TLButtonStyle())
                    .disabled(busy || email.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            .padding(.top, 12)
    }

    private func inviteRow(_ inv: OrgInvite) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Text(inv.email).font(.tl(14)).foregroundStyle(tk.inkSecondary).lineLimit(1)
                Spacer()
                Text(Due.relative(Due.format(inv.createdAt))).font(.tl(11)).foregroundStyle(tk.inkFaint)
                Button(tr("취소", "Cancel", "キャンセル")) { Task { await revoke(inv) } }
                    .buttonStyle(TLButtonStyle(variant: .outline, size: .sm))
            }
            // 아직 가입하지 않은 사람에게만 — 이미 쓰는 사람은 앱을 열면 초대장을 본다
            if inv.registered == false {
                Rectangle().fill(tk.hairline).frame(height: 1)
                HStack {
                    Text(tr("아직 가입하지 않았어요", "Has not signed up yet", "まだ登録していません")).font(.tl(12)).foregroundStyle(tk.inkMuted)
                    Spacer()
                    // 공유 문구에 이메일을 싣되 링크에는 싣지 않는다 — 주소창·기록에 남을 이유가 없다
                    ShareLink(item: shareMessage(inv.email)) {
                        Text(tr("알려 주기", "Send it yourself", "知らせる")).font(.tl(13, .medium)).foregroundStyle(tk.ink)
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
            Text(tr("멤버", "Members", "メンバー")).font(.tlTitle).foregroundStyle(tk.ink)
            VStack(spacing: 2) {
                if loading {
                    VStack(spacing: 2) {
                        ForEach(0..<3, id: \.self) { _ in RoundedRectangle(cornerRadius: 12).fill(tk.canvasSoft).frame(height: 48) }
                    }
                    .skeletonPulse()
                }
                ForEach(members) { m in
                    let rights = Rights(org: org, member: m, userId: userId)
                    Button { if rights.any { managing = m } } label: {
                        HStack(spacing: 12) {
                            AvatarView(member: m, size: 32)
                            HStack(spacing: 4) {
                                Text(m.displayName).font(.tl(15, .medium)).foregroundStyle(tk.ink).lineLimit(1)
                                if m.userId == userId { Text(tr("(나)", "(You)", "（自分）")).font(.tl(12)).foregroundStyle(tk.inkFaint) }
                            }
                            Spacer()
                            if m.role != .member { BadgeView(m.role == .owner ? tr("방장", "Owner", "オーナー") : tr("관리자", "Admin", "管理者")) }
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

    // MARK: 조직 설정 — 이미지 · 이름

    private var settingsCard: some View {
        return PageCard {
            Text(tr("조직 설정", "Org settings", "チーム設定")).font(.tlTitle).foregroundStyle(tk.ink)
            // 아이콘을 누르면 고르기·지우기가 뜬다(EditablePhoto) — 이름 칸과 한 줄에 선다
            HStack(alignment: .bottom, spacing: 14) {
                EditablePhoto(hasPhoto: org.imageUrl != nil, uploading: uploading, item: $imageItem,
                              onRemove: { Task { await clearImage() } }) {
                    OrgIconView(name: org.name, imageUrl: org.imageUrl, seed: org.id, size: 56)
                }
                VStack(alignment: .leading, spacing: 6) {
                    Text(tr("이름", "Name", "名前")).font(.tl(13, .medium)).foregroundStyle(tk.inkSecondary)
                    TextField("", text: $orgName).submitLabel(.done).tlField()
                }
            }
            .padding(.top, 12)
        }
    }

    /// 맨 아래 — 버튼 하나만(웹과 같다). 무엇이 사라지는지는 확인 시트가 말한다
    private var deleteCard: some View {
        Button(tr("조직 삭제", "Delete org", "チームを削除")) { deleteOpen = true }
            .buttonStyle(TLButtonStyle(variant: .danger, fill: true))
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
        if let list = try? await m { members = list }
        if let list = await i { invites = list.filter { $0.status == .pending } }
        if isManager { plan = try? await api.fetchOrgPlan(orgId: org.id) }
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
                ? tr("초대했어요. 아직 가입하지 않은 분이라 직접 알려 주셔야 해요.", "Invited. They have not signed up yet, so you will need to tell them.", "招待しました。まだ登録していない方なので、直接知らせる必要があります。")
                : tr("초대장을 보냈어요.", "Invite sent.", "招待を送りました。")
            await load()
        } catch {
            toast = BoardStore.message(error)
        }
    }

    private func revoke(_ inv: OrgInvite) async {
        do {
            try await api.revokeInvite(inviteId: inv.id)
            invites.removeAll { $0.id == inv.id }
            plan = try? await api.fetchOrgPlan(orgId: org.id)
        } catch {
            toast = BoardStore.message(error)
        }
    }

    private func shareMessage(_ email: String) -> String {
        tr("\(org.name)에 초대했어요.\n\(email) 주소로 가입하면 초대장이 떠요.\n\(AppConfig.apiBaseURL.absoluteString)",
           "You are invited to \(org.name).\nSign up with \(email) and the invitation will be waiting.\n\(AppConfig.apiBaseURL.absoluteString)", "\(org.name)に招待しました。\n\(email) で登録すると招待が表示されます。\n\(AppConfig.apiBaseURL.absoluteString)")
    }

    /// 비우면 보내지 않는다(조직 이름은 비울 수 없다). 실패하면 이유를 알리고 서버 이름으로 되돌린다.
    private func saveNameAfterPause() async {
        let next = orgName.trimmingCharacters(in: .whitespaces)
        guard !next.isEmpty, next != savedOrgName else { return }
        try? await Task.sleep(for: .milliseconds(700))
        if Task.isCancelled { return }
        let before = savedOrgName
        savedOrgName = next
        do {
            try await api.renameOrg(orgId: org.id, name: next)
            await onOrgsChanged()
        } catch {
            savedOrgName = before
            orgName = before
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
            toast = tr("조직 이미지를 바꿨어요.", "Org image updated.", "チームの画像を変更しました。")
            await onOrgsChanged()
        } catch {
            toast = error is CancellationError ? tr("사진을 읽지 못했어요", "Couldn't read that photo", "写真を読み込めませんでした") : BoardStore.message(error)
        }
    }

    private func clearImage() async {
        uploading = true
        defer { uploading = false }
        do {
            _ = try await Backend.shared.supabase.storage.from("org-images").remove(paths: ["\(org.id)/icon.webp"])
            try await api.updateOrgImage(orgId: org.id, imageUrl: nil)
            toast = tr("조직 이미지를 지웠어요.", "Org image removed.", "チームの画像を削除しました。")
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
                    tr("\(member.displayName)님에게 방장을 넘겨요.", "Make \(member.displayName) the owner of this org.", "\(member.displayName)さんにオーナーを引き継ぎます。"),
                    tr("넘기면 나는 관리자가 돼요. 되돌리려면 새 방장이 다시 넘겨 줘야 해요.", "You become an admin. To undo it, the new owner has to transfer it back.", "引き継ぐと、自分は管理者になります。元に戻すには、新しいオーナーにもう一度引き継いでもらう必要があります。"),
                    action: tr("넘길래요", "Transfer", "引き継ぐ")
                ) {
                    try await api.transferOwnership(orgId: org.id, newOwnerId: member.userId)
                    await onChanged(tr("방장을 넘겼어요.", "Ownership transferred.", "オーナーを引き継ぎました。"))
                }
            case .kick:
                confirmBox(
                    tr("\(member.displayName)님을 이 조직에서 내보내요.", "This removes \(member.displayName) from the org.", "\(member.displayName)さんをこのチームから外します。"),
                    tr("내보내면 이 조직의 보드를 더 이상 볼 수 없어요. 그동안 쌓인 할 일과 메모는 그대로 남아요. 다시 부르려면 초대를 새로 보내야 해요.",
                       "They'll lose access to this org's board. Their to-dos and notes stay as they are. You'd need to send a new invite to bring them back.", "外すと、このチームのボードは見られなくなります。これまでのタスクとメモはそのまま残ります。また加えるには、招待を新しく送る必要があります。"),
                    action: tr("내보내기", "Remove", "外す")
                ) {
                    try await api.removeMember(orgId: org.id, userId: member.userId)
                    await onChanged(tr("멤버를 내보냈어요.", "Member removed.", "メンバーを外しました。"))
                }
            case nil:
                if rights.canChangeRole {
                    Button(member.role == .admin ? tr("관리자 해제", "Remove admin", "管理者を外す") : tr("관리자로", "Make admin", "管理者にする")) {
                        run {
                            try await api.updateMemberRole(orgId: org.id, userId: member.userId, role: member.role == .admin ? .member : .admin)
                            await onChanged(tr("역할을 바꿨어요.", "Role updated.", "役割を変更しました。"))
                        }
                    }
                    .buttonStyle(TLButtonStyle(variant: .outline, fill: true))
                }
                if rights.canTransfer {
                    Button(tr("방장 넘기기", "Transfer ownership", "オーナーを引き継ぐ")) { confirm = .transfer }
                        .buttonStyle(TLButtonStyle(variant: .outline, fill: true))
                }
                if rights.canRemove {
                    // 나가기는 나 자신의 일이라 한 번 더 묻지 않는다(웹과 같다)
                    Button(rights.isSelf ? tr("나가기", "Leave", "抜ける") : tr("내보내기", "Remove", "外す")) {
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
                Button(tr("취소", "Cancel", "キャンセル")) { confirm = nil }.buttonStyle(TLButtonStyle(variant: .outline, fill: true))
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
                        "Every to-do, note, event, and ledger entry in this org is gone. Unlike deleting a to-do, this cannot be restored.", "このチームのタスク・メモ・予定・支出がすべて消えます。タスクの削除とは違い、元に戻せません。"))
                Text(tr("멤버 \(org.memberCount)명이 이 조직에서 나가게 돼요. 다시 모으려면 조직을 새로 만들어 초대해야 해요.",
                        "\(org.memberCount == 1 ? "The 1 member loses" : "All \(org.memberCount) members lose") access. Bringing them back means creating a new org and inviting them again.", "メンバー\(org.memberCount)人がこのチームから外れます。また集まるには、チームを新しく作って招待し直す必要があります。"))
            }
            .font(.tlBodySm).foregroundStyle(tk.ink)
            .padding(14)
            .background(tk.canvasSoft, in: RoundedRectangle(cornerRadius: 12))
            Text(tr("이 동작은 되돌릴 수 없어요.", "This cannot be undone.", "この操作は元に戻せません。")).font(.tlCaption).foregroundStyle(tk.danger)
            if let error { Text(error).font(.tlCaption).foregroundStyle(tk.danger) }
            HStack(spacing: 8) {
                Button(tr("취소", "Cancel", "キャンセル")) { dismiss() }.buttonStyle(TLButtonStyle(variant: .outline, fill: true))
                Button(busy ? tr("지우는 중…", "Deleting…", "削除中…") : tr("삭제할래요", "Delete", "削除する")) {
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

