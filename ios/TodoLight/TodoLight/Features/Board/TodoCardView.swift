import SwiftUI
import TodoLightKit

/// 할 일 카드 — 웹 `app/(app)/board/TodoCard.tsx`와 같은 모양·순서.
///
/// 체크 · 제목 · X 세 칸은 위 패딩(8)을 맞춰 첫 줄 기준선이 겹친다. 그 패딩이 곧 터치 영역이다.
/// 펼친 순서는 메모 목록 → 메모 입력 → 동작 줄(마감 알약 · 제목 수정 · 넘기기 · 같이하기).
struct TodoCardView: View {
    @Environment(\.tokens) private var tk
    @Environment(\.accessibilityReduceMotion) private var reduce
    let store: BoardStore
    let todo: Todo
    let open: Bool
    let onToggleOpen: () -> Void
    let onCheck: () -> Void
    let onGive: () -> Void

    private var done: Bool { todo.status == .done }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 0) {
                Button(action: onCheck) {
                    CheckBox(checked: done)
                        .padding(.vertical, 8)
                        .padding(.trailing, 10)
                }
                .buttonStyle(PressScale())
                .accessibilityLabel(done ? tr("완료 취소", "Mark not done") : tr("완료", "Mark done"))
                .sensoryFeedback(.impact(weight: .light), trigger: done) { _, now in now }

                Button(action: onToggleOpen) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(todo.title)
                            .font(.tlBodySm)
                            .strikethrough(done, color: tk.inkFaint)
                            .foregroundStyle(done ? tk.inkFaint : tk.ink)
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                        badges
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 8)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(open ? .isSelected : [])

                // 소프트 삭제라 확인 없이 지우고 실행취소를 준다
                if store.canManage(todo) {
                    Button { store.remove(todo) } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(tk.inkFaint)
                            .frame(width: 20, height: 20)
                            .padding(.vertical, 8)
                            .padding(.leading, 10)
                    }
                    .buttonStyle(PressScale())
                    .accessibilityLabel(tr("지우기", "Delete"))
                }
            }

            if open {
                TodoCardOpenContent(store: store, todo: todo, done: done, onGive: onGive)
                    .transition(.opacity)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .glassCard(alt: done)
        .overlay { ViewingOutline(viewers: viewers) }
        .overlay(alignment: .topTrailing) { viewerAvatars.offset(x: 8, y: -8) }
        .animation(reduce ? nil : Motion.quick, value: done)
        .animation(reduce ? nil : Motion.quick, value: viewers.map(\.userId))
    }

    /// 지금 이 카드를 펼쳐 둔 다른 사람 — 노션처럼 테두리 + 아바타(내 신호는 PresenceStore가 이미 걸렀다)
    private var viewers: [MemberSummary] {
        (store.presence.viewers[todo.id] ?? []).compactMap { store.member($0.userId) }
    }

    @ViewBuilder private var viewerAvatars: some View {
        if !viewers.isEmpty {
            HStack(spacing: -8) {
                ForEach(viewers.prefix(3), id: \.userId) { m in
                    AvatarView(member: m, size: 20).overlay(Circle().strokeBorder(tk.surface, lineWidth: 2))
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(tr("\(viewers.map(\.displayName).joined(separator: ", "))님이 보는 중",
                                   "\(viewers.map(\.displayName).joined(separator: ", ")) viewing"))
        }
    }

    // MARK: 배지 줄

    @ViewBuilder private var badges: some View {
        let titleTypers = (store.presence.typers[todo.id] ?? []).filter { $0.field == .title }
        let hasAny = todo.dueDate != nil || todo.isGivenByOther || todo.isRequestedByOther
            || (done && todo.isHandledByOther) || !todo.noteList.isEmpty || !todo.participants.isEmpty
            || !titleTypers.isEmpty
        if hasAny {
            FlowLayout(spacing: 6) {
                if !titleTypers.isEmpty { BadgeView(typingText(titleTypers)) }
                if let due = todo.dueDate {
                    let tone: BadgeView<EmptyView>.Tone = switch Due.state(due) {
                    case .overdue: .danger
                    case .today: .warning
                    default: .neutral
                    }
                    BadgeView(Due.relative(due), tone: tone)
                }
                // "이거 왜 내 목록에 있지"를 카드에서 바로 — 넘김이 부탁보다 우선(넘긴 사람에게 물어야 한다)
                if todo.isGivenByOther {
                    personBadge(todo.givenBy, suffix: "넘김", en: "Handed off by")
                } else if todo.isRequestedByOther {
                    personBadge(todo.createdBy, suffix: "부탁", en: "Requested by")
                }
                if done, todo.isHandledByOther {
                    personBadge(todo.handledBy, suffix: "대신 처리", en: "Handled by", tone: .success)
                }
                if !todo.noteList.isEmpty { BadgeView(tr("메모 \(todo.noteList.count)", "\(plural(todo.noteList.count, "note"))")) }
                if !todo.participants.isEmpty {
                    HStack(spacing: -6) {
                        ForEach(todo.participants, id: \.self) { id in
                            AvatarView(member: store.member(id), size: 16)
                                .overlay(Circle().strokeBorder(tk.surface, lineWidth: 1))
                        }
                    }
                }
            }
        }
    }

    /// 한국어는 받침에 따라 조사가 갈려 "최진형이 부탁"/"최진우가 부탁" — 영어는 어순부터 다르다
    private func personBadge(_ id: String?, suffix: String, en: String, tone: BadgeView<AvatarView>.Tone = .neutral) -> some View {
        let m = store.member(id)
        let name = m?.displayName ?? tr("누군가", "Someone")
        let text = AppLang.current == .ko ? "\(name)\(BoardRules.subjectParticle(name)) \(suffix)" : "\(en) \(name)"
        return BadgeView(text: text, tone: tone) {
            AvatarView(member: m, size: 14)
        }
    }
}

/// 펼친 내용 — 이 안의 상태(편집 중·메모 초안)는 카드가 접히면 함께 사라진다.
private struct TodoCardOpenContent: View {
    @Environment(\.tokens) private var tk
    let store: BoardStore
    let todo: Todo
    let done: Bool
    let onGive: () -> Void

    @State private var note = ""
    @State private var editing = false
    @State private var draftTitle = ""
    /// 편집을 시작한 순간의 제목 — 지금 제목과 비교하면 그 사이 남이 고친 걸 내가 바꾼 것으로 오인한다
    @State private var editBase = ""
    @State private var dueOpen = false
    @FocusState private var titleFocused: Bool
    /// 고치는 중인 내 메모 — 한 번에 하나
    @State private var editingNoteId: String?
    @State private var noteDraft = ""
    @FocusState private var noteFocused: Bool

    private var canManage: Bool { store.canManage(todo) }
    private var isMine: Bool { todo.ownerId == store.userId }

    /// 입력 중 신호 — 이름은 받는 쪽이 조인하지 않고 그대로 띄운다(웹 페이로드와 같다)
    private func typed(_ field: PresenceStore.Field) {
        store.presence.typed(todo.id, field, displayName: store.member(store.userId)?.displayName ?? "")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Rectangle().fill(tk.hairline).frame(height: 1).padding(.top, 6)

            if editing {
                editForm
            } else {
                ForEach(todo.noteList) { n in noteRow(n) }
                let noteTypers = (store.presence.typers[todo.id] ?? []).filter { $0.field == .note }
                if !noteTypers.isEmpty {
                    Text(typingText(noteTypers)).font(.tlCaption).foregroundStyle(tk.inkFaint)
                }
                noteInput
                actions
            }
        }
        .padding(.bottom, 6)
    }

    @ViewBuilder private func noteRow(_ n: TodoNote) -> some View {
        let mine = n.authorId == store.userId
        if editingNoteId == n.id {
            VStack(spacing: 6) {
                TextField("", text: $noteDraft)
                    .focused($noteFocused)
                    .submitLabel(.done)
                    .onSubmit { submitNoteEdit(n) }
                    .tlField(height: 36)
                HStack(spacing: 6) {
                    Button(tr("취소", "Cancel")) { editingNoteId = nil }
                        .buttonStyle(TLButtonStyle(variant: .outline, size: .sm, fill: true))
                    Button(tr("저장", "Save")) { submitNoteEdit(n) }
                        .buttonStyle(TLButtonStyle(size: .sm, fill: true))
                        .disabled(noteDraft.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .padding(.horizontal, 10).padding(.vertical, 8)
            .background(tk.canvasSoft, in: RoundedRectangle(cornerRadius: 8))
        } else {
            noteBody(n, mine: mine)
        }
    }

    /// 내 메모는 누르면 고치고 옆 X로 지운다. 남의 메모는 읽기만 — 누를 거리도 X도 없다.
    private func noteBody(_ n: TodoNote, mine: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top, spacing: 6) {
                Text(n.content).font(.tlCaption).foregroundStyle(tk.inkSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
                    .onTapGesture {
                        guard mine else { return }
                        noteDraft = n.content
                        editingNoteId = n.id
                        noteFocused = true
                    }
                    .accessibilityAddTraits(mine ? .isButton : [])
                    .accessibilityHint(mine ? tr("눌러서 고치기", "Tap to edit") : "")
                if mine {
                    Button { store.deleteNote(todo, noteId: n.id) } label: {
                        Image(systemName: "xmark").font(.system(size: 10, weight: .bold)).foregroundStyle(tk.inkFaint)
                            .frame(width: 24, height: 24)
                    }
                    .buttonStyle(PressScale())
                    .accessibilityLabel(tr("메모 지우기", "Delete note"))
                }
            }
            HStack(spacing: 6) {
                AvatarView(member: store.member(n.authorId), size: 16)
                Text("\(n.authorName ?? tr("알 수 없음", "Unknown")) · \(Due.relative(Due.format(n.createdAt))) \(n.createdAt.formatted(.dateTime.hour(.twoDigits(amPM: .omitted)).minute(.twoDigits).locale(AppLang.locale)))")
                    .font(.tl(11)).foregroundStyle(tk.inkFaint)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(tk.canvasSoft, in: RoundedRectangle(cornerRadius: 8))
    }

    private var noteInput: some View {
        let empty = note.trimmingCharacters(in: .whitespaces).isEmpty
        return HStack(spacing: 6) {
            TextField("", text: $note, prompt: placeholder(tr("메모 남기기", "Leave a note"), tk))
                .onChange(of: note) { _, text in if !text.isEmpty { typed(.note) } }
                .submitLabel(.send)
                .onSubmit(sendNote)
                .tlField(height: 40)
            Button(action: sendNote) {
                Image(systemName: "arrow.right")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(tk.accentInk)
                    .frame(width: 40, height: 40)
                    .background(tk.accent, in: RoundedRectangle(cornerRadius: 12))
                    .opacity(empty ? 0.3 : 1)
            }
            .buttonStyle(PressScale())
            .disabled(empty)
            .accessibilityLabel(tr("메모 보내기", "Send note"))
        }
    }

    @ViewBuilder private var actions: some View {
        let canGive = canManage && !done && store.members.count > 1
        let canJoin = !isMine && !done
        if canManage || canJoin {
            VStack(alignment: .leading, spacing: 6) {
                FlowLayout(spacing: 6) {
                    // 마감 알약이 맨 앞 — 지금 값을 보여 주는 것이 곧 고치는 버튼이고, 고르는 순간 저장된다
                    if canManage && !done {
                        DuePillView(value: todo.dueDate, onChange: { store.setDue(todo, $0) }, open: $dueOpen, height: 40)
                    }
                    if canManage {
                        Button(tr("제목 수정", "Rename"), action: startEditing).buttonStyle(TLButtonStyle(variant: .outline, size: .sm))
                    }
                    if canGive {
                        Button(tr("넘기기", "Hand off"), action: onGive).buttonStyle(TLButtonStyle(variant: .outline, size: .sm))
                    }
                    if canJoin {
                        let joined = todo.participants.contains(store.userId)
                        Button(joined ? tr("같이하기 그만", "Leave") : tr("같이하기", "Join")) { store.setJoined(todo, !joined) }
                            .buttonStyle(TLButtonStyle(variant: .outline, size: .sm))
                    }
                }
                DuePillView(value: todo.dueDate, onChange: { store.setDue(todo, $0) }, open: $dueOpen).rail()
            }
        }
    }

    private var editForm: some View {
        VStack(spacing: 8) {
            TextField("", text: $draftTitle)
                .focused($titleFocused)
                .onChange(of: draftTitle) { _, text in if editing && text != editBase { typed(.title) } }
                .submitLabel(.done)
                .onSubmit(submitEdit)
                .tlField(height: 40)
            HStack(spacing: 6) {
                Button(tr("취소", "Cancel")) { editing = false }.buttonStyle(TLButtonStyle(variant: .outline, fill: true))
                Button(tr("저장", "Save"), action: submitEdit).buttonStyle(TLButtonStyle())
                    .disabled(draftTitle.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
    }

    private func startEditing() {
        draftTitle = todo.title
        editBase = todo.title
        editing = true
        titleFocused = true
    }

    private func submitEdit() {
        editing = false
        guard draftTitle.trimmingCharacters(in: .whitespaces) != editBase else { return }
        store.rename(todo, to: draftTitle)
    }

    private func submitNoteEdit(_ n: TodoNote) {
        editingNoteId = nil
        guard noteDraft.trimmingCharacters(in: .whitespaces) != n.content else { return }
        store.editNote(todo, noteId: n.id, content: noteDraft)
    }

    private func sendNote() {
        store.addNote(todo, content: note)
        note = ""
    }
}

/// 넘치면 다음 줄로 — 웹 `flex flex-wrap gap-1.5`
struct FlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(proposal.width ?? .infinity, subviews)
        let height = rows.reduce(0) { $0 + $1.height } + spacing * CGFloat(max(rows.count - 1, 0))
        let width = rows.map(\.width).max() ?? 0
        return CGSize(width: proposal.width ?? width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for row in arrange(bounds.width, subviews) {
            var x = bounds.minX
            for i in row.items {
                let size = subviews[i].sizeThatFits(.unspecified)
                subviews[i].place(at: CGPoint(x: x, y: y + (row.height - size.height) / 2), proposal: .unspecified)
                x += size.width + spacing
            }
            y += row.height + spacing
        }
    }

    private func arrange(_ maxWidth: CGFloat, _ subviews: Subviews) -> [(items: [Int], width: CGFloat, height: CGFloat)] {
        var rows: [(items: [Int], width: CGFloat, height: CGFloat)] = []
        var current: (items: [Int], width: CGFloat, height: CGFloat) = ([], 0, 0)
        for i in subviews.indices {
            let size = subviews[i].sizeThatFits(.unspecified)
            let needed = current.items.isEmpty ? size.width : current.width + spacing + size.width
            if needed > maxWidth, !current.items.isEmpty {
                rows.append(current)
                current = ([i], size.width, size.height)
            } else {
                current = (current.items + [i], needed, max(current.height, size.height))
            }
        }
        if !current.items.isEmpty { rows.append(current) }
        return rows
    }
}

/// "○○님이 입력 중..." — 웹 card.typingIndicator
func typingText(_ typers: [PresenceStore.Typer]) -> String {
    let names = typers.map(\.displayName).joined(separator: ", ")
    return tr("\(names)님이 입력 중...", "\(names) is typing...")
}

/// 남이 보고 있는 카드의 테두리 — 먼저 들어온 한 사람의 색만 쓴다(여럿이면 색이 바뀌며 깜빡이는 것보다
/// 아바타를 겹쳐 인원수를 보이는 쪽이 덜 어지럽다). 1.6초 주기로 숨 쉬듯 옅어진다(웹과 같다).
private struct ViewingOutline: View {
    @Environment(\.accessibilityReduceMotion) private var reduce
    let viewers: [MemberSummary]
    @State private var dim = false

    var body: some View {
        if let first = viewers.first {
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(AvatarView.color(key: first.avatarColor, seed: first.userId).bg, lineWidth: 2)
                .opacity(dim ? 0.45 : 1)
                .allowsHitTesting(false)
                .onAppear {
                    guard !reduce else { return }
                    withAnimation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true)) { dim = true }
                }
        }
    }
}
