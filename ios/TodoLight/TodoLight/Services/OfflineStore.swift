import Foundation
import Network
import Observation
import TodoLightKit

/// 마지막으로 받은 화면을 기기에 둔다 — 비행기 모드나 지하철에서 앱을 열어도 빈 화면이 아니라
/// 마지막 보드가 보인다. 켜자마자 이걸 먼저 그리고, 서버 응답이 오면 바꾼다.
///
/// SwiftData가 아니라 JSON 파일 몇 개다. 필요한 건 "마지막 응답 한 벌"이지 질의할 데이터베이스가 아니고,
/// 서버 응답 모양 그대로 두면 스키마를 두 벌(서버·기기) 관리할 일이 없다.
/// Caches 디렉터리에 둔다 — 지워져도 다음 접속에서 다시 받으면 그만인 값이다(백업 대상도 아니다).
enum OfflineCache {
    private static var dir: URL {
        let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        let d = base.appending(path: "offline", directoryHint: .isDirectory)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }

    private static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()

    private static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    static func save<T: Encodable>(_ value: T, as key: String) {
        guard let data = try? encoder.encode(value) else { return }
        try? data.write(to: dir.appending(path: "\(key).json"), options: .atomic)
    }

    static func load<T: Decodable>(_ type: T.Type, key: String) -> T? {
        guard let data = try? Data(contentsOf: dir.appending(path: "\(key).json")) else { return nil }
        return try? decoder.decode(type, from: data)
    }

    /// 로그아웃·계정 삭제 — 다음 사람이 이 기기에서 남의 보드를 보면 안 된다
    static func clear() {
        try? FileManager.default.removeItem(at: dir)
    }
}

/// 보드 한 장의 스냅숏 — 화면에 필요한 것만
struct BoardSnapshot: Codable {
    var todos: [Todo]
    var doneTotals: [String: Int]
    var members: [MemberSummary]
    var showDone: Bool
    var showLedger: Bool
}

/// 연결이 없을 때 쌓아 두는 쓰기. **다시 보내도 결과가 같은 것만** 넣는다 —
/// 같은 값으로 두 번 바꾸기, 이미 지운 것 지우기, 클라이언트가 정한 id로 추가(같은 id는 한 번만 들어간다).
/// 대신 처리·넘기기·메모는 넣지 않는다: 사람에게 가는 일이라 몇 시간 뒤 몰래 실행되면 안 된다.
enum PendingWrite: Codable, Equatable {
    case setStatus(todoId: String, status: TodoStatus)
    case create(id: String, orgId: String, title: String, ownerId: String, dueDate: String?)
    case delete(todoId: String)
    case rename(todoId: String, title: String)
    case setDue(todoId: String, dueDate: String?)

    var todoId: String {
        switch self {
        case .setStatus(let id, _), .delete(let id), .rename(let id, _), .setDue(let id, _): id
        case .create(let id, _, _, _, _): id
        }
    }

    func send(_ api: APIClient) async throws {
        switch self {
        case .setStatus(let id, let status): _ = try await api.setTodoStatus(todoId: id, status: status)
        case .create(let id, let orgId, let title, let ownerId, let due):
            _ = try await api.createTodo(orgId: orgId, title: title, ownerId: ownerId, dueDate: due, id: id)
        case .delete(let id): try await api.deleteTodo(todoId: id)
        case .rename(let id, let title): _ = try await api.updateTodo(todoId: id, title: title)
        case .setDue(let id, let due): _ = try await api.updateTodo(todoId: id, dueDate: due.map { .set($0) } ?? .clear)
        }
    }
}

extension APIError {
    /// 서버가 거절한 게 아니라 **닿지 못한** 것 — 이때만 큐에 넣는다.
    /// 서버가 "권한이 없어요"라고 답한 쓰기를 큐에 넣으면 연결될 때마다 같은 거절을 되풀이한다.
    static func isOffline(_ error: any Error) -> Bool {
        if case APIError.transport = error { return true }
        return error is URLError
    }
}

/// 네트워크가 돌아오는 순간을 알린다 — 그때 쌓아 둔 쓰기를 보낸다.
@MainActor
@Observable
final class Connectivity {
    static let shared = Connectivity()
    private(set) var online = true
    @ObservationIgnored private let monitor = NWPathMonitor()

    private init() {
        monitor.pathUpdateHandler = { [weak self] path in
            let up = path.status == .satisfied
            Task { @MainActor in self?.online = up }
        }
        monitor.start(queue: DispatchQueue(label: "todolight.connectivity"))
    }
}
