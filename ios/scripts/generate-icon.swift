#!/usr/bin/env swift
import AppKit
import Foundation

// Self-contained temporary TSL app icon. Replace with approved brand art before App Store release.
let size: CGFloat = 1024
let image = NSImage(size: NSSize(width: size, height: size))
let orange = NSColor(srgbRed: 1, green: 62.0 / 255, blue: 35.0 / 255, alpha: 1)
let black = NSColor(srgbRed: 5.0 / 255, green: 5.0 / 255, blue: 5.0 / 255, alpha: 1)
image.lockFocus()
black.setFill()
NSRect(x: 0, y: 0, width: size, height: size).fill()

func stripe(_ points: [NSPoint]) {
    let path = NSBezierPath()
    path.move(to: points[0])
    for point in points.dropFirst() { path.line(to: point) }
    path.close()
    path.fill()
}

orange.setFill()
stripe([NSPoint(x: 0, y: 950), NSPoint(x: 340, y: 1024), NSPoint(x: 0, y: 770)])
stripe([NSPoint(x: 1024, y: 940), NSPoint(x: 660, y: 1024), NSPoint(x: 1024, y: 750)])
stripe([NSPoint(x: 0, y: 80), NSPoint(x: 340, y: 0), NSPoint(x: 0, y: 260)])
stripe([NSPoint(x: 1024, y: 80), NSPoint(x: 680, y: 0), NSPoint(x: 1024, y: 260)])

let font = NSFont.systemFont(ofSize: 300, weight: .black)
let text = NSAttributedString(string: "TSL", attributes: [
    .font: font,
    .foregroundColor: orange
])
let textSize = text.size()
text.draw(at: NSPoint(x: (size - textSize.width) / 2,
                      y: (size - textSize.height) / 2 + 36))
let subfont = NSFont.systemFont(ofSize: 56, weight: .heavy)
let subtitle = NSAttributedString(string: "TIGER SPORTS LIVE", attributes: [
    .font: subfont,
    .foregroundColor: NSColor.white,
    .kern: 2
])
let subtitleSize = subtitle.size()
subtitle.draw(at: NSPoint(x: (size - subtitleSize.width) / 2, y: 255))
image.unlockFocus()

guard let tiff = image.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiff),
      let png = bitmap.representation(using: .png, properties: [:])
else { fatalError("Could not render app icon") }

let output = URL(fileURLWithPath: "TigerSportsLive/Assets.xcassets/AppIcon.appiconset/AppIcon.png")
try FileManager.default.createDirectory(at: output.deletingLastPathComponent(),
                                        withIntermediateDirectories: true)
try png.write(to: output)
print("Generated 1024×1024 Tiger Sports Live app icon")
