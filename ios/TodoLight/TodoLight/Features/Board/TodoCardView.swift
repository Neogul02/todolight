import SwiftUI
import TodoLightKit

/// 할 일 카드 — 체크 · 제목(누르면 펼침) · X.
/// 펼친 순서는 메모 목록 → 메모 입력 → 동작 줄. 자주 하는 일이 메모 한 줄이라 그게 먼저다.
struct TodoCardView: View {
    let store: BoardStore
    let todo: Todo
    let open: Bool
    let onToggleOpen: () -> Void
    let onCheck: () -> Void
    let onGive: () -> Void

    @State private var note = ""

    private var done: Bool { todo.status == .done }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 10) {
                Button(action: onCheck) {
                    Image(systemName: done ? "checkmark.square.fill" : "square")
                        .font(.title3)
                        .foregroundStyle(done ? Color.accentColor : .secondary)
                        // 시각 요소는 작게, 탭 영역은 44pt
                        .frame(width: 44, height: 44)
                }
                .accessibilityLabel(done ? "완료 취소" : "완료")

                Button(action: onToggleOpen) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(todo.title)
                            .strikethrough(done)
                            .foregroundStyle(done ? .secondary : .primary)
                            .multilineTextAlignment(.leading)
                        badges
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 11)
                }
                .buttonStyle(.plain)

                // 소프트 삭제라 확인 없이 지우고 실행취소를 준다
                if store.canManage(todo) {
                    Button { store.remove(todo) } label: {
                        Image(systemName: "xmark").font(.footnote).foregroundStyle(.tertiary)
                            .frame(width: 44, height: 44)
                    }
                    .accessibilityLabel("지우기")
                }
            }

            if open { expanded.padding(.horizontal, 12).padding(.bottom, 12) }
        }
        .background(Color(.secondarySystemBackground).opacity(done ? 0.5 : 1), in: RoundedRectangle(cornerRadius: 12))
    }

    @ViewBuilder private var badges: some View {
        let chips = badgeTexts
        if !chips.isEmpty {
            HStack(spacing: 6) {
                ForEach(chips, id: \.self) { text in
                    Text(text).font(.caption2)
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(Color(.tertiarySystemFill), in: Capsule())
                }
            }
        }
    }

    private var badgeTexts: [String] {
        var out: [String] = []
        if let due = todo.dueDate { out.append(DueLabel.text(due)) }
        // "이거 왜 내 목록에 있지"를 카드에서 바로 — 넘김이 부탁보다 우선(넘긴 사람에게 물어야 한다)
        if todo.isGivenByOther, let m = store.member(todo.givenBy) {
            out.append("\(m.displayName)\(BoardRules.subjectParticle(m.displayName)) 넘김")
        } else if todo.isRequestedByOther, let m = store.member(todo.createdBy) {
            out.append("\(m.displayName)\(BoardRules.subjectParticle(m.displayName)) 부탁")
        }
        if done, todo.isHandledByOther, let m = store.member(todo.handledBy) {
            out.append("\(m.displayName)\(BoardRules.subjectParticle(m.displayName)) 대신 처리")
        }
        if !todo.noteList.isEmpty { out.append("메모 \(todo.noteList.count)") }
        return out
    }

    private var expanded: some View {
        VStack(alignment: .leading, spacing: 10) {
            Divider()
            ForEach(todo.noteList) { n in
                VStack(alignment: .leading, spacing: 4) {
                    Text(n.content).font(.footnote)
                    Text(n.authorName ?? "알 수 없음").font(.caption2).foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(8)
                .background(Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 8))
            }
            HStack {
                TextField("메모 남기기", text: $note)
                    .font(.footnote)
                    .submitLabel(.send)
                    .onSubmit(sendNote)
                Button(action: sendNote) { Image(systemName: "arrow.up.circle.fill").font(.title3) }
                    .disabled(note.trimmingCharacters(in: .whitespaces).isEmpty)
                    .accessibilityLabel("메모 보내기")
            }

            HStack(spacing: 8) {
                // 넘기기 — 지울 수 있는 사람만, 끝낸 일은 안 넘긴다, 받을 사람이 있어야 한다
                if store.canManage(todo) && !done && store.members.count > 1 {
                    Button("넘기기", action: onGive).buttonStyle(.bordered)
                }
                if todo.ownerId != store.userId && !done {
                    let joined = todo.participants.contains(store.userId)
                    Button(joined ? "같이하기 그만" : "같이하기") { store.setJoined(todo, !joined) }
                        .buttonStyle(.bordered)
                }
            }
            .controlSize(.small)
        }
    }

    private func sendNote() {
        store.addNote(todo, content: note)
        note = ""
    }
}

/// 마감 표시 — 날짜는 KST 기준 `YYYY-MM-DD` 문자열 그대로 비교한다(Date로 바꾸면 하루가 밀린다).
enum DueLabel {
    static func text(_ due: String) -> String {
        let today = todayKST()
        if due == today { return "오늘" }
        if due == shift(today, 1) { return "내일" }
        if due == shift(today, -1) { return "어제" }
        let parts = due.split(separator: "-")
        let md = parts.count == 3 ? "\(Int(parts[1]) ?? 0)/\(Int(parts[2]) ?? 0)" : due
        return due < today ? "\(md) 지남" : md
    }

    private static var kst: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Asia/Seoul")!
        return c
    }

    private static func format(_ date: Date) -> String {
        let d = kst.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", d.year!, d.month!, d.day!)
    }

    static func todayKST() -> String { format(Date()) }

    private static func shift(_ day: String, _ by: Int) -> String {
        let p = day.split(separator: "-").compactMap { Int($0) }
        guard p.count == 3, let base = kst.date(from: DateComponents(year: p[0], month: p[1], day: p[2])),
              let moved = kst.date(byAdding: .day, value: by, to: base) else { return day }
        return format(moved)
    }
}
