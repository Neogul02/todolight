import SwiftUI
import UIKit

/// 입력칸 밖을 누르면 키보드를 내린다 — 키보드는 적는 동안에만 있어야 한다.
///
/// SwiftUI 탭 제스처를 루트에 걸면 버튼·카드가 받을 탭과 다툰다. 그래서 창(window)에
/// UIKit 인식기를 하나 단다: `cancelsTouchesInView = false`라 원래 탭은 그대로 가고,
/// 입력칸(UITextField·UITextView) 위에서 시작한 탭은 받지 않아 다른 칸으로 옮겨 가는 건 막지 않는다.
/// 스크롤로 내리는 건 각 스크롤 뷰의 `scrollDismissesKeyboard(.interactively)`가 맡는다.
struct KeyboardDismissOnTap: UIViewRepresentable {
    func makeUIView(context: Context) -> InstallerView { InstallerView() }
    func updateUIView(_ uiView: InstallerView, context: Context) {}

    final class InstallerView: UIView, UIGestureRecognizerDelegate {
        private weak var installedOn: UIWindow?
        private lazy var tap: UITapGestureRecognizer = {
            let g = UITapGestureRecognizer(target: self, action: #selector(dismiss))
            g.cancelsTouchesInView = false
            g.delegate = self
            return g
        }()

        override func didMoveToWindow() {
            super.didMoveToWindow()
            guard let window, window !== installedOn else { return }
            installedOn?.removeGestureRecognizer(tap)
            window.addGestureRecognizer(tap)
            installedOn = window
        }

        @objc private func dismiss() {
            window?.endEditing(true)
        }

        func gestureRecognizer(_ g: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
            var v = touch.view
            while let cur = v {
                if cur is UITextField || cur is UITextView { return false }
                v = cur.superview
            }
            // 지금 적고 있는 칸 바로 옆(「할 일 추가 ↑」·메모 보내기)은 그 칸의 일부다 — 거기서 내리면
            // 보내고 나서 다시 포커스를 잡느라 키보드가 내려갔다 올라오며 깜빡인다(연달아 적기가 끊긴다)
            if let window, let editing = Self.firstResponder(in: window) {
                let zone = editing.convert(editing.bounds, to: window).insetBy(dx: -72, dy: -8)
                if zone.contains(touch.location(in: window)) { return false }
            }
            return true
        }

        private static func firstResponder(in view: UIView) -> UIView? {
            if view.isFirstResponder { return view }
            for sub in view.subviews {
                if let found = firstResponder(in: sub) { return found }
            }
            return nil
        }

        // 다른 인식기(스크롤·버튼·끌어 옮기기)와 같이 돈다 — 키보드만 내리고 그들의 일은 막지 않는다
        func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
            true
        }
    }
}
