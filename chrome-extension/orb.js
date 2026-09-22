// Injeta a orbe em páginas http/https normais (ver manifest.json — nunca em
// chrome://, na Web Store etc., o próprio Chrome bloqueia content scripts
// nelas). Tudo dentro de um Shadow DOM: a página host nunca vê nem
// consegue estilizar/quebrar a orbe, e o contrário também — puramente
// decorativo/isolado.
//
// O painel é uma mini versão navegável do Assistant web: header
// (voltar/título/expandir/fechar), banner de foco sempre visível, abas
// Hoje/Projeto/Kanban/Docs/Notas e uma pilha de navegação simples (nav)
// pra telas internas (tarefa, novo item, documento, nota). Mesma lógica e
// mesmos dados do app — nada é uma cópia paralela.
//
// Importante: este arquivo NUNCA toca chrome.storage.local/session
// diretamente (nem pra ler, nem pra escrever) — só troca mensagens
// {type, ...} com o background.js, que é o único lugar com acesso a essas
// áreas (restritas a TRUSTED_CONTEXTS) e o único que fala com o Supabase.

const ORB_SIZE = 60;
const MARGEM_PADRAO = 24;
const LIMIAR_ARRASTE_PX = 6;
const N_PONTOS_ANEL = 40;
const RAIO_ANEL = 38;
const REFERENCIA_SEM_ESTIMATIVA_SEGUNDOS = 25 * 60;
const MAX_TAREFAS_LISTA = 5;

function log(...args) {
  console.log("[Assistant]", ...args);
}

const EYE_SRCS = {
  1: chrome.runtime.getURL("assets/eye-1.png"),
  2: chrome.runtime.getURL("assets/eye-2.png"),
  3: chrome.runtime.getURL("assets/eye-3.png"),
  4: chrome.runtime.getURL("assets/eye-4.png"),
};

const CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  #root { position: fixed; z-index: 2147483647; }
  #orb { position: relative; width: ${ORB_SIZE}px; height: ${ORB_SIZE}px; border-radius: 999px; border: none; padding: 0; background: transparent; cursor: grab; transition: transform .25s ease; }
  #orb:hover { transform: scale(1.1); }
  #orb:active { cursor: grabbing; }
  #eyes { position: relative; width: 100%; height: 100%; }
  #eyes img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; opacity: 0; user-select: none; -webkit-user-drag: none; }
  #eyes img.on { opacity: 1; }
  #ring { position: absolute; inset: 0; pointer-events: none; }
  #ring span { position: absolute; left: 50%; top: 50%; width: 3px; height: 3px; border-radius: 999px; background: rgba(120,120,120,.25); }
  #ring span.on.active { background: #22d3ee; box-shadow: 0 0 4px 1px rgba(34,211,238,.9); }
  #ring span.on.paused { background: #fbbf24; box-shadow: 0 0 4px 1px rgba(251,191,36,.9); }
  #ring span.on.done { background: #34d399; box-shadow: 0 0 4px 1px rgba(52,211,153,.9); }

  #panel { position: absolute; bottom: calc(100% + 12px); right: 0; width: 320px; max-height: 480px; display: none; flex-direction: column; background: #16181d; color: #f2f2f2; border: 1px solid #2b2e35; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.4); font-size: 13px; overflow: hidden; }
  #panel.open { display: flex; }
  #panel.expanded { width: 430px; max-height: 600px; }

  #header { display: flex; align-items: center; gap: 4px; padding: 8px 6px 8px 10px; border-bottom: 1px solid #2b2e35; flex-shrink: 0; }
  #header .icon-btn { background: transparent; border: none; color: #9aa0aa; cursor: pointer; padding: 4px 7px; border-radius: 6px; font-size: 14px; line-height: 1; }
  #header .icon-btn:hover { background: #22252c; color: #f2f2f2; }
  #header .titulo-header { flex: 1; font-size: 12px; font-weight: 600; letter-spacing: .03em; text-transform: uppercase; color: #22d3ee; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  #banner { display: none; flex-direction: column; gap: 1px; padding: 8px 12px; background: #132025; border-bottom: 1px solid #2b2e35; cursor: pointer; flex-shrink: 0; }
  #banner.on { display: flex; }
  #banner .banner-tempo { font-variant-numeric: tabular-nums; font-weight: 700; color: #22d3ee; font-size: 13px; }
  #banner .banner-titulo { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: #9aa0aa; }

  #tabbar { display: flex; gap: 2px; padding: 6px 8px; border-bottom: 1px solid #2b2e35; overflow-x: auto; flex-shrink: 0; }
  #tabbar button { flex: 1; white-space: nowrap; background: transparent; border: none; color: #9aa0aa; font-size: 11px; font-weight: 600; padding: 6px 4px; border-radius: 6px; cursor: pointer; }
  #tabbar button.ativo { background: #22252c; color: #22d3ee; }

  #body { padding: 12px; overflow-y: auto; flex: 1; }
  #body h1 { font-size: 12px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: #22d3ee; margin: 0 0 6px; }
  #body .saudacao { font-size: 14px; font-weight: 500; margin: 0 0 2px; }
  #body .subtitulo { color: #9aa0aa; margin: 0 0 10px; }
  #body .titulo { font-size: 14px; font-weight: 500; margin: 0 0 4px; }
  #body .projeto { color: #9aa0aa; font-size: 12px; margin: 0 0 4px; }
  #body .tempo { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; margin: 8px 0 10px; }
  #body .vazio { color: #9aa0aa; margin: 0 0 10px; }
  #body .row { display: flex; gap: 6px; margin-bottom: 8px; }
  #body button.acao { flex: 1; border: none; border-radius: 8px; padding: 7px 8px; font-size: 12px; font-weight: 600; cursor: pointer; }
  #body button.acao:disabled { opacity: .6; cursor: default; }
  #body button.primaria { background: #22d3ee; color: #0b1220; }
  #body button.secundaria { background: #2b2e35; color: #f2f2f2; }
  #body button.link { display: block; width: 100%; margin-top: 6px; background: transparent; color: #9aa0aa; border: 1px solid #2b2e35; border-radius: 8px; padding: 7px 8px; font-size: 12px; cursor: pointer; }
  #body .secao { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .03em; color: #9aa0aa; margin: 10px 0 4px; }
  #body .secao.atrasada { color: #f87171; }
  #body ul.tarefas { list-style: none; margin: 0 0 4px; padding: 0; }
  #body ul.tarefas li button { width: 100%; text-align: left; background: transparent; border: none; color: #f2f2f2; padding: 5px 4px; border-radius: 6px; cursor: pointer; font-size: 13px; display: flex; align-items: center; gap: 6px; }
  #body ul.tarefas li button:hover { background: #22252c; }
  #body ul.tarefas li button .caixa { width: 12px; height: 12px; border: 1.5px solid #6b7280; border-radius: 3px; flex-shrink: 0; }
  #body ul.tarefas li button span.txt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #body .sessao-expirada { color: #fbbf24; margin: 0 0 10px; }

  .campo { margin-bottom: 8px; }
  .campo label { display: block; font-size: 11px; color: #9aa0aa; margin-bottom: 3px; }
  .campo input, .campo select, .campo textarea { width: 100%; background: #1c1f26; border: 1px solid #2b2e35; color: #f2f2f2; border-radius: 6px; padding: 6px 8px; font-size: 12px; font-family: inherit; }
  .campo textarea { min-height: 100px; resize: vertical; }

  .lista-projeto, .lista-doc, .lista-nota { list-style: none; margin: 0; padding: 0; }
  .lista-projeto li, .lista-doc li, .lista-nota li { margin-bottom: 4px; }
  .lista-projeto button, .lista-doc button, .lista-nota button { width: 100%; text-align: left; background: #1c1f26; border: 1px solid transparent; color: #f2f2f2; padding: 8px; border-radius: 6px; cursor: pointer; font-size: 12px; }
  .lista-projeto button:hover, .lista-doc button:hover, .lista-nota button:hover { border-color: rgba(34,211,238,.35); }
  .lista-projeto button.ativo { border-color: #22d3ee; color: #22d3ee; }

  .coluna-kanban { margin-bottom: 12px; }
  .coluna-kanban h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .03em; color: #9aa0aa; margin: 0 0 4px; font-weight: 600; }
  .card-kanban { display: flex; align-items: center; gap: 6px; padding: 6px; border-radius: 6px; background: #1c1f26; margin-bottom: 4px; }
  .card-kanban .card-titulo { flex: 1; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
  .card-kanban select { font-size: 10px; background: #22252c; border: 1px solid #2b2e35; color: #f2f2f2; border-radius: 4px; padding: 2px 4px; max-width: 84px; }
  .card-kanban .concluir-btn { background: transparent; border: none; color: #6b7280; cursor: pointer; font-size: 13px; padding: 2px 4px; }
  .card-kanban .concluir-btn:hover { color: #34d399; }

  .doc-conteudo { white-space: pre-wrap; font-size: 12px; line-height: 1.5; color: #d1d5db; max-height: 220px; overflow-y: auto; background: #1c1f26; border-radius: 6px; padding: 8px; margin-bottom: 10px; }
`;

function criarPontosAnel(svgHost) {
  const pontos = [];
  for (let i = 0; i < N_PONTOS_ANEL; i++) {
    const fracao = i / N_PONTOS_ANEL;
    const angulo = fracao * 360 - 90;
    const rad = (angulo * Math.PI) / 180;
    const x = Math.cos(rad) * RAIO_ANEL;
    const y = Math.sin(rad) * RAIO_ANEL;
    const el = document.createElement("span");
    el.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
    svgHost.appendChild(el);
    pontos.push({ el, fracao });
  }
  return pontos;
}

function formatarCronometro(segundos) {
  const s = Math.max(0, Math.round(segundos));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

// Mesmo critério de categoriaTarefa em useAssistantAtividades.ts: atrasada
// = venceu antes de hoje; hoje = vence hoje (ou, sem data de vencimento,
// está agendada pra hoje); o resto é "próxima".
function categoriaTarefa(t, hoje) {
  if (t.dataVencimento) {
    if (t.dataVencimento < hoje) return "atrasada";
    if (t.dataVencimento === hoje) return "hoje";
    return "proxima";
  }
  return t.dataAtividade === hoje ? "hoje" : "proxima";
}

function capitalizar(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "—";
}

// Reduz o HTML rico salvo em `documentos.conteudo` a texto simples pra
// leitura dentro do painel (item 6 — o editor completo continua só no
// sistema).
function textoLimpo(html) {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function clampPos(x, y) {
  return {
    x: Math.min(Math.max(x, 0), Math.max(0, window.innerWidth - ORB_SIZE)),
    y: Math.min(Math.max(y, 0), Math.max(0, window.innerHeight - ORB_SIZE)),
  };
}

function posicaoPadrao() {
  return clampPos(window.innerWidth - MARGEM_PADRAO - ORB_SIZE, window.innerHeight - MARGEM_PADRAO - ORB_SIZE);
}

async function main() {
  const host = document.createElement("div");
  host.id = "infopro-assistant-orb-host";
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = CSS;
  shadow.appendChild(style);

  const root = document.createElement("div");
  root.id = "root";
  shadow.appendChild(root);

  const orb = document.createElement("button");
  orb.id = "orb";
  orb.type = "button";
  orb.title = "Infopro Assistant";
  root.appendChild(orb);

  const ring = document.createElement("div");
  ring.id = "ring";
  orb.appendChild(ring);
  const pontosAnel = criarPontosAnel(ring);

  const eyes = document.createElement("div");
  eyes.id = "eyes";
  orb.appendChild(eyes);
  const eyeEls = {};
  [1, 2, 3, 4].forEach((f) => {
    const img = document.createElement("img");
    img.src = EYE_SRCS[f];
    img.alt = "";
    img.draggable = false;
    if (f === 1) img.classList.add("on");
    eyes.appendChild(img);
    eyeEls[f] = img;
  });

  // ---- painel: header fixo + banner de foco fixo + abas fixas + corpo rolável ----
  const panel = document.createElement("div");
  panel.id = "panel";
  root.appendChild(panel);

  const header = document.createElement("div");
  header.id = "header";
  panel.appendChild(header);

  const banner = document.createElement("div");
  banner.id = "banner";
  panel.appendChild(banner);

  const tabbar = document.createElement("div");
  tabbar.id = "tabbar";
  panel.appendChild(tabbar);

  const body = document.createElement("div");
  body.id = "body";
  panel.appendChild(body);

  // ---- estado (tudo via mensagem pro background — nunca chrome.storage direto) ----
  let focus = null;
  let tasks = [];
  let sessionExpired = false;
  let selectedProjectId = null;
  let panelSize = "compact";
  let tickId = null;
  let elementosCronometro = [];

  // Pilha simples de navegação (item 9): cada entrada é uma tela. Trocar de
  // aba na home TAMBÉM empilha (home→kanban→task-detail, ← volta uma de
  // cada vez, nunca direto pra home) — só fechar o painel reseta a pilha.
  let nav = [{ screen: "home", tab: "hoje" }];

  let projects = [];
  let projectsLoaded = false;
  let kanbanColunas = [];
  let kanbanCarregando = false;
  let docsCache = [];
  let notasCache = [];
  let docsNotasCarregando = false;

  // Item 8: pede o estado completo assim que a orbe é injetada, sem
  // esperar nenhum alarme/polling — já vem com posição/projeto/tamanho
  // preferidos junto, pra não precisar de idas extras ao background.
  log("GET_ASSISTANT_STATE");
  const inicial = await chrome.runtime.sendMessage({ type: "GET_ASSISTANT_STATE" });

  // ---- posição + arraste ----
  const posSalva = inicial?.orbPosition;
  const pos = posSalva && typeof posSalva.x === "number" && typeof posSalva.y === "number"
    ? clampPos(posSalva.x, posSalva.y)
    : posicaoPadrao();
  root.style.left = `${pos.x}px`;
  root.style.top = `${pos.y}px`;

  let drag = null;
  orb.addEventListener("pointerdown", (e) => {
    drag = { startX: e.clientX, startY: e.clientY, origX: parseFloat(root.style.left), origY: parseFloat(root.style.top), moveu: false };
  });
  window.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moveu && Math.hypot(dx, dy) > LIMIAR_ARRASTE_PX) drag.moveu = true;
    if (!drag.moveu) return;
    const novo = clampPos(drag.origX + dx, drag.origY + dy);
    root.style.left = `${novo.x}px`;
    root.style.top = `${novo.y}px`;
  });
  window.addEventListener("pointerup", () => {
    if (!drag) return;
    if (drag.moveu) {
      chrome.runtime.sendMessage({
        type: "SET_ORB_POSITION",
        position: { x: parseFloat(root.style.left), y: parseFloat(root.style.top) },
      });
    } else {
      panel.classList.toggle("open");
      if (panel.classList.contains("open")) renderPanel();
    }
    drag = null;
  });
  window.addEventListener("resize", () => {
    const novo = clampPos(parseFloat(root.style.left), parseFloat(root.style.top));
    root.style.left = `${novo.x}px`;
    root.style.top = `${novo.y}px`;
  });

  // ---- olhos: pisca/olha de lado em intervalos variados, sempre volta pro 1 ----
  function mostrarFrame(f) {
    Object.values(eyeEls).forEach((img) => img.classList.remove("on"));
    eyeEls[f].classList.add("on");
  }
  function agendarProximoGesto() {
    const espera = 2500 + Math.random() * 3500;
    setTimeout(() => {
      const piscar = Math.random() < 0.7;
      if (piscar) {
        mostrarFrame(4);
        setTimeout(() => { mostrarFrame(1); agendarProximoGesto(); }, 120 + Math.random() * 60);
      } else {
        mostrarFrame(Math.random() < 0.5 ? 2 : 3);
        setTimeout(() => { mostrarFrame(1); agendarProximoGesto(); }, 450 + Math.random() * 250);
      }
    }, espera);
  }
  agendarProximoGesto();

  function estadoAnel() {
    if (!focus) return null;
    return focus.status === "active" ? "active" : "paused";
  }

  function atualizarAnel() {
    const estado = estadoAnel();
    if (!estado) {
      pontosAnel.forEach(({ el }) => el.classList.remove("on", "active", "paused", "done"));
      return;
    }
    const referencia = (focus.tempoEstimadoMin ? focus.tempoEstimadoMin * 60 : REFERENCIA_SEM_ESTIMATIVA_SEGUNDOS);
    const fracaoAcesa = Math.min(1, focus.elapsedSegundos / referencia);
    pontosAnel.forEach(({ el, fracao }) => {
      el.classList.toggle("on", fracao <= fracaoAcesa);
      el.classList.remove("active", "paused", "done");
      if (fracao <= fracaoAcesa) el.classList.add(estado);
    });
  }

  // ---- navegação (item 9): push empilha, pop volta uma tela por vez ----
  function push(entry) {
    nav.push(entry);
    renderPanel();
  }
  function pop() {
    if (nav.length <= 1) return;
    nav.pop();
    renderPanel();
    atualizarDadosDaTabAtual();
  }
  function telaAtual() {
    return nav[nav.length - 1];
  }
  function trocarTab(tab) {
    const atual = telaAtual();
    if (atual.screen === "home" && atual.tab === tab) return;
    nav.push({ screen: "home", tab });
    renderPanel();
    carregarDadosDaTab(tab);
  }
  function fecharPainel() {
    panel.classList.remove("open");
    nav = [{ screen: "home", tab: "hoje" }];
  }
  function alternarTamanho() {
    panelSize = panelSize === "expanded" ? "compact" : "expanded";
    panel.classList.toggle("expanded", panelSize === "expanded");
    chrome.runtime.sendMessage({ type: "SET_PANEL_SIZE", size: panelSize });
    renderHeader();
  }

  function tasksFiltradasPorProjeto() {
    return selectedProjectId ? tasks.filter((t) => (t.clienteId ?? null) === selectedProjectId) : tasks;
  }

  function atualizarDadosDaTabAtual() {
    const entry = telaAtual();
    if (entry.screen === "home") carregarDadosDaTab(entry.tab);
  }

  async function carregarDadosDaTab(tab) {
    if (tab === "projeto" && !projectsLoaded) {
      const resp = await chrome.runtime.sendMessage({ type: "GET_PROJECTS" });
      projects = resp?.projects ?? [];
      projectsLoaded = true;
      renderPanel();
    } else if (tab === "kanban") {
      kanbanCarregando = true;
      renderPanel();
      const resp = await chrome.runtime.sendMessage({ type: "GET_COLUMNS", projectId: selectedProjectId });
      kanbanColunas = resp?.columns ?? [];
      kanbanCarregando = false;
      renderPanel();
    } else if (tab === "docs" || tab === "notas") {
      if (!selectedProjectId) return;
      docsNotasCarregando = true;
      renderPanel();
      const resp = await chrome.runtime.sendMessage({ type: "GET_DOCS_NOTES", projectId: selectedProjectId });
      docsCache = resp?.docs ?? [];
      notasCache = resp?.notes ?? [];
      docsNotasCarregando = false;
      renderPanel();
    }
  }

  function selecionarProjeto(id) {
    selectedProjectId = id;
    chrome.runtime.sendMessage({ type: "SET_SELECTED_PROJECT", projectId: id });
    kanbanColunas = [];
    docsCache = [];
    notasCache = [];
    renderPanel();
    atualizarDadosDaTabAtual();
  }

  // ---- header/banner/tabs ----
  function tituloDaTela(entry) {
    switch (entry.screen) {
      case "home": return "✦ Assistente";
      case "task-detail": return "Tarefa";
      case "new-activity": return "Nova atividade";
      case "doc-view": return "Documento";
      case "new-doc": return "Novo documento";
      case "note-edit": return entry.noteId ? "Editar nota" : "Nova nota";
      default: return "✦ Assistente";
    }
  }

  function renderHeader() {
    header.textContent = "";
    if (nav.length > 1 && !sessionExpired) {
      const back = document.createElement("button");
      back.className = "icon-btn";
      back.textContent = "←";
      back.title = "Voltar";
      back.onclick = pop;
      header.appendChild(back);
    }
    const titulo = document.createElement("span");
    titulo.className = "titulo-header";
    titulo.textContent = sessionExpired ? "Sessão expirada" : tituloDaTela(telaAtual());
    header.appendChild(titulo);

    const expandBtn = document.createElement("button");
    expandBtn.className = "icon-btn";
    expandBtn.textContent = panelSize === "expanded" ? "⤡" : "⤢";
    expandBtn.title = panelSize === "expanded" ? "Recolher painel" : "Expandir painel";
    expandBtn.onclick = alternarTamanho;
    header.appendChild(expandBtn);

    const closeBtn = document.createElement("button");
    closeBtn.className = "icon-btn";
    closeBtn.textContent = "×";
    closeBtn.title = "Fechar";
    closeBtn.onclick = fecharPainel;
    header.appendChild(closeBtn);
  }

  // Item 8: banner fixo em QUALQUER tela sempre que houver foco — clicar
  // nele abre a tela da tarefa em foco, sem tirar o cronômetro do ar (ele
  // segue rodando mesmo navegando, ver tick() mais abaixo).
  function renderBanner() {
    banner.textContent = "";
    if (!focus) {
      banner.classList.remove("on");
      return;
    }
    banner.classList.add("on");
    const linha1 = document.createElement("div");
    linha1.className = "banner-tempo";
    const emojiSpan = document.createElement("span");
    emojiSpan.textContent = (focus.status === "active" ? "🔥 " : "⏸ ");
    const tempoSpan = document.createElement("span");
    tempoSpan.textContent = formatarCronometro(focus.elapsedSegundos);
    elementosCronometro.push(tempoSpan);
    linha1.appendChild(emojiSpan);
    linha1.appendChild(tempoSpan);
    const linha2 = document.createElement("div");
    linha2.className = "banner-titulo";
    linha2.textContent = focus.titulo;
    banner.appendChild(linha1);
    banner.appendChild(linha2);
    banner.onclick = () => {
      const atual = telaAtual();
      if (atual.screen === "task-detail" && atual.taskId === focus.taskId) return;
      push({ screen: "task-detail", taskId: focus.taskId });
    };
  }

  function renderTabBar() {
    tabbar.textContent = "";
    const entry = telaAtual();
    if (entry.screen !== "home") {
      tabbar.style.display = "none";
      return;
    }
    tabbar.style.display = "";
    [["hoje", "Hoje"], ["projeto", "Projeto"], ["kanban", "Kanban"], ["docs", "Docs"], ["notas", "Notas"]].forEach(([chave, label]) => {
      const btn = document.createElement("button");
      btn.textContent = label;
      if (entry.tab === chave) btn.classList.add("ativo");
      btn.onclick = () => trocarTab(chave);
      tabbar.appendChild(btn);
    });
  }

  function botaoAbrirSistema(texto) {
    const btn = document.createElement("button");
    btn.className = "link";
    btn.textContent = texto || "Abrir sistema";
    btn.onclick = () => window.open(INFOPRO_CONFIG.APP_URL, "_blank", "noopener");
    return btn;
  }

  function criarCampo(label) {
    const div = document.createElement("div");
    div.className = "campo";
    const l = document.createElement("label");
    l.textContent = label;
    div.appendChild(l);
    return div;
  }

  // ---- aba Hoje (item 2) ----
  function criarItemTarefa(t) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    const caixa = document.createElement("span");
    caixa.className = "caixa";
    const txt = document.createElement("span");
    txt.className = "txt";
    txt.textContent = t.titulo;
    btn.appendChild(caixa);
    btn.appendChild(txt);
    btn.onclick = () => push({ screen: "task-detail", taskId: t.id });
    li.appendChild(btn);
    return li;
  }

  function renderTabHoje() {
    const saudacao = document.createElement("p");
    saudacao.className = "saudacao";
    saudacao.textContent = "Olá 👋";
    body.appendChild(saudacao);

    const subtitulo = document.createElement("p");
    subtitulo.className = "subtitulo";
    subtitulo.textContent = "O que vamos fazer agora?";
    body.appendChild(subtitulo);

    const lista = tasksFiltradasPorProjeto();
    if (lista.length === 0) {
      const vazio = document.createElement("p");
      vazio.className = "vazio";
      vazio.textContent = "Nenhuma tarefa pendente por aqui. 🎉";
      body.appendChild(vazio);
    } else {
      const hoje = new Date().toISOString().slice(0, 10);
      const grupos = { atrasada: [], hoje: [], proxima: [] };
      lista.forEach((t) => grupos[categoriaTarefa(t, hoje)].push(t));
      const topo = [...grupos.atrasada, ...grupos.hoje, ...grupos.proxima].slice(0, MAX_TAREFAS_LISTA);
      const topoIds = new Set(topo.map((t) => t.id));
      [
        { chave: "atrasada", titulo: "⚠️ Atrasadas" },
        { chave: "hoje", titulo: "Hoje" },
        { chave: "proxima", titulo: "Próximas" },
      ].forEach(({ chave, titulo }) => {
        const itens = grupos[chave].filter((t) => topoIds.has(t.id));
        if (itens.length === 0) return;
        const h2 = document.createElement("p");
        h2.className = `secao${chave === "atrasada" ? " atrasada" : ""}`;
        h2.textContent = titulo;
        body.appendChild(h2);
        const ul = document.createElement("ul");
        ul.className = "tarefas";
        itens.forEach((t) => ul.appendChild(criarItemTarefa(t)));
        body.appendChild(ul);
      });
    }
    body.appendChild(botaoAbrirSistema("Ver todas"));
  }

  // ---- aba Projeto (item 3) ----
  function renderTabProjeto() {
    const ul = document.createElement("ul");
    ul.className = "lista-projeto";

    const liTodos = document.createElement("li");
    const btnTodos = document.createElement("button");
    btnTodos.textContent = "Todos os projetos";
    if (!selectedProjectId) btnTodos.classList.add("ativo");
    btnTodos.onclick = () => selecionarProjeto(null);
    liTodos.appendChild(btnTodos);
    ul.appendChild(liTodos);

    projects.forEach((p) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.textContent = p.nome;
      if (selectedProjectId === p.id) btn.classList.add("ativo");
      btn.onclick = () => selecionarProjeto(p.id);
      li.appendChild(btn);
      ul.appendChild(li);
    });
    body.appendChild(ul);

    if (!projectsLoaded) {
      const p = document.createElement("p");
      p.className = "vazio";
      p.textContent = "Carregando projetos...";
      body.appendChild(p);
    }
  }

  // ---- aba Kanban (itens 4-5) ----
  function criarCardKanban(t, colunaAtual) {
    const card = document.createElement("div");
    card.className = "card-kanban";

    const titulo = document.createElement("span");
    titulo.className = "card-titulo";
    titulo.textContent = t.titulo;
    titulo.title = t.titulo;
    titulo.onclick = () => push({ screen: "task-detail", taskId: t.id });
    card.appendChild(titulo);

    if (!colunaAtual.ehConclusao) {
      const check = document.createElement("button");
      check.className = "concluir-btn";
      check.textContent = "✓";
      check.title = "Concluir";
      check.onclick = async (e) => {
        e.stopPropagation();
        await chrome.runtime.sendMessage({ type: "COMPLETE", taskId: t.id });
      };
      card.appendChild(check);
    }

    if (kanbanColunas.length > 1) {
      const mover = document.createElement("select");
      const optAtual = document.createElement("option");
      optAtual.textContent = "Mover...";
      optAtual.value = "";
      mover.appendChild(optAtual);
      kanbanColunas.filter((c) => c.statusKey !== colunaAtual.statusKey).forEach((c) => {
        const opt = document.createElement("option");
        opt.value = c.statusKey;
        opt.textContent = c.nome;
        mover.appendChild(opt);
      });
      mover.onclick = (e) => e.stopPropagation();
      mover.onchange = async () => {
        const destino = kanbanColunas.find((c) => c.statusKey === mover.value);
        if (!destino) return;
        await chrome.runtime.sendMessage({ type: "MOVE_ACTIVITY", id: t.id, statusKey: destino.statusKey, ehConclusao: destino.ehConclusao });
      };
      card.appendChild(mover);
    }

    return card;
  }

  function renderTabKanban() {
    const topo = document.createElement("div");
    topo.className = "row";
    const novo = document.createElement("button");
    novo.className = "acao secundaria";
    novo.textContent = "+ Nova atividade";
    novo.onclick = () => push({ screen: "new-activity" });
    topo.appendChild(novo);
    body.appendChild(topo);

    if (kanbanCarregando) {
      const p = document.createElement("p");
      p.className = "vazio";
      p.textContent = "Carregando quadro...";
      body.appendChild(p);
      return;
    }
    if (kanbanColunas.length === 0) {
      const p = document.createElement("p");
      p.className = "vazio";
      p.textContent = "Nenhuma coluna encontrada.";
      body.appendChild(p);
      return;
    }

    const lista = tasksFiltradasPorProjeto();
    kanbanColunas.forEach((coluna) => {
      const itens = lista.filter((t) => t.status === coluna.statusKey).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
      const wrap = document.createElement("div");
      wrap.className = "coluna-kanban";
      const h3 = document.createElement("h3");
      h3.textContent = `${coluna.nome} (${itens.length})`;
      wrap.appendChild(h3);
      itens.forEach((t) => wrap.appendChild(criarCardKanban(t, coluna)));
      body.appendChild(wrap);
    });
  }

  // ---- Nova atividade (item 5) ----
  function renderNewActivity() {
    const estadoForm = { clienteId: selectedProjectId };

    const campoTitulo = criarCampo("Título");
    const inputTitulo = document.createElement("input");
    inputTitulo.type = "text";
    inputTitulo.placeholder = "O que precisa ser feito?";
    campoTitulo.appendChild(inputTitulo);
    body.appendChild(campoTitulo);

    const campoProjeto = criarCampo("Projeto");
    const selectProjeto = document.createElement("select");
    const optPessoal = document.createElement("option");
    optPessoal.value = "";
    optPessoal.textContent = "Pessoal (sem projeto)";
    selectProjeto.appendChild(optPessoal);
    projects.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.nome;
      selectProjeto.appendChild(opt);
    });
    selectProjeto.value = selectedProjectId ?? "";
    campoProjeto.appendChild(selectProjeto);
    body.appendChild(campoProjeto);

    const row1 = document.createElement("div");
    row1.className = "row";
    const campoData = criarCampo("Data");
    const inputData = document.createElement("input");
    inputData.type = "date";
    inputData.value = new Date().toISOString().slice(0, 10);
    campoData.appendChild(inputData);
    const campoEstimativa = criarCampo("Estimativa (min)");
    const inputEstimativa = document.createElement("input");
    inputEstimativa.type = "number";
    inputEstimativa.min = "0";
    inputEstimativa.placeholder = "40";
    campoEstimativa.appendChild(inputEstimativa);
    row1.appendChild(campoData);
    row1.appendChild(campoEstimativa);
    body.appendChild(row1);

    const row2 = document.createElement("div");
    row2.className = "row";
    const campoPrioridade = criarCampo("Prioridade");
    const selectPrioridade = document.createElement("select");
    [["baixa", "Baixa"], ["media", "Média"], ["alta", "Alta"], ["urgente", "Urgente"]].forEach(([v, l]) => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = l;
      selectPrioridade.appendChild(opt);
    });
    selectPrioridade.value = "media";
    campoPrioridade.appendChild(selectPrioridade);

    const campoStatus = criarCampo("Status");
    const selectStatus = document.createElement("select");
    campoStatus.appendChild(selectStatus);

    row2.appendChild(campoPrioridade);
    row2.appendChild(campoStatus);
    body.appendChild(row2);

    async function carregarColunasDoForm(clienteId) {
      selectStatus.textContent = "";
      const optCarregando = document.createElement("option");
      optCarregando.textContent = "Carregando...";
      selectStatus.appendChild(optCarregando);
      const resp = await chrome.runtime.sendMessage({ type: "GET_COLUMNS", projectId: clienteId });
      const colunas = resp?.columns ?? [];
      selectStatus.textContent = "";
      colunas.forEach((c) => {
        const opt = document.createElement("option");
        opt.value = c.statusKey;
        opt.textContent = c.nome;
        selectStatus.appendChild(opt);
      });
    }
    carregarColunasDoForm(estadoForm.clienteId);

    selectProjeto.onchange = () => {
      estadoForm.clienteId = selectProjeto.value || null;
      carregarColunasDoForm(estadoForm.clienteId);
    };

    const acoes = document.createElement("div");
    acoes.className = "row";
    const btnCriar = document.createElement("button");
    btnCriar.className = "acao primaria";
    btnCriar.textContent = "Criar";
    btnCriar.onclick = async () => {
      if (!inputTitulo.value.trim()) return;
      btnCriar.disabled = true;
      btnCriar.textContent = "Criando...";
      const resp = await chrome.runtime.sendMessage({
        type: "CREATE_ACTIVITY",
        titulo: inputTitulo.value.trim(),
        projectId: estadoForm.clienteId,
        data: inputData.value,
        estimativa: inputEstimativa.value ? Number(inputEstimativa.value) : null,
        prioridade: selectPrioridade.value,
        statusKey: selectStatus.value || "backlog",
      });
      if (resp?.task) {
        pop();
      } else {
        btnCriar.disabled = false;
        btnCriar.textContent = "Criar";
      }
    };
    const btnCancelar = document.createElement("button");
    btnCancelar.className = "acao secundaria";
    btnCancelar.textContent = "Cancelar";
    btnCancelar.onclick = pop;
    acoes.appendChild(btnCriar);
    acoes.appendChild(btnCancelar);
    body.appendChild(acoes);
  }

  // ---- Tarefa (item 2, tela de detalhe) ----
  function renderTaskDetail(taskId) {
    const tarefa = tasks.find((t) => t.id === taskId);
    if (!tarefa) {
      const p = document.createElement("p");
      p.className = "vazio";
      p.textContent = "Essa tarefa não está mais disponível.";
      body.appendChild(p);
      return;
    }

    const titulo = document.createElement("p");
    titulo.className = "titulo";
    titulo.textContent = tarefa.titulo;
    body.appendChild(titulo);

    if (tarefa.projeto) {
      const projeto = document.createElement("p");
      projeto.className = "projeto";
      projeto.textContent = tarefa.projeto;
      body.appendChild(projeto);
    }

    [
      ["Prazo", tarefa.dataVencimento || tarefa.dataAtividade],
      ["Estimativa", tarefa.tempoEstimadoMin ? `${tarefa.tempoEstimadoMin} min` : "—"],
      ["Prioridade", capitalizar(tarefa.prioridade)],
    ].forEach(([label, valor]) => {
      const p = document.createElement("p");
      p.className = "projeto";
      p.textContent = `${label}: ${valor}`;
      body.appendChild(p);
    });

    const emFoco = focus && focus.taskId === taskId;

    if (emFoco) {
      const tempo = document.createElement("p");
      tempo.className = "tempo";
      tempo.textContent = formatarCronometro(focus.elapsedSegundos);
      elementosCronometro.push(tempo);
      body.appendChild(tempo);

      const row = document.createElement("div");
      row.className = "row";
      const btnPrincipal = document.createElement("button");
      btnPrincipal.className = "acao secundaria";
      btnPrincipal.textContent = focus.status === "active" ? "Pausar" : "Retomar";
      btnPrincipal.onclick = () => enviarAcao(focus.status === "active" ? "PAUSE" : "RESUME");
      row.appendChild(btnPrincipal);
      const btnConcluir = document.createElement("button");
      btnConcluir.className = "acao primaria";
      btnConcluir.textContent = "Concluir";
      btnConcluir.onclick = () => enviarAcao("COMPLETE");
      row.appendChild(btnConcluir);
      body.appendChild(row);
    } else {
      const row = document.createElement("div");
      row.className = "row";
      const btnFoco = document.createElement("button");
      btnFoco.className = "acao primaria";
      btnFoco.textContent = "▶ Iniciar foco";
      btnFoco.onclick = () => iniciarFoco(taskId);
      row.appendChild(btnFoco);
      const btnConcluir = document.createElement("button");
      btnConcluir.className = "acao secundaria";
      btnConcluir.textContent = "✓ Concluir";
      btnConcluir.onclick = async () => {
        await chrome.runtime.sendMessage({ type: "COMPLETE", taskId });
        pop();
      };
      row.appendChild(btnConcluir);
      body.appendChild(row);

      const btnTrocar = document.createElement("button");
      btnTrocar.className = "link";
      btnTrocar.textContent = "Trocar tarefa";
      btnTrocar.onclick = pop;
      body.appendChild(btnTrocar);
    }
  }

  async function iniciarFoco(taskId) {
    await chrome.runtime.sendMessage({ type: "START_FOCUS", taskId });
    const resp = await chrome.runtime.sendMessage({ type: "GET_CURRENT_FOCUS" });
    aplicarFocus(resp?.focus ?? null);
  }

  async function enviarAcao(tipo) {
    if (!focus) return;
    await chrome.runtime.sendMessage({ type: tipo, taskId: focus.taskId });
    if (tipo === "COMPLETE") {
      pop();
      return;
    }
    const resp = await chrome.runtime.sendMessage({ type: "GET_CURRENT_FOCUS" });
    aplicarFocus(resp?.focus ?? null);
  }

  // ---- aba Docs (item 6) ----
  function renderTabDocs() {
    const topo = document.createElement("div");
    topo.className = "row";
    const novo = document.createElement("button");
    novo.className = "acao secundaria";
    novo.textContent = "+ Novo documento";
    novo.disabled = !selectedProjectId;
    novo.onclick = () => push({ screen: "new-doc" });
    topo.appendChild(novo);
    body.appendChild(topo);

    if (!selectedProjectId) {
      const p = document.createElement("p");
      p.className = "vazio";
      p.textContent = "Selecione um projeto na aba Projeto pra ver os documentos.";
      body.appendChild(p);
      return;
    }
    if (docsNotasCarregando) {
      const p = document.createElement("p");
      p.className = "vazio";
      p.textContent = "Carregando...";
      body.appendChild(p);
      return;
    }
    if (docsCache.length === 0) {
      const p = document.createElement("p");
      p.className = "vazio";
      p.textContent = "Nenhum documento neste projeto ainda.";
      body.appendChild(p);
      return;
    }
    const ul = document.createElement("ul");
    ul.className = "lista-doc";
    docsCache.forEach((d) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.textContent = d.titulo || "Sem título";
      btn.onclick = () => push({ screen: "doc-view", docId: d.id });
      li.appendChild(btn);
      ul.appendChild(li);
    });
    body.appendChild(ul);
  }

  function renderNewDoc() {
    const campo = criarCampo("Título");
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Nome do documento";
    campo.appendChild(input);
    body.appendChild(campo);

    const acoes = document.createElement("div");
    acoes.className = "row";
    const btnCriar = document.createElement("button");
    btnCriar.className = "acao primaria";
    btnCriar.textContent = "Criar";
    btnCriar.onclick = async () => {
      if (!input.value.trim()) return;
      btnCriar.disabled = true;
      const resp = await chrome.runtime.sendMessage({ type: "CREATE_DOC", projectId: selectedProjectId, titulo: input.value.trim() });
      if (resp?.doc) pop();
      else btnCriar.disabled = false;
    };
    const btnCancelar = document.createElement("button");
    btnCancelar.className = "acao secundaria";
    btnCancelar.textContent = "Cancelar";
    btnCancelar.onclick = pop;
    acoes.appendChild(btnCriar);
    acoes.appendChild(btnCancelar);
    body.appendChild(acoes);

    const aviso = document.createElement("p");
    aviso.className = "vazio";
    aviso.textContent = "O conteúdo completo (texto rico) só pode ser editado no sistema.";
    body.appendChild(aviso);
  }

  function renderDocView(docId) {
    const doc = docsCache.find((d) => d.id === docId);
    if (!doc) {
      const p = document.createElement("p");
      p.className = "vazio";
      p.textContent = "Documento não encontrado.";
      body.appendChild(p);
      body.appendChild(botaoAbrirSistema("Abrir no sistema"));
      return;
    }
    const titulo = document.createElement("p");
    titulo.className = "titulo";
    titulo.textContent = doc.titulo || "Sem título";
    body.appendChild(titulo);

    const conteudo = document.createElement("div");
    conteudo.className = "doc-conteudo";
    conteudo.textContent = textoLimpo(doc.conteudo) || "(sem conteúdo)";
    body.appendChild(conteudo);

    body.appendChild(botaoAbrirSistema("Abrir no sistema"));
  }

  // ---- aba Notas (item 7) ----
  function renderTabNotas() {
    const topo = document.createElement("div");
    topo.className = "row";
    const novo = document.createElement("button");
    novo.className = "acao secundaria";
    novo.textContent = "+ Nova nota";
    novo.disabled = !selectedProjectId;
    novo.onclick = () => push({ screen: "note-edit", noteId: null });
    topo.appendChild(novo);
    body.appendChild(topo);

    if (!selectedProjectId) {
      const p = document.createElement("p");
      p.className = "vazio";
      p.textContent = "Selecione um projeto na aba Projeto pra ver as notas.";
      body.appendChild(p);
      return;
    }
    if (docsNotasCarregando) {
      const p = document.createElement("p");
      p.className = "vazio";
      p.textContent = "Carregando...";
      body.appendChild(p);
      return;
    }
    if (notasCache.length === 0) {
      const p = document.createElement("p");
      p.className = "vazio";
      p.textContent = "Nenhuma nota neste projeto ainda.";
      body.appendChild(p);
      return;
    }
    const ul = document.createElement("ul");
    ul.className = "lista-nota";
    notasCache.forEach((n) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.textContent = n.titulo || "Nota sem título";
      btn.onclick = () => push({ screen: "note-edit", noteId: n.id });
      li.appendChild(btn);
      ul.appendChild(li);
    });
    body.appendChild(ul);
  }

  function renderNoteEdit(noteId) {
    const nota = noteId ? notasCache.find((n) => n.id === noteId) : null;

    const campoTitulo = criarCampo("Título");
    const inputTitulo = document.createElement("input");
    inputTitulo.type = "text";
    inputTitulo.value = nota?.titulo || "";
    inputTitulo.placeholder = "Nome da nota";
    campoTitulo.appendChild(inputTitulo);
    body.appendChild(campoTitulo);

    const campoConteudo = criarCampo("Conteúdo");
    const textarea = document.createElement("textarea");
    textarea.value = nota?.conteudo || "";
    campoConteudo.appendChild(textarea);
    body.appendChild(campoConteudo);

    const acoes = document.createElement("div");
    acoes.className = "row";
    const btnSalvar = document.createElement("button");
    btnSalvar.className = "acao primaria";
    btnSalvar.textContent = "Salvar";
    btnSalvar.onclick = async () => {
      btnSalvar.disabled = true;
      btnSalvar.textContent = "Salvando...";
      const resp = noteId
        ? await chrome.runtime.sendMessage({ type: "UPDATE_NOTE", id: noteId, titulo: inputTitulo.value.trim(), conteudo: textarea.value })
        : await chrome.runtime.sendMessage({ type: "CREATE_NOTE", projectId: selectedProjectId, titulo: inputTitulo.value.trim(), conteudo: textarea.value });
      if (resp?.ok || resp?.note) {
        pop();
      } else {
        btnSalvar.disabled = false;
        btnSalvar.textContent = "Salvar";
      }
    };
    const btnCancelar = document.createElement("button");
    btnCancelar.className = "acao secundaria";
    btnCancelar.textContent = "Cancelar";
    btnCancelar.onclick = pop;
    acoes.appendChild(btnSalvar);
    acoes.appendChild(btnCancelar);
    body.appendChild(acoes);
  }

  // ---- sessão expirada (item 5 do endurecimento anterior) ----
  function renderSessaoExpirada() {
    const aviso = document.createElement("p");
    aviso.className = "sessao-expirada";
    aviso.textContent = "Sessão expirada — entrar novamente";
    body.appendChild(aviso);
    body.appendChild(botaoAbrirSistema("Entrar novamente"));
  }

  function renderBody() {
    body.textContent = "";
    const entry = telaAtual();
    switch (entry.screen) {
      case "home":
        if (entry.tab === "hoje") renderTabHoje();
        else if (entry.tab === "projeto") renderTabProjeto();
        else if (entry.tab === "kanban") renderTabKanban();
        else if (entry.tab === "docs") renderTabDocs();
        else if (entry.tab === "notas") renderTabNotas();
        break;
      case "task-detail": renderTaskDetail(entry.taskId); break;
      case "new-activity": renderNewActivity(); break;
      case "doc-view": renderDocView(entry.docId); break;
      case "new-doc": renderNewDoc(); break;
      case "note-edit": renderNoteEdit(entry.noteId); break;
      default: renderTabHoje();
    }
  }

  // Telas de formulário têm input em andamento (texto digitado, seleção
  // feita) que uma reconstrução de DOM apagaria — nelas, uma atualização
  // passiva (foco/tarefas mudando em outra aba, por exemplo) NUNCA deve
  // recriar o corpo do painel, só o header/banner/abas (que não guardam
  // nada digitado pelo usuário).
  function telaEhFormulario(entry) {
    return entry.screen === "new-activity" || entry.screen === "new-doc" || entry.screen === "note-edit";
  }

  // Reconstrói header/banner/abas/corpo a partir do estado atual — usada
  // pra navegação explícita (push/pop/trocar aba/trocar projeto), onde
  // trocar de tela SEMPRE deve desenhar a tela nova do zero.
  function renderPanel() {
    elementosCronometro = [];
    renderHeader();
    if (sessionExpired) {
      banner.classList.remove("on");
      tabbar.style.display = "none";
      body.textContent = "";
      renderSessaoExpirada();
      return;
    }
    renderBanner();
    renderTabBar();
    renderBody();
  }

  // Mesma reconstrução, mas usada pra atualizações PASSIVAS (chegou um
  // ASSISTANT_STATE_CHANGED — foco/tarefas/sessão mudaram em outro lugar):
  // header/banner/abas sempre atualizam (não têm estado do usuário), mas o
  // corpo só é reconstruído se a tela atual NÃO for um formulário — assim
  // nav stack, aba atual e o que já foi digitado sobrevivem à atualização.
  // NUNCA chamada a cada segundo — o ponteiro do relógio (tick, abaixo) só
  // atualiza texto pontual via elementosCronometro, sem reconstruir nada.
  function renderPanelPreservandoTela() {
    elementosCronometro = [];
    renderHeader();
    if (sessionExpired) {
      banner.classList.remove("on");
      tabbar.style.display = "none";
      body.textContent = "";
      renderSessaoExpirada();
      return;
    }
    renderBanner();
    renderTabBar();
    if (telaEhFormulario(telaAtual())) return;
    renderBody();
  }

  function tick() {
    if (!focus || focus.status !== "active") return;
    focus = { ...focus, elapsedSegundos: focus.elapsedSegundos + 1 };
    atualizarAnel();
    const texto = formatarCronometro(focus.elapsedSegundos);
    elementosCronometro.forEach((el) => { el.textContent = texto; });
  }

  function aplicarFocus(novoFocus) {
    focus = novoFocus;
    log("focus recebido");
    atualizarAnel();
    clearInterval(tickId);
    if (focus && focus.status === "active") tickId = setInterval(tick, 1000);
    if (panel.classList.contains("open")) renderPanelPreservandoTela();
  }

  function aplicarTasks(novasTasks) {
    tasks = Array.isArray(novasTasks) ? novasTasks : [];
    log("tasks recebidas:", tasks.length);
    if (panel.classList.contains("open")) renderPanelPreservandoTela();
  }

  function aplicarSessionExpired(valor) {
    const mudou = sessionExpired !== !!valor;
    sessionExpired = !!valor;
    if (mudou && panel.classList.contains("open")) renderPanelPreservandoTela();
  }

  // Sincroniza o projeto selecionado quando ele muda em OUTRA aba (item 1
  // do endurecimento de navegação) — recalcula os caches específicos de
  // projeto (colunas do Kanban, docs, notas) e, se a tela atual é uma das
  // que dependem disso, refaz a busca; se o usuário está num formulário,
  // só atualiza a variável (o formulário em si não é afetado — ele já
  // capturou o projeto escolhido no próprio estado local do form).
  function aplicarSelectedProjectId(novoId) {
    const id = novoId ?? null;
    if (selectedProjectId === id) return;
    selectedProjectId = id;
    kanbanColunas = [];
    docsCache = [];
    notasCache = [];
    if (!panel.classList.contains("open")) return;
    renderPanelPreservandoTela();
    atualizarDadosDaTabAtual();
  }

  // Idem pro tamanho do painel — só a classe CSS + ícone do header mudam,
  // nunca o corpo, então é seguro em qualquer tela (inclusive formulário).
  function aplicarPanelSize(novoTamanho) {
    const tamanho = novoTamanho === "expanded" ? "expanded" : "compact";
    if (panelSize === tamanho) return;
    panelSize = tamanho;
    panel.classList.toggle("expanded", panelSize === "expanded");
    if (panel.classList.contains("open")) renderHeader();
  }

  // Idem pra posição da orbe — puramente visual (CSS de posição), não
  // mexe no painel/formulário em nada. Não interrompe um arraste em
  // andamento nesta própria aba.
  function aplicarOrbPosition(novaPosicao) {
    if (drag) return;
    if (!novaPosicao || typeof novaPosicao.x !== "number" || typeof novaPosicao.y !== "number") return;
    const p = clampPos(novaPosicao.x, novaPosicao.y);
    if (root.style.left === `${p.x}px` && root.style.top === `${p.y}px`) return;
    root.style.left = `${p.x}px`;
    root.style.top = `${p.y}px`;
  }

  // Item 7/12: qualquer aba (Google, YouTube, ChatGPT...) com a orbe aberta
  // reflete a mudança assim que o background processa — não importa se foi
  // push do app, ação nesta orbe, em outra, ou o fallback. Chega por
  // mensagem ativa do background (chrome.tabs.sendMessage), não por
  // chrome.storage.onChanged — a área ficou restrita a contextos
  // confiáveis, então este content script não tem permissão de ouvir
  // mudanças nela diretamente. Preferências visuais (projeto/tamanho do
  // painel/posição da orbe) vêm no mesmo pacote agora, não só dado.
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== "ASSISTANT_STATE_CHANGED") return;
    aplicarFocus(message.focus ?? null);
    aplicarTasks(message.tasks ?? []);
    aplicarSessionExpired(message.sessionExpired);
    aplicarSelectedProjectId(message.selectedProjectId ?? null);
    aplicarPanelSize(message.panelSize);
    aplicarOrbPosition(message.orbPosition);
  });

  selectedProjectId = inicial?.selectedProjectId ?? null;
  panelSize = inicial?.panelSize === "expanded" ? "expanded" : "compact";
  panel.classList.toggle("expanded", panelSize === "expanded");
  aplicarFocus(inicial?.focus ?? null);
  aplicarTasks(inicial?.tasks ?? []);
  aplicarSessionExpired(inicial?.sessionExpired);
}

main().catch((err) => console.error("[Assistant] erro ao iniciar", err));
