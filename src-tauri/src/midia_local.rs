//! Mostra no app as imagens, vídeos e áudios que o Lauro gera no Mac (12/11/2026, Davi: "preciso que eu consiga ver o vídeo e as imagens que ele vai gerar").
//! Só lê arquivos de mídia de dentro de ~/.infopro-hub (nada fora dessa pasta), até 150 MB.
use std::path::PathBuf;

const EXTENSOES: [&str; 16] = ["png", "jpg", "jpeg", "webp", "gif", "mp4", "mov", "webm", "m4v", "svg", "mp3", "wav", "m4a", "aac", "ogg", "opus"];
const LIMITE: u64 = 150 * 1024 * 1024;

#[tauri::command]
pub fn ler_midia_local(caminho: String) -> Result<tauri::ipc::Response, String> {
    let home = std::env::var_os("HOME").map(PathBuf::from).ok_or("HOME não encontrado")?;
    let base = home.join(".infopro-hub").canonicalize().map_err(|_| "Pasta do Infopro não encontrada".to_string())?;
    let bruto = caminho.trim();
    let completo = if let Some(resto) = bruto.strip_prefix("~/") { home.join(resto) } else { PathBuf::from(bruto) };
    let real = completo.canonicalize().map_err(|_| "Arquivo não encontrado".to_string())?;   // resolve ".." e atalhos: não escapa da pasta
    if !real.starts_with(&base) {
        return Err("Só leio arquivos de dentro de ~/.infopro-hub".into());
    }
    let ext = real.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()).unwrap_or_default();
    if !EXTENSOES.contains(&ext.as_str()) {
        return Err("Tipo de arquivo não permitido".into());
    }
    let tamanho = std::fs::metadata(&real).map_err(|e| e.to_string())?.len();
    if tamanho > LIMITE {
        return Err("Arquivo grande demais para mostrar aqui".into());
    }
    let bytes = std::fs::read(&real).map_err(|e| e.to_string())?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn recusa_fora_da_pasta_e_tipo_errado() {
        assert!(ler_midia_local("/etc/passwd".into()).is_err());
        assert!(ler_midia_local("~/.infopro-hub/../.zshrc".into()).is_err());
        assert!(ler_midia_local("~/.infopro-hub/whatsapp/config.json".into()).is_err());   // json não é mídia
    }
}
