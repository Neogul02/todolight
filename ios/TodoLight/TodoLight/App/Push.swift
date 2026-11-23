import Observation
import TodoLightKit
import UIKit
import UserNotifications

/// 앱 푸시 — 권한 받기 · 기기 토큰을 서버에 등록 · 알림을 눌렀을 때 어디로 갈지.
/// 보내는 쪽은 서버(`lib/push.ts`)다. 알림 종류와 문구도 서버가 정한다.
@MainActor
@Observable
final class Push: NSObject {
    static let shared = Push()

    /// 알림을 눌러 앱이 열렸을 때 갈 곳 — 보드가 나타나면 한 번 꺼내 쓴다(`QuickAdd`와 같은 방식)
    struct Route: Equatable { let orgId: String?; let kind: String; let eventId: String? }
    private(set) var pending: Route?

    @ObservationIgnored private var token: String?

    func consume() -> Route? {
        defer { pending = nil }
        return pending
    }

    /// 로그인한 뒤 부른다. 처음이면 권한을 묻고, 이미 허락했으면 조용히 토큰만 다시 받는다
    func start() {
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        Task {
            let granted = (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
            if granted { UIApplication.shared.registerForRemoteNotifications() }
        }
    }

    func didRegister(_ deviceToken: Data) {
        let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
        token = hex
        Task { try? await Backend.shared.api.registerPushDevice(token: hex) }
    }

    /// 로그아웃 직전 — 다음 사람이 이 폰으로 내 알림을 받지 않게
    func unregister() async {
        guard let token else { return }
        try? await Backend.shared.api.unregisterPushDevice(token: token)
    }
}

extension Push: UNUserNotificationCenterDelegate {
    /// 앱을 보고 있는 중에도 배너로 띄운다 — 다른 조직·다른 패널 소식일 수 있다
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter, willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .list]
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse
    ) async {
        let info = response.notification.request.content.userInfo
        let route = Route(
            orgId: info["orgId"] as? String,
            kind: info["kind"] as? String ?? "",
            eventId: info["eventId"] as? String
        )
        await MainActor.run { Push.shared.pending = route }
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        MainActor.assumeIsolated { Push.shared.didRegister(deviceToken) }
    }
}
