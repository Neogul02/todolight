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
    /// 끌고 있는 카드 — 놓기 전까지는 이 손끝 순서가 진실이다(서버 값으로 매번 다시 정렬하면 카드가 튄다)
    @State private var dragging: String?
    @State private var dragOrder: [String]?
    /// 카드마다 컬럼 안 위치 — 손끝이 어느 카드 위를 지나는지 가린다
    @State private var frames: [String: CGRect] = [:]
    /// 끄는 카드가 자기 자리에서 손끝까지 떨어진 만큼(자리가 바뀌면 다시 계산된다)
    @State private var dragOffset: CGFloat = 0
    /// 꾹 누른 순간 손끝과 카드 가운데의 차이 — 카드가 손끝으로 튀지 않게
    @State private var grabDelta: CGFloat?
    /// 끌기 시작할 때의 순서 — 놓았을 때 그대로면 아무것도 보내지 않는다
    @State private var dragStartOrder: [String]?
    /// 막 놓은 카드 — 손을 뗀 그 순간의 탭이 카드 안 버튼(펼치기·X)으로 가지 않게 잠깐 더 잠가 둔다
    @State private var settling: String?
    @FocusState private var adding: Bool

    /// 완료는 최근 몇 개만 펼친다. 나머지는 "+N개 더 보기"(받아 둔 것만 센다)
    private static let visibleDone = 3

    private var isMe: Bool { member.userId == store.userId }

    var body: some View {
        let (sorted, done) = store.column(for: member.userId)
        // 끄는 동안만 손끝 순서를 쓴다
        let open = dragOrder.map { ids in ids.compactMap { id in sorted.first { $0.id == id } } } ?? sorted
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
                                todo: todo, enabled: todo.status != .done && store.openTodoId != todo.id,
                                dragging: $dragging, locked: dragging == todo.id || settling == todo.id,
                                offset: dragging == todo.id ? dragOffset : 0,
                                onChange: { y in dragMoved(todo, y: y, open: open) },
                                onStart: { startDrag(todo, open: open) },
                                onEnd: { endDrag(sorted: sorted) }
                            ))
                            .onGeometryChange(for: CGRect.self) { $0.frame(in: .named("column")) } action: { frames[todo.id] = $0 }
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
            .scrollDisabled(dragging != nil)
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

    private func startDrag(_ todo: Todo, open: [Todo]) {
        dragging = todo.id
        dragOrder = open.map(\.id)
        dragStartOrder = open.map(\.id)
        grabDelta = nil
        dragOffset = 0
    }

    /// 손끝이 같은 마감일 그룹의 다른 카드 가운데를 넘으면 그 자리로 옮긴다
    private func dragMoved(_ todo: Todo, y: CGFloat, open: [Todo]) {
        guard let mine = frames[todo.id] else { return }
        if grabDelta == nil { grabDelta = y - mine.midY }
        let center = y - (grabDelta ?? 0)
        dragOffset = center - mine.midY
        guard var ids = dragOrder, let from = ids.firstIndex(of: todo.id) else { return }
        // 바로 위·아래 이웃만 본다 — 한 번에 한 칸씩, 그룹 경계는 넘지 않는다(웹 handleReorder)
        for step in [-1, 1] {
            let j = from + step
            guard ids.indices.contains(j), let other = open.first(where: { $0.id == ids[j] }),
                  let f = frames[other.id], BoardRules.canMove(todo, near: other) else { continue }
            if (step < 0 && center < f.midY) || (step > 0 && center > f.midY) {
                ids.swapAt(from, j)
                Motion.run(Motion.quick, reduce: reduce) { dragOrder = ids }
                return
            }
        }
    }

    /// 놓았을 때 — 이웃 position 평균으로 한 번만 보낸다
    private func endDrag(sorted: [Todo]) {
        settling = dragging
        Task {
            try? await Task.sleep(for: .milliseconds(250))
            settling = nil
        }
        // 순서가 그대로면 보내지 않는다 — 이웃 평균이 지금 값과 달라도 화면 순서는 같으니 쓸데없는 쓰기다
        if let id = dragging, let ids = dragOrder, ids != dragStartOrder,
           let position = BoardRules.reorderedPosition(of: id, in: ids.compactMap { i in sorted.first { $0.id == i } }) {
            store.reorder(id, to: position)
        }
        Motion.run(Motion.quick, reduce: reduce) {
            dragging = nil
            dragOrder = nil
            dragStartOrder = nil
            dragOffset = 0
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

/// 제목 칸을 꾹 누르면(0.45초) 그 자리에서 끌 수 있다 — 웹 TodoCard의 롱프레스 손잡이와 같다.
/// 꾹 누르기 전에 움직이면 그건 스크롤이다(제스처가 실패하고 ScrollView가 가져간다).
private struct ReorderHandle: ViewModifier {
    let todo: Todo
    let enabled: Bool
    @Binding var dragging: String?
    /// 끄는 동안 카드 안 버튼을 끈다 — 동시 제스처라 손을 떼면 그 자리 버튼도 눌린다
    let locked: Bool
    let offset: CGFloat
    let onChange: (CGFloat) -> Void
    let onStart: () -> Void
    let onEnd: () -> Void

    // if/else로 갈라 두면 카드를 펼칠 때(enabled가 바뀔 때) 뷰 정체성이 바뀌어 카드 안 상태가 날아간다 —
    // 수식어는 늘 붙여 두고 제스처만 켜고 끈다
    func body(content: Content) -> some View {
        content
            .disabled(locked)
            .offset(y: offset)
            .scaleEffect(dragging == todo.id ? 1.02 : 1)
            .shadow(color: .black.opacity(dragging == todo.id ? 0.12 : 0), radius: 12, y: 6)
            .zIndex(dragging == todo.id ? 10 : 0)
            // 동시 제스처 — 높은 우선순위로 걸면 카드 안 버튼(펼치기·체크·X)이 탭을 아예 못 받는다.
            // 대신 끄는 동안은 버튼을 잠그고(locked) 컬럼 스크롤을 멈춘다(scrollDisabled).
            .simultaneousGesture(
                LongPressGesture(minimumDuration: 0.45)
                    .sequenced(before: DragGesture(minimumDistance: 0, coordinateSpace: .named("column")))
                    .onChanged { value in
                        guard case .second(true, let drag) = value else { return }
                        if dragging != todo.id { onStart() }
                        if let drag { onChange(drag.location.y) }
                    }
                    .onEnded { _ in if dragging == todo.id { onEnd() } },
                including: enabled ? .all : .subviews
            )
            .sensoryFeedback(.impact(weight: .medium), trigger: dragging == todo.id) { _, now in now }
    }
}
