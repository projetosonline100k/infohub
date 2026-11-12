// Saúde do Mac (12/11/2026, Davi: "o Jarvis monitorar quando o PC estiver para sobrecarregar: a orbe fica amarela/vermelha e, no hover,
// avisa que está com pouca memória etc."). Só lê (nenhuma permissão): usa as ferramentas do próprio macOS — top, memory_pressure, sysctl,
// df, pmset e ps. A decisão (amarelo/vermelho) fica no front (src/lib/saudePc.ts); aqui só entram os números.
use serde::Serialize;
use std::collections::HashMap;
use std::process::Command;

#[derive(Serialize, Default)]
pub struct Consumo {
    pub nome: String,
    pub valor: f64,
}

#[derive(Serialize, Default)]
pub struct SaudePc {
    pub cpu_pct: Option<f64>,
    pub mem_livre_pct: Option<f64>,
    pub mem_total_gb: Option<f64>,
    pub swap_usado_gb: Option<f64>,
    pub swap_total_gb: Option<f64>,
    pub disco_livre_gb: Option<f64>,
    pub disco_livre_pct: Option<f64>,
    pub bateria_pct: Option<f64>,
    pub carregando: bool,
    pub limite_termico: Option<f64>,
    pub top_memoria: Vec<Consumo>,
    pub top_cpu: Vec<Consumo>,
}

fn rodar(programa: &str, args: &[&str]) -> String {
    Command::new(programa).args(args).output().map(|o| String::from_utf8_lossy(&o.stdout).to_string()).unwrap_or_default()
}

/// "12.50%" → 12.5
fn numero_antes_de(texto: &str, marca: &str) -> Option<f64> {
    let i = texto.find(marca)?;
    let antes = texto[..i].trim_end();
    let ini = antes.rfind(|c: char| !(c.is_ascii_digit() || c == '.' || c == ',')).map(|p| p + 1).unwrap_or(0);
    antes[ini..].replace(',', ".").parse().ok()
}

fn gb_de(texto: &str, campo: &str) -> Option<f64> {
    // "total = 7168.00M  used = 6386.12M ..." (ou G)
    let i = texto.find(campo)? + campo.len();
    let resto = texto[i..].trim_start_matches([' ', '=']).trim_start();
    let fim = resto.find(|c: char| c.is_whitespace()).unwrap_or(resto.len());
    let tok = &resto[..fim];
    let (num, un) = tok.split_at(tok.len().saturating_sub(1));
    let n: f64 = num.replace(',', ".").parse().ok()?;
    Some(match un { "G" => n, "M" => n / 1024.0, "K" => n / 1024.0 / 1024.0, "T" => n * 1024.0, _ => return None })
}

/// Nome do app a partir do caminho do executável: "/Applications/Google Chrome.app/Contents/…" → "Google Chrome".
fn nome_do_app(caminho: &str) -> String {
    if let Some(i) = caminho.find(".app/") {
        let ate = &caminho[..i];
        return ate.rsplit('/').next().unwrap_or(ate).to_string();
    }
    caminho.rsplit('/').next().unwrap_or(caminho).to_string()
}

fn consumo_por_app(saida: &str, divisor: f64) -> Vec<Consumo> {
    let mut mapa: HashMap<String, f64> = HashMap::new();
    for linha in saida.lines() {
        let linha = linha.trim();
        let Some((num, caminho)) = linha.split_once(char::is_whitespace) else { continue };
        let Ok(v) = num.replace(',', ".").parse::<f64>() else { continue };
        *mapa.entry(nome_do_app(caminho.trim())).or_insert(0.0) += v / divisor;
    }
    let mut v: Vec<Consumo> = mapa.into_iter().map(|(nome, valor)| Consumo { nome, valor }).collect();
    v.sort_by(|a, b| b.valor.partial_cmp(&a.valor).unwrap_or(std::cmp::Ordering::Equal));
    v.truncate(3);
    v
}

fn ler() -> SaudePc {
    let mut s = SaudePc::default();
    // CPU: a segunda amostra do top (a primeira é a média desde que ligou).
    let top = rodar("top", &["-l", "2", "-s", "1", "-n", "0"]);
    if let Some(l) = top.lines().rev().find(|l| l.contains("CPU usage")) {
        if let Some(idle) = numero_antes_de(l, "% idle") { s.cpu_pct = Some((100.0 - idle).clamp(0.0, 100.0)); }
    }
    let mp = rodar("memory_pressure", &[]);
    if let Some(l) = mp.lines().find(|l| l.to_lowercase().contains("free percentage")) {
        s.mem_livre_pct = l.split(':').nth(1).and_then(|t| t.trim().trim_end_matches('%').parse().ok());
    }
    s.mem_total_gb = rodar("sysctl", &["-n", "hw.memsize"]).trim().parse::<f64>().ok().map(|b| b / 1_073_741_824.0);
    let swap = rodar("sysctl", &["-n", "vm.swapusage"]);
    s.swap_total_gb = gb_de(&swap, "total");
    s.swap_usado_gb = gb_de(&swap, "used");
    // Disco: o volume de dados (onde ficam os arquivos do usuário).
    let df = rodar("df", &["-k", "/System/Volumes/Data"]);
    if let Some(l) = df.lines().nth(1) {
        let c: Vec<&str> = l.split_whitespace().collect();
        if c.len() >= 4 {
            if let (Ok(total), Ok(livre)) = (c[1].parse::<f64>(), c[3].parse::<f64>()) {
                s.disco_livre_gb = Some(livre / 1_048_576.0);
                s.disco_livre_pct = Some(if total > 0.0 { livre / total * 100.0 } else { 100.0 });
            }
        }
    }
    let bat = rodar("pmset", &["-g", "batt"]);
    if let Some(l) = bat.lines().find(|l| l.contains("InternalBattery")) {
        s.bateria_pct = numero_antes_de(l, "%");
        let m = l.to_lowercase();
        s.carregando = m.contains("charging") && !m.contains("discharging") || m.contains("charged") || m.contains("finishing");
    }
    let therm = rodar("pmset", &["-g", "therm"]);
    s.limite_termico = therm.lines().find(|l| l.contains("CPU_Speed_Limit")).and_then(|l| l.split('=').nth(1)).and_then(|t| t.trim().parse().ok());
    // Quem mais pesa (soma por aplicativo; o Chrome tem dezenas de processos).
    s.top_memoria = consumo_por_app(&rodar("ps", &["-Ao", "rss=,comm=", "-m"]).lines().take(200).collect::<Vec<_>>().join("\n"), 1_048_576.0);
    s.top_cpu = consumo_por_app(&rodar("ps", &["-Ao", "%cpu=,comm=", "-r"]).lines().take(200).collect::<Vec<_>>().join("\n"), 1.0);
    s
}

#[tauri::command]
pub async fn saude_pc() -> Result<SaudePc, String> {
    tauri::async_runtime::spawn_blocking(ler).await.map_err(|e| e.to_string())
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn le_numeros_das_saidas_do_macos() {
        assert_eq!(numero_antes_de("CPU usage: 10.44% user, 9.41% sys, 80.13% idle ", "% idle"), Some(80.13));
        assert_eq!(numero_antes_de(" -InternalBattery-0 (id=1)\t16%; charging; 2:15 remaining", "%"), Some(16.0));
        let swap = "total = 7168.00M  used = 6386.12M  free = 781.88M  (encrypted)";
        assert!((gb_de(swap, "total").unwrap() - 7.0).abs() < 0.01);
        assert!((gb_de(swap, "used").unwrap() - 6.236).abs() < 0.01);
        assert_eq!(gb_de("total = 2.00G used = 0.00M", "total"), Some(2.0));
    }

    #[test]
    fn agrupa_por_aplicativo() {
        let saida = "457792 /Applications/Claude.app/Contents/Frameworks/Claude Helper (Renderer).app/Contents/MacOS/Claude Helper\n423728 /Applications/Claude.app/Contents/MacOS/Claude\n89696 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome\n1000 /usr/sbin/mDNSResponder";
        let v = consumo_por_app(saida, 1.0);
        assert_eq!(v[0].nome, "Claude");   // o app de fora e os helpers dele somam juntos
        assert_eq!(v[0].valor, 457792.0 + 423728.0);
        assert_eq!(nome_do_app("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"), "Google Chrome");
        assert_eq!(nome_do_app("/usr/sbin/mDNSResponder"), "mDNSResponder");
    }
}
