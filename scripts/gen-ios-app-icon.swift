// iOS 앱 아이콘 1024×1024 — 웹 lib/app-icon.tsx의 AppIconMark와 같은 그림(흰 배경 + 체크 하나).
//   swift scripts/gen-ios-app-icon.swift ios/TodoLight/TodoLight/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png
// App Store는 알파 채널이 있는 아이콘을 거부한다 — 불투명 RGB로 그린다.
import AppKit
import CoreGraphics

let out = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "AppIcon-1024.png"
let size = 1024
let markRatio = 0.56            // 웹 AppIconMark 기본값
let ink = CGColor(srgbRed: 0x14 / 255.0, green: 0x12 / 255.0, blue: 0x0f / 255.0, alpha: 1)

let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
                    space: CGColorSpace(name: CGColorSpace.sRGB)!,
                    bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
ctx.setFillColor(CGColor(srgbRed: 1, green: 1, blue: 1, alpha: 1))
ctx.fill(CGRect(x: 0, y: 0, width: size, height: size))

// SVG viewBox 0 0 100 100, path "M19 53 L40 75 L83 25", stroke 13 — 마크 상자를 가운데에 둔다
let mark = Double(size) * markRatio
let origin = (Double(size) - mark) / 2
let s = mark / 100
func p(_ x: Double, _ y: Double) -> CGPoint {
    // CoreGraphics는 y가 위로 증가 — SVG 좌표를 뒤집는다
    CGPoint(x: origin + x * s, y: Double(size) - (origin + y * s))
}
ctx.setStrokeColor(ink)
ctx.setLineWidth(13 * s)
ctx.setLineCap(.round)
ctx.setLineJoin(.round)
ctx.move(to: p(19, 53))
ctx.addLine(to: p(40, 75))
ctx.addLine(to: p(83, 25))
ctx.strokePath()

let rep = NSBitmapImageRep(cgImage: ctx.makeImage()!)
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out))
print("wrote \(out)")
