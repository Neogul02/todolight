import SwiftUI
import TodoLightKit

/// 대신 처리 — 메모가 필수다. 남의 할 일이 말없이 사라지면 주인이 상황을 모른다.
struct HandoffSheet: View {
    let todo: Todo
    let ownerName: String
    let onSubmit: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var note = ""
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(todo.title)
                } footer: {
                    Text("\(ownerName)님의 할 일이에요. 어떻게 처리했는지 한 줄 남겨 주세요.")
                }
                TextField("예) 거래처에 메일 보내뒀습니다. 회신 오면 공유할게요.", text: $note, axis: .vertical)
                    .lineLimit(3...6)
                    .focused($focused)
            }
            .navigationTitle("대신 처리")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("취소") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("완료 처리") {
                        onSubmit(note.trimmingCharacters(in: .whitespacesAndNewlines))
                        dismiss()
                    }
                    .disabled(note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .onAppear { focused = true }
        }
        .presentationDetents([.medium])
    }
}

/// 넘기기 — 사람을 누르는 순간 넘어간다(실행취소로 되돌린다). 메모 칸이 **위에** 있다:
/// 쓰고 나서 누르는 순서라야 한다.
struct GiveSheet: View {
    let todo: Todo
    let candidates: [MemberSummary]
    let onPick: (MemberSummary, String?) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var note = ""

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text(todo.title)
                    TextField("한마디 남기기 (선택) — 예) 이거 좀 부탁해요", text: $note)
                }
                Section {
                    ForEach(candidates) { m in
                        Button {
                            let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)
                            onPick(m, trimmed.isEmpty ? nil : trimmed)
                            dismiss()
                        } label: {
                            HStack(spacing: 12) {
                                AvatarView(member: m, size: 32)
                                Text(m.displayName).foregroundStyle(.primary)
                            }
                        }
                    }
                }
            }
            .navigationTitle("누구에게 넘길까요?")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("취소") { dismiss() } }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
