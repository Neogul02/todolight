import StoreKit
import SwiftUI
import TodoLightKit

/// todolight Pro 구독 시트 — 내 설정의 Pro 카드와 팀 화면(인원이 다 찼을 때)에서 연다.
///
/// 심사가 보는 것: 구독 이름·기간·가격, 자동 갱신 안내, 이용약관·개인정보 처리방침 링크, 구매 복원.
/// 전부 이 시트 안에 있어야 한다(Guideline 3.1.2).
struct ProSheet: View {
    @Environment(\.tokens) private var tk
    @Environment(\.dismiss) private var dismiss
    let userId: String

    @State private var picked: String = ProStore.productIDs[2]
    @State private var busy = false
    @State private var error: String?

    private var store: ProStore { .shared }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("todolight Pro").font(.tlTitle).foregroundStyle(tk.ink)
                Text(tr("내가 방장인 조직에 \(FreeSeats.count)명 넘게 초대할 수 있어요.",
                        "Invite more than \(FreeSeats.count) people to orgs you own.", "自分がオーナーのチームに\(FreeSeats.count)人を超えて招待できます。"))
                    .font(.tlBodySm).foregroundStyle(tk.inkSecondary)

                if store.products.isEmpty && store.productsLoaded {
                    Text(tr("지금은 구독 정보를 불러올 수 없어요. 잠시 뒤 다시 열어 주세요.",
                            "Subscription details are unavailable right now. Please try again shortly.", "現在サブスクリプションの情報を読み込めません。しばらくしてからもう一度開いてください。"))
                        .font(.tlBodySm).foregroundStyle(tk.inkMuted)
                } else if store.products.isEmpty {
                    VStack(spacing: 8) {
                        ForEach(0..<3, id: \.self) { _ in
                            RoundedRectangle(cornerRadius: 14).fill(tk.canvasSoft).frame(height: 60)
                        }
                    }
                    .skeletonPulse()
                } else {
                    VStack(spacing: 8) {
                        ForEach(store.products, id: \.id) { planRow($0) }
                    }
                }

                if let error { Text(error).font(.tlCaption).foregroundStyle(tk.danger) }

                Button(busy ? tr("결제하는 중…", "Purchasing…", "購入中…") : tr("구독하기", "Subscribe", "登録する")) {
                    Task { await buy() }
                }
                .buttonStyle(TLButtonStyle(variant: .primary, fill: true))
                .disabled(busy || store.products.isEmpty)

                Button(tr("구매 복원", "Restore purchases", "購入を復元")) {
                    Task {
                        busy = true
                        await store.restore()
                        busy = false
                        if store.isPro { dismiss() }
                        else { error = tr("복원할 구독이 없어요.", "No subscription to restore.", "復元できるサブスクリプションがありません。") }
                    }
                }
                .font(.tlCaption).foregroundStyle(tk.inkMuted)
                .frame(maxWidth: .infinity)
                .disabled(busy)

                Text(tr("기간이 끝나기 24시간 전까지 해지하지 않으면 같은 기간으로 자동 갱신돼요. App Store 계정 설정에서 언제든 해지할 수 있어요.",
                        "Renews automatically for the same period unless cancelled at least 24 hours before it ends. Cancel anytime in your App Store account settings.", "期間終了の24時間前までに解約しない限り、同じ期間で自動更新されます。App Storeのアカウント設定からいつでも解約できます。"))
                    .font(.tlCaption).foregroundStyle(tk.inkFaint)
                HStack(spacing: 16) {
                    Link(tr("이용약관", "Terms", "利用規約"), destination: AppConfig.apiBaseURL.appending(path: "legal/terms"))
                    Link(tr("개인정보 처리방침", "Privacy", "プライバシーポリシー"), destination: AppConfig.apiBaseURL.appending(path: "legal/privacy"))
                }
                .font(.tlCaption).foregroundStyle(tk.inkMuted)
            }
            .padding(20)
        }
        .presentationDetents([.large])
        .presentationBackground(tk.glassBgStrong)
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(busy)
        .task { await store.loadProducts() }
    }

    private func planRow(_ p: Product) -> some View {
        let selected = picked == p.id
        return Button { picked = p.id } label: {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(periodName(p)).font(.tlBodySm.weight(.semibold)).foregroundStyle(tk.ink)
                    if let pct = store.savingPercent(p) {
                        Text(tr("\(pct)% 할인", "Save \(pct)%", "\(pct)%お得")).font(.tlCaption).foregroundStyle(tk.success)
                    }
                }
                Spacer()
                Text(p.displayPrice).font(.tlBodySm).foregroundStyle(tk.ink)
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 60)
            .background(selected ? tk.accentSoft : tk.surface, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(selected ? tk.accent : tk.hairline, lineWidth: selected ? 2 : 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private func periodName(_ p: Product) -> String {
        switch p.subscription?.subscriptionPeriod.months ?? 0 {
        case 1: tr("1개월", "Monthly", "1か月")
        case 6: tr("6개월", "6 months", "6か月")
        case 12: tr("1년", "Yearly", "1年")
        default: p.displayName
        }
    }

    private func buy() async {
        guard let product = store.products.first(where: { $0.id == picked }) else { return }
        busy = true
        error = nil
        do {
            if try await store.purchase(product, userId: userId) { dismiss() }
        } catch {
            self.error = tr("결제하지 못했어요. 잠시 뒤 다시 해 주세요.", "Purchase failed. Please try again shortly.", "購入できませんでした。しばらくしてからもう一度お試しください。")
        }
        busy = false
    }
}

/// 무료 조직이 가질 수 있는 사람 수 — 서버 `FREE_ORG_SEATS`와 같다(문구에만 쓴다. 막는 건 서버다)
enum FreeSeats {
    static let count = 5
}
