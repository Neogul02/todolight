import Foundation

/// 부분 수정에서 **"손대지 않음"과 "비움"을 구분하는** 타입.
///
/// 서버의 patch 처리는 `patch.dueDate !== undefined`로 갈린다 —
/// 키가 **없으면** 그 필드를 안 건드리고, `null`이면 **지운다**.
/// Swift의 `String?`은 이 둘을 표현하지 못한다. `nil`을 그냥 넣으면 `JSONEncoder`가 키를
/// 통째로 빼 버려서 **"마감 지우기"가 조용히 아무 일도 안 하는** 것으로 끝난다.
///
/// ```swift
/// try await client.updateTodo(todoId: id, dueDate: .set("2026-09-20"))  // 마감 바꾸기
/// try await client.updateTodo(todoId: id, dueDate: .clear)              // 마감 지우기
/// try await client.updateTodo(todoId: id, title: "새 제목")              // 마감은 그대로
/// ```
public enum FieldPatch<T: Encodable & Sendable>: Sendable {
    /// 이 필드를 요청에 싣지 않는다 — 서버는 손대지 않는다.
    case unchanged
    case set(T)
    /// `null`을 보낸다 — 서버가 그 값을 비운다.
    case clear
}

extension KeyedEncodingContainer {
    /// `FieldPatch`를 규칙대로 쓴다: `unchanged`면 키 자체를 만들지 않는다.
    mutating func encodePatch<T>(_ patch: FieldPatch<T>, forKey key: Key) throws {
        switch patch {
        case .unchanged: break
        case .set(let value): try encode(value, forKey: key)
        case .clear: try encodeNil(forKey: key)
        }
    }
}
