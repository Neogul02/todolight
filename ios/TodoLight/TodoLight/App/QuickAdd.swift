import Observation

/// 잠금화면 "할 일 추가" 버튼(`todolight://add`)이 앱을 열었다는 신호 — 보드는 내 컬럼으로 가고,
/// 내 컬럼은 추가 칸에 커서를 둔다. 앱이 꺼져 있다가 이 주소로 켜지면 보드가 뜨기 전에 오므로
/// 받는 쪽이 나타날 때 한 번 더 확인하고 소비한다.
@MainActor
@Observable
final class QuickAdd {
    static let shared = QuickAdd()
    private(set) var pending = false

    func request() { pending = true }

    /// 받았으면 true를 주고 비운다 — 두 번 열리지 않게
    func consume() -> Bool {
        guard pending else { return false }
        pending = false
        return true
    }
}
