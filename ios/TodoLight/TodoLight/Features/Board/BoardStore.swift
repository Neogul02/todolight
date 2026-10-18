import Foundation
import Observation
import Supabase
import TodoLightKit

/// 한 조직의 보드 상태와 모든 쓰기 — 웹 `useOrgBoard` + `useTodoMutations`를 합친 자리.
///
/// 규칙은 웹과 같다(CLAUDE.md 「할 일 쓰기 동작」):
/// - 추가·체크·삭제·대신 처리·넘기기는 **낙관적으로** 먼저 그리고, 실패하면 되돌리고 알린다.
/// - 추가할 행 id는 **여기서 정한다** — 실시간 INSERT가 같은 행으로 합쳐져 카드가 둘이 되지 않는다.
/// - 요청이 날아다니는 행은 실시간 병합에서 건너뛴다(`pending`). 커밋 전 값이 낙관적 값을 덮는다.
/// - 끝나면 400ms 모아 한 번 재조회해 서버 상태로 수렴한다.
@MainActor
@Observable
final class BoardStore {
    enum Phase: Equatable { case loading, ready, failed(String) }

    let orgId: String
    let userId: String

    private(set) var phase: Phase = .loading
    private(set) var members: [MemberSummary] = []
    private(set) var todos: [Todo] = []
    private(set) var doneTotals: [String: Int] = [:]
    private(set) var showDone = true
    /// `profiles.theme` — 앱 루트의 ThemeStore가 이 값을 따라간다
    private(set) var themePreference: String?
    /// `profiles.locale` — 웹에서 바꾼 언어를 앱이 따라간다
    private(set) var localePreference: String?
    /// `profiles.show_ledger` — 끄면 탭바에서 가계부 칸이 사라진다
    private(set) var showLedger = true
    /// 서버에 닿지 못하고 있다 — 화면은 마지막 상태(기기 캐시)와 쌓아 둔 쓰기로 그린다
    private(set) var offline = false
    /// 연결을 기다리는 쓰기 수(화면에 "N개 보낼 준비" 같은 안내를 띄우는 데 쓴다)
    var queuedCount: Int { queue.count }
    /// 카드 펼침은 보드 전체에서 하나뿐이다
    var openTodoId: String?
    /// 화면 아래에 띄울 알림(에러·실행취소)
    var banner: Banner?

    struct Banner: Identifiable {
        let id = UUID()
        let message: String
        var undo: (@MainActor () -> Void)?
    }

    /// 행 id → 날아다니는 요청 수. **Set이면 안 된다** — 체크를 연달아 누르면 먼저 끝난 요청이
    /// 표시를 지워, 아직 날아다니는 두 번째 요청의 낙관적 값을 실시간 행이 덮는다(웹 `pending-todos.ts`).
    @ObservationIgnored private var pending: [String: Int] = [:]
    /// 쓰기가 시작될 때마다 올린다. 그보다 먼저 출발한 `load()`의 결과는 낙관적 값을 덮으므로 버린다
    /// — 웹 `onMutate`가 `cancelQueries`를 먼저 기다리는 것과 같은 일.
    @ObservationIgnored private var writeGeneration = 0
    @ObservationIgnored private var resyncTask: Task<Void, Never>?
    @ObservationIgnored private var channel: RealtimeChannelV2?
    @ObservationIgnored private var listeners: [Task<Void, Never>] = []
    /// 연결이 돌아오면 보낼 쓰기 — 기기에 저장해 앱을 껐다 켜도 남는다
    private var queue: [PendingWrite] = [] {
        didSet { OfflineCache.save(queue, as: "queue-\(orgId)") }
    }
    @ObservationIgnored private var flushing = false

    private var api: APIClient { Backend.shared.api }

    init(orgId: String, userId: String) {
        self.orgId = orgId
        self.userId = userId
        // 마지막으로 본 보드를 먼저 그린다 — 서버 응답은 그 위에 덮는다
        if let snap = OfflineCache.load(BoardSnapshot.self, key: "board-\(orgId)") {
            todos = snap.todos
            doneTotals = snap.doneTotals
            members = snap.members
            showDone = snap.showDone
            showLedger = snap.showLedger
            phase = .ready
        }
        queue = OfflineCache.load([PendingWrite].self, key: "queue-\(orgId)") ?? []
    }

    private func saveSnapshot() {
        OfflineCache.save(
            BoardSnapshot(todos: todos, doneTotals: doneTotals, members: members, showDone: showDone, showLedger: showLedger),
            as: "board-\(orgId)"
        )
    }

    /// 쌓아 둔 쓰기를 순서대로 보낸다. 다시 닿지 못하면 멈추고(다음 기회에), 서버가 거절한 것은 버리고 알린다.
    func flush() async {
        guard !queue.isEmpty, !flushing else { return }
        flushing = true
        defer { flushing = false }
        while let next = queue.first {
            do {
                try await next.send(api)
                queue.removeFirst()
            } catch where APIError.isOffline(error) {
                offline = true
                return
            } catch {
                // 그 사이 남이 지웠거나 권한이 바뀌었다 — 다시 보내도 같은 답이라 버린다
                queue.removeFirst()
                banner = Banner(message: Self.message(error))
            }
        }
    }

    var me: MemberSummary? { members.first { $0.userId == userId } }
    func member(_ id: String?) -> MemberSummary? { members.first { $0.userId == id } }
    var isManager: Bool { me?.role == .owner || me?.role == .admin }

    /// 이 사람 컬럼에 놓일 할 일. 같이하기로 참여한 남의 할 일도 내 컬럼에 함께 뜬다(웹과 같다).
    func column(for memberId: String) -> (open: [Todo], done: [Todo]) {
        BoardRules.split(todos.filter { $0.ownerId == memberId || $0.participants.contains(memberId) })
    }

    /// 주인 · 만든 사람 · 방장/관리자 — 서버 `canManageTodo`와 같은 규칙
    func canManage(_ todo: Todo) -> Bool {
        todo.ownerId == userId || todo.createdBy == userId || isManager
    }

    // MARK: - 읽기

    func load() async {
        await flush()
        let startedAt = writeGeneration
        do {
            async let board = api.fetchBoard(orgId: orgId)
            async let list = api.fetchMembers(orgId: orgId)
            async let profile = api.fetchMyProfile()
            let (b, m, p) = try await (board, list, profile)
            // 출발한 뒤 쓰기가 있었거나 아직 날아다니면 목록은 낡았다 — 그 쓰기가 끝날 때 다시 읽는다
            // 아직 못 보낸 쓰기가 있으면 서버 목록은 그걸 모른다 — 덮으면 오프라인에서 한 체크가 풀린다
            if writeGeneration == startedAt && pending.isEmpty && queue.isEmpty {
                todos = b.todos
                doneTotals = b.doneTotals
            }
            showDone = p.showDone
            themePreference = p.theme
            localePreference = p.locale
            showLedger = p.showLedger
            members = Self.order(m, me: userId, saved: p.memberOrder[orgId] ?? [])
            phase = .ready
            offline = false
            saveSnapshot()
        } catch {
            if APIError.isOffline(error) { offline = true }
            // 캐시로 이미 그리고 있으면 그대로 둔다 — 오프라인에서 빈 화면·에러보다 마지막 상태가 낫다
            if phase != .ready { phase = .failed(Self.message(error)) }
        }
    }

    /// 내 컬럼이 항상 첫 번째, 그다음은 내가 정해 둔 순서(`profiles.member_order`), 나머지는 서버 순서.
    static func order(_ members: [MemberSummary], me: String, saved: [String]) -> [MemberSummary] {
        let rank = Dictionary(uniqueKeysWithValues: saved.enumerated().map { ($1, $0) })
        let others = members.filter { $0.userId != me }.enumerated().sorted { a, b in
            (rank[a.element.userId] ?? saved.count + a.offset) < (rank[b.element.userId] ?? saved.count + b.offset)
        }.map(\.element)
        return members.filter { $0.userId == me } + others
    }

    private func resyncSoon() {
        resyncTask?.cancel()
        resyncTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(400))
            guard !Task.isCancelled else { return }
            await self?.load()
        }
    }

    // MARK: - 실시간

    /// `board-{orgId}` 채널. 웹소켓 인증은 supabase-swift가 세션 토큰으로 맞춰 준다 —
    /// 토큰 없이 붙으면 RLS(`is_org_member`)에 막혀 아무 행도 안 온다(웹 P0-1과 같은 함정).
    func startRealtime() async {
        guard channel == nil else { return }
        let supabase = Backend.shared.supabase
        let channel = supabase.channel("board-\(orgId)")
        let todoChanges = channel.postgresChange(AnyAction.self, table: "todos", filter: "org_id=eq.\(orgId)")
        let noteChanges = channel.postgresChange(AnyAction.self, table: "todo_notes")
        let joinChanges = channel.postgresChange(AnyAction.self, table: "todo_participants", filter: "org_id=eq.\(orgId)")
        self.channel = channel

        listeners = [
            Task { [weak self] in
                for await action in todoChanges { self?.apply(action) }
            },
            // 메모는 작성자 조인, 참여자는 participant_ids가 필요해서 다시 읽는다
            Task { [weak self] in
                for await _ in noteChanges { self?.resyncSoon() }
            },
            Task { [weak self] in
                for await _ in joinChanges { self?.resyncSoon() }
            },
        ]
        do {
            try await channel.subscribeWithError()
        } catch {
            // 조용히 죽은 채로 두지 않는다 — 웹에서 실시간이 몰래 끊겨 있던 일이 있었다(CLAUDE.md 「실시간」).
            // 채널을 비워 다음 진입에서 다시 붙게 하고, 놓친 변경은 한 번 읽어 맞춘다.
            await stopRealtime()
            resyncSoon()
        }
    }

    func stopRealtime() async {
        listeners.forEach { $0.cancel() }
        listeners = []
        if let channel { await Backend.shared.supabase.removeChannel(channel) }
        channel = nil
    }

    private func apply(_ action: AnyAction) {
        switch action {
        case .delete(let del):
            if case .string(let id)? = del.oldRecord["id"] { todos.removeAll { $0.id == id } }
        case .insert(let ins):
            merge { try ins.decodeRecord(as: Todo.self, decoder: $0) }
        case .update(let upd):
            merge { try upd.decodeRecord(as: Todo.self, decoder: $0) }
        }
    }

    private func merge(_ decode: (JSONDecoder) throws -> Todo) {
        do {
            let row = try decode(TodoLightCoding.makeDecoder())
            guard pending[row.id] == nil else { return }
            todos = BoardRules.merge(todos, row: row)
        } catch {
            // 형식을 못 읽으면 통째로 다시 받는다 — 놓치는 것보다 왕복 한 번이 낫다
            resyncSoon()
        }
    }

    // MARK: - 쓰기

    /// 낙관적으로 바꾸고, 요청이 실패하면 되돌린다.
    /// `queued`를 주면 **닿지 못해서** 실패했을 때 되돌리지 않고 큐에 넣는다(연결되면 보낸다).
    private func mutate(
        _ id: String,
        queued: PendingWrite? = nil,
        optimistic: (inout [Todo]) -> Void,
        request: @escaping @Sendable () async throws -> Void,
        onSuccess: (@MainActor () -> Void)? = nil
    ) {
        resyncTask?.cancel()
        writeGeneration += 1
        let snapshot = todos
        optimistic(&todos)
        pending[id, default: 0] += 1
        Task {
            do {
                try await request()
                onSuccess?()
            } catch where queued != nil && APIError.isOffline(error) {
                let firstTime = queue.isEmpty
                queue.append(queued!)
                offline = true
                saveSnapshot()
                if firstTime {
                    banner = Banner(message: tr("오프라인이에요. 연결되면 바로 보낼게요.", "You're offline. We'll send it once you're back online."))
                }
            } catch {
                todos = snapshot
                banner = Banner(message: Self.message(error))
            }
            if let n = pending[id], n > 1 { pending[id] = n - 1 } else { pending[id] = nil }
            resyncSoon()
        }
    }

    private func update(_ id: String, in list: inout [Todo], _ change: (inout Todo) -> Void) {
        if let i = list.firstIndex(where: { $0.id == id }) { change(&list[i]) }
    }

    func create(title: String, ownerId: String, dueDate: String? = nil) {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        let top = todos.filter { $0.ownerId == ownerId }.map(\.position).min() ?? 1
        let todo = Todo(
            id: UUID().uuidString.lowercased(), orgId: orgId, ownerId: ownerId,
            title: trimmed, dueDate: dueDate, position: top - 1, createdBy: userId
        )
        let api = api, orgId = orgId
        mutate(todo.id, queued: .create(id: todo.id, orgId: orgId, title: trimmed, ownerId: ownerId, dueDate: dueDate),
               optimistic: { $0.append(todo) }) {
            _ = try await api.createTodo(orgId: orgId, title: trimmed, ownerId: ownerId, dueDate: dueDate, id: todo.id)
        }
    }

    /// 제목만 고친다 — 바꾼 칸만 보내야 그 사이 실시간으로 들어온 남의 마감 수정을 덮지 않는다.
    func rename(_ todo: Todo, to title: String) {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed != todo.title else { return }
        let api = api
        mutate(todo.id, queued: .rename(todoId: todo.id, title: trimmed),
               optimistic: { list in update(todo.id, in: &list) { $0.title = trimmed } }) {
            _ = try await api.updateTodo(todoId: todo.id, title: trimmed)
        }
    }

    /// 마감은 고르는 순간 저장한다(웹 동작 줄의 마감 알약과 같다).
    func setDue(_ todo: Todo, _ due: String?) {
        guard due != todo.dueDate else { return }
        let api = api
        mutate(todo.id, queued: .setDue(todoId: todo.id, dueDate: due),
               optimistic: { list in update(todo.id, in: &list) { $0.dueDate = due } }) {
            _ = try await api.updateTodo(todoId: todo.id, dueDate: due.map { .set($0) } ?? .clear)
        }
    }

    /// 내 할 일 체크·되돌리기. 남의 할 일을 끝내는 건 `handOff`(메모 필수)로만 간다.
    func toggle(_ todo: Todo) {
        let done = todo.status != .done
        let next: TodoStatus = done ? .done : .todo
        let api = api, userId = userId
        mutate(todo.id, queued: .setStatus(todoId: todo.id, status: next), optimistic: { list in
            update(todo.id, in: &list) {
                $0.status = next
                // 서버와 같은 규칙으로 미리 채워야 "대신 처리" 배지가 깜빡이지 않는다
                $0.handledBy = done ? userId : nil
                $0.completedAt = done ? Date() : nil
            }
        }) {
            _ = try await api.setTodoStatus(todoId: todo.id, status: next)
        }
    }

    func remove(_ todo: Todo) {
        let api = api
        mutate(todo.id, queued: .delete(todoId: todo.id), optimistic: { $0.removeAll { $0.id == todo.id } }, request: {
            try await api.deleteTodo(todoId: todo.id)
        }, onSuccess: { [weak self] in
            // 소프트 삭제라 확인 창 대신 실행취소를 준다
            self?.banner = Banner(message: tr("할 일을 지웠어요", "To-do deleted")) { [weak self] in self?.restore(todo) }
        })
    }

    private func restore(_ todo: Todo) {
        banner = nil
        Task {
            do { try await api.restoreTodo(todoId: todo.id) } catch { banner = Banner(message: Self.message(error)) }
            await load()
        }
    }

    func handOff(_ todo: Todo, note: String) {
        let api = api, userId = userId
        mutate(todo.id, optimistic: { list in
            update(todo.id, in: &list) {
                $0.status = .done
                $0.handledBy = userId
                $0.completedAt = Date()
            }
        }, request: {
            _ = try await api.handleForMember(todoId: todo.id, note: note)
        }, onSuccess: { [weak self] in
            self?.banner = Banner(message: tr("대신 처리했어요", "Handled for them"))
        })
    }

    func give(_ todo: Todo, to member: MemberSummary, note: String?, isUndo: Bool = false) {
        let api = api, userId = userId
        let from = todo.ownerId
        let top = todos.filter { $0.ownerId == member.userId && $0.id != todo.id }.map(\.position).min() ?? 1
        openTodoId = nil
        mutate(todo.id, optimistic: { list in
            update(todo.id, in: &list) {
                $0.ownerId = member.userId
                $0.givenBy = userId
                $0.position = top - 1
                $0.participantIds = $0.participants.filter { $0 != member.userId }
            }
        }, request: {
            _ = try await api.giveTodo(todoId: todo.id, toUserId: member.userId, note: note)
        }, onSuccess: { [weak self] in
            guard let self, !isUndo, let original = self.member(from) else { return }
            var moved = todo
            moved.ownerId = member.userId
            self.banner = Banner(message: tr("\(member.displayName)님에게 넘겼어요", "Handed off to \(member.displayName)")) { [weak self] in
                self?.banner = nil
                self?.give(moved, to: original, note: nil, isUndo: true)
            }
        })
    }

    func addNote(_ todo: Todo, content: String) {
        let trimmed = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        // 메모는 작성자 이름·아바타 조인이 필요해서 낙관적으로 그리지 않는다
        Task {
            do { _ = try await api.addNote(todoId: todo.id, content: trimmed) } catch {
                banner = Banner(message: Self.message(error))
            }
            await load()
        }
    }

    /// 내 메모 고치기 — 작성자·아바타는 그대로라 낙관적으로 바꾼다(웹 editNote)
    func editNote(_ todo: Todo, noteId: String, content: String) {
        let trimmed = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        let api = api
        mutate(todo.id, optimistic: { list in
            update(todo.id, in: &list) { t in
                t.notes = t.notes?.map { n in
                    var n = n
                    if n.id == noteId { n.content = trimmed }
                    return n
                }
            }
        }) {
            _ = try await api.updateNote(noteId: noteId, content: trimmed)
        }
    }

    /// 내 메모 지우기 — **하드 삭제**라 되살릴 수 없다. 짧은 메모 한 줄이라 할 일과 달리 실행취소 없이 바로(웹과 같다)
    func deleteNote(_ todo: Todo, noteId: String) {
        let api = api
        mutate(todo.id, optimistic: { list in
            update(todo.id, in: &list) { $0.notes = $0.notes?.filter { $0.id != noteId } }
        }) {
            try await api.deleteNote(noteId: noteId)
        }
    }

    /// 순서 바꾸기 — 새 position만 보낸다(계산은 BoardRules.reorderedPosition). 다시 보내도 같은 값이라
    /// 오프라인 큐에 넣지 않아도 되지만, 순서는 금방 다시 바뀌는 값이라 실패하면 그냥 되돌린다.
    func reorder(_ todoId: String, to position: Double) {
        let api = api
        mutate(todoId, optimistic: { list in update(todoId, in: &list) { $0.position = position } }) {
            _ = try await api.reorderTodo(todoId: todoId, position: position)
        }
    }

    func setJoined(_ todo: Todo, _ join: Bool) {
        let api = api, userId = userId
        mutate(todo.id, optimistic: { list in
            update(todo.id, in: &list) {
                $0.participantIds = join ? $0.participants + [userId] : $0.participants.filter { $0 != userId }
            }
        }) {
            if join { try await api.joinTodo(todoId: todo.id) } else { try await api.leaveTodo(todoId: todo.id) }
        }
    }

    /// 서버가 준 해요체 문구는 그대로, 나머지는 사람이 읽을 말로.
    static func message(_ error: any Error) -> String {
        switch error {
        case APIError.server(let text): text
        case APIError.unauthorized: tr("다시 로그인해 주세요.", "Please log in again.")
        case APIError.rateLimited: tr("잠시 후에 다시 시도해 주세요.", "Please try again shortly.")
        default: tr("연결이 불안정해요. 잠시 후에 다시 시도해 주세요.", "Connection is unstable. Please try again shortly.")
        }
    }
}
