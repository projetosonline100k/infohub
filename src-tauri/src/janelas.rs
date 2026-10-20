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
    // Guias na barra de título, como a janela principal (tauri.conf.json, 18/10).
    #[cfg(target_os = "macos")]
    {
        janela = janela
            .title_bar_style(tauri::TitleBarStyle::Overlay)
            .hidden_title(true)
            .traffic_light_position(tauri::LogicalPosition::new(16.0, 24.0));
    }
    if let (Some(x), Some(y)) = (x, y) {
        janela = janela.position(x, y);
    }
    janela.build().map(|_| ()).map_err(|erro| {
        log::error!("destacar_aba falhou: {erro}");
        erro.to_string()
    })
}


// Aviso do Atlas no canto de cima da tela (20/10: "notificação mais bonita, com o símbolo
// do Infopro e do Atlas; WhatsApp verde"): janelinha transparente, sem foco, acima de tudo.
// `vaga` empilha vários avisos um embaixo do outro. A página /aviso desenha e se fecha sozinha.
pub const AVISO_LARGURA: f64 = 360.0;
pub const AVISO_ALTURA: f64 = 72.0;

#[tauri::command]
pub async fn mostrar_aviso(app: AppHandle, rota: String, vaga: u32) -> Result<(), String> {
    let rotulo = format!("aviso-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0));
    let (mut x, mut y) = (40.0, 40.0);
    if let Ok(Some(monitor)) = app.primary_monitor() {
        let escala = monitor.scale_factor();
        let area = monitor.work_area();
        let pos = area.position.to_logical::<f64>(escala);
        let tam = area.size.to_logical::<f64>(escala);
        x = pos.x + tam.width - AVISO_LARGURA - 8.0;
        y = pos.y + 8.0 + f64::from(vaga) * (AVISO_ALTURA - 6.0);
    }
    let mut janela = WebviewWindowBuilder::new(&app, &rotulo, WebviewUrl::App(rota.trim_start_matches('/').into()))
        .title("Atlas")
        .inner_size(AVISO_LARGURA, AVISO_ALTURA)
        .position(x, y)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible_on_all_workspaces(true)
        .focused(false);
    #[cfg(target_os = "macos")]
    {
        janela = janela.accept_first_mouse(true);
    }
    janela.build().map(|_| ()).map_err(|erro| {
        log::error!("mostrar_aviso falhou: {erro}");
        erro.to_string()
    })
}
