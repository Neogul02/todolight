import SwiftUI
import TodoLightKit

/// 가계부 — 조직이 쓴 돈. 웹 `app/(app)/ledger/LedgerClient.tsx`와 같은 규칙:
/// - **달 단위로 본다.** 범위가 없으면 합계가 영원히 커지기만 해서 숫자가 의미를 잃는다.
/// - 합계는 **클라이언트에서** 낸다(어차피 그 달 행을 전부 그린다).
/// - **낙관적 반영을 하지 않는다.** 합계가 잠깐이라도 틀린 값을 보이는 쪽이 200ms 기다리는 것보다 나쁘다.
/// - 금액은 원 단위 정수(Int64). 상한 1조는 서버 zod·DB check와 같은 값이다.
@MainActor
@Observable
final class LedgerStore {
    let orgId: String
    private(set) var month = String(Due.today().prefix(7))
    private(set) var entries: [LedgerEntry] = []
    private(set) var loading = true
    private(set) var error: String?
    @ObservationIgnored let banner: (BoardStore.Banner) -> Void

    private var api: APIClient { Backend.shared.api }

    init(orgId: String, banner: @escaping (BoardStore.Banner) -> Void) {
        self.orgId = orgId
        self.banner = banner
    }

    var total: Int64 { entries.reduce(0) { $0 + $1.amount } }

    /// 낸 사람별 합계 — 큰 순
    var byPayer: [(payerId: String, sum: Int64)] {
        Dictionary(grouping: entries, by: \.payerId)
            .map { ($0.key, $0.value.reduce(0) { $0 + $1.amount }) }
            .sorted { $0.1 > $1.1 }
    }

    /// 달을 넘기는 순간 옛 달 행을 걷는다 — 그대로 두면 응답이 오기 전(또는 실패하면 계속)
    /// 새 달 이름 아래에 지난 달 합계가 뜬다. 틀린 합계를 잠깐이라도 보이느니 기다리게 한다.
    func go(_ delta: Int) async {
        month = CalendarMath.shift(month, delta)
        entries = []
        error = nil
        loading = true
        await load()
    }

    func load() async {
        let asked = month
        do {
            let rows = try await api.fetchLedger(orgId: orgId, month: asked)
            // 달을 빠르게 넘기면 늦게 온 옛 달 응답이 지금 달을 덮는다 — 물어본 달이 아직 지금 달일 때만 반영
            guard asked == month else { return }
            entries = rows.sorted { ($0.spentOn, $0.createdAt) > ($1.spentOn, $1.createdAt) }
            error = nil
        } catch {
            if asked == month {
                entries = []
                self.error = BoardStore.message(error)
            }
        }
        loading = false
    }

    func add(amount: Int64, title: String, spentOn: String) async -> Bool {
        do {
            _ = try await api.createLedgerEntry(orgId: orgId, amount: amount, title: title, spentOn: spentOn)
            await load()
            return true
        } catch {
            banner(.init(message: BoardStore.message(error)))
            return false
        }
    }

    /// 소프트 삭제라 확인 없이 지우고 실행취소를 준다
    func remove(_ entry: LedgerEntry) async {
        do {
            _ = try await api.deleteLedgerEntry(id: entry.id)
            await load()
            banner(.init(message: tr("지출을 지웠어요", "Entry deleted")) { [weak self] in
                Task {
                    guard let self else { return }
                    do { _ = try await self.api.restoreLedgerEntry(id: entry.id) } catch {
                        self.banner(.init(message: BoardStore.message(error)))
                    }
                    await self.load()
                }
            })
        } catch {
            banner(.init(message: BoardStore.message(error)))
        }
    }
}

struct LedgerView: View {
    @Environment(\.tokens) private var tk
    @Environment(\.scenePhase) private var scenePhase
    let board: BoardStore
    let store: LedgerStore

    @State private var amountText = ""
    @State private var title = ""
    @State private var spentOn = Due.today()
    @State private var busy = false
    @FocusState private var focus: Field?

    private enum Field { case amount, title }
    /// 1조 = 13자리. 넘는 자리는 아예 받지 않는다(서버 상한과 같은 값)
    private static let maxDigits = 13
    private static let maxAmount: Int64 = 1_000_000_000_000

    private var amount: Int64 { Int64(amountText.filter(\.isNumber)) ?? 0 }
    private var canSubmit: Bool {
        amount > 0 && amount <= Self.maxAmount && !title.trimmingCharacters(in: .whitespaces).isEmpty && !busy
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                monthBar
                summaryCard
                formCard
                list
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 110)
        }
        .scrollDismissesKeyboard(.interactively)
        .refreshable { await store.load() }
        .task { await store.load() }
        .onAppear { spentOn = Self.defaultDay(of: store.month) }
        .onChange(of: store.month) { _, m in spentOn = Self.defaultDay(of: m) }
        // 팀원이 적은 지출 — 실시간 채널 대신 앱이 앞으로 돌아올 때 다시 읽는다
        .onChange(of: scenePhase) { _, phase in if phase == .active { Task { await store.load() } } }
    }

    // MARK: 조각

    private var monthBar: some View {
        HStack {
            monthButton("chevron.left", tr("이전 달", "Previous month"), -1)
            Spacer()
            Text(monthLabel).font(.tlTitle).foregroundStyle(tk.ink).monospacedDigit()
            Spacer()
            monthButton("chevron.right", tr("다음 달", "Next month"), 1)
        }
    }

    private func monthButton(_ icon: String, _ label: String, _ delta: Int) -> some View {
        Button { Task { await store.go(delta) } } label: {
            Image(systemName: icon).font(.system(size: 16, weight: .medium)).foregroundStyle(tk.inkSecondary)
                .frame(width: 40, height: 40)
        }
        .buttonStyle(PressScale())
        .accessibilityLabel(label)
    }

    private var summaryCard: some View {
        card {
            Text(tr("쓴 돈", "Spent")).font(.tlCaption).foregroundStyle(tk.inkMuted)
            if store.loading {
                RoundedRectangle(cornerRadius: 6).fill(tk.canvasSoft).frame(width: 160, height: 32).padding(.top, 4)
            } else {
                Text(Money.format(store.total)).font(.tl(26, .bold)).foregroundStyle(tk.ink).monospacedDigit()
                    .contentTransition(.numericText())
                    .padding(.top, 2)
                Text(tr("\(store.entries.count)건", store.entries.count == 1 ? "1 entry" : "\(store.entries.count) entries"))
                    .font(.tlCaption).foregroundStyle(tk.inkFaint)
                if !store.byPayer.isEmpty {
                    Rectangle().fill(tk.hairline).frame(height: 1).padding(.vertical, 12)
                    VStack(spacing: 8) {
                        ForEach(store.byPayer, id: \.payerId) { row in
                            let m = board.member(row.payerId)
                            HStack(spacing: 8) {
                                AvatarView(member: m, size: 24)
                                Text(m?.displayName ?? tr("알 수 없음", "Unknown")).font(.tl(14)).foregroundStyle(tk.ink).lineLimit(1)
                                Spacer()
                                Text(Money.format(row.sum)).font(.tl(14)).foregroundStyle(tk.inkSecondary).monospacedDigit()
                            }
                        }
                    }
                }
            }
        }
    }

    private var formCard: some View {
        let first = "\(store.month)-01"
        let days = CalendarMath.daysBetween(first, CalendarMath.lastDay(of: store.month))
        return card {
            VStack(spacing: 10) {
                HStack(spacing: 8) {
                    // 숫자 키패드 + 천 단위 쉼표 — "12000"과 "120000"을 눈으로 구분하기 어려운 게 오입력의 큰 원인
                    TextField("", text: $amountText, prompt: placeholder(tr("금액", "Amount"), tk))
                        .keyboardType(.numberPad)
                        .focused($focus, equals: .amount)
                        .monospacedDigit()
                        .onChange(of: amountText) { _, raw in
                            let digits = String(raw.filter(\.isNumber).drop(while: { $0 == "0" }).prefix(Self.maxDigits))
                            let shown = digits.isEmpty ? "" : (Int64(digits).map(Money.grouped) ?? "")
                            if shown != raw { amountText = shown }
                        }
                        .tlField()
                        .frame(width: 130)
                    TextField("", text: $title, prompt: placeholder(tr("어디에 썼나요", "What was it for?"), tk))
                        .focused($focus, equals: .title)
                        .submitLabel(.done)
                        .onChange(of: title) { _, v in if v.count > 100 { title = String(v.prefix(100)) } }
                        .onSubmit { Task { await submit() } }
                        .tlField()
                }
                // 그 달 날짜만 — 다른 달로 저장돼 목록에서 사라지는 일을 막는다
                DuePicker(value: spentOn, allowNone: false, anchor: first, pastDays: 0, futureDays: days) {
                    spentOn = $0 ?? spentOn
                }
                .id(store.month)
                if amount > Self.maxAmount {
                    Text(tr("1조 원 이하로 적어 주세요.", "Keep it under ₩1 trillion."))
                        .font(.tlCaption).foregroundStyle(tk.danger)
                }
                Button(tr("추가", "Add")) { Task { await submit() } }
                    .buttonStyle(TLButtonStyle(fill: true))
                    .disabled(!canSubmit)
            }
        }
    }

    @ViewBuilder private var list: some View {
        if store.loading {
            ForEach(0..<3, id: \.self) { _ in RoundedRectangle(cornerRadius: 12).fill(tk.surface).frame(height: 56) }
        } else if let error = store.error {
            Text(error).font(.tlCaption).foregroundStyle(tk.danger).padding(.vertical, 24)
        } else if store.entries.isEmpty {
            Text(tr("적어 둔 지출이 없어요", "Nothing logged yet")).font(.tlCaption).foregroundStyle(tk.inkFaint).padding(.vertical, 24)
        } else {
            VStack(spacing: 8) {
                ForEach(store.entries) { row($0).transition(.card) }
            }
        }
    }

    private func row(_ e: LedgerEntry) -> some View {
        let m = board.member(e.payerId)
        // 서버 assertCanRemoveEntry와 같은 규칙 — 적은 사람·낸 사람·방장/관리자
        let canRemove = e.createdBy == board.userId || e.payerId == board.userId || board.isManager
        return HStack(alignment: .top, spacing: 10) {
            AvatarView(member: m, size: 24).padding(.top, 2)
            VStack(alignment: .leading, spacing: 2) {
                Text(e.title).font(.tlBodySm).foregroundStyle(tk.ink)
                Text("\(m?.displayName ?? tr("알 수 없음", "Unknown")) · \(Due.relative(e.spentOn))")
                    .font(.tlCaption).foregroundStyle(tk.inkFaint)
            }
            Spacer(minLength: 8)
            Text(Money.format(e.amount)).font(.tl(15, .medium)).foregroundStyle(tk.ink).monospacedDigit().padding(.top, 1)
            // 소프트 삭제라 확인 없이 지운다 — 되살릴 수 있는 것과 아닌 것을 구분한다
            if canRemove {
                Button { Task { await store.remove(e) } } label: {
                    Image(systemName: "xmark").font(.system(size: 11, weight: .bold)).foregroundStyle(tk.inkFaint)
                        .frame(width: 28, height: 28)
                }
                .buttonStyle(PressScale())
                .accessibilityLabel(tr("삭제", "Delete"))
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(tk.surface, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(tk.hairline))
    }

    private func card<C: View>(@ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 0, content: content)
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(tk.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(tk.hairline))
    }

    // MARK: 동작

    private func submit() async {
        guard canSubmit else { return }
        busy = true
        if await store.add(amount: amount, title: title.trimmingCharacters(in: .whitespaces), spentOn: spentOn) {
            amountText = ""
            title = ""
            focus = nil
        }
        busy = false
    }

    private var monthLabel: String {
        guard let d = Due.date("\(store.month)-01") else { return store.month }
        return d.formatted(.dateTime.year().month(.wide).locale(AppLang.locale))
    }

    /// 이번 달이면 오늘, 다른 달이면 그 달 1일
    private static func defaultDay(of month: String) -> String {
        Due.today().hasPrefix(month) ? Due.today() : "\(month)-01"
    }
}

/// 원화 표시 — 통화는 원화로 고정(웹 formatMoney와 같다). 언어만 따라간다: "₩12,000" / "₩12,000"
enum Money {
    static func format(_ amount: Int64) -> String {
        amount.formatted(.currency(code: "KRW").precision(.fractionLength(0)).locale(AppLang.locale))
    }

    static func grouped(_ n: Int64) -> String {
        n.formatted(.number.grouping(.automatic).locale(AppLang.locale))
    }
}

/// 가계부를 꺼 둔 채 들어왔을 때 — 조용히 튕기지 않고 어디서 켜는지 알려 준다
struct LedgerOffNotice: View {
    @Environment(\.tokens) private var tk
    let onSettings: () -> Void

    var body: some View {
        VStack(spacing: 8) {
            Text(tr("가계부를 꺼 두셨어요", "The ledger is turned off")).font(.tl(22, .bold)).foregroundStyle(tk.ink)
            Text(tr("내 설정에서 가계부를 켜면 다시 쓸 수 있어요.", "Turn it back on in your settings to use it again."))
                .font(.tlBodySm).foregroundStyle(tk.inkMuted).multilineTextAlignment(.center)
            Button(tr("설정으로 가기", "Go to settings"), action: onSettings)
                .buttonStyle(TLButtonStyle())
                .padding(.top, 20)
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
