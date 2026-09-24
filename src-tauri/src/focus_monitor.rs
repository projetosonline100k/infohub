//! FocusActivityMonitor (item 3 do refinamento) — só a parte nativa: liga/
//! desliga um loop que checa o app/janela ativa a cada ~7s (dentro da faixa
//! pedida de 5-10s) e emite um evento cru pro frontend. Toda classificação/
//! aprendizado/gravação no Supabase acontece em TS (ver
//! src/hooks/useFocusActivityMonitor.ts — "React não descobre o app ativo",
//! mas o resto da lógica de negócio já mora inteiramente lá).

use crate::active_window::{get_active_window_info, is_accessibility_trusted};
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, State};

const EVENTO_FOCUS_TICK: &str = "focus-tick";
const INTERVALO_SEGUNDOS: u64 = 7;

pub struct FocusMonitorState {
    ligado: Arc<AtomicBool>,
}

impl Default for FocusMonitorState {
    fn default() -> Self {
        Self { ligado: Arc::new(AtomicBool::new(false)) }
    }
}

#[derive(Clone, Serialize)]
struct FocusTickPayload {
    #[serde(rename = "appName")]
    app_name: Option<String>,
    #[serde(rename = "bundleId")]
    bundle_id: Option<String>,
    #[serde(rename = "windowTitle")]
    window_title: Option<String>,
    #[serde(rename = "timestampMs")]
    timestamp_ms: u128,
}

fn agora_ms() -> u128 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)
}

/// Liga o loop (no-op se já estiver ligado). `analisar_titulo` reflete a
/// preferência de privacidade "Analisar título da janela" — cada tick já
/// nasce respeitando ela, não é filtrado depois.
#[tauri::command]
pub fn start_focus_monitor(app: AppHandle, state: State<FocusMonitorState>, analisar_titulo: bool) {
    if state.ligado.swap(true, Ordering::SeqCst) {
        return;
    }
    let ligado = state.ligado.clone();
    std::thread::spawn(move || {
        while ligado.load(Ordering::SeqCst) {
            let app_para_thread = app.clone();
            let (tx, rx) = std::sync::mpsc::channel();
            // NSWorkspace/AppKit só pode ser chamado na main thread.
            let agendou = app_para_thread.run_on_main_thread(move || {
                let info = get_active_window_info(analisar_titulo);
                let _ = tx.send(info);
            });
            if agendou.is_ok() {
                if let Ok(info) = rx.recv_timeout(Duration::from_secs(2)) {
                    let payload = FocusTickPayload {
                        app_name: info.app_name,
                        bundle_id: info.bundle_id,
                        window_title: info.window_title,
                        timestamp_ms: agora_ms(),
                    };
                    let _ = app.emit(EVENTO_FOCUS_TICK, payload);
                }
            }
            std::thread::sleep(Duration::from_secs(INTERVALO_SEGUNDOS));
        }
    });
}

/// Desliga o loop — a thread sai sozinha na próxima verificação (até
/// ~7s de latência, aceitável: pausar/concluir/desligar não precisam de
/// corte instantâneo).
#[tauri::command]
pub fn stop_focus_monitor(state: State<FocusMonitorState>) {
    state.ligado.store(false, Ordering::SeqCst);
}

#[tauri::command]
pub fn check_accessibility_trusted() -> bool {
    is_accessibility_trusted()
}

/// Atalho pra Ajustes do Sistema → Privacidade e Segurança → Acessibilidade
/// — nunca contorna a permissão, só evita o usuário ter que procurar.
#[tauri::command]
pub fn open_accessibility_settings() {
    let _ = std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
        .spawn();
}
