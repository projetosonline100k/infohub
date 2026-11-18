//! Publicar o quiz também envia o código ao GitHub (18/11/2026, pedido do Davi).
//! Só dois comandos fixos de git no repositório ~/Infopro-hub, branch main: ver quantos commits faltam enviar
//! e enviar (push normal, sem força). Nenhuma entrada do usuário entra nos comandos.

use serde::Serialize;
use std::process::Command;

#[derive(Serialize)]
pub struct EstadoCodigo {
    pub pendentes: u32,
    pub commit_local: String,
    pub branch: String,
}

fn repo() -> Result<String, String> {
    let casa = std::env::var("HOME").map_err(|_| "Não achei a pasta do usuário".to_string())?;
    let caminho = format!("{casa}/Infopro-hub");
    if !std::path::Path::new(&caminho).join(".git").exists() {
        return Err(format!("Repositório não encontrado em {caminho}"));
    }
    Ok(caminho)
}

fn git(dir: &str, args: &[&str]) -> Result<String, String> {
    let saida = Command::new("git")
        .args(args)
        .current_dir(dir)
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()
        .map_err(|e| format!("Não consegui rodar o git: {e}"))?;
    if saida.status.success() {
        Ok(String::from_utf8_lossy(&saida.stdout).trim().to_string())
    } else {
        let erro = String::from_utf8_lossy(&saida.stderr).trim().to_string();
        Err(if erro.is_empty() { "git falhou".to_string() } else { erro })
    }
}

fn estado_de(dir: &str, buscar: bool) -> Result<EstadoCodigo, String> {
    let branch = git(dir, &["rev-parse", "--abbrev-ref", "HEAD"])?;
    if buscar {
        git(dir, &["fetch", "origin", "main"]).map_err(|e| format!("Sem conexão com o GitHub: {e}"))?;
    }
    let pendentes = git(dir, &["rev-list", "--count", "origin/main..main"])?.parse::<u32>().unwrap_or(0);
    let commit_local = git(dir, &["rev-parse", "main"])?;
    Ok(EstadoCodigo { pendentes, commit_local, branch })
}

/// Quantos commits do main local ainda não foram ao GitHub.
#[tauri::command]
pub async fn codigo_estado(buscar: Option<bool>) -> Result<EstadoCodigo, String> {
    let dir = repo()?;
    tauri::async_runtime::spawn_blocking(move || estado_de(&dir, buscar.unwrap_or(false)))
        .await
        .map_err(|e| e.to_string())?
}

/// Envia o main ao GitHub (push normal). Devolve o commit enviado ou o erro claro.
#[tauri::command]
pub async fn codigo_enviar() -> Result<EstadoCodigo, String> {
    let dir = repo()?;
    tauri::async_runtime::spawn_blocking(move || {
        let branch = git(&dir, &["rev-parse", "--abbrev-ref", "HEAD"])?;
        if branch != "main" {
            return Err(format!("O Mac está na branch \"{branch}\", não na main. Não enviei."));
        }
        git(&dir, &["fetch", "origin", "main"]).map_err(|e| format!("Sem conexão com o GitHub: {e}"))?;
        let atras = git(&dir, &["rev-list", "--count", "main..origin/main"])?.parse::<u32>().unwrap_or(0);
        if atras > 0 {
            return Err(format!("O GitHub tem {atras} mudança(s) que o Mac ainda não tem. Atualize antes (git pull) e tente de novo."));
        }
        git(&dir, &["push", "origin", "main"]).map_err(|e| format!("O GitHub recusou o envio: {e}"))?;
        estado_de(&dir, false)
    })
    .await
    .map_err(|e| e.to_string())?
}
