import Foundation
import Supabase
import TodoLightKit

/// Supabase(로그인·실시간)와 `/api/v1`(쓰기·조회)을 한곳에서 잇는다 — docs/ios-m2-setup.md §4.
final class Backend: Sendable {
    static let shared = Backend()

    let supabase: SupabaseClient
    let api: APIClient

    private init() {
        // 세션은 위젯과 같이 쓰는 키체인 자리에 둔다(SharedAuth) — 옛 자리에 있으면 먼저 옮긴다
        SharedAuth.migrateIfNeeded()
        let supabase = SharedAuth.makeClient()
        self.supabase = supabase
        /*
          **갱신은 SDK가 한다.** `session`은 만료가 가까우면 refresh한 새 토큰을 돌려준다 —
          우리가 만료를 재거나 타이머를 두면 반드시 한 번은 놓친다.
          로그아웃 상태에서는 throw하므로 nil로 떨어뜨려 서버가 401을 주게 둔다.
        */
        self.api = APIClient(baseURL: AppConfig.apiBaseURL, language: { AppLang.current.rawValue }) {
            try? await supabase.auth.session.accessToken
        }
    }
}
