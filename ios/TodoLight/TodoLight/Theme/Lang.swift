import Foundation
import Observation
import SwiftUI

/// 앱 언어 — 웹 `/me`의 「언어」와 같은 세 가지. `profiles.locale`에 저장해 기기를 옮겨도 같다.
///
/// **기기 언어가 아니라 앱 안에서 고른다.** 웹과 같은 계정 설정이라, iOS 설정의 앱별 언어(String Catalog)에
/// 맡기면 웹에서 바꾼 값과 앱의 언어가 따로 논다.
///
/// 문구는 `tr("한국어", "English", "日本語")`로 **호출하는 자리에 세 언어를 나란히** 둔다. 웹이 messages/*.json에
/// 두는 것과 달리 키를 따로 두지 않는 이유: 언어가 셋뿐이고, 키를 거치면 화면 코드에서 실제 문구가
/// 안 보여 해요체·중복 문구를 눈으로 검토하기 어려워진다.
enum AppLang: String, CaseIterable, Sendable {
    case ko, en, ja

    private static let key = "todolight_locale"

    /// 고른 값 → 없으면 기기 언어(한국어·일본어가 아니면 영어 — 웹 `negotiateLocale`과 같다).
    /// 어느 스레드에서 읽어도 된다(UserDefaults).
    static var current: AppLang {
        if let raw = UserDefaults.standard.string(forKey: key), let lang = AppLang(rawValue: raw) { return lang }
        return device
    }

    /// 기기 언어만 보고 고른 값 — 가입할 때 계정에 처음 적는 언어
    static var device: AppLang {
        let first = Locale.preferredLanguages.first ?? "ko"
        if first.hasPrefix("ko") { return .ko }
        if first.hasPrefix("ja") { return .ja }
        return .en
    }

    static func store(_ lang: AppLang) {
        UserDefaults.standard.set(lang.rawValue, forKey: key)
    }

    /// 날짜·요일 표기용
    static var locale: Locale {
        switch current {
        case .ko: Locale(identifier: "ko_KR")
        case .en: Locale(identifier: "en_US")
        case .ja: Locale(identifier: "ja_JP")
        }
    }

    /// 언어 이름은 늘 그 언어로 적는다 — 읽을 수 없는 언어로 적힌 버튼은 찾을 수 없다
    var label: String {
        switch self {
        case .ko: "한국어"
        case .en: "English"
        case .ja: "日本語"
        }
    }
}

/// 지금 고른 언어의 문구 — 세 언어를 모두 받아야 컴파일된다(하나를 빠뜨릴 수 없다)
func tr(_ ko: String, _ en: String, _ ja: String) -> String {
    switch AppLang.current {
    case .ko: ko
    case .en: en
    case .ja: ja
    }
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
