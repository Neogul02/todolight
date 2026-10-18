import Foundation
import Observation
import Supabase

/// 누가 어느 카드를 보고 있나 · 입력 중인가 — 웹 `useFocusPresence` · `useTypingPresence`와 **같은 채널·이벤트·페이로드**.
/// 웹과 앱이 같은 `presence-{orgId}` 채널에서 서로의 표시를 받으므로 이름 하나만 달라도 한쪽이 조용히 안 보인다.
///
/// 브로드캐스트는 저장되지 않는 신호라 놓쳐도 그만이다 — 그래서 받은 표시는 TTL로 저절로 사라지고,
/// 보는 동안은 하트비트로 다시 보낸다(정지 신호를 못 받아도, 상대가 앱을 그냥 꺼도 남지 않게).
@MainActor
@Observable
final class PresenceStore {
    enum Field: String { case title, note }

    struct Viewer: Equatable { let userId: String; let expiresAt: Date }
    struct Typer: Equatable { let userId: String; let displayName: String; let field: Field; let expiresAt: Date }

    /// 할 일 id → 지금 그 카드를 펼쳐 둔 다른 사람(먼저 들어온 순)
    private(set) var viewers: [String: [Viewer]] = [:]
    /// 할 일 id → 지금 그 카드의 제목·메모를 입력 중인 다른 사람
    private(set) var typers: [String: [Typer]] = [:]

    // 웹과 같은 값 — 바꾸려면 양쪽을 같이 바꾼다
    /// 보는 중 표시가 버티는 시간 — 하트비트 두 번을 놓쳐도 깜빡이지 않게 넉넉히
    private static let focusTTL: TimeInterval = 9
    private static let heartbeat: Duration = .seconds(4)
    /// 입력 중 표시가 버티는 시간
    private static let typingTTL: TimeInterval = 4
    /// 연속 입력 중 최대 전송 빈도
    private static let typingThrottle: TimeInterval = 1.5
    /// 이만큼 더 안 치면 멈춘 것으로 보고 정지 신호를 보낸다
    private static let typingStop: Duration = .seconds(2)

    private let orgId: String
    private let userId: String
    @ObservationIgnored private var channel: RealtimeChannelV2?
    @ObservationIgnored private var listeners: [Task<Void, Never>] = []
    @ObservationIgnored private var heartbeatTask: Task<Void, Never>?
    @ObservationIgnored private var focusedId: String?
    /// "할일id:칸" → 마지막 전송 시각 · 정지 타이머
    @ObservationIgnored private var typingSent: [String: (at: Date, stop: Task<Void, Never>?)] = [:]

    init(orgId: String, userId: String) {
        self.orgId = orgId
        self.userId = userId
    }

    func start() async {
        guard channel == nil else { return }
        let userId = userId
        let channel = Backend.shared.supabase.channel("presence-\(orgId)") { $0.presence.key = userId }
        self.channel = channel
        let streams = ["focus", "unfocus", "typing", "stopped_typing"].map { ($0, channel.broadcastStream(event: $0)) }
        listeners = streams.map { event, stream in
            Task { [weak self] in
                for await message in stream {
                    // 콜백에 오는 건 메시지 전체({type, event, payload}) — 실은 값은 payload 안에 있다
                    guard let payload = message["payload"]?.objectValue else { continue }
                    self?.receive(event, payload)
                }
            }
        }
        // 하트비트를 못 받는 경우(앱을 그냥 끔)를 위한 청소 — 웹과 같이 1초마다
        listeners.append(Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1))
                self?.sweep()
            }
        })
        do {
            try await channel.subscribeWithError()
            // 구독 전에 카드를 펼쳤으면 그 신호는 못 나갔다 — 붙자마자 다시 알린다
            if let focusedId { send("focus", ["userId": .string(userId), "todoId": .string(focusedId), "at": .integer(Self.now)]) }
        } catch {
            await stop()
        }
    }

    func stop() async {
        listeners.forEach { $0.cancel() }
        listeners = []
        heartbeatTask?.cancel()
        heartbeatTask = nil
        typingSent.values.forEach { $0.stop?.cancel() }
        typingSent = [:]
        if let channel { await Backend.shared.supabase.removeChannel(channel) }
        channel = nil
        viewers = [:]
        typers = [:]
    }

    /// 펼친 카드가 바뀔 때 — 앞 카드엔 unfocus, 새 카드엔 focus + 하트비트(웹 BoardClient의 openTodoId 이펙트)
    func setFocused(_ todoId: String?) {
        guard todoId != focusedId else { return }
        heartbeatTask?.cancel()
        heartbeatTask = nil
        if let old = focusedId { send("unfocus", ["userId": .string(userId), "todoId": .string(old)]) }
        focusedId = todoId
        guard let todoId else { return }
        let focus: () -> Void = { [weak self] in
            guard let self else { return }
            self.send("focus", ["userId": .string(self.userId), "todoId": .string(todoId), "at": .integer(Self.now)])
        }
        focus()
        heartbeatTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: Self.heartbeat)
                guard !Task.isCancelled, self?.focusedId == todoId else { return }
                focus()
            }
        }
    }

    /// 한 글자 칠 때마다 부른다 — 보내는 건 1.5초에 한 번, 2초 멈추면 정지 신호(웹 broadcastTyping)
    func typed(_ todoId: String, _ field: Field, displayName: String) {
        let key = "\(todoId):\(field.rawValue)"
        var state = typingSent[key] ?? (at: .distantPast, stop: nil)
        if Date().timeIntervalSince(state.at) >= Self.typingThrottle {
            state.at = Date()
            send("typing", [
                "userId": .string(userId), "displayName": .string(displayName),
                "todoId": .string(todoId), "field": .string(field.rawValue), "at": .integer(Self.now),
            ])
        }
        state.stop?.cancel()
        state.stop = Task { [weak self] in
            try? await Task.sleep(for: Self.typingStop)
            guard !Task.isCancelled, let self else { return }
            self.send("stopped_typing", ["userId": .string(self.userId), "todoId": .string(todoId), "field": .string(field.rawValue)])
            self.typingSent[key] = nil
        }
        typingSent[key] = state
    }

    // MARK: - 받기

    private func receive(_ event: String, _ p: JSONObject) {
        guard let from = p["userId"]?.stringValue, from != userId,   // 내 신호는 무시
              let todoId = p["todoId"]?.stringValue else { return }
        switch event {
        case "focus":
            var list = (viewers[todoId] ?? []).filter { $0.userId != from }
            list.append(Viewer(userId: from, expiresAt: Date().addingTimeInterval(Self.focusTTL)))
            viewers[todoId] = list
        case "unfocus":
            remove(&viewers, todoId) { $0.userId == from }
        case "typing", "stopped_typing":
            guard let field = p["field"]?.stringValue.flatMap(Field.init) else { return }
            remove(&typers, todoId) { $0.userId == from && $0.field == field }
            if event == "typing" {
                let name = p["displayName"]?.stringValue ?? ""
                typers[todoId, default: []].append(Typer(userId: from, displayName: name, field: field,
                                                         expiresAt: Date().addingTimeInterval(Self.typingTTL)))
            }
        default: break
        }
    }

    private func sweep() {
        let now = Date()
        let v = viewers.compactMapValues { list in list.filter { $0.expiresAt > now }.nilIfEmpty }
        let t = typers.compactMapValues { list in list.filter { $0.expiresAt > now }.nilIfEmpty }
        // 바뀐 게 없으면 건드리지 않는다 — 1초마다 화면 전체를 다시 그리지 않게
        if v != viewers { viewers = v }
        if t != typers { typers = t }
    }

    private func remove<T>(_ map: inout [String: [T]], _ todoId: String, where match: (T) -> Bool) {
        guard var list = map[todoId] else { return }
        list.removeAll(where: match)
        map[todoId] = list.isEmpty ? nil : list
    }

    private func send(_ event: String, _ payload: JSONObject) {
        guard let channel else { return }
        Task { await channel.broadcast(event: event, message: payload) }
    }

    /// 웹 `Date.now()`와 같은 밀리초
    private static var now: Int { Int(Date().timeIntervalSince1970 * 1000) }
}

private extension Array {
    var nilIfEmpty: Self? { isEmpty ? nil : self }
}
