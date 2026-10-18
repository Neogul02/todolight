import Foundation
import Observation
import SwiftUI

/// 앱 언어 — 웹 `/me`의 「언어」와 같은 두 가지. `profiles.locale`에 저장해 기기를 옮겨도 같다.
///
/// **기기 언어가 아니라 앱 안에서 고른다.** 웹과 같은 계정 설정이라, iOS 설정의 앱별 언어(String Catalog)에
/// 맡기면 웹에서 바꾼 값과 앱의 언어가 따로 논다.
///
/// 문구는 `tr("한국어", "English")`로 **호출하는 자리에 두 언어를 나란히** 둔다. 웹이 messages/*.json에
/// 두는 것과 달리 키를 따로 두지 않는 이유: 언어가 둘뿐이고, 키를 거치면 화면 코드에서 실제 문구가
/// 안 보여 해요체·중복 문구를 눈으로 검토하기 어려워진다.
enum AppLang: String, CaseIterable, Sendable {
    case ko, en

    private static let key = "todolight_locale"

    /// 고른 값 → 없으면 기기 언어(한국어가 아니면 영어). 어느 스레드에서 읽어도 된다(UserDefaults).
    static var current: AppLang {
        if let raw = UserDefaults.standard.string(forKey: key), let lang = AppLang(rawValue: raw) { return lang }
        return (Locale.preferredLanguages.first ?? "ko").hasPrefix("ko") ? .ko : .en
    }

    static func store(_ lang: AppLang) {
        UserDefaults.standard.set(lang.rawValue, forKey: key)
    }

    /// 날짜·요일 표기용
    static var locale: Locale { Locale(identifier: current == .ko ? "ko_KR" : "en_US") }

    var label: String { self == .ko ? "한국어" : "English" }
}

/// 지금 고른 언어의 문구
func tr(_ ko: String, _ en: String) -> String {
    AppLang.current == .en ? en : ko
}

/// 언어 선택을 화면에 알린다 — 바뀌면 루트가 통째로 다시 그려져 모든 `tr`이 새 값으로 읽힌다.
@MainActor
@Observable
final class LangStore {
    var lang: AppLang = AppLang.current {
        didSet { AppLang.store(lang) }
    }
}

/// 영어 복수형 — "1 event" / "2 events". 한국어는 수에 따라 바뀌지 않아 필요 없다.
func plural(_ n: Int, _ word: String) -> String {
    "\(n) \(word)\(n == 1 ? "" : "s")"
}
