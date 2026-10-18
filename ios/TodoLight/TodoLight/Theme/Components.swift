import SwiftUI
import TodoLightKit

// 웹 components/ui.tsx · Avatar · DuePill · DuePicker와 1:1. 값은 웹 클래스에서 그대로 옮겼다.

// MARK: - 유리 카드 (웹 glass-card / glass-card-alt)

struct GlassCard: ViewModifier {
    @Environment(\.tokens) private var tk
    var alt = false
    var radius: CGFloat = 12

    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        content
            .background(alt ? tk.glassCardBgAlt : tk.glassCardBg, in: shape)
            // inset 0 0 0 1px border — 테두리는 요소 크기에 더하지 않는다(웹이 border 대신 inset 그림자를 쓴 이유)
            .overlay(shape.strokeBorder(tk.glassBorder, lineWidth: 1))
            // inset 0 1px 0 0 sheen — 위쪽 모서리의 1px 하이라이트
            .overlay(alignment: .top) {
                shape.strokeBorder(
                    LinearGradient(colors: [tk.glassSheen, .clear], startPoint: .top, endPoint: .init(x: 0.5, y: 0.08)),
                    lineWidth: 1
                )
            }
    }
}

extension View {
    func glassCard(alt: Bool = false, radius: CGFloat = 12) -> some View {
        modifier(GlassCard(alt: alt, radius: radius))
    }
}

// MARK: - 캔버스 (유리가 흐릴 대상 — 웹 canvas + canvas-tint 두 색)

struct CanvasBackground: View {
    @Environment(\.tokens) private var tk

    var body: some View {
        tk.canvas
            .overlay(alignment: .topLeading) {
                RadialGradient(colors: [tk.canvasTintA, .clear], center: .topLeading, startRadius: 0, endRadius: 520)
            }
            .overlay(alignment: .bottomTrailing) {
                RadialGradient(colors: [tk.canvasTintB, .clear], center: .bottomTrailing, startRadius: 0, endRadius: 520)
            }
            .ignoresSafeArea()
    }
}

// MARK: - 배지 (웹 Badge — rounded-full px-2 py-0.5 text-[11px] font-semibold)

struct BadgeView<Leading: View>: View {
    enum Tone { case neutral, success, warning, danger, accent }

    @Environment(\.tokens) private var tk
    let text: String
    var tone: Tone = .neutral
    @ViewBuilder var leading: Leading

    var body: some View {
        let (bg, fg): (Color, Color) = switch tone {
        case .neutral: (tk.canvasSoft, tk.inkMuted)
        case .success: (tk.successSoft, tk.success)
        case .warning: (tk.warningSoft, tk.warning)
        case .danger: (tk.dangerSoft, tk.danger)
        case .accent: (tk.accent, tk.accentInk)
        }
        HStack(spacing: 4) {
            leading
            Text(text).font(.tlBadge).lineLimit(1)
        }
        // 앞에 작은 아바타가 붙으면 왼쪽 여백을 줄인다(웹 pl-0.5)
        .padding(.leading, Leading.self == EmptyView.self ? 8 : 2)
        .padding(.trailing, 8)
        .padding(.vertical, 2)
        .foregroundStyle(fg)
        .background(bg, in: Capsule())
    }
}

extension BadgeView where Leading == EmptyView {
    init(_ text: String, tone: Tone = .neutral) {
        self.text = text
        self.tone = tone
        self.leading = EmptyView()
    }
}

// MARK: - 체크박스 (웹 TodoCard — size-5 rounded-md border, 완료면 accent 채움 + 12pt 체크)

struct CheckBox: View {
    @Environment(\.tokens) private var tk
    let checked: Bool

    var body: some View {
        RoundedRectangle(cornerRadius: 6, style: .continuous)
            .fill(checked ? tk.accent : tk.surface)
            .overlay(
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .strokeBorder(checked ? tk.accent : tk.hairlineStrong, lineWidth: 1)
            )
            .overlay {
                if checked {
                    // 웹 path "M2.5 6.2 4.8 8.5 9.5 3.8" (12×12 상자)
                    CheckMark()
                        .stroke(tk.accentInk, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                        .frame(width: 12, height: 12)
                        .transition(.scale(scale: 0.6).combined(with: .opacity))
                }
            }
            .frame(width: 20, height: 20)
    }
}

private struct CheckMark: Shape {
    func path(in r: CGRect) -> Path {
        let s = r.width / 12
        var p = Path()
        p.move(to: CGPoint(x: 2.5 * s, y: 6.2 * s))
        p.addLine(to: CGPoint(x: 4.8 * s, y: 8.5 * s))
        p.addLine(to: CGPoint(x: 9.5 * s, y: 3.8 * s))
        return p
    }
}

// MARK: - 누르면 살짝 줄어드는 버튼 (웹 active:scale-90 / active:scale-[0.97])

struct PressScale: ButtonStyle {
    var scale: CGFloat = 0.9
    @Environment(\.accessibilityReduceMotion) private var reduce

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .contentShape(Rectangle())
            .scaleEffect(configuration.isPressed && !reduce ? scale : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

// MARK: - 버튼 (웹 Button — sm 40 / md 48, outline · primary · danger)

struct TLButtonStyle: ButtonStyle {
    enum Variant { case primary, outline, danger }
    enum Size { case sm, md }

    @Environment(\.tokens) private var tk
    @Environment(\.isEnabled) private var enabled
    var variant: Variant = .primary
    var size: Size = .md
    /// 폭을 꽉 채운다(웹 `w-full`). 바깥 `.frame(maxWidth:)`로는 버튼의 배경이 안 늘어난다.
    var fill = false

    func makeBody(configuration: Configuration) -> some View {
        let (bg, fg, border): (Color, Color, Color?) = switch variant {
        case .primary: (tk.accent, tk.accentInk, nil)
        case .outline: (tk.surface, tk.ink, tk.hairlineStrong)
        case .danger: (tk.danger, tk.dangerInk, nil)
        }
        let radius: CGFloat = size == .sm ? 8 : 12
        configuration.label
            .font(.tl(size == .sm ? 13 : 15, .medium))
            .foregroundStyle(fg)
            .padding(.horizontal, size == .sm ? 14 : 16)
            .frame(maxWidth: fill ? .infinity : nil, minHeight: size == .sm ? 40 : 48)
            .background(bg, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay {
                if let border {
                    RoundedRectangle(cornerRadius: radius, style: .continuous).strokeBorder(border, lineWidth: 1)
                }
            }
            .opacity(enabled ? 1 : 0.4)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

// MARK: - 입력 칸 (웹 Input — h-12 rounded-xl border-hairline bg-surface px-3.5 text-[16px])

struct TLField: ViewModifier {
    @Environment(\.tokens) private var tk
    var height: CGFloat = 48
    var trailingInset: CGFloat = 14

    func body(content: Content) -> some View {
        content
            .font(.tl(16))
            .foregroundStyle(tk.ink)
            .padding(.leading, 14)
            .padding(.trailing, trailingInset)
            .frame(minHeight: height)
            .background(tk.surface, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(tk.hairline, lineWidth: 1))
    }
}

extension View {
    func tlField(height: CGFloat = 48, trailingInset: CGFloat = 14) -> some View {
        modifier(TLField(height: height, trailingInset: trailingInset))
    }
}

/// 자리 표시 글자도 토큰 색으로 — 기본 placeholder는 시스템 회색이라 테마를 안 따른다.
func placeholder(_ text: String, _ tk: ThemeTokens) -> Text {
    Text(text).foregroundStyle(tk.inkFaint)
}

// MARK: - 아바타 (웹 Avatar — 사진, 없으면 첫 글자 + id 해시 색)

struct AvatarView: View {
    let member: MemberSummary?
    var size: CGFloat = 32

    var body: some View {
        let name = member?.displayName ?? "?"
        Group {
            if let url = member?.avatarUrl.flatMap(URL.init(string:)) {
                AsyncImage(url: url) { $0.resizable().scaledToFill() } placeholder: { initial(name) }
            } else {
                initial(name)
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
    }

    private func initial(_ name: String) -> some View {
        let c = Self.color(key: member?.avatarColor, seed: member?.userId ?? "")
        return ZStack {
            c.bg
            Text(BoardRules.initial(of: name))
                .font(.tl(size * 0.42, .semibold))
                .foregroundStyle(c.ink)
        }
    }

    /// 웹 `getAvatarColor` — 고른 색이 없으면 id에서 결정적으로. 해시는 UTF-16 단위로 같게 돈다.
    static func color(key: String?, seed: String) -> (bg: Color, ink: Color) {
        let palette = AvatarPalette.colors
        if let key, let found = palette.first(where: { $0.key == key }) { return (found.bg, found.ink) }
        guard !seed.isEmpty else { return (palette[0].bg, palette[0].ink) }
        var hash: UInt32 = 0
        for unit in seed.utf16 { hash = hash &* 31 &+ UInt32(unit) }
        let picked = palette[Int(hash % UInt32(palette.count))]
        return (picked.bg, picked.ink)
    }
}

// MARK: - 마감 (웹 dueState · formatRelativeDay · DuePill · DuePicker)

enum Due {
    enum State { case none, overdue, today, upcoming }

    static var kst: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Asia/Seoul")!
        c.locale = Locale(identifier: "ko_KR")
        return c
    }

    static func format(_ date: Date) -> String {
        let d = kst.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", d.year!, d.month!, d.day!)
    }

    static func today() -> String { format(Date()) }

    static func date(_ day: String) -> Date? {
        let p = day.split(separator: "-").compactMap { Int($0) }
        guard p.count == 3 else { return nil }
        return kst.date(from: DateComponents(year: p[0], month: p[1], day: p[2]))
    }

    static func add(_ day: String, _ n: Int) -> String {
        guard let base = date(day), let moved = kst.date(byAdding: .day, value: n, to: base) else { return day }
        return format(moved)
    }

    static func state(_ due: String?) -> State {
        guard let due else { return .none }
        let today = today()
        return due < today ? .overdue : due == today ? .today : .upcoming
    }

    /// 웹 `formatRelativeDay` — 7일 안은 "오늘·내일·모레·3일 전", 그 밖은 "2026. 10. 25."
    static func relative(_ day: String) -> String {
        guard let target = date(day), let now = date(today()) else { return day }
        let diff = kst.dateComponents([.day], from: now, to: target).day ?? 0
        if abs(diff) <= 7 {
            let f = RelativeDateTimeFormatter()
            f.locale = AppLang.locale
            f.dateTimeStyle = .named
            f.calendar = kst
            let text = f.localizedString(from: DateComponents(day: diff))
            return AppLang.current == .en ? text.prefix(1).uppercased() + text.dropFirst() : text
        }
        let f = DateFormatter()
        f.locale = AppLang.locale
        f.calendar = kst
        f.timeZone = kst.timeZone
        f.dateFormat = AppLang.current == .ko ? "yyyy. M. d." : "MMM d, yyyy"
        return f.string(from: target)
    }
}

/// 마감 알약 — 접혀 있을 땐 한 줄(28pt), 누르면 그 자리에서 날짜 레일이 펼쳐진다.
/// 날짜를 고르면 곧바로 접는다(고른 값은 알약에 적힌다).
struct DuePillView: View {
    @Environment(\.tokens) private var tk
    @Environment(\.accessibilityReduceMotion) private var reduce
    let value: String?
    let onChange: (String?) -> Void
    @Binding var open: Bool
    var height: CGFloat = 28
    var allowNone = true

    var body: some View {
        let state = Due.state(value)
        let label = value.map(Due.relative) ?? tr("마감 없음", "No due date")
        // 지난 마감만 색으로 알린다. 오늘·나중은 기본값에 가까워서 색을 주면 경고처럼 읽힌다
        let (bg, fg, border): (Color, Color, Color) = switch state {
        case .overdue: (tk.dangerSoft, tk.danger, tk.danger.opacity(0.4))
        case .none: (.clear, tk.inkFaint, tk.hairlineStrong)
        default: (tk.surface, tk.ink, tk.hairlineStrong)
        }
        Button {
            Motion.run(Motion.quick, reduce: reduce) { open.toggle() }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "calendar").font(.system(size: 12)).opacity(0.7)
                Text(label).font(.tl(12, .medium)).monospacedDigit()
                Image(systemName: "chevron.down").font(.system(size: 9, weight: .bold))
                    .rotationEffect(.degrees(open ? 180 : 0))
            }
            .foregroundStyle(fg)
            .padding(.horizontal, 10)
            .frame(height: height)
            .background(bg, in: Capsule())
            .overlay(Capsule().strokeBorder(border, style: StrokeStyle(lineWidth: 1, dash: state == .none ? [3, 2] : [])))
        }
        .buttonStyle(PressScale(scale: 0.97))
        .accessibilityLabel(tr("마감 \(label) · 눌러서 바꾸기", "Due \(label) · tap to change"))
    }

    /// 펼쳐진 레일 — 알약과 따로 둬서 부모가 다음 줄 전체 폭에 놓을 수 있게 한다.
    @ViewBuilder func rail() -> some View {
        if open {
            DuePicker(value: value, allowNone: allowNone) { next in
                onChange(next)
                Motion.run(Motion.quick, reduce: reduce) { open = false }
            }
            .transition(.opacity)
        }
    }
}

/// 날짜를 가로로 늘어놓고 밀어서 고른다 — 네이티브 DatePicker는 화면 절반을 덮는다.
/// 오늘을 기준으로 뒤로 2주, 앞으로 석 달. 열릴 때 고른 날짜가 가운데 온다.
struct DuePicker: View {
    @Environment(\.tokens) private var tk
    let value: String?
    var allowNone = true
    /// 범위를 세는 기준일. 가계부는 "보고 있는 달 1일"을 넘겨 그 달 날짜만 나오게 한다 —
    /// 오늘 기준이면 7월을 보면서 적은 지출이 8월로 저장된다. "오늘/어제/내일" 라벨은 늘 실제 오늘 기준.
    var anchor: String? = nil
    var pastDays = 14
    var futureDays = 90
    let onChange: (String?) -> Void

    var body: some View {
        let today = Due.today()
        let from = anchor ?? today
        let dates = (-pastDays...futureDays).map { Due.add(from, $0) }
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    if allowNone {
                        Button { onChange(nil) } label: {
                            Text(tr("마감 없음", "No due date")).font(.tl(13, .medium))
                                .padding(.horizontal, 12)
                                .frame(height: 44)
                                .foregroundStyle(value == nil ? tk.accentInk : tk.inkFaint)
                                .background(value == nil ? tk.accent : tk.surface, in: RoundedRectangle(cornerRadius: 12))
                                .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(value == nil ? tk.accent : tk.hairline))
                        }
                        .buttonStyle(.plain)
                        .id("none")
                    }
                    ForEach(dates, id: \.self) { date in cell(date, today: today) }
                }
                .padding(.vertical, 2)
            }
            .onAppear { proxy.scrollTo(value ?? today, anchor: .center) }
        }
    }

    private func cell(_ date: String, today: String) -> some View {
        let active = value == date
        let isToday = date == today
        let diff = date == today ? 0 : date == Due.add(today, 1) ? 1 : date == Due.add(today, -1) ? -1 : nil
        let parts = date.split(separator: "-").compactMap { Int($0) }
        let top = parts.count == 3 ? "\(parts[1])/\(parts[2])" : date
        let bottom: String = switch diff {
        case 0: tr("오늘", "Today")
        case 1: tr("내일", "Tomorrow")
        case -1: tr("어제", "Yesterday")
        default: Due.date(date).map { $0.formatted(.dateTime.weekday(.abbreviated).locale(AppLang.locale)) } ?? ""
        }
        return Button { onChange(date) } label: {
            VStack(spacing: 0) {
                Text(top).font(.tl(13, !active && isToday ? .semibold : .regular)).monospacedDigit()
                Text(bottom).font(.tl(10)).foregroundStyle(active ? tk.accentInk.opacity(0.7) : tk.inkFaint)
            }
            .foregroundStyle(active ? tk.accentInk : tk.ink)
            .frame(width: 56, height: 44)
            .background(active ? tk.accent : tk.surface, in: RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .strokeBorder(active ? tk.accent : isToday ? tk.hairlineStrong : tk.hairline)
            )
        }
        .buttonStyle(.plain)
        .id(date)
        .accessibilityLabel(date)
    }
}
