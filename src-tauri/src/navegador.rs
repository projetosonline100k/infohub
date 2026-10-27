//! Navegador dentro das guias (27/10, Davi: "⌘T ... conseguir acessar a internet, normal, igual o Chrome").
//! Cada guia "/navegar" ganha um webview filho da janela principal (motor do Safari, cookies e logins
//! guardados como num navegador) desenhado por cima da área da página; a página React diz onde ele fica
//! (`navegador_abrir`/`navegador_posicionar`) e o esconde quando a guia sai da frente.
//! Eventos para a janela principal: "navegador-url", "navegador-titulo", "navegador-carregando" e
//! "navegador-nova-guia" (link que abriria outra janela vira guia nova).

use serde::Serialize;
use tauri::webview::{NewWindowResponse, PageLoadEvent};
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Url, WebviewBuilder, WebviewUrl};

const AGENTE: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

#[derive(Clone, Serialize)]
struct Aviso {
    rotulo: String,
    valor: String,
}

fn avisar(app: &AppHandle, evento: &str, rotulo: &str, valor: String) {
    let _ = app.emit_to("main", evento, Aviso { rotulo: rotulo.to_string(), valor });
}

fn endereco(url: &str) -> Result<Url, String> {
    url.parse::<Url>().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn navegador_abrir(app: AppHandle, rotulo: String, url: String, x: f64, y: f64, largura: f64, altura: f64) -> Result<(), String> {
    if let Some(w) = app.get_webview(&rotulo) {
        let _ = w.set_position(LogicalPosition::new(x, y));
        let _ = w.set_size(LogicalSize::new(largura, altura));
        let _ = w.show();
        return Ok(());
    }
    let janela = app.get_window("main").ok_or("janela principal não encontrada")?;
    let (a1, a2, a3, a4) = (app.clone(), app.clone(), app.clone(), app.clone());
    let (r1, r2, r3) = (rotulo.clone(), rotulo.clone(), rotulo.clone());
    let construtor = WebviewBuilder::new(&rotulo, WebviewUrl::External(endereco(&url)?))
        .user_agent(AGENTE)
        // O endereço vem sempre de `w.url()` (a página principal): o aviso de navegação também dispara para os
        // quadros internos (ex.: o YouTube carrega um de accounts.google.com) e trocava a barra por eles.
        .on_page_load(move |w, p| {
            avisar(&a2, "navegador-carregando", &r2, if matches!(p.event(), PageLoadEvent::Started) { "1" } else { "0" }.into());
            if let Ok(u) = w.url() { avisar(&a2, "navegador-url", &r2, u.to_string()); }
        })
        // Sites que trocam de página sem recarregar (YouTube, Gmail) mudam o título: confere o endereço junto.
        .on_document_title_changed(move |w, titulo| {
            if let Ok(u) = w.url() { avisar(&a1, "navegador-url", &r1, u.to_string()); }
            avisar(&a3, "navegador-titulo", &r3, titulo);
        })
        .on_new_window(move |u, _| {
            let _ = a4.emit_to("main", "navegador-nova-guia", u.to_string());
            NewWindowResponse::Deny
        });
    janela.add_child(construtor, LogicalPosition::new(x, y), LogicalSize::new(largura, altura)).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn navegador_posicionar(app: AppHandle, rotulo: String, x: f64, y: f64, largura: f64, altura: f64) {
    if let Some(w) = app.get_webview(&rotulo) {
        let _ = w.set_position(LogicalPosition::new(x, y));
        let _ = w.set_size(LogicalSize::new(largura, altura));
    }
}

#[tauri::command]
pub fn navegador_esconder(app: AppHandle, rotulo: String) {
    if let Some(w) = app.get_webview(&rotulo) {
        let _ = w.hide();
    }
}

#[tauri::command]
pub fn navegador_ir(app: AppHandle, rotulo: String, url: String) -> Result<(), String> {
    let w = app.get_webview(&rotulo).ok_or("guia sem navegador")?;
    w.navigate(endereco(&url)?).map_err(|e| e.to_string())
}

/// "voltar", "avancar" ou "recarregar".
#[tauri::command]
pub fn navegador_acao(app: AppHandle, rotulo: String, acao: String) {
    if let Some(w) = app.get_webview(&rotulo) {
        let _ = match acao.as_str() {
            "voltar" => w.eval("history.back()"),
            "avancar" => w.eval("history.forward()"),
            _ => w.reload(),
        };
    }
}

/// ⌘A com o teclado num site de uma guia: seleciona a página dele.
#[tauri::command]
pub fn navegador_selecionar_tudo(app: AppHandle) {
    for (rotulo, w) in app.webviews() {
        if rotulo.starts_with("navegador-") {
            let _ = w.eval("document.execCommand('selectAll')");
        }
    }
}

#[tauri::command]
pub fn navegador_fechar(app: AppHandle, rotulo: String) {
    if let Some(w) = app.get_webview(&rotulo) {
        let _ = w.close();
    }
}
