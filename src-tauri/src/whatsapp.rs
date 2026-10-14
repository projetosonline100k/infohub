//! Guia "Conversas" do Jarvis: envia a mensagem que o Davi escreveu pelo WAHA
//! (WhatsApp rodando no Mac, ver scripts/instalar-whatsapp.sh). Só envia
//! quando ele clica em Enviar — nada aqui manda mensagem sozinho. A mensagem
//! enviada volta pelo webhook (receptor) e aparece na conversa como as outras.

use std::io::Write;
use std::process::{Command, Stdio};

fn config() -> Result<serde_json::Value, String> {
    let caminho = std::env::var_os("HOME")
        .map(|h| std::path::PathBuf::from(h).join(".infopro-hub/whatsapp/config.json"))
        .ok_or("HOME não encontrado")?;
    let texto = std::fs::read_to_string(caminho).map_err(|_| "O WhatsApp não está configurado neste Mac.".to_string())?;
    serde_json::from_str(&texto).map_err(|e| e.to_string())
}

// Registro de cada envio (sem o texto da mensagem): pra entender falhas.
fn registrar(linha: &str) {
    if let Some(h) = std::env::var_os("HOME") {
        let caminho = std::path::PathBuf::from(h).join(".infopro-hub/whatsapp/envio.log");
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(caminho) {
            let agora = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
            let _ = writeln!(f, "{agora} {linha}");
        }
    }
}

#[tauri::command]
pub async fn whatsapp_enviar(chat_id: String, texto: String) -> Result<serde_json::Value, String> {
    registrar(&format!("pedido chat={chat_id} tamanho={}", texto.len()));
    let resultado = enviar(chat_id, texto).await;
    registrar(&match &resultado { Ok(_) => "ok".to_string(), Err(e) => format!("erro: {e}") });
    resultado
}

async fn enviar(chat_id: String, texto: String) -> Result<serde_json::Value, String> {
    let texto = texto.trim().to_string();
    if texto.is_empty() || chat_id.trim().is_empty() {
        return Err("Mensagem vazia".into());
    }
    let cfg = config()?;
    let corpo = serde_json::json!({
        "session": cfg["sessao"].as_str().unwrap_or("default"),
        "chatId": chat_id,
        "text": texto,
    });
    post_waha(&cfg, "/api/sendText", corpo).await
}

/// Áudio gravado no Jarvis (microfone): vai como mensagem de voz. O WAHA
/// converte pro formato do WhatsApp (convert: true).
#[tauri::command]
pub async fn whatsapp_enviar_audio(chat_id: String, base64: String, mimetype: String) -> Result<serde_json::Value, String> {
    registrar(&format!("pedido de audio chat={chat_id} tamanho={}", base64.len()));
    if base64.is_empty() || chat_id.trim().is_empty() {
        return Err("Áudio vazio".into());
    }
    let cfg = config()?;
    let corpo = serde_json::json!({
        "session": cfg["sessao"].as_str().unwrap_or("default"),
        "chatId": chat_id,
        "file": { "mimetype": mimetype, "data": base64, "filename": "audio" },
        "convert": true,
    });
    let resultado = post_waha(&cfg, "/api/sendVoice", corpo).await;
    registrar(&match &resultado { Ok(_) => "audio ok".to_string(), Err(e) => format!("audio erro: {e}") });
    resultado
}

/// Endereço das fotos/vídeos/áudios guardados no Mac (servidos pelo
/// receptor): o Jarvis monta `<base><arquivo>?k=<chave>`.
#[tauri::command]
pub fn whatsapp_midia_base() -> Result<serde_json::Value, String> {
    let cfg = config()?;
    let porta = cfg["porta"].as_u64().unwrap_or(3101);
    Ok(serde_json::json!({
        "base": format!("http://localhost:{porta}/midia/"),
        "chave": cfg["segredo_webhook"].as_str().unwrap_or(""),
    }))
}

/// POST no WAHA via curl (vem no macOS; o app não tem cliente HTTP próprio).
/// O corpo vai por arquivo temporário (áudio em base64 é grande) e a chave
/// por config do curl na entrada — nenhum dos dois na linha de comando.
async fn post_waha(cfg: &serde_json::Value, caminho: &str, corpo: serde_json::Value) -> Result<serde_json::Value, String> {
    let url = format!("{}{}", cfg["waha_url"].as_str().unwrap_or("http://localhost:3000"), caminho);
    let chave = cfg["waha_api_key"].as_str().ok_or("Chave do WAHA ausente")?.to_string();
    tauri::async_runtime::spawn_blocking(move || {
        let arquivo = std::env::temp_dir().join(format!("jarvis-wa-{}.json", std::process::id() as u128 * 1000 + std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.subsec_nanos() as u128).unwrap_or(0)));
        std::fs::write(&arquivo, corpo.to_string()).map_err(|e| e.to_string())?;
        let saida = (|| {
            let mut filho = Command::new("/usr/bin/curl")
                .args(["-sS", "--max-time", "60", "-X", "POST", &url, "-H", "Content-Type: application/json",
                       "--data-binary", &format!("@{}", arquivo.display()), "-K", "-", "-w", "\n%{http_code}"])
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .map_err(|e| format!("Não consegui chamar o WhatsApp: {e}"))?;
            {
                let entrada = filho.stdin.as_mut().ok_or("sem stdin")?;
                write!(entrada, "header = \"X-Api-Key: {chave}\"\n").map_err(|e| e.to_string())?;
            }
            filho.wait_with_output().map_err(|e| e.to_string())
        })();
        let _ = std::fs::remove_file(&arquivo);
        let saida = saida?;
        let texto = String::from_utf8_lossy(&saida.stdout).to_string();
        let (resposta, codigo) = texto.rsplit_once('\n').unwrap_or(("", texto.as_str()));
        if !saida.status.success() {
            return Err("O WhatsApp do Mac não respondeu (o WAHA está ligado?).".into());
        }
        if !codigo.trim().starts_with('2') {
            return Err(format!("O WhatsApp recusou o envio ({}): {}", codigo.trim(), resposta.chars().take(160).collect::<String>()));
        }
        Ok(serde_json::from_str(resposta).unwrap_or(serde_json::Value::Null))
    })
    .await
    .map_err(|e| e.to_string())?
}
