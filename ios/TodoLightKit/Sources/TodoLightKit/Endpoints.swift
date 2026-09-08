import Foundation

/*
  엔드포인트 42개를 타입이 붙은 함수로 감싼다. 경로 문자열을 화면 코드에 흩어 놓으면
  오타가 런타임까지 살아남고, 본문 키 하나가 틀리면 "필수 항목이 없어요"로만 돌아온다.

  요청 본문의 키는 **서버 액션의 파라미터 이름**이라 camelCase다(DB 컬럼이 아니다).
  응답은 DB 행이라 snake_case이고 디코더가 변환한다 — `Coding.swift` 참고.

  표와 계약의 근거는 `docs/api-v1.md` 하나다.
*/
extension APIClient {

    // MARK: - todos

    public func fetchBoard(orgId: String) async throws -> BoardPayload {
        try await call("todos/list", body: ["orgId": orgId])
    }

    /// - Parameter id: **클라이언트가 정해서 보낸다.** 낙관적으로 그린 카드와 같은 id로
    ///   저장해야, 뒤이어 도착하는 실시간 INSERT가 같은 행으로 인식돼 카드가 둘로 늘지 않는다.
    public func createTodo(
        orgId: String,
        title: String,
        ownerId: String? = nil,
        dueDate: String? = nil,
        id: String = UUID().uuidString.lowercased()
    ) async throws -> Todo {
        try await call("todos/create", body: CreateTodoBody(
            orgId: orgId, title: title, ownerId: ownerId, dueDate: dueDate, id: id
        ))
    }

    public func setTodoStatus(todoId: String, status: TodoStatus) async throws -> Todo {
        try await call("todos/setStatus", body: SetStatusBody(todoId: todoId, status: status))
    }

    /// - Parameter dueDate: `.unchanged`(기본)면 마감을 손대지 않고, `.clear`면 지운다.
    ///   `String?`으로는 이 둘을 구분할 수 없다 — `FieldPatch.swift` 참고.
    public func updateTodo(
        todoId: String,
        title: String? = nil,
        dueDate: FieldPatch<String> = .unchanged,
        ownerId: String? = nil
    ) async throws -> Todo {
        try await call("todos/update", body: UpdateTodoBody(
            todoId: todoId,
            patch: .init(title: title, dueDate: dueDate, ownerId: ownerId)
        ))
    }

    public func reorderTodo(todoId: String, position: Double) async throws -> Todo {
        try await call("todos/reorder", body: ReorderBody(todoId: todoId, position: position))
    }

    /// 소프트 삭제다. `restoreTodo`로 되살릴 수 있으므로 확인 창 대신 실행취소를 띄운다.
    public func deleteTodo(todoId: String) async throws {
        let _: Empty = try await call("todos/delete", body: ["todoId": todoId])
    }

    public func restoreTodo(todoId: String) async throws {
        let _: Empty = try await call("todos/restore", body: ["todoId": todoId])
    }

    public func addNote(todoId: String, content: String) async throws -> TodoNote {
        try await call("todos/addNote", body: ["todoId": todoId, "content": content])
    }

    public func updateNote(noteId: String, content: String) async throws -> TodoNote {
        try await call("todos/updateNote", body: ["noteId": noteId, "content": content])
    }

    public func deleteNote(noteId: String) async throws {
        let _: Empty = try await call("todos/deleteNote", body: ["noteId": noteId])
    }

    /// 남의 할 일을 대신 처리하고 메모를 남긴다.
    public func handleForMember(todoId: String, note: String) async throws -> HandoffResult {
        try await call("todos/handleForMember", body: ["todoId": todoId, "note": note])
    }

    public func joinTodo(todoId: String) async throws {
        let _: Empty = try await call("todos/join", body: ["todoId": todoId])
    }

    public func leaveTodo(todoId: String) async throws {
        let _: Empty = try await call("todos/leave", body: ["todoId": todoId])
    }

    // MARK: - orgs

    public func fetchMyOrgs() async throws -> [OrganizationSummary] {
        try await call("orgs/list")
    }

    public func createOrg(name: String) async throws -> Organization {
        try await call("orgs/create", body: ["name": name])
    }

    public func fetchMembers(orgId: String) async throws -> [MemberSummary] {
        try await call("orgs/members", body: ["orgId": orgId])
    }

    public func renameOrg(orgId: String, name: String) async throws {
        let _: Empty = try await call("orgs/rename", body: ["orgId": orgId, "name": name])
    }

    public func updateOrgImage(orgId: String, imageUrl: String?) async throws {
        let _: Empty = try await call("orgs/updateImage",
                                      body: OrgImageBody(orgId: orgId, imageUrl: imageUrl))
    }

    public func updateMemberOrder(orgId: String, orderedUserIds: [String]) async throws {
        let _: Empty = try await call("orgs/updateMemberOrder",
                                      body: MemberOrderBody(orgId: orgId,
                                                            orderedUserIds: orderedUserIds))
    }

    public func updateMemberRole(orgId: String, userId: String,
                                 role: MemberRole) async throws {
        let _: Empty = try await call("orgs/updateMemberRole",
                                      body: MemberRoleBody(orgId: orgId, userId: userId, role: role))
    }

    public func removeMember(orgId: String, userId: String) async throws {
        let _: Empty = try await call("orgs/removeMember", body: ["orgId": orgId, "userId": userId])
    }

    /// 물러난 방장은 관리자로 남는다. 되돌릴 권한이 나에게 없으므로 확인을 한 번 더 받을 것.
    public func transferOwnership(orgId: String, newOwnerId: String) async throws {
        let _: Empty = try await call("orgs/transferOwnership",
                                      body: ["orgId": orgId, "newOwnerId": newOwnerId])
    }

    /// **이 API에서 유일하게 소프트 삭제가 아니다.** 그 조직의 할 일·메모·일정·가계부가
    /// 함께 사라진다. 확인 두 단계 없이 부르지 말 것.
    public func deleteOrg(orgId: String) async throws {
        let _: Empty = try await call("orgs/delete", body: ["orgId": orgId])
    }

    /// 초대 메일은 나가지 않는다. 결과의 `registered`가 false면 **직접 알려 주라고**
    /// 화면이 말해야 한다.
    public func invite(orgId: String, email: String) async throws -> OrgInvite {
        try await call("orgs/invite", body: ["orgId": orgId, "email": email])
    }

    public func fetchOrgInvites(orgId: String) async throws -> [OrgInvite] {
        try await call("orgs/invites", body: ["orgId": orgId])
    }

    public func fetchMyInvites() async throws -> [OrgInvite] {
        try await call("orgs/myInvites")
    }

    public func respondToInvite(inviteId: String, accept: Bool) async throws -> InviteResponse {
        try await call("orgs/respondToInvite",
                       body: RespondInviteBody(inviteId: inviteId, accept: accept))
    }

    public func revokeInvite(inviteId: String) async throws {
        let _: Empty = try await call("orgs/revokeInvite", body: ["inviteId": inviteId])
    }

    /// 방장·관리자만 값을 받는다. **로그에 남기지 말 것** — 그 URL을 아는 사람은 누구나
    /// 그 Discord 채널에 글을 쓸 수 있다.
    public func fetchWebhook(orgId: String) async throws -> String? {
        try await call("orgs/webhook", body: ["orgId": orgId], as: String?.self)
    }

    public func updateWebhook(orgId: String, webhookUrl: String) async throws {
        let _: Empty = try await call("orgs/updateWebhook",
                                      body: ["orgId": orgId, "webhookUrl": webhookUrl])
    }

    // MARK: - events

    public func fetchEvents(orgId: String) async throws -> [OrgEvent] {
        try await call("events/list", body: ["orgId": orgId])
    }

    /// 시작·끝을 거꾸로 넣어도 막지 않는다 — 서버가 뒤집어서 저장한다.
    public func createEvent(orgId: String, title: String, color: String,
                            startDate: String, endDate: String) async throws -> OrgEvent {
        try await call("events/create", body: CreateEventBody(
            orgId: orgId, title: title, color: color, startDate: startDate, endDate: endDate
        ))
    }

    public func updateEvent(eventId: String, title: String? = nil, color: String? = nil,
                            startDate: String? = nil, endDate: String? = nil) async throws -> OrgEvent {
        try await call("events/update", body: UpdateEventBody(
            eventId: eventId,
            patch: .init(title: title, color: color, startDate: startDate, endDate: endDate)
        ))
    }

    public func deleteEvent(eventId: String) async throws {
        let _: Empty = try await call("events/delete", body: ["eventId": eventId])
    }

    public func restoreEvent(eventId: String) async throws {
        let _: Empty = try await call("events/restore", body: ["eventId": eventId])
    }

    // MARK: - ledger

    /// - Parameter month: `YYYY-MM`. 범위가 없으면 합계가 영원히 커지기만 해서 의미를 잃는다.
    public func fetchLedger(orgId: String, month: String) async throws -> [LedgerEntry] {
        try await call("ledger/list", body: ["orgId": orgId, "month": month])
    }

    /// - Parameter amount: **원 단위 정수.** 0·음수 불가, 상한 1조.
    public func createLedgerEntry(orgId: String, amount: Int64, title: String,
                                  spentOn: String, payerId: String? = nil) async throws -> LedgerEntry {
        try await call("ledger/create", body: CreateLedgerBody(
            orgId: orgId, amount: amount, title: title, spentOn: spentOn, payerId: payerId
        ))
    }

    public func deleteLedgerEntry(id: String) async throws -> DeletedId {
        try await call("ledger/delete", body: ["id": id])
    }

    public func restoreLedgerEntry(id: String) async throws -> LedgerEntry {
        try await call("ledger/restore", body: ["id": id])
    }

    // MARK: - profile / account

    public func fetchMyProfile() async throws -> Profile {
        try await call("profile/me")
    }

    /// - Parameter avatarUrl: `.clear`면 프로필 사진을 지운다. 값을 넣을 때는 **우리
    ///   Storage의 `avatars/{userId}/` 아래**를 가리켜야 한다(서버가 검증한다).
    public func updateProfile(displayName: String? = nil,
                              avatarUrl: FieldPatch<String> = .unchanged,
                              theme: String? = nil, locale: String? = nil,
                              showDone: Bool? = nil, showLedger: Bool? = nil) async throws -> Profile {
        try await call("profile/update", body: UpdateProfileBody(
            displayName: displayName, avatarUrl: avatarUrl,
            theme: theme, locale: locale, showDone: showDone, showLedger: showLedger
        ))
    }

    /// **되돌릴 수 없다.** 성공하면 그 토큰은 더 이상 쓸 수 없으므로, 앱은 즉시 로컬 세션을
    /// 지우고 로그인 화면으로 가야 한다. 방장인 조직의 이양과 혼자인 조직 삭제는 서버가 한다.
    public func deleteMyAccount() async throws {
        let _: Empty = try await call("account/delete")
    }
}

// MARK: - 요청 본문
//
// 키가 하나뿐이거나 값 타입이 같은 것은 [String: String] 리터럴로 보내고,
// 타입이 섞이거나 옵셔널이 있는 것만 구조체로 둔다. `nil`인 옵셔널 필드는 인코딩에서
// 통째로 빠지므로(JSONEncoder 기본), 서버의 `patch?.field !== undefined` 판정과 맞는다.

struct CreateTodoBody: Encodable, Sendable {
    let orgId: String
    let title: String
    let ownerId: String?
    let dueDate: String?
    let id: String
}

struct SetStatusBody: Encodable, Sendable {
    let todoId: String
    let status: TodoStatus
}

struct UpdateTodoBody: Encodable, Sendable {
    struct Patch: Encodable, Sendable {
        let title: String?
        let dueDate: FieldPatch<String>
        let ownerId: String?

        enum CodingKeys: String, CodingKey { case title, dueDate, ownerId }

        // `title`·`ownerId`는 null이 의미를 갖지 않아 `encodeIfPresent`로 충분하다.
        // `dueDate`만 "안 보냄 / 값 / null" 셋을 구분해야 한다.
        func encode(to encoder: any Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            try c.encodeIfPresent(title, forKey: .title)
            try c.encodeIfPresent(ownerId, forKey: .ownerId)
            try c.encodePatch(dueDate, forKey: .dueDate)
        }
    }
    let todoId: String
    let patch: Patch
}

struct ReorderBody: Encodable, Sendable {
    let todoId: String
    let position: Double
}

struct OrgImageBody: Encodable, Sendable {
    let orgId: String
    let imageUrl: String?
}

struct MemberOrderBody: Encodable, Sendable {
    let orgId: String
    let orderedUserIds: [String]
}

struct MemberRoleBody: Encodable, Sendable {
    let orgId: String
    let userId: String
    let role: MemberRole
}

struct RespondInviteBody: Encodable, Sendable {
    let inviteId: String
    let accept: Bool
}

struct CreateEventBody: Encodable, Sendable {
    let orgId: String
    let title: String
    let color: String
    let startDate: String
    let endDate: String
}

struct UpdateEventBody: Encodable, Sendable {
    struct Patch: Encodable, Sendable {
        let title: String?
        let color: String?
        let startDate: String?
        let endDate: String?
    }
    let eventId: String
    let patch: Patch
}

struct CreateLedgerBody: Encodable, Sendable {
    let orgId: String
    let amount: Int64
    let title: String
    let spentOn: String
    let payerId: String?
}

struct UpdateProfileBody: Encodable, Sendable {
    let displayName: String?
    let avatarUrl: FieldPatch<String>
    let theme: String?
    let locale: String?
    let showDone: Bool?
    let showLedger: Bool?

    enum CodingKeys: String, CodingKey {
        case displayName, avatarUrl, theme, locale, showDone, showLedger
    }

    func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(displayName, forKey: .displayName)
        try c.encodeIfPresent(theme, forKey: .theme)
        try c.encodeIfPresent(locale, forKey: .locale)
        try c.encodeIfPresent(showDone, forKey: .showDone)
        try c.encodeIfPresent(showLedger, forKey: .showLedger)
        try c.encodePatch(avatarUrl, forKey: .avatarUrl)
    }
}
