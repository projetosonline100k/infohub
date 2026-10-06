//! Integração com o app Lembretes (Reminders) do macOS, nos dois sentidos.
//! Os projetos viram listas ("Infopro – Projeto"; Pessoal = "Infopro") e as
//! atividades em aberto viram lembretes nelas (espelho), além de:
//! - Infopro → Lembretes: o alarme de uma atividade vira um lembrete com
//!   alerta no horário (toca mesmo com o Infopro fechado, sincroniza com o
//!   iPhone pelo iCloud);
//! - Lembretes → Infopro: `lembretes_sincronizar` devolve o estado dos
//!   lembretes vinculados (concluído/apagado/data mudou) e os lembretes novos
//!   das listas "Infopro…", que viram atividades.
//!
//! Usa `osascript` com JavaScript for Automation. Os scripts são fixos; os
//! dados (título, datas, ids) chegam como ARGUMENTOS do script (argv do
//! `run`), nunca interpolados no código — então não há injeção de comando.
//! Na primeira vez o macOS pede permissão pra o Infopro controlar os Lembretes.

use std::io::Read;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

/// Limite por chamada ao app Lembretes. Sem isso, se ele travar, os
/// `osascript` ficam pendurados pra sempre (e se acumulavam a cada minuto).
const TEMPO_MAXIMO: Duration = Duration::from_secs(45);

/// Corpo dos lembretes criados pelo alarme na versão anterior (antes do
/// espelho): desligar o alarme ainda apaga esses; os demais só perdem a data.
const MARCA_ALARME: &str = "Alarme de atividade do Infopro Hub";

// Cria vários lembretes de uma vez (argv[0]: JSON [{ titulo, notas, lista,
// prioridade, quando }]), criando as listas que faltarem. Devolve JSON com os
// ids na mesma ordem.
const SCRIPT_CRIAR_LOTE: &str = r#"
function run(argv) {
  const app = Application('Reminders');
  const itens = JSON.parse(argv[0] || '[]');
  const listas = {};
  const lista = (nome) => {
    if (listas[nome]) return listas[nome];
    if (app.lists.whose({ name: nome })().length === 0) app.make({ new: 'list', withProperties: { name: nome } });
    listas[nome] = app.lists.whose({ name: nome })()[0];
    return listas[nome];
  };
  const ids = itens.map((item) => {
    const props = { name: item.titulo, body: item.notas || '', priority: item.prioridade || 0 };
    if (item.quando) { props.remindMeDate = new Date(item.quando); props.dueDate = new Date(item.quando); }
    const lembrete = app.Reminder(props);
    lista(item.lista).reminders.push(lembrete);
    return lembrete.id();
  });
  return JSON.stringify(ids);
}
"#;

// Atualiza nome/notas/prioridade (argv[1]: JSON só com o que mudou).
const SCRIPT_ATUALIZAR_DADOS: &str = r#"
function run(argv) {
  const app = Application('Reminders');
  const lembrete = app.reminders.byId(argv[0]);
  const dados = JSON.parse(argv[1] || '{}');
  if (dados.titulo !== undefined) lembrete.name = dados.titulo;
  if (dados.notas !== undefined) lembrete.body = dados.notas;
  if (dados.prioridade !== undefined) lembrete.priority = dados.prioridade;
  return 'ok';
}
"#;

const SCRIPT_REMOVER: &str = r#"
function run(argv) {
  const app = Application('Reminders');
  try { app.delete(app.reminders.byId(argv[0])); } catch (e) { /* já não existe */ }
  return 'ok';
}
"#;

// Muda a data do lembrete; falha se ele não existe mais.
const SCRIPT_ATUALIZAR: &str = r#"
function run(argv) {
  const app = Application('Reminders');
  const lembrete = app.reminders.byId(argv[0]);
  lembrete.completed();
  const quando = new Date(Number(argv[1]));
  lembrete.remindMeDate = quando;
  lembrete.dueDate = quando;
  return 'ok';
}
"#;

// Alarme desligado: lembrete criado pelo alarme é apagado; lembrete importado
// de uma lista "Infopro" fica (é a própria tarefa), só perde a data.
const SCRIPT_DESLIGAR: &str = r#"
function run(argv) {
  const app = Application('Reminders');
  try {
    const lembrete = app.reminders.byId(argv[0]);
    if ((lembrete.body() || '') === argv[1]) { app.delete(lembrete); return 'apagado'; }
    lembrete.remindMeDate = null;
    lembrete.dueDate = null;
    return 'mantido';
  } catch (e) { return 'apagado'; }
}
"#;

const SCRIPT_MARCAR: &str = r#"
function run(argv) {
  const app = Application('Reminders');
  try { app.reminders.byId(argv[0]).completed = argv[1] === '1'; } catch (e) { /* já não existe */ }
  return 'ok';
}
"#;

// argv[0]: JSON com os ids vinculados a atividades; argv[1]: JSON com os
// nomes das listas dos projetos. Devolve o estado dos vinculados e os
// lembretes em aberto das listas que começam com "Infopro".
const SCRIPT_SINCRONIZAR: &str = r#"
function run(argv) {
  const app = Application('Reminders');
  const ids = JSON.parse(argv[0] || '[]');
  const data = (d) => (d ? d.getTime() : null);
  // Garante uma lista por projeto (argv[1]: JSON com os nomes).
  JSON.parse(argv[1] || '["Infopro"]').forEach((nome) => {
    if (app.lists.whose({ name: nome })().length === 0) app.make({ new: 'list', withProperties: { name: nome } });
  });
  // Lê cada lista "Infopro…" de uma vez (poucos eventos), em vez de
  // perguntar lembrete por lembrete — isso é o que deixava a sincronização lenta.
  const abertosPorId = {};
  const novos = [];
  const vinculados = {};
  ids.forEach((id) => { vinculados[id] = true; });
  app.lists.whose({ name: { _beginsWith: 'Infopro' } })().forEach((lista) => {
    const nomeLista = lista.name();
    const abertos = lista.reminders.whose({ completed: false });
    const rids = abertos.id();
    if (!rids.length) return;
    const nomes = abertos.name();
    const alertas = abertos.remindMeDate();
    const prazos = abertos.dueDate();
    const corpos = abertos.body();
    const prioridades = abertos.priority();
    rids.forEach((id, i) => {
      const item = { id: id, existe: true, concluido: false, data: data(alertas[i] || prazos[i]), nome: nomes[i], lista: nomeLista, notas: corpos[i] || '', prioridade: prioridades[i] };
      abertosPorId[id] = item;
      if (!vinculados[id]) novos.push({ id: id, nome: nomes[i], lista: nomeLista, data: item.data, notas: item.notas });
    });
  });
  // Vinculados que não estão em aberto numa lista "Infopro" (concluídos,
  // apagados ou em outra lista): esses poucos são consultados um a um.
  const estados = ids.map((id) => {
    if (abertosPorId[id]) return abertosPorId[id];
    try {
      const r = app.reminders.byId(id);
      return {
        id: id, existe: true, concluido: r.completed(), data: data(r.remindMeDate() || r.dueDate()),
        nome: r.name(), lista: r.container().name(), notas: r.body() || '', prioridade: r.priority(),
      };
    } catch (e) {
      return { id: id, existe: false, concluido: false, data: null };
    }
  });
  return JSON.stringify({ estados: estados, novos: novos });
}
"#;

fn rodar(script: &str, args: &[&str]) -> Result<String, String> {
    let mut filho = Command::new("osascript")
        .args(["-l", "JavaScript", "-e", script])
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    let inicio = Instant::now();
    let status = loop {
        if let Some(status) = filho.try_wait().map_err(|e| e.to_string())? {
            break status;
        }
        if inicio.elapsed() > TEMPO_MAXIMO {
            let _ = filho.kill();
            let _ = filho.wait();
            log::error!("Lembretes: o app Lembretes não respondeu em {}s", TEMPO_MAXIMO.as_secs());
            return Err("O app Lembretes não respondeu a tempo".into());
        }
        std::thread::sleep(Duration::from_millis(50));
    };
    let mut saida = String::new();
    let mut erro = String::new();
    if let Some(mut out) = filho.stdout.take() { let _ = out.read_to_string(&mut saida); }
    if let Some(mut err) = filho.stderr.take() { let _ = err.read_to_string(&mut erro); }
    if !status.success() {
        log::error!("Lembretes: {}", erro.trim());
        return Err(erro.trim().to_string());
    }
    Ok(saida.trim().to_string())
}

async fn em_segundo_plano(script: &'static str, args: Vec<String>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let refs: Vec<&str> = args.iter().map(String::as_str).collect();
        rodar(script, &refs)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// `itens_json`: [{ titulo, notas, lista, prioridade, quando }]. Devolve JSON com os ids.
#[tauri::command]
pub async fn lembretes_criar_lote(itens_json: String) -> Result<String, String> {
    em_segundo_plano(SCRIPT_CRIAR_LOTE, vec![itens_json]).await
}

#[tauri::command]
pub async fn lembrete_atualizar_dados(id: String, dados_json: String) -> Result<(), String> {
    em_segundo_plano(SCRIPT_ATUALIZAR_DADOS, vec![id, dados_json]).await.map(|_| ())
}

#[tauri::command]
pub async fn lembrete_remover(id: String) -> Result<(), String> {
    em_segundo_plano(SCRIPT_REMOVER, vec![id]).await.map(|_| ())
}

#[tauri::command]
pub async fn lembrete_atualizar(id: String, quando_ms: i64) -> Result<(), String> {
    em_segundo_plano(SCRIPT_ATUALIZAR, vec![id, quando_ms.to_string()]).await.map(|_| ())
}

/// Devolve "apagado" ou "mantido" (ver SCRIPT_DESLIGAR).
#[tauri::command]
pub async fn lembrete_desligar(id: String) -> Result<String, String> {
    em_segundo_plano(SCRIPT_DESLIGAR, vec![id, MARCA_ALARME.to_string()]).await
}

#[tauri::command]
pub async fn lembrete_marcar(id: String, concluido: bool) -> Result<(), String> {
    em_segundo_plano(SCRIPT_MARCAR, vec![id, if concluido { "1" } else { "0" }.to_string()]).await.map(|_| ())
}

/// `ids_json`: ids dos lembretes vinculados; `listas_json`: listas dos
/// projetos. Devolve JSON { estados, novos }.
#[tauri::command]
pub async fn lembretes_sincronizar(ids_json: String, listas_json: String) -> Result<String, String> {
    em_segundo_plano(SCRIPT_SINCRONIZAR, vec![ids_json, listas_json]).await
}
