import CoreText
import SwiftUI

// MARK: - 테마 고르기

/// 고른 테마(`profiles.theme`)와 기기 설정을 합쳐 실제로 칠할 테마를 정한다 — 웹 `resolveTheme`과 같은 규칙.
/// `system`이거나 모르는 값이면 기기의 다크 모드를 따른다(사라진 테마가 DB에 남아 있어도 화면이 깨지지 않게).
func resolveTheme(_ preference: String?, dark: Bool) -> ResolvedTheme {
    if let preference, let picked = ResolvedTheme(rawValue: preference) { return picked }
    return dark ? .inkDark : .ink
}

/// 테마 선호를 들고 있는다. 첫 화면이 흰색으로 번쩍이지 않게 마지막 값을 기기에 캐시한다
/// (웹이 localStorage `todolight_theme`로 하는 것과 같은 일).
@MainActor
@Observable
final class ThemeStore {
    private static let key = "todolight_theme"
    var preference: String = UserDefaults.standard.string(forKey: ThemeStore.key) ?? "system" {
        didSet { UserDefaults.standard.set(preference, forKey: Self.key) }
    }
}

private struct TokensKey: EnvironmentKey {
    static let defaultValue = ResolvedTheme.ink.tokens
}

extension EnvironmentValues {
    /// 화면 코드는 시스템 색(`.secondary`, `secondarySystemBackground`) 대신 **이 토큰만** 쓴다.
    var tokens: ThemeTokens {
        get { self[TokensKey.self] }
        set { self[TokensKey.self] = newValue }
    }
}

/// 루트에 한 번 — 고른 테마를 토큰으로 풀어 환경에 넣고, 시스템 컨트롤 색 체계도 맞춘다.
struct ThemedRoot<Content: View>: View {
    @Environment(ThemeStore.self) private var theme
    @Environment(LangStore.self) private var lang
    @Environment(\.colorScheme) private var scheme
    @ViewBuilder let content: Content

    var body: some View {
        let resolved = resolveTheme(theme.preference, dark: scheme == .dark)
        let tokens = resolved.tokens
        content
            // 언어가 바뀌면 트리를 새로 만든다 — 모든 `tr`이 그 자리에서 다시 읽힌다.
            // 보던 화면은 BoardRootView가 SceneStorage로 되살린다.
            .id(lang.lang)
            .environment(\.locale, AppLang.locale)
            .environment(\.tokens, tokens)
            .tint(tokens.accent)
            .foregroundStyle(tokens.ink)
            // 시트·키보드·상태 바가 테마의 명암을 따라가게 — 다크 팔레트인데 키보드만 흰색이면 튄다
            .preferredColorScheme(theme.preference == "system" ? nil : (tokens.isDark ? .dark : .light))
    }
}

// MARK: - 글꼴 (웹과 같은 Pretendard)

enum AppFont {
    /// 번들의 OTF를 등록한다. Info.plist(UIAppFonts) 대신 코드로 — 생성된 plist를 손대지 않으려고.
    static func register() {
        for name in ["Pretendard-Regular", "Pretendard-Medium", "Pretendard-SemiBold", "Pretendard-Bold"] {
            guard let url = Bundle.main.url(forResource: name, withExtension: "otf") else { continue }
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
    }
}

extension Font {
    /// 웹의 `font-size`·`font-weight`를 그대로 받는다. 다이내믹 타입을 따라 커진다(relativeTo).
    static func tl(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        let name = switch weight {
        case .medium: "Pretendard-Medium"
        case .semibold: "Pretendard-SemiBold"
        case .bold, .heavy, .black: "Pretendard-Bold"
        default: "Pretendard-Regular"
        }
        return .custom(name, size: size, relativeTo: size >= 17 ? .body : .footnote)
    }

    // 웹 globals.css의 글자 스케일
    static let tlTitle = tl(18, .semibold)
    static let tlBodySm = tl(15)
    static let tlCaption = tl(13)
    static let tlBadge = tl(11, .semibold)
}

// MARK: - 모션 (framer-motion 값 그대로)

enum Motion {
    /// 카드 등장·퇴장·펼침 — 웹 `transition={{ duration: 0.16 }}`
    static let quick = Animation.easeOut(duration: 0.16)
    /// 탭바 활성 판 — 웹 `{ type: 'spring', stiffness: 420, damping: 34 }`
    static let tabSpring = Animation.interpolatingSpring(stiffness: 420, damping: 34)

    /// 모션 줄이기가 켜져 있으면 애니메이션 없이 바로 바꾼다(웹 `useReducedMotion`).
    @MainActor
    static func run(_ animation: Animation, reduce: Bool, _ body: () -> Void) {
        if reduce { body() } else { withAnimation(animation, body) }
    }
}

extension AnyTransition {
    /// 카드 — 들어올 땐 위에서 6pt 내려오며 나타나고, 나갈 땐 0.97로 줄며 사라진다
    static var card: AnyTransition {
        .asymmetric(
            insertion: .opacity.combined(with: .offset(y: -6)),
            removal: .opacity.combined(with: .scale(scale: 0.97))
        )
    }
}
