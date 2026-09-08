import Foundation
import Testing
@testable import TodoLightKit

/*
  본문(fixture)은 **실제 서버가 돌려준 것**을 그대로 붙여 넣었다. 손으로 지어낸 JSON으로
  테스트하면 내가 상상한 모양만 검증하게 된다 — 소수 자릿수가 섞이는 것도, `position`이
  음수인 것도 실물을 봐야 나온다.
*/

private let decoder = TodoLightCoding.makeDecoder()

@Suite("응답 디코딩")
struct DecodingTests {

    /// 실제 `todos/list`가 준 행 하나. `created_at`은 소수 6자리, `completed_at`은 3자리다.
    static let realTodo = """
    {
      "id": "48d5ee06-d079-4724-a15a-fdfc5acc9ab3",
      "title": "하나종합물류 계좌 150 넣어놓기",
      "org_id": "daf30159-873b-4d06-957e-a69d8e9a3321",
      "status": "done",
      "due_date": "2026-09-05",
      "owner_id": "baa3a094-9908-40ec-9bed-43e543cad6aa",
      "position": -68,
      "created_at": "2026-09-05T11:21:31.701884+00:00",
      "created_by": "baa3a094-9908-40ec-9bed-43e543cad6aa",
      "deleted_at": null,
      "handled_by": "baa3a094-9908-40ec-9bed-43e543cad6aa",
      "updated_at": "2026-09-05T11:22:31.227834+00:00",
      "completed_at": "2026-09-05T11:22:31.167+00:00"
    }
    """

    @Test("snake_case 응답이 camelCase 속성으로 들어온다")
    func snakeCase() throws {
        let todo = try decoder.decode(Todo.self, from: Data(Self.realTodo.utf8))
        #expect(todo.ownerId == "baa3a094-9908-40ec-9bed-43e543cad6aa")
        #expect(todo.status == .done)
        #expect(todo.position == -68)
        #expect(todo.deletedAt == nil)
    }

    /// 소수 자릿수가 6이든 3이든 0이든 읽혀야 한다. 한 행만 실패해도 응답 전체가 무너진다.
    @Test("타임스탬프의 소수 자릿수가 섞여도 읽는다",
          arguments: ["2026-09-05T11:21:31.701884+00:00",
                      "2026-09-05T11:22:31.167+00:00",
                      "2026-09-05T11:22:31+00:00"])
    func timestamps(_ raw: String) throws {
        let json = Data("{\"createdAt\":\"\(raw)\"}".utf8)
        struct Box: Decodable { let createdAt: Date }
        #expect(throws: Never.self) { try decoder.decode(Box.self, from: json) }
    }

    /// **`dueDate`는 Date로 바꾸지 않는다.** 바꾸면 기기 시간대에 따라 하루가 밀린다.
    @Test("마감일은 문자열 그대로 남는다")
    func dueDateStaysString() throws {
        let todo = try decoder.decode(Todo.self, from: Data(Self.realTodo.utf8))
        #expect(todo.dueDate == "2026-09-05")
    }

    @Test("성공 응답은 data를 꺼낸다")
    func successEnvelope() throws {
        let json = Data("{\"success\":true,\"data\":\(Self.realTodo)}".utf8)
        let res = try decoder.decode(APIResponse<Todo>.self, from: json)
        guard case .success(let todo) = res else {
            Issue.record("성공으로 읽혀야 한다"); return
        }
        #expect(todo.title == "하나종합물류 계좌 150 넣어놓기")
    }

    /// **HTTP 200인데 실패다.** 상태 코드만 보는 코드가 놓치는 바로 그 경우.
    @Test("업무 오류는 200 본문 안에 있다")
    func failureEnvelope() throws {
        let json = Data(#"{"success":false,"error":"이 조직의 멤버가 아니에요."}"#.utf8)
        let res = try decoder.decode(APIResponse<Todo>.self, from: json)
        guard case .failure(let message) = res else {
            Issue.record("실패로 읽혀야 한다"); return
        }
        #expect(message == "이 조직의 멤버가 아니에요.")
    }

    @Test("data: null인 액션도 성공으로 읽힌다")
    func nullData() throws {
        let res = try decoder.decode(APIResponse<Empty>.self,
                                     from: Data(#"{"success":true,"data":null}"#.utf8))
        guard case .success = res else { Issue.record("성공이어야 한다"); return }
    }

    /// 상한(20개)에 걸려 안 온 완료 개수를 `doneTotals`로 알아낸다.
    @Test("보드 응답은 할 일과 완료 총계를 함께 준다")
    func boardPayload() throws {
        let json = Data("""
        {"todos":[\(Self.realTodo)],"doneTotals":{"baa3a094-9908-40ec-9bed-43e543cad6aa":56}}
        """.utf8)
        let board = try decoder.decode(BoardPayload.self, from: json)
        #expect(board.todos.count == 1)
        #expect(board.doneTotals["baa3a094-9908-40ec-9bed-43e543cad6aa"] == 56)
        #expect(BoardRules.notLoadedDoneCount(doneTotal: 56, loadedDone: 20) == 36)
    }

    /// 원 단위 정수다. Double로 받으면 합계에 오차가 쌓인다.
    @Test("가계부 금액은 Int64로 정확히 들어온다")
    func ledgerAmount() throws {
        let json = Data("""
        {"id":"a","org_id":"b","payer_id":"c","amount":999999999999,"title":"t",
         "spent_on":"2026-09-01","created_by":"c",
         "created_at":"2026-09-01T00:00:00+00:00","updated_at":"2026-09-01T00:00:00+00:00",
         "deleted_at":null}
        """.utf8)
        let entry = try decoder.decode(LedgerEntry.self, from: json)
        #expect(entry.amount == 999_999_999_999)
        #expect(entry.spentOn == "2026-09-01")
    }
}

@Suite("요청 인코딩")
struct EncodingTests {
    private let encoder = TodoLightCoding.makeEncoder()

    private func keys(_ value: some Encodable) throws -> Set<String> {
        let data = try encoder.encode(value)
        let obj = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        return Set(obj.keys)
    }

    /// **요청 키는 DB 컬럼이 아니라 액션 파라미터 이름이라 camelCase다.**
    /// 디코더와 짝을 맞추겠다고 snake_case로 바꾸면 모든 쓰기가 조용히 실패한다.
    @Test("요청 본문 키는 camelCase 그대로 나간다")
    func camelCaseStays() throws {
        let body = CreateTodoBody(orgId: "o", title: "t", ownerId: nil, dueDate: "2026-09-20", id: "i")
        #expect(try keys(body) == ["orgId", "title", "dueDate", "id"])
    }

    @Test("nil 옵셔널은 키 자체가 빠진다 (서버의 undefined 판정과 맞는다)")
    func nilOmitted() throws {
        let body = CreateTodoBody(orgId: "o", title: "t", ownerId: nil, dueDate: nil, id: "i")
        #expect(try !keys(body).contains("ownerId"))
        #expect(try !keys(body).contains("dueDate"))
    }

    @Test("FieldPatch.unchanged면 키를 만들지 않는다")
    func patchUnchanged() throws {
        let body = UpdateTodoBody(todoId: "t", patch: .init(title: "새 제목",
                                                            dueDate: .unchanged,
                                                            ownerId: nil))
        let data = try encoder.encode(body)
        let obj = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        let patch = obj["patch"] as! [String: Any]
        #expect(patch.keys.contains("title"))
        #expect(!patch.keys.contains("dueDate"))
    }

    /// 이게 깨지면 "마감 지우기"가 조용히 아무 일도 안 한다.
    @Test("FieldPatch.clear는 null을 보낸다")
    func patchClear() throws {
        let body = UpdateTodoBody(todoId: "t", patch: .init(title: nil,
                                                            dueDate: .clear,
                                                            ownerId: nil))
        let text = String(decoding: try encoder.encode(body), as: UTF8.self)
        #expect(text.contains("\"dueDate\":null"))
    }

    @Test("FieldPatch.set은 값을 보낸다")
    func patchSet() throws {
        let body = UpdateTodoBody(todoId: "t", patch: .init(title: nil,
                                                            dueDate: .set("2026-12-25"),
                                                            ownerId: nil))
        let text = String(decoding: try encoder.encode(body), as: UTF8.self)
        #expect(text.contains("\"dueDate\":\"2026-12-25\""))
    }

    @Test("프로필의 사진 지우기도 null로 나간다")
    func profileAvatarClear() throws {
        let body = UpdateProfileBody(displayName: nil, avatarUrl: .clear, theme: nil,
                                     locale: nil, showDone: nil, showLedger: nil)
        let text = String(decoding: try encoder.encode(body), as: UTF8.self)
        #expect(text.contains("\"avatarUrl\":null"))
        #expect(!text.contains("displayName"))
    }
}
