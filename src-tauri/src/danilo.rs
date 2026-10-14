//! Mini editor do Danilo (editor IA): o Infopro fala com o serviço local
//! dele (scripts/danilo/servidor.py). Este comando só entrega o endereço e a
//! chave, lidos de ~/.infopro-hub/danilo/config.json.

#[tauri::command]
pub fn danilo_base() -> Result<serde_json::Value, String> {
    let caminho = std::env::var_os("HOME")
        .map(|h| std::path::PathBuf::from(h).join(".infopro-hub/danilo/config.json"))
        .ok_or("HOME não encontrado")?;
    let texto = std::fs::read_to_string(caminho).map_err(|_| "O Danilo não está instalado neste Mac.".to_string())?;
    let cfg: serde_json::Value = serde_json::from_str(&texto).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "base": format!("http://127.0.0.1:{}", cfg["porta"].as_u64().unwrap_or(3103)),
        "chave": cfg["chave"].as_str().unwrap_or(""),
    }))
}
