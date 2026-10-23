import { AnimatedSprite, Application, Assets, Container, Graphics, Rectangle, Sprite, Text, Texture, TextureStyle } from "pixi.js";
import { PAREDES, PISOS, TILE, caminho, type Estacao, type Recorte, type TipoEstacao } from "./mapa";
import type { Planta } from "./planta";

// Motor do mapa em pixel art (PixiJS 8). O React passa a planta e as pessoas e recebe os cliques.

const BASE = "/escritorio-pixel";
const MODELOS = ["Adam", "Alex", "Amelia", "Bob"] as const;
type Modelo = (typeof MODELOS)[number];
/** Ordem das direções nas folhas da LimeZu. */
const DIR = { dir: 0, cima: 1, esq: 2, baixo: 3 } as const;
type Direcao = keyof typeof DIR;

export type EstadoPixel = "trabalhando" | "esperando" | "problema" | "parado" | "reuniao";
export type ModoCamera = "geral" | "seguir";

export interface PessoaPixel {
  id: string;
  nome: string;
  estado: EstadoPixel;
  /** setor da pessoa: trabalha numa mesa da sala dele; setor fora do mapa trabalha na mesa de reunião */
  setorId: string | null;
  /** texto do balão (aparece no hover/seleção) */
  agora?: string | null;
}

export interface ResultadoPixel { concluidas: number; publicados: number; faltam: number; atrasadas: number; destaque: string }

interface Boneco {
  p: PessoaPixel;
  modelo: Modelo;
  corpo: AnimatedSprite;
  anel: Graphics;
  etiqueta: Container;
  alerta: Container;
  x: number; y: number;
  rota: { x: number; y: number }[];
  estacao: Estacao | null;
  direcao: Direcao;
  pose: string;
  espera: number;
}

const COR_ESTADO: Record<EstadoPixel, number> = {
  trabalhando: 0x22c55e, esperando: 0xf59e0b, problema: 0xef4444, parado: 0x94a3b8, reuniao: 0xa78bfa,
};

function modeloDe(id: string): Modelo {
  // FNV-1a: mistura bem até ids curtos e parecidos.
  let h = 0x811c9dc5;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return MODELOS[h % MODELOS.length];
}

function tipoDesejado(p: PessoaPixel): TipoEstacao[] {
  if (p.estado === "reuniao") return ["reuniao", "espera", "sofa"];
  if (p.estado === "trabalhando" || p.estado === "problema") return ["mesa", "reuniao", "espera", "sofa"];
  if (p.estado === "esperando") return ["espera", "sofa", "copa"];
  return ["sofa", "copa", "espera"];
}

export interface MundoPixel {
  definirPlanta(planta: Planta): void;
  atualizar(pessoas: PessoaPixel[], resultado: ResultadoPixel | null): void;
  selecionar(id: string | null): void;
  /** modo de montar: mostra os 9 espaços e o clique escolhe um */
  editar(ativo: boolean, espacoSelecionado: number | null): void;
  camera(modo: ModoCamera): void;
  destruir(): void;
}

export interface Avisos {
  aoClicar: (id: string | null) => void;
  aoClicarEspaco: (indice: number) => void;
  aoMudarCamera: (modo: ModoCamera) => void;
}

const ehCampoDeTexto = (alvo: EventTarget | null) =>
  alvo instanceof HTMLElement && (alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName));

export async function criarMundo(el: HTMLElement, avisos: Avisos, planta: Planta): Promise<MundoPixel> {
  TextureStyle.defaultOptions.scaleMode = "nearest";
  const app = new Application();
  await app.init({ resizeTo: el, background: "#17151f", antialias: false, roundPixels: true, resolution: window.devicePixelRatio || 1, autoDensity: true });
  el.appendChild(app.canvas);
  app.canvas.style.imageRendering = "pixelated";

  const urls = {
    interiores: `${BASE}/interiores.png`,
    construcao: `${BASE}/construcao.png`,
    ...Object.fromEntries(MODELOS.flatMap((m) => (["run", "idle_anim", "sit"] as const).map((k) => [`${m}_${k}`, `${BASE}/personagens/${m}_${k}.png`]))),
  } as Record<string, string>;
  const tex: Record<string, Texture> = {};
  await Promise.all(Object.entries(urls).map(async ([k, u]) => { tex[k] = await Assets.load<Texture>(u); tex[k].source.scaleMode = "nearest"; }));

  const corte = (folha: string, x: number, y: number, w: number, h: number) =>
    new Texture({ source: tex[folha].source, frame: new Rectangle(x, y, w, h) });
  const recorte = ([c, l, w, h]: Recorte) => corte("interiores", c * TILE, l * TILE, w * TILE, h * TILE);
  const tile = (c: number, l: number) => corte("construcao", c * TILE, l * TILE, TILE, TILE);

  // Quadros de animação por modelo: andar/parado (16×32, 6 por direção) e sentado (32×32, 6 virado à direita, 6 à esquerda).
  const quadros = new Map<string, Texture[]>();
  for (const m of MODELOS) {
    for (const [d, i] of Object.entries(DIR)) {
      quadros.set(`${m}:andar:${d}`, Array.from({ length: 6 }, (_, k) => corte(`${m}_run`, (i * 6 + k) * 16, 0, 16, 32)));
      quadros.set(`${m}:parado:${d}`, Array.from({ length: 6 }, (_, k) => corte(`${m}_idle_anim`, (i * 6 + k) * 16, 0, 16, 32)));
    }
    quadros.set(`${m}:sentado:dir`, Array.from({ length: 6 }, (_, k) => corte(`${m}_sit`, k * 32, 0, 32, 32)));
    quadros.set(`${m}:sentado:esq`, Array.from({ length: 6 }, (_, k) => corte(`${m}_sit`, (6 + k) * 32, 0, 32, 32)));
  }

  const mundo = new Container();
  app.stage.addChild(mundo);
  const chao = new Container();
  const cena = new Container();
  cena.sortableChildren = true;
  const topo = new Container();
  const camadaEdicao = new Container();
  mundo.addChild(chao, cena, topo, camadaEdicao);
  let escala = 1;
  const textos = new Set<Text>();
  const texto = (t: string, tamanho: number, cor = 0xffffff, peso: "400" | "700" | "800" = "700") => {
    const tx = new Text({ text: t, style: { fontFamily: "ui-monospace, Menlo, monospace", fontSize: tamanho, fill: cor, fontWeight: peso } });
    textos.add(tx);
    tx.resolution = resolucaoTexto();
    return tx;
  };
  const limpar = (c: Container) => {
    for (const filho of c.removeChildren()) {
      filho.children?.forEach((f) => { if (f instanceof Text) textos.delete(f); });
      if (filho instanceof Text) textos.delete(filho);
      filho.destroy({ children: true });
    }
  };

  let atual = planta;
  let ultimoResultado: ResultadoPixel | null = null;
  let tela: Container | null = null;
  // Móveis, placas e a tela ficam na cena (ordenados pela altura junto com as pessoas).
  let estaticos: Container[] = [];

  const desenharTela = () => {
    if (!tela || !atual.tela) return;
    limpar(tela);
    const r = ultimoResultado;
    const w = atual.tela.w * TILE, h = atual.tela.h * TILE;
    tela.addChild(new Graphics().rect(0, 0, w, h).fill(0x0b1220).stroke({ color: 0x1f2937, width: 2 }));
    const titulo = texto("NOSSO RESULTADO", 5.5, 0xfbbf24, "800");
    titulo.position.set(5, 3);
    tela.addChild(titulo);
    const caixas = r ? [
      [String(r.concluidas), "entregues", 0xffffff], [String(r.publicados), "posts", 0xffffff],
      [String(r.faltam), r.atrasadas ? `${r.atrasadas} atrasadas` : "faltam", r.atrasadas ? 0xfca5a5 : 0xffffff],
    ] as const : [];
    const larg = (w - 10) / 3;
    caixas.forEach(([valor, rotulo, cor], i) => {
      const x = 5 + i * larg;
      tela!.addChild(new Graphics().roundRect(x, 13, larg - 3, h - 17, 2).fill(0x16233a));
      const v = texto(valor, 11, cor, "800"); v.position.set(x + 4, 14); tela!.addChild(v);
      const rt = texto(rotulo, 4.5, 0x94a3b8, "700"); rt.position.set(x + 4, 29); tela!.addChild(rt);
    });
    if (!r) { const t = texto("carregando…", 5, 0x94a3b8); t.position.set(5, 18); tela.addChild(t); }
  };

  const montarCenario = () => {
    limpar(chao);
    for (const s of estaticos) { s.children.forEach((f) => { if (f instanceof Text) textos.delete(f); }); s.destroy({ children: true }); }
    estaticos = [];
    const { grade, largura: LARGURA, altura: ALTURA } = atual;
    for (let y = 0; y < ALTURA; y++) {
      for (let x = 0; x < LARGURA; x++) {
        const c = grade[y][x];
        if (!c) continue;
        let t: Texture;
        if ("piso" in c) {
          const p = PISOS[c.piso];
          t = tile(p.c + (x % p.w), p.l + (y % p.h));
        } else {
          t = tile(c.ponta === "e" ? 0 : c.ponta === "d" ? 2 : 1, PAREDES[c.parede].l + c.linha);
        }
        const s = new Sprite(t);
        s.position.set(x * TILE, y * TILE);
        chao.addChild(s);
      }
    }
    // Sombra no pé das paredes.
    const sombras = new Graphics();
    for (let y = 1; y < ALTURA; y++) for (let x = 0; x < LARGURA; x++) {
      const c = grade[y][x], cima = grade[y - 1][x];
      if (c && "piso" in c && cima && "parede" in cima) sombras.rect(x * TILE, y * TILE, TILE, 3);
    }
    sombras.fill({ color: 0x000000, alpha: 0.18 });
    chao.addChild(sombras);

    for (const m of atual.moveis) {
      const s = new Sprite(recorte(m.r));
      s.position.set(m.x * TILE, m.y * TILE);
      if (m.chao) { chao.addChild(s); continue; }
      s.zIndex = m.parede ? -1 : (m.y + m.r[3]) * TILE;
      cena.addChild(s);
      estaticos.push(s);
    }
    // Placas com o nome de cada sala (na parede).
    for (const p of atual.placas) {
      const placa = new Container();
      const tx = texto(p.texto, 5, 0xffffff, "800");
      const fundo = new Graphics().roundRect(-3, -2, tx.width + 6, tx.height + 3, 1.5).fill(0x1c1917).stroke({ color: Number.parseInt(p.cor.slice(1), 16), width: 0.8 });
      placa.addChild(fundo, tx);
      placa.position.set(Math.round(p.x * TILE - tx.width / 2), p.y * TILE + 3);
      placa.zIndex = -0.5;
      cena.addChild(placa);
      estaticos.push(placa);
    }
    tela = null;
    if (atual.tela) {
      tela = new Container();
      tela.position.set(atual.tela.x * TILE, atual.tela.y * TILE);
      tela.zIndex = -0.5;
      cena.addChild(tela);
      estaticos.push(tela);
      desenharTela();
    }
  };

  // Pessoas.
  const bonecos = new Map<string, Boneco>();
  let selecionado: string | null = null;
  let emCima: string | null = null;
  let perto: string | null = null;

  const criarEtiqueta = (b: Boneco) => {
    limpar(b.etiqueta);
    const nome = texto(b.p.nome.split(" ")[0], 5, 0xffffff, "800");
    const dica = b.p.id === perto && b.p.id !== selecionado ? "E para conversar" : null;
    const linha2 = dica ?? (b.p.agora ? (b.p.agora.length > 34 ? `${b.p.agora.slice(0, 33)}…` : b.p.agora) : null);
    const agora = linha2 ? texto(linha2, 3.8, dica ? 0xfde68a : 0xd6d3d1, "400") : null;
    const w = Math.max(nome.width, agora?.width ?? 0) + 8;
    const h = nome.height + (agora ? agora.height + 1 : 0) + 3;
    const fundo = new Graphics().roundRect(-w / 2, -h, w, h, 2).fill({ color: 0x0f0d0b, alpha: 0.9 });
    fundo.circle(-w / 2 + 3.5, -h + 4.5, 1.6).fill(COR_ESTADO[b.p.estado]);
    nome.position.set(-w / 2 + 6, -h + 1);
    b.etiqueta.addChild(fundo, nome);
    if (agora) { agora.position.set(-w / 2 + 4, -h + nome.height + 1.5); b.etiqueta.addChild(agora); }
  };

  const criarAlerta = (b: Boneco) => {
    limpar(b.alerta);
    const precisa = b.corpo.visible && (b.p.estado === "problema" || b.p.estado === "esperando");
    b.alerta.visible = precisa;
    if (!precisa) return;
    const cor = b.p.estado === "problema" ? 0xef4444 : 0xf59e0b;
    const g = new Graphics().circle(0, 0, 4.2).fill(cor).stroke({ color: 0xffffff, width: 1 });
    g.poly([-1.8, 3, 1.8, 3, 0, 6.2]).fill(cor);
    b.alerta.addChild(g);
    // "!" desenhado em pixels (sem fonte).
    b.alerta.addChild(new Graphics().rect(-0.6, -2.6, 1.2, 3.2).fill(0xffffff).rect(-0.6, 1.4, 1.2, 1.2).fill(0xffffff));
  };

  const atualizarVisual = (b: Boneco) => {
    const ativo = b.corpo.visible && (b.p.id === selecionado || b.p.id === emCima || b.p.id === perto);
    b.etiqueta.visible = ativo;
    b.anel.visible = b.p.id === selecionado;
  };

  const definirPose = (b: Boneco, pose: string, direcao: Direcao) => {
    const chave = pose === "sentado-dir" ? `${b.modelo}:sentado:dir`
      : pose === "sentado-esq" ? `${b.modelo}:sentado:esq`
      : `${b.modelo}:${pose === "andar" ? "andar" : "parado"}:${direcao}`;
    if (b.pose === chave) return;
    b.pose = chave;
    b.corpo.textures = quadros.get(chave)!;
    if (pose === "sentado-dir") b.corpo.anchor.set(13.5 / 32, 30 / 32);
    else if (pose === "sentado-esq") b.corpo.anchor.set(18 / 32, 30 / 32);
    else b.corpo.anchor.set(0.5, 31 / 32);
    b.corpo.animationSpeed = pose === "andar" ? 0.18 : pose.startsWith("sentado") ? 0.08 : 0.1;
    b.corpo.play();
  };

  const posicionar = (b: Boneco) => {
    const x = (b.x + 0.5) * TILE, y = (b.y + 1) * TILE - 1;
    const sentadoNoSofa = !b.rota.length && b.estacao?.pose === "sofa" && Math.abs(b.x - b.estacao.x) < 0.01 && Math.abs(b.y - b.estacao.y) < 0.01;
    const dy = sentadoNoSofa ? -5 : 0;
    b.corpo.position.set(x, y + dy);
    b.corpo.zIndex = y + 2;
    b.anel.position.set(x, y - 1);
    b.anel.zIndex = y - 0.1;
    const alto = b.pose.includes(":sentado:") ? 22 : 25;
    b.etiqueta.position.set(x, y + dy - alto - (b.alerta.visible ? 9 : 0));
    b.alerta.position.set(x, y + dy - alto - 5);
  };

  const escolherEstacao = (b: Boneco) => {
    const tipos = tipoDesejado(b.p);
    const serve = (e: Estacao, tipo: TipoEstacao) => e.tipo === tipo && (tipo !== "mesa" || e.setorId === b.p.setorId);
    if (b.estacao && atual.estacoes.includes(b.estacao) && serve(b.estacao, tipos[0])) return b.estacao;
    const ocupadas = new Set([...bonecos.values()].filter((o) => o !== b).map((o) => o.estacao?.id).filter(Boolean) as string[]);
    for (const tipo of tipos) {
      const livre = atual.estacoes.find((e) => serve(e, tipo) && !ocupadas.has(e.id));
      if (livre) return livre;
    }
    return null;
  };

  const andavelEm = (x: number, y: number) => !!atual.andavel[Math.floor(y)]?.[Math.floor(x)];

  const mandarPara = (b: Boneco, estacao: Estacao | null) => {
    b.estacao = estacao;
    const alvo = estacao ?? { x: atual.chegada.x, y: atual.chegada.y - 1 };
    const de = { x: Math.round(b.x), y: Math.round(b.y) };
    b.rota = caminho(atual.andavel, de, alvo);
    // Sem caminho (a sala mudou de lugar por baixo dele): aparece direto no lugar novo.
    if (!b.rota.length && (de.x !== alvo.x || de.y !== alvo.y)) { b.x = alvo.x; b.y = alvo.y; }
  };

  // O boneco do Davi: anda com as setas/WASD; E conversa com quem está perto.
  const jogador = (() => {
    const corpo = new AnimatedSprite(quadros.get("Adam:parado:cima")!);
    const b: Boneco = {
      p: { id: "__voce", nome: "Você", estado: "trabalhando", setorId: null }, modelo: "Adam", corpo,
      anel: new Graphics().ellipse(0, 0, 7, 3).fill({ color: 0x38bdf8, alpha: 0.35 }).stroke({ color: 0x38bdf8, width: 1 }),
      etiqueta: new Container(), alerta: new Container(), x: atual.chegada.x, y: atual.chegada.y - 1, rota: [], estacao: null, direcao: "cima", pose: "", espera: 0,
    };
    const tx = texto("VOCÊ", 4, 0x0b1220, "800");
    b.etiqueta.addChild(new Graphics().roundRect(-tx.width / 2 - 2.5, -tx.height - 1, tx.width + 5, tx.height + 1.5, 2).fill(0x7dd3fc), tx);
    tx.position.set(-tx.width / 2, -tx.height - 0.5);
    cena.addChild(b.anel, corpo);
    topo.addChild(b.etiqueta);
    definirPose(b, "parado", "cima");
    return b;
  })();
  const teclas = new Set<string>();
  const MAPA_TECLAS: Record<string, Direcao> = {
    ArrowUp: "cima", KeyW: "cima", ArrowDown: "baixo", KeyS: "baixo", ArrowLeft: "esq", KeyA: "esq", ArrowRight: "dir", KeyD: "dir",
  };
  let modoCamera: ModoCamera = "geral";
  let editando = false;
  const aoApertar = (e: KeyboardEvent) => {
    if (ehCampoDeTexto(e.target) || e.metaKey || e.ctrlKey) return;
    if (MAPA_TECLAS[e.code]) {
      e.preventDefault();
      teclas.add(e.code);
      if (modoCamera === "geral" && !editando) { modoCamera = "seguir"; avisos.aoMudarCamera(modoCamera); ajustar(); }
    } else if (e.code === "KeyE" && perto) {
      avisos.aoClicar(perto);
    } else if (e.code === "KeyZ") {
      modoCamera = modoCamera === "geral" ? "seguir" : "geral";
      avisos.aoMudarCamera(modoCamera);
      ajustar();
    }
  };
  const aoSoltar = (e: KeyboardEvent) => teclas.delete(e.code);
  const aoSairDaJanela = () => teclas.clear();
  window.addEventListener("keydown", aoApertar);
  window.addEventListener("keyup", aoSoltar);
  window.addEventListener("blur", aoSairDaJanela);

  const moverJogador = (dt: number) => {
    let dx = 0, dy = 0;
    for (const k of teclas) {
      const d = MAPA_TECLAS[k];
      if (d === "cima") dy -= 1; else if (d === "baixo") dy += 1; else if (d === "esq") dx -= 1; else if (d === "dir") dx += 1;
    }
    const b = jogador;
    if (!dx && !dy) { definirPose(b, "parado", b.direcao); return; }
    b.direcao = dx && Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "dir" : "esq") : (dy > 0 ? "baixo" : "cima");
    const passo = 4.5 * dt / Math.hypot(dx, dy);
    // Pé do boneco: centro do tile, perto da base; testa as duas pontas do pé.
    const livre = (x: number, y: number) => {
      const px = x + 0.5, py = y + 0.85;
      return andavelEm(px - 0.3, py) && andavelEm(px + 0.3, py) && andavelEm(px - 0.3, py - 0.25) && andavelEm(px + 0.3, py - 0.25);
    };
    if (dx && livre(b.x + dx * passo, b.y)) b.x += dx * passo;
    if (dy && livre(b.x, b.y + dy * passo)) b.y += dy * passo;
    definirPose(b, "andar", b.direcao);
  };

  const verificarPerto = () => {
    let melhor: string | null = null, menor = 1.8;
    for (const b of bonecos.values()) {
      if (!b.corpo.visible) continue;
      const d = Math.hypot(b.x - jogador.x, b.y - jogador.y);
      if (d < menor) { menor = d; melhor = b.p.id; }
    }
    if (melhor === perto) return;
    const antes = perto;
    perto = melhor;
    for (const id of [antes, melhor]) {
      const b = id ? bonecos.get(id) : null;
      if (b) { criarEtiqueta(b); atualizarVisual(b); }
    }
  };

  // Modo de montar: os 9 espaços aparecem com borda e nome; o clique escolhe um.
  let espacoSelecionado: number | null = null;
  const desenharEdicao = () => {
    limpar(camadaEdicao);
    camadaEdicao.visible = editando;
    if (!editando) return;
    for (const e of atual.espacos) {
      const sel = e.indice === espacoSelecionado;
      const x = e.x0 * TILE - 2, y = e.y0 * TILE - 2, w = (e.x1 - e.x0 + 1) * TILE + 4, h = (e.y1 - e.y0 + 1) * TILE + 4;
      const g = new Graphics().rect(x, y, w, h).fill({ color: sel ? 0x38bdf8 : 0x000000, alpha: sel ? 0.22 : 0.25 })
        .stroke({ color: sel ? 0x38bdf8 : 0xffffff, width: sel ? 2 : 1, alpha: sel ? 1 : 0.5 });
      const tx = texto(e.nome === "Vazio" ? "+ montar sala" : e.nome, 8, 0xffffff, "800");
      tx.anchor.set(0.5);
      tx.position.set(x + w / 2, y + h / 2);
      const fundo = new Graphics().roundRect(x + w / 2 - tx.width / 2 - 5, y + h / 2 - tx.height / 2 - 3, tx.width + 10, tx.height + 6, 3).fill({ color: 0x0f0d0b, alpha: 0.85 });
      camadaEdicao.addChild(g, fundo, tx);
    }
  };

  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;
  app.stage.on("pointertap", (e) => {
    if (editando) {
      const p = mundo.toLocal(e.global);
      const tx = p.x / TILE, ty = p.y / TILE;
      const achado = atual.espacos.find((s) => tx >= s.x0 && tx <= s.x1 + 1 && ty >= s.y0 && ty <= s.y1 + 1);
      if (achado) avisos.aoClicarEspaco(achado.indice);
      return;
    }
    if (e.target === app.stage) avisos.aoClicar(null);
  });

  const novoBoneco = (p: PessoaPixel, atraso: number): Boneco => {
    const modelo = modeloDe(p.id);
    const corpo = new AnimatedSprite(quadros.get(`${modelo}:parado:cima`)!);
    corpo.eventMode = "static";
    corpo.cursor = "pointer";
    const b: Boneco = {
      p, modelo, corpo, anel: new Graphics().ellipse(0, 0, 7, 3).stroke({ color: 0xfacc15, width: 1.2 }).fill({ color: 0xfacc15, alpha: 0.18 }),
      etiqueta: new Container(), alerta: new Container(), x: atual.chegada.x, y: atual.chegada.y, rota: [], estacao: null, direcao: "cima", pose: "", espera: atraso,
    };
    corpo.on("pointertap", (e) => { if (editando) return; e.stopPropagation(); avisos.aoClicar(p.id); });
    corpo.on("pointerover", () => { emCima = b.p.id; atualizarVisual(b); });
    corpo.on("pointerout", () => { if (emCima === b.p.id) emCima = null; atualizarVisual(b); });
    corpo.visible = atraso <= 0;
    cena.addChild(b.anel, corpo);
    topo.addChild(b.alerta, b.etiqueta);
    criarEtiqueta(b);
    criarAlerta(b);
    definirPose(b, "parado", "cima");
    return b;
  };

  // Câmera: visão geral (o escritório inteiro) ou seguindo o seu boneco, mais de perto.
  function resolucaoTexto() { return Math.max(2, escala * (window.devicePixelRatio || 1) * 1.5); }
  const ajustarTextos = () => { const r = resolucaoTexto(); for (const tx of textos) if (tx.resolution !== r) tx.resolution = r; };
  const escalaGeral = () => {
    const bruta = Math.min(app.screen.width / (atual.largura * TILE), app.screen.height / (atual.altura * TILE));
    // Escala em passos de 1/2 (pixel inteiro); na tela Retina, de 1/4 para o mapa ocupar mais a tela.
    const passos = (window.devicePixelRatio || 1) >= 2 ? 4 : 2;
    return bruta >= 1 ? Math.max(1, Math.floor(bruta * passos) / passos) : bruta;
  };
  const posicionarCamera = () => {
    const w = app.screen.width, h = app.screen.height;
    const lw = atual.largura * TILE * escala, lh = atual.altura * TILE * escala;
    if (modoCamera === "geral") { mundo.position.set(Math.round((w - lw) / 2), Math.round((h - lh) / 2)); return; }
    const cx = (jogador.x + 0.5) * TILE * escala, cy = (jogador.y + 0.5) * TILE * escala;
    const px = lw <= w ? (w - lw) / 2 : Math.min(0, Math.max(w - lw, w / 2 - cx));
    const py = lh <= h ? (h - lh) / 2 : Math.min(0, Math.max(h - lh, h / 2 - cy));
    mundo.position.set(Math.round(px), Math.round(py));
  };
  function ajustar() {
    const nova = modoCamera === "geral" ? escalaGeral() : Math.max(2, Math.round(escalaGeral() * 2.5 * 2) / 2);
    if (nova !== escala) { escala = nova; mundo.scale.set(escala); ajustarTextos(); }
    posicionarCamera();
  }
  app.renderer.on("resize", ajustar);

  // Movimento: 4 direções, tile a tile.
  const VELOCIDADE = 3.2; // tiles por segundo
  app.ticker.add((t) => {
    const dt = Math.min(t.deltaMS, 100) / 1000;
    if (!editando) moverJogador(dt);
    posicionar(jogador);
    jogador.etiqueta.position.set((jogador.x + 0.5) * TILE, (jogador.y + 1) * TILE - 27);
    for (const b of bonecos.values()) {
      if (b.espera > 0) {
        b.espera -= dt;
        if (b.espera > 0) continue;
        b.corpo.visible = true;
        criarAlerta(b);
        mandarPara(b, escolherEstacao(b));
      }
      if (b.rota.length) {
        const prox = b.rota[0];
        const dx = prox.x - b.x, dy = prox.y - b.y;
        const dist = Math.hypot(dx, dy);
        const passo = VELOCIDADE * dt;
        b.direcao = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "dir" : "esq") : (dy > 0 ? "baixo" : "cima");
        if (dist <= passo) { b.x = prox.x; b.y = prox.y; b.rota.shift(); }
        else { b.x += (dx / dist) * passo; b.y += (dy / dist) * passo; }
        definirPose(b, "andar", b.direcao);
      } else if (b.estacao) {
        const pose = b.estacao.pose;
        if (pose === "sentado-dir" || pose === "sentado-esq") definirPose(b, pose, b.direcao);
        else definirPose(b, "parado", pose === "em-pe-cima" ? "cima" : "baixo");
      } else {
        definirPose(b, "parado", "baixo");
      }
      posicionar(b);
    }
    verificarPerto();
    if (modoCamera === "seguir") posicionarCamera();
  });

  montarCenario();
  ajustar();

  let destruido = false;
  return {
    definirPlanta(p) {
      if (destruido || p === atual) return;
      atual = p;
      montarCenario();
      ajustar();
      // Quem estava num lugar que não existe mais procura outro; o seu boneco volta para a entrada se ficou na parede.
      for (const b of bonecos.values()) if (b.espera <= 0) mandarPara(b, escolherEstacao(b));
      if (!andavelEm(jogador.x + 0.5, jogador.y + 0.85)) { jogador.x = atual.chegada.x; jogador.y = atual.chegada.y - 1; }
      desenharEdicao();
    },
    atualizar(pessoas, resultado) {
      if (destruido) return;
      if (resultado !== ultimoResultado) { ultimoResultado = resultado; desenharTela(); }
      const ids = new Set(pessoas.map((p) => p.id));
      for (const [id, b] of bonecos) {
        if (ids.has(id)) continue;
        limpar(b.etiqueta); limpar(b.alerta);
        b.corpo.destroy(); b.anel.destroy(); b.etiqueta.destroy(); b.alerta.destroy();
        bonecos.delete(id);
      }
      let novos = 0;
      for (const p of pessoas) {
        const b = bonecos.get(p.id);
        if (!b) {
          // Chegam um por um pela porta de vidro e andam até o lugar.
          bonecos.set(p.id, novoBoneco(p, 0.3 + novos++ * 0.9));
          continue;
        }
        const mudou = b.p.estado !== p.estado || b.p.setorId !== p.setorId;
        const textoMudou = b.p.agora !== p.agora || b.p.nome !== p.nome || b.p.estado !== p.estado;
        b.p = p;
        if (textoMudou) { criarEtiqueta(b); criarAlerta(b); }
        if (mudou && b.espera <= 0) mandarPara(b, escolherEstacao(b));
        atualizarVisual(b);
      }
    },
    selecionar(id) {
      selecionado = id;
      for (const b of bonecos.values()) { criarEtiqueta(b); atualizarVisual(b); }
    },
    editar(ativo, indice) {
      editando = ativo;
      espacoSelecionado = indice;
      teclas.clear();
      if (ativo && modoCamera !== "geral") { modoCamera = "geral"; avisos.aoMudarCamera(modoCamera); ajustar(); }
      desenharEdicao();
    },
    camera(modo) {
      if (modo === modoCamera) return;
      modoCamera = modo;
      ajustar();
    },
    destruir() {
      destruido = true;
      window.removeEventListener("keydown", aoApertar);
      window.removeEventListener("keyup", aoSoltar);
      window.removeEventListener("blur", aoSairDaJanela);
      app.destroy({ removeView: true }, { children: true, texture: false, textureSource: false });
    },
  };
}
