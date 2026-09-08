import Foundation
import Testing
@testable import TodoLightKit

/*
  이 규칙은 웹의 `MemberColumn`에서 그대로 옮겨 온 것이다. 여기가 깨지면 같은 팀의 웹과 앱이
  **같은 목록을 다른 순서로** 보여 준다 — 디자인 차이가 아니라 버그다.
*/

private func makeTodo(
    _ id: String,
    status: TodoStatus = .todo,
    due: String? = nil,
    position: Double = 0,
    completedAt: String? = nil,
    createdAt: String = "2026-09-01T00:00:00Z"
) throws -> Todo {
    let json = """
    {
      "id": "\(id)", "org_id": "o", "owner_id": "u", "title": "\(id)",
      "status": "\(status.rawValue)",
      "due_date": \(due.map { "\"\($0)\"" } ?? "null"),
      "position": \(position), "created_by": "u", "handled_by": null,
      "completed_at": \(completedAt.map { "\"\($0)\"" } ?? "null"),
      "created_at": "\(createdAt)", "updated_at": "\(createdAt)", "deleted_at": null
    }
    """
    return try TodoLightCoding.makeDecoder().decode(Todo.self, from: Data(json.utf8))
}

@Suite("컬럼 정렬")
struct BoardSortingTests {

    /// 급한 것부터 위로 — **지난 마감 → 오늘 → 나중 → 마감 없음.**
    @Test("마감이 이른 것이 위, 마감 없는 것이 맨 아래")
    func dueOrder() throws {
        let todos = [
            try makeTodo("없음", due: nil),
            try makeTodo("나중", due: "2026-12-01"),
            try makeTodo("지난", due: "2026-01-01"),
            try makeTodo("오늘", due: "2026-09-08"),
        ]
        let (open, _) = BoardRules.split(todos)
        #expect(open.map(\.id) == ["지난", "오늘", "나중", "없음"])
    }

    /// `position`은 새 할 일일수록 작다 — 같은 마감이면 나중에 넣은 것이 위로 온다.
    @Test("마감이 같으면 나중에 넣은 것이 위")
    func positionTiebreak() throws {
        let todos = [
            try makeTodo("먼저", due: "2026-09-08", position: 0),
            try makeTodo("나중", due: "2026-09-08", position: -1),
        ]
        let (open, _) = BoardRules.split(todos)
        #expect(open.map(\.id) == ["나중", "먼저"])
    }

    @Test("완료는 최근 끝낸 순으로 쌓인다")
    func doneOrder() throws {
        let todos = [
            try makeTodo("어제", status: .done, completedAt: "2026-09-07T10:00:00Z"),
            try makeTodo("방금", status: .done, completedAt: "2026-09-08T09:00:00Z"),
            try makeTodo("그제", status: .done, completedAt: "2026-09-06T10:00:00Z"),
        ]
        let (_, done) = BoardRules.split(todos)
        #expect(done.map(\.id) == ["방금", "어제", "그제"])
    }

    /// 낙관적으로 방금 체크한 카드는 `completed_at`이 아직 없다. 맨 뒤로 밀리면
    /// "방금 끝낸 게 어디 갔지"가 되므로, 시각 없는 것끼리는 만든 순으로 둔다.
    @Test("완료 시각이 아직 없는 카드도 자리를 잃지 않는다")
    func doneWithoutTimestamp() throws {
        let todos = [
            try makeTodo("있음", status: .done, completedAt: "2026-09-08T09:00:00Z"),
            try makeTodo("없음", status: .done, completedAt: nil),
        ]
        let (_, done) = BoardRules.split(todos)
        #expect(done.count == 2)
        #expect(done.first?.id == "있음")
    }

    @Test("미완료와 완료가 섞여 들어와도 갈라진다")
    func splitsMixed() throws {
        let todos = [
            try makeTodo("a", status: .done, completedAt: "2026-09-08T09:00:00Z"),
            try makeTodo("b", status: .doing, due: "2026-09-08"),
            try makeTodo("c", status: .todo),
        ]
        let (open, done) = BoardRules.split(todos)
        #expect(open.map(\.id) == ["b", "c"])
        #expect(done.map(\.id) == ["a"])
    }

    /// `sorted(by:)`는 엄격한 약순서를 요구한다 — 같은 값에 true를 주면 정렬이 정의되지 않는다.
    @Test("같은 값끼리는 어느 쪽도 앞서지 않는다")
    func strictWeakOrdering() throws {
        let a = try makeTodo("a", due: "2026-09-08", position: 1)
        let b = try makeTodo("b", due: "2026-09-08", position: 1)
        #expect(!BoardRules.openIsBefore(a, b))
        #expect(!BoardRules.openIsBefore(b, a))
    }
}

@Suite("이름 뒤 조사")
struct ParticleTests {

    /// "최진형이 부탁" / "최진우가 부탁". 하나로 고정하면 반드시 한쪽이 어색해진다.
    @Test("받침이 있으면 이, 없으면 가",
          arguments: [("최진형", "이"), ("최진우", "가"), ("김", "이"), ("나", "가")])
    func hangul(_ pair: (String, String)) {
        #expect(BoardRules.subjectParticle(pair.0) == pair.1)
    }

    @Test("한글이 아니면 가로 둔다", arguments: ["Alex", "42", "", "  "])
    func nonHangul(_ name: String) {
        #expect(BoardRules.subjectParticle(name) == "가")
    }

    @Test("이니셜은 첫 글자 대문자, 비면 물음표")
    func initials() {
        #expect(BoardRules.initial(of: "최진형") == "최")
        #expect(BoardRules.initial(of: "alex") == "A")
        #expect(BoardRules.initial(of: "  ") == "?")
    }
}
