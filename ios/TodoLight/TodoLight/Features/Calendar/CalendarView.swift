import SwiftUI
import TodoLightKit

/// 달력 — 웹 `app/(app)/calendar/CalendarView.tsx`. 보드가 "누가 무엇을 들고 있나"라면 이건
/// "언제 몰려 있나"다. 월 격자(담당자 색 점 + 일정 띠) 아래에 고른 날의 목록이 늘 붙어 있다.
struct CalendarView: View {
    @Environment(\.tokens) private var tk
    @Environment(\.accessibilityReduceMotion) private var reduce
    let board: BoardStore
    let store: CalendarStore
    let onHandoff: (Todo) -> Void

    @State private var month = String(Due.today().prefix(7))
    @State private var selected = Due.today()
    @State private var direction = 0
    /// 목록 높이(화면 비율). 2단 스냅 — 그보다 올리면 달력 칸이 숫자도 겨우 들어가는 높이가 된다
    @State private var ratio: CGFloat = 0.24
    @State private var dragStart: CGFloat?
    @State private var editing: OrgEvent?
    @State private var sheetOpen = false

    private static let snaps: [CGFloat] = [0.24, 0.5]
    private static let maxLanes = 3
    private static let gap: CGFloat = 4
    private static let tabBarInset: CGFloat = 84

    /// 칸이 납작해지면 띠 3줄이 안 들어간다 — 그때는 점으로 바꾼다
    private var compact: Bool { ratio > Self.snaps[0] + 0.05 }
    private var today: String { Due.today() }

    var body: some View {
        GeometryReader { geo in
            VStack(spacing: 0) {
                header
                weekdayRow
                monthGrid
                    .frame(maxHeight: .infinity)
                    .gesture(swipe)
                // 탭바 알약이 목록 아래를 덮으므로 그 높이만큼 더 준다 — 비율은 "보이는 목록"의 몫이다
                panel(height: geo.size.height * ratio + Self.tabBarInset)
            }
            .padding(.horizontal, 12)
        }
        .task { await store.load() }
        .sheet(isPresented: $sheetOpen) {
            EventSheet(
                event: editing,
                defaultDate: selected,
                canDelete: editing.map { $0.createdBy == board.userId || board.isManager } ?? false,
                store: store
            )
        }
    }

    // MARK: 머리 — ‹ 2026년 10월 [오늘] ›

    private var header: some View {
        HStack {
            arrow("chevron.left", label: "이전 달") { shift(-1) }
            Spacer()
            HStack(spacing: 8) {
                Text(monthLabel).font(.tlTitle).foregroundStyle(tk.ink).monospacedDigit()
                if month != today.prefix(7) {
                    Button("오늘", action: goToday)
                        .font(.tl(12, .medium)).foregroundStyle(tk.inkMuted)
                        .padding(.horizontal, 8).frame(height: 28)
                        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(tk.hairline))
                        .buttonStyle(PressScale(scale: 0.95))
                }
            }
            Spacer()
            arrow("chevron.right", label: "다음 달") { shift(1) }
        }
        .padding(.bottom, 8)
    }

    private func arrow(_ icon: String, label: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon).font(.system(size: 16, weight: .medium)).foregroundStyle(tk.inkMuted)
                .frame(width: 40, height: 40)
        }
        .buttonStyle(PressScale())
        .accessibilityLabel(label)
    }

    /// 일요일만 붉게 — 한국 달력의 관습이라 배우지 않아도 읽힌다
    private var weekdayRow: some View {
        HStack(spacing: Self.gap) {
            ForEach(Array(["일", "월", "화", "수", "목", "금", "토"].enumerated()), id: \.offset) { i, w in
                Text(w).font(.tl(11, .medium))
                    .foregroundStyle(i == 0 ? tk.danger.opacity(0.7) : tk.inkFaint)
                    .frame(maxWidth: .infinity)
            }
        }
        .padding(.vertical, 4)
    }

    // MARK: 월 격자

    private var monthGrid: some View {
        let days = CalendarMath.grid(month)
        let weeks = stride(from: 0, to: days.count, by: 7).map { Array(days[$0..<$0 + 7]) }
        let lanes = CalendarMath.lanes(store.events)
        let todosByDate = Dictionary(grouping: visibleTodos.filter { $0.dueDate != nil }, by: { $0.dueDate! })

        return GeometryReader { geo in
            let cellW = (geo.size.width - Self.gap * 6) / 7
            VStack(spacing: 6) {
                ForEach(Array(weeks.enumerated()), id: \.offset) { _, week in
                    ZStack(alignment: .topLeading) {
                        HStack(spacing: Self.gap) {
                            ForEach(Array(week.enumerated()), id: \.offset) { _, day in
                                cell(day, todos: day.flatMap { todosByDate[$0] } ?? [])
                                    .frame(width: cellW)
                            }
                        }
                        // 띠는 칸 위에 따로 얹는다 — 칸의 자식으로 두면 다음 칸 배경에 가려지고,
                        // 클릭을 받으면 28일을 눌러도 띠가 시작한 23일이 선택된다(웹 pointer-events-none)
                        if !compact {
                            bars(week: week, lanes: lanes, cellW: cellW)
                                .allowsHitTesting(false)
                                .padding(.top, 40)
                        }
                    }
                    .frame(maxHeight: .infinity, alignment: .top)
                }
            }
            .id(month)
            .transition(reduce ? .opacity : .asymmetric(
                insertion: .opacity.combined(with: .offset(x: CGFloat(direction) * 32)),
                removal: .opacity.combined(with: .offset(x: CGFloat(direction) * -32))
            ))
        }
    }

    private func cell(_ day: String?, todos: [Todo]) -> some View {
        Group {
            if let day {
                let isSel = day == selected
                let isToday = day == today
                let remaining = todos.filter { $0.status != .done }
                let dayEvents = store.events.filter { $0.startDate <= day && day <= $0.endDate }
                Button { selected = day } label: {
                    VStack(spacing: 4) {
                        // 고른 날만 채운 원 — 오늘은 색과 굵기로만(채운 원은 언제나 하나뿐이어야 헷갈리지 않는다)
                        Text("\(Int(day.suffix(2)) ?? 0)")
                            .font(.tl(13, isSel ? .semibold : isToday ? .bold : .regular)).monospacedDigit()
                            .foregroundStyle(isSel ? tk.accentInk : isToday ? tk.accent
                                             : CalendarMath.weekday(day) == 0 ? tk.danger.opacity(0.8) : tk.ink)
                            .frame(minWidth: 20, minHeight: 20)
                            .background(isSel ? tk.accent : .clear, in: Capsule())
                        // 남은 할 일을 담당자 색 점으로 — 점 개수가 곧 개수, 색이 곧 사람
                        if !remaining.isEmpty {
                            HStack(spacing: 3) {
                                ForEach(remaining.prefix(3)) { t in
                                    Circle().fill(AvatarView.color(key: board.member(t.ownerId)?.avatarColor, seed: t.ownerId).bg)
                                        .frame(width: 5, height: 5)
                                }
                                if remaining.count > 3 {
                                    Text("+\(remaining.count - 3)").font(.tl(8, .semibold)).foregroundStyle(tk.inkFaint)
                                }
                            }
                        }
                        if compact && !dayEvents.isEmpty {
                            HStack(spacing: 3) {
                                ForEach(dayEvents.prefix(4)) { e in
                                    Circle().fill(Color(hex: EventColors.of(e.color).bar)).frame(width: 5, height: 5)
                                }
                            }
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(.top, 6)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(isSel ? tk.accentSoft : .clear, in: RoundedRectangle(cornerRadius: 12))
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(describe(day, remaining: remaining.count, events: dayEvents))
                .accessibilityAddTraits(isSel ? .isSelected : [])
            } else {
                Color.clear
            }
        }
    }

    private func bars(week: [String?], lanes: [String: Int], cellW: CGFloat) -> some View {
        let segs = CalendarMath.segments(week: week, month: month, events: store.events, lanes: lanes)
        return ZStack(alignment: .topLeading) {
            ForEach(segs.filter { $0.lane < Self.maxLanes }) { s in
                let c = EventColors.of(s.event.color)
                let width = cellW * CGFloat(s.span) + Self.gap * CGFloat(s.span - 1)
                Text(s.event.title)
                    .font(.tl(9, .medium)).lineLimit(1)
                    .foregroundStyle(Color(hex: c.ink))
                    .padding(.horizontal, 6)
                    .frame(width: width, height: 16, alignment: .leading)
                    .background(Color(hex: c.bar), in: UnevenRoundedRectangle(
                        topLeadingRadius: s.roundStart ? 8 : 0, bottomLeadingRadius: s.roundStart ? 8 : 0,
                        bottomTrailingRadius: s.roundEnd ? 8 : 0, topTrailingRadius: s.roundEnd ? 8 : 0
                    ))
                    .offset(x: CGFloat(s.column) * (cellW + Self.gap), y: CGFloat(s.lane) * 18)
            }
        }
    }

    // MARK: 아래 목록 패널

    private func panel(height: CGFloat) -> some View {
        let dayTodos = (visibleTodosByDate[selected] ?? []).sorted { ($0.status == .done ? 1 : 0) < ($1.status == .done ? 1 : 0) }
        let dayEvents = store.events.filter { $0.startDate <= selected && selected <= $0.endDate }
        let undated = visibleTodos.filter { $0.dueDate == nil }

        return VStack(spacing: 0) {
            handle
            Rectangle().fill(tk.hairline).frame(height: 1)
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(selectedLabel).font(.tl(15, .semibold)).foregroundStyle(tk.ink)
                    Text("일정 \(dayEvents.count) · 할 일 \(dayTodos.count)").font(.tl(11)).foregroundStyle(tk.inkFaint)
                }
                Spacer()
                Button("일정 추가") {
                    editing = nil
                    sheetOpen = true
                }
                .buttonStyle(TLButtonStyle(variant: .outline, size: .sm))
            }
            .padding(.vertical, 10)

            ScrollView {
                VStack(spacing: 6) {
                    ForEach(dayEvents) { eventRow($0) }
                    if dayTodos.isEmpty && dayEvents.isEmpty {
                        Text("이 날은 비어 있어요").font(.tlCaption).foregroundStyle(tk.inkFaint).padding(.vertical, 24)
                    }
                    ForEach(dayTodos) { todoRow($0) }
                    if !undated.isEmpty {
                        Rectangle().fill(tk.hairline).frame(height: 1).padding(.top, 14)
                        Text("마감 없음 · \(undated.count)건").font(.tl(13, .semibold)).foregroundStyle(tk.inkSecondary)
                            .frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 6)
                        ForEach(undated) { todoRow($0) }
                    }
                }
                .padding(.bottom, 96)
            }
        }
        .frame(height: max(height, 160))
    }

    /// 손잡이 — 끌어서 2단 사이를 오가고, 누르기만 해도 다음 단으로 간다.
    /// 놓으면 **시작한 칸의 바로 옆 칸**으로 붙는다(가장 가까운 칸이면 크게 움직였을 때 두 칸을 뛴다).
    private var handle: some View {
        Capsule().fill(tk.canvasSoft)
            .overlay(Capsule().strokeBorder(tk.hairline))
            .overlay(Capsule().fill(tk.inkFaint.opacity(0.6)).frame(width: 28, height: 3))
            .frame(width: 56, height: 18)
            .frame(maxWidth: .infinity, minHeight: 44)
            .contentShape(Rectangle())
            .onTapGesture { snap(to: ratio < Self.snaps[1] ? Self.snaps[1] : Self.snaps[0]) }
            .gesture(
                DragGesture()
                    .onChanged { v in
                        let start = dragStart ?? ratio
                        dragStart = start
                        // 위로 끌면 목록이 커진다. 화면 높이 대략 800 기준 비율
                        ratio = min(max(start - v.translation.height / 800, Self.snaps[0]), Self.snaps[1])
                    }
                    .onEnded { v in
                        let start = dragStart ?? ratio
                        dragStart = nil
                        let up = v.translation.height < -8, down = v.translation.height > 8
                        snap(to: up ? Self.snaps[1] : down ? Self.snaps[0] : start)
                    }
            )
            .accessibilityLabel("목록 크기 조절")
            .accessibilityAddTraits(.isButton)
    }

    private func snap(to value: CGFloat) {
        Motion.run(.easeOut(duration: 0.3), reduce: reduce) { ratio = value }
    }

    private func eventRow(_ e: OrgEvent) -> some View {
        Button {
            editing = e
            sheetOpen = true
        } label: {
            HStack(spacing: 10) {
                Capsule().fill(Color(hex: EventColors.of(e.color).bar)).frame(width: 4, height: 32)
                VStack(alignment: .leading, spacing: 2) {
                    Text(e.title).font(.tl(14)).foregroundStyle(tk.ink).lineLimit(1)
                    Text(range(e)).font(.tl(11)).foregroundStyle(tk.inkFaint)
                }
                Spacer()
            }
            .padding(.horizontal, 12).padding(.vertical, 10)
            .background(tk.surface, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(tk.hairline))
        }
        .buttonStyle(PressScale(scale: 0.98))
    }

    private func todoRow(_ t: Todo) -> some View {
        let done = t.status == .done
        let owner = board.member(t.ownerId)
        return HStack(spacing: 10) {
            Button {
                // 남의 할 일을 끝내는 건 대신 처리 — 메모를 반드시 받는다
                if !done && t.ownerId != board.userId { onHandoff(t) } else { board.toggle(t) }
            } label: { CheckBox(checked: done) }
                .buttonStyle(PressScale())
                .accessibilityLabel(done ? "완료 취소" : "완료")
            AvatarView(member: owner, size: 24)
            VStack(alignment: .leading, spacing: 1) {
                Text(t.title).font(.tl(14)).strikethrough(done, color: tk.inkFaint)
                    .foregroundStyle(done ? tk.inkFaint : tk.ink).lineLimit(1)
                Text(owner?.displayName ?? "알 수 없음").font(.tl(11)).foregroundStyle(tk.inkFaint)
            }
            Spacer()
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
        .background(tk.surface, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(tk.hairline))
        .animation(reduce ? nil : Motion.quick, value: done)
    }

    // MARK: 계산·동작

    private var visibleTodos: [Todo] {
        board.showDone ? board.todos : board.todos.filter { $0.status != .done }
    }

    private var visibleTodosByDate: [String: [Todo]] {
        Dictionary(grouping: visibleTodos.filter { $0.dueDate != nil }, by: { $0.dueDate! })
    }

    private var monthLabel: String {
        let p = month.split(separator: "-")
        return p.count == 2 ? "\(p[0])년 \(Int(p[1]) ?? 0)월" : month
    }

    /// "10월 18일 (토) · 오늘" — 어제·오늘·내일만 상대 표현을 붙인다
    private var selectedLabel: String {
        guard let d = Due.date(selected) else { return selected }
        let base = d.formatted(.dateTime.month(.wide).day().weekday(.abbreviated).locale(Locale(identifier: "ko_KR")))
        let diff = CalendarMath.daysBetween(today, selected)
        return abs(diff) <= 1 ? "\(base) · \(Due.relative(selected))" : base
    }

    private func range(_ e: OrgEvent) -> String {
        func md(_ d: String) -> String {
            let p = d.split(separator: "-")
            return p.count == 3 ? "\(Int(p[1]) ?? 0)/\(Int(p[2]) ?? 0)" : d
        }
        return e.startDate == e.endDate ? md(e.startDate) : "\(md(e.startDate)) – \(md(e.endDate))"
    }

    private func describe(_ day: String, remaining: Int, events: [OrgEvent]) -> String {
        var parts = ["\(Int(day.dropFirst(5).prefix(2)) ?? 0)월 \(Int(day.suffix(2)) ?? 0)일"]
        if remaining > 0 { parts.append("남은 할 일 \(remaining)개") }
        if !events.isEmpty { parts.append("일정 " + events.map(\.title).joined(separator: ", ")) }
        return parts.joined(separator: ", ")
    }

    /// 달을 넘길 때 고른 날짜도 같이 옮긴다 — 같은 일자, 없으면 말일(1/31 → 2/28)
    private func shift(_ delta: Int) {
        let next = CalendarMath.shift(month, delta)
        let end = CalendarMath.lastDay(of: next)
        let candidate = "\(next)-\(selected.suffix(2))"
        direction = delta
        Motion.run(.easeOut(duration: 0.16), reduce: reduce) {
            month = next
            selected = candidate > end ? end : candidate
        }
    }

    private func goToday() {
        direction = month < today.prefix(7) ? 1 : -1
        Motion.run(.easeOut(duration: 0.16), reduce: reduce) {
            month = String(today.prefix(7))
            selected = today
        }
    }

    /// 좌우로 밀어 달을 넘긴다. 세로가 더 크면 손을 뗀다(목록 스크롤이다).
    private var swipe: some Gesture {
        DragGesture(minimumDistance: 24)
            .onEnded { v in
                guard abs(v.translation.width) > abs(v.translation.height), abs(v.translation.width) > 50 else { return }
                shift(v.translation.width < 0 ? 1 : -1)
            }
    }
}

/// 일정 추가·고치기 — 이름 · 색 · 시작 · 끝. 취소 버튼은 없다(시트는 끌어 내리면 닫힌다).
struct EventSheet: View {
    @Environment(\.tokens) private var tk
    @Environment(\.dismiss) private var dismiss
    let event: OrgEvent?
    let defaultDate: String
    let canDelete: Bool
    let store: CalendarStore

    @State private var title = ""
    @State private var color = EventColors.all[0].key
    @State private var start = ""
    @State private var end = ""
    @State private var busy = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(event == nil ? "일정 추가" : "일정 고치기").font(.tlTitle).foregroundStyle(tk.ink)

                labeled("이름") {
                    TextField("", text: $title, prompt: placeholder("예) 팝업 준비 기간", tk)).tlField()
                }
                labeled("색") {
                    HStack(spacing: 8) {
                        ForEach(EventColors.all, id: \.key) { c in
                            Button { color = c.key } label: {
                                Circle().fill(Color(hex: c.bar)).frame(width: 24, height: 24)
                                    .padding(4)
                                    .overlay(Circle().strokeBorder(color == c.key ? tk.ink : .clear, lineWidth: 2))
                            }
                            .buttonStyle(PressScale())
                            .accessibilityLabel(c.name)
                            .accessibilityAddTraits(color == c.key ? .isSelected : [])
                        }
                    }
                }
                // 일정은 시작과 끝이 반드시 있다 — "마감 없음" 칸을 두지 않는다
                labeled("시작") {
                    DuePicker(value: start, allowNone: false) { next in
                        start = next ?? Due.today()
                        if start > end { end = start }
                    }
                }
                labeled("끝") {
                    DuePicker(value: end, allowNone: false) { end = $0 ?? start }
                }

                HStack(spacing: 8) {
                    if let event, canDelete {
                        Button("삭제") {
                            Task {
                                busy = true
                                if await store.remove(event) { dismiss() }
                                busy = false
                            }
                        }
                        .buttonStyle(TLButtonStyle(variant: .danger))
                    }
                    Button(event == nil ? "추가" : "저장") {
                        Task {
                            busy = true
                            if await store.save(event, title: title.trimmingCharacters(in: .whitespaces),
                                                color: color, start: start, end: end) { dismiss() }
                            busy = false
                        }
                    }
                    .buttonStyle(TLButtonStyle(fill: true))
                    .disabled(busy || title.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .padding(20)
        }
        .onAppear {
            title = event?.title ?? ""
            color = event?.color ?? EventColors.all[0].key
            start = event?.startDate ?? defaultDate
            end = event?.endDate ?? defaultDate
        }
        .presentationDetents([.large])
        .presentationBackground(tk.glassBgStrong)
        .presentationDragIndicator(.visible)
    }

    private func labeled<C: View>(_ label: String, @ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.tl(13, .medium)).foregroundStyle(tk.inkSecondary)
            content()
        }
    }
}
