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
extern "C" {
    fn dlopen(caminho: *const std::ffi::c_char, modo: i32) -> *mut std::ffi::c_void;
    fn dlsym(biblioteca: *mut std::ffi::c_void, nome: *const std::ffi::c_char) -> *mut std::ffi::c_void;
}

// ---------------------------------------------------------------- Mídia
// 18/10 (Davi): "quando eu ativar o modo para gravar minha voz, quero que tudo que esteja
// tocando (som, música, vídeo) pause, e que volte quando eu soltar". Pausa com o comando de
// mídia do sistema (o mesmo da tecla ⏯: Spotify, Música, YouTube no navegador…) — só se havia
// som saindo do Mac; ao soltar, dá play só no que ele mesmo pausou.
static PAUSOU: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Bloco Objective-C global (sem capturas) para receber a resposta do MediaRemote.
#[repr(C)]
struct DescritorBloco {
    reservado: u64,
    tamanho: u64,
}
#[repr(C)]
struct Bloco {
    isa: *const std::ffi::c_void,
    flags: i32,
    reservado: i32,
    invocar: extern "C" fn(*const Bloco, bool),
    descritor: *const DescritorBloco,
}
unsafe impl Sync for Bloco {}
extern "C" {
    static _NSConcreteGlobalBlock: std::ffi::c_void;
    fn dispatch_get_global_queue(identificador: isize, flags: usize) -> *mut std::ffi::c_void;
}
static RESPOSTA_TOCANDO: std::sync::Mutex<Option<bool>> = std::sync::Mutex::new(None);
static AVISO_TOCANDO: std::sync::Condvar = std::sync::Condvar::new();
extern "C" fn recebeu_tocando(_bloco: *const Bloco, tocando: bool) {
    *RESPOSTA_TOCANDO.lock().unwrap_or_else(|e| e.into_inner()) = Some(tocando);
    AVISO_TOCANDO.notify_all();
}

/// Tem música/vídeo tocando agora? (o mesmo que a Central de Controle mostra). Antes era
/// "a saída de som está ligada", que dizia sim quase sempre e o ditado dava play no que
/// estava parado. Sem resposta em 300 ms: não (melhor não pausar do que dar play errado).
fn som_tocando() -> bool {
    type Perguntar = unsafe extern "C" fn(*mut std::ffi::c_void, *const Bloco);
    static DESCRITOR: DescritorBloco = DescritorBloco { reservado: 0, tamanho: std::mem::size_of::<Bloco>() as u64 };
    unsafe {
        let lib = dlopen(c"/System/Library/PrivateFrameworks/MediaRemote.framework/MediaRemote".as_ptr(), 1);
        if lib.is_null() {
            return false;
        }
        let f = dlsym(lib, c"MRMediaRemoteGetNowPlayingApplicationIsPlaying".as_ptr());
        if f.is_null() {
            return false;
        }
        static BLOCO: std::sync::OnceLock<&'static Bloco> = std::sync::OnceLock::new();
        let bloco: &'static Bloco = BLOCO.get_or_init(|| Box::leak(Box::new(Bloco {
            isa: std::ptr::addr_of!(_NSConcreteGlobalBlock),
            flags: 1 << 28, // BLOCK_IS_GLOBAL
            reservado: 0,
            invocar: recebeu_tocando,
            descritor: &DESCRITOR,
        })));
        *RESPOSTA_TOCANDO.lock().unwrap_or_else(|e| e.into_inner()) = None;
        let perguntar: Perguntar = std::mem::transmute(f);
        perguntar(dispatch_get_global_queue(0, 0), bloco);
        let guarda = RESPOSTA_TOCANDO.lock().unwrap_or_else(|e| e.into_inner());
        let (guarda, _) = AVISO_TOCANDO.wait_timeout_while(guarda, Duration::from_millis(300), |r| r.is_none())
            .unwrap_or_else(|e| e.into_inner());
        guarda.unwrap_or(false)
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
/// 18/10 (registro): o ⌘V de colar deixava o Mac com um ⌘ "apertado" sem a marca de tecla
/// física (flags 0x20100000 em vez de 0x100108) e o ditado disparava ~1,8 s depois de colar.
/// Só vale ⌘ com a marca do lado (0x08 esquerdo, 0x10 direito) E a tecla apertada.
fn cmd_fisico() -> bool {
    let flags = unsafe { CGEventSourceFlagsState(HID) };
    flags & CMD != 0 && flags & 0x18 != 0 && unsafe { CGEventSourceKeyState(HID, 55) || CGEventSourceKeyState(HID, 54) }
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
                preaquecer_claude();   // abre o Claude enquanto o Davi fala
                let _ = app.emit_to("jarvis", EVENTO_APERTADO, ());
            }
        }
    });
}

/// Passos do lado do Atlas (gravou, transcreveu, organizou, colou) no mesmo registro,
/// com o tempo de cada um — para achar repetição e demora.
#[tauri::command]
pub fn ditado_registrar(evento: String, detalhe: String) {
    registrar(&format!("atlas:{evento}"), &detalhe);
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


macro_rules! INSTRUCAO_ORGANIZAR { () => { "Você recebe a transcrição de uma fala do Davi (ditado por voz). Reescreva como uma mensagem pronta para ele mandar no WhatsApp para outra pessoa ou grupo:\n\
- português do Brasil, primeira pessoa (quem fala é o Davi), tom amigável, natural e direto, como ele falaria;\n\
- organizada: parágrafos curtos; se houver vários pontos, pedidos ou passos, use uma lista com •; *negrito* do WhatsApp só se ajudar muito;\n\
- tire vícios de fala (né, tipo, é…, então assim) e repetições; corrija erros óbvios de transcrição;\n\
- mantenha o chamamento e a saudação que ele disse (ex.: \"Pessoal,\", \"Fala, Matheus\");\n\
- NÃO invente nada, NÃO tire informação, NÃO responda à mensagem, NÃO acrescente saudação nem despedida que ele não disse;\n\
- se a fala for curta e simples, devolva só uma frase limpa.\n\
Responda SOMENTE com a mensagem final, sem comentários." } }
const PEDIDO: &str = concat!(INSTRUCAO_ORGANIZAR!(), "\n\nTRANSCRIÇÃO:\n");


/// Claude rápido, sem ferramentas, MCP, comandos nem ajustes do usuário (~2–4 s para abrir em
/// vez de ~8 s). None se não deu.
fn claude_rapido_bloqueante(prompt: &str, modelo: &str) -> Option<String> {
    claude_bloqueante(prompt, modelo, false)
}

/// `web`: libera só a pesquisa na internet (WebSearch/WebFetch), com mais voltas.
fn claude_bloqueante(prompt: &str, modelo: &str, web: bool) -> Option<String> {
    let bin = claude_bin()?;
    let (ferramentas, turnos) = if web { ("WebSearch,WebFetch", "15") } else { ("", "1") };
    let mut cmd = Command::new(bin);
    cmd.args(["-p", prompt, "--model", modelo, "--output-format", "text", "--max-turns", turnos,
               "--strict-mcp-config", "--mcp-config", "{\"mcpServers\":{}}", "--tools", ferramentas, "--disable-slash-commands",
               "--setting-sources", "", "--no-session-persistence"]);
    if web {
        cmd.args(["--allowedTools", "WebSearch", "WebFetch"]);
    }
    let saida = cmd
        .current_dir(std::env::temp_dir()) // pasta neutra: sem CLAUDE.md de projeto
        .stdin(Stdio::null())
        .output()
        .ok()?;
    let texto = String::from_utf8_lossy(&saida.stdout).trim().to_string();
    (saida.status.success() && !texto.is_empty()).then_some(texto)
}

// ---------------------------------------------------------------- Claude pré-aberto
// 19/10 (Davi: "quero bem rápido"): abrir o Claude leva ~2–3 s. Ele já abre quando o Davi aperta
// o ⌘ (instrução curta própria, sem o manual do Claude Code) e fica esperando a transcrição;
// ao soltar, só falta a resposta. Vale por 90 s; o próximo aperto troca por um novo.
struct ClaudeQuente {
    filho: std::process::Child,
    criado: Instant,
}
static QUENTE: std::sync::Mutex<Option<ClaudeQuente>> = std::sync::Mutex::new(None);

fn largar(q: Option<ClaudeQuente>) {
    if let Some(mut q) = q {
        let _ = q.filho.kill();
        let _ = q.filho.wait();
    }
}

pub fn preaquecer_claude() {
    std::thread::spawn(|| {
        let Some(bin) = claude_bin() else { return };
        let filho = Command::new(bin)
            .args(["-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--model", "haiku",
                   "--system-prompt", INSTRUCAO_ORGANIZAR!(), "--tools", "", "--strict-mcp-config", "--mcp-config", "{\"mcpServers\":{}}",
                   "--disable-slash-commands", "--setting-sources", "", "--no-session-persistence", "--max-turns", "1"])
            .current_dir(std::env::temp_dir())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn();
        if let Ok(filho) = filho {
            let antigo = QUENTE.lock().unwrap_or_else(|e| e.into_inner()).replace(ClaudeQuente { filho, criado: Instant::now() });
            largar(antigo);
        }
    });
}

/// Usa o Claude pré-aberto (se ainda está vivo e é recente). None = não tinha.
fn organizar_no_quente(texto: &str) -> Option<String> {
    use std::io::{BufRead, Write};
    let mut q = QUENTE.lock().unwrap_or_else(|e| e.into_inner()).take()?;
    if q.criado.elapsed() > Duration::from_secs(90) || !matches!(q.filho.try_wait(), Ok(None)) {
        largar(Some(q));
        return None;
    }
    let mensagem = serde_json::json!({ "type": "user", "message": { "role": "user", "content": texto } }).to_string();
    {
        let mut entrada = q.filho.stdin.take()?;
        entrada.write_all(format!("{mensagem}\n").as_bytes()).ok()?;
    } // fecha a entrada: é a única mensagem
    let saida = q.filho.stdout.take()?;
    let mut resultado = None;
    for linha in std::io::BufReader::new(saida).lines().map_while(Result::ok) {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&linha) {
            if v.get("type").and_then(|t| t.as_str()) == Some("result") {
                resultado = v.get("result").and_then(|r| r.as_str()).map(|r| r.trim().to_string()).filter(|r| !r.is_empty());
                break;
            }
        }
    }
    largar(Some(q));
    resultado
}

/// Organiza a fala transcrita (Claude, modelo rápido). Se der errado, devolve a fala como veio.
#[tauri::command]
pub async fn ditado_organizar(texto: String) -> Result<String, String> {
    let texto = texto.trim().to_string();
    if texto.is_empty() {
        return Ok(texto);
    }
    let original = texto.clone();
    let resultado = tauri::async_runtime::spawn_blocking(move || {
        organizar_no_quente(&texto).or_else(|| claude_rapido_bloqueante(&format!("{PEDIDO}{texto}"), "haiku"))
    })
        .await
        .map_err(|e| e.to_string())?;
    Ok(resultado.unwrap_or(original))
}

/// Pesquisa na internet com o Claude (Radar de virais: achar vídeos que viralizaram no
/// Instagram/TikTok). Leva ~30 s.
#[tauri::command]
pub async fn claude_pesquisa(pedido: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || claude_bloqueante(&pedido, "sonnet", true))
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "A pesquisa não respondeu.".to_string())
}

/// Pedido livre ao Claude rápido, a partir do app (ex.: análise de um vídeo de referência
/// no documento, ⌘H). `modelo`: "haiku" (padrão) ou "sonnet".
#[tauri::command]
pub async fn claude_rapido(pedido: String, modelo: Option<String>) -> Result<String, String> {
    let modelo = match modelo.as_deref() { Some("sonnet") => "sonnet", _ => "haiku" }.to_string();
    tauri::async_runtime::spawn_blocking(move || claude_rapido_bloqueante(&pedido, &modelo))
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "O Claude não respondeu.".to_string())
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
    SURDO_ATE.store(agora_ms() + 2500, std::sync::atomic::Ordering::Relaxed);
    unsafe {
        let fonte = CGEventSourceCreate(PRIVADO);
        for apertada in [true, false] {
            let ev = CGEventCreateKeyboardEvent(fonte as *const _, TECLA_V, apertada);
            if ev.is_null() {
                return Ok(false);
            }
            CGEventSetFlags(ev, CMD);
            CGEventPost(1, ev); // kCGSessionEventTap: entra na sessão sem passar pelo estado do teclado (HID)
            CFRelease(ev);
        }
        if !fonte.is_null() {
            CFRelease(fonte);
        }
    }
    Ok(true)
}
