import Foundation
import Security
import Supabase
import TodoLightKit

/// 앱과 위젯이 **같은 로그인 세션**을 쓰게 한다 — 이 파일은 두 타깃에 같이 컴파일된다(project.yml).
///
/// 세션은 키체인에 있는데, 기본 위치는 앱만 읽을 수 있다. 위젯(별도 프로세스)이 서버를 부르려면
/// 앱과 같이 쓰는 접근 그룹에 둬야 한다. App Group 식별자가 그대로 키체인 접근 그룹으로도 쓰여서
/// 팀 접두어 없이 된다. 접근성은 SDK가 `AfterFirstUnlock`으로 둔다 — 잠금화면에서도 읽힌다
/// (기본값 `WhenUnlocked`였다면 잠긴 동안 위젯 체크가 통째로 실패한다).
enum SharedAuth {
    static let storage = KeychainLocalStorage(accessGroup: SharedStore.appGroup)

    /// SDK 기본 키 — `sb-{프로젝트}-auth-token`. 옮겨 담을 때 같은 키를 써야 SDK가 찾는다
    static var storageKey: String {
        "sb-\(AppConfig.supabaseURL.host()!.split(separator: ".")[0])-auth-token"
    }

    static func makeClient() -> SupabaseClient {
        SupabaseClient(
            supabaseURL: AppConfig.supabaseURL,
            supabaseKey: AppConfig.supabaseAnonKey,
            // 저장된 세션을 만료 여부와 상관없이 첫 이벤트로 준다 — 만료는 SessionStore가 본다
            options: SupabaseClientOptions(auth: .init(storage: storage, emitLocalSessionAsInitialSession: true))
        )
    }

    /// SDK가 키체인 항목을 두는 service — `KeychainLocalStorage`의 기본값
    static let service = "supabase.gotrue.swift"

    /// 예전 빌드가 앱 전용 위치에 둔 세션을 공유 위치로 한 번 옮긴다 — 업데이트했다고 로그아웃되지 않게.
    ///
    /// **SDK의 remove로 옛 항목을 지우면 안 된다.** 접근 그룹을 안 적은 키체인 질의는 앱이 볼 수 있는
    /// 모든 그룹에 걸려서, 방금 공유 그룹에 옮긴 세션까지 같이 지운다(실제로 그렇게 로그아웃됐다).
    /// 그래서 옛 항목을 그룹째로 찾아, 그 그룹을 짚어서 지운다. 안 지우고 두면 로그아웃한 뒤 다음 실행에
    /// 옛 세션이 다시 옮겨져 저절로 로그인된다.
    static func migrateIfNeeded() {
        guard (try? storage.retrieve(key: storageKey)) == nil else { return }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: storageKey,
            kSecMatchLimit as String: kSecMatchLimitAll,
            kSecReturnAttributes as String: true,
            kSecReturnData as String: true,
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let items = result as? [[String: Any]] else { return }
        for item in items {
            guard let group = item[kSecAttrAccessGroup as String] as? String, group != SharedStore.appGroup,
                  let data = item[kSecValueData as String] as? Data else { continue }
            // 못 옮기면 옛 자리에 그대로 둔다 — 다음 실행에 다시 시도한다
            guard (try? storage.store(key: storageKey, value: data)) != nil else { return }
            SecItemDelete([
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: service,
                kSecAttrAccount as String: storageKey,
                kSecAttrAccessGroup as String: group,
            ] as CFDictionary)
        }
    }
}
