// Recorta o objeto principal de uma imagem (fundo transparente) com o
// Vision do macOS — o mesmo "Copiar objeto" das Fotos. Grátis e local.
//   swift recortar.swift entrada.png saida.png
import AppKit
import CoreImage
import Vision

let a = CommandLine.arguments
guard a.count == 3, let img = NSImage(contentsOfFile: a[1]),
      let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
  FileHandle.standardError.write("uso: recortar entrada saida\n".data(using: .utf8)!); exit(1)
}
let pedido = VNGenerateForegroundInstanceMaskRequest()
let h = VNImageRequestHandler(cgImage: cg)
try h.perform([pedido])
guard let r = pedido.results?.first else {
  FileHandle.standardError.write("nenhum objeto encontrado\n".data(using: .utf8)!); exit(2)
}
let buf = try r.generateMaskedImage(ofInstances: r.allInstances, from: h, croppedToInstancesExtent: true)
let ci = CIImage(cvPixelBuffer: buf)
let ctx = CIContext()
guard let saida = ctx.createCGImage(ci, from: ci.extent) else { exit(3) }
let rep = NSBitmapImageRep(cgImage: saida)
try rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: a[2]))
