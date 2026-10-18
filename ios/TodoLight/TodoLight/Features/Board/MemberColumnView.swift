import SwiftUI
import TodoLightKit

/// 한 사람의 컬럼 — 웹 `MemberColumn.tsx`. 머리(아바타·이름·남은 개수) → 추가 칸(+마감 알약) →
/// 미완료(급한 순) → 완료(최근 끝낸 순, 3개만 펼침).
struct MemberColumnView: View {
    @Environment(\.tokens) private var tk
    @Environment(\.accessibilityReduceMotion) private var reduce
    let store: BoardStore
    let member: MemberSummary
    let onHandoff: (Todo) -> Void
    let onGive: (Todo) -> Void

    @State private var draft = ""
    @State private var due: String? = Due.today()
    @State private var dueOpen = false
    @State private var showAllDone = false
    /// 꾹 눌러 끄는 할 일 순서 바꾸기(같은 마감일 그룹 안에서만)
    @State private var reorder = ReorderState(axis: .vertical)
    @FocusState private var adding: Bool

    /// 완료는 최근 몇 개만 펼친다. 나머지는 "+N개 더 보기"(받아 둔 것만 센다)
    private static let visibleDone = 3

    private var isMe: Bool { member.userId == store.userId }

    var body: some View {
        let (sorted, done) = store.column(for: member.userId)
        // 끄는 동안만 손끝 순서를 쓴다
        let open = reorder.order.map { ids in ids.compactMap { id in sorted.first { $0.id == id } } } ?? sorted
        let shownDone = store.showDone ? (showAllDone ? done : Array(done.prefix(Self.visibleDone))) : []
        let hiddenDone = store.showDone ? done.count - shownDone.count : 0
        let notLoaded = BoardRules.notLoadedDoneCount(doneTotal: store.doneTotals[member.userId] ?? 0, loadedDone: done.count)

        VStack(spacing: 0) {
            header(openCount: open.count, doneTotal: store.doneTotals[member.userId] ?? done.count)
            addField
            ScrollView {
                VStack(spacing: 8) {
                    // 미완료와 완료를 한 ForEach에 — 체크하면 같은 카드가 자리를 옮기며 미끄러진다(웹 layout 애니메이션)
                    ForEach(open + shownDone) { todo in
                        card(todo)
                            .transition(.card)
                            .modifier(ReorderHandle(
                                id: todo.id, enabled: todo.status != .done && store.openTodoId != todo.id,
                                space: "column", state: $reorder,
                                order: { open.map(\.id) },
                                canSwap: { other in open.first { $0.id == other }.map { BoardRules.canMove(todo, near: $0) } ?? false },
                                onCommit: { id, ids in commitReorder(id, ids, sorted: sorted) }
                            ))
                    }

                    if hiddenDone > 0 {
                        dashedButton(tr("완료 \(hiddenDone)개 더 보기", "Show \(hiddenDone) more done")) { showAllDone = true }
                    }
                    if store.showDone && showAllDone && notLoaded > 0 {
                        Text(tr("그 전에 끝낸 \(notLoaded)개는 여기 안 실려요", "\(notLoaded) older finished to-dos aren't loaded here"))
                            .font(.tlCaption).foregroundStyle(tk.inkFaint).padding(.top, 4)
                    }
                    if store.showDone && showAllDone && done.count > Self.visibleDone {
                        dashedButton(tr("완료 접기", "Hide done")) { showAllDone = false }
                    }
                    if open.isEmpty && shownDone.isEmpty {
                        Text(isMe ? tr("할 일이 비어 있어요", "Your list is empty") : tr("남은 할 일이 없어요", "Nothing left to do"))
                            .font(.tlCaption).foregroundStyle(tk.inkFaint)
                            .frame(maxWidth: .infinity).padding(.vertical, 32)
                            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(tk.hairline, style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
                    }
                }
                .animation(reduce ? nil : Motion.quick, value: (open + shownDone).map(\.id))
                .coordinateSpace(.named("column"))
                .padding(.horizontal, 12)
                // 하단 탭바 알약이 콘텐츠 위에 뜬다 — 마지막 카드가 그 밑에 갇히지 않게(웹 pb-tabbar)
                .padding(.bottom, 96)
            }
            .refreshable { await store.load() }
            .scrollDismissesKeyboard(.interactively)
            .scrollDisabled(reorder.dragging != nil)
        }
        // 내 컬럼만 한 단계 진하게(웹 isMine → border-hairline-strong bg-surface-alt/70)
        .background((isMe ? tk.surfaceAlt.opacity(0.7) : tk.canvasSoft.opacity(0.55)), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(isMe ? tk.hairlineStrong : tk.hairline, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .padding(.horizontal, 12)
    }

    private func header(openCount: Int, doneTotal: Int) -> some View {
        HStack(spacing: 8) {
            AvatarView(member: member, size: 32)
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 4) {
                    Text(member.displayName).font(.tl(15, .semibold)).foregroundStyle(tk.ink).lineLimit(1)
                    if isMe { Text(tr("(나)", "(me)")).font(.tl(12)).foregroundStyle(tk.inkFaint) }
                }
                Text(tr("남은 일 \(openCount)개", "\(openCount) left") + (doneTotal > 0 ? tr(" · 완료 \(doneTotal)", " · \(doneTotal) done") : ""))
                    .font(.tl(12)).foregroundStyle(tk.inkFaint)
            }
            Spacer(minLength: 0)
            if member.role != .member {
                BadgeView(member.role == .owner ? tr("방장", "Owner") : tr("관리자", "Admin"))
            }
        }
        .padding(.horizontal, 12)
        .padding(.top, 12)
        .padding(.bottom, 8)
    }

    /// 추가 칸은 높이가 변하지 않는다 — 보내기 버튼이 칸 **안에** 늘 자리를 지키고,
    /// 마감은 그 아래 알약 한 줄이 지킨다(누를 때만 레일이 열린다).
    private var addField: some View {
        let empty = draft.trimmingCharacters(in: .whitespaces).isEmpty
        return VStack(alignment: .leading, spacing: 6) {
            ZStack(alignment: .trailing) {
                TextField("", text: $draft, prompt: placeholder(isMe ? tr("할 일 추가", "Add a to-do") : tr("\(member.displayName)님에게 부탁하기", "Ask \(member.displayName)"), tk))
                    .focused($adding)
                    .submitLabel(.done)
                    .onSubmit(submit)
                    .tlField(height: 44, trailingInset: 44)
                Button(action: submit) {
                    Image(systemName: "arrow.up")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(empty ? tk.inkFaint : tk.accentInk)
                        .frame(width: 36, height: 36)
                        .background(empty ? Color.clear : tk.accent, in: RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(PressScale())
                .disabled(empty)
                .padding(.trailing, 4)
                .accessibilityLabel(tr("추가", "Add"))
            }
            let pill = DuePillView(value: due, onChange: { due = $0 }, open: $dueOpen)
            pill
            pill.rail()
        }
        .padding(.horizontal, 12)
        .padding(.bottom, 10)
    }

    private func dashedButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).font(.tlCaption).foregroundStyle(tk.inkMuted)
                .frame(maxWidth: .infinity).padding(.vertical, 8)
                .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(tk.hairline, style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
        }
        .buttonStyle(PressScale(scale: 0.98))
    }

    /// 놓았을 때 — 이웃 position 평균으로 한 번만 보낸다
    private func commitReorder(_ id: String, _ ids: [String], sorted: [Todo]) {
        if let position = BoardRules.reorderedPosition(of: id, in: ids.compactMap { i in sorted.first { $0.id == i } }) {
            store.reorder(id, to: position)
        }
    }

    private func submit() {
        store.create(title: draft, ownerId: member.userId, dueDate: due)
        draft = ""
        due = Due.today()
        dueOpen = false
        // 연달아 적을 수 있게 칸을 비우고 포커스는 남긴다
        adding = true
    }

    private func card(_ todo: Todo) -> some View {
        TodoCardView(
            store: store,
            todo: todo,
            open: store.openTodoId == todo.id,
            onToggleOpen: {
                Motion.run(Motion.quick, reduce: reduce) {
                    store.openTodoId = store.openTodoId == todo.id ? nil : todo.id
                }
            },
            onCheck: {
                // 남의 할 일을 끝내는 건 "대신 처리" — 메모를 반드시 받는다
                if todo.status != .done && todo.ownerId != store.userId { onHandoff(todo) } else { store.toggle(todo) }
            },
            onGive: { onGive(todo) }
        )
    }
}
