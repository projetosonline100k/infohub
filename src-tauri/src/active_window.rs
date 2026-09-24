//! ActiveWindowService (item 3 do refinamento) — descobre app/janela ativa
//! no macOS. Só isso: não sabe nada de Supabase, projeto, foco ou
//! classificação (isso vive inteiramente em TS, ver
//! src/hooks/useFocusActivityMonitor.ts).
//!
//! Nome do app: via NSWorkspace.frontmostApplication (AppKit) — não exige
//! NENHUMA permissão especial do macOS.
//!
//! Título da janela: via Accessibility API (AXUIElement), FFI direto contra
//! o framework ApplicationServices — só funciona com a permissão de
//! Accessibility concedida (checada antes via AXIsProcessTrusted(), nunca
//! contornada). Sem a permissão, volta `None` e quem chama segue só com o
//! nome do app.

use core_foundation::base::{CFRelease, CFTypeRef, TCFType};
use core_foundation::string::{CFString, CFStringRef};
use objc2_app_kit::NSWorkspace;
use std::ffi::c_void;
use std::os::raw::c_int;

#[repr(C)]
struct OpaqueAXUIElement(c_void);
type AXUIElementRef = *const OpaqueAXUIElement;
type AXError = c_int;
const AX_ERROR_SUCCESS: AXError = 0;

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXIsProcessTrusted() -> bool;
    fn AXUIElementCreateApplication(pid: c_int) -> AXUIElementRef;
    fn AXUIElementCopyAttributeValue(element: AXUIElementRef, attribute: CFStringRef, value: *mut CFTypeRef) -> AXError;
}

/// true se o app já tem permissão de Accessibility concedida pelo usuário
/// (Ajustes do Sistema → Privacidade e Segurança → Acessibilidade). Nunca
/// solicita/contorna — só lê o estado atual.
pub fn is_accessibility_trusted() -> bool {
    unsafe { AXIsProcessTrusted() }
}

/// Info da janela/app em foco agora. `window_title` só vem preenchido se a
/// Accessibility estiver concedida — senão fica `None` (fallback pedido:
/// "se não tiver permissão de título, ainda usar só o nome do app").
pub struct ActiveWindowInfo {
    pub app_name: Option<String>,
    pub bundle_id: Option<String>,
    pub window_title: Option<String>,
}

pub fn get_active_window_info(analisar_titulo: bool) -> ActiveWindowInfo {
    let workspace = NSWorkspace::sharedWorkspace();
    let Some(app) = workspace.frontmostApplication() else {
        return ActiveWindowInfo { app_name: None, bundle_id: None, window_title: None };
    };

    let app_name = app.localizedName().map(|s| s.to_string());
    let bundle_id = app.bundleIdentifier().map(|s| s.to_string());
    let pid = app.processIdentifier();

    let window_title = if analisar_titulo && is_accessibility_trusted() {
        unsafe { copy_focused_window_title(pid) }
    } else {
        None
    };

    ActiveWindowInfo { app_name, bundle_id, window_title }
}

/// SAFETY: só chamada quando AXIsProcessTrusted() já confirmou a permissão.
/// Cada AXUIElementCopyAttributeValue segue a "create rule" (devolve uma
/// referência +1 que É NOSSA de liberar) — CFRelease em cada uma antes de
/// sair, em qualquer caminho (sucesso ou erro).
unsafe fn copy_focused_window_title(pid: i32) -> Option<String> {
    let app_element = AXUIElementCreateApplication(pid);
    if app_element.is_null() {
        return None;
    }

    let resultado = (|| {
        let attr_focused = CFString::new("AXFocusedWindow");
        let mut window_value: CFTypeRef = std::ptr::null();
        let err = AXUIElementCopyAttributeValue(app_element, attr_focused.as_concrete_TypeRef(), &mut window_value);
        if err != AX_ERROR_SUCCESS || window_value.is_null() {
            return None;
        }
        let window_element = window_value as AXUIElementRef;

        let attr_title = CFString::new("AXTitle");
        let mut title_value: CFTypeRef = std::ptr::null();
        let err2 = AXUIElementCopyAttributeValue(window_element, attr_title.as_concrete_TypeRef(), &mut title_value);
        CFRelease(window_value);
        if err2 != AX_ERROR_SUCCESS || title_value.is_null() {
            return None;
        }

        let titulo = CFString::wrap_under_create_rule(title_value as CFStringRef).to_string();
        if titulo.is_empty() { None } else { Some(titulo) }
    })();

    CFRelease(app_element as CFTypeRef);
    resultado
}
