import SwiftUI

/// 꾹 눌러 끄는 순서 바꾸기의 상태 — 할 일 카드(세로)와 멤버 칩(가로)이 같이 쓴다(웹 Reorder.Group 자리).
/// 끄는 동안은 손끝 순서(`order`)가 화면의 진실이고, 놓았을 때 바뀐 순서만 한 번 내보낸다.
struct ReorderState {
    let axis: Axis
    /// 끌고 있는 것
    private(set) var dragging: String?
    /// 끄는 동안의 손끝 순서 — 서버 값으로 매번 다시 정렬하면 끄는 것이 튄다
    var order: [String]?
    /// 각 항목의 자리 — 손끝이 어느 항목 위를 지나는지 가린다
    var frames: [String: CGRect] = [:]
    /// 끄는 것이 자기 자리에서 손끝까지 떨어진 만큼(자리가 바뀌면 새 자리 기준으로 다시 잰다)
    private(set) var offset: CGFloat = 0
    /// 막 놓은 것 — 손을 뗀 그 순간의 탭이 안쪽 버튼으로 가지 않게 잠깐 더 잠가 둔다
    private(set) var settling: String?
    private var startOrder: [String]?
    /// 꾹 누른 순간 손끝과 가운데의 차이 — 손끝으로 튀지 않게
    private var grab: CGFloat?

    init(axis: Axis) { self.axis = axis }

    /// 끄는 동안은 손끝 순서로, 아니면 받은 순서 그대로
    func arrange<T>(_ items: [T], id: (T) -> String) -> [T] {
        guard let order else { return items }
        let byId = Dictionary(items.map { (id($0), $0) }, uniquingKeysWith: { first, _ in first })
        return order.compactMap { byId[$0] }
    }

    func offset(of id: String) -> CGFloat { dragging == id ? offset : 0 }
    func isLocked(_ id: String) -> Bool { dragging == id || settling == id }

    mutating func start(_ id: String, order: [String]) {
        dragging = id
        self.order = order
        startOrder = order
        grab = nil
        offset = 0
    }

    /// 끄는 것의 앞쪽 끝이 바로 옆 항목의 가운데를 넘으면 그 자리와 바꾼 순서를 돌려준다(한 번에 한 칸).
    /// 가운데끼리 비교하면 거의 한 칸을 통째로 밀어야 바뀐다 — 웹(framer Reorder)도 앞쪽 끝으로 잰다.
    /// `canSwap`이 막는 이웃은 넘지 않는다 — 마감일 그룹 경계, 늘 맨 앞인 내 칩.
    mutating func move(to point: CGFloat, canSwap: (String) -> Bool) -> [String]? {
        guard let id = dragging, let mine = frames[id] else { return nil }
        if grab == nil { grab = point - mid(mine) }
        let center = point - (grab ?? 0)
        offset = center - mid(mine)
        guard var ids = order, let from = ids.firstIndex(of: id) else { return nil }
        for step in [-1, 1] {
            let j = from + step
            guard ids.indices.contains(j), canSwap(ids[j]), let f = frames[ids[j]] else { continue }
            if (step < 0 && lower(mine) + offset < mid(f)) || (step > 0 && upper(mine) + offset > mid(f)) {
                ids.swapAt(from, j)
                return ids
            }
        }
        return nil
    }

    /// 놓기 — 순서가 바뀌었으면 (끈 것, 새 순서), 그대로면 nil(보낼 것이 없다)
    mutating func end() -> (id: String, order: [String])? {
        defer {
            settling = dragging
            dragging = nil
            order = nil
            startOrder = nil
            offset = 0
        }
        guard let id = dragging, let order, order != startOrder else { return nil }
        return (id, order)
    }

    mutating func settled() { settling = nil }

    private func mid(_ r: CGRect) -> CGFloat { axis == .vertical ? r.midY : r.midX }
    private func lower(_ r: CGRect) -> CGFloat { axis == .vertical ? r.minY : r.minX }
    private func upper(_ r: CGRect) -> CGFloat { axis == .vertical ? r.maxY : r.maxX }
}

/// 꾹 누르면(0.45초) 그 자리에서 끌 수 있다 — 웹의 롱프레스 손잡이와 같다.
///
/// **SwiftUI 제스처(LongPress → Drag)로 만들지 않는다.** 스크롤 안의 항목에 DragGesture를 붙이면
/// 바깥 ScrollView가 세로로도 가로로도 스크롤하지 않는다(실제로 컬럼이 통째로 굳었다).
/// UIKit의 UILongPressGestureRecognizer는 꾹 누르기 전에 움직이면 스스로 실패해 스크롤에 넘기고,
/// 인식된 뒤에는 손을 뗄 때까지 위치를 계속 주며, 시스템이 끊으면 `.cancelled`가 와서 정리도 확실하다.
/// 그걸 SwiftUI에 붙이는 수단이 iOS 18부터라, 17에서는 순서 바꾸기만 빠진다(스크롤은 산다).
struct ReorderHandle: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduce
    let id: String
    let enabled: Bool
    /// 프레임을 재는 좌표계 — 스크롤과 무관한 콘텐츠 좌표여야 한다
    let space: String
    @Binding var state: ReorderState
    /// 끌기 시작할 때의 순서
    let order: () -> [String]
    let canSwap: (String) -> Bool
    /// 놓았을 때 바뀐 순서
    let onCommit: (String, [String]) -> Void

    func body(content: Content) -> some View {
        if #available(iOS 18.0, *) {
            let active = state.dragging == id
            let shift = state.offset(of: id)
            content
                // 인식기가 손 뗌을 안쪽 버튼에 안 넘기지만(cancelsTouchesInView), 놓은 직후의 탭까지 막는다
                .disabled(state.isLocked(id))
                .offset(x: state.axis == .horizontal ? shift : 0, y: state.axis == .vertical ? shift : 0)
                .scaleEffect(active ? 1.03 : 1)
                .shadow(color: .black.opacity(active ? 0.12 : 0), radius: 12, y: 6)
                .zIndex(active ? 10 : 0)
                .onGeometryChange(for: CGRect.self) { $0.frame(in: .named(space)) } action: { state.frames[id] = $0 }
                .gesture(LongPressDrag(space: space, enabled: enabled, onBegan: begin, onMoved: move,
                                       onEnded: { finish(commit: true) }, onCancelled: { finish(commit: false) }))
                // 끄는 사이 카드가 사라지면(실시간으로 넘김·지움) 인식기 끝 신호가 안 올 수 있다 —
                // 그때는 저장하지 않는다(옛 컬럼의 이웃으로 계산한 자리를 남의 컬럼에 쓰게 된다)
                .onDisappear { finish(commit: false) }
                .sensoryFeedback(.impact(weight: .medium), trigger: active) { _, now in now }
        } else {
            content
        }
    }

    private func begin() {
        state.start(id, order: order())
    }

    private func move(_ point: CGPoint) {
        guard state.dragging == id else { return }
        let p = state.axis == .vertical ? point.y : point.x
        if let next = state.move(to: p, canSwap: canSwap) {
            Motion.run(Motion.quick, reduce: reduce) { state.order = next }
        }
    }

    /// 놓기(commit) · 취소(원래 자리로) — 끄는 중일 때만 한 번 돈다
    private func finish(commit: Bool) {
        guard state.dragging == id else { return }
        var result: (id: String, order: [String])?
        Motion.run(Motion.quick, reduce: reduce) { result = state.end() }
        if commit, let result { onCommit(result.id, result.order) }
        Task {
            try? await Task.sleep(for: .milliseconds(250))
            state.settled()
        }
    }
}

@available(iOS 18.0, *)
private struct LongPressDrag: UIGestureRecognizerRepresentable {
    let space: String
    let enabled: Bool
    let onBegan: () -> Void
    let onMoved: (CGPoint) -> Void
    let onEnded: () -> Void
    /// 시스템이 끊음(전화, 제어센터) — 사람이 놓은 게 아니니 저장하지 않는다
    let onCancelled: () -> Void

    func makeUIGestureRecognizer(context: Context) -> UILongPressGestureRecognizer {
        let g = UILongPressGestureRecognizer()
        g.minimumPressDuration = 0.45
        g.delegate = context.coordinator
        return g
    }

    func makeCoordinator(converter: CoordinateSpaceConverter) -> Coordinator { Coordinator() }

    /// 카드 안 버튼의 인식기와 같이 돈다 — 안 그러면 버튼이 손가락을 먼저 가져가 꾹 누르기가 영영 안 잡힌다
    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
            !(other is UIPanGestureRecognizer)
        }
    }

    func updateUIGestureRecognizer(_ g: UILongPressGestureRecognizer, context: Context) {
        g.isEnabled = enabled
    }

    func handleUIGestureRecognizerAction(_ g: UILongPressGestureRecognizer, context: Context) {
        let point = context.converter.location(in: .named(space))
        switch g.state {
        case .began:
            onBegan()
            onMoved(point)
        case .changed:
            onMoved(point)
        case .ended:
            onEnded()
        case .cancelled, .failed:
            onCancelled()
        default:
            break
        }
    }
}
