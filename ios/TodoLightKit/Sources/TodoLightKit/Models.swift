import Foundation

// `types/db.ts`와 1:1이다. 저쪽을 고치면 여기도 고친다.

public enum MemberRole: String, Codable, Sendable {
    case owner, admin, member
}

public enum TodoStatus: String, Codable, Sendable {
    case todo, doing, done
}

public enum InviteStatus: String, Codable, Sendable {
    case pending, accepted, declined, revoked
}

public struct Profile: Decodable, Sendable, Identifiable {
    public let id: String
    public let email: String?
    public let displayName: String
    public let avatarColor: String?
    public let avatarUrl: String?
    public let theme: String
    public let locale: String
    public let showDone: Bool
    public let showLedger: Bool
    /// 조직 id → 나를 뺀 팀원 순서. 정한 적 없는 조직은 키 자체가 없다.
    public let memberOrder: [String: [String]]
    public let createdAt: Date
}

public struct Organization: Decodable, Sendable, Identifiable {
    public let id: String
    public let name: String
    public let ownerId: String
    public let imageUrl: String?
    public let createdAt: Date
}

/// `orgs/list`가 주는 것 — 조직에 내 역할과 멤버 수가 얹혀 있다.
public struct OrganizationSummary: Decodable, Sendable, Identifiable {
    public let id: String
    public let name: String
    public let ownerId: String
    public let imageUrl: String?
    public let createdAt: Date
    public let role: MemberRole
    public let memberCount: Int
}

/// 보드 컬럼 하나 = 멤버 한 명.
public struct MemberSummary: Decodable, Sendable, Identifiable {
    public let userId: String
    public let role: MemberRole
    public let displayName: String
    public let avatarColor: String?
    public let avatarUrl: String?
    public let email: String?

    public var id: String { userId }
}

public struct OrgInvite: Decodable, Sendable, Identifiable {
    public let id: String
    public let orgId: String
    public let email: String
    public let invitedBy: String
    public let status: InviteStatus
    public let createdAt: Date
    public let respondedAt: Date?
    /// 조인해서 채우는 표시용 — 목록 종류에 따라 없을 수 있다
    public let orgName: String?
    public let inviterName: String?
    /// **이 이메일로 가입한 계정이 있는가.** 이 앱은 초대 메일을 보내지 않으므로,
    /// `false`면 초대한 사람이 직접 알려 줘야 한다 — 화면이 그걸 말해야 한다.
    /// `orgs/myInvites`에는 없는 필드다.
    public let registered: Bool?
}

public struct TodoNote: Decodable, Sendable, Identifiable {
    public let id: String
    public let todoId: String
    public let authorId: String
    public let content: String
    public let createdAt: Date
    public let authorName: String?
    public let authorColor: String?
    public let authorAvatarUrl: String?
}

public struct Todo: Decodable, Sendable, Identifiable {
    public let id: String
    public let orgId: String
    /// 보드에서 어느 컬럼에 놓일지를 정하는 값. `createdBy`와 다르면 남이 부탁한 할 일이다.
    public let ownerId: String
    public let title: String
    public let status: TodoStatus
    /// `YYYY-MM-DD` 또는 nil. **Date로 바꾸지 말 것** — 기기 시간대에 따라 하루가 밀린다.
    public let dueDate: String?
    public let position: Double
    public let createdBy: String
    /// 남이 대신 처리했으면 그 사람. 본인 처리면 `ownerId`와 같다.
    public let handledBy: String?
    public let completedAt: Date?
    public let createdAt: Date
    public let updatedAt: Date
    /// 소프트 삭제 시각. 목록 조회에는 애초에 안 실려 오지만, 실시간 UPDATE로는 온다.
    public let deletedAt: Date?

    /// 조인해서 채우는 필드들. **상태 변경류 응답에는 안 담긴다** — 그래서 옵셔널이고,
    /// 캐시에 병합할 때 기존 값을 유지해야 한다(웹 `useBoardRealtime`과 같은 규칙).
    public let notes: [TodoNote]?
    public let participantIds: [String]?

    public var noteList: [TodoNote] { notes ?? [] }
    public var participants: [String] { participantIds ?? [] }

    /// 남이 내 목록에 넣어 준 할 일 — 카드에 "OOO이 부탁" 배지가 뜨는 조건.
    public var isRequestedByOther: Bool { createdBy != ownerId }
    /// 남이 대신 처리해 준 할 일.
    public var isHandledByOther: Bool {
        guard let handledBy else { return false }
        return handledBy != ownerId
    }
}

/// `todos/list`의 응답. **유계다** — 자세한 규칙은 `docs/api-v1.md`.
public struct BoardPayload: Decodable, Sendable {
    /// 미완료는 전부, 완료는 주인별 최근 20개까지만 들어 있다.
    public let todos: [Todo]
    /// 주인 id → 그 사람이 완료한 할 일의 **총** 개수(상한과 무관한 전체).
    /// 화면은 여기서 실제로 받은 개수를 빼서 "이보다 오래된 것이 몇 개 더 있는지"를 말한다.
    public let doneTotals: [String: Int]
}

public struct OrgEvent: Decodable, Sendable, Identifiable {
    public let id: String
    public let orgId: String
    public let title: String
    /// 색 **키**다. 실제 색값은 클라이언트가 갖는다(웹의 `lib/event-colors.ts`와 같은 표).
    public let color: String
    /// `YYYY-MM-DD`
    public let startDate: String
    /// 하루짜리면 `startDate`와 같다.
    public let endDate: String
    public let createdBy: String
    public let createdAt: Date
    public let updatedAt: Date
    public let deletedAt: Date?
}

public struct LedgerEntry: Decodable, Sendable, Identifiable {
    public let id: String
    public let orgId: String
    /// 돈을 낸 사람. 남 대신 적어 줄 수 있어서 `createdBy`와 다를 수 있다.
    public let payerId: String
    /// **원 단위 정수.** Double로 받지 말 것 — 합계에 오차가 쌓인다.
    public let amount: Int64
    public let title: String
    /// 쓴 날 (`YYYY-MM-DD`, KST). `createdAt`과 다르다 — 어제 쓴 걸 오늘 적는 게 정상이다.
    public let spentOn: String
    public let createdBy: String
    public let createdAt: Date
    public let updatedAt: Date
    public let deletedAt: Date?
}

/// `orgs/respondToInvite`의 응답. 수락이면 그 조직으로 바로 전환하라는 뜻이다.
public struct InviteResponse: Decodable, Sendable {
    public let orgId: String?
}

/// `todos/handleForMember`의 응답.
public struct HandoffResult: Decodable, Sendable {
    public let todo: Todo
    public let note: TodoNote
}

/// `ledger/delete`의 응답.
public struct DeletedId: Decodable, Sendable {
    public let id: String
}
