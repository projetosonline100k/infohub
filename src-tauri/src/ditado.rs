//! Ditado do Atlas (18/10/2026, Davi): "quando eu segurasse Command, ele começasse a
//! escutar o que eu estou falando e transcrevesse em texto, para eu mandar no WhatsApp,
//! em grupo, aqui mesmo, de forma organizada e inteligente".
//!
//! - Monitor da tecla: uma thread olha o estado do teclado a cada 30 ms (sem
//!   permissão nenhuma: só lê as teclas apertadas). ⌘ sozinho por 0,45 s =
//!   "ditado-apertado"; soltou = "ditado-solto". Se outra tecla, outro
//!   modificador ou o mouse entrar no meio (⌘C, ⌘Tab, ⌘+clique…), não é ditado:
//!   "ditado-cancelado" — os atalhos continuam funcionando.
//! - A janela do Atlas grava, transcreve (Whisper local, voz_transcrever) e
//!   chama `ditado_organizar` (Claude, modelo rápido) e `ditado_colar`.
//! - Colar: o texto vai para a área de transferência e, com a permissão de
//!   Acessibilidade, o app aperta ⌘V onde o cursor estiver.

use std::process::{Command, Stdio};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGEventSourceFlagsState(estado: i32) -> u64;
    fn CGEventSourceKeyState(estado: i32, tecla: u16) -> bool;
    fn CGEventSourceButtonState(estado: i32, botao: u32) -> bool;
    fn CGEventSourceCreate(estado: i32) -> *mut std::ffi::c_void;
    fn CGEventCreateKeyboardEvent(fonte: *const std::ffi::c_void, tecla: u16, apertada: bool) -> *mut std::ffi::c_void;
    fn CGEventSetFlags(evento: *mut std::ffi::c_void, flags: u64);
    fn CGEventPost(onde: u32, evento: *mut std::ffi::c_void);
}
#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXIsProcessTrusted() -> bool;
}
#[link(name = "CoreAudio", kind = "framework")]
extern "C" {
    fn AudioObjectGetPropertyData(objeto: u32, endereco: *const EnderecoAudio, qualificador_tam: u32, qualificador: *const std::ffi::c_void,
                                  tamanho: *mut u32, dados: *mut std::ffi::c_void) -> i32;
}
extern "C" {
    fn dlopen(caminho: *const std::ffi::c_char, modo: i32) -> *mut std::ffi::c_void;
    fn dlsym(biblioteca: *mut std::ffi::c_void, nome: *const std::ffi::c_char) -> *mut std::ffi::c_void;
}
#[repr(C)]
struct EnderecoAudio {
    seletor: u32,
    escopo: u32,
    elemento: u32,
}

// ---------------------------------------------------------------- Mídia
// 18/10 (Davi): "quando eu ativar o modo para gravar minha voz, quero que tudo que esteja
// tocando (som, música, vídeo) pause, e que volte quando eu soltar". Pausa com o comando de
// mídia do sistema (o mesmo da tecla ⏯: Spotify, Música, YouTube no navegador…) — só se havia
// som saindo do Mac; ao soltar, dá play só no que ele mesmo pausou.
static PAUSOU: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

const fn quatro(c: &[u8; 4]) -> u32 {
    u32::from_be_bytes(*c)
}

/// A saída de som do Mac está tocando alguma coisa agora?
fn som_tocando() -> bool {
    unsafe {
        let mut dispositivo: u32 = 0;
        let mut tam = std::mem::size_of::<u32>() as u32;
        let saida = EnderecoAudio { seletor: quatro(b"dOut"), escopo: quatro(b"glob"), elemento: 0 };
        if AudioObjectGetPropertyData(1, &saida, 0, std::ptr::null(), &mut tam, &mut dispositivo as *mut u32 as *mut _) != 0 || dispositivo == 0 {
            return false;
        }
        let mut rodando: u32 = 0;
        let mut tam = std::mem::size_of::<u32>() as u32;
        let tocando = EnderecoAudio { seletor: quatro(b"gone"), escopo: quatro(b"glob"), elemento: 0 };
        AudioObjectGetPropertyData(dispositivo, &tocando, 0, std::ptr::null(), &mut tam, &mut rodando as *mut u32 as *mut _) == 0 && rodando != 0
    }
}

/// Comando de mídia do sistema (MediaRemote): 0 = play, 1 = pause.
fn comando_midia(comando: u32) -> bool {
    type Enviar = unsafe extern "C" fn(u32, *const std::ffi::c_void) -> bool;
    unsafe {
        let lib = dlopen(c"/System/Library/PrivateFrameworks/MediaRemote.framework/MediaRemote".as_ptr(), 1);
        if lib.is_null() {
            return false;
        }
        let f = dlsym(lib, c"MRMediaRemoteSendCommand".as_ptr());
        if f.is_null() {
            return false;
        }
        let enviar: Enviar = std::mem::transmute(f);
        enviar(comando, std::ptr::null())
    }
}

/// Começou a gravar: pausa o que estiver tocando.
pub fn pausar_midia() {
    if PAUSOU.load(std::sync::atomic::Ordering::Relaxed) {
        return;
    }
    let tocava = som_tocando();
    let pausou = tocava && comando_midia(1);
    PAUSOU.store(pausou, std::sync::atomic::Ordering::Relaxed);
    registrar("midia", &format!("tocava={tocava} pausou={pausou}"));
}

/// Parou de gravar: volta o que ele pausou (e só isso).
pub fn retomar_midia() {
    if PAUSOU.swap(false, std::sync::atomic::Ordering::Relaxed) {
        std::thread::spawn(|| {
            std::thread::sleep(Duration::from_millis(150));
            let ok = comando_midia(0);
            registrar("midia", &format!("retomou={ok}"));
        });
    }
}

#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    fn CFRelease(objeto: *const std::ffi::c_void);
}

const HID: i32 = 1; // kCGEventSourceStateHIDSystemState
const PRIVADO: i32 = -1; // kCGEventSourceStatePrivate: o ⌘V do colar não mexe no estado do teclado
/// Fim da "surdez" depois de colar (ms desde a época). 18/10: o ⌘V simulado deixava o Mac
/// achando que o ⌘ seguia apertado, e o ditado começava a gravar sozinho.
static SURDO_ATE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
fn agora_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}
/// ⌘ de verdade no teclado (as duas teclas físicas: 55 esquerda, 54 direita).
fn cmd_fisico() -> bool {
    unsafe { CGEventSourceKeyState(HID, 55) || CGEventSourceKeyState(HID, 54) }
}
const CMD: u64 = 0x0010_0000;
const OUTROS_MODIFICADORES: u64 = 0x0002_0000 | 0x0004_0000 | 0x0008_0000; // shift, control, option
const SEGURAR: Duration = Duration::from_millis(600);
const MAXIMO: Duration = Duration::from_secs(120);   // nenhuma gravação passa disso

/// Registro dos disparos (18/10: "ele fica ativando sozinho") em ~/.infopro-hub/ditado.log,
/// para descobrir o que acionou: hora, evento e o estado do teclado.
pub(crate) fn registrar(evento: &str, detalhe: &str) {
    use std::io::Write;
    let Some(home) = std::env::var_os("HOME") else { return };
    let arquivo = std::path::PathBuf::from(home).join(".infopro-hub/ditado.log");
    if std::fs::metadata(&arquivo).map(|m| m.len() > 200_000).unwrap_or(false) {
        let _ = std::fs::remove_file(&arquivo);
    }
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(arquivo) {
        let _ = writeln!(f, "{} {evento} {detalhe}", agora_ms());
    }
}
const TECLA_V: u16 = 9;

/// Alguma tecla que não é modificador (⌘, ⇧, ⌥, ⌃, caps, fn = 54…63) ou botão do mouse apertado.
fn outra_coisa_apertada() -> bool {
    unsafe {
        (0u16..128).filter(|t| !(54..=63).contains(t)).any(|t| CGEventSourceKeyState(HID, t))
            || (0..3).any(|b| CGEventSourceButtonState(HID, b))
    }
}

pub const EVENTO_APERTADO: &str = "ditado-apertado";
pub const EVENTO_SOLTO: &str = "ditado-solto";
pub const EVENTO_CANCELADO: &str = "ditado-cancelado";

/// Chamado uma vez no setup() de lib.rs.
pub fn iniciar(app: AppHandle) {
    std::thread::spawn(move || {
        let mut desde: Option<Instant> = None;
        let mut sujo = false;      // esse aperto de ⌘ virou atalho: não é ditado
        let mut gravando = false;
        let mut gravando_desde = Instant::now();
        loop {
            std::thread::sleep(Duration::from_millis(30));
            let flags = unsafe { CGEventSourceFlagsState(HID) };
            let surdo = agora_ms() < SURDO_ATE.load(std::sync::atomic::Ordering::Relaxed);
            let estourou = gravando && gravando_desde.elapsed() >= MAXIMO;
            if !cmd_fisico() || surdo || estourou {
                if gravando {
                    registrar("solto", if estourou { "limite de 2 min" } else if surdo { "colando" } else { "soltou o cmd" });
                    retomar_midia();
                    let _ = app.emit_to("jarvis", EVENTO_SOLTO, ());
                }
                if estourou {
                    // Continua segurando: só volta a valer depois de soltar.
                    gravando = false;
                    sujo = true;
                    continue;
                }
                desde = None;
                sujo = false;
                gravando = false;
                continue;
            }
            let combinou = flags & OUTROS_MODIFICADORES != 0 || outra_coisa_apertada();
            if desde.is_none() {
                desde = Some(Instant::now());
                sujo = combinou;
            }
            if combinou && !sujo {
                sujo = true;
                if gravando {
                    gravando = false;
                    registrar("cancelado", &format!("flags={flags:#x} outra_tecla={}", outra_coisa_apertada()));
                    retomar_midia();
                    let _ = app.emit_to("jarvis", EVENTO_CANCELADO, ());
                }
            }
            if !sujo && !gravando && desde.map_or(false, |d| d.elapsed() >= SEGURAR) {
                gravando = true;
                gravando_desde = Instant::now();
                registrar("apertado", &format!("flags={flags:#x} cmd_esq={} cmd_dir={}",
                    unsafe { CGEventSourceKeyState(HID, 55) }, unsafe { CGEventSourceKeyState(HID, 54) }));
                pausar_midia();
                let _ = app.emit_to("jarvis", EVENTO_APERTADO, ());
            }
        }
    });
}

/// O Claude Code que vem com o app do Claude (a pasta muda a cada atualização).
fn claude_bin() -> Option<std::path::PathBuf> {
    let base = std::path::PathBuf::from(std::env::var_os("HOME")?).join("Library/Application Support/Claude/claude-code");
    let mut achados: Vec<(Vec<u32>, std::path::PathBuf)> = Vec::new();
    for versao in std::fs::read_dir(&base).ok()?.flatten() {
        for sub in std::fs::read_dir(versao.path()).into_iter().flatten().flatten() {
            let bin = sub.path().join("claude.app/Contents/MacOS/claude");
            if bin.exists() {
                let v = versao.file_name().to_string_lossy().split('.').map(|x| x.parse().unwrap_or(0)).collect();
                achados.push((v, bin));
            }
        }
    }
    achados.into_iter().max_by(|a, b| a.0.cmp(&b.0)).map(|(_, p)| p)
}

const PEDIDO: &str = "Você recebe a transcrição de uma fala do Davi (ditado por voz). Reescreva como uma mensagem pronta para ele mandar no WhatsApp para outra pessoa ou grupo:\n\
- português do Brasil, primeira pessoa (quem fala é o Davi), tom amigável, natural e direto, como ele falaria;\n\
- organizada: parágrafos curtos; se houver vários pontos, pedidos ou passos, use uma lista com •; *negrito* do WhatsApp só se ajudar muito;\n\
- tire vícios de fala (né, tipo, é…, então assim) e repetições; corrija erros óbvios de transcrição;\n\
- mantenha o chamamento e a saudação que ele disse (ex.: \"Pessoal,\", \"Fala, Matheus\");\n\
- NÃO invente nada, NÃO tire informação, NÃO responda à mensagem, NÃO acrescente saudação nem despedida que ele não disse;\n\
- se a fala for curta e simples, devolva só uma frase limpa.\n\
Responda SOMENTE com a mensagem final, sem comentários.\n\nTRANSCRIÇÃO:\n";

/// Organiza a fala transcrita (Claude, modelo rápido). Se der errado, devolve a fala como veio.
#[tauri::command]
pub async fn ditado_organizar(texto: String) -> Result<String, String> {
    let texto = texto.trim().to_string();
    if texto.is_empty() {
        return Ok(texto);
    }
    let Some(bin) = claude_bin() else { return Ok(texto) };
    let original = texto.clone();
    let resultado = tauri::async_runtime::spawn_blocking(move || {
        // Pasta neutra: sem CLAUDE.md de projeto (mais rápido e sem contexto que não serve).
        Command::new(bin)
            // Sem ferramentas, MCP, comandos nem ajustes do usuário: o Claude abre em ~2–4 s em vez de ~8 s.
            .args(["-p", &format!("{PEDIDO}{texto}"), "--model", "haiku", "--output-format", "text", "--max-turns", "1",
                   "--strict-mcp-config", "--mcp-config", "{\"mcpServers\":{}}", "--tools", "", "--disable-slash-commands",
                   "--setting-sources", "", "--no-session-persistence"])
            .current_dir(std::env::temp_dir())
            .stdin(Stdio::null())
            .output()
    })
    .await
    .map_err(|e| e.to_string())?;
    match resultado {
        Ok(saida) if saida.status.success() => {
            let organizado = String::from_utf8_lossy(&saida.stdout).trim().to_string();
            Ok(if organizado.is_empty() { original } else { organizado })
        }
        _ => Ok(original),
    }
}

/// Põe o texto na área de transferência e, com permissão de Acessibilidade, cola (⌘V)
/// onde o cursor estiver. Devolve se colou (false = só copiou).
#[tauri::command]
pub fn ditado_colar(texto: String) -> Result<bool, String> {
    let mut pb = Command::new("/usr/bin/pbcopy").env("LANG", "en_US.UTF-8").stdin(Stdio::piped()).spawn().map_err(|e| e.to_string())?;
    if let Some(entrada) = pb.stdin.as_mut() {
        use std::io::Write;
        entrada.write_all(texto.as_bytes()).map_err(|e| e.to_string())?;
    }
    pb.wait().map_err(|e| e.to_string())?;
    if !unsafe { AXIsProcessTrusted() } {
        return Ok(false);
    }
    // Espera o ⌘ do Davi sair do teclado (senão o ⌘V vira outra coisa).
    let limite = Instant::now() + Duration::from_secs(2);
    while cmd_fisico() && Instant::now() < limite {
        std::thread::sleep(Duration::from_millis(20));
    }
    SURDO_ATE.store(agora_ms() + 1200, std::sync::atomic::Ordering::Relaxed);
    unsafe {
        let fonte = CGEventSourceCreate(PRIVADO);
        for apertada in [true, false] {
            let ev = CGEventCreateKeyboardEvent(fonte as *const _, TECLA_V, apertada);
            if ev.is_null() {
                return Ok(false);
            }
            CGEventSetFlags(ev, CMD);
            CGEventPost(0, ev); // kCGHIDEventTap
            CFRelease(ev);
        }
        if !fonte.is_null() {
            CFRelease(fonte);
        }
    }
    Ok(true)
}
