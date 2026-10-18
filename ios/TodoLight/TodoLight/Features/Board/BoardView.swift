import SwiftUI
import TodoLightKit

/// 멤버별 컬럼을 좌우로 미는 보드 — 한 화면에 한 명, **내 컬럼이 항상 첫 번째**.
/// 웹에서 손으로 만든 캐러셀(스냅·드래그·클릭 삼키기)은 네이티브 페이징이 대신한다.
struct BoardView: View {
    let org: OrganizationSummary
    let orgs: [OrganizationSummary]
    let onSwitchOrg: (String) -> Void

    @Environment(SessionStore.self) private var session
    @State private var store: BoardStore
    @State private var page: String?
    @State private var handoffTodo: Todo?
    @State private var givingTodo: Todo?

    init(org: OrganizationSummary, orgs: [OrganizationSummary], userId: String, onSwitchOrg: @escaping (String) -> Void) {
        self.org = org
        self.orgs = orgs
        self.onSwitchOrg = onSwitchOrg
        _store = State(initialValue: BoardStore(orgId: org.id, userId: userId))
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            switch store.phase {
            case .loading:
                ProgressView().frame(maxHeight: .infinity)
            case .failed(let message):
                ContentUnavailableView {
                    Label(message, systemImage: "wifi.exclamationmark")
                } actions: {
                    Button("다시 시도") { Task { await start() } }
                }
            case .ready:
                chips
                pager
            }
        }
        .overlay(alignment: .bottom) { banner }
        .task { await start() }
        .onDisappear { Task { await store.stopRealtime() } }
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
    }

    /// 첫 진입과 "다시 시도"가 같은 순서를 탄다 — 읽기만 다시 하면 페이지도 실시간도 안 잡힌다.
    private func start() async {
        await store.load()
        guard store.phase == .ready else { return }
        if page == nil { page = store.members.first?.userId }
        await store.startRealtime()
    }

    private var header: some View {
        HStack {
            Menu {
                if orgs.count > 1 {
                    Section("조직 바꾸기") {
                        ForEach(orgs) { o in
                            Button(o.name) { onSwitchOrg(o.id) }.disabled(o.id == org.id)
                        }
                    }
                }
                Button("로그아웃", role: .destructive) { Task { await session.signOut() } }
            } label: {
                HStack(spacing: 4) {
                    Text(org.name).font(.headline).foregroundStyle(.primary)
                    Image(systemName: "chevron.down").font(.caption).foregroundStyle(.secondary)
                }
            }
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }

    /// 멤버 칩 — 사람이 많을수록 미는 것보다 한 번 누르는 쪽이 빠르다(웹 「멤버 칩은 늘 띄운다」)
    private var chips: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(store.members) { m in
                        Button {
                            withAnimation(.snappy) { page = m.userId }
                        } label: {
                            HStack(spacing: 6) {
                                AvatarView(member: m, size: 20)
                                Text(m.userId == store.userId ? "나" : m.displayName).font(.subheadline)
                            }
                            .padding(.horizontal, 10)
                            .frame(height: 32)
                            .background(page == m.userId ? Color.accentColor.opacity(0.15) : Color(.secondarySystemBackground), in: Capsule())
                        }
                        .buttonStyle(.plain)
                        .id(m.userId)
                    }
                }
                .padding(.horizontal, 16)
            }
            .onChange(of: page) { _, id in withAnimation { proxy.scrollTo(id, anchor: .center) } }
        }
        .padding(.bottom, 8)
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
        // 다른 사람으로 넘어가면 펼친 카드를 접는다
        .onChange(of: page) { _, _ in store.openTodoId = nil }
    }

    @ViewBuilder private var banner: some View {
        if let b = store.banner {
            HStack {
                Text(b.message).font(.subheadline)
                Spacer()
                if let undo = b.undo {
                    Button("실행취소") { undo() }.font(.subheadline.bold())
                }
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 48)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
            .transition(.move(edge: .bottom).combined(with: .opacity))
            .task(id: b.id) {
                // 지우기 실행취소는 웹과 같이 7초
                try? await Task.sleep(for: .seconds(b.undo == nil ? 3 : 7))
                if store.banner?.id == b.id { withAnimation { store.banner = nil } }
            }
        }
    }
}

struct AvatarView: View {
    let member: MemberSummary?
    var size: CGFloat = 24

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

    /// 사진이 없으면 이름 첫 글자 + id에서 뽑은 색. 테마 토큰(M2 6단계) 전까지는 색상환에서 고른다.
    private func initial(_ name: String) -> some View {
        let seed = (member?.userId ?? name).unicodeScalars.reduce(0) { ($0 &* 31 &+ Int($1.value)) & 0xFFFF }
        return ZStack {
            Color(hue: Double(seed % 360) / 360, saturation: 0.35, brightness: 0.85)
            Text(BoardRules.initial(of: name)).font(.system(size: size * 0.45, weight: .semibold)).foregroundStyle(.black.opacity(0.7))
        }
    }
}
