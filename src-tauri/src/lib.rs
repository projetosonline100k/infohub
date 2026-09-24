use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, RunEvent, WindowEvent,
};
use tauri_plugin_autostart::MacosLauncher;

#[cfg(target_os = "macos")]
mod active_window;
#[cfg(target_os = "macos")]
mod focus_monitor;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        // Lembra tamanho/posição da janela `main` entre reinícios. `jarvis`
        // fica de fora (with_denylist) — o tamanho dela é sempre controlado
        // por src/lib/desktop/window.ts (closed/bubble/open); se o plugin
        // restaurasse um tamanho de painel de uma sessão anterior, a janela
        // nasceria grande antes do React montar, aparecendo como um
        // "quadrado" atrás da orbe (rodada 4, item 1).
        .plugin(tauri_plugin_window_state::Builder::default().with_denylist(&["jarvis"]).build())
        // Registrado desligado por padrão — nenhuma UI liga isso ainda,
        // ver src/lib/desktop/autostart.ts.
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());

    // FocusActivityMonitor (item 3, rodada 3) — só macOS por enquanto.
    #[cfg(target_os = "macos")]
    let builder = builder
        .manage(focus_monitor::FocusMonitorState::default())
        .invoke_handler(tauri::generate_handler![
            focus_monitor::start_focus_monitor,
            focus_monitor::stop_focus_monitor,
            focus_monitor::check_accessibility_trusted,
            focus_monitor::open_accessibility_settings,
        ]);

    builder
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Tray (seção 6): "Abrir" reexibe a janela principal (fechar
            // ela só esconde, ver on_window_event abaixo); "Sair" é o
            // único caminho que realmente encerra o processo.
            let abrir = MenuItem::with_id(app, "abrir", "Abrir Infopro Hub", true, None::<&str>)?;
            let sair = MenuItem::with_id(app, "sair", "Sair do Infopro Hub", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&abrir, &sair])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(true)
                .tooltip("Infopro Hub")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "abrir" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "sair" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            // Fechar a janela principal não mata o app (seção 6): só
            // esconde, pro Jarvis continuar ativo. Sair de verdade só pelo
            // item "Sair do Infopro Hub" do tray (handler acima).
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            // Cobre Cmd+Q / "sair" do menu do sistema: sem isso o app
            // encerraria mesmo com a janela principal só escondida.
            if let RunEvent::ExitRequested { api, .. } = event {
                api.prevent_exit();
            }
        });
}
