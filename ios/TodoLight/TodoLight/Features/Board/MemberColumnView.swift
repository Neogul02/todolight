import SwiftUI
import TodoLightKit

/// 한 사람의 컬럼 — 추가 칸 → 미완료(급한 순) → 완료(최근 끝낸 순).
struct MemberColumnView: View {
    let store: BoardStore
    let member: MemberSummary
    let onHandoff: (Todo) -> Void
    let onGive: (Todo) -> Void

    @State private var draft = ""
    @State private var showAllDone = false
    @FocusState private var adding: Bool

    /// 완료는 최근 몇 개만 펼친다. 나머지는 "+N개 더 보기"(받아 둔 것만 센다)
    private static let visibleDone = 3

    private var isMe: Bool { member.userId == store.userId }

    var body: some View {
        let (open, done) = store.column(for: member.userId)
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 8) {
                addField

                if open.isEmpty {
                    Text(isMe ? "할 일이 비어 있어요" : "남은 할 일이 없어요")
                        .font(.subheadline).foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity).padding(.vertical, 24)
                }
                ForEach(open) { card($0) }

                if store.showDone {
                    let shown = showAllDone ? done : Array(done.prefix(Self.visibleDone))
                    ForEach(shown) { card($0) }
                    if done.count > shown.count {
                        Button("완료 \(done.count - shown.count)개 더 보기") { showAllDone = true }
                            .font(.footnote).frame(maxWidth: .infinity).padding(.vertical, 6)
                    }
                    // 서버가 안 보낸 옛날 완료는 버튼이 아니라 사실만 적는다 — 눌러도 안 나오니까
                    let notLoaded = BoardRules.notLoadedDoneCount(
                        doneTotal: store.doneTotals[member.userId] ?? 0, loadedDone: done.count)
                    if showAllDone || done.count <= Self.visibleDone, notLoaded > 0 {
                        Text("그 전에 끝낸 \(notLoaded)개는 여기 안 실려요")
                            .font(.footnote).foregroundStyle(.tertiary).frame(maxWidth: .infinity)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .refreshable { await store.load() }
        .scrollDismissesKeyboard(.interactively)
    }

    private var addField: some View {
        HStack(spacing: 8) {
            TextField(isMe ? "할 일 추가" : "\(member.displayName)님에게 부탁하기", text: $draft)
                .focused($adding)
                .submitLabel(.done)
                .onSubmit(submit)
            if !draft.trimmingCharacters(in: .whitespaces).isEmpty {
                Button(action: submit) {
                    Image(systemName: "arrow.up.circle.fill").font(.title2)
                }
                .accessibilityLabel("추가")
            }
        }
        .padding(.horizontal, 12)
        .frame(minHeight: 44)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }

    private func submit() {
        store.create(title: draft, ownerId: member.userId)
        draft = ""
        // 연달아 적을 수 있게 칸을 비우고 포커스는 남긴다
        adding = true
    }

    private func card(_ todo: Todo) -> some View {
        TodoCardView(
            store: store,
            todo: todo,
            open: store.openTodoId == todo.id,
            onToggleOpen: {
                withAnimation(.snappy(duration: 0.2)) {
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
