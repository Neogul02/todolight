import Foundation
import Observation
import TodoLightKit

/// 일정 — 웹 `hooks/useOrgEvents.ts`. 할 일은 보드와 **같은 BoardStore**를 그대로 쓴다
/// (웹에서도 보드와 달력이 같은 쿼리 캐시를 쓴다).
///
/// 일정은 실시간 채널이 없다(웹도 없다) — 화면에 들어올 때와 쓴 뒤에 다시 읽는다.
/// 낙관적으로 그리지 않는다: 쓰는 일이 드물고, 띠 줄(lane) 배치가 서버 목록 전체를 봐야 정해진다.
@MainActor
@Observable
final class CalendarStore {
    let orgId: String
    private(set) var events: [OrgEvent] = []
    /// 알림은 보드의 토스트 자리를 같이 쓴다 — 한 화면에 토스트가 두 군데 뜨면 안 된다
    @ObservationIgnored let banner: (BoardStore.Banner) -> Void

    private var api: APIClient { Backend.shared.api }

    init(orgId: String, banner: @escaping (BoardStore.Banner) -> Void) {
        self.orgId = orgId
        self.banner = banner
    }

    func load() async {
        if let list = try? await api.fetchEvents(orgId: orgId) { events = list }
    }

    /// 시작·끝을 거꾸로 넣어도 막지 않는다 — 서버가 뒤집어 저장한다.
    func save(_ editing: OrgEvent?, title: String, color: String, start: String, end: String) async -> Bool {
        do {
            if let editing {
                _ = try await api.updateEvent(eventId: editing.id, title: title, color: color, startDate: start, endDate: end)
                banner(.init(message: tr("일정을 고쳤어요", "Event updated")))
            } else {
                _ = try await api.createEvent(orgId: orgId, title: title, color: color, startDate: start, endDate: end)
                banner(.init(message: tr("일정을 추가했어요", "Event added")))
            }
            await load()
            return true
        } catch {
            banner(.init(message: BoardStore.message(error)))
            return false
        }
    }

    /// 소프트 삭제 — 확인 없이 지우고 실행취소를 준다(할 일과 같다).
    func remove(_ event: OrgEvent) async -> Bool {
        do {
            try await api.deleteEvent(eventId: event.id)
            events.removeAll { $0.id == event.id }
            banner(.init(message: tr("일정을 지웠어요", "Event deleted")) { [weak self] in
                Task { await self?.restore(event) }
            })
            return true
        } catch {
            banner(.init(message: BoardStore.message(error)))
            return false
        }
    }

    private func restore(_ event: OrgEvent) async {
        do { try await api.restoreEvent(eventId: event.id) } catch {
            banner(.init(message: BoardStore.message(error)))
        }
        await load()
    }
}

/// 일정 색 — 웹 `lib/event-colors.ts`와 같은 표. 아바타보다 진하다(얇은 띠라 눈에 걸려야 한다).
enum EventColors {
    /// 이름이 언어를 따라가야 해서 매번 만든다(8칸이라 비용이 없다)
    static var all: [(key: String, name: String, bar: String, ink: String)] { [
        ("slate", tr("슬레이트", "Slate"), "#6b7280", "#ffffff"),
        ("red", tr("레드", "Red"), "#d1544c", "#ffffff"),
        ("orange", tr("오렌지", "Orange"), "#d97b2e", "#ffffff"),
        ("amber", tr("앰버", "Amber"), "#c99a1e", "#241a00"),
        ("green", tr("그린", "Green"), "#3f8f5f", "#ffffff"),
        ("teal", tr("틸", "Teal"), "#2f8b86", "#ffffff"),
        ("blue", tr("블루", "Blue"), "#4372b8", "#ffffff"),
        ("violet", tr("바이올렛", "Violet"), "#7a5cc0", "#ffffff"),
    ] }

    static func of(_ key: String) -> (bar: String, ink: String) {
        let c = all.first { $0.key == key } ?? all[0]
        return (c.bar, c.ink)
    }
}

/// 달력 계산 — 웹 CalendarView의 순수 함수들(같은 규칙이어야 웹과 같은 그림이 나온다).
enum CalendarMath {
    /// 0 = 일요일
    static func weekday(_ day: String) -> Int {
        guard let d = Due.date(day) else { return 0 }
        return Due.kst.component(.weekday, from: d) - 1
    }

    static func daysBetween(_ a: String, _ b: String) -> Int {
        guard let x = Due.date(a), let y = Due.date(b) else { return 0 }
        return Due.kst.dateComponents([.day], from: x, to: y).day ?? 0
    }

    static func lastDay(of month: String) -> String {
        let next = shift(month, 1)
        return Due.add("\(next)-01", -1)
    }

    static func shift(_ month: String, _ delta: Int) -> String {
        let p = month.split(separator: "-").compactMap { Int($0) }
        guard p.count == 2 else { return month }
        let total = p[0] * 12 + (p[1] - 1) + delta
        return String(format: "%04d-%02d", total / 12, total % 12 + 1)
    }

    /// 앞쪽 빈칸(nil) + 그 달 날짜 + 뒤쪽 빈칸 — 7의 배수
    static func grid(_ month: String) -> [String?] {
        let first = "\(month)-01"
        var days: [String?] = Array(repeating: nil, count: weekday(first))
        var d = first
        while d.hasPrefix(month) {
            days.append(d)
            d = Due.add(d, 1)
        }
        while days.count % 7 != 0 { days.append(nil) }
        return days
    }

    /// 일정마다 줄을 **고정한다.** 날짜별로 그때그때 쌓으면 위 일정이 끝나는 순간 아래 일정이
    /// 한 줄 위로 튀어서 같은 띠가 주 중간에 꺾여 보인다. 겹치지 않으면 같은 줄을 다시 쓴다.
    static func lanes(_ events: [OrgEvent]) -> [String: Int] {
        var laneEnds: [String] = []
        var out: [String: Int] = [:]
        for e in events.sorted(by: { $0.startDate < $1.startDate }) {
            if let i = laneEnds.firstIndex(where: { $0 < e.startDate }) {
                laneEnds[i] = e.endDate
                out[e.id] = i
            } else {
                laneEnds.append(e.endDate)
                out[e.id] = laneEnds.count - 1
            }
        }
        return out
    }

    struct Segment: Identifiable {
        let event: OrgEvent
        let column: Int
        let span: Int
        let lane: Int
        let roundStart: Bool
        let roundEnd: Bool
        var id: String { "\(event.id)-\(column)" }
    }

    /// 한 주(7칸) 안의 띠 조각들. 조각은 **일정 시작 · 주 경계 · 달 경계**에서 시작하고
    /// `min(일정 끝, 그 주 토요일, 그 달 말일)`에서 끝난다 — 달 경계를 안 끊으면 말일 뒤 빈칸 위로 흐른다.
    /// 모서리는 조각이 아니라 **일정 기준**으로 둥글린다(잘린 쪽은 각지게 — 이어진다는 표시).
    static func segments(week: [String?], month: String, events: [OrgEvent], lanes: [String: Int]) -> [Segment] {
        let monthFirst = "\(month)-01"
        let monthLast = lastDay(of: month)
        var out: [Segment] = []
        for (col, day) in week.enumerated() {
            guard let day else { continue }
            for e in events where e.startDate <= day && day <= e.endDate {
                guard e.startDate == day || col == 0 || day == monthFirst else { continue }
                let weekEnd = Due.add(day, 6 - col)
                let segEnd = [e.endDate, weekEnd, monthLast].min()!
                out.append(Segment(
                    event: e, column: col, span: daysBetween(day, segEnd) + 1,
                    lane: lanes[e.id] ?? 0,
                    roundStart: e.startDate == day, roundEnd: e.endDate == segEnd
                ))
            }
        }
        return out
    }
}
