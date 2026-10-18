// 생성된 파일 — 직접 고치지 말 것. node scripts/gen-ios-theme.mjs
// 원본: app/globals.css (테마 토큰), lib/avatar.ts (아바타 팔레트)
import SwiftUI

struct ThemeTokens: Sendable {
    let canvas: Color
    let canvasSoft: Color
    let surface: Color
    let surfaceAlt: Color
    let ink: Color
    let inkSecondary: Color
    let inkMuted: Color
    let inkFaint: Color
    let inkInvert: Color
    let hairline: Color
    let hairlineStrong: Color
    let accent: Color
    let accentSoft: Color
    let accentInk: Color
    let success: Color
    let successSoft: Color
    let warning: Color
    let warningSoft: Color
    let danger: Color
    let dangerSoft: Color
    let dangerInk: Color
    let glassBg: Color
    let glassBgStrong: Color
    let glassBorder: Color
    let glassSheen: Color
    let glassCardBg: Color
    let glassCardBgAlt: Color
    let canvasTintA: Color
    let canvasTintB: Color
    let isDark: Bool
}

enum ResolvedTheme: String, CaseIterable, Sendable {
    case ink = "ink"
    case inkDark = "ink-dark"

    var tokens: ThemeTokens {
        switch self {
        case .ink:
            return ThemeTokens(
                canvas: Color(.sRGB, red: 1.0000, green: 1.0000, blue: 1.0000, opacity: 1),
                canvasSoft: Color(.sRGB, red: 0.9569, green: 0.9490, blue: 0.9333, opacity: 1),
                surface: Color(.sRGB, red: 1.0000, green: 1.0000, blue: 1.0000, opacity: 1),
                surfaceAlt: Color(.sRGB, red: 0.9804, green: 0.9725, blue: 0.9569, opacity: 1),
                ink: Color(.sRGB, red: 0.0784, green: 0.0706, blue: 0.0588, opacity: 1),
                inkSecondary: Color(.sRGB, red: 0.2078, green: 0.1922, blue: 0.1686, opacity: 1),
                inkMuted: Color(.sRGB, red: 0.4196, green: 0.3961, blue: 0.3569, opacity: 1),
                inkFaint: Color(.sRGB, red: 0.6431, green: 0.6118, blue: 0.5608, opacity: 1),
                inkInvert: Color(.sRGB, red: 1.0000, green: 1.0000, blue: 1.0000, opacity: 1),
                hairline: Color(.sRGB, red: 0.9098, green: 0.8941, blue: 0.8627, opacity: 1),
                hairlineStrong: Color(.sRGB, red: 0.8275, green: 0.8000, blue: 0.7490, opacity: 1),
                accent: Color(.sRGB, red: 0.0784, green: 0.0706, blue: 0.0588, opacity: 1),
                accentSoft: Color(.sRGB, red: 0.9373, green: 0.9255, blue: 0.8980, opacity: 1),
                accentInk: Color(.sRGB, red: 1.0000, green: 1.0000, blue: 1.0000, opacity: 1),
                success: Color(.sRGB, red: 0.1843, green: 0.4784, blue: 0.3255, opacity: 1),
                successSoft: Color(.sRGB, red: 0.8941, green: 0.9451, blue: 0.9137, opacity: 1),
                warning: Color(.sRGB, red: 0.6588, green: 0.4471, blue: 0.0588, opacity: 1),
                warningSoft: Color(.sRGB, red: 0.9725, green: 0.9333, blue: 0.8549, opacity: 1),
                danger: Color(.sRGB, red: 0.6902, green: 0.2275, blue: 0.2039, opacity: 1),
                dangerSoft: Color(.sRGB, red: 0.9686, green: 0.9020, blue: 0.8941, opacity: 1),
                dangerInk: Color(.sRGB, red: 1.0000, green: 1.0000, blue: 1.0000, opacity: 1),
                glassBg: Color(.sRGB, red: 1.0000, green: 1.0000, blue: 1.0000, opacity: 0.52),
                glassBgStrong: Color(.sRGB, red: 1.0000, green: 1.0000, blue: 1.0000, opacity: 0.86),
                glassBorder: Color(.sRGB, red: 0.0784, green: 0.0706, blue: 0.0588, opacity: 0.08),
                glassSheen: Color(.sRGB, red: 1.0000, green: 1.0000, blue: 1.0000, opacity: 0.9),
                glassCardBg: Color(.sRGB, red: 1.0000, green: 1.0000, blue: 1.0000, opacity: 0.78),
                glassCardBgAlt: Color(.sRGB, red: 0.9804, green: 0.9725, blue: 0.9569, opacity: 0.76),
                canvasTintA: Color(.sRGB, red: 0.8078, green: 0.7686, blue: 0.6980, opacity: 0.27),
                canvasTintB: Color(.sRGB, red: 0.7765, green: 0.8078, blue: 0.8549, opacity: 0.21),
                isDark: false
            )
        case .inkDark:
            return ThemeTokens(
                canvas: Color(.sRGB, red: 0.0706, green: 0.0706, blue: 0.0706, opacity: 1),
                canvasSoft: Color(.sRGB, red: 0.1020, green: 0.1020, blue: 0.1020, opacity: 1),
                surface: Color(.sRGB, red: 0.1176, green: 0.1176, blue: 0.1176, opacity: 1),
                surfaceAlt: Color(.sRGB, red: 0.1412, green: 0.1412, blue: 0.1412, opacity: 1),
                ink: Color(.sRGB, red: 0.9608, green: 0.9490, blue: 0.9255, opacity: 1),
                inkSecondary: Color(.sRGB, red: 0.8667, green: 0.8471, blue: 0.8078, opacity: 1),
                inkMuted: Color(.sRGB, red: 0.6275, green: 0.6039, blue: 0.5647, opacity: 1),
                inkFaint: Color(.sRGB, red: 0.4275, green: 0.4078, blue: 0.3843, opacity: 1),
                inkInvert: Color(.sRGB, red: 0.0627, green: 0.0627, blue: 0.0627, opacity: 1),
                hairline: Color(.sRGB, red: 0.1765, green: 0.1725, blue: 0.1647, opacity: 1),
                hairlineStrong: Color(.sRGB, red: 0.2627, green: 0.2549, blue: 0.2431, opacity: 1),
                accent: Color(.sRGB, red: 0.9608, green: 0.9490, blue: 0.9255, opacity: 1),
                accentSoft: Color(.sRGB, red: 0.1765, green: 0.1725, blue: 0.1647, opacity: 1),
                accentInk: Color(.sRGB, red: 0.0627, green: 0.0627, blue: 0.0627, opacity: 1),
                success: Color(.sRGB, red: 0.5255, green: 0.8118, blue: 0.6353, opacity: 1),
                successSoft: Color(.sRGB, red: 0.1020, green: 0.1961, blue: 0.1490, opacity: 1),
                warning: Color(.sRGB, red: 0.8863, green: 0.7294, blue: 0.4157, opacity: 1),
                warningSoft: Color(.sRGB, red: 0.2000, green: 0.1569, blue: 0.0588, opacity: 1),
                danger: Color(.sRGB, red: 0.9373, green: 0.5451, blue: 0.5137, opacity: 1),
                dangerSoft: Color(.sRGB, red: 0.2275, green: 0.1216, blue: 0.1137, opacity: 1),
                dangerInk: Color(.sRGB, red: 0.1647, green: 0.0627, blue: 0.0549, opacity: 1),
                glassBg: Color(.sRGB, red: 0.1255, green: 0.1255, blue: 0.1255, opacity: 0.58),
                glassBgStrong: Color(.sRGB, red: 0.1020, green: 0.1020, blue: 0.1020, opacity: 0.88),
                glassBorder: Color(.sRGB, red: 1.0000, green: 1.0000, blue: 1.0000, opacity: 0.1),
                glassSheen: Color(.sRGB, red: 1.0000, green: 1.0000, blue: 1.0000, opacity: 0.12),
                glassCardBg: Color(.sRGB, red: 0.1176, green: 0.1176, blue: 0.1176, opacity: 0.78),
                glassCardBgAlt: Color(.sRGB, red: 0.1412, green: 0.1412, blue: 0.1412, opacity: 0.76),
                canvasTintA: Color(.sRGB, red: 0.3373, green: 0.3059, blue: 0.2588, opacity: 0.14),
                canvasTintB: Color(.sRGB, red: 0.2118, green: 0.2353, blue: 0.2902, opacity: 0.12),
                isDark: true
            )
        }
    }
}

/// 아바타 팔레트 — 사진이 없을 때 첫 글자 뒤 원 색. 웹 getAvatarColor와 같은 순서·해시를 쓴다.
enum AvatarPalette {
    static let colors: [(key: String, bg: Color, ink: Color)] = [
        ("stone", Color(.sRGB, red: 0.8118, green: 0.7804, blue: 0.7137, opacity: 1), Color(.sRGB, red: 0.1686, green: 0.1569, blue: 0.1373, opacity: 1)),
        ("clay", Color(.sRGB, red: 0.8627, green: 0.7137, blue: 0.6118, opacity: 1), Color(.sRGB, red: 0.2510, green: 0.1608, blue: 0.1059, opacity: 1)),
        ("coral", Color(.sRGB, red: 0.9098, green: 0.6902, blue: 0.6039, opacity: 1), Color(.sRGB, red: 0.2745, green: 0.1451, blue: 0.1020, opacity: 1)),
        ("rose", Color(.sRGB, red: 0.8784, green: 0.6980, blue: 0.7137, opacity: 1), Color(.sRGB, red: 0.2706, green: 0.1373, blue: 0.1529, opacity: 1)),
        ("plum", Color(.sRGB, red: 0.7961, green: 0.7216, blue: 0.8588, opacity: 1), Color(.sRGB, red: 0.1843, green: 0.1373, blue: 0.2510, opacity: 1)),
        ("lavender", Color(.sRGB, red: 0.7412, green: 0.7490, blue: 0.8784, opacity: 1), Color(.sRGB, red: 0.1490, green: 0.1490, blue: 0.2902, opacity: 1)),
        ("sky", Color(.sRGB, red: 0.6980, green: 0.7647, blue: 0.8667, opacity: 1), Color(.sRGB, red: 0.1176, green: 0.1686, blue: 0.2510, opacity: 1)),
        ("sea", Color(.sRGB, red: 0.6510, green: 0.7843, blue: 0.7725, opacity: 1), Color(.sRGB, red: 0.0902, green: 0.2000, blue: 0.1843, opacity: 1)),
        ("mint", Color(.sRGB, red: 0.6627, green: 0.8275, blue: 0.7216, opacity: 1), Color(.sRGB, red: 0.0902, green: 0.2078, blue: 0.1216, opacity: 1)),
        ("olive", Color(.sRGB, red: 0.7608, green: 0.8078, blue: 0.6431, opacity: 1), Color(.sRGB, red: 0.1725, green: 0.2039, blue: 0.0980, opacity: 1)),
        ("amber", Color(.sRGB, red: 0.8902, green: 0.7843, blue: 0.5529, opacity: 1), Color(.sRGB, red: 0.2471, green: 0.1922, blue: 0.0824, opacity: 1)),
        ("sand", Color(.sRGB, red: 0.8706, green: 0.8275, blue: 0.7412, opacity: 1), Color(.sRGB, red: 0.2275, green: 0.1922, blue: 0.1412, opacity: 1))
    ]
}
