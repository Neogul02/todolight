import SwiftUI
import TodoLightKit

/// 멤버별 컬럼을 좌우로 미는 보드 — 한 화면에 한 명, **내 컬럼이 항상 첫 번째**.
///
/// 웹 모바일 보드와 같은 구조: 위에는 헤더 없이 멤버 칩 줄, 아래에는 떠 있는 알약 하나
/// (보드 · 달력 · 가계부 | 프로필). 조직 바꾸기·로그아웃은 프로필 시트 안에 모여 있다.
struct BoardView: View {
    let org: OrganizationSummary
    let orgs: [OrganizationSummary]
    let onSwitchOrg: (String) -> Void
    let onOpen: (AppRoute) -> Void

    @Environment(SessionStore.self) private var session
    @Environment(ThemeStore.self) private var theme
    @Environment(\.tokens) private var tk
    @Environment(\.accessibilityReduceMotion) private var reduce
    @State private var store: BoardStore
    @State private var page: String?
    @State private var handoffTodo: Todo?
    @State private var givingTodo: Todo?
    @State private var menuOpen = false

    init(org: OrganizationSummary, orgs: [OrganizationSummary], userId: String,
         onSwitchOrg: @escaping (String) -> Void, onOpen: @escaping (AppRoute) -> Void) {
        self.org = org
        self.orgs = orgs
        self.onSwitchOrg = onSwitchOrg
        self.onOpen = onOpen
        _store = State(initialValue: BoardStore(orgId: org.id, userId: userId))
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            CanvasBackground()

            VStack(spacing: 0) {
                switch store.phase {
                case .loading:
                    BoardSkeleton()
                case .failed(let message):
                    VStack(spacing: 12) {
                        Text(message).font(.tlBodySm).foregroundStyle(tk.inkMuted)
                        Button("다시 시도") { Task { await start() } }.buttonStyle(TLButtonStyle(variant: .outline))
                    }
                    .frame(maxHeight: .infinity)
                case .ready:
                    chips
                    pager
                }
            }

            VStack(spacing: 8) {
                banner
                TabBar(me: store.me, onProfile: { menuOpen = true })
            }
        }
        .task { await start() }
        .onDisappear { Task { await store.stopRealtime() } }
        .onChange(of: store.themePreference) { _, pref in if let pref { theme.preference = pref } }
        .sheet(item: $handoffTodo) { todo in
            HandoffSheet(todo: todo, ownerName: store.member(todo.ownerId)?.displayName ?? "팀원") {
                store.handOff(todo, note: $0)
            }
        }
        .sheet(item: $givingTodo) { todo in
            GiveSheet(todo: todo, candidates: store.members.filter { $0.userId != todo.ownerId }) {
                store.give(todo, to: $0, note: $1)
            }
        }
        .sheet(isPresented: $menuOpen) {
            ProfileSheet(me: store.me, org: org, orgs: orgs, onSwitchOrg: { id in
                menuOpen = false
                onSwitchOrg(id)
            }, onOpen: { route in
                menuOpen = false
                onOpen(route)
            }, onSignOut: { Task { await session.signOut() } })
        }
    }

    /// 첫 진입과 "다시 시도"가 같은 순서를 탄다 — 읽기만 다시 하면 페이지도 실시간도 안 잡힌다.
    private func start() async {
        await store.load()
        guard store.phase == .ready else { return }
        if page == nil { page = store.members.first?.userId }
        await store.startRealtime()
    }

    /// 멤버 칩 — 사람이 많을수록 미는 것보다 한 번 누르는 쪽이 빠르다(웹 「멤버 칩은 늘 띄운다」)
    private var chips: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(store.members) { m in
                        MemberChip(
                            member: m,
                            isMe: m.userId == store.userId,
                            active: page == m.userId,
                            remaining: store.column(for: m.userId).open.count
                        ) {
                            Motion.run(.snappy(duration: 0.3), reduce: reduce) { page = m.userId }
                        }
                        .id(m.userId)
                    }
                }
                .padding(.horizontal, 12)
            }
            .onChange(of: page) { _, id in
                Motion.run(.snappy(duration: 0.3), reduce: reduce) { proxy.scrollTo(id, anchor: .center) }
            }
        }
        .frame(height: 56)
    }

    private var pager: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            LazyHStack(spacing: 0) {
                ForEach(store.members) { m in
                    MemberColumnView(
                        store: store,
                        member: m,
                        onHandoff: { handoffTodo = $0 },
                        onGive: { givingTodo = $0 }
                    )
                    .containerRelativeFrame(.horizontal)
                    .id(m.userId)
                }
            }
            .scrollTargetLayout()
        }
        .scrollTargetBehavior(.paging)
        .scrollPosition(id: $page)
        .ignoresSafeArea(edges: .bottom)
        // 다른 사람으로 넘어가면 펼친 카드를 접는다
        .onChange(of: page) { _, _ in store.openTodoId = nil }
    }

    /// 토스트 — 웹 sonner 자리. 시맨틱 토큰으로 칠한다(richColors의 흰 박스는 어두운 테마에서 튄다).
    @ViewBuilder private var banner: some View {
        if let b = store.banner {
            HStack {
                Text(b.message).font(.tl(14, .medium)).foregroundStyle(tk.ink)
                Spacer()
                if let undo = b.undo {
                    Button("실행취소") { undo() }.font(.tl(14, .semibold)).foregroundStyle(tk.accent)
                }
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 48)
            .glassCard(radius: 14)
            .padding(.horizontal, 16)
            .transition(.move(edge: .bottom).combined(with: .opacity))
            .task(id: b.id) {
                // 지우기 실행취소는 웹과 같이 7초
                try? await Task.sleep(for: .seconds(b.undo == nil ? 3 : 7))
                if store.banner?.id == b.id { Motion.run(Motion.quick, reduce: reduce) { store.banner = nil } }
            }
        }
    }
}

/// 웹 `MemberChip` — h-40 알약, 고른 칩만 surface + 진한 테두리, 남은 개수 뱃지.
private struct MemberChip: View {
    @Environment(\.tokens) private var tk
    let member: MemberSummary
    let isMe: Bool
    let active: Bool
    let remaining: Int
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 6) {
                AvatarView(member: member, size: 24)
                Text(isMe ? "나" : member.displayName).font(.tl(13, .medium)).lineLimit(1).frame(maxWidth: 80)
                if remaining > 0 {
                    Text("\(remaining)").font(.tl(11, .bold)).monospacedDigit()
                        .foregroundStyle(active ? tk.accentInk : tk.inkSecondary)
                        .frame(minWidth: 18, minHeight: 18)
                        .padding(.horizontal, 2)
                        .background(active ? tk.accent : tk.hairline, in: Capsule())
                }
            }
            .foregroundStyle(active ? tk.ink : tk.inkMuted)
            .padding(.leading, 4)
            .padding(.trailing, 10)
            .frame(height: 40)
            .background(active ? tk.surface : tk.canvasSoft, in: Capsule())
            .overlay(Capsule().strokeBorder(active ? tk.hairlineStrong : .clear, lineWidth: 1))
        }
        .buttonStyle(PressScale(scale: 0.97))
    }
}

/// 하단 탭바 — 알약 하나만 뜨고 그 좌우로는 화면이 그대로 보인다.
/// 활성 판은 칸마다 그리지 않고 **하나를 옮긴다**(웹 layoutId → matchedGeometryEffect).
/// 프로필 칸에는 판이 붙지 않는다 — 패널이 아니라 시트를 연다.
private struct TabBar: View {
    @Environment(\.tokens) private var tk
    @Environment(\.accessibilityReduceMotion) private var reduce
    @Namespace private var ns
    let me: MemberSummary?
    let onProfile: () -> Void
    @State private var active = "board"
    @State private var notice: String?

    var body: some View {
        HStack(spacing: 4) {
            item("board", "보드", icon: "rectangle.split.2x1")
            item("calendar", "달력", icon: "calendar")
            item("ledger", "가계부", icon: "wonsign.circle")
            Rectangle().fill(tk.hairlineStrong).frame(width: 1, height: 28).padding(.horizontal, 2)
            Button(action: onProfile) {
                VStack(spacing: 2) {
                    AvatarView(member: me, size: 24).frame(height: 22)
                    Text("나").font(.tl(10, .medium))
                }
                .foregroundStyle(tk.inkMuted)
                .frame(width: 64)
                .padding(.vertical, 6)
            }
            .buttonStyle(PressScale(scale: 0.95))
            .accessibilityLabel("메뉴")
        }
        .padding(6)
        .background(.ultraThinMaterial, in: Capsule())
        .background(tk.glassBg, in: Capsule())
        .overlay(Capsule().strokeBorder(tk.glassBorder, lineWidth: 1))
        .shadow(color: .black.opacity(0.08), radius: 12, y: 8)
        .overlay(alignment: .top) {
            if let notice {
                Text(notice).font(.tl(12, .medium)).foregroundStyle(tk.inkInvert)
                    .padding(.horizontal, 10).padding(.vertical, 6)
                    .background(tk.ink, in: Capsule())
                    .offset(y: -40)
                    .transition(.opacity)
            }
        }
        .padding(.bottom, 12)
    }

    private func item(_ key: String, _ label: String, icon: String) -> some View {
        let on = active == key
        return Button {
            guard key == "board" else {
                // 달력·가계부는 아직 웹에만 있다 — 눌렀을 때 아무 일 없으면 고장처럼 보인다
                Motion.run(Motion.quick, reduce: reduce) { notice = "\(label)은 곧 앱에도 열려요" }
                Task {
                    try? await Task.sleep(for: .seconds(1.6))
                    Motion.run(Motion.quick, reduce: reduce) { notice = nil }
                }
                return
            }
            Motion.run(Motion.tabSpring, reduce: reduce) { active = key }
        } label: {
            VStack(spacing: 2) {
                Image(systemName: icon).font(.system(size: 19)).frame(height: 22)
                Text(label).font(.tl(10, .medium))
            }
            .foregroundStyle(on ? tk.accent : tk.inkMuted)
            .frame(width: 64)
            .padding(.vertical, 6)
            .background {
                if on {
                    Capsule().fill(tk.accentSoft).matchedGeometryEffect(id: "tabbar-active", in: ns)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

/// 보드 스켈레톤 — 실제 컬럼과 같은 자리·크기라 데이터가 와도 레이아웃이 튀지 않는다.
private struct BoardSkeleton: View {
    @Environment(\.tokens) private var tk
    @State private var dim = false

    var body: some View {
        VStack(spacing: 8) {
            HStack(spacing: 6) {
                ForEach(0..<3, id: \.self) { _ in Capsule().fill(tk.canvasSoft).frame(width: 84, height: 40) }
                Spacer()
            }
            .padding(.horizontal, 12)
            .frame(height: 56)
            VStack(spacing: 8) {
                ForEach(0..<4, id: \.self) { _ in
                    RoundedRectangle(cornerRadius: 12).fill(tk.surface).frame(height: 48)
                }
                Spacer()
            }
            .padding(12)
            .background(tk.canvasSoft.opacity(0.55), in: RoundedRectangle(cornerRadius: 16))
            .padding(.horizontal, 12)
        }
        .opacity(dim ? 0.55 : 1)
        .onAppear { withAnimation(.easeInOut(duration: 0.9).repeatForever()) { dim = true } }
    }
}
