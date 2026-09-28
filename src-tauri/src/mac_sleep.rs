//! "Repousar Mac" (Encerrar o dia, item 7). `pmset sleepnow` é o mecanismo
//! confiável que apps de utilidade reais usam pra isso — a alternativa nativa
//! via IOKit (`IOPMSleepSystem`) tem histórico documentado de falhar
//! silenciosamente (`not privileged`) em processos comuns não-root em
//! versões recentes do macOS, o que seria pior do que não ter o recurso (o
//! usuário clica, a caixa fecha, nada acontece). Isto NÃO é um comando de
//! shell arbitrário: é um binário fixo com um único argumento fixo, sem
//! nenhuma entrada do usuário interpolada — mesma categoria de segurança do
//! `open_accessibility_settings` já existente em focus_monitor.rs.

#[tauri::command]
pub fn dormir_mac() -> Result<(), String> {
    std::process::Command::new("pmset")
        .arg("sleepnow")
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}
