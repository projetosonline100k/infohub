//! Modo Foco total (27/10, Davi: "quero modo foco total mesmo"). Comandos que o app chama ao ligar/desligar:
//! - `foco_sites_ligar(permitidos)`: enquanto ligado, Chrome/Safari na frente com um site FORA da lista de
//!   trabalho troca a aba por uma página "fora do foco" (o mesmo jeito do Bloqueador, só que ao contrário);
//! - `foco_lateral_abrir/fechar`: a janelinha fina no canto da tela, sempre por cima, com o cronômetro;
//! - `foco_tela_cheia(ativo)`: a janela principal em tela cheia (o Mac abre uma área de trabalho só para ela);
//! - `rodar_atalho(nome)`: roda um atalho do app Atalhos (ex.: "Infopro Foco Ligar" põe o Não Perturbe).

use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};

use crate::bloqueador::{host_bate, osascript, NAVEGADORES};

#[derive(Default)]
pub struct FocoState {
    permitidos: Arc<Mutex<Option<Vec<String>>>>,
    /// Onde a janela principal estava antes de encostar no canto (posição e tamanho lógicos).
    antes_de_encostar: Mutex<Option<(f64, f64, f64, f64)>>,
}

/// Sempre liberados no foco: o próprio Infopro, login do Google e as páginas internas do navegador.
const SEMPRE: [&str; 6] = ["localhost", "127.0.0.1", "infopro-hub.vercel.app", "accounts.google.com", "claude.ai", "supabase.co"];

fn pagina_fora(host: &str, lista: &[String]) -> String {
    let itens: String = lista.iter().map(|s| format!("<li>{s}</li>")).collect();
    let html = format!(
        "<html><head><meta charset='utf-8'><title>Fora do foco</title></head><body style='margin:0;height:100vh;display:flex;\
         align-items:center;justify-content:center;background:#16305a;color:#fff;font-family:-apple-system,sans-serif'>\
         <div style='text-align:center;max-width:520px'><div style='font-size:56px'>🎯</div><h1 style='font-weight:700;margin:12px 0 4px'>{host} está fora do foco</h1>\
         <p style='color:#b9cbe6'>No Modo Foco só os sites de trabalho ficam abertos:</p><ul style='list-style:none;padding:0;color:#dfe9f7'>{itens}</ul>\
         <p style='color:#9fb3c8;font-size:13px'>Para liberar, desligue o foco total no Infopro.</p></div></body></html>"
    );
    let cod: String = html.bytes().map(|b| match b {
        b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
        _ => format!("%{b:02X}"),
    }).collect();
    format!("data:text/html;charset=utf-8,{cod}")
}

#[tauri::command]
pub fn foco_sites_ligar(app: AppHandle, state: State<FocoState>, permitidos: Vec<String>) {
    let ja = state.permitidos.lock().map(|p| p.is_some()).unwrap_or(false);
    if let Ok(mut p) = state.permitidos.lock() {
        *p = Some(permitidos);
    }
    if ja {
        return;
    }
    let lista = state.permitidos.clone();
    std::thread::spawn(move || loop {
        let Some(permitidos) = lista.lock().ok().and_then(|p| p.clone()) else { break };
        let (tx, rx) = std::sync::mpsc::channel();
        let _ = app.run_on_main_thread(move || {
            use objc2_app_kit::NSWorkspace;
            let b = NSWorkspace::sharedWorkspace().frontmostApplication().and_then(|f| f.bundleIdentifier()).map(|s| s.to_string());
            let _ = tx.send(b);
        });
        if let Ok(Some(bundle)) = rx.recv_timeout(Duration::from_secs(2)) {
            if let Some((_, script)) = NAVEGADORES.iter().find(|(id, _)| *id == bundle) {
                if let Some(url) = osascript(script) {
                    let web = url.starts_with("http://") || url.starts_with("https://");
                    let mut liberados: Vec<String> = permitidos.clone();
                    liberados.extend(SEMPRE.iter().map(|s| s.to_string()));
                    if web && !permitidos.is_empty() && host_bate(&url, &liberados).is_none() {
                        let host = url.split("://").nth(1).and_then(|r| r.split(['/', '?', '#', ':']).next()).unwrap_or("").trim_start_matches("www.").to_string();
                        let destino = pagina_fora(&host, &permitidos);
                        let trocar = script.replace("get URL of", "set URL of").replace(" window", &format!(" window to \"{destino}\""));
                        let _ = osascript(&trocar);
                    }
                }
            }
        }
        std::thread::sleep(Duration::from_millis(900));
    });
}

#[tauri::command]
pub fn foco_sites_desligar(state: State<FocoState>) {
    if let Ok(mut p) = state.permitidos.lock() {
        *p = None;
    }
}

#[tauri::command]
pub async fn foco_lateral_abrir(app: AppHandle) -> Result<(), String> {
    if let Some(j) = app.get_webview_window("foco-lateral") {
        let _ = j.show();
        return Ok(());
    }
    // Coluna no canto direito, da altura da tela (a principal fica ao lado: `foco_encostar`).
    let (mut largura, mut altura, mut x, mut y) = (LARGURA_COLUNA, 800.0, 40.0, 40.0);
    if let Some((pos, tam)) = area_da_tela(&app) {
        largura = LARGURA_COLUNA.min(tam.width);
        altura = tam.height;
        x = pos.x + tam.width - largura;
        y = pos.y;
    }
    let mut janela = WebviewWindowBuilder::new(&app, "foco-lateral", WebviewUrl::App("foco-lateral".into()))
        .title("Modo Foco")
        .inner_size(largura, altura)
        .position(x, y)
        .resizable(true)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .skip_taskbar(true)
        .focused(false);
    #[cfg(target_os = "macos")]
    {
        janela = janela.title_bar_style(tauri::TitleBarStyle::Overlay).hidden_title(true).accept_first_mouse(true);
    }
    janela.build().map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn foco_lateral_fechar(app: AppHandle) {
    if let Some(j) = app.get_webview_window("foco-lateral") {
        let _ = j.close();
    }
}

#[tauri::command]
pub fn foco_tela_cheia(app: AppHandle, ativo: bool) {
    if let Some(j) = app.get_webview_window("main") {
        let _ = j.set_fullscreen(ativo);
    }
}

/// Largura da coluna do Modo Foco no canto direito.
const LARGURA_COLUNA: f64 = 420.0;

fn area_da_tela(app: &AppHandle) -> Option<(tauri::LogicalPosition<f64>, tauri::LogicalSize<f64>)> {
    let principal = app.get_webview_window("main");
    let m = principal.and_then(|j| j.current_monitor().ok().flatten()).or_else(|| app.primary_monitor().ok().flatten())?;
    let e = m.scale_factor();
    let area = m.work_area();
    Some((area.position.to_logical::<f64>(e), area.size.to_logical::<f64>(e)))
}

/// Foco total (27/10, Davi: "quero que ele fique aberto na lateral e o Infopro na lateral"): a janela principal
/// ocupa a tela ao lado da coluna do Modo Foco (que fica no canto direito); ao sair volta para onde estava.
#[tauri::command]
pub fn foco_encostar(app: AppHandle, state: State<FocoState>, ativo: bool) {
    let Some(j) = app.get_webview_window("main") else { return };
    let escala = j.scale_factor().unwrap_or(1.0);
    if ativo {
        let mut antes = state.antes_de_encostar.lock().unwrap();
        if antes.is_none() {
            if let (Ok(p), Ok(t)) = (j.outer_position(), j.inner_size()) {
                let (p, t) = (p.to_logical::<f64>(escala), t.to_logical::<f64>(escala));
                *antes = Some((p.x, p.y, t.width, t.height));
            }
        }
        if let Some((pos, tam)) = area_da_tela(&app) {
            let _ = j.set_fullscreen(false);
            let _ = j.unmaximize();
            let _ = j.set_size(tauri::LogicalSize::new((tam.width - LARGURA_COLUNA).max(400.0), tam.height));
            let _ = j.set_position(tauri::LogicalPosition::new(pos.x, pos.y));
        }
    } else {
        if let Some((x, y, w, h)) = state.antes_de_encostar.lock().unwrap().take() {
            let _ = j.set_size(tauri::LogicalSize::new(w, h));
            let _ = j.set_position(tauri::LogicalPosition::new(x, y));
        } else {
            // Encostou antes de o app reiniciar (sem o lugar de antes guardado): volta a ocupar a tela.
            let _ = j.set_always_on_top(false);
            let _ = j.maximize();
        }
    }
}

/// Roda um atalho do app Atalhos pelo nome. Erro se o atalho não existe (o app mostra como criar).
#[tauri::command]
pub async fn rodar_atalho(nome: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let saida = std::process::Command::new("/usr/bin/shortcuts").args(["run", &nome]).output().map_err(|e| e.to_string())?;
        if saida.status.success() { Ok(()) } else { Err(String::from_utf8_lossy(&saida.stderr).trim().chars().take(200).collect()) }
    }).await.map_err(|e| e.to_string())?
}
