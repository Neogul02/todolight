import Foundation

/// 서버 주소와 공개 키.
///
/// anon(publishable) 키는 웹 번들에도 실려 나가는 **공개 키**라 앱에 넣어도 된다 — 권한은 RLS가 막는다.
/// service role(secret) 키는 절대 여기 두지 말 것. RLS를 통째로 우회한다.
enum AppConfig {
    static let supabaseURL = URL(string: "https://rscexhqsilstyogzatye.supabase.co")!
    static let supabaseAnonKey = "sb_publishable_fFDR8SYpfWojTJIwRStLYA_IpzKoP1T"
    /// `/api/v1`은 빼고 준다 — APIClient가 붙인다.
    static let apiBaseURL: URL = {
        #if DEBUG
        // 오프라인 동작 확인용 — 닿지 않는 주소를 주면 모든 API가 "연결 없음"으로 실패한다.
        //   SIMCTL_CHILD_TODOLIGHT_API_BASE=http://127.0.0.1:9 xcrun simctl launch …
        if let raw = ProcessInfo.processInfo.environment["TODOLIGHT_API_BASE"], let url = URL(string: raw) { return url }
        #endif
        return URL(string: "https://todolight.vercel.app")!
    }()
}
