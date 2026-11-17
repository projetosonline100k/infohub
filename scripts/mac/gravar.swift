// Gravador do "Modo treino" do Atlas (16/11/2026, Davi: "eu ativo, faço a atividade, depois o Atlas vai repetindo").
// Fica de olho no que o Davi faz no Mac (cliques, teclas, rolagem, troca de app) e guarda, para cada ação: o app e a janela da frente, o elemento sob o mouse
// (pela Acessibilidade) e um print da tela. Não executa nada: só OBSERVA. Quem transforma isso em um passo a passo é scripts/treino.py.
//
//   gravar <pasta_da_sessao>      grava até existir <pasta>/parar (ou SIGINT/SIGTERM)
//
// Saída em <pasta>/eventos.jsonl (um JSON por linha) e <pasta>/telas/NNN-antes.jpg e NNN-depois.jpg.
// Privacidade: com o campo de senha em foco (modo de entrada segura do macOS) a tecla NÃO é gravada ("[campo de senha]"); a tela é guardada só neste Mac.
// Compila com: swiftc -O scripts/mac/gravar.swift -o ~/.infopro-hub/bin/gravar   (scripts/mac/instalar-controle.sh faz junto com o controle)
// Precisa de "Monitoramento de Entrada" (ou Acessibilidade) e "Gravação de Tela" para o programa que roda o ouvinte.
import Foundation
import CoreGraphics
import ApplicationServices
import AppKit
import Carbon.HIToolbox

setbuf(stdout, nil)
guard CommandLine.arguments.count >= 2 else { FileHandle.standardError.write("uso: gravar <pasta_da_sessao>\n".data(using: .utf8)!); exit(2) }
let pasta = CommandLine.arguments[1]
let pastaTelas = pasta + "/telas"
try? FileManager.default.createDirectory(atPath: pastaTelas, withIntermediateDirectories: true)
let arquivoEventos = pasta + "/eventos.jsonl"
let arquivoParar = pasta + "/parar"
let inicio = Date()
var contador = 0
var textoPendente = ""
var textoDesde = Date()
var rolagemY = 0.0, rolagemX = 0.0
var rolagemDesde = Date()
var ultimoApp = ""
let fila = DispatchQueue(label: "gravar.escrita")

func agora() -> Double { Date().timeIntervalSince(inicio) }
func escrever(_ d: [String: Any]) {
    fila.sync {
        guard let dados = try? JSONSerialization.data(withJSONObject: d, options: [.sortedKeys]), var linha = String(data: dados, encoding: .utf8) else { return }
        linha += "\n"
        if let h = FileHandle(forWritingAtPath: arquivoEventos) { h.seekToEndOfFile(); h.write(linha.data(using: .utf8)!); h.closeFile() }
        else { FileManager.default.createFile(atPath: arquivoEventos, contents: linha.data(using: .utf8)) }
    }
}

// Print da tela em JPEG (screencapture) e depois reduzido para 1280 px de largura (sips) em segundo plano.
func capturar(_ caminho: String, reduzir: Bool = true) {
    let p = Process()
    p.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
    p.arguments = ["-x", "-t", "jpg", caminho]
    try? p.run(); p.waitUntilExit()
    if reduzir {
        DispatchQueue.global().async {
            let r = Process()
            r.executableURL = URL(fileURLWithPath: "/usr/bin/sips")
            r.arguments = ["-Z", "1280", "--setProperty", "formatOptions", "55", caminho]
            r.standardOutput = FileHandle.nullDevice; r.standardError = FileHandle.nullDevice
            try? r.run(); r.waitUntilExit()
        }
    }
}

func atributo(_ el: AXUIElement, _ nome: String) -> String? {
    var v: CFTypeRef?
    guard AXUIElementCopyAttributeValue(el, nome as CFString, &v) == .success, let valor = v else { return nil }
    if let s = valor as? String, !s.isEmpty { return String(s.prefix(160)) }
    return nil
}
func elementoEm(_ p: CGPoint) -> [String: Any] {
    var el: AXUIElement?
    let sistema = AXUIElementCreateSystemWide()
    guard AXUIElementCopyElementAtPosition(sistema, Float(p.x), Float(p.y), &el) == .success, let e = el else { return [:] }
    var d: [String: Any] = [:]
    if let r = atributo(e, kAXRoleAttribute) { d["papel"] = r }
    if let r = atributo(e, kAXSubroleAttribute) { d["subpapel"] = r }
    if let t = atributo(e, kAXTitleAttribute) { d["titulo"] = t }
    if let t = atributo(e, kAXDescriptionAttribute) { d["descricao"] = t }
    if let t = atributo(e, kAXHelpAttribute) { d["ajuda"] = t }
    if (d["subpapel"] as? String) != "AXSecureTextField", let v = atributo(e, kAXValueAttribute) { d["valor"] = v }
    // Nome do contêiner (barra, aba, lista) ajuda a achar o botão de novo quando o app muda de lugar.
    var pai: CFTypeRef?
    if AXUIElementCopyAttributeValue(e, kAXParentAttribute as CFString, &pai) == .success, let p = pai {
        let pe = p as! AXUIElement
        if let t = atributo(pe, kAXTitleAttribute) ?? atributo(pe, kAXDescriptionAttribute) { d["dentro_de"] = t }
    }
    return d
}
func janelaDaFrente() -> (app: String, id: String, titulo: String) {
    guard let app = NSWorkspace.shared.frontmostApplication else { return ("", "", "") }
    let el = AXUIElementCreateApplication(app.processIdentifier)
    var j: CFTypeRef?
    var titulo = ""
    if AXUIElementCopyAttributeValue(el, kAXFocusedWindowAttribute as CFString, &j) == .success, let janela = j { titulo = atributo(janela as! AXUIElement, kAXTitleAttribute) ?? "" }
    return (app.localizedName ?? "", app.bundleIdentifier ?? "", titulo)
}

func descarregarTexto() {
    guard !textoPendente.isEmpty else { return }
    let (app, _, janela) = janelaDaFrente()
    escrever(["t": textoDesde.timeIntervalSince(inicio), "tipo": "digitou", "texto": textoPendente, "app": app, "janela": janela])
    textoPendente = ""
}
func descarregarRolagem() {
    guard rolagemY != 0 || rolagemX != 0 else { return }
    escrever(["t": rolagemDesde.timeIntervalSince(inicio), "tipo": "rolou", "dy": rolagemY, "dx": rolagemX, "app": janelaDaFrente().app])
    rolagemY = 0; rolagemX = 0
}

let nomesTeclas: [Int: String] = [kVK_Return: "return", kVK_Tab: "tab", kVK_Escape: "esc", kVK_Delete: "apagar", kVK_ForwardDelete: "apagar_frente", kVK_LeftArrow: "esquerda", kVK_RightArrow: "direita", kVK_UpArrow: "cima", kVK_DownArrow: "baixo", kVK_Space: "espaco"]

let tap = CGEvent.tapCreate(tap: .cgSessionEventTap, place: .headInsertEventTap, options: .listenOnly,
    eventsOfInterest: CGEventMask((1 << CGEventType.leftMouseDown.rawValue) | (1 << CGEventType.rightMouseDown.rawValue) | (1 << CGEventType.keyDown.rawValue) | (1 << CGEventType.scrollWheel.rawValue)),
    callback: { _, tipo, evento, _ in
        if tipo == .tapDisabledByTimeout || tipo == .tapDisabledByUserInput { return Unmanaged.passUnretained(evento) }
        switch tipo {
        case .leftMouseDown, .rightMouseDown:
            descarregarTexto(); descarregarRolagem()
            contador += 1
            let n = String(format: "%03d", contador)
            let p = evento.location
            let (app, bundle, janela) = janelaDaFrente()
            capturar("\(pastaTelas)/\(n)-antes.jpg")   // o clique ainda não chegou ao app: é a tela de ANTES
            escrever(["t": agora(), "tipo": tipo == .leftMouseDown ? "clique" : "clique_direito", "n": contador, "x": Int(p.x), "y": Int(p.y), "cliques": evento.getIntegerValueField(.mouseEventClickState),
                      "app": app, "bundle": bundle, "janela": janela, "elemento": elementoEm(p), "tela_antes": "telas/\(n)-antes.jpg", "tela_depois": "telas/\(n)-depois.jpg"])
            DispatchQueue.global().asyncAfter(deadline: .now() + 0.9) { capturar("\(pastaTelas)/\(n)-depois.jpg") }
        case .keyDown:
            let codigo = Int(evento.getIntegerValueField(.keyboardEventKeycode))
            let flags = evento.flags
            let comando = flags.contains(.maskCommand), controle = flags.contains(.maskControl), opcao = flags.contains(.maskAlternate)
            if IsSecureEventInputEnabled() {   // campo de senha: não grava a tecla
                if textoPendente.isEmpty { textoDesde = Date() }
                if textoPendente != "[campo de senha]" { descarregarTexto(); textoPendente = "[campo de senha]"; textoDesde = Date() }
                break
            }
            if comando || controle || opcao || nomesTeclas[codigo] != nil && codigo != kVK_Space {
                descarregarTexto()
                var combo: [String] = []
                if comando { combo.append("cmd") }; if controle { combo.append("ctrl") }; if opcao { combo.append("alt") }; if flags.contains(.maskShift) { combo.append("shift") }
                var letra = nomesTeclas[codigo] ?? ""
                if letra.isEmpty {
                    var tam = 0; var buf = [UniChar](repeating: 0, count: 4)
                    evento.keyboardGetUnicodeString(maxStringLength: 4, actualStringLength: &tam, unicodeString: &buf)
                    letra = tam > 0 ? String(utf16CodeUnits: buf, count: tam).lowercased() : "tecla\(codigo)"
                }
                combo.append(letra)
                let (app, _, janela) = janelaDaFrente()
                escrever(["t": agora(), "tipo": "tecla", "combo": combo.joined(separator: "+"), "app": app, "janela": janela])
            } else {
                var tam = 0; var buf = [UniChar](repeating: 0, count: 8)
                evento.keyboardGetUnicodeString(maxStringLength: 8, actualStringLength: &tam, unicodeString: &buf)
                if tam > 0 {
                    if textoPendente.isEmpty || textoPendente == "[campo de senha]" { descarregarTexto(); textoDesde = Date() }
                    textoPendente += String(utf16CodeUnits: buf, count: tam)
                }
            }
        case .scrollWheel:
            if rolagemY == 0 && rolagemX == 0 { rolagemDesde = Date() }
            rolagemY += Double(evento.getIntegerValueField(.scrollWheelEventPointDeltaAxis1))
            rolagemX += Double(evento.getIntegerValueField(.scrollWheelEventPointDeltaAxis2))
        default: break
        }
        return Unmanaged.passUnretained(evento)
    }, userInfo: nil)

guard let tapOk = tap else {
    FileHandle.standardError.write("Não consegui observar o teclado e o mouse: libere \"Monitoramento de Entrada\" (Ajustes do Sistema › Privacidade e Segurança) para o app que roda o Atlas e tente de novo.\n".data(using: .utf8)!)
    exit(3)
}
let fonte = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tapOk, 0)
CFRunLoopAddSource(CFRunLoopGetCurrent(), fonte, .commonModes)
CGEvent.tapEnable(tap: tapOk, enable: true)

// Troca de app (o passo "abrir o WhatsApp" não tem clique).
NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main) { n in
    guard let app = n.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication, let nome = app.localizedName, nome != ultimoApp else { return }
    ultimoApp = nome
    descarregarTexto(); descarregarRolagem()
    escrever(["t": agora(), "tipo": "app", "app": nome, "bundle": app.bundleIdentifier ?? ""])
}
escrever(["t": 0, "tipo": "inicio", "em": ISO8601DateFormatter().string(from: inicio)])

// Fecha o texto e a rolagem pendentes depois de um tempo parado, e confere o arquivo de parada.
Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { _ in
    if !textoPendente.isEmpty && Date().timeIntervalSince(textoDesde) > 1.5 && Date().timeIntervalSince(inicio) > 0 { descarregarTexto() }
    if (rolagemY != 0 || rolagemX != 0) && Date().timeIntervalSince(rolagemDesde) > 1.0 { descarregarRolagem() }
    if FileManager.default.fileExists(atPath: arquivoParar) || Date().timeIntervalSince(inicio) > 45 * 60 {
        descarregarTexto(); descarregarRolagem()
        escrever(["t": agora(), "tipo": "fim", "acoes": contador])
        exit(0)
    }
}
signal(SIGINT) { _ in exit(0) }
signal(SIGTERM) { _ in exit(0) }
CFRunLoopRun()
