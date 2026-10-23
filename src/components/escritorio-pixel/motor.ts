import { AnimatedSprite, Application, Assets, Container, Graphics, Rectangle, Sprite, Text, Texture, TextureStyle } from "pixi.js";
import {
  ALTURA, CHEGADA, ESTACOES, LARGURA, MOVEIS, PAREDES, PISOS, SALAS, TELA_RESULTADO, TILE,
  caminho, montarAndavel, montarGrade, type Estacao, type Recorte, type SalaId, type TipoEstacao,
} from "./mapa";

// Motor do mapa em pixel art (PixiJS 8). O React só passa as pessoas e recebe os cliques.

const BASE = "/escritorio-pixel";
const MODELOS = ["Adam", "Alex", "Amelia", "Bob"] as const;
type Modelo = (typeof MODELOS)[number];
/** Ordem das direções nas folhas da LimeZu. */
const DIR = { dir: 0, cima: 1, esq: 2, baixo: 3 } as const;
type Direcao = keyof typeof DIR;

export type EstadoPixel = "trabalhando" | "esperando" | "problema" | "parado" | "reuniao";

export interface PessoaPixel {
  id: string;
  nome: string;
  estado: EstadoPixel;
  /** sala de trabalho; sem sala própria no protótipo, trabalha na mesa de reunião da Área Colaborativa */
  sala: SalaId | null;
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
  if (p.estado === "reuniao") return ["reuniao", "espera"];
  if (p.estado === "trabalhando" || p.estado === "problema") return p.sala === "audiovisual" ? ["mesa", "reuniao", "espera"] : ["reuniao", "espera"];
  if (p.estado === "esperando") return ["espera", "sofa"];
  return ["sofa", "copa", "espera"];
}

export interface MundoPixel {
  atualizar(pessoas: PessoaPixel[], resultado: ResultadoPixel | null): void;
  selecionar(id: string | null): void;
  destruir(): void;
}

export async function criarMundo(el: HTMLElement, aoClicar: (id: string | null) => void): Promise<MundoPixel> {
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
  mundo.addChild(chao, cena, topo);
  const textos: Text[] = [];
  const texto = (t: string, tamanho: number, cor = 0xffffff, peso: "400" | "700" | "800" = "700") => {
    const tx = new Text({ text: t, style: { fontFamily: "ui-monospace, Menlo, monospace", fontSize: tamanho, fill: cor, fontWeight: peso } });
    textos.push(tx);
    return tx;
  };

  // Fundo, pisos e paredes.
  const grade = montarGrade();
  const andavel = montarAndavel(grade);
  for (let y = 0; y < ALTURA; y++) {
    for (let x = 0; x < LARGURA; x++) {
      const c = grade[y][x];
      if (!c) continue;
      let t: Texture;
      if ("piso" in c) {
        const p = PISOS[c.piso];
        t = tile(p.c + (x % p.w), p.l + (y % p.h));
      } else {
        t = tile(c.ponta === "e" ? 0 : c.ponta === "d" ? 2 : 1, PAREDES[c.parede] + c.linha);
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

  for (const m of MOVEIS) {
    const s = new Sprite(recorte(m.r));
    s.position.set(m.x * TILE, m.y * TILE);
    if (m.chao) { chao.addChild(s); continue; }
    s.zIndex = m.parede ? -1 : (m.y + m.r[3]) * TILE;
    cena.addChild(s);
  }

  // Placas com o nome de cada sala (na parede).
  for (const sala of SALAS) {
    if (sala.id === "corredor") continue;
    const placa = new Container();
    const tx = texto(sala.nome.toUpperCase(), 5, 0xffffff, "800");
    const fundo = new Graphics().roundRect(-3, -2, tx.width + 6, tx.height + 3, 1.5).fill(0x1c1917).stroke({ color: Number.parseInt(sala.cor.slice(1), 16), width: 0.8 });
    placa.addChild(fundo, tx);
    const px = sala.id === "colaborativa" ? 14.2 : sala.id === "audiovisual" ? 26.6 : 12.4;
    placa.position.set(px * TILE, (sala.y0 - 2) * TILE + 3);
    if (sala.id === "colaborativa") placa.position.y = (sala.y0 - 2) * TILE + 2;
    cena.addChild(placa);
    placa.zIndex = -0.5;
  }

  // Tela "Nosso Resultado".
  const tela = new Container();
  tela.position.set(TELA_RESULTADO.x * TILE, TELA_RESULTADO.y * TILE);
  tela.zIndex = -0.5;
  cena.addChild(tela);
  const desenharTela = (r: ResultadoPixel | null) => {
    for (const filho of tela.removeChildren()) {
      if (filho instanceof Text) textos.splice(textos.indexOf(filho), 1);
      filho.destroy();
    }
    const w = TELA_RESULTADO.w * TILE, h = TELA_RESULTADO.h * TILE;
    tela.addChild(new Graphics().rect(0, 0, w, h).fill(0x0b1220).stroke({ color: 0x1f2937, width: 2 }));
    const titulo = texto("NOSSO RESULTADO", 4.5, 0xfbbf24, "800");
    titulo.position.set(4, 2.5);
    tela.addChild(titulo);
    const caixas = r ? [
      [String(r.concluidas), "entregues", 0xffffff], [String(r.publicados), "posts", 0xffffff],
      [String(r.faltam), r.atrasadas ? `${r.atrasadas} atras.` : "faltam", r.atrasadas ? 0xfca5a5 : 0xffffff],
    ] as const : [];
    caixas.forEach(([valor, rotulo, cor], i) => {
      const x = 4 + i * ((w - 8) / 3);
      tela.addChild(new Graphics().roundRect(x, 10, (w - 8) / 3 - 2, h - 13, 1.5).fill(0x16233a));
      const v = texto(valor, 7, cor, "800"); v.position.set(x + 2.5, 11); tela.addChild(v);
      const rt = texto(rotulo, 3.5, 0x94a3b8, "700"); rt.position.set(x + 2.5, 20.5); tela.addChild(rt);
    });
    if (!r) { const t = texto("carregando…", 4, 0x94a3b8); t.position.set(4, 14); tela.addChild(t); }
    ajustarTextos();
  };

  // Pessoas.
  const bonecos = new Map<string, Boneco>();
  let selecionado: string | null = null;
  let emCima: string | null = null;

  const criarEtiqueta = (b: Boneco) => {
    for (const filho of b.etiqueta.removeChildren()) { if (filho instanceof Text) textos.splice(textos.indexOf(filho), 1); filho.destroy(); }
    const nome = texto(b.p.nome.split(" ")[0], 5, 0xffffff, "800");
    const agora = b.p.agora ? texto(b.p.agora.length > 34 ? `${b.p.agora.slice(0, 33)}…` : b.p.agora, 3.8, 0xd6d3d1, "400") : null;
    const w = Math.max(nome.width, agora?.width ?? 0) + 8;
    const h = nome.height + (agora ? agora.height + 1 : 0) + 3;
    const fundo = new Graphics().roundRect(-w / 2, -h, w, h, 2).fill({ color: 0x0f0d0b, alpha: 0.9 });
    fundo.circle(-w / 2 + 3.5, -h + 4.5, 1.6).fill(COR_ESTADO[b.p.estado]);
    nome.position.set(-w / 2 + 6, -h + 1);
    b.etiqueta.addChild(fundo, nome);
    if (agora) { agora.position.set(-w / 2 + 4, -h + nome.height + 1.5); b.etiqueta.addChild(agora); }
    ajustarTextos();
  };

  const criarAlerta = (b: Boneco) => {
    b.alerta.removeChildren().forEach((f) => f.destroy());
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
    const ativo = b.corpo.visible && (b.p.id === selecionado || b.p.id === emCima);
    b.etiqueta.visible = ativo;
    b.anel.visible = b.p.id === selecionado;
  };

  const pixel = (b: Boneco) => ({ x: (b.x + 0.5) * TILE, y: (b.y + 1) * TILE - 1 });

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
    const { x, y } = pixel(b);
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

  const ocupadas = () => new Set([...bonecos.values()].map((b) => b.estacao?.id).filter(Boolean) as string[]);

  const escolherEstacao = (b: Boneco) => {
    const tipos = tipoDesejado(b.p);
    if (b.estacao && tipos[0] === b.estacao.tipo) return b.estacao;
    const livres = ocupadas();
    if (b.estacao) livres.delete(b.estacao.id);
    for (const tipo of tipos) {
      // Mesa: primeiro a da própria sala.
      const opcoes = ESTACOES.filter((e) => e.tipo === tipo && !livres.has(e.id));
      if (opcoes.length) return opcoes[0];
    }
    return null;
  };

  const mandarPara = (b: Boneco, estacao: Estacao | null) => {
    b.estacao = estacao;
    const alvo = estacao ?? { x: CHEGADA.x, y: CHEGADA.y - 2 };
    b.rota = caminho(andavel, { x: Math.round(b.x), y: Math.round(b.y) }, alvo);
  };

  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;
  app.stage.on("pointertap", (e) => { if (e.target === app.stage) aoClicar(null); });

  const novoBoneco = (p: PessoaPixel, atraso: number): Boneco => {
    const modelo = modeloDe(p.id);
    const corpo = new AnimatedSprite(quadros.get(`${modelo}:parado:cima`)!);
    corpo.eventMode = "static";
    corpo.cursor = "pointer";
    const b: Boneco = {
      p, modelo, corpo, anel: new Graphics().ellipse(0, 0, 7, 3).stroke({ color: 0xfacc15, width: 1.2 }).fill({ color: 0xfacc15, alpha: 0.18 }),
      etiqueta: new Container(), alerta: new Container(), x: CHEGADA.x, y: CHEGADA.y, rota: [], estacao: null, direcao: "cima", pose: "", espera: atraso,
    };
    corpo.on("pointertap", (e) => { e.stopPropagation(); aoClicar(p.id); });
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

  // Movimento: 4 direções, tile a tile.
  const VELOCIDADE = 3.2; // tiles por segundo
  app.ticker.add((t) => {
    const dt = Math.min(t.deltaMS, 100) / 1000;
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
  });

  // Escala inteira (ou de meio em meio) para o pixel não borrar; centraliza o mapa.
  let escala = 1;
  function ajustarTextos() {
    const r = escala * (window.devicePixelRatio || 1) * 1.5;
    for (const tx of textos) if (tx.resolution !== r) tx.resolution = r;
  }
  const ajustar = () => {
    const w = app.screen.width, h = app.screen.height;
    const bruta = Math.min(w / (LARGURA * TILE), h / (ALTURA * TILE));
    escala = bruta >= 1 ? Math.max(1, Math.floor(bruta * 2) / 2) : bruta;
    mundo.scale.set(escala);
    mundo.position.set(Math.round((w - LARGURA * TILE * escala) / 2), Math.round((h - ALTURA * TILE * escala) / 2));
    ajustarTextos();
  };
  app.renderer.on("resize", ajustar);
  ajustar();
  desenharTela(null);

  let destruido = false;
  return {
    atualizar(pessoas, resultado) {
      if (destruido) return;
      desenharTela(resultado);
      const ids = new Set(pessoas.map((p) => p.id));
      for (const [id, b] of bonecos) {
        if (ids.has(id)) continue;
        b.corpo.destroy(); b.anel.destroy(); b.etiqueta.destroy({ children: true }); b.alerta.destroy({ children: true });
        bonecos.delete(id);
      }
      let novos = 0;
      for (const p of pessoas) {
        const b = bonecos.get(p.id);
        if (!b) {
          // Chegam um por um pela porta de vidro e andam até o lugar.
          bonecos.set(p.id, novoBoneco(p, 0.3 + novos++ * 1.1));
          continue;
        }
        const mudou = b.p.estado !== p.estado || b.p.sala !== p.sala;
        const textoMudou = b.p.agora !== p.agora || b.p.nome !== p.nome || b.p.estado !== p.estado;
        b.p = p;
        if (textoMudou) { criarEtiqueta(b); criarAlerta(b); }
        if (mudou && b.espera <= 0) mandarPara(b, escolherEstacao(b));
        atualizarVisual(b);
      }
    },
    selecionar(id) {
      selecionado = id;
      for (const b of bonecos.values()) atualizarVisual(b);
    },
    destruir() {
      destruido = true;
      app.destroy({ removeView: true }, { children: true, texture: false, textureSource: false });
    },
  };
}
