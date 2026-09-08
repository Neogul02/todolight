import Foundation
import Testing
@testable import TodoLightKit

/*
  진짜 서버에 붙는 테스트.

  **기본적으로 건너뛴다.** 네트워크와 계정이 필요한 테스트가 평소 `swift test`에 섞이면,
  비행기 안에서도 CI에서도 빨간 줄이 뜨고 사람들이 곧 결과를 안 믿게 된다.
  돌리려면 둘 다 준다:

      TODOLIGHT_BASE_URL=https://todolight.vercel.app \
      TODOLIGHT_TOKEN=<access_token> \
      swift test --filter LiveAPI

  토큰은 supabase-swift로 로그인해서 얻거나, 개발용으로는 Supabase auth REST에서 바로 받는다.
  **쓰기는 하지 않는다** — 남의 조직에 흔적을 남기지 않으려고 조회만 검증한다.
*/
@Suite("LiveAPI", .enabled(if: LiveConfig.isConfigured))
struct LiveAPITests {

    private func makeClient() -> APIClient {
        APIClient(baseURL: LiveConfig.baseURL!) { LiveConfig.token }
    }

    @Test("내 프로필을 읽는다 — Bearer가 서버 액션까지 닿는다")
    func profile() async throws {
        let me = try await makeClient().fetchMyProfile()
        #expect(!me.id.isEmpty)
        #expect(!me.displayName.isEmpty)
    }

    @Test("내 조직 목록을 읽는다")
    func orgs() async throws {
        let orgs = try await makeClient().fetchMyOrgs()
        // 조직이 없는 계정일 수도 있다 — 디코딩이 성공했다는 것이 요점이다
        #expect(orgs.allSatisfy { !$0.id.isEmpty })
    }

    /// 남의 조직을 조회하면 **액션의 가드가** 막는다. 이 앱의 권한 규칙이 앱에도
    /// 그대로 적용된다는 뜻이라, 여기가 통과하면 클라이언트에 권한 코드를 둘 필요가 없다.
    @Test("남의 조직은 서버가 막는다")
    func guardsApply() async throws {
        do {
            _ = try await makeClient().fetchBoard(orgId: "00000000-0000-4000-8000-000000000000")
            Issue.record("멤버가 아닌 조직인데 통과했다")
        } catch APIError.server(let message) {
            // 문구는 Accept-Language에 따라 달라지므로 내용으로 단정하지 않는다
            #expect(!message.isEmpty)
        }
    }

    /// 토큰이 없으면 401이고, 그건 업무 오류가 아니라 "다시 받아 오라"는 신호다.
    @Test("토큰 없이 부르면 401")
    func unauthorized() async throws {
        let anonymous = APIClient(baseURL: LiveConfig.baseURL!) { nil }
        do {
            _ = try await anonymous.fetchMyProfile()
            Issue.record("토큰 없이 통과했다")
        } catch APIError.unauthorized {
            // 기대한 경로
        }
    }
}

enum LiveConfig {
    static var baseURL: URL? {
        ProcessInfo.processInfo.environment["TODOLIGHT_BASE_URL"].flatMap(URL.init(string:))
    }
    static var token: String? {
        ProcessInfo.processInfo.environment["TODOLIGHT_TOKEN"]
    }
    static var isConfigured: Bool { baseURL != nil && token != nil }
}
