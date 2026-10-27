//! Foco total (27/10, Davi: "queria que todas as outras coisas respeitassem a margem do relógio e ficassem
//! dividindo a lateral com ele"): enquanto a coluna do Modo Foco está aberta no canto direito, a janela em
//! foco de qualquer app (e as janelas do próprio Infopro) que passar por cima dela é encolhida para caber à
//! esquerda. Usa a Acessibilidade do macOS (AXUIElement), a mesma permissão do monitor de foco — sem ela,
//! só as janelas do Infopro são ajustadas.

use core_foundation::base::{CFRelease, CFTypeRef, TCFType};
use core_foundation::boolean::CFBoolean;
use core_foundation::string::{CFString, CFStringRef};
use std::ffi::c_void;
use std::os::raw::c_int;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Manager};

#[repr(C)]
struct OpaqueAXUIElement(c_void);
type AXUIElementRef = *const OpaqueAXUIElement;
type AXValueRef = *const c_void;

#[repr(C)]
#[derive(Clone, Copy, Default)]
struct Ponto { x: f64, y: f64 }
#[repr(C)]
#[derive(Clone, Copy, Default)]
struct Tamanho { w: f64, h: f64 }

const AX_PONTO: c_int = 1;
const AX_TAMANHO: c_int = 2;

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXIsProcessTrusted() -> bool;
    fn AXUIElementCreateApplication(pid: c_int) -> AXUIElementRef;
    fn AXUIElementCopyAttributeValue(element: AXUIElementRef, attribute: CFStringRef, value: *mut CFTypeRef) -> c_int;
    fn AXUIElementSetAttributeValue(element: AXUIElementRef, attribute: CFStringRef, value: CFTypeRef) -> c_int;
    fn AXValueCreate(tipo: c_int, valor: *const c_void) -> AXValueRef;
    fn AXValueGetValue(valor: AXValueRef, tipo: c_int, saida: *mut c_void) -> bool;
}

unsafe fn ler<T: Default>(el: AXUIElementRef, atributo: &str, tipo: c_int) -> Option<T> {
    let nome = CFString::new(atributo);
    let mut v: CFTypeRef = std::ptr::null();
    if AXUIElementCopyAttributeValue(el, nome.as_concrete_TypeRef(), &mut v) != 0 || v.is_null() {
        return None;
    }
    let mut saida = T::default();
    let ok = AXValueGetValue(v as AXValueRef, tipo, &mut saida as *mut T as *mut c_void);
    CFRelease(v);
    ok.then_some(saida)
}

unsafe fn gravar<T>(el: AXUIElementRef, atributo: &str, tipo: c_int, valor: T) {
    let nome = CFString::new(atributo);
    let v = AXValueCreate(tipo, &valor as *const T as *const c_void);
    if !v.is_null() {
        AXUIElementSetAttributeValue(el, nome.as_concrete_TypeRef(), v as CFTypeRef);
        CFRelease(v as CFTypeRef);
    }
}

unsafe fn em_tela_cheia(el: AXUIElementRef) -> bool {
    let nome = CFString::new("AXFullScreen");
    let mut v: CFTypeRef = std::ptr::null();
    if AXUIElementCopyAttributeValue(el, nome.as_concrete_TypeRef(), &mut v) != 0 || v.is_null() {
        return false;
    }
    let sim = CFBoolean::wrap_under_create_rule(v as _).into();
    sim
}

/// Nova posição/tamanho para a janela caber à esquerda de `limite` (None se já cabe).
fn caber(x: f64, w: f64, esquerda: f64, limite: f64) -> Option<(f64, f64)> {
    if x + w <= limite + 2.0 {
        return None;
    }
    let novo_x = if x < limite - 320.0 { x.max(esquerda) } else { esquerda };
    Some((novo_x, (limite - novo_x).min(w.max(320.0))))
}

/// Encolhe a janela em foco do app da frente (outro app) se ela invade a coluna.
unsafe fn ajustar_app_da_frente(pid: i32, esquerda: f64, limite: f64) {
    let app = AXUIElementCreateApplication(pid);
    if app.is_null() {
        return;
    }
    let nome = CFString::new("AXFocusedWindow");
    let mut janela: CFTypeRef = std::ptr::null();
    if AXUIElementCopyAttributeValue(app, nome.as_concrete_TypeRef(), &mut janela) == 0 && !janela.is_null() {
        let j = janela as AXUIElementRef;
        if !em_tela_cheia(j) {
            if let (Some(p), Some(t)) = (ler::<Ponto>(j, "AXPosition", AX_PONTO), ler::<Tamanho>(j, "AXSize", AX_TAMANHO)) {
                if let Some((x, w)) = caber(p.x, t.w, esquerda, limite) {
                    gravar(j, "AXPosition", AX_PONTO, Ponto { x, y: p.y });
                    gravar(j, "AXSize", AX_TAMANHO, Tamanho { w, h: t.h });
                }
            }
        }
        CFRelease(janela);
    }
    CFRelease(app as CFTypeRef);
}

/// Liga a vigia (uma só por vez); `ligada` em false para parar.
pub fn vigiar(app: AppHandle, ligada: Arc<AtomicBool>, largura_coluna: f64) {
    if ligada.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::spawn(move || {
        let meu_pid = std::process::id() as i32;
        while ligada.load(Ordering::SeqCst) {
            std::thread::sleep(Duration::from_millis(1200));
            let Some(m) = app.get_webview_window("main").and_then(|j| j.current_monitor().ok().flatten()) else { continue };
            let e = m.scale_factor();
            let pos = m.work_area().position.to_logical::<f64>(e);
            let tam = m.work_area().size.to_logical::<f64>(e);
            let limite = pos.x + tam.width - largura_coluna;
            // Janelas do próprio Infopro (principal, Notas, Agenda…), menos a coluna e o Atlas.
            for (rotulo, j) in app.webview_windows() {
                if rotulo == "foco-lateral" || rotulo == "jarvis" || rotulo.starts_with("aviso") || !j.is_visible().unwrap_or(false) || j.is_fullscreen().unwrap_or(false) {
                    continue;
                }
                let esc = j.scale_factor().unwrap_or(e);
                if let (Ok(p), Ok(t)) = (j.outer_position(), j.outer_size()) {
                    let (p, t) = (p.to_logical::<f64>(esc), t.to_logical::<f64>(esc));
                    if let Some((x, w)) = caber(p.x, t.width, pos.x, limite) {
                        let _ = j.set_position(tauri::LogicalPosition::new(x, p.y));
                        let _ = j.set_size(tauri::LogicalSize::new(w, j.inner_size().map(|s| s.to_logical::<f64>(esc).height).unwrap_or(t.height)));
                    }
                }
            }
            // A janela da frente de outro app (precisa da Acessibilidade).
            if !unsafe { AXIsProcessTrusted() } {
                continue;
            }
            let (tx, rx) = std::sync::mpsc::channel();
            let _ = app.run_on_main_thread(move || {
                let pid = objc2_app_kit::NSWorkspace::sharedWorkspace().frontmostApplication().map(|a| a.processIdentifier());
                let _ = tx.send(pid);
            });
            if let Ok(Some(pid)) = rx.recv_timeout(Duration::from_secs(2)) {
                if pid != meu_pid {
                    unsafe { ajustar_app_da_frente(pid, pos.x, limite) };
                }
            }
        }
    });
}
