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
        SheetScaffold(title: "대신 처리") {
            Text(todo.title).font(.tlBodySm).foregroundStyle(tk.ink)
            Text("\(ownerName)님의 할 일이에요. 어떻게 처리했는지 한 줄 남겨 주세요.")
                .font(.tlCaption).foregroundStyle(tk.inkMuted).padding(.top, 4)

            TextField("", text: $note, prompt: placeholder("예) 거래처에 메일 보내뒀습니다. 회신 오면 공유할게요.", tk), axis: .vertical)
                .lineLimit(3...6)
                .focused($focused)
                .padding(.vertical, 12)
                .tlField()
                .padding(.top, 16)

            VStack(spacing: 8) {
                Button("완료 처리") {
                    onSubmit(trimmed)
                    dismiss()
                }
                .buttonStyle(TLButtonStyle())
                .disabled(trimmed.isEmpty)
                Button("취소") { dismiss() }.buttonStyle(TLButtonStyle(variant: .outline))
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
        SheetScaffold(title: "누구에게 넘길까요?") {
            Text(todo.title).font(.tlBodySm).foregroundStyle(tk.ink)
            if candidates.isEmpty {
                Text("넘길 팀원이 없어요. 팀 화면에서 먼저 초대해 주세요.")
                    .font(.tlCaption).foregroundStyle(tk.inkMuted).padding(.top, 16)
            } else {
                TextField("", text: $note, prompt: placeholder("한마디 남기기 (선택) — 예) 이거 좀 부탁해요", tk))
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
    let onSwitchOrg: (String) -> Void
    let onSignOut: () -> Void

    var body: some View {
        SheetScaffold(title: me?.displayName ?? "내 계정") {
            Text("조직").font(.tl(13, .semibold)).foregroundStyle(tk.inkSecondary).padding(.horizontal, 4).padding(.bottom, 8)
            VStack(spacing: 4) {
                ForEach(orgs) { o in
                    Button { onSwitchOrg(o.id) } label: {
                        HStack(spacing: 12) {
                            Text(o.name).font(.tl(15, .medium)).foregroundStyle(tk.ink)
                            Spacer()
                            if o.id == org.id {
                                Image(systemName: "checkmark").font(.system(size: 15, weight: .semibold)).foregroundStyle(tk.ink)
                            }
                        }
                        .padding(.horizontal, 12)
                        .frame(minHeight: 48)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(RowPress())
                    .disabled(o.id == org.id)
                }
            }
            Button("로그아웃", action: onSignOut)
                .buttonStyle(TLButtonStyle(variant: .outline))
                .frame(maxWidth: .infinity)
                .padding(.top, 16)
        }
        .presentationDetents([.medium, .large])
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
