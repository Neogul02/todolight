import Testing
@testable import TodoLight

struct AppConfigTests {
    /// 앱에 실리는 키는 공개 키여야 한다 — secret 키가 들어가면 RLS가 통째로 뚫린다.
    @Test func anonKeyIsPublishable() {
        #expect(AppConfig.supabaseAnonKey.hasPrefix("sb_publishable_"))
    }
}
