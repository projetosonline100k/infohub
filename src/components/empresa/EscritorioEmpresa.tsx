import { memo, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { Sinal } from "@/lib/empresa/visaoGeral";
import { BonecoMesa, ESTILO, cabeloDe, cabeloTras, visualDe, type Visual } from "./BonecoMesa";
import { ehNomeCoordenador } from "@/lib/empresa/visaoGeral";

// Mapa da operação: cada setor é uma sala de escritório (pedido do Davi, no
// estilo da imagem do briefing). Cada pessoa tem a mesa dela:
//   trabalhando / precisa de você / problema → sentada na mesa (BonecoMesa);
//   sem nada pra fazer → levanta, anda até o café, toma um gole e volta
//   (à noite, das 22h às 7h, dorme na mesa).
// Tudo em SVG + CSS; as posições do passeio vêm de variáveis CSS por pessoa.

export interface PessoaNaSala {
  id: string; nome: string; ehIa: boolean; sinal: Sinal; corSinal: string; rotuloSinal: string;
  balao: string | null; tarefas: number; atrasadas: number; clicavel: boolean;
  /** Escritório aberto (22/10): conversando com o Davi agora (vai para a mesa de reunião). */
  conversando?: boolean;
  /** Escritório aberto: setor da tarefa que está fazendo (anda até aquela área). */
  setorTarefa?: string | null;
}

const LARGURA_MESA = 120;
const DUR = [18, 21, 16, 23, 19];

// Pernas e braço do café sincronizados com o passeio: anda em 6–30% e 60–84%.
function quadrosPernas(sinal: 1 | -1) {
  const q: string[] = [];
  for (let p = 0; p <= 100; p += 1.5) {
    const andando = (p > 6 && p < 30) || (p > 60 && p < 84);
    const passo = Math.round(p / 1.5) % 2 === 0 ? 1 : -1;
    q.push(`${p.toFixed(1)}%{transform:rotate(${andando ? 20 * passo * sinal : 0}deg)}`);
  }
  return q.join("");
}
export const ESTILO_SALA = `
.esc svg *{transform-box:fill-box}
.esc-passeio{animation:esc-passeio var(--dur) linear infinite;animation-delay:var(--atraso)}
@keyframes esc-passeio{0%,6%{transform:translate(var(--de),var(--de-y))}30%,60%{transform:translate(var(--cafe),var(--cafe-y))}84%,100%{transform:translate(var(--de),var(--de-y))}}
.esc-vira{animation:esc-vira var(--dur) step-end infinite;animation-delay:var(--atraso)}
@keyframes esc-vira{0%{transform:scaleX(var(--ida))}60%{transform:scaleX(calc(var(--ida) * -1))}84%{transform:scaleX(var(--ida))}}
.esc-gingado{animation:esc-gingado var(--dur) linear infinite;animation-delay:var(--atraso)}
@keyframes esc-gingado{${Array.from({ length: 41 }, (_, k) => k * 2.5).map((p) => `${p}%{transform:translateY(${(p > 6 && p < 30) || (p > 60 && p < 84) ? (passoPar(p) ? -1.4 : 0) : 0}px)}`).join("")}}
.esc-perna-e{transform-origin:50% 0;animation:esc-perna-e var(--dur) linear infinite;animation-delay:var(--atraso)}
.esc-perna-d{transform-origin:50% 0;animation:esc-perna-d var(--dur) linear infinite;animation-delay:var(--atraso)}
@keyframes esc-perna-e{${quadrosPernas(1)}}
@keyframes esc-perna-d{${quadrosPernas(-1)}}
.esc-braco{transform-origin:50% 8%;animation:esc-braco var(--dur) ease-in-out infinite;animation-delay:var(--atraso)}
@keyframes esc-braco{0%,33%{transform:rotate(0)}38%,42%{transform:rotate(-70deg)}47%{transform:rotate(-25deg)}50%,54%{transform:rotate(-70deg)}58%,100%{transform:rotate(0)}}
.esc-xicara{animation:esc-xicara var(--dur) step-end infinite;animation-delay:var(--atraso)}
@keyframes esc-xicara{0%{opacity:0}30%{opacity:1}62%{opacity:0}}
.esc-uma-vez *{animation-iteration-count:1!important;animation-fill-mode:both!important}
.esc-fumaca{animation:esc-fumaca 2.4s ease-out infinite}
@keyframes esc-fumaca{0%{opacity:0;transform:translateY(0) scale(.7)}30%{opacity:.7}100%{opacity:0;transform:translateY(-10px) scale(1.3)}}
.esc-ponteiro{transform-origin:50% 100%;animation:esc-ponteiro 60s linear infinite}
@keyframes esc-ponteiro{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.esc *{animation:none!important}}
`;
function passoPar(p: number) { return Math.round(p / 2.5) % 2 === 0; }

const ehRobo = (p: PessoaNaSala) => p.ehIa && ehNomeCoordenador(p.nome);
// Sem nada pra fazer e de dia: fica descansando na mesa e, de vez em quando,
// levanta pro café/TV (pedido do Davi, 15/10: "estão andando demais"). Cada
// um tem a sua vez: uma janela de JANELA_MS a cada VOLTAS janelas, em revezamento.
const JANELA_MS = 45_000;
const VOLTAS = 6;
const vezDe = (id: string) => [...id].reduce((s, c) => s + c.charCodeAt(0), 0);
const livreDeDia = (p: PessoaNaSala, noite: boolean) => p.sinal === "parado" && !noite && !ehRobo(p);
const vaiPassear = (p: PessoaNaSala, noite: boolean, ciclo: number) => livreDeDia(p, noite) && (vezDe(p.id) + ciclo) % VOLTAS === 0;
const ehNoite = () => { const h = new Date().getHours(); return h >= 22 || h < 7; };

// Boneco de pé (pés em 0,0), andando e tomando café.
function BonecoAndando({ v }: { v: Visual }) {
  return (
    <g className="esc-gingado">
      <ellipse cx="0" cy="1" rx="11" ry="2.6" fill="#000" opacity=".15" />
      <g className="esc-perna-e"><rect x="-6.5" y="-25" width="5.5" height="25" rx="2.5" fill="#334155" /><ellipse cx="-3.5" cy="0" rx="4" ry="2" fill="#1e293b" /></g>
      <g className="esc-perna-d"><rect x="1" y="-25" width="5.5" height="25" rx="2.5" fill="#3b4a5f" /><ellipse cx="4" cy="0" rx="4" ry="2" fill="#1e293b" /></g>
      <rect x="-3.5" y="-55" width="7" height="6" rx="2" fill={v.pele} />
      <rect x="-11.5" y="-51" width="23" height="29" rx="8" fill={v.camisa} />
      <rect x="-15" y="-49" width="5" height="21" rx="2.5" fill={v.camisa} /><circle cx="-12.5" cy="-27" r="2.6" fill={v.pele} />
      <g className="esc-braco">
        <rect x="10" y="-49" width="5" height="21" rx="2.5" fill={v.camisa} /><circle cx="12.5" cy="-27" r="2.6" fill={v.pele} />
        <g className="esc-xicara"><rect x="10" y="-28" width="6" height="5.5" rx="1.2" fill="#fff" stroke="#cbd5e1" strokeWidth=".6" /><rect x="11" y="-28" width="4" height="1.3" fill="#7c4a24" /></g>
      </g>
      <g transform="translate(-60 -99)">
        {cabeloTras(v)}
        <circle cx="46.8" cy="41.5" r="2.6" fill={v.pele} />
        <circle cx="73.2" cy="41.5" r="2.6" fill={v.pele} />
        <circle cx="60" cy="39.5" r="13.2" fill={v.pele} />
        {cabeloDe(v)}
        {v.barba && <path d="M47.6 42 Q48.5 54.5 60 55 Q71.5 54.5 72.4 42 Q70.5 49 60 49.5 Q49.5 49 47.6 42 Z" fill={v.corCabelo} opacity=".92" />}
        <g className="bnc-piscar"><circle cx="55" cy="40.5" r="1.5" fill="#2a1d15" /><circle cx="65" cy="40.5" r="1.5" fill="#2a1d15" /></g>
        <path d="M57.5 46 q2.5 1.4 5 0" stroke="#7c2d12" strokeWidth="1" fill="none" strokeLinecap="round" />
        {v.oculos && <g fill="none" stroke="#1f2937" strokeWidth="1"><circle cx="55" cy="40.5" r="3.6" /><circle cx="65" cy="40.5" r="3.6" /><path d="M58.6 40.5 h2.8" /></g>}
      </g>
    </g>
  );
}

export function Planta({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M-9 0 L9 0 L7 16 L-7 16 Z" fill="#f1f5f9" stroke="#cbd5e1" />
      <path d="M0 0 C-14 -10,-16 -26,-4 -34 C-2 -22,-1 -12,0 0" fill="#16a34a" />
      <path d="M0 0 C12 -8,18 -24,8 -36 C4 -24,2 -12,0 0" fill="#22c55e" />
      <path d="M0 0 C-4 -14,0 -30,2 -42 C6 -30,5 -14,0 0" fill="#15803d" />
    </g>
  );
}

export interface SetorNoEscritorio {
  id: string; nome: string; corPlaca: string; tarefas: number; atrasadas: number; pessoas: PessoaNaSala[];
  /** 0 = fundo (fileira da Diretoria), 1 = frente; sem valor: Diretoria no fundo, o resto na frente. */
  fileira?: number | null;
  /** Tem esteira (kanban do time): clicar na placa abre. */
  temEsteira?: boolean;
}

const MARGEM = 26;          // borda esquerda do escritório
const FOLGA_SETOR = 34;     // espaço da divisória entre setores
const LARGURA_DESCANSO = 150;
const PAREDE = 106;          // altura da parede do fundo
const ALTURA_FILEIRA = 126;  // distância entre a fileira de cima e a de baixo
const Y_MESA = 104;          // topo do quadro da mesa na fileira de cima
const PE = 110;              // dos pés de quem anda até o topo do quadro da mesa

const ehDiretoria = (s: SetorNoEscritorio) => /diretoria/i.test(s.nome);

// Parede de vidro de pé (lateral): painel translúcido com moldura e reflexo.
function VidroLateral({ x, yTopo, yBase }: { x: number; yTopo: number; yBase: number }) {
  const h = yBase - yTopo;
  return (
    <g>
      <path d={`M${x - 5} ${yTopo} L${x + 9} ${yTopo + 8} L${x + 9} ${yBase + 8} L${x - 5} ${yBase} Z`} fill="#bfe3ff" opacity=".42" />
      <path d={`M${x - 5} ${yTopo} L${x + 9} ${yTopo + 8}`} stroke="#94a3b8" strokeWidth="2.5" />
      <path d={`M${x - 5} ${yBase} L${x + 9} ${yBase + 8}`} stroke="#94a3b8" strokeWidth="3" />
      <path d={`M${x - 5} ${yTopo} V${yBase}`} stroke="#94a3b8" strokeWidth="1.6" />
      <path d={`M${x + 9} ${yTopo + 8} V${yBase + 8}`} stroke="#cbd5e1" strokeWidth="1.2" />
      <path d={`M${x - 1} ${yTopo + h * 0.18} L${x + 5} ${yTopo + h * 0.18 + 10}`} stroke="#fff" strokeWidth="1.6" opacity=".8" />
      <path d={`M${x - 1} ${yTopo + h * 0.3} L${x + 5} ${yTopo + h * 0.3 + 6}`} stroke="#fff" strokeWidth="1" opacity=".7" />
    </g>
  );
}

// Parede de vidro da frente (sala fechada): baixa o bastante pra ver quem está dentro.
function VidroFrente({ x0, x1, yTopo, yBase, porta }: { x0: number; x1: number; yTopo: number; yBase: number; porta?: number }) {
  const trechos = porta != null ? [[x0, porta - 18], [porta + 18, x1]] : [[x0, x1]];
  return (
    <g>
      {trechos.map(([a, b], k) => (
        <g key={k}>
          <rect x={a} y={yTopo} width={b - a} height={yBase - yTopo} fill="#bfe3ff" opacity=".22" />
          <rect x={a} y={yTopo - 2} width={b - a} height="3" fill="#94a3b8" />
          <rect x={a} y={yBase - 2} width={b - a} height="3.5" fill="#94a3b8" />
          {Array.from({ length: Math.max(1, Math.floor((b - a) / 70)) + 1 }, (_, i2) => {
            const partes = Math.max(1, Math.floor((b - a) / 70));
            return <rect key={i2} x={a + ((b - a) * i2) / partes - 1} y={yTopo} width="2" height={yBase - yTopo} fill="#a5b4c6" />;
          })}
          <path d={`M${a + 12} ${yBase - 6} L${a + 26} ${yTopo + 6}`} stroke="#fff" strokeWidth="1.4" opacity=".7" />
        </g>
      ))}
    </g>
  );
}

export function Cafe({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x - 39} ${y})`}>
      <rect width="78" height="58" rx="3" fill="#cbd5e1" />
      <rect y="-4" width="78" height="6" rx="2" fill="#94a3b8" />
      <rect x="8" y="-30" width="26" height="28" rx="3" fill="#1f2937" />
      <rect x="12" y="-26" width="18" height="7" rx="1.5" fill="#0f172a" />
      <circle cx="27" cy="-22" r="1.6" fill="#ef4444" />
      <rect x="17" y="-9" width="8" height="7" rx="1.5" fill="#fff" />
      <path className="esc-fumaca" d="M20 -12 q-2 -4 0 -7 q2 -3 0 -6" stroke="#cbd5e1" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <path className="esc-fumaca" style={{ animationDelay: "1.2s" }} d="M23 -12 q-2 -4 0 -7 q2 -3 0 -6" stroke="#cbd5e1" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <rect x="44" y="-14" width="22" height="12" rx="2" fill="#a16207" />
      {[48, 54, 60].map((cx) => <rect key={cx} x={cx} y="-20" width="4.5" height="6" rx="1" fill="#fff" stroke="#cbd5e1" strokeWidth=".5" />)}
      <text x="39" y="32" textAnchor="middle" fontSize="9" fontWeight="700" fill="#475569" fontFamily="system-ui, sans-serif">☕ CAFÉ</text>
    </g>
  );
}

// Copa da fileira da frente: sofá e bebedouro.
function Copa({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x - 60} ${y})`}>
      <rect x="0" y="22" width="76" height="26" rx="8" fill="#334155" />
      <rect x="0" y="8" width="76" height="20" rx="8" fill="#475569" />
      <rect x="-6" y="16" width="12" height="32" rx="5" fill="#334155" />
      <rect x="70" y="16" width="12" height="32" rx="5" fill="#334155" />
      <rect x="14" y="14" width="18" height="12" rx="4" fill="#f59e0b" opacity=".85" />
      <g transform="translate(98 -6)">
        <rect x="-9" y="20" width="18" height="34" rx="3" fill="#e2e8f0" stroke="#94a3b8" />
        <rect x="-7" y="0" width="14" height="22" rx="5" fill="#93c5fd" opacity=".85" />
        <rect x="-3" y="30" width="6" height="3" rx="1" fill="#3b82f6" />
      </g>
      <text x="44" y="64" textAnchor="middle" fontSize="9" fontWeight="700" fill="#475569" fontFamily="system-ui, sans-serif">COPA</text>
    </g>
  );
}

// TV grande na parede (pedido do Davi, 15/10, no lugar da mesa de reunião):
// a moldura é SVG; a tela é HTML por cima (prop `tv`), com a semana e o
// resultado. Quem está livre vai assistir em pé, dos lados da TV.
function MolduraTv({ x, y, w, h, chaoY }: { x: number; y: number; w: number; h: number; chaoY: number }) {
  return (
    <g>
      <rect x={x - w / 2 - 6} y={y - 6} width={w + 12} height={h + 12} rx="5" fill="#0f172a" />
      <rect x={x - w / 2 - 6} y={y - 6} width={w + 12} height={h + 12} rx="5" fill="none" stroke="#334155" strokeWidth="1.5" />
      <rect x={x - w / 2} y={y} width={w} height={h} rx="2" fill="#0b1220" />
      <circle cx={x} cy={y + h + 3} r="1.3" fill="#38bdf8" />
      {/* Rack embaixo da TV, no chão */}
      <rect x={x - w / 2 + 10} y={chaoY - 26} width={w - 20} height="20" rx="3" fill="#a16207" />
      <rect x={x - w / 2 + 10} y={chaoY - 26} width={w - 20} height="4" rx="2" fill="#ca8a04" />
      <rect x={x - w / 2 + 16} y={chaoY - 6} width="4" height="6" fill="#78350f" />
      <rect x={x + w / 2 - 20} y={chaoY - 6} width="4" height="6" fill="#78350f" />
      <Planta x={x - w / 2 + 26} y={chaoY - 42} s={0.5} />
    </g>
  );
}

// O escritório inteiro (pedido do Davi): a Diretoria em cima, no fundo, com a
// reunião e o café; os outros setores embaixo, na frente, lado a lado
// (divisórias de vidro) com a copa no canto. Quem está livre anda até o
// descanso da própria fileira e volta.
export const EscritorioEmpresa = memo(function EscritorioEmpresa({ setores, onAbrir, forcarNoite, tv, onReordenar, onAbrirSetor }: {
  setores: SetorNoEscritorio[]; onAbrir: (id: string) => void; forcarNoite?: boolean;
  tv?: React.ReactNode;   // o que passa na TV (TelaTv)
  // Arrastar um escritório pela placa (16/10, "igual The Sims"): nova ordem dos ids daquela fileira.
  onReordenar?: (idsDaFileira: string[], fileira: 0 | 1) => void;
  onAbrirSetor?: (id: string) => void;   // clique (sem arrastar) na placa de um escritório com esteira
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const [arraste, setArraste] = useState<{ id: string; fil: 0 | 1; x: number; y: number; destino: number } | null>(null);
  const [noiteAgora, setNoite] = useState(ehNoite);
  const noite = forcarNoite ?? noiteAgora;
  useEffect(() => { const t = window.setInterval(() => setNoite(ehNoite()), 60_000); return () => window.clearInterval(t); }, []);
  const [ciclo, setCiclo] = useState(() => Math.floor(Date.now() / JANELA_MS));
  useEffect(() => { const t = window.setInterval(() => setCiclo(Math.floor(Date.now() / JANELA_MS)), 5_000); return () => window.clearInterval(t); }, []);

  // 16/10: cada escritório pode ir para o fundo ou para a frente (arrastando a placa).
  const filDe = (s: SetorNoEscritorio): 0 | 1 => (s.fileira === 0 || s.fileira === 1 ? s.fileira : ehDiretoria(s) ? 0 : 1);
  const cima = setores.filter((s) => filDe(s) === 0);
  const baixo = setores.filter((s) => filDe(s) === 1);
  const fileiras = [cima, baixo].filter((f) => f.length);
  const larguraFileira = (f: SetorNoEscritorio[]) =>
    MARGEM + f.reduce((t, s) => t + Math.max(2, s.pessoas.length) * LARGURA_MESA + FOLGA_SETOR, 0) - FOLGA_SETOR;
  const LARGURA = Math.max(...fileiras.map(larguraFileira), 640) + LARGURA_DESCANSO + 30;
  const ALTURA_TOTAL = Y_MESA + (fileiras.length - 1) * ALTURA_FILEIRA + PE + 30;
  const xDescanso = LARGURA - LARGURA_DESCANSO / 2 - 14;

  const zonas = fileiras.flatMap((f, r) => {
    let cursor = MARGEM;
    return f.map((setor) => {
      const largura = Math.max(2, setor.pessoas.length) * LARGURA_MESA;
      const z = { setor, r, fil: filDe(setor), x0: cursor, largura, yMesa: Y_MESA + r * ALTURA_FILEIRA };
      cursor += largura + FOLGA_SETOR;
      return z;
    });
  });
  const mesas = zonas.flatMap((z) => z.setor.pessoas.map((p, k) => ({
    p, r: z.r, yMesa: z.yMesa,
    x: z.x0 + LARGURA_MESA / 2 + k * LARGURA_MESA + (z.largura - z.setor.pessoas.length * LARGURA_MESA) / 2,
  })));
  const fimCima = fileiras.length > 1 ? larguraFileira(fileiras[0]) : LARGURA;
  const chao = (r: number) => Y_MESA + r * ALTURA_FILEIRA + PE - (r === 0 && fileiras.length > 1 ? 4 : 0);
  // A TV ocupa o espaço livre da fileira de cima, entre a diretoria e o café.
  const livreTv = xDescanso - 60 - fimCima;
  const tvW = Math.min(livreTv - 70, 330);
  const tvGeo = fileiras.length > 1 && tvW >= 170
    ? { x: (fimCima + xDescanso - 60) / 2, y: 12, w: tvW, h: Math.min(Math.round(tvW * 0.56), chao(0) - 12 - 52) }
    : null;
  const lugaresTv = tvGeo ? [-(tvGeo.w / 2 + 18), tvGeo.w / 2 + 18, -(tvGeo.w / 2 + 36), tvGeo.w / 2 + 36] : [];
  // Pra onde cada um vai quando está livre: café (fileira de cima), copa (de baixo)
  // ou ver a TV em pé, do lado dela — alternando entre as pessoas.
  let lugarLivre = 0;
  const destinoDe = (r: number, k: number): { x: number; y: number } => {
    const opcoes = r === 0 ? ["cafe", "tv"] : ["copa", "tv", "cafe"];
    const escolha = opcoes[k % opcoes.length];
    if (escolha === "tv" && tvGeo && lugarLivre < lugaresTv.length) {
      return { x: tvGeo.x + lugaresTv[lugarLivre++], y: chao(0) };
    }
    if (escolha === "copa" && fileiras.length > 1) return { x: xDescanso - 46 + (k % 3) * 16, y: chao(1) };
    return { x: xDescanso - 26 + (k % 3) * 14, y: chao(0) };
  };
  // Arrastar a placa: acompanha o mouse e mostra onde o escritório vai entrar na fileira.
  const xNoDesenho = (clientX: number) => {
    const r = caixa.current?.getBoundingClientRect();
    return r ? ((clientX - r.left) / r.width) * LARGURA : 0;
  };
  const yNoDesenho = (clientY: number) => {
    const r = caixa.current?.getBoundingClientRect();
    return r ? ((clientY - r.top) / r.height) * ALTURA_TOTAL : 0;
  };
  // Fundo ou frente, pela altura do mouse (a fronteira é o corredor entre as fileiras).
  const filPeloY = (y: number): 0 | 1 => (fileiras.length > 1 ? (y < Y_MESA + PE - 2 ? 0 : 1) : (y < Y_MESA - 20 ? 0 : 1));
  const destinoNaFileira = (fil: 0 | 1, x: number) => {
    const daFileira = zonas.filter((z) => z.fil === fil);
    const i = daFileira.findIndex((z) => x < z.x0 + z.largura / 2);
    return i === -1 ? daFileira.length : i;
  };
  const comecarArraste = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return;
    if (!onReordenar) { if (setores.find((s) => s.id === id)?.temEsteira) onAbrirSetor?.(id); return; }
    e.preventDefault();
    const caixaR = caixa.current?.getBoundingClientRect();
    if (!caixaR) return;
    const inicio = { x: e.clientX, y: e.clientY };
    let ativo = false;
    const mover = (ev: PointerEvent) => {
      if (!ativo && Math.hypot(ev.clientX - inicio.x, ev.clientY - inicio.y) < 6) return;   // clique, não arraste
      ativo = true;
      const fil = filPeloY(yNoDesenho(ev.clientY));
      setArraste({ id, fil, x: ev.clientX - caixaR.left, y: ev.clientY - caixaR.top, destino: destinoNaFileira(fil, xNoDesenho(ev.clientX)) });
    };
    const soltar = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      setArraste(null);
      if (!ativo) {   // foi um clique: abre a esteira do escritório (se tiver)
        if (setores.find((s) => s.id === id)?.temEsteira) onAbrirSetor?.(id);
        return;
      }
      const fil = filPeloY(yNoDesenho(ev.clientY));
      const ids = zonas.filter((z) => z.fil === fil).map((z) => z.setor.id);
      const de = ids.indexOf(id);   // -1: veio da outra fileira
      let para = destinoNaFileira(fil, xNoDesenho(ev.clientX));
      if (de >= 0) {
        if (para > de) para -= 1;
        if (para === de) return;
        ids.splice(de, 1);
      }
      ids.splice(para, 0, id);
      onReordenar(ids, fil);
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
  };
  // Linha onde o escritório arrastado vai entrar.
  const linhaDestino = arraste ? (() => {
    const daFileira = zonas.filter((z) => z.fil === arraste.fil);
    if (!daFileira.length) return { x: MARGEM, y: arraste.fil === 0 ? Y_MESA - 40 : Y_MESA + (fileiras.length - 1) * ALTURA_FILEIRA + 40 };
    const z = daFileira[arraste.destino];
    const ult = daFileira[daFileira.length - 1];
    return { x: z ? z.x0 - FOLGA_SETOR / 2 : ult.x0 + ult.largura + FOLGA_SETOR / 2, y: daFileira[0].yMesa };
  })() : null;

  const pctX = (x: number) => `${(x / LARGURA) * 100}%`;
  const pctY = (y: number) => `${(y / ALTURA_TOTAL) * 100}%`;

  return (
    <div className="w-full overflow-x-auto overscroll-x-contain rounded-xl">
      <div ref={caixa} className={cn("esc relative min-w-[820px] overflow-hidden rounded-xl border border-black/5", arraste && "cursor-grabbing select-none")} style={{ aspectRatio: `${LARGURA} / ${ALTURA_TOTAL}` }}>
        <svg viewBox={`0 0 ${LARGURA} ${ALTURA_TOTAL}`} className="absolute inset-0 h-full w-full" aria-hidden="true">
          <style>{ESTILO + ESTILO_SALA}</style>
          <defs>
            <linearGradient id="esc-ceu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#bae6fd" /><stop offset="1" stopColor="#e0f2fe" /></linearGradient>
            <pattern id="esc-piso" width="60" height="14" patternUnits="userSpaceOnUse">
              <rect width="60" height="14" fill="#e7cfa6" /><path d="M0 13.5 H60 M30 0 V14" stroke="#d6b98a" strokeWidth="1" />
            </pattern>
          </defs>
          {/* Parede do fundo, janelas e piso */}
          <rect width={LARGURA} height={PAREDE} fill="#eef2f7" />
          <rect y={PAREDE - 6} width={LARGURA} height="6" fill="#d9e0ea" />
          <rect y={PAREDE} width={LARGURA} height={ALTURA_TOTAL - PAREDE} fill="url(#esc-piso)" />
          {Array.from({ length: Math.floor((LARGURA - 200) / 230) }, (_, k) => (
            <g key={k} transform={`translate(${170 + k * 230} 18)`}>
              <rect width="64" height="50" rx="4" fill="url(#esc-ceu)" stroke="#94a3b8" strokeWidth="3" />
              <path d="M32 0 V50 M0 25 H64" stroke="#94a3b8" strokeWidth="2" />
              <ellipse cx="16" cy="13" rx="8" ry="3.5" fill="#fff" opacity=".9" />
            </g>
          ))}
          <g transform={`translate(${xDescanso - 50} 30)`}>
            <rect width="60" height="4" rx="1" fill="#a16207" />
            {["#ef4444", "#3b82f6", "#f59e0b", "#10b981", "#8b5cf6"].map((c, k) => <rect key={k} x={4 + k * 9} y={-16 + (k % 2) * 2} width="7" height={16 - (k % 2) * 2} rx="1" fill={c} />)}
          </g>
          <g transform={`translate(${xDescanso + 40} 40)`}>
            <circle r="11" fill="#fff" stroke="#475569" strokeWidth="2.5" />
            <rect className="esc-ponteiro" x="-.8" y="-8" width="1.6" height="8" rx=".8" fill="#ef4444" />
            <rect x="-.9" y="-6" width="1.8" height="6" rx=".9" fill="#334155" transform="rotate(120)" />
          </g>
          {/* Corredor entre as fileiras */}
          {fileiras.length > 1 && <rect y={Y_MESA + PE - 12} width={LARGURA} height="20" fill="#d6b98a" opacity=".35" />}

          {/* Áreas: tapete na cor do setor e divisória de vidro entre vizinhos */}
          {zonas.map(({ setor, x0, largura, yMesa }, k) => {
            const vizinho = zonas[k + 1];
            return (
              <g key={setor.id}>
                <rect x={x0 + 6} y={yMesa + 86} width={largura - 12} height="14" rx="7" fill={setor.corPlaca} opacity=".16" />
                {vizinho && vizinho.r === zonas[k].r && <VidroLateral x={x0 + largura + FOLGA_SETOR / 2} yTopo={yMesa - (zonas[k].r === 0 ? 46 : 8)} yBase={yMesa + 96} />}
                {/* A última área de cada fileira também fecha com vidro antes do descanso */}
                {(!vizinho || vizinho.r !== zonas[k].r) && <VidroLateral x={x0 + largura + FOLGA_SETOR / 2} yTopo={yMesa - (zonas[k].r === 0 ? 46 : 8)} yBase={yMesa + 96} />}
              </g>
            );
          })}
          {/* Fileira de cima: a TV no espaço livre e o café no canto */}
          {tvGeo && <MolduraTv x={tvGeo.x} y={tvGeo.y} w={tvGeo.w} h={tvGeo.h} chaoY={chao(0)} />}
          <Cafe x={xDescanso} y={Y_MESA + 16} />
          {fileiras.length > 1 && <Copa x={xDescanso} y={Y_MESA + ALTURA_FILEIRA + 24} />}
          <Planta x={12} y={Y_MESA + 72} s={0.95} />
          <Planta x={LARGURA - 12} y={ALTURA_TOTAL - 34} s={0.9} />

          {/* Mesas (a fileira de trás primeiro, pra a da frente ficar na frente) */}
          {mesas.map(({ p, x, yMesa }) => (
            <BonecoMesa key={p.id} nome={p.nome} ehIa={p.ehIa} sinal={p.sinal} vazio={vaiPassear(p, noite, ciclo)} descansando={livreDeDia(p, noite)} x={x - 52} y={yMesa} width={104} height={92} />
          ))}
          {/* Sala da diretoria fechada em vidro (frente baixa, com porta) */}
          {fileiras.length > 1 && zonas.filter((z) => z.r === 0).map(({ setor, x0, largura, yMesa }) => (
            <VidroFrente key={`frente-${setor.id}`} x0={x0 - 8} x1={x0 + largura + FOLGA_SETOR / 2 - 4} yTopo={yMesa + 70} yBase={yMesa + 100} porta={x0 + largura - 30} />
          ))}
          {/* Quem está livre: vai e volta do descanso da fileira */}
          {mesas.map(({ p, x, r }, k) => {
            if (!vaiPassear(p, noite, ciclo)) return null;
            const d = destinoDe(r, k), y0 = chao(r);
            const dur = DUR[k % DUR.length] + Math.min(14, Math.hypot(d.x - x, d.y - y0) / 60);
            const vars = {
              "--de": `${x}px`, "--de-y": `${y0}px`, "--cafe": `${d.x}px`, "--cafe-y": `${d.y}px`,
              "--dur": `${dur}s`, "--atraso": "0s", "--ida": d.x >= x ? 1 : -1,
            } as React.CSSProperties;
            return (
              // Uma ida e volta só por vez (a chave muda a cada janela e recomeça a animação).
              <g key={`andando-${p.id}-${ciclo}`} style={vars} className="esc-uma-vez">
                <g className="esc-passeio"><g className="esc-vira"><BonecoAndando v={visualDe(p.nome)} /></g></g>
              </g>
            );
          })}
        </svg>

        {/* A tela da TV (HTML por cima do desenho) */}
        {tvGeo && tv && (
          <div className="absolute" style={{ left: pctX(tvGeo.x - tvGeo.w / 2), top: pctY(tvGeo.y), width: pctX(tvGeo.w), height: pctY(tvGeo.h) }}>{tv}</div>
        )}

        {/* Onde o escritório arrastado vai entrar */}
        {linhaDestino && (
          <div className="pointer-events-none absolute z-20 w-1.5 -translate-x-1/2 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary))]"
            style={{ left: pctX(linhaDestino.x), top: pctY(linhaDestino.y - 50), height: pctY(170) }} />
        )}
        {/* Placas dos setores: segurar e arrastar muda a ordem dos escritórios na fileira */}
        {zonas.map(({ setor, x0, yMesa, r }) => (
          <div key={setor.id} onPointerDown={(e) => comecarArraste(e, setor.id)}
            title={onReordenar ? "Segure e arraste para mudar o escritório de lugar" : undefined}
            className={cn("absolute flex items-center gap-1.5 rounded-md bg-white/95 px-2 py-1 shadow-sm",
              onReordenar ? "cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-primary/40" : "pointer-events-none",
              arraste?.id === setor.id && "opacity-40")}
            style={{ left: pctX(x0 + 8), top: r === 0 ? "4%" : pctY(yMesa + 104) }}>
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: setor.corPlaca }} />
            <span className="text-[11px] font-bold text-slate-800">{setor.nome}</span>
            {setor.temEsteira && <span className="rounded bg-primary/15 px-1 text-[9.5px] font-semibold text-primary" title="Clique para abrir a esteira (kanban do time)">esteira ▸</span>}
            <span className="text-[10px] text-slate-500">{setor.tarefas} {setor.tarefas === 1 ? "tarefa" : "tarefas"}{setor.atrasadas > 0 && <b className="text-rose-500"> · {setor.atrasadas} atrasada{setor.atrasadas > 1 ? "s" : ""}</b>}</span>
          </div>
        ))}

        {/* A placa "na mão" enquanto arrasta */}
        {arraste && (() => {
          const s = setores.find((x) => x.id === arraste.id);
          return s ? (
            <div className="pointer-events-none absolute z-30 flex -translate-x-1/2 -translate-y-1/2 rotate-2 items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 shadow-xl ring-2 ring-primary"
              style={{ left: arraste.x, top: arraste.y }}>
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.corPlaca }} />
              <span className="text-[12px] font-bold text-slate-800">{s.nome}</span>
              <span className="text-[10px] text-slate-500">{s.pessoas.length} {s.pessoas.length === 1 ? "pessoa" : "pessoas"}</span>
            </div>
          ) : null;
        })()}

        {/* Balões, nomes e o clique de cada mesa */}
        {mesas.map(({ p, x, yMesa }) => (
          <button key={p.id} type="button" disabled={!p.clicavel} onClick={() => onAbrir(p.id)}
            title={p.clicavel ? (p.ehIa ? `Conversar com ${p.nome}` : `Ver e adicionar tarefas de ${p.nome}`) : undefined}
            className="group/mesa absolute flex -translate-x-1/2 flex-col items-center justify-between rounded-lg outline-none transition-colors enabled:hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-primary"
            style={{ left: pctX(x), top: pctY(yMesa - 14), height: pctY(110), width: pctX(LARGURA_MESA - 6) }}>
            {p.balao ? (
              <span className={cn("line-clamp-2 max-w-full rounded-md border bg-white/95 px-1.5 py-0.5 text-center text-[10px] font-medium leading-tight text-slate-800 shadow-sm",
                p.sinal === "esperando" && "border-amber-400", p.sinal === "problema" && "border-rose-400")}>{p.balao}</span>
            ) : <span />}
            <span className="flex max-w-full items-center gap-1 rounded-full bg-slate-900/80 px-2 py-0.5 text-[10.5px] font-semibold text-white shadow">
              <span className={cn("h-2 w-2 shrink-0 rounded-full", p.corSinal)} title={p.rotuloSinal} />
              <span className="truncate">{p.nome}</span>
              {p.clicavel && (
                <span className="shrink-0 font-normal text-white/70">
                  <span className="group-hover/mesa:hidden">· {p.tarefas}{p.atrasadas > 0 && <span className="text-rose-300"> ({p.atrasadas}!)</span>}</span>
                  <span className="hidden text-cyan-300 group-hover/mesa:inline">+ tarefa</span>
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
});
