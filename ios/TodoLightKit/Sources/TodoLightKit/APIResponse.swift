import Foundation

/// 서버가 돌려주는 판별 유니온. 웹의 `ApiResponse<T>`(`types/api.ts`)와 같은 것이다.
///
/// **업무 오류에도 HTTP 200이 온다.** "이 조직의 멤버가 아니에요", "제목을 입력해 주세요"
/// 같은 것이 전부 `200 + {success:false, error}`다 — 상태 코드만 보고 성공으로 단정하는
/// 코드는 이 API에서 반드시 틀린다. 그래서 `APIClient`가 본문을 이 타입으로 먼저 읽고,
/// 실패면 `APIError.server`로 바꿔 던진다.
///
/// `error` 문구는 서버가 `Accept-Language`에 맞춰 만든, **사용자에게 그대로 보여도 되는**
/// 해요체 문장이다. 앱에서 다시 번역하거나 문자열로 분기하지 말 것 — 문구가 바뀌면 깨진다.
public enum APIResponse<T: Decodable & Sendable>: Decodable, Sendable {
    case success(T)
    case failure(String)

    private enum CodingKeys: String, CodingKey {
        case success, data, error
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        if try c.decode(Bool.self, forKey: .success) {
            self = .success(try c.decode(T.self, forKey: .data))
        } else {
            self = .failure(try c.decode(String.self, forKey: .error))
        }
    }
}

/// `data`가 `null`인 액션(`deleteTodo` 등)을 위한 자리 표시.
/// `APIResponse<Empty>`로 받으면 성공/실패 판정은 그대로 하면서 본문은 버린다.
public struct Empty: Decodable, Sendable {
    public init() {}
    public init(from decoder: any Decoder) throws {
        // 서버는 여기에 null을 보낸다. 무엇이 오든 무시한다.
        self.init()
    }
}
