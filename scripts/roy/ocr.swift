// Lê o texto de uma imagem com o Vision do macOS (pt-BR). Usado pela
// revisão automática do Roy para conferir textos e acentos das páginas.
//   swift ocr.swift pagina.png
import AppKit
import Vision

let a = CommandLine.arguments
guard a.count == 2, let img = NSImage(contentsOfFile: a[1]),
      let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { exit(1) }
let pedido = VNRecognizeTextRequest()
pedido.recognitionLevel = .accurate
pedido.recognitionLanguages = ["pt-BR"]
pedido.usesLanguageCorrection = false
try VNImageRequestHandler(cgImage: cg).perform([pedido])
for r in pedido.results ?? [] { if let t = r.topCandidates(1).first { print(t.string) } }
