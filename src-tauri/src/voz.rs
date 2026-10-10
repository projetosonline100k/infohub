//! Voz do Jarvis (macOS). Duas fontes:
//! - vozes neurais da Microsoft (as do "Ler em voz alta" do Edge), quando a
//!   voz escolhida começa com "edge:" — geradas pelo pacote Python
//!   `edge-tts` instalado em ~/.infopro-hub/edge-tts e tocadas com `afplay`.
//!   Precisa de internet; se falhar, cai pra voz padrão do Mac;
//! - vozes do próprio Mac, com o comando `say`.
//! Uma fala por vez — falar de novo interrompe a anterior. Chamado por
//! src/lib/desktop/voz.ts.

use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};

/// Processo tocando agora + um contador de "geração": cada fala nova
/// incrementa, e a fala antiga (ainda gerando o áudio) desiste de tocar.
#[derive(Default)]
pub struct VozState(pub Arc<Mutex<(Option<Child>, u64)>>);

const VOZ_RESERVA_MAC: &str = "Reed (Português (Brasil))";

fn parar(estado: &Mutex<(Option<Child>, u64)>) -> u64 {
    let mut atual = estado.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(mut processo) = atual.0.take() {
        let _ = processo.kill();
        let _ = processo.wait();
    }
    atual.1 += 1;
    atual.1
}

fn pasta_edge_tts() -> Option<PathBuf> {
    std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".infopro-hub/edge-tts"))
}

/// Python que instalou o edge-tts (o app aberto pelo Finder não herda o PATH
/// do terminal, então procura nos lugares de sempre).
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

fn comando_say(texto: &str, voz: &str, velocidade: Option<u32>) -> Command {
    let mut comando = Command::new("/usr/bin/say");
    if !voz.trim().is_empty() {
        comando.arg("-v").arg(voz);
    }
    if let Some(r) = velocidade {
        comando.arg("-r").arg(r.clamp(90, 360).to_string());
    }
    // Texto depois de "--": não vira opção do `say`, e não passa por shell.
    comando.arg("--").arg(texto).stdout(Stdio::null()).stderr(Stdio::null());
    comando
}

#[tauri::command]
pub fn voz_falar(estado: tauri::State<VozState>, texto: String, voz: Option<String>, velocidade: Option<u32>) -> Result<(), String> {
    let geracao = parar(&estado.0);
    let texto = texto.trim().to_string();
    if texto.is_empty() {
        return Ok(());
    }
    let voz = voz.unwrap_or_default();

    if let Some(nome_edge) = voz.strip_prefix("edge:") {
        // Gera o MP3 numa thread (leva ~1s, precisa de internet) e toca.
        let estado = estado.0.clone();
        let nome_edge = nome_edge.to_string();
        std::thread::spawn(move || {
            // 185 = velocidade "normal" do controle do Jarvis.
            let pct = ((velocidade.unwrap_or(185) as f64 / 185.0 - 1.0) * 100.0).round() as i64;
            let arquivo = std::env::temp_dir().join(format!("jarvis-voz-{geracao}.mp3"));
            // Áudio da fala anterior não serve mais.
            let _ = std::fs::remove_file(std::env::temp_dir().join(format!("jarvis-voz-{}.mp3", geracao.saturating_sub(1))));
            let gerou = match (python(), pasta_edge_tts()) {
                (Some(py), Some(pasta)) if pasta.exists() => Command::new(py)
                    .env("PYTHONPATH", &pasta)
                    .args(["-m", "edge_tts", "--voice", &nome_edge, &format!("--rate={pct:+}%"), "--text", &texto, "--write-media"])
                    .arg(&arquivo)
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .status()
                    .map(|s| s.success())
                    .unwrap_or(false),
                _ => false,
            };
            let mut atual = estado.lock().unwrap_or_else(|e| e.into_inner());
            if atual.1 != geracao {
                let _ = std::fs::remove_file(&arquivo);
                return; // chegou outra fala (ou "parar") enquanto gerava
            }
            let processo = if gerou {
                Command::new("/usr/bin/afplay").arg(&arquivo).stdout(Stdio::null()).stderr(Stdio::null()).spawn()
            } else {
                log::warn!("voz: edge-tts falhou, usando a voz do Mac");
                comando_say(&texto, VOZ_RESERVA_MAC, velocidade).spawn()
            };
            if let Ok(p) = processo {
                atual.0 = Some(p);
            }
        });
        return Ok(());
    }

    let processo = comando_say(&texto, &voz, velocidade).spawn().map_err(|e| e.to_string())?;
    let mut atual = estado.0.lock().unwrap_or_else(|e| e.into_inner());
    if atual.1 == geracao {
        atual.0 = Some(processo);
    }
    Ok(())
}

#[tauri::command]
pub fn voz_parar(estado: tauri::State<VozState>) {
    parar(&estado.0);
}

/// Vozes disponíveis (nome exato pra passar em `voz_falar`): as neurais da
/// Microsoft (se o edge-tts estiver instalado) e as do Mac em português.
#[tauri::command]
pub fn voz_listar() -> Vec<String> {
    let mut vozes: Vec<String> = Vec::new();
    if pasta_edge_tts().map(|p| p.exists()).unwrap_or(false) {
        for v in ["pt-BR-ThalitaMultilingualNeural", "pt-BR-AntonioNeural", "pt-BR-FranciscaNeural"] {
            vozes.push(format!("edge:{v}"));
        }
    }
    let saida = match Command::new("/usr/bin/say").args(["-v", "?"]).output() {
        Ok(s) => s,
        Err(_) => return vozes,
    };
    let mac: Vec<String> = String::from_utf8_lossy(&saida.stdout)
        .lines()
        .filter_map(|linha| {
            // "Reed (Português (Brasil)) pt_BR    # Olá..."
            let antes = linha.split('#').next()?.trim_end();
            let (nome, idioma) = antes.rsplit_once(char::is_whitespace)?;
            if idioma.starts_with("pt_") {
                Some(nome.trim().to_string())
            } else {
                None
            }
        })
        .collect();
    vozes.extend(mac);
    vozes
}
