// Injeta a orbe em páginas http/https normais (ver manifest.json — nunca em
// chrome://, na Web Store etc., o próprio Chrome bloqueia content scripts
// nelas). Tudo dentro de um Shadow DOM: a página host nunca vê nem
// consegue estilizar/quebrar a orbe, e o contrário também — puramente
// decorativo/isolado. Mesma orbe visual do app (4 imagens de
// olhos/respiração/anel de progresso), mesma sessão de foco (lida do
// chrome.storage.local, mantido pelo background.js).

const ORB_SIZE = 60;
const MARGEM_PADRAO = 24;
const LIMIAR_ARRASTE_PX = 6;
const N_PONTOS_ANEL = 40;
const RAIO_ANEL = 38;
const REFERENCIA_SEM_ESTIMATIVA_SEGUNDOS = 25 * 60;

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
  #panel { position: absolute; bottom: calc(100% + 12px); right: 0; width: 260px; background: #16181d; color: #f2f2f2; border: 1px solid #2b2e35; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.4); padding: 12px; display: none; font-size: 13px; }
  #panel.open { display: block; }
  #panel h1 { font-size: 12px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: #22d3ee; margin: 0 0 6px; }
  #panel .titulo { font-size: 14px; font-weight: 500; margin: 0 0 6px; }
  #panel .tempo { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; margin: 0 0 10px; }
  #panel .vazio { color: #9aa0aa; margin: 0 0 10px; }
  #panel .row { display: flex; gap: 6px; }
  #panel button.acao { flex: 1; border: none; border-radius: 8px; padding: 7px 8px; font-size: 12px; font-weight: 600; cursor: pointer; }
  #panel button.primaria { background: #22d3ee; color: #0b1220; }
  #panel button.secundaria { background: #2b2e35; color: #f2f2f2; }
  #panel button.link { width: 100%; margin-top: 6px; background: transparent; color: #9aa0aa; border: 1px solid #2b2e35; }
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

function clampPos(x, y) {
  return {
    x: Math.min(Math.max(x, 0), Math.max(0, window.innerWidth - ORB_SIZE)),
    y: Math.min(Math.max(y, 0), Math.max(0, window.innerHeight - ORB_SIZE)),
  };
}

async function lerPosicaoSalva() {
  const { orbPosition } = await chrome.storage.local.get("orbPosition");
  if (orbPosition && typeof orbPosition.x === "number" && typeof orbPosition.y === "number") {
    return clampPos(orbPosition.x, orbPosition.y);
  }
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

  const panel = document.createElement("div");
  panel.id = "panel";
  root.appendChild(panel);

  // ---- posição + arraste ----
  const pos = await lerPosicaoSalva();
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
      chrome.storage.local.set({ orbPosition: { x: parseFloat(root.style.left), y: parseFloat(root.style.top) } });
    } else {
      panel.classList.toggle("open");
      renderPanel();
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

  // ---- estado de foco (lido do background, atualizado via chrome.storage.onChanged) ----
  let focus = null;
  let tickId = null;

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

  function renderPanel() {
    panel.textContent = "";
    if (!focus) {
      const vazio = document.createElement("p");
      vazio.className = "vazio";
      vazio.textContent = "Nenhum foco ativo no momento.";
      panel.appendChild(vazio);
      panel.appendChild(botaoAbrirSistema());
      return;
    }

    const h1 = document.createElement("h1");
    h1.textContent = focus.status === "active" ? "🔥 Foco" : "⏸ Foco pausado";
    panel.appendChild(h1);

    const titulo = document.createElement("p");
    titulo.className = "titulo";
    titulo.textContent = focus.titulo;
    panel.appendChild(titulo);

    const tempo = document.createElement("p");
    tempo.className = "tempo";
    tempo.textContent = formatarCronometro(focus.elapsedSegundos);
    panel.appendChild(tempo);

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

    panel.appendChild(row);
    panel.appendChild(botaoAbrirSistema());
  }

  function botaoAbrirSistema() {
    const btn = document.createElement("button");
    btn.className = "link";
    btn.textContent = "Abrir sistema";
    btn.onclick = () => window.open(INFOPRO_CONFIG.APP_URL, "_blank", "noopener");
    return btn;
  }

  async function enviarAcao(tipo) {
    if (!focus) return;
    await chrome.runtime.sendMessage({ type: tipo, taskId: focus.taskId });
    const resp = await chrome.runtime.sendMessage({ type: "GET_FOCUS" });
    aplicarFocus(resp?.focus ?? null);
  }

  function aplicarFocus(novoFocus) {
    focus = novoFocus;
    atualizarAnel();
    if (panel.classList.contains("open")) renderPanel();

    clearInterval(tickId);
    if (focus && focus.status === "active") {
      tickId = setInterval(() => {
        focus = { ...focus, elapsedSegundos: focus.elapsedSegundos + 1 };
        atualizarAnel();
        if (panel.classList.contains("open")) renderPanel();
      }, 1000);
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.focus) aplicarFocus(changes.focus.newValue ?? null);
  });

  const inicial = await chrome.runtime.sendMessage({ type: "GET_FOCUS" });
  aplicarFocus(inicial?.focus ?? null);
}

main().catch((err) => console.error("[infopro-assistant]", err));
