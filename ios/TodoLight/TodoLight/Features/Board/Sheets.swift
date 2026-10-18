import SwiftUI
import TodoLightKit

/// 시트 공통 껍데기 — 웹 BottomSheet(제목 + 내용, glass-bg-strong 배경)와 같은 모양.
private struct SheetScaffold<Content: View>: View {
    @Environment(\.tokens) private var tk
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text(title).font(.tlTitle).foregroundStyle(tk.ink).padding(.bottom, 12)
                content
            }
            .padding(20)
        }
        .scrollBounceBehavior(.basedOnSize)
        .presentationBackground(tk.glassBgStrong)
        .presentationDragIndicator(.visible)
        .presentationCornerRadius(24)
    }
}

/// 대신 처리 — 메모가 필수다. 남의 할 일이 말없이 사라지면 주인이 상황을 모른다.
struct HandoffSheet: View {
    @Environment(\.tokens) private var tk
    let todo: Todo
    let ownerName: String
    let onSubmit: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var note = ""
    @FocusState private var focused: Bool

    var body: some View {
        let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)
        SheetScaffold(title: tr("대신 처리", "Handle for them")) {
            Text(todo.title).font(.tlBodySm).foregroundStyle(tk.ink)
            Text(tr("\(ownerName)님의 할 일이에요. 어떻게 처리했는지 한 줄 남겨 주세요.", "This is \(ownerName)'s to-do. Leave a line about how you handled it."))
                .font(.tlCaption).foregroundStyle(tk.inkMuted).padding(.top, 4)

            TextField("", text: $note, prompt: placeholder(tr("예) 거래처에 메일 보내뒀습니다. 회신 오면 공유할게요.", "e.g. Emailed the client. Will share when they reply."), tk), axis: .vertical)
                .lineLimit(3...6)
                .focused($focused)
                .padding(.vertical, 12)
                .tlField()
                .padding(.top, 16)

            VStack(spacing: 8) {
                Button(tr("완료 처리", "Mark done")) {
                    onSubmit(trimmed)
                    dismiss()
                }
                .buttonStyle(TLButtonStyle(fill: true))
                .disabled(trimmed.isEmpty)
                Button(tr("취소", "Cancel")) { dismiss() }.buttonStyle(TLButtonStyle(variant: .outline, fill: true))
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 12)
        }
        .onAppear { focused = true }
        .presentationDetents([.medium, .large])
    }
}

/// 넘기기 — 사람을 누르는 순간 넘어간다(실행취소로 되돌린다). 메모 칸이 **위에** 있다:
/// 쓰고 나서 누르는 순서라야 한다.
struct GiveSheet: View {
    @Environment(\.tokens) private var tk
    let todo: Todo
    let candidates: [MemberSummary]
    let onPick: (MemberSummary, String?) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var note = ""

    var body: some View {
        SheetScaffold(title: tr("누구에게 넘길까요?", "Hand off to whom?")) {
            Text(todo.title).font(.tlBodySm).foregroundStyle(tk.ink)
            if candidates.isEmpty {
                Text(tr("넘길 팀원이 없어요. 팀 화면에서 먼저 초대해 주세요.", "No one to hand off to yet. Invite teammates from the Team page first."))
                    .font(.tlCaption).foregroundStyle(tk.inkMuted).padding(.top, 16)
            } else {
                TextField("", text: $note, prompt: placeholder(tr("한마디 남기기 (선택) — 예) 이거 좀 부탁해요", "Add a note (optional) — e.g. Could you take this?"), tk))
                    .tlField()
                    .padding(.top, 16)
                VStack(spacing: 4) {
                    ForEach(candidates) { m in
                        Button {
                            let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)
                            onPick(m, trimmed.isEmpty ? nil : trimmed)
                            dismiss()
                        } label: {
                            HStack(spacing: 12) {
                                AvatarView(member: m, size: 32)
                                Text(m.displayName).font(.tlBodySm).foregroundStyle(tk.ink)
                                Spacer()
                            }
                            .padding(.horizontal, 8)
                            .padding(.vertical, 10)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(RowPress())
                    }
                }
                .padding(.top, 12)
            }
        }
        .presentationDetents([.medium, .large])
    }
}

/// 프로필 시트 — 웹 아바타 메뉴: 조직 전환 → 로그아웃. 조직을 바꾸는 곳이 한 군데여야 "어디서 하더라"가 없다.
struct ProfileSheet: View {
    @Environment(\.tokens) private var tk
    let me: MemberSummary?
    let org: OrganizationSummary
    let orgs: [OrganizationSummary]
    let invites: [OrgInvite]
    let onRespond: (OrgInvite, Bool) async -> String?
    let onSwitchOrg: (String) -> Void
    let onOpen: (AppRoute) -> Void
    let onSignOut: () -> Void

    var body: some View {
        // 받은 초대 → 조직 전환 → 관리 → 로그아웃 (웹 아바타 메뉴와 같은 순서)
        SheetScaffold(title: me?.displayName ?? tr("내 계정", "My account")) {
            ReceivedInvites(invites: invites, onRespond: onRespond).padding(.bottom, invites.isEmpty ? 0 : 20)

            Text(tr("조직", "Orgs")).font(.tl(13, .semibold)).foregroundStyle(tk.inkSecondary).padding(.horizontal, 4).padding(.bottom, 8)
            VStack(spacing: 4) {
                ForEach(orgs) { o in
                    Button { onSwitchOrg(o.id) } label: {
                        HStack(spacing: 12) {
                            OrgIconView(name: o.name, imageUrl: o.imageUrl, seed: o.id, size: 32)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(o.name).font(.tl(15, .medium)).foregroundStyle(tk.ink).lineLimit(1)
                                Text(tr("멤버 \(o.memberCount)명 · \(roleLabel(o.role))", "\(plural(o.memberCount, "member")) · \(roleLabel(o.role))"))
                                    .font(.tl(12)).foregroundStyle(tk.inkFaint)
                            }
                            Spacer()
                            if o.id == org.id {
                                Image(systemName: "checkmark").font(.system(size: 15, weight: .semibold)).foregroundStyle(tk.ink)
                            }
                        }
                        .padding(.horizontal, 12)
                        .frame(minHeight: 56)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(RowPress())
                    .disabled(o.id == org.id)
                }
                Button { onOpen(.newOrg) } label: {
                    Text(tr("+ 새 조직 만들기", "+ New org")).font(.tl(15, .medium)).foregroundStyle(tk.inkMuted)
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(tk.hairlineStrong, style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
                }
                .buttonStyle(RowPress())
                .padding(.top, 4)
            }
            Text(tr("관리", "Manage")).font(.tl(13, .semibold)).foregroundStyle(tk.inkSecondary)
                .padding(.horizontal, 4).padding(.top, 20).padding(.bottom, 8)
            manageRow(tr("멤버 · 조직 설정", "Members & org settings")) { onOpen(.team) }
            manageRow(tr("내 설정", "Settings")) { onOpen(.me) }

            Button(tr("로그아웃", "Log out"), action: onSignOut)
                .buttonStyle(TLButtonStyle(variant: .outline, fill: true))
                .padding(.top, 16)
        }
        .presentationDetents([.medium, .large])
    }

    private func manageRow(_ label: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack {
                Text(label).font(.tl(15, .medium)).foregroundStyle(tk.ink)
                Spacer()
                Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(tk.inkFaint)
            }
            .frame(maxWidth: .infinity, minHeight: 48)
            .padding(.horizontal, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(RowPress())
    }

    private func roleLabel(_ role: MemberRole) -> String {
        switch role {
        case .owner: tr("방장", "Owner")
        case .admin: tr("관리자", "Admin")
        case .member: tr("팀원", "Member")
        }
    }
}

/// 목록 행 — 누르는 동안만 canvas-soft로(웹 active:bg-canvas-soft)
private struct RowPress: ButtonStyle {
    @Environment(\.tokens) private var tk
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(configuration.isPressed ? tk.canvasSoft : .clear, in: RoundedRectangle(cornerRadius: 12))
    }
}
