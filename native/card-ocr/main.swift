// Kartenscanner (#168): liest Text aus einem Kartenbild mit Apple Vision
// (offline, auf dem Gerät) und gibt die Zeilen als JSON auf stdout aus.
//
// 1. Karte im Foto suchen (Rechteck im Seitenverhältnis einer Karte) und
//    perspektivisch entzerren. Findet sich keins, gilt das ganze Bild als Karte.
// 2. Durchgang „full“: ganze Karte (Name oben, Regeltexte).
// 3. Durchgang „bottom“: unterer Rand vergrößert, weil Set-Code und Nummer
//    sehr klein gedruckt sind – links (heute, z. B. „SVI DE 123/198“) und
//    rechts (WotC-Ära bis HeartGold/SoulSilver, z. B. „4/102“, #170).
//
// Aufruf: card-ocr <bildpfad> [<vorschau.jpg>]
// Mit zweitem Pfad wird die (entzerrte) Karte dort als kleines JPEG abgelegt.
// Ausgabe: {"width","height","cardDetected","lines":[{"text","confidence","pass","x","y","w","h"}]}
// Koordinaten normiert auf 0…1 der (entzerrten) Karte, Ursprung oben links.

import CoreGraphics
import CoreImage
import Foundation
import ImageIO
import Vision

func fail(_ msg: String, _ code: Int32) -> Never {
  FileHandle.standardError.write((msg + "\n").data(using: .utf8)!)
  exit(code)
}

let ciContext = CIContext(options: nil)

/// Sucht die Karte im Foto und liefert sie entzerrt, aufrecht (Hochformat).
func detectCard(_ image: CGImage) -> CGImage? {
  let request = VNDetectRectanglesRequest()
  // Karten sind 63 × 88 mm (≈ 0,716); etwas Spielraum für Schräglage.
  request.minimumAspectRatio = 0.6
  request.maximumAspectRatio = 0.85
  request.minimumSize = 0.2
  request.minimumConfidence = 0.6
  request.quadratureTolerance = 20
  request.maximumObservations = 1
  do { try VNImageRequestHandler(cgImage: image, options: [:]).perform([request]) } catch { return nil }
  guard let rect = request.results?.first else { return nil }

  let w = CGFloat(image.width), h = CGFloat(image.height)
  let point = { (p: CGPoint) in CIVector(x: p.x * w, y: p.y * h) }
  let input = CIImage(cgImage: image)
  guard let filter = CIFilter(name: "CIPerspectiveCorrection") else { return nil }
  filter.setValue(input, forKey: kCIInputImageKey)
  filter.setValue(point(rect.topLeft), forKey: "inputTopLeft")
  filter.setValue(point(rect.topRight), forKey: "inputTopRight")
  filter.setValue(point(rect.bottomLeft), forKey: "inputBottomLeft")
  filter.setValue(point(rect.bottomRight), forKey: "inputBottomRight")
  guard var output = filter.outputImage else { return nil }
  // Querformat: Karte lag seitlich – ins Hochformat bringen. Ob sie dann auf
  // dem Kopf steht, klärt isUpsideDown().
  if output.extent.width > output.extent.height {
    output = output.oriented(.right)
  }
  return ciContext.createCGImage(output, from: output.extent)
}

func rotated(_ image: CGImage, _ orientation: CGImagePropertyOrientation) -> CGImage? {
  if orientation == .up { return image }
  let ci = CIImage(cgImage: image).oriented(orientation)
  return ciContext.createCGImage(ci, from: ci.extent)
}

func recognize(_ image: CGImage) throws -> [VNRecognizedTextObservation] {
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.recognitionLanguages = ["de-DE", "en-US"]
  request.usesLanguageCorrection = false
  try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
  return request.results ?? []
}

func scaled(_ image: CGImage, crop: CGRect, factor: CGFloat) -> CGImage? {
  guard let part = image.cropping(to: crop) else { return nil }
  let w = Int(CGFloat(part.width) * factor), h = Int(CGFloat(part.height) * factor)
  guard let ctx = CGContext(
    data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
    space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
  ) else { return nil }
  ctx.interpolationQuality = .high
  ctx.draw(part, in: CGRect(x: 0, y: 0, width: w, height: h))
  return ctx.makeImage()
}

func lines(_ obs: [VNRecognizedTextObservation], pass: String, frame: CGRect) -> [[String: Any]] {
  obs.compactMap { o in
    guard let top = o.topCandidates(1).first else { return nil }
    let b = o.boundingBox  // Vision: Ursprung unten links
    return [
      "text": top.string, "confidence": top.confidence, "pass": pass,
      "x": frame.minX + b.minX * frame.width,
      "y": frame.minY + (1 - b.maxY) * frame.height,
      "w": b.width * frame.width, "h": b.height * frame.height,
    ]
  }
}

/// Fußzeile der Karte: Nummer („150/132“), Illustrator, Copyright.
let footer = try! NSRegularExpression(pattern: "\\d{1,3}\\s*/\\s*\\d{2,3}|illus|©|pok[eé]mon/", options: [.caseInsensitive])

/// Steht die Karte auf dem Kopf? Apples Texterkennung liest auch gedrehten
/// Text, liefert die Lage aber im Bild: Liegt die Fußzeile oben, ist es verkehrt.
func isUpsideDown(_ obs: [VNRecognizedTextObservation]) -> Bool {
  let ys: [CGFloat] = obs.compactMap { o in
    guard let text = o.topCandidates(1).first?.string,
      footer.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) != nil
    else { return nil }
    return o.boundingBox.midY  // Vision: Ursprung unten links
  }
  guard !ys.isEmpty else { return false }
  return ys.reduce(0, +) / CGFloat(ys.count) > 0.5
}

/// Läuft der Text senkrecht? (Karte nicht gefunden, Bild um 90° gedreht.)
func isSideways(_ obs: [VNRecognizedTextObservation], width: Int, height: Int) -> Bool {
  let long = obs.filter { ($0.topCandidates(1).first?.string.count ?? 0) >= 6 }
  guard long.count >= 3 else { return false }
  let vertical = long.filter { $0.boundingBox.height * CGFloat(height) > $0.boundingBox.width * CGFloat(width) }
  return vertical.count * 2 > long.count
}

let args = CommandLine.arguments
guard args.count >= 2 else { fail("Aufruf: card-ocr <bild>", 2) }
let options = [kCGImageSourceShouldAllowFloat: false] as CFDictionary
guard let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: args[1]) as CFURL, options),
  let raw = CGImageSourceCreateImageAtIndex(src, 0, nil)
else { fail("Bild nicht lesbar", 3) }

// Fotos vom iPhone liegen oft gedreht vor (EXIF-Ausrichtung); erst aufrichten.
var photo = raw
if let props = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [CFString: Any],
  let value = props[kCGImagePropertyOrientation] as? UInt32,
  let orientation = CGImagePropertyOrientation(rawValue: value), orientation != .up,
  let upright = ciContext.createCGImage(
    CIImage(cgImage: raw).oriented(orientation), from: CIImage(cgImage: raw).oriented(orientation).extent)
{
  photo = upright
}

let detected = detectCard(photo)
var card = detected ?? photo

var out: [[String: Any]] = []
do {
  // Das iPhone als Kamera dreht sein Bild je nach Haltung (flach gehalten
  // auch falsch herum). Erst die Lage klären, dann genau lesen.
  var full = try recognize(card)
  if detected == nil, isSideways(full, width: card.width, height: card.height),
    let turned = rotated(card, .right)
  {
    card = turned
    full = try recognize(card)
  }
  if isUpsideDown(full), let turned = rotated(card, .down) {
    card = turned
    full = try recognize(card)
  }
  out += lines(full, pass: "full", frame: CGRect(x: 0, y: 0, width: 1, height: 1))
  let W = CGFloat(card.width), H = CGFloat(card.height)
  let frames = [
    CGRect(x: 0, y: 0.88, width: 0.6, height: 0.12),
    CGRect(x: 0.6, y: 0.88, width: 0.4, height: 0.12),
  ]
  for frame in frames {
    let crop = CGRect(x: frame.minX * W, y: frame.minY * H, width: frame.width * W, height: frame.height * H)
    let factor = max(1, min(4, 2400 / crop.width))
    if let zoom = scaled(card, crop: crop, factor: factor) {
      out += lines(try recognize(zoom), pass: "bottom", frame: frame)
    }
  }
} catch { fail("Texterkennung fehlgeschlagen: \(error)", 4) }

/// Legt die Karte verkleinert (höchstens 700 px hoch) als JPEG ab.
func writePreview(_ image: CGImage, to path: String) {
  let factor = min(1, 700 / CGFloat(image.height))
  let input = CIImage(cgImage: image).transformed(by: CGAffineTransform(scaleX: factor, y: factor))
  try? ciContext.writeJPEGRepresentation(
    of: input, to: URL(fileURLWithPath: path), colorSpace: CGColorSpaceCreateDeviceRGB(),
    options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: 0.8])
}
if args.count >= 3 { writePreview(card, to: args[2]) }

let result: [String: Any] = [
  "width": card.width, "height": card.height, "cardDetected": detected != nil, "lines": out,
]
FileHandle.standardOutput.write(try! JSONSerialization.data(withJSONObject: result, options: [.sortedKeys]))
