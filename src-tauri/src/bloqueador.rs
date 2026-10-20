//! Bloqueador (20/10, pedido do Davi): enquanto ligado, a cada ~1 s olha o app da frente.
//! - App da lista (nome ou bundle id) → esconde na hora (NSRunningApplication.hide, não fecha:
//!   nada se perde) e avisa o front ("bloqueio").
//! - Chrome/Safari na frente → lê a URL da aba (AppleScript; o Mac pede a permissão de
//!   Automação uma vez) e, se o site estiver na lista, troca a aba por uma página "bloqueado".
//! Quem decide QUANDO ligar (manual, cronômetro, motivo para desligar) é o TS (useBloqueador).
use serde::Serialize;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

#[derive(Clone, Default)]
struct Regras {
    apps: Vec<String>,
    sites: Vec<String>,
    ate: String,
}

#[derive(Default)]
pub struct BloqueadorState {
    regras: Arc<Mutex<Option<Regras>>>,
}

#[derive(Clone, Serialize)]
struct Bloqueio {
    alvo: String,
    tipo: &'static str,
}

const NAVEGADORES: [(&str, &str); 2] = [
    ("com.google.Chrome", "tell application \"Google Chrome\" to get URL of active tab of front window"),
    ("com.apple.Safari", "tell application \"Safari\" to get URL of current tab of front window"),
];

fn simples(s: &str) -> String {
    s.trim().to_lowercase()
}

fn host_bate(url: &str, sites: &[String]) -> Option<String> {
    let resto = url.split("://").nth(1)?;
    let host = simples(resto.split(['/', '?', '#', ':']).next()?);
    let host = host.trim_start_matches("www.");
    sites.iter().find(|s| {
        let s = simples(s);
        let s = s.trim_start_matches("https://").trim_start_matches("http://").trim_start_matches("www.");
        let s = s.split(['/', '?', '#']).next().unwrap_or("");
        !s.is_empty() && (host == s || host.ends_with(&format!(".{s}")))
    }).cloned()
}

fn osascript(script: &str) -> Option<String> {
    let out = std::process::Command::new("osascript").arg("-e").arg(script).output().ok()?;
    out.status.success().then(|| String::from_utf8_lossy(&out.stdout).trim().to_string())
}

fn pagina_bloqueada(site: &str, ate: &str) -> String {
    let html = format!(
        "<html><head><meta charset='utf-8'><title>Bloqueado</title></head><body style='margin:0;height:100vh;display:flex;\
         align-items:center;justify-content:center;background:#0d1620;color:#fff;font-family:-apple-system,sans-serif'>\
         <div style='text-align:center'><div style='font-size:56px'>🔒</div><h1 style='font-weight:700;margin:12px 0 4px'>{site} está bloqueado</h1>\
         <p style='color:#9fb3c8'>Foco {ate}. Para liberar antes, desligue o bloqueador no Infopro e diga o motivo.</p></div></body></html>"
    );
    let codificado: String = html.bytes().map(|b| match b {
        b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
        _ => format!("%{b:02X}"),
    }).collect();
    format!("data:text/html;charset=utf-8,{codificado}")
}

#[tauri::command]
pub fn bloqueador_ligar(app: AppHandle, state: State<BloqueadorState>, apps: Vec<String>, sites: Vec<String>, ate: String) {
    let ja_ligado = state.regras.lock().map(|r| r.is_some()).unwrap_or(false);
    if let Ok(mut r) = state.regras.lock() {
        *r = Some(Regras { apps: apps.iter().map(|a| simples(a)).collect(), sites, ate });
    }
    if ja_ligado {
        return; // só trocou as listas: a thread já está rodando
    }
    let regras = state.regras.clone();
    std::thread::spawn(move || loop {
        let Some(atual) = regras.lock().ok().and_then(|r| r.clone()) else { break };
        let (tx, rx) = std::sync::mpsc::channel();
        let apps = atual.apps.clone();
        // AppKit só na main thread: pega o app da frente e, se for da lista, esconde.
        let _ = app.run_on_main_thread(move || {
            use objc2_app_kit::NSWorkspace;
            let ws = NSWorkspace::sharedWorkspace();
            let Some(frente) = ws.frontmostApplication() else { let _ = tx.send((None, None)); return };
            let nome = frente.localizedName().map(|s| s.to_string());
            let bundle = frente.bundleIdentifier().map(|s| s.to_string());
            let bate = [&nome, &bundle].iter().any(|v| v.as_deref().map(|v| apps.contains(&simples(v))).unwrap_or(false));
            if bate && bundle.as_deref() != Some("com.infoprohub.desktop") {
                frente.hide();
                let _ = tx.send((Some(nome.unwrap_or_default()), None));
            } else {
                let _ = tx.send((None, bundle));
            }
        });
        if let Ok((escondido, bundle)) = rx.recv_timeout(Duration::from_secs(2)) {
            if let Some(alvo) = escondido {
                let _ = app.emit("bloqueio", Bloqueio { alvo, tipo: "app" });
                std::thread::sleep(Duration::from_millis(1500));
            } else if let Some(b) = bundle {
                if !atual.sites.is_empty() {
                    if let Some((_, script)) = NAVEGADORES.iter().find(|(id, _)| *id == b) {
                        if let Some(site) = osascript(script).and_then(|url| host_bate(&url, &atual.sites)) {
                            let destino = pagina_bloqueada(&site, &atual.ate);
                            let trocar = script.replace("get URL of", "set URL of").replace(" window", &format!(" window to \"{destino}\""));
                            let _ = osascript(&trocar);
                            let _ = app.emit("bloqueio", Bloqueio { alvo: site, tipo: "site" });
                        }
                    }
                }
            }
        }
        std::thread::sleep(Duration::from_millis(900));
    });
}

#[tauri::command]
pub fn bloqueador_desligar(state: State<BloqueadorState>) {
    if let Ok(mut r) = state.regras.lock() {
        *r = None;
    }
}

#[cfg(test)]
mod testes {
    use super::host_bate;
    #[test]
    fn sites() {
        let s = vec!["instagram.com".to_string(), "https://www.youtube.com/".to_string()];
        assert_eq!(host_bate("https://www.instagram.com/reels/x", &s).as_deref(), Some("instagram.com"));
        assert!(host_bate("https://m.youtube.com/watch?v=1", &s).is_some());
        assert!(host_bate("https://notinstagram.com/", &s).is_none());
        assert!(host_bate("https://google.com/search?q=instagram.com", &s).is_none());
    }
}
