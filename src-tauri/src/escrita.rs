//! Claude escrevendo dentro do documento (19/10/2026, Davi: "⌘I no Docs ativa o modo chat; onde
//! estiver o cursor é onde ele começa a escrever, tipo o Claude mesmo"). O pedido vai pelo stdin
//! (as skills do Junior/Elias passam de 100 mil caracteres) e cada pedaço do texto chega ao app
//! pelo evento `claude-escrita` ({id, texto}); no fim, {id, fim: true, erro?}.

use std::collections::HashMap;
use std::io::{BufRead, Write};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

static RODANDO: Mutex<Option<HashMap<String, u32>>> = Mutex::new(None);

fn guardar(id: &str, pid: Option<u32>) {
    let mut m = RODANDO.lock().unwrap_or_else(|e| e.into_inner());
    let mapa = m.get_or_insert_with(HashMap::new);
    match pid {
        Some(p) => { mapa.insert(id.to_string(), p); }
        None => { mapa.remove(id); }
    }
}

#[derive(Clone, serde::Serialize)]
struct Pedaco {
    id: String,
    texto: Option<String>,
    fim: bool,
    erro: Option<String>,
}

/// Começa a escrever; volta na hora (o texto chega pelos eventos). `modelo`: "sonnet" (padrão),
/// "opus" ou "haiku".
#[tauri::command]
pub fn claude_escrever(app: AppHandle, id: String, pedido: String, modelo: Option<String>) -> Result<(), String> {
    let modelo = match modelo.as_deref() { Some("opus") => "opus", Some("haiku") => "haiku", _ => "sonnet" }.to_string();
    let bin = crate::ditado::claude_bin().ok_or("Não achei o Claude neste Mac.")?;
    let mut filho = Command::new(bin)
        .args(["-p", "--model", &modelo, "--output-format", "stream-json", "--verbose", "--include-partial-messages",
               "--max-turns", "1", "--strict-mcp-config", "--mcp-config", "{\"mcpServers\":{}}", "--tools", "",
               "--disable-slash-commands", "--setting-sources", "", "--no-session-persistence"])
        .current_dir(std::env::temp_dir()) // pasta neutra: sem CLAUDE.md de projeto
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;
    guardar(&id, Some(filho.id()));
    let mut entrada = filho.stdin.take().ok_or("sem entrada")?;
    let saida = filho.stdout.take().ok_or("sem saída")?;
    std::thread::spawn(move || {
        let _ = entrada.write_all(pedido.as_bytes());
        // fecha a entrada: o Claude começa
    });
    std::thread::spawn(move || {
        let manda = |texto: Option<String>, fim: bool, erro: Option<String>| {
            let _ = app.emit("claude-escrita", Pedaco { id: id.clone(), texto, fim, erro });
        };
        let mut escreveu = false;
        let mut erro = None;
        for linha in std::io::BufReader::new(saida).lines().map_while(Result::ok) {
            let Ok(v) = serde_json::from_str::<serde_json::Value>(&linha) else { continue };
            match v.get("type").and_then(|t| t.as_str()) {
                Some("stream_event") => {
                    let ev = &v["event"];
                    if ev["type"] == "content_block_delta" && ev["delta"]["type"] == "text_delta" {
                        if let Some(t) = ev["delta"]["text"].as_str() {
                            escreveu = true;
                            manda(Some(t.to_string()), false, None);
                        }
                    }
                }
                Some("result") => {
                    if v.get("is_error").and_then(|e| e.as_bool()) == Some(true) {
                        erro = Some(v.get("result").and_then(|r| r.as_str()).unwrap_or("O Claude deu erro.").to_string());
                    }
                    break;
                }
                _ => {}
            }
        }
        let _ = filho.wait();
        let parado = RODANDO.lock().unwrap_or_else(|e| e.into_inner()).as_ref().map_or(true, |m| !m.contains_key(&id));
        guardar(&id, None);
        if erro.is_none() && !escreveu && !parado {
            erro = Some("O Claude não respondeu.".to_string());
        }
        manda(None, true, erro);
    });
    Ok(())
}

/// Para a escrita no meio (Esc ou o botão de parar).
#[tauri::command]
pub fn claude_escrever_parar(id: String) {
    let pid = RODANDO.lock().unwrap_or_else(|e| e.into_inner()).as_mut().and_then(|m| m.remove(&id));
    if let Some(p) = pid {
        let _ = Command::new("/bin/kill").arg(p.to_string()).status();
    }
}
