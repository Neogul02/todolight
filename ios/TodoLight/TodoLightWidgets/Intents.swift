import AppIntents
import SwiftUI
import TodoLightKit
import WidgetKit

/// 위젯 프로세스에서 서버를 부른다 — 로그인 세션은 앱과 같이 쓰는 키체인에서 읽는다(SharedAuth)
enum WidgetBackend {
    static let supabase = SharedAuth.makeClient()

    static func api(lang: String) -> APIClient {
        APIClient(baseURL: AppConfig.apiBaseURL, language: { lang }) {
            try? await supabase.auth.session.accessToken
        }
    }
}

/// 잠금화면·홈 위젯에서 바로 끝내기 — 앱을 열지 않는다.
/// 위젯에서 먼저 빼서 다시 그리고(낙관적, 앱의 체크와 같다) 서버가 거절하면 돌려놓는다.
/// 서버 쪽 규칙은 그대로다 — `setTodoStatus`는 남의 할 일을 끝내지 못하게 막고, 위젯은 내 것에만 버튼을 단다.
struct CompleteTodoIntent: AppIntent {
    static let title: LocalizedStringResource = "할 일 끝내기"
    static let isDiscoverable = false

    @Parameter(title: "할 일") var todoId: String

    init() {}
    init(todoId: String) { self.todoId = todoId }

    func perform() async throws -> some IntentResult {
        guard let before = SharedStore.removeItem(todoId) else { return .result() }
        WidgetCenter.shared.reloadAllTimelines()
        do {
            _ = try await WidgetBackend.api(lang: before.lang).setTodoStatus(todoId: todoId, status: .done)
        } catch {
            // 연결이 없거나 거절됐다 — 체크가 된 것처럼 남겨 두면 앱을 열 때까지 거짓말이 된다
            SharedStore.save(before)
        }
        return .result()
    }
}

/// 잠금화면 아래 버튼(손전등 자리) — 앱을 열고 내 컬럼의 추가 칸에 바로 커서를 둔다.
/// 할 일을 적는 데는 키보드가 필요해서 위젯 안에서 끝낼 수 없다. 대신 누르자마자 적을 수 있게 한다.
struct QuickAddControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "TodoLightQuickAdd") {
            ControlWidgetButton(action: OpenURLIntent(URL(string: "todolight://add")!)) {
                Label(Words.device.quickAdd, systemImage: "plus.circle")
            }
        }
        .displayName(LocalizedStringResource(stringLiteral: Words.device.quickAdd))
        .description(LocalizedStringResource(stringLiteral: Words.device.quickAddDescription))
    }
}
