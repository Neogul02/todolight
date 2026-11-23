import SwiftUI
import TodoLightKit
import WidgetKit

/// 잠금화면·홈 위젯 — 앱이 App Group에 남긴 "내 할 일"(`WidgetSnapshot`)을 그린다.
///
/// 서버를 직접 부르지 않는다. 위젯은 따로 도는 프로세스라 로그인 세션이 없고, 하루 갱신 예산도
/// 수십 번뿐이다(docs/ios-app-plan.md §6). 대신 앱이 보드를 받을 때마다 스냅숏을 쓰고 다시 그리게 한다.
@main
struct TodoLightWidgetBundle: WidgetBundle {
    var body: some Widget {
        MyTodosWidget()
        QuickAddControl()
    }
}

struct MyTodosWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "TodoLightMyTodos", provider: Provider()) { entry in
            MyTodosView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName(Words.device.widgetName)
        .description(Words.device.widgetDescription)
        .supportedFamilies([
            .accessoryCircular, .accessoryRectangular, .accessoryInline,
            .systemSmall, .systemMedium,
        ])
    }
}

struct Entry: TimelineEntry {
    let date: Date
    /// nil이면 로그인 전이거나 앱을 아직 한 번도 안 연 것
    let snapshot: WidgetSnapshot?
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> Entry {
        Entry(date: .now, snapshot: .sample)
    }

    func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
        // 위젯 고르는 화면에서는 아직 저장된 게 없어도 모양을 보여 준다
        completion(Entry(date: .now, snapshot: SharedStore.load() ?? (context.isPreview ? .sample : nil)))
    }

    /// 지금 한 장 + KST 자정에 한 장 — 자정이 지나면 "오늘"이 "어제(지남)"가 되므로 그때 다시 그린다.
    /// 내용이 바뀌는 건 앱이 `reloadAllTimelines`로 알린다.
    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        let snapshot = SharedStore.load()
        let midnight = DueLabel.kst.nextDate(after: .now, matching: DateComponents(hour: 0, minute: 0), matchingPolicy: .nextTime) ?? .now.addingTimeInterval(3600)
        completion(Timeline(entries: [
            Entry(date: .now, snapshot: snapshot),
            Entry(date: midnight, snapshot: snapshot),
        ], policy: .after(midnight)))
    }
}

// MARK: - 그림

struct MyTodosView: View {
    @Environment(\.widgetFamily) private var family
    let entry: Entry

    var body: some View {
        if let s = entry.snapshot {
            let t = Words(lang: s.lang)
            switch family {
            case .accessoryCircular: circular(s, t)
            case .accessoryRectangular: rectangular(s, t)
            case .accessoryInline: inline(s, t)
            case .systemMedium: list(s, t, rows: 4)
            default: list(s, t, rows: 3)
            }
        } else {
            signedOut
        }
    }

    // 잠금화면 위젯은 색을 잃는다(vibrant) — 구분은 굵기와 기호로만 한다(docs/ios-app-plan.md §6 함정 1)

    private func circular(_ s: WidgetSnapshot, _ t: Words) -> some View {
        ZStack {
            AccessoryWidgetBackground()
            if s.openCount == 0 {
                Image(systemName: "checkmark").font(.title2.weight(.semibold))
            } else {
                VStack(spacing: 0) {
                    Text("\(s.openCount)").font(.title2.weight(.bold)).monospacedDigit()
                    Text(t.todo).font(.caption2)
                }
            }
        }
        .accessibilityLabel(t.remaining(s.openCount))
    }

    private func rectangular(_ s: WidgetSnapshot, _ t: Words) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(t.remaining(s.openCount)).font(.headline).widgetAccentable()
            if s.items.isEmpty {
                Text(t.allDone).font(.caption)
            } else {
                ForEach(s.items.prefix(2), id: \.id) { item in
                    row(item, t, font: .caption)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func inline(_ s: WidgetSnapshot, _ t: Words) -> some View {
        // 한 줄뿐이라 개수 + 가장 급한 하나
        if let first = s.items.first {
            Text("\(Image(systemName: "checklist")) \(s.openCount) · \(first.title)")
        } else {
            Text("\(Image(systemName: "checkmark")) \(t.allDone)")
        }
    }

    private func list(_ s: WidgetSnapshot, _ t: Words, rows: Int) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(s.orgName).font(.caption.weight(.semibold)).foregroundStyle(.secondary).lineLimit(1)
                Spacer(minLength: 4)
                Text("\(s.openCount)").font(.title3.weight(.bold)).monospacedDigit()
            }
            if s.items.isEmpty {
                Spacer()
                Label(t.allDone, systemImage: "checkmark").font(.subheadline)
                Spacer()
            } else {
                ForEach(s.items.prefix(rows), id: \.id) { item in
                    row(item, t, font: .subheadline)
                }
                Spacer(minLength: 0)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// 체크 + 제목 + 마감 — 지난 마감은 느낌표로(색을 못 쓰는 잠금화면에서도 보인다).
    /// 체크는 내 것에만 단다(남의 할 일을 끝내는 건 메모가 필요한 "대신 처리"라 앱에서 한다)
    private func row(_ item: WidgetSnapshot.Item, _ t: Words, font: Font) -> some View {
        let due = item.dueDate.map { DueLabel.state($0, today: entry.date) }
        return HStack(spacing: 4) {
            if item.mine == true {
                Button(intent: CompleteTodoIntent(todoId: item.id)) {
                    Image(systemName: "circle").font(font)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(t.markDone(item.title))
            }
            if due == .overdue { Image(systemName: "exclamationmark.circle.fill").font(font) }
            Text(item.title).font(font).lineLimit(1)
            Spacer(minLength: 4)
            if let d = item.dueDate, family != .accessoryRectangular {
                Text(DueLabel.text(d, today: entry.date, t: t))
                    .font(.caption2)
                    .foregroundStyle(due == .overdue ? .red : .secondary)
            }
        }
    }

    private var signedOut: some View {
        VStack(spacing: 4) {
            Image(systemName: "checklist")
            if family != .accessoryCircular {
                Text(Words(lang: Locale.current.language.languageCode?.identifier ?? "ko").openApp)
                    .font(.caption).multilineTextAlignment(.center)
            }
        }
    }
}

// MARK: - 날짜·말

/// 마감 라벨 — 앱의 `Due`와 같은 KST 기준. 위젯은 앱 코드를 못 가져오므로 필요한 만큼만 둔다
enum DueLabel {
    enum State { case overdue, today, upcoming }

    static var kst: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Asia/Seoul")!
        return c
    }

    static func day(_ date: Date) -> String {
        let d = kst.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", d.year!, d.month!, d.day!)
    }

    static func state(_ due: String, today now: Date) -> State {
        let today = day(now)
        return due < today ? .overdue : due == today ? .today : .upcoming
    }

    static func text(_ due: String, today now: Date, t: Words) -> String {
        let p = due.split(separator: "-").compactMap { Int($0) }
        guard p.count == 3, let target = kst.date(from: DateComponents(year: p[0], month: p[1], day: p[2])),
              let base = kst.date(from: kst.dateComponents([.year, .month, .day], from: now)) else { return due }
        let diff = kst.dateComponents([.day], from: base, to: target).day ?? 0
        switch diff {
        case 0: return t.today
        case 1: return t.tomorrow
        case ..<0: return t.daysAgo(-diff)
        default: return t.month(p[1], day: p[2])
        }
    }
}

struct Words {
    let ko: Bool
    init(lang: String) { ko = lang != "en" }

    /// 위젯 갤러리·제어 센터처럼 앱 설정을 읽기 전에 그려지는 곳은 기기 언어를 따른다
    static var device: Words { Words(lang: Locale.preferredLanguages.first?.hasPrefix("ko") == true ? "ko" : "en") }

    var widgetName: String { ko ? "내 할 일" : "My to-dos" }
    var widgetDescription: String { ko ? "남은 할 일과 가장 급한 것부터" : "What's left, most urgent first" }
    var quickAdd: String { ko ? "할 일 추가" : "Add a to-do" }
    var quickAddDescription: String { ko ? "todolight를 열고 바로 적어요" : "Open todolight and start typing" }

    var todo: String { ko ? "할 일" : "to-do" }
    var allDone: String { ko ? "다 끝냈어요" : "All done" }
    var today: String { ko ? "오늘" : "Today" }
    var tomorrow: String { ko ? "내일" : "Tomorrow" }
    var openApp: String { ko ? "앱을 열어 로그인해 주세요" : "Open the app to sign in" }
    func markDone(_ title: String) -> String { ko ? "\(title) 끝내기" : "Mark \(title) done" }
    func remaining(_ n: Int) -> String { ko ? "남은 할 일 \(n)" : "\(n) to-do\(n == 1 ? "" : "s") left" }
    func daysAgo(_ n: Int) -> String { ko ? "\(n)일 지남" : "\(n)d overdue" }
    func month(_ m: Int, day d: Int) -> String { ko ? "\(m)월 \(d)일" : "\(m)/\(d)" }
}

extension WidgetSnapshot {
    /// 위젯 고르는 화면·자리표시용
    static let sample = WidgetSnapshot(
        orgName: "todolight", openCount: 3,
        items: [
            .init(id: "1", title: "보고서 마무리", dueDate: DueLabel.day(.now), mine: true),
            .init(id: "2", title: "장보기", dueDate: nil, mine: true),
            .init(id: "3", title: "택배 반품", dueDate: nil, mine: true),
        ],
        lang: Locale.current.language.languageCode?.identifier == "en" ? "en" : "ko"
    )
}
