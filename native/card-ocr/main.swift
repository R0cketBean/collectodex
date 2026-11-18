// Kartenscanner (#168): liest Text aus einem Kartenbild mit Apple Vision
// (offline, auf dem Gerät) und gibt die Zeilen als JSON auf stdout aus.
//
// 1. Karte im Foto suchen (Rechteck im Seitenverhältnis einer Karte) und
//    perspektivisch entzerren. Findet sich keins, gilt das ganze Bild als Karte.
// 2. Durchgang „full“: ganze Karte (Name oben, Regeltexte).
// 3. Durchgang „bottom“: unterer Rand links vergrößert, weil Set-Code und
//    Nummer (z. B. „SVI DE 123/198“) dort sehr klein gedruckt sind.
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
  // Querformat: Karte lag seitlich – aufrichten. Eine Karte, die auf dem
  // Kopf liegt, wird nicht gedreht; dann bitte das Foto neu aufnehmen.
  if output.extent.width > output.extent.height {
    output = output.oriented(.right)
  }
  return ciContext.createCGImage(output, from: output.extent)
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
let card = detected ?? photo

var out: [[String: Any]] = []
do {
  out += lines(try recognize(card), pass: "full", frame: CGRect(x: 0, y: 0, width: 1, height: 1))
  let W = CGFloat(card.width), H = CGFloat(card.height)
  let frame = CGRect(x: 0, y: 0.88, width: 0.6, height: 0.12)
  let crop = CGRect(x: frame.minX * W, y: frame.minY * H, width: frame.width * W, height: frame.height * H)
  let factor = max(1, min(4, 2400 / crop.width))
  if let zoom = scaled(card, crop: crop, factor: factor) {
    out += lines(try recognize(zoom), pass: "bottom", frame: frame)
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
