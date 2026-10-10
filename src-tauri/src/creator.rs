//! Modo Creator do Jarvis — "Transcrever": cola o link de um vídeo e devolve
//! o texto falado. Tudo roda no Mac (yt-dlp + Whisper via mlx-whisper),
//! sem conta e sem custo. O trabalho pesado fica num processo Python que
//! carrega o modelo uma vez e fica pronto pras próximas transcrições
//! (creator/transcrever.py); ele sai sozinho depois de 10 min parado e é
//! recriado no próximo pedido.
//!
//! Requer as bibliotecas em ~/.infopro-hub/creator (instaladas com
//! `pip3 install --target ~/.infopro-hub/creator yt-dlp mlx-whisper imageio-ffmpeg`).

use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::{Arc, Mutex};

const SCRIPT: &str = include_str!("creator/transcrever.py");

struct Trabalhador {
    processo: Child,
    entrada: ChildStdin,
    saida: BufReader<ChildStdout>,
}

#[derive(Default)]
pub struct CreatorState(Arc<Mutex<Option<Trabalhador>>>);

fn pasta_bibliotecas() -> Option<PathBuf> {
    std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".infopro-hub/creator"))
}

/// Python que instalou as bibliotecas (o app aberto pelo Finder não herda o
/// PATH do terminal, então procura nos lugares de sempre).
fn python() -> Option<PathBuf> {
    [
        "/Library/Frameworks/Python.framework/Versions/Current/bin/python3",
        "/opt/homebrew/bin/python3",
        "/usr/local/bin/python3",
        "/usr/bin/python3",
    ]
    .iter()
    .map(PathBuf::from)
    .find(|p| p.exists())
}

fn iniciar() -> Result<Trabalhador, String> {
    let pasta = pasta_bibliotecas().filter(|p| p.exists()).ok_or(
        "As ferramentas de transcrição não estão instaladas neste Mac (pasta ~/.infopro-hub/creator).",
    )?;
    let py = python().ok_or("Python 3 não encontrado neste Mac.")?;
    let mut processo = Command::new(py)
        .env("PYTHONPATH", &pasta)
        .args(["-c", SCRIPT])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Não consegui iniciar a transcrição: {e}"))?;
    let entrada = processo.stdin.take().ok_or("sem stdin")?;
    let saida = BufReader::new(processo.stdout.take().ok_or("sem stdout")?);
    Ok(Trabalhador { processo, entrada, saida })
}

/// Manda o pedido e espera a resposta com o mesmo id. `Ok(None)` = o
/// trabalhador morreu no meio (ex.: tinha acabado de sair por ociosidade).
fn pedir(t: &mut Trabalhador, id: &str, url: &str, modo: &str) -> Result<Option<serde_json::Value>, String> {
    let pedido = serde_json::json!({ "id": id, "url": url, "modo": modo }).to_string();
    if writeln!(t.entrada, "{pedido}").and_then(|_| t.entrada.flush()).is_err() {
        return Ok(None);
    }
    let mut linha = String::new();
    loop {
        linha.clear();
        match t.saida.read_line(&mut linha) {
            Ok(0) | Err(_) => return Ok(None),
            Ok(_) => {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(linha.trim()) {
                    if v.get("id").and_then(|x| x.as_str()) == Some(id) {
                        return Ok(Some(v));
                    }
                }
            }
        }
    }
}

#[tauri::command]
pub async fn creator_transcrever(estado: tauri::State<'_, CreatorState>, url: String, modo: Option<String>) -> Result<serde_json::Value, String> {
    let modo = modo.unwrap_or_else(|| "preciso".to_string());
    let estado = estado.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        // Um pedido por vez (o modelo ocupa bastante memória).
        let mut guarda = estado.lock().unwrap_or_else(|e| e.into_inner());
        let id = format!("{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0));
        for _tentativa in 0..2 {
            let vivo = guarda.as_mut().map(|t| matches!(t.processo.try_wait(), Ok(None))).unwrap_or(false);
            if !vivo {
                *guarda = Some(iniciar()?);
            }
            let t = guarda.as_mut().expect("trabalhador iniciado");
            match pedir(t, &id, &url, &modo)? {
                Some(resposta) => {
                    if let Some(erro) = resposta.get("erro").and_then(|e| e.as_str()) {
                        return Err(erro.to_string());
                    }
                    return Ok(resposta);
                }
                None => {
                    // Morreu no meio: descarta e tenta uma vez com um novo.
                    if let Some(mut morto) = guarda.take() {
                        let _ = morto.processo.kill();
                        let _ = morto.processo.wait();
                    }
                }
            }
        }
        Err("A transcrição parou no meio. Tente de novo.".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

