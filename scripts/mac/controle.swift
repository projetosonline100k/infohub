// Controle do Mac para o Lauro (13/11/2026, Davi: "preciso que o Lauro tenha acesso ao meu PC também, ele pode mexer").
// Uma ferramenta de linha de comando: ver a tela (captura), mover/clicar/arrastar o mouse, digitar, apertar teclas, rolar, abrir apps.
// Compila com: swiftc -O scripts/mac/controle.swift -o ~/.infopro-hub/bin/controle   (scripts/mac/instalar-controle.sh faz isso)
// Trava de segurança: se existir o arquivo ~/.infopro-hub/lauro-parar, NENHUMA ação é feita (o botão "Parar controle" do chat cria/remove esse arquivo).
// Precisa das permissões do macOS "Acessibilidade" e "Gravação de Tela" para o programa que roda o ouvinte (o `diagnostico` mostra o que falta).
import Foundation
import CoreGraphics
import ApplicationServices
import AppKit

let casa = FileManager.default.homeDirectoryForCurrentUser.path
let pastaInfopro = casa + "/.infopro-hub"
let arquivoParar = pastaInfopro + "/lauro-parar"
let arquivoLog = pastaInfopro + "/lauro-controle.log"

func registrar(_ texto: String) {
    let linha = "\(ISO8601DateFormatter().string(from: Date())) \(texto)\n"
    if let dados = linha.data(using: .utf8) {
        if let h = FileHandle(forWritingAtPath: arquivoLog) { h.seekToEndOfFile(); h.write(dados); h.closeFile() }
        else { FileManager.default.createFile(atPath: arquivoLog, contents: dados) }
    }
}
func falhar(_ msg: String, _ codigo: Int32 = 1) -> Never { FileHandle.standardError.write((msg + "\n").data(using: .utf8)!); exit(codigo) }
func checarParar() { if FileManager.default.fileExists(atPath: arquivoParar) { falhar("PARADO: o Davi pediu para parar o controle do Mac. Não faça nenhuma ação e avise que parou.", 3) } }
func num(_ s: String) -> CGFloat { guard let v = Double(s) else { falhar("Número inválido: \(s)") }; return CGFloat(v) }

let teclas: [String: CGKeyCode] = [
    "a": 0, "s": 1, "d": 2, "f": 3, "h": 4, "g": 5, "z": 6, "x": 7, "c": 8, "v": 9, "b": 11, "q": 12, "w": 13, "e": 14, "r": 15, "y": 16, "t": 17,
    "1": 18, "2": 19, "3": 20, "4": 21, "6": 22, "5": 23, "=": 24, "9": 25, "7": 26, "-": 27, "8": 28, "0": 29, "]": 30, "o": 31, "u": 32, "[": 33,
    "i": 34, "p": 35, "return": 36, "enter": 36, "l": 37, "j": 38, "'": 39, "k": 40, ";": 41, "\\": 42, ",": 43, "/": 44, "n": 45, "m": 46, ".": 47,
    "tab": 48, "space": 49, "espaco": 49, "`": 50, "delete": 51, "backspace": 51, "apagar": 51, "esc": 53, "escape": 53,
    "left": 123, "esquerda": 123, "right": 124, "direita": 124, "down": 125, "baixo": 125, "up": 126, "cima": 126,
    "f1": 122, "f2": 120, "f3": 99, "f4": 118, "f5": 96, "f6": 97, "f7": 98, "f8": 100,
]

func evento(_ tipo: CGEventType, _ p: CGPoint, _ botao: CGMouseButton = .left) {
    CGEvent(mouseEventSource: nil, mouseType: tipo, mouseCursorPosition: p, mouseButton: botao)?.post(tap: .cghidEventTap)
}
func clicar(_ p: CGPoint, vezes: Int = 1, direito: Bool = false) {
    let (dn, up, bt): (CGEventType, CGEventType, CGMouseButton) = direito ? (.rightMouseDown, .rightMouseUp, .right) : (.leftMouseDown, .leftMouseUp, .left)
    evento(.mouseMoved, p); usleep(60_000)
    for i in 1...vezes {
        for tipo in [dn, up] {
            let e = CGEvent(mouseEventSource: nil, mouseType: tipo, mouseCursorPosition: p, mouseButton: bt)
            e?.setIntegerValueField(.mouseEventClickState, value: Int64(i))
            e?.post(tap: .cghidEventTap)
            usleep(40_000)
        }
    }
}
func tecla(_ combo: String) {
    let partes = combo.lowercased().split(separator: "+").map(String.init)
    guard let nome = partes.last, let codigo = teclas[nome] else { falhar("Tecla desconhecida: \(combo)") }
    var flags: CGEventFlags = []
    for m in partes.dropLast() {
        switch m { case "cmd", "command": flags.insert(.maskCommand); case "shift": flags.insert(.maskShift); case "alt", "option", "opt": flags.insert(.maskAlternate); case "ctrl", "control": flags.insert(.maskControl); default: falhar("Modificador desconhecido: \(m)") }
    }
    for baixo in [true, false] {
        let e = CGEvent(keyboardEventSource: nil, virtualKey: codigo, keyDown: baixo); e?.flags = flags; e?.post(tap: .cghidEventTap); usleep(30_000)
    }
}
func digitar(_ texto: String) {
    for caractere in texto {
        let unidades = Array(String(caractere).utf16)
        for baixo in [true, false] {
            let e = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: baixo)
            e?.keyboardSetUnicodeString(stringLength: unidades.count, unicodeString: unidades); e?.post(tap: .cghidEventTap); usleep(8_000)
        }
        usleep(15_000)
    }
}

let args = Array(CommandLine.arguments.dropFirst())
guard let cmd = args.first else {
    print("""
    uso: controle <comando>
      diagnostico                       mostra se as permissões do macOS estão ok
      tela [arquivo.png]                captura a tela inteira (escala 1:1 com os cliques; imprime o caminho e o tamanho)
      posicao                           posição atual do mouse
      mover X Y | clicar X Y | duplo X Y | direito X Y | arrastar X1 Y1 X2 Y2
      digitar "texto"                   digita o texto (qualquer caractere)
      tecla "cmd+t" | "return" | "esc"  aperta uma tecla ou combinação (cmd, shift, alt, ctrl)
      rolar DY [DX]                     rola (DY negativo = para baixo)
      apps | abrir "Nome do app" | frente   apps abertos, abre um app, app da frente
    Existindo ~/.infopro-hub/lauro-parar, nenhuma ação é feita.
    """)
    exit(0)
}

switch cmd {
case "diagnostico":
    let acess = AXIsProcessTrusted(), tela = CGPreflightScreenCaptureAccess()
    print("Acessibilidade (clicar/digitar): \(acess ? "OK" : "FALTA")"); print("Gravação de tela (ver a tela): \(tela ? "OK" : "FALTA")")
    print("Parar (botão do Davi): \(FileManager.default.fileExists(atPath: arquivoParar) ? "ATIVADO: nenhuma ação é feita" : "desativado")")
    if !acess || !tela { print("Para liberar: Ajustes do Sistema > Privacidade e Segurança > Acessibilidade e Gravação de Tela > ligar o programa que roda o ouvinte (Python)."); exit(2) }
case "tela":
    checarParar()
    let destino = args.count > 1 ? args[1] : "/tmp/lauro-tela-\(Int(Date().timeIntervalSince1970)).png"
    let r = Process(); r.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture"); r.arguments = ["-x", "-t", "png", destino]; try? r.run(); r.waitUntilExit()
    guard FileManager.default.fileExists(atPath: destino) else { falhar("Não consegui capturar a tela (falta a permissão de Gravação de Tela?)", 2) }
    let b = CGDisplayBounds(CGMainDisplayID())
    let s = Process(); s.executableURL = URL(fileURLWithPath: "/usr/bin/sips"); s.arguments = ["-z", "\(Int(b.height))", "\(Int(b.width))", destino]; s.standardOutput = FileHandle.nullDevice; try? s.run(); s.waitUntilExit()
    registrar("tela \(destino)"); print("\(destino)  (\(Int(b.width))x\(Int(b.height)) pontos: use essas coordenadas nos cliques)")
case "posicao":
    let p = CGEvent(source: nil)?.location ?? .zero; print("\(Int(p.x)) \(Int(p.y))")
case "mover": checarParar(); guard args.count == 3 else { falhar("uso: mover X Y") }; evento(.mouseMoved, CGPoint(x: num(args[1]), y: num(args[2]))); registrar("mover \(args[1]) \(args[2])")
case "clicar", "duplo", "direito":
    checarParar(); guard args.count == 3 else { falhar("uso: \(cmd) X Y") }
    clicar(CGPoint(x: num(args[1]), y: num(args[2])), vezes: cmd == "duplo" ? 2 : 1, direito: cmd == "direito"); registrar("\(cmd) \(args[1]) \(args[2])")
case "arrastar":
    checarParar(); guard args.count == 5 else { falhar("uso: arrastar X1 Y1 X2 Y2") }
    let a = CGPoint(x: num(args[1]), y: num(args[2])), z = CGPoint(x: num(args[3]), y: num(args[4]))
    evento(.mouseMoved, a); usleep(80_000); evento(.leftMouseDown, a); usleep(80_000)
    for i in 1...20 { let t = CGFloat(i) / 20; evento(.leftMouseDragged, CGPoint(x: a.x + (z.x - a.x) * t, y: a.y + (z.y - a.y) * t)); usleep(12_000) }
    evento(.leftMouseUp, z); registrar("arrastar \(args[1...4].joined(separator: " "))")
case "digitar": checarParar(); guard args.count >= 2 else { falhar("uso: digitar \"texto\"") }; digitar(args[1...].joined(separator: " ")); registrar("digitar (\(args[1...].joined(separator: " ").count) caracteres)")
case "tecla": checarParar(); guard args.count == 2 else { falhar("uso: tecla \"cmd+t\"") }; tecla(args[1]); registrar("tecla \(args[1])")
case "rolar":
    checarParar(); guard args.count >= 2 else { falhar("uso: rolar DY [DX]") }
    CGEvent(scrollWheelEvent2Source: nil, units: .line, wheelCount: 2, wheel1: Int32(num(args[1])), wheel2: args.count > 2 ? Int32(num(args[2])) : 0, wheel3: 0)?.post(tap: .cghidEventTap); registrar("rolar \(args[1...].joined(separator: " "))")
case "apps":
    for a in NSWorkspace.shared.runningApplications where a.activationPolicy == .regular { print(a.localizedName ?? "?") }
case "abrir":
    checarParar(); guard args.count >= 2 else { falhar("uso: abrir \"Nome do app\"") }
    let r = Process(); r.executableURL = URL(fileURLWithPath: "/usr/bin/open"); r.arguments = ["-a", args[1...].joined(separator: " ")]; try? r.run(); r.waitUntilExit()
    if r.terminationStatus != 0 { falhar("Não achei o app \(args[1...].joined(separator: " "))") }; registrar("abrir \(args[1...].joined(separator: " "))")
case "frente": print(NSWorkspace.shared.frontmostApplication?.localizedName ?? "?")
default: falhar("Comando desconhecido: \(cmd)")
}
