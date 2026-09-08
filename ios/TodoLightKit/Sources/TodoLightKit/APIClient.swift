import Foundation

/// `/api/v1`을 부르다 생기는 일. **재시도해도 되는 것과 아닌 것이 갈린다.**
public enum APIError: Error, Sendable {
    /// 토큰이 없거나·위조·만료. 갱신 후 한 번 재시도하고, 그래도 나면 로그아웃한다.
    case unauthorized
    /// 분당 한도 초과. `retryAfter`초 쉬었다 다시.
    case rateLimited(retryAfter: TimeInterval)
    /// 본문이 JSON이 아니다. **클라이언트 버그이므로 재시도하지 말 것.**
    case badRequest
    /// 서버가 `success:false`로 답했다. 문구는 사용자에게 **그대로 보여도 되는** 해요체다.
    case server(String)
    case transport(any Error)
    case decoding(any Error)
    case unexpectedStatus(Int)
}

extension APIError {
    /// 같은 요청을 그대로 다시 보내도 되는가.
    public var isRetryable: Bool {
        switch self {
        case .rateLimited, .transport, .unauthorized: true
        case .badRequest, .server, .decoding, .unexpectedStatus: false
        }
    }
}

/// `/api/v1` 클라이언트.
///
/// **인증 SDK를 모른다.** 토큰은 `tokenProvider` 클로저로 받는다 — supabase-swift가 갱신까지
/// 책임지고, 이 층은 그때그때 유효한 문자열 하나만 있으면 된다. 그래야 이 패키지를 테스트할 때
/// 실제 로그인이 필요 없고, 나중에 인증을 바꿔도 여기는 안 흔들린다.
public actor APIClient {
    private let baseURL: URL
    private let session: URLSession
    private let tokenProvider: @Sendable () async throws -> String?
    private let decoder = TodoLightCoding.makeDecoder()
    private let encoder = TodoLightCoding.makeEncoder()

    /// - Parameters:
    ///   - baseURL: 앱 주소. `https://todolight.vercel.app` 처럼 `/api/v1`은 빼고 준다.
    ///   - tokenProvider: 지금 유효한 access token. 로그아웃 상태면 nil.
    public init(
        baseURL: URL,
        session: URLSession = .shared,
        tokenProvider: @escaping @Sendable () async throws -> String?
    ) {
        self.baseURL = baseURL
        self.session = session
        self.tokenProvider = tokenProvider
    }

    /// 본문이 있는 호출.
    public func call<Body: Encodable & Sendable, Result: Decodable & Sendable>(
        _ path: String,
        body: Body,
        as: Result.Type = Result.self
    ) async throws -> Result {
        try await send(path: path, bodyData: try encoder.encode(body))
    }

    /// 본문이 없는 호출. **`{}`를 보낸다** — 서버는 JSON이 아닌 본문을 400으로 돌려준다.
    public func call<Result: Decodable & Sendable>(
        _ path: String,
        as: Result.Type = Result.self
    ) async throws -> Result {
        try await send(path: path, bodyData: Data("{}".utf8))
    }

    private func send<Result: Decodable & Sendable>(
        path: String,
        bodyData: Data
    ) async throws -> Result {
        var request = URLRequest(url: baseURL.appending(path: "api/v1/\(path)"))
        request.httpMethod = "POST"
        request.httpBody = bodyData
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        /*
          에러 문구의 언어를 정하는 헤더. **안 보내면 서버가 한국어로 답한다.**
          액션이 만든 문구가 그대로 사용자에게 보이므로, 이 한 줄이 앱 전체의 에러 언어다.
        */
        request.setValue(Self.acceptLanguage, forHTTPHeaderField: "Accept-Language")

        if let token = try await tokenProvider() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.transport(error)
        }

        guard let http = response as? HTTPURLResponse else {
            throw APIError.unexpectedStatus(-1)
        }

        switch http.statusCode {
        case 200:
            break
        case 401:
            throw APIError.unauthorized
        case 429:
            let retry = (http.value(forHTTPHeaderField: "Retry-After")).flatMap(TimeInterval.init)
            throw APIError.rateLimited(retryAfter: retry ?? 60)
        case 400:
            throw APIError.badRequest
        default:
            throw APIError.unexpectedStatus(http.statusCode)
        }

        /*
          **200이라고 성공이 아니다.** "이 조직의 멤버가 아니에요" 같은 업무 오류가 전부
          200 + {success:false}로 온다 — 여기서 판별 유니온으로 읽지 않으면 통째로 놓친다.
        */
        let decoded: APIResponse<Result>
        do {
            decoded = try decoder.decode(APIResponse<Result>.self, from: data)
        } catch {
            throw APIError.decoding(error)
        }

        switch decoded {
        case .success(let value): return value
        case .failure(let message): throw APIError.server(message)
        }
    }

    /// 기기 설정에서 뽑되 서버가 아는 두 값 중 하나로 떨어뜨린다.
    /// 서버도 모르는 값이면 한국어로 가므로, 여기서 미리 정해 보내는 편이 예측 가능하다.
    private static let acceptLanguage: String = {
        let preferred = Locale.preferredLanguages.first ?? "ko"
        return preferred.hasPrefix("ko") ? "ko" : "en"
    }()
}
