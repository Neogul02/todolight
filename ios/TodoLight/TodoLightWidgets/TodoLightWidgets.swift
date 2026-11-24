import SwiftUI
import TodoLightKit
import WidgetKit

/// 잠금화면·홈 위젯 — 앱이 App Group에 남긴 "내 할 일"(`WidgetSnapshot`)을 그린다.
///
/// 서버를 직접 부르지 않는다. 위젯은 따로 도는 프로세스라 로그인 세션이 없고, 하루 갱신 예산도
/// 수십 번뿐이다. 대신 앱이 보드를 받을 때마다 스냅숏을 쓰고 다시 그리게 한다.
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
            .systemSmall, .systemMedium, .systemLarge,
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
            case .systemLarge: list(s, t, rows: 7)
            case .systemMedium: list(s, t, rows: 3)
            default: list(s, t, rows: 3)
            }
        } else {
            signedOut
        }
    }

    // 잠금화면 위젯은 색을 잃는다(vibrant) — 구분은 굵기와 기호로만 한다

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

    /// 잠금화면 — 개수 한 줄 + 급한 것 두 줄. 줄을 누르면 끝난다
    private func rectangular(_ s: WidgetSnapshot, _ t: Words) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(t.remaining(s.openCount)).font(.headline).widgetAccentable()
            if s.items.isEmpty {
                Text(t.allDone).font(.caption)
            } else {
                ForEach(s.items.prefix(2), id: \.id) { item in
                    row(item, t, compact: true)
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

    /// 홈 화면 — 위에 개수 하나, 아래로 내 할 일. 조직 이름은 작게(여러 조직을 오가는 사람용)
    private func list(_ s: WidgetSnapshot, _ t: Words, rows: Int) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text("\(s.openCount)").font(.title2.weight(.bold)).monospacedDigit()
                Text(s.orgName).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                Spacer(minLength: 0)
            }
            .padding(.bottom, 6)
            if s.items.isEmpty {
                Spacer(minLength: 0)
                Label(t.allDone, systemImage: "checkmark.circle.fill").font(.subheadline.weight(.medium))
                    .foregroundStyle(.secondary)
                Spacer(minLength: 0)
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(s.items.prefix(rows), id: \.id) { item in
                        row(item, t, compact: false)
                    }
                }
                Spacer(minLength: 0)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    /// 한 줄 — **줄 전체가 체크 토글이다**.
    ///
    /// Button이 아니라 Toggle인 이유: 위젯은 누른 뒤 intent(서버에 끝냄 보내기)가 다 끝나야 다시 그려진다.
    /// Button이면 그동안 1~2초 아무 반응이 없어 "안 눌렸나"가 된다. Toggle은 시스템이 **누르는 즉시**
    /// 켜진 모습(체크 + 취소선)을 먼저 그려 준다. 서버가 받으면 그 줄이 목록에서 빠진다.
    /// 내 것이 아닌 줄(같이하기로 참여한 남의 할 일)은 끝내려면 메모가 필요한 "대신 처리"라 토글이 아니다 —
    /// 누르면 위젯 기본 동작대로 앱이 열린다.
    @ViewBuilder
    private func row(_ item: WidgetSnapshot.Item, _ t: Words, compact: Bool) -> some View {
        if item.mine == true {
            Toggle(isOn: false, intent: CompleteTodoIntent(todoId: item.id)) {
                rowLabel(item, t, compact: compact)
            }
            .toggleStyle(CheckRowStyle(compact: compact))
            .accessibilityLabel(t.markDone(item.title))
        } else {
            HStack(spacing: compact ? 4 : 8) {
                Image(systemName: "person.2").font(compact ? .caption : .body).foregroundStyle(.secondary)
                rowLabel(item, t, compact: compact)
            }
            .frame(maxWidth: .infinity, minHeight: compact ? 0 : 30, alignment: .leading)
        }
    }

    private func rowLabel(_ item: WidgetSnapshot.Item, _ t: Words, compact: Bool) -> some View {
        let due = item.dueDate.map { DueLabel.state($0, today: entry.date) }
        return HStack(spacing: 4) {
            // 잠금화면은 색이 빠진다 — 지난 마감을 기호로. 홈 화면은 오른쪽 빨간 글씨가 이미 말한다
            if due == .overdue && compact { Image(systemName: "exclamationmark.circle.fill").font(.caption2) }
            Text(item.title).font(compact ? .caption : .subheadline).lineLimit(1)
            Spacer(minLength: 4)
            if let d = item.dueDate, !compact {
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
                Text(Words.device.openApp)
                    .font(.caption).multilineTextAlignment(.center)
            }
        }
    }
}

/// 체크 한 줄 — 켜지면(누른 순간, 시스템이 먼저 그린다) 동그라미가 채워지고 제목에 줄이 그어진다
struct CheckRowStyle: ToggleStyle {
    let compact: Bool

    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: compact ? 4 : 8) {
            Image(systemName: configuration.isOn ? "checkmark.circle.fill" : "circle")
                .font(compact ? .caption : .body)
                .foregroundStyle(configuration.isOn ? .primary : .secondary)
                .contentTransition(.symbolEffect(.replace))
            configuration.label
                .strikethrough(configuration.isOn)
                .opacity(configuration.isOn ? 0.45 : 1)
        }
        .frame(maxWidth: .infinity, minHeight: compact ? 0 : 30, alignment: .leading)
        .contentShape(Rectangle())
        .animation(.snappy(duration: 0.2), value: configuration.isOn)
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
    /// "ko" | "en" | "ja" — 모르는 값은 영어(앱 `AppLang.device`와 같은 규칙)
    let lang: String
    init(lang: String) { self.lang = ["ko", "ja"].contains(lang) ? lang : "en" }

    /// 위젯 갤러리·제어 센터처럼 앱 설정을 읽기 전에 그려지는 곳은 기기 언어를 따른다
    static var device: Words { Words(lang: deviceLang) }
    static var deviceLang: String {
        let first = Locale.preferredLanguages.first ?? "ko"
        return first.hasPrefix("ko") ? "ko" : first.hasPrefix("ja") ? "ja" : "en"
    }

    /// 세 언어를 한 자리에 나란히 — 하나만 고치는 사고를 막는다
    private func w(_ ko: String, _ en: String, _ ja: String) -> String {
        lang == "ko" ? ko : lang == "ja" ? ja : en
    }

    var widgetName: String { w("내 할 일", "My to-dos", "自分のタスク") }
    var widgetDescription: String { w("남은 할 일과 가장 급한 것부터", "What's left, most urgent first", "残りのタスクを急ぐものから") }
    var quickAdd: String { w("할 일 추가", "Add a to-do", "タスクを追加") }
    var quickAddDescription: String { w("todolight를 열고 바로 적어요", "Open todolight and start typing", "todolightを開いてすぐに書けます") }

    var todo: String { w("할 일", "to-do", "タスク") }
    var allDone: String { w("다 끝냈어요", "All done", "すべて完了") }
    var today: String { w("오늘", "Today", "今日") }
    var tomorrow: String { w("내일", "Tomorrow", "明日") }
    var openApp: String { w("앱을 열어 로그인해 주세요", "Open the app to sign in", "アプリを開いてログインしてください") }
    func markDone(_ title: String) -> String { w("\(title) 끝내기", "Mark \(title) done", "\(title)を完了にする") }
    func remaining(_ n: Int) -> String { w("남은 할 일 \(n)", "\(n) to-do\(n == 1 ? "" : "s") left", "残りのタスク \(n)") }
    func daysAgo(_ n: Int) -> String { w("\(n)일 지남", "\(n)d overdue", "\(n)日超過") }
    func month(_ m: Int, day d: Int) -> String { w("\(m)월 \(d)일", "\(m)/\(d)", "\(m)月\(d)日") }
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
        lang: Words.deviceLang
    )
}
