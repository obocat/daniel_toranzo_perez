#!/usr/bin/env swift

import AppKit
import Foundation

// A small, dependency-free mockup generator for macOS.
//
// Usage:
//   swift script/mockup-device.swift --input snapshots --output tmp/article-images
//   swift script/mockup-device.swift --input shot.png --output tmp/article-images
//
// The generated PNGs are not uploaded anywhere. Upload them manually to
// image2url.com (or any host) and paste the resulting URLs into the article.

struct Options {
    var input: URL
    var output: URL
    var width: CGFloat = 1400
    var background: String = "F5F5F7"
    var frame: URL?
    var screen: CGRect?
}

enum ScriptError: Error, CustomStringConvertible {
    case usage(String)
    case unreadableImage(URL)
    case invalidScreen(String)
    case renderFailed(URL)

    var description: String {
        switch self {
        case .usage(let message):
            return message
        case .unreadableImage(let url):
            return "No se pudo leer la imagen: \(url.path)"
        case .invalidScreen(let value):
            return "Valor inválido para --screen: \(value). Usa x,y,ancho,alto."
        case .renderFailed(let url):
            return "No se pudo generar la imagen: \(url.path)"
        }
    }
}

func printUsage() {
    print("""
    Uso:
      swift script/mockup-device.swift --input <archivo-o-carpeta> [opciones]

    Opciones:
      --input <ruta>        Captura o carpeta de capturas (PNG, JPG, HEIC).
      --output <ruta>       Carpeta de salida. Por defecto: tmp/article-images
      --width <píxeles>     Ancho del lienzo. Por defecto: 1400
      --background <hex>    Color de fondo, por ejemplo F5F5F7. Usa "transparent" para fondo transparente.
      --frame <ruta>        Marco PNG de Apple (Product Bezels). La pantalla debe ser transparente o blanca.
      --screen x,y,w,h      Zona de pantalla dentro del marco. Si se omite, se detecta automáticamente.
      --help                Muestra esta ayuda.

    Ejemplos:
      swift script/mockup-device.swift --input capturas --output tmp/attributedstring
      swift script/mockup-device.swift --input captura.png --frame iphone-15-pro.png --output tmp/attributedstring
      swift script/mockup-device.swift --input captura.png --frame iphone.png --screen 120,240,900,1950
    """)
}

func parseOptions() throws -> Options {
    let args = Array(CommandLine.arguments.dropFirst())
    if args.contains("--help") || args.contains("-h") {
        printUsage()
        exit(0)
    }

    var input: URL?
    var output = URL(fileURLWithPath: "tmp/article-images")
    var width: CGFloat = 1400
    var background = "F5F5F7"
    var frame: URL?
    var screen: CGRect?

    var index = 0
    while index < args.count {
        let key = args[index]
        func value() throws -> String {
            guard index + 1 < args.count else {
                throw ScriptError.usage("Falta el valor de \(key).")
            }
            index += 1
            return args[index]
        }

        switch key {
        case "--input":
            input = URL(fileURLWithPath: try value())
        case "--output":
            output = URL(fileURLWithPath: try value())
        case "--width":
            let raw = try value()
            guard let parsed = Double(raw), parsed > 400 else {
                throw ScriptError.usage("--width debe ser mayor que 400.")
            }
            width = CGFloat(parsed)
        case "--background":
            background = try value()
        case "--frame":
            frame = URL(fileURLWithPath: try value())
        case "--screen":
            let raw = try value()
            let parts = raw.split(separator: ",").compactMap { Double($0.trimmingCharacters(in: .whitespaces)) }
            guard parts.count == 4 else {
                throw ScriptError.invalidScreen(raw)
            }
            screen = CGRect(x: parts[0], y: parts[1], width: parts[2], height: parts[3])
        default:
            throw ScriptError.usage("Opción desconocida: \(key)")
        }
        index += 1
    }

    guard let input else {
        throw ScriptError.usage("Falta --input. Usa --help para ver los ejemplos.")
    }

    return Options(input: input, output: output, width: width, background: background, frame: frame, screen: screen)
}

extension NSColor {
    convenience init?(hex: String) {
        var value = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if value.hasPrefix("#") { value.removeFirst() }
        guard value.count == 6, let number = Int(value, radix: 16) else { return nil }
        self.init(
            calibratedRed: CGFloat((number >> 16) & 0xFF) / 255,
            green: CGFloat((number >> 8) & 0xFF) / 255,
            blue: CGFloat(number & 0xFF) / 255,
            alpha: 1
        )
    }
}

func imageFiles(in url: URL) throws -> [URL] {
    let fileManager = FileManager.default
    var isDirectory: ObjCBool = false
    guard fileManager.fileExists(atPath: url.path, isDirectory: &isDirectory) else {
        throw ScriptError.usage("No existe la ruta de entrada: \(url.path)")
    }

    if !isDirectory.boolValue {
        return [url]
    }

    let keys: [URLResourceKey] = [.isRegularFileKey]
    let contents = try fileManager.contentsOfDirectory(
        at: url,
        includingPropertiesForKeys: keys,
        options: [.skipsHiddenFiles]
    )
    return contents
        .filter { ["png", "jpg", "jpeg", "heic"].contains($0.pathExtension.lowercased()) }
        .sorted { $0.lastPathComponent < $1.lastPathComponent }
}

func loadImage(_ url: URL) throws -> NSImage {
    guard let image = NSImage(contentsOf: url), image.isValid else {
        throw ScriptError.unreadableImage(url)
    }
    return image
}

func pixelSize(of image: NSImage) -> CGSize {
    guard let rep = image.representations.max(by: { $0.pixelsWide * $0.pixelsHigh < $1.pixelsWide * $1.pixelsHigh }) else {
        return image.size
    }
    return CGSize(width: rep.pixelsWide, height: rep.pixelsHigh)
}

func drawImage(_ image: NSImage, in rect: CGRect) {
    guard let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil),
          let context = NSGraphicsContext.current?.cgContext else { return }

    context.saveGState()
    context.interpolationQuality = .high
    context.translateBy(x: rect.minX, y: rect.maxY)
    context.scaleBy(x: 1, y: -1)
    context.draw(cgImage, in: CGRect(origin: .zero, size: rect.size))
    context.restoreGState()
}

func drawAspectFill(_ image: NSImage, in rect: CGRect) {
    let source = pixelSize(of: image)
    guard source.width > 0, source.height > 0 else { return }

    let scale = max(rect.width / source.width, rect.height / source.height)
    let drawn = CGSize(width: source.width * scale, height: source.height * scale)
    let target = CGRect(
        x: rect.midX - drawn.width / 2,
        y: rect.midY - drawn.height / 2,
        width: drawn.width,
        height: drawn.height
    )
    drawImage(image, in: target)
}

func bitmapRepresentation(of image: NSImage) -> NSBitmapImageRep? {
    if let rep = image.representations
        .compactMap({ $0 as? NSBitmapImageRep })
        .max(by: { $0.pixelsWide * $0.pixelsHigh < $1.pixelsWide * $1.pixelsHigh }) {
        return rep
    }
    guard let data = image.tiffRepresentation else { return nil }
    return NSBitmapImageRep(data: data)
}

func detectScreen(in frame: NSImage) throws -> CGRect {
    guard let rep = bitmapRepresentation(of: frame) else {
        throw ScriptError.usage("No se pudo leer el marco para detectar la pantalla.")
    }

    let width = rep.pixelsWide
    let height = rep.pixelsHigh
    guard width > 200, height > 200 else {
        throw ScriptError.usage("El marco es demasiado pequeño para detectar la pantalla.")
    }

    func isScreenPixel(_ x: Int, _ y: Int) -> Bool {
        guard let color = rep.colorAt(x: x, y: y) else { return false }
        if color.alphaComponent < 0.1 {
            return true
        }
        return color.alphaComponent > 0.5
            && color.redComponent > 0.97
            && color.greenComponent > 0.97
            && color.blueComponent > 0.97
    }

    let midX = width / 2
    let midY = height / 2
    guard isScreenPixel(midX, midY) else {
        throw ScriptError.usage(
            "No se pudo detectar la pantalla. Usa --screen x,y,w,h o un PNG de Apple con la pantalla transparente."
        )
    }

    var left = midX
    while left > 0 && isScreenPixel(left - 1, midY) {
        left -= 1
    }
    var right = midX
    while right < width - 1 && isScreenPixel(right + 1, midY) {
        right += 1
    }

    let column = width / 4
    guard isScreenPixel(column, midY) else {
        throw ScriptError.usage("No se pudo detectar la altura de la pantalla. Usa --screen x,y,w,h.")
    }
    var top = midY
    while top > 0 && isScreenPixel(column, top - 1) {
        top -= 1
    }
    var bottom = midY
    while bottom < height - 1 && isScreenPixel(column, bottom + 1) {
        bottom += 1
    }

    let screen = CGRect(
        x: left,
        y: top,
        width: right - left + 1,
        height: bottom - top + 1
    )
    guard screen.width > 100, screen.height > 100 else {
        throw ScriptError.usage("La pantalla detectada es demasiado pequeña. Usa --screen x,y,w,h.")
    }
    return screen
}

func screenIsTransparent(_ frame: NSImage, screen: CGRect) -> Bool {
    guard let rep = bitmapRepresentation(of: frame),
          let color = rep.colorAt(x: Int(screen.midX), y: Int(screen.midY)) else {
        return true
    }
    return color.alphaComponent < 0.5
}

func frameWithTransparentScreen(_ frame: NSImage, screen: CGRect) -> NSImage {
    guard let cgImage = frame.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
        return frame
    }

    let width = cgImage.width
    let height = cgImage.height
    guard let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: width,
        pixelsHigh: height,
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    ), let context = NSGraphicsContext(bitmapImageRep: rep) else {
        return frame
    }

    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = context
    context.cgContext.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
    NSGraphicsContext.restoreGraphicsState()

    guard let data = rep.bitmapData else { return frame }
    let minX = max(0, Int(screen.minX))
    let maxX = min(width, Int(screen.maxX))
    let minY = max(0, Int(screen.minY))
    let maxY = min(height, Int(screen.maxY))
    for y in minY..<maxY {
        let row = y * rep.bytesPerRow
        for x in minX..<maxX {
            let index = row + x * 4
            let alpha = data[index + 3]
            let isWhite = data[index] > 245 && data[index + 1] > 245 && data[index + 2] > 245
            if alpha > 127 && isWhite {
                data[index + 3] = 0
            }
        }
    }

    let result = NSImage(size: CGSize(width: width, height: height))
    result.addRepresentation(rep)
    return result
}

func drawRoundedRect(_ rect: CGRect, radius: CGFloat, color: NSColor) {
    color.setFill()
    NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius).fill()
}

func drawGeneratedDevice(
    screenshot: NSImage,
    canvasWidth: CGFloat,
    background: String,
    output: URL
) throws {
    let screenWidth = canvasWidth * 0.59
    let screenHeight = screenWidth * 2556 / 1179
    let bezel: CGFloat = 18
    let bodyWidth = screenWidth + bezel * 2
    let bodyHeight = screenHeight + bezel * 2
    let canvasHeight = bodyHeight + 300
    let canvas = CGRect(x: 0, y: 0, width: canvasWidth, height: canvasHeight)
    let body = CGRect(
        x: (canvasWidth - bodyWidth) / 2,
        y: (canvasHeight - bodyHeight) / 2,
        width: bodyWidth,
        height: bodyHeight
    )
    let screen = body.insetBy(dx: bezel, dy: bezel)

    guard let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: Int(canvasWidth),
        pixelsHigh: Int(canvasHeight),
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    ), let context = NSGraphicsContext(bitmapImageRep: rep) else {
        throw ScriptError.renderFailed(output)
    }

    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = context
    context.cgContext.translateBy(x: 0, y: canvasHeight)
    context.cgContext.scaleBy(x: 1, y: -1)

    if background.lowercased() == "transparent" {
        context.cgContext.clear(canvas)
    } else if let color = NSColor(hex: background) {
        let end = color.blended(withFraction: 0.10, of: .black) ?? color
        NSGradient(starting: color, ending: end)?.draw(in: canvas, angle: -90)
    } else {
        NSColor(hex: "F5F5F7")?.setFill()
        canvas.fill()
    }

    // Side buttons sit behind the frame.
    let buttonColor = NSColor(hex: "2C2C2E") ?? .darkGray
    let buttonWidth: CGFloat = 5
    let leftX = body.minX - buttonWidth
    let rightX = body.maxX
    let buttonY = body.minY + body.height * 0.22
    let buttonYs: [CGFloat] = [0, 70, 140, 220]
    for (offset, height) in zip(buttonYs, [CGFloat(42), 68, 68, 100]) {
        drawRoundedRect(
            CGRect(x: leftX, y: buttonY + offset, width: buttonWidth, height: height),
            radius: buttonWidth / 2,
            color: buttonColor
        )
    }
    drawRoundedRect(
        CGRect(x: rightX, y: body.minY + body.height * 0.28, width: buttonWidth, height: 110),
        radius: buttonWidth / 2,
        color: buttonColor
    )

    // Frame shadow and body.
    NSGraphicsContext.saveGraphicsState()
    let shadow = NSShadow()
    shadow.shadowColor = NSColor.black.withAlphaComponent(0.24)
    shadow.shadowBlurRadius = 54
    shadow.shadowOffset = NSSize(width: 0, height: -22)
    shadow.set()
    drawRoundedRect(body, radius: bodyWidth * 0.115, color: NSColor(hex: "1C1C1E") ?? .black)
    NSGraphicsContext.restoreGraphicsState()

    // A subtle edge highlight.
    let edge = NSBezierPath(
        roundedRect: body.insetBy(dx: 1.5, dy: 1.5),
        xRadius: bodyWidth * 0.115,
        yRadius: bodyWidth * 0.115
    )
    (NSColor.white.withAlphaComponent(0.16)).setStroke()
    edge.lineWidth = 2
    edge.stroke()

    // Screen and screenshot.
    drawRoundedRect(screen, radius: screenWidth * 0.115, color: .black)
    NSGraphicsContext.saveGraphicsState()
    NSBezierPath(
        roundedRect: screen.insetBy(dx: 2, dy: 2),
        xRadius: screenWidth * 0.112,
        yRadius: screenWidth * 0.112
    ).addClip()
    drawAspectFill(screenshot, in: screen)
    NSGraphicsContext.restoreGraphicsState()

    // Dynamic Island.
    let islandWidth = screenWidth * 0.27
    let islandHeight = islandWidth * 0.27
    let island = CGRect(
        x: screen.midX - islandWidth / 2,
        y: screen.minY + screenHeight * 0.018,
        width: islandWidth,
        height: islandHeight
    )
    drawRoundedRect(island, radius: islandHeight / 2, color: .black)
    let lens = CGRect(
        x: island.maxX - islandHeight * 0.64,
        y: island.midY - islandHeight * 0.22,
        width: islandHeight * 0.44,
        height: islandHeight * 0.44
    )
    drawRoundedRect(lens, radius: lens.height / 2, color: NSColor(hex: "101827") ?? .black)

    NSGraphicsContext.restoreGraphicsState()

    guard let data = rep.representation(using: .png, properties: [:]) else {
        throw ScriptError.renderFailed(output)
    }
    try data.write(to: output)
}

func drawCustomFrame(
    screenshot: NSImage,
    frame: NSImage,
    screen: CGRect,
    canvasWidth: CGFloat,
    background: String,
    output: URL
) throws {
    let frameSize = pixelSize(of: frame)
    let scale = (canvasWidth - 160) / frameSize.width
    let drawSize = CGSize(width: frameSize.width * scale, height: frameSize.height * scale)
    let canvasSize = CGSize(width: canvasWidth, height: drawSize.height + 160)
    let frameRect = CGRect(
        x: (canvasSize.width - drawSize.width) / 2,
        y: (canvasSize.height - drawSize.height) / 2,
        width: drawSize.width,
        height: drawSize.height
    )
    let screenRect = CGRect(
        x: frameRect.minX + screen.minX * scale,
        y: frameRect.minY + screen.minY * scale,
        width: screen.width * scale,
        height: screen.height * scale
    )

    guard let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: Int(canvasSize.width),
        pixelsHigh: Int(canvasSize.height),
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    ), let context = NSGraphicsContext(bitmapImageRep: rep) else {
        throw ScriptError.renderFailed(output)
    }

    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = context
    context.cgContext.translateBy(x: 0, y: canvasSize.height)
    context.cgContext.scaleBy(x: 1, y: -1)

    if background.lowercased() == "transparent" {
        context.cgContext.clear(CGRect(origin: .zero, size: canvasSize))
    } else if let color = NSColor(hex: background) {
        color.setFill()
        CGRect(origin: .zero, size: canvasSize).fill()
    }

    NSGraphicsContext.saveGraphicsState()
    NSBezierPath(
        roundedRect: screenRect,
        xRadius: min(screenRect.width, screenRect.height) * 0.08,
        yRadius: min(screenRect.width, screenRect.height) * 0.08
    ).addClip()
    drawAspectFill(screenshot, in: screenRect)
    NSGraphicsContext.restoreGraphicsState()

    let overlay = screenIsTransparent(frame, screen: screen)
        ? frame
        : frameWithTransparentScreen(frame, screen: screen)
    drawImage(overlay, in: frameRect)

    NSGraphicsContext.restoreGraphicsState()

    guard let data = rep.representation(using: .png, properties: [:]) else {
        throw ScriptError.renderFailed(output)
    }
    try data.write(to: output)
}

func main() throws {
    let options = try parseOptions()
    let files = try imageFiles(in: options.input)
    guard !files.isEmpty else {
        throw ScriptError.usage("No hay imágenes en \(options.input.path).")
    }

    try FileManager.default.createDirectory(at: options.output, withIntermediateDirectories: true)
    let frame = try options.frame.map(loadImage)
    let screen = try frame.map { try options.screen ?? detectScreen(in: $0) }
    var generated: [URL] = []

    for file in files {
        let screenshot = try loadImage(file)
        let base = file.deletingPathExtension().lastPathComponent
        let destination = options.output.appendingPathComponent("\(base)-device.png")

        if let frame, let screen {
            try drawCustomFrame(
                screenshot: screenshot,
                frame: frame,
                screen: screen,
                canvasWidth: options.width,
                background: options.background,
                output: destination
            )
        } else {
            try drawGeneratedDevice(
                screenshot: screenshot,
                canvasWidth: options.width,
                background: options.background,
                output: destination
            )
        }
        generated.append(destination)
        print("Generado: \(destination.path)")
    }

    let html = generated.map { url in
        "<img src=\"\(url.lastPathComponent)\" alt=\"\" style=\"max-width: 100%; height: auto;\">"
    }.joined(separator: "\n")
    let preview = options.output.appendingPathComponent("preview.html")
    let page = """
    <!doctype html>
    <meta charset="utf-8">
    <title>Mockups</title>
    <body style="margin: 0; padding: 40px; background: #eee; font-family: -apple-system, sans-serif;">
    <div style="display: grid; gap: 32px; max-width: 900px; margin: 0 auto;">
    \(html)
    </div>
    </body>
    """
    try page.write(to: preview, atomically: true, encoding: .utf8)

    print("")
    print("Listo. Revisa \(options.output.path)/preview.html")
    print("Sube los PNG a https://www.image2url.com/es y pega las URLs en el artículo.")
    print("Las imágenes generadas no se suben a GitHub.")
}

do {
    try main()
} catch {
    fputs("Error: \(error)\n", stderr)
    exit(1)
}
