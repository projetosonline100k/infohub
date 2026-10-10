// Destacar uma aba do workspace numa janela própria (como o Chrome). Feito
// no Rust em vez do `new WebviewWindow` do JS: aqui o erro (se houver) vai
// pro log do terminal, e a janela nasce já na rota da aba.
use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
pub async fn destacar_aba(app: AppHandle, caminho: String, titulo: String, x: Option<f64>, y: Option<f64>) -> Result<(), String> {
    log::info!("destacar_aba: {caminho} em {x:?},{y:?}");
    let rota = caminho.trim_start_matches('/').to_string();
    let rotulo = format!("tab-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0));
    let mut janela = WebviewWindowBuilder::new(&app, &rotulo, WebviewUrl::App(rota.into()))
        .title(format!("Infopro Hub — {titulo}"))
        .inner_size(1280.0, 800.0)
        .min_inner_size(400.0, 450.0)
        .focused(true);
    if let (Some(x), Some(y)) = (x, y) {
        janela = janela.position(x, y);
    }
    janela.build().map(|_| ()).map_err(|erro| {
        log::error!("destacar_aba falhou: {erro}");
        erro.to_string()
    })
}

