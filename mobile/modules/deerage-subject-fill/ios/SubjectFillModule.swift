import ExpoModulesCore
import UIKit
import Vision

/**
 On-device subject detector for the viewfinder.
 VNRecognizeAnimalsRequest only knows cats and dogs, so this uses Vision
 objectness saliency (and attention saliency as a fallback) to find the
 main subject — typically the deer in the frame. No network, no server.
 */
public class SubjectFillModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DeerAgeSubjectFill")

    Function("isAvailable") { () -> Bool in
      return true
    }

    AsyncFunction("detectSubjects") { (uri: String) -> [String: Any] in
      guard let image = Self.loadImage(uri: uri), let cgImage = image.cgImage else {
        return ["boxes": [], "imageWidth": 0, "imageHeight": 0]
      }

      let width = cgImage.width
      let height = cgImage.height
      let handler = VNImageRequestHandler(cgImage: cgImage, orientation: Self.cgOrientation(from: image), options: [:])

      var boxes = Self.salientBoxes(handler: handler, request: VNGenerateObjectnessBasedSaliencyImageRequest())
      if boxes.isEmpty {
        boxes = Self.salientBoxes(handler: handler, request: VNGenerateAttentionBasedSaliencyImageRequest())
      }

      return [
        "boxes": boxes,
        "imageWidth": width,
        "imageHeight": height
      ]
    }
  }

  private static func loadImage(uri: String) -> UIImage? {
    let path = uri.hasPrefix("file://") ? String(uri.dropFirst("file://".count)) : uri
    if let decoded = path.removingPercentEncoding {
      return UIImage(contentsOfFile: decoded)
    }
    return UIImage(contentsOfFile: path)
  }

  private static func cgOrientation(from image: UIImage) -> CGImagePropertyOrientation {
    switch image.imageOrientation {
    case .up: return .up
    case .down: return .down
    case .left: return .left
    case .right: return .right
    case .upMirrored: return .upMirrored
    case .downMirrored: return .downMirrored
    case .leftMirrored: return .leftMirrored
    case .rightMirrored: return .rightMirrored
    @unknown default: return .up
    }
  }

  private static func salientBoxes(handler: VNImageRequestHandler, request: VNImageBasedRequest) -> [[String: Double]] {
    do {
      try handler.perform([request])
    } catch {
      return []
    }
    guard let observation = request.results?.first as? VNSaliencyImageObservation else {
      return []
    }
    let objects = observation.salientObjects ?? []
    return objects.map { object in
      let box = object.boundingBox
      // Vision uses bottom-left origin. Convert to top-left, 0–1.
      return [
        "x": Double(box.origin.x),
        "y": Double(1 - box.origin.y - box.size.height),
        "width": Double(box.size.width),
        "height": Double(box.size.height),
        "confidence": Double(object.confidence)
      ]
    }
  }
}
