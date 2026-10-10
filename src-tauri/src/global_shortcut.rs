//! Atalho global ⌘+Shift+E ("Encerrar o dia", itens 1 e 15 do pedido).
//!
//! Registrado UMA vez aqui no setup do app (não em cada janela — main e
//! jarvis são o mesmo processo), via o plugin oficial
//! `tauri-plugin-global-shortcut`. O handler só mexe na janela `jarvis`
//! (mostrar/focar/emitir evento pro React dela abrir o fluxo) — se o painel
//! já estiver aberto, `show()`/`set_focus()` são no-ops inofensivos e só o
//! evento importa, o que já satisfaz sozinho "se já estiver aberto, só
//! navegar" sem precisar checar visibilidade antes.
//!
//! ATENÇÃO: este arquivo não pôde ser compilado neste ambiente (sem
//! toolchain Rust disponível) — foi escrito com cuidado a partir da API
//! pública conhecida do plugin, mas é o ponto de maior risco de precisar de
//! um pequeno ajuste de assinatura no primeiro `cargo build`/`tauri dev`
//! real. Se der erro de compilação aqui, cole a mensagem de volta.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

pub const EVENTO_ABRIR_ENCERRAR_DIA: &str = "abrir-encerrar-dia";
/// ⌘+J: age ao SOLTAR (pedido do Davi). Apertou → só foca o Jarvis (pra ele
/// ouvir um C, que com ⌘ ainda pressionado vira ⌘+J+C = modo Creator);
/// soltou → o React decide: Conversa, ou Creator se o C veio no meio.
pub const EVENTO_ATALHO_J_APERTADO: &str = "atalho-j-apertado";
pub const EVENTO_ATALHO_J_SOLTO: &str = "atalho-j-solto";

/// Guarda se o registro do atalho deu certo, pra Administração → Jarvis →
/// Atalhos poder avisar "não pôde ser registrado" (item 15) em vez de o app
/// falhar em silêncio ou quebrar.
#[derive(Default, Clone)]
pub struct AtalhoEncerrarDiaState(pub Arc<AtomicBool>);

fn mostrar_e_focar_jarvis(app: &AppHandle, evento: &str) {
    if let Some(jarvis) = app.get_webview_window("jarvis") {
        let _ = jarvis.show();
        let _ = jarvis.set_focus();
        // always_on_top já nasce true (tauri.conf.json) e nunca é reafirmado
        // em nenhum outro lugar do app — reforçar aqui é barato e evita
        // qualquer chance de a janela vir atrás de outro app no primeiro
        // acionamento do atalho.
        let _ = jarvis.set_always_on_top(true);
        let _ = jarvis.emit(evento, ());
    }
}

/// Chamado uma vez no setup() de lib.rs. Retorna o estado compartilhado
/// (pra registrar via `.manage()`) já preenchido com o resultado do
/// registro.
pub fn registrar(app: &AppHandle) -> AtalhoEncerrarDiaState {
    let state = AtalhoEncerrarDiaState::default();
    let flag = state.0.clone();
    let app_para_handler = app.clone();
    let atalho = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyE);
    let atalho_conversa = Shortcut::new(Some(Modifiers::SUPER), Code::KeyJ);

    let plugin_ok = app.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(move |_app, recebido, event| {
                let apertou = event.state() == ShortcutState::Pressed;
                if recebido == &atalho && apertou {
                    mostrar_e_focar_jarvis(&app_para_handler, EVENTO_ABRIR_ENCERRAR_DIA);
                } else if recebido == &atalho_conversa {
                    let evento = if apertou { EVENTO_ATALHO_J_APERTADO } else { EVENTO_ATALHO_J_SOLTO };
                    mostrar_e_focar_jarvis(&app_para_handler, evento);
                }
            })
            .build(),
    );

    if plugin_ok.is_ok() {
        let registrou = app
            .global_shortcut()
            .register(Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyE))
            .is_ok();
        flag.store(registrou, Ordering::SeqCst);
        // ⌘+J é independente: se outro app já usar, só esse atalho falha.
        let _ = app.global_shortcut().register(Shortcut::new(Some(Modifiers::SUPER), Code::KeyJ));
    }

    state
}

#[tauri::command]
pub fn atalho_encerrar_dia_registrado(state: tauri::State<AtalhoEncerrarDiaState>) -> bool {
    state.0.load(Ordering::SeqCst)
}
