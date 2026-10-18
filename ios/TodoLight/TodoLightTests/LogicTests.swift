import Foundation
import SwiftUI
import Testing
import TodoLightKit
@testable import TodoLight

/// 웹과 같아야 하는 계산 — 어긋나면 같은 데이터가 웹과 앱에서 다른 그림이 된다.
@MainActor
struct CalendarMathTests {
    @Test func gridPadsToWholeWeeks() {
        let days = CalendarMath.grid("2026-10")
        #expect(days.count % 7 == 0)
        // 2026-10-01은 목요일(4) — 앞에 빈칸 넷
        #expect(days.prefix(4).allSatisfy { $0 == nil })
        #expect(days[4] == "2026-10-01")
        #expect(days.compactMap { $0 }.count == 31)
    }

    @Test func monthArithmetic() {
        #expect(CalendarMath.shift("2026-12", 1) == "2027-01")
        #expect(CalendarMath.shift("2026-01", -1) == "2025-12")
        #expect(CalendarMath.lastDay(of: "2026-02") == "2026-02-28")
        #expect(CalendarMath.lastDay(of: "2028-02") == "2028-02-29")
        #expect(CalendarMath.weekday("2026-10-18") == 0) // 일요일
    }

    @Test func lanesReuseWhenNoOverlap() {
        let a = event("a", "2026-10-02", "2026-10-15")
        let b = event("b", "2026-10-09", "2026-10-11")   // a와 겹친다
        let c = event("c", "2026-10-16", "2026-10-20")   // a가 끝난 뒤 — a의 줄을 다시 쓴다
        let lanes = CalendarMath.lanes([a, b, c])
        #expect(lanes["a"] != lanes["b"])
        #expect(lanes["c"] == lanes["a"])
    }

    @Test func segmentsBreakAtWeekAndMonth() {
        // 10/30(금) ~ 11/03 — 10월 화면에서는 10/31(토, 말일)에서 끊긴다
        let e = event("x", "2026-10-30", "2026-11-03")
        let days = CalendarMath.grid("2026-10")
        let lastWeek = Array(days.suffix(7))
        let segs = CalendarMath.segments(week: lastWeek, month: "2026-10", events: [e], lanes: ["x": 0])
        #expect(segs.count == 1)
        #expect(segs[0].span == 2)
        #expect(segs[0].roundStart)
        #expect(!segs[0].roundEnd)  // 다음 달로 이어지므로 각지게

        // 10/09(금) ~ 10/13(화) — 일요일 10/11에서 새 조각이 시작한다
        let f = event("y", "2026-10-09", "2026-10-13")
        let week3 = Array(days[14..<21])  // 10/11 ~ 10/17
        let s2 = CalendarMath.segments(week: week3, month: "2026-10", events: [f], lanes: ["y": 0])
        #expect(s2.count == 1)
        #expect(s2[0].column == 0)
        #expect(s2[0].span == 3)
        #expect(!s2[0].roundStart)
        #expect(s2[0].roundEnd)
    }

    private func event(_ id: String, _ start: String, _ end: String) -> OrgEvent {
        let json = """
        {"id":"\(id)","org_id":"o","title":"\(id)","color":"green","start_date":"\(start)","end_date":"\(end)",
         "created_by":"u","created_at":"2026-10-01T00:00:00Z","updated_at":"2026-10-01T00:00:00Z","deleted_at":null}
        """
        return try! TodoLightCoding.makeDecoder().decode(OrgEvent.self, from: Data(json.utf8))
    }
}

// AvatarView는 SwiftUI View라 메인 액터 전용 — 테스트가 병렬로 다른 스레드에서 부르면 런타임에 멈춘다
@MainActor
struct AvatarColorTests {
    /// 기대값은 웹 lib/avatar.ts의 getAvatarColor(null, seed)를 node로 돌린 결과다
    @Test(arguments: [
        ("daf30159-873b-4d06-957e-a69d8e9a3321", "clay"),
        ("u1", "plum"),
        ("f3a9c1d2-0000-4000-8000-000000000001", "amber"),
    ])
    func matchesWebHash(seed: String, key: String) {
        let got = AvatarView.color(key: nil, seed: seed)
        let want = AvatarPalette.colors.first { $0.key == key }!
        #expect(got.bg == want.bg)
    }

    @Test func chosenKeyWins() {
        let got = AvatarView.color(key: "sea", seed: "anything")
        #expect(got.bg == AvatarPalette.colors.first { $0.key == "sea" }!.bg)
    }
}

@MainActor
struct PendingWriteTests {
    @Test func roundTrips() throws {
        let writes: [PendingWrite] = [
            .setStatus(todoId: "t", status: .done),
            .create(id: "n", orgId: "o", title: "우유 사기", ownerId: "u", dueDate: nil),
            .delete(todoId: "t"),
            .rename(todoId: "t", title: "새 제목"),
            .setDue(todoId: "t", dueDate: "2026-10-20"),
        ]
        let data = try JSONEncoder().encode(writes)
        #expect(try JSONDecoder().decode([PendingWrite].self, from: data) == writes)
    }
}

/// 칩·컬럼 순서 — 웹 BoardClient의 orderedMembers와 같아야 같은 사람이 같은 자리에 선다
@MainActor
struct MemberOrderTests {
    private func m(_ id: String, _ name: String) -> MemberSummary {
        MemberSummary(userId: id, role: .member, displayName: name, avatarColor: nil, avatarUrl: nil, email: nil)
    }

    @Test func meFirstThenSavedThenByName() {
        let list = [m("c", "다연"), m("me", "나"), m("a", "가람"), m("b", "나래"), m("d", "라온")]
        let ordered = BoardStore.order(list, me: "me", saved: ["d", "gone", "b"])
        // 저장된 순서(d, b) — 없는 id(gone)는 건너뛴다 — 그다음 처음 보는 사람은 이름순(a 가람, c 다연)
        #expect(ordered.map(\.userId) == ["me", "d", "b", "a", "c"])
    }
}
