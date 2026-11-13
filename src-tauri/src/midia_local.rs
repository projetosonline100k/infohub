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

// ---------------------------------------------------------------- Anexos para o Lauro

const EXT_ANEXO: [&str; 16] = ["png", "jpg", "jpeg", "webp", "gif", "mp4", "mov", "webm", "m4v", "mp3", "wav", "m4a", "aac", "ogg", "opus", "pdf"];
const LIMITE_ANEXO: usize = 500 * 1024 * 1024;

fn decodifica(s: &str) -> String {
    let b = s.as_bytes();
    let mut saida = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) { saida.push(v); i += 3; continue; }
        }
        saida.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&saida).to_string()
}

fn limpa_nome(n: &str) -> String {
    let base = n.rsplit(['/', '\\']).next().unwrap_or("arquivo");
    let l: String = base.chars().map(|c| if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '_' }).collect();
    l.trim_matches('.').chars().take(80).collect()
}

fn limpa_pasta(p: &str) -> String {
    let l: String = p.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' { c.to_ascii_lowercase() } else { '-' }).collect();
    let l = l.trim_matches('-').to_string();
    if l.is_empty() { "perfil".into() } else { l.chars().take(60).collect() }
}

/// Guarda uma imagem, vídeo ou áudio que o Davi jogou no chat do Lauro em ~/.infopro-hub/exemplos/<perfil>/recebidos/ e devolve o caminho
/// (o Lauro, que roda neste Mac, abre o arquivo por ele). Corpo = bytes do arquivo; cabeçalhos x-pasta e x-nome (codificados).
#[tauri::command]
pub fn salvar_anexo_lauro(request: tauri::ipc::Request) -> Result<String, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else { return Err("Arquivo vazio".into()) };
    if bytes.is_empty() { return Err("Arquivo vazio".into()); }
    if bytes.len() > LIMITE_ANEXO { return Err("Arquivo grande demais (máximo 500 MB)".into()); }
    let cab = |k: &str| request.headers().get(k).and_then(|v| v.to_str().ok()).map(decodifica).unwrap_or_default();
    let nome = limpa_nome(&cab("x-nome"));
    let ext = nome.rsplit('.').next().map(|e| e.to_lowercase()).unwrap_or_default();
    if !EXT_ANEXO.contains(&ext.as_str()) { return Err("Tipo de arquivo não permitido".into()); }
    let home = std::env::var_os("HOME").map(PathBuf::from).ok_or("HOME não encontrado")?;
    let pasta = limpa_pasta(&cab("x-pasta"));
    let dir = home.join(".infopro-hub").join("exemplos").join(&pasta).join("recebidos");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let agora = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let arquivo = format!("{agora}-{nome}");
    std::fs::write(dir.join(&arquivo), bytes).map_err(|e| e.to_string())?;
    Ok(format!("~/.infopro-hub/exemplos/{pasta}/recebidos/{arquivo}"))
}

#[cfg(test)]
mod testes_anexo {
    use super::*;

    #[test]
    fn nomes_e_pastas_sao_limpos() {
        assert_eq!(limpa_nome("../../etc/Foto bonita (1).PNG"), "Foto_bonita__1_.PNG");
        assert_eq!(limpa_pasta("Insta Insights oficial!"), "insta-insights-oficial");
        assert_eq!(limpa_pasta("///"), "perfil");
        assert_eq!(decodifica("Foto%20bonita%C3%A7"), "Foto bonitaç");
        assert_eq!(decodifica("100%"), "100%");
    }
}

// ---------------------------------------------------------------- Botão "Parar controle" (Lauro mexendo no Mac)

fn arquivo_parar() -> Result<PathBuf, String> {
    Ok(std::env::var_os("HOME").map(PathBuf::from).ok_or("HOME não encontrado")?.join(".infopro-hub").join("lauro-parar"))
}

/// Liga/desliga a trava do controle do Mac: com o arquivo ~/.infopro-hub/lauro-parar presente, a ferramenta `controle` do Lauro não faz nenhuma ação.
#[tauri::command]
pub fn lauro_controle_parar(ativo: bool) -> Result<bool, String> {
    let f = arquivo_parar()?;
    if ativo { std::fs::write(&f, "parado pelo Davi\n").map_err(|e| e.to_string())?; } else { let _ = std::fs::remove_file(&f); }
    Ok(f.exists())
}

#[tauri::command]
pub fn lauro_controle_estado() -> bool {
    arquivo_parar().map(|f| f.exists()).unwrap_or(false)
}
