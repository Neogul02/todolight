import Foundation
import Observation
import Supabase

/// 로그인 상태 하나만 든다. 화면은 이 값으로 로그인 ↔ 앱을 가른다.
@MainActor
@Observable
final class SessionStore {
    enum State: Equatable { case loading, signedOut, signedIn(userId: String) }

    private(set) var state: State = .loading
    @ObservationIgnored private var task: Task<Void, Never>?

    init() {
        task = Task { [weak self] in
            for await (event, session) in Backend.shared.supabase.auth.authStateChanges {
                guard let self else { return }
                switch event {
                case .initialSession:
                    // 저장된 세션이 만료됐어도 refresh 토큰이 살아 있으면 SDK가 다음 요청에서 갱신한다.
                    // 여기서 만료만 보고 로그아웃시키면 하루만 안 열어도 매번 다시 로그인하게 된다.
                    if let session {
                        state = .signedIn(userId: session.user.id.uuidString.lowercased())
                        if session.isExpired { _ = try? await Backend.shared.supabase.auth.refreshSession() }
                    } else {
                        state = .signedOut
                    }
                case .signedIn, .tokenRefreshed, .userUpdated:
                    if let session { state = .signedIn(userId: session.user.id.uuidString.lowercased()) }
                case .signedOut:
                    state = .signedOut
                default:
                    break
                }
            }
        }
    }

    func signOut() async {
        try? await Backend.shared.supabase.auth.signOut()
    }
}
