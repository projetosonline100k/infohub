use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, RunEvent, WindowEvent,
};
use tauri_plugin_autostart::MacosLauncher;

mod janelas;
#[cfg(target_os = "macos")]
mod active_window;
#[cfg(target_os = "macos")]
mod focus_monitor;
#[cfg(target_os = "macos")]
mod global_shortcut;
#[cfg(target_os = "macos")]
mod mac_sleep;
#[cfg(target_os = "macos")]
mod saude;
#[cfg(target_os = "macos")]
mod lembretes;
#[cfg(target_os = "macos")]
mod voz;
#[cfg(target_os = "macos")]
mod creator;
#[cfg(target_os = "macos")]
mod whatsapp;
mod midia_local;
#[cfg(target_os = "macos")]
mod danilo;
#[cfg(target_os = "macos")]
mod ditado;
#[cfg(target_os = "macos")]
mod escrita;
#[cfg(target_os = "macos")]
mod bloqueador;
#[cfg(target_os = "macos")]
mod foco;
// Navegador dentro das guias (⌘T, 27/10).
mod navegador;
#[cfg(target_os = "macos")]
mod janelas_ao_lado;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        // Lembra tamanho/posição da janela `main` entre reinícios. `jarvis`
        // fica de fora (with_denylist) — o tamanho dela é sempre controlado
        // por src/lib/desktop/window.ts (closed/bubble/open); se o plugin
        // restaurasse um tamanho de painel de uma sessão anterior, a janela
        // nasceria grande antes do React montar, aparecendo como um
        // "quadrado" atrás da orbe (rodada 4, item 1).
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_window_state::Builder::default().with_denylist(&["jarvis"]).build())
        // Registrado desligado por padrão — nenhuma UI liga isso ainda,
        // ver src/lib/desktop/autostart.ts.
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // Abre links externos (post do Instagram, evento no Google, etc.) no
        // navegador padrão — window.open não faz nada no app desktop.
        .plugin(tauri_plugin_opener::init());

    // FocusActivityMonitor (item 3, rodada 3) + Encerrar o dia (atalho
    // global e repouso do Mac) — só macOS por enquanto.
    #[cfg(target_os = "macos")]
    let builder = builder
        .manage(focus_monitor::FocusMonitorState::default())
        .manage(bloqueador::BloqueadorState::default())
        .manage(foco::FocoState::default())
        .manage(voz::VozState::default())
        .manage(creator::CreatorState::default())
        .invoke_handler(tauri::generate_handler![
            focus_monitor::start_focus_monitor,
            bloqueador::bloqueador_ligar,
            foco::foco_sites_ligar,
            foco::foco_sites_desligar,
            foco::foco_lateral_abrir,
            foco::foco_lateral_fechar,
            foco::foco_tela_cheia,
            foco::foco_encostar,
            navegador::navegador_abrir,
            navegador::navegador_posicionar,
            navegador::navegador_esconder,
            navegador::navegador_ir,
            navegador::navegador_acao,
            navegador::navegador_fechar,
            navegador::navegador_selecionar_tudo,
            foco::rodar_atalho,
            bloqueador::bloqueador_desligar,
            focus_monitor::stop_focus_monitor,
            focus_monitor::check_accessibility_trusted,
            focus_monitor::open_accessibility_settings,
            global_shortcut::atalho_encerrar_dia_registrado,
            mac_sleep::dormir_mac,
            saude::saude_pc,
            lembretes::lembretes_criar_lote,
            lembretes::lembrete_atualizar_dados,
            lembretes::lembrete_remover,
            lembretes::lembrete_atualizar,
            lembretes::lembrete_desligar,
            lembretes::lembrete_marcar,
            lembretes::lembretes_sincronizar,
            janelas::destacar_aba,
            janelas::mostrar_aviso,
            janelas::abrir_notas,
            janelas::abrir_agenda,
            janelas::ler_imagem_solta,
            voz::voz_falar,
            voz::voz_parar,
            voz::voz_listar,
            voz::voz_gerar,
            creator::creator_transcrever,
            creator::voz_transcrever,
            whatsapp::whatsapp_enviar,
            whatsapp::whatsapp_enviar_audio,
            whatsapp::whatsapp_enviar_arquivo,
            whatsapp::whatsapp_reagir,
            whatsapp::whatsapp_participantes,
            whatsapp::whatsapp_encaminhar,
            whatsapp::whatsapp_apagar,
            whatsapp::whatsapp_editar,
            whatsapp::whatsapp_midia_base,
            midia_local::ler_midia_local,
            midia_local::salvar_anexo_lauro,
            midia_local::lauro_controle_parar,
            midia_local::lauro_controle_estado,
            whatsapp::whatsapp_conexao,
            whatsapp::whatsapp_qr,
            danilo::danilo_base,
            ditado::ditado_organizar,
            creator::voz_aquecer,
            creator::voz_transcrever_trechos,
            ditado::ditado_colar,
            ditado::ditado_registrar,
            ditado::claude_rapido,
            ditado::claude_pesquisa,
            escrita::claude_escrever,
            escrita::claude_escrever_parar,
        ]);
    // Fora do macOS só existe o comando de destacar aba.
    #[cfg(not(target_os = "macos"))]
    let builder = builder.invoke_handler(tauri::generate_handler![janelas::destacar_aba]);

    builder
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // ⌘+Shift+E — registra o atalho global e guarda se deu certo
            // (item 15: se outro app já tiver essa combinação, não pode
            // quebrar o app, só avisar em Administração → Jarvis → Atalhos).
            #[cfg(target_os = "macos")]
            {
                let estado_atalho = global_shortcut::registrar(&app.handle().clone());
                app.manage(estado_atalho);
            }

            // Ditado: segurar ⌥ (Option) sozinho = o Atlas escuta e cola o texto organizado (ditado.rs).
            #[cfg(target_os = "macos")]
            ditado::iniciar(app.handle().clone());

            // Menu do app (macOS) próprio: igual ao padrão, mas "Desfazer" e
            // "Refazer" avisam o Infopro (evento "menu-desfazer"/"menu-refazer")
            // em vez de irem direto pro WebKit. Assim o ⌘Z funciona também no
            // editor de vídeo; em campo de texto, o front desfaz o texto.
            #[cfg(target_os = "macos")]
            {
                use tauri::menu::{PredefinedMenuItem, Submenu};
                let h = app.handle();
                let app_menu = Submenu::with_items(h, "Infopro Hub", true, &[
                    &PredefinedMenuItem::about(h, None, None)?,
                    &PredefinedMenuItem::separator(h)?,
                    // Sem ⌘H (18/10): no documento, ⌘H abre o banco de vídeos virais. "Ocultar" segue no menu.
                    &MenuItem::with_id(h, "menu-ocultar", "Ocultar Infopro Hub", true, None::<&str>)?,
                    &PredefinedMenuItem::hide_others(h, None)?,
                    &PredefinedMenuItem::separator(h)?,
                    &PredefinedMenuItem::quit(h, None)?,
                ])?;
                let editar = Submenu::with_items(h, "Editar", true, &[
                    &MenuItem::with_id(h, "menu-desfazer", "Desfazer", true, Some("CmdOrCtrl+Z"))?,
                    &MenuItem::with_id(h, "menu-refazer", "Refazer", true, Some("CmdOrCtrl+Shift+Z"))?,
                    &PredefinedMenuItem::separator(h)?,
                    &PredefinedMenuItem::cut(h, None)?,
                    &PredefinedMenuItem::copy(h, None)?,
                    &PredefinedMenuItem::paste(h, None)?,
                    // ⌘A tratado pelo app (27/10, Davi: "aperto ⌘A e não vejo as coisas selecionadas"): com os
                    // navegadores das guias na janela, o "Selecionar tudo" do sistema não chegava na página.
                    &MenuItem::with_id(h, "menu-selecionar-tudo", "Selecionar tudo", true, Some("CmdOrCtrl+A"))?,
                ])?;
                // ⌘1…⌘9 pelo menu (27/10): com os navegadores das guias na janela, os atalhos com ⌘ que não estão
                // no menu não chegavam mais na página. ⌘9 = última guia.
                let guias: Vec<MenuItem<_>> = (1..=9)
                    .map(|n| MenuItem::with_id(h, format!("menu-guia-{n}"), if n == 9 { "Última guia".to_string() } else { format!("Guia {n}") }, true, Some(format!("CmdOrCtrl+{n}").as_str())))
                    .collect::<Result<_, _>>()?;
                let ir_para_guia = Submenu::with_items(h, "Ir para a guia", true, &guias.iter().map(|m| m as &dyn tauri::menu::IsMenuItem<_>).collect::<Vec<_>>())?;
                let janela = Submenu::with_items(h, "Janela", true, &[
                    &PredefinedMenuItem::minimize(h, None)?,
                    &PredefinedMenuItem::fullscreen(h, None)?,
                    // ⌘W fecha a guia aberta, como no navegador (26/10); nas outras janelas fecha a janela.
                    &MenuItem::with_id(h, "menu-fechar-guia", "Fechar guia", true, Some("CmdOrCtrl+W"))?,
                    // ⌘T pelo menu (27/10): funciona mesmo com o navegador de uma guia em foco.
                    &MenuItem::with_id(h, "menu-nova-guia", "Nova guia", true, Some("CmdOrCtrl+T"))?,
                    // ⌘⇧E encolhe as pastas da lateral (27/10; era o atalho global do "Encerrar o dia").
                    &MenuItem::with_id(h, "recolher-lateral", "Encolher a lateral", true, Some("CmdOrCtrl+Shift+E"))?,
                    &ir_para_guia,
                    // ⌘⇧R recarrega a janela (28/10, Davi). O ⌘R da página não chega com os sites nas guias, e
                    // no editor de vídeo ele é outra coisa.
                    &MenuItem::with_id(h, "menu-recarregar", "Recarregar", true, Some("CmdOrCtrl+Shift+R"))?,
                ])?;
                app.set_menu(Menu::with_items(h, &[&app_menu, &editar, &janela])?)?;
                app.on_menu_event(|app, event| {
                    let id = event.id.as_ref();
                    if id == "menu-ocultar" {
                        let _ = app.hide();
                        return;
                    }
                    if let Some(n) = id.strip_prefix("menu-guia-").and_then(|n| n.parse::<u8>().ok()) {
                        let _ = tauri::Emitter::emit_to(app, "main", "menu-guia", n);
                        return;
                    }
                    if id == "menu-recarregar" {
                        for (_, w) in app.webview_windows() {
                            if janela_com_teclado(&w) { let _ = w.reload(); }
                        }
                        return;
                    }
                    if id == "menu-selecionar-tudo" {
                        // Cada janela vê se é ela que está com o teclado (desfazer.ts).
                        let _ = tauri::Emitter::emit(app, id, ());
                        return;
                    }
                    if id == "menu-nova-guia" || id == "recolher-lateral" {
                        let _ = tauri::Emitter::emit_to(app, "main", id, ());
                        return;
                    }
                    if id == "menu-fechar-guia" {
                        for (_, w) in app.webview_windows() {
                            if janela_com_teclado(&w) {
                                if w.label() == "main" { let _ = tauri::Emitter::emit_to(app, "main", id, ()); }
                                else { let _ = w.close(); }
                            }
                        }
                        return;
                    }
                    if id == "menu-desfazer" || id == "menu-refazer" {
                        // Vai pra janela em foco (principal ou Jarvis).
                        for (_, w) in app.webview_windows() {
                            if janela_com_teclado(&w) {
                                let _ = tauri::Emitter::emit_to(app, w.label(), id, ());
                            }
                        }
                    }
                });
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
        .run(|app_handle, event| {
            // Cobre Cmd+Q / "sair" do menu do sistema: sem isso o app
            // encerraria mesmo com a janela principal só escondida.
            match event {
                RunEvent::ExitRequested { api, .. } => api.prevent_exit(),
                // Clicar no ícone do Dock traz a janela principal de volta (ela só
                // fica escondida quando o Davi fecha; 15/10 parecia que o app "não abria").
                #[cfg(target_os = "macos")]
                RunEvent::Reopen { .. } => {
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                    }
                }
                _ => {}
            }
        });
}

/// A janela que o Mac considera ativa (28/10). `is_focused()` dava falso com o teclado num site aberto numa
/// guia (navegador.rs) — o ⌘W não fechava a guia.
fn janela_com_teclado(w: &tauri::WebviewWindow) -> bool {
    #[cfg(target_os = "macos")]
    {
        let Ok(ptr) = w.ns_window() else { return false };
        unsafe {
            let janela: &objc2::runtime::AnyObject = &*(ptr as *const objc2::runtime::AnyObject);
            objc2::msg_send![janela, isKeyWindow]
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        w.is_focused().unwrap_or(false)
    }
}
