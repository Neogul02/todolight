import Foundation
import Observation
import StoreKit
import TodoLightKit

/// todolight Pro 구독(StoreKit 2).
///
/// **Pro인지는 서버가 정한다.** 앱은 거래(JWS)를 서버에 넘기기만 하고(`syncAppleTransaction`),
/// 서버가 서명을 검증해 `pro_subscriptions`에 적는다. 웹에서 산 Pro도 같은 표라서, 앱이 StoreKit만
/// 보고 판정하면 웹 결제자가 앱에서 무료로 보인다.
///
/// 구매할 때 `appAccountToken`에 **사용자 id**를 심는다 — 같은 Apple ID로 다른 계정에 로그인해도
/// 구독은 산 계정에만 붙는다(서버가 토큰과 요청자를 대조한다).
@MainActor
@Observable
final class ProStore {
    static let shared = ProStore()

    /// App Store Connect 구독 그룹 「todolight Pro」 — 서버 `PRO_PRODUCT_IDS`와 같아야 한다
    static let productIDs = [
        "com.neogul02.todolight.pro.monthly",
        "com.neogul02.todolight.pro.halfyear",
        "com.neogul02.todolight.pro.yearly",
    ]

    private(set) var products: [Product] = []
    /// 한 번 물어봤다 — 그래도 비어 있으면 스토어에 상품이 없거나 연결이 안 된 것이다
    private(set) var productsLoaded = false
    private(set) var status: MyPro?
    private var updates: Task<Void, Never>?

    var isPro: Bool { status?.active == true }

    /// 로그인한 뒤 한 번. 다른 기기에서의 갱신·환불·가족 공유 변경이 `Transaction.updates`로 온다.
    func start() {
        if updates == nil {
            updates = Task { [weak self] in
                for await result in Transaction.updates { await self?.handle(result) }
            }
        }
        Task { await refresh() }
    }

    func stop() {
        updates?.cancel()
        updates = nil
        status = nil
    }

    func loadProducts() async {
        guard products.isEmpty else { return }
        let list = (try? await Product.products(for: Self.productIDs)) ?? []
        products = list.sorted { $0.price < $1.price }
        productsLoaded = true
    }

    /// 지금 가진 구독을 서버에 맞추고 상태를 다시 읽는다(앱을 열 때·복원할 때)
    func refresh() async {
        for await result in Transaction.currentEntitlements { await handle(result) }
        if let fresh = try? await Backend.shared.api.fetchMyPro() { status = fresh }
    }

    /// - Returns: 결제가 끝나 Pro가 됐으면 true. 취소·승인 대기(자녀 보호)면 false
    func purchase(_ product: Product, userId: String) async throws -> Bool {
        var options: Set<Product.PurchaseOption> = []
        if let token = UUID(uuidString: userId) { options.insert(.appAccountToken(token)) }
        switch try await product.purchase(options: options) {
        case .success(let result):
            await handle(result)
            return isPro
        case .userCancelled, .pending:
            return false
        @unknown default:
            return false
        }
    }

    func restore() async {
        try? await AppStore.sync()
        await refresh()
    }

    /// 서버가 받아 줬을 때만 `finish()`한다 — 실패하면 다음 실행 때 `Transaction.updates`로 다시 온다
    private func handle(_ result: VerificationResult<Transaction>) async {
        guard case .verified(let tx) = result, Self.productIDs.contains(tx.productID) else { return }
        do {
            status = try await Backend.shared.api.syncAppleTransaction(result.jwsRepresentation)
            await tx.finish()
        } catch {
            // 다른 계정이 산 구독이면 서버가 거절한다 — 이 계정은 Pro가 아닌 게 맞다
        }
    }

    /// 한 달 가격 대비 몇 % 싼지 — 상품 가격에서 계산해 App Store Connect 가격을 바꿔도 따라간다
    func savingPercent(_ product: Product) -> Int? {
        guard let monthly = products.first(where: { $0.id == Self.productIDs[0] }),
              let months = product.subscription?.subscriptionPeriod.months, months > 1
        else { return nil }
        let full = monthly.price * Decimal(months)
        let ratio = NSDecimalNumber(decimal: product.price / full).doubleValue
        let pct = Int(((1 - ratio) * 100).rounded())
        return pct > 0 ? pct : nil
    }
}

extension Product.SubscriptionPeriod {
    var months: Int {
        switch unit {
        case .month: value
        case .year: value * 12
        default: 0
        }
    }
}
