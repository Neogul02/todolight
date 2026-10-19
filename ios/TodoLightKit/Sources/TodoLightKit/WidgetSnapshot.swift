import Foundation

/// 위젯이 그리는 것 전부 — 앱이 보드를 받을 때마다 App Group에 써 두고, 위젯은 이것만 읽는다.
///
/// 위젯은 별도 프로세스라 앱의 메모리도 로그인 세션도 못 본다. 서버를 직접 부르려면 토큰을
/// 키체인으로 나눠 써야 하는데(유료 계정의 Keychain Sharing이 필요하다), 그 전에도 "앱이 마지막으로
/// 본 내 할 일"은 언제나 보여 줄 수 있다 — 위젯이 빈칸으로 뜨는 일이 없게 이게 바닥이다.
public struct WidgetSnapshot: Codable, Equatable, Sendable {
    public struct Item: Codable, Equatable, Sendable {
        public let id: String
        public let title: String
        /// "yyyy-MM-dd"(KST) — 날짜 라벨은 위젯이 그리는 시점에 계산한다(자정이 지나면 "오늘"이 "어제"가 된다)
        public let dueDate: String?

        public init(id: String, title: String, dueDate: String?) {
            self.id = id
            self.title = title
            self.dueDate = dueDate
        }
    }

    public let orgName: String
    /// 내 미완료 전체 개수 — `items`는 그중 앞의 몇 개뿐이다
    public let openCount: Int
    /// 내 미완료, 보드 컬럼과 같은 순서(급한 것부터)
    public let items: [Item]
    /// 앱 언어("ko"/"en") — 위젯은 앱의 설정을 못 읽는다
    public let lang: String

    public init(orgName: String, openCount: Int, items: [Item], lang: String) {
        self.orgName = orgName
        self.openCount = openCount
        self.items = items
        self.lang = lang
    }

    /// 보드에서 내 컬럼의 미완료로 만든다 — 보드와 같은 정렬(`BoardRules.split`)을 쓴다
    public static func make(orgName: String, todos: [Todo], userId: String, lang: String, limit: Int = 4) -> WidgetSnapshot {
        let mine = BoardRules.split(todos.filter { $0.ownerId == userId || $0.participants.contains(userId) }).open
        return WidgetSnapshot(
            orgName: orgName,
            openCount: mine.count,
            items: mine.prefix(limit).map { Item(id: $0.id, title: $0.title, dueDate: $0.dueDate) },
            lang: lang
        )
    }
}

/// 앱과 위젯이 같이 쓰는 저장소(App Group 컨테이너) — 파일 하나다.
public enum SharedStore {
    public static let appGroup = "group.com.neogul02.todolight"

    private static var url: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)?
            .appending(path: "widget.json")
    }

    /// 바뀌었을 때만 쓰고 true — 같은 값으로 위젯을 다시 그리게 하지 않는다(갱신 예산이 있다)
    @discardableResult
    public static func save(_ snapshot: WidgetSnapshot) -> Bool {
        // 키 순서를 고정한다 — 순서가 흔들리면 같은 내용도 "바뀜"으로 보여 위젯을 쓸데없이 다시 그린다
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        guard let url, let data = try? encoder.encode(snapshot) else { return false }
        if let old = try? Data(contentsOf: url), old == data { return false }
        return (try? data.write(to: url, options: .atomic)) != nil
    }

    public static func load() -> WidgetSnapshot? {
        guard let url, let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
    }

    /// 로그아웃 — 잠금화면에 남의 할 일이 남으면 안 된다
    public static func clear() {
        guard let url else { return }
        try? FileManager.default.removeItem(at: url)
    }
}
