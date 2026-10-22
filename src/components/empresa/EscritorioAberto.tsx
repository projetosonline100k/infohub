import { memo, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ehNomeCoordenador } from "@/lib/empresa/visaoGeral";
import { BonecoMesa, ESTILO, cabeloDe, cabeloTras, visualDe, type Visual } from "./BonecoMesa";
import { ESTILO_SALA, Planta, type PessoaNaSala, type SetorNoEscritorio } from "./EscritorioEmpresa";

// Escritório de verdade, visto de cima (22/10, Davi: "um único escritório contínuo, como The Sims /
// tycoon; os setores existem DENTRO dele, sem caixas coloridas; 25–30% livre para circular").
// Planta fixa (1600 × 980): parede do fundo com janelas e o "Nosso resultado"; três faixas de ambientes
// separadas por corredores largos:
//   DIRETORIA (sala de vidro) · sofá de frente para a TV · COPA
//   MARKETING (ilha) · área colaborativa (mesa comprida) · AUDIOVISUAL (estações de edição)
//   LAB. VIRAL (ilha) · sala de REUNIÃO (vidro) · SUCESSO DO CLIENTE · SALES
// Os setores do projeto ocupam esses ambientes pelo nome; setor sem ambiente próprio pega um livre.
// Não há mesa fixa: cada ambiente tem estações e quem vai trabalhar senta numa livre. A posição de cada
// um vem do estado REAL (trabalhando → estação do setor da tarefa; conversando com o Davi → reunião,
// e o Davi vai junto; livre → copa ou sofá; noite → cochilando na estação da área dele) e, quando muda,
// ele anda pelos corredores até o lugar novo.

const W = 1600;
const H = 980;
const PAREDE = 138;
const CORREDORES = [356, 640];          // faixas livres de circulação (y)
const PASSAGENS = [560, 1040];          // passagens verticais entre as colunas (x)
const VEL = 105;
const TV = { x: 640, y: 12, w: 320, h: 118 };

type Pt = { x: number; y: number };
interface Ambiente {
  chave: string; rotulo: string; placa: Pt;
  estacoes: Pt[];                 // topo do quadro da estação (104 × 92), x = centro
  monitores?: boolean;            // estação de edição (dois monitores)
}
// Os ambientes de trabalho, na ordem em que um setor sem nome conhecido ocupa o que sobrar.
const AMBIENTES: Ambiente[] = [
  { chave: "diretoria", rotulo: "Diretoria", placa: { x: 54, y: 156 }, estacoes: [{ x: 196, y: 214 }, { x: 346, y: 214 }] },
  { chave: "marketing", rotulo: "Marketing", placa: { x: 54, y: 400 },
    estacoes: [{ x: 128, y: 446 }, { x: 246, y: 446 }, { x: 128, y: 532 }, { x: 246, y: 532 }, { x: 364, y: 532 }] },
  { chave: "audiovisual", rotulo: "Audiovisual", placa: { x: 1094, y: 400 }, monitores: true,
    estacoes: [{ x: 1150, y: 446 }, { x: 1290, y: 446 }, { x: 1150, y: 532 }, { x: 1290, y: 532 }] },
  { chave: "viral", rotulo: "Laboratório de Viral", placa: { x: 54, y: 684 },
    estacoes: [{ x: 128, y: 730 }, { x: 246, y: 730 }, { x: 128, y: 818 }, { x: 246, y: 818 }, { x: 364, y: 818 }] },
  { chave: "sucesso", rotulo: "Sucesso do Cliente", placa: { x: 1094, y: 684 }, estacoes: [{ x: 1150, y: 736 }, { x: 1150, y: 826 }] },
  { chave: "sales", rotulo: "Sales", placa: { x: 1330, y: 684 }, estacoes: [{ x: 1400, y: 736 }, { x: 1520, y: 736 }, { x: 1400, y: 826 }] },
];
const PALAVRAS: Record<string, RegExp> = {
  diretoria: /diretoria|dire[cç][aã]o|ceo|s[oó]cio/i,
  marketing: /marketing|mkt|grow|tr[aá]fego|conte[uú]do/i,
  audiovisual: /audiovisual|v[ií]deo|edi[cç][aã]o|est[uú]dio|design/i,
  viral: /viral|lab|roteiro|copy/i,
  sucesso: /sucesso|cliente|suporte|\bcs\b|atendimento/i,
  sales: /sales|venda|comercial|closer|sdr/i,
};
// Mesa colaborativa (quem não coube na área) e os lugares de quem está livre ou em reunião.
const COLABORATIVA: Pt[] = [{ x: 690, y: 446 }, { x: 800, y: 446 }, { x: 910, y: 446 }];
const REUNIAO_C = { x: 800, y: 790 };
const VAGAS_REUNIAO: (Pt & { virado: 1 | -1 })[] = [
  { x: 706, y: 800, virado: 1 }, { x: 894, y: 800, virado: -1 }, { x: 740, y: 866, virado: 1 }, { x: 860, y: 866, virado: -1 },
  { x: 740, y: 752, virado: 1 }, { x: 860, y: 752, virado: -1 },
];
const VAGAS_LIVRE: (Pt & { onde: string; sentado?: boolean; xicara?: boolean })[] = [
  { x: 1340, y: 318, onde: "Copa", xicara: true }, { x: 1400, y: 318, onde: "Copa", xicara: true },
  { x: 740, y: 300, onde: "Descanso", sentado: true }, { x: 800, y: 300, onde: "Descanso", sentado: true },
  { x: 860, y: 300, onde: "Descanso", sentado: true }, { x: 1530, y: 318, onde: "Copa", xicara: true },
  { x: 1236, y: 318, onde: "Copa", xicara: true },
];

const ehRobo = (p: PessoaNaSala) => p.ehIa && ehNomeCoordenador(p.nome);
const ehNoite = () => { const h = new Date().getHours(); return h >= 22 || h < 7; };
const ehDavi = (p: PessoaNaSala) => !p.ehIa && /^davi\b/i.test(p.nome);
const somaId = (id: string) => [...id].reduce((t, c) => t + c.charCodeAt(0), 0);

type Lugar =
  | { tipo: "mesa"; amb: string; est: number; x: number; y: number; pes: Pt; onde: string }
  | { tipo: "pe"; x: number; y: number; onde: string; virado?: 1 | -1; sentado?: boolean; xicara?: boolean };

// ---------------------------------------------------------------- móveis e decoração
function Sombra({ x, y, w, h, o = 0.12 }: { x: number; y: number; w: number; h: number; o?: number }) {
  return <ellipse cx={x} cy={y} rx={w / 2} ry={h / 2} fill="#000" opacity={o} />;
}
function Monitores({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-4" y="22" width="8" height="10" fill="#475569" />
      <rect x="-24" y="-6" width="48" height="30" rx="3" fill="#0f172a" stroke="#334155" strokeWidth="1.5" />
      <rect x="-21" y="-3" width="42" height="24" rx="1.5" fill="#1e3a8a" />
      <path d="M-18 14 h10 M-6 14 h6 M2 14 h14" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M-18 8 h22" stroke="#a78bfa" strokeWidth="2.5" strokeLinecap="round" />
    </g>
  );
}
function Estante({ x, y, w = 110 }: { x: number; y: number; w?: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <Sombra x={w / 2} y={74} w={w + 10} h={8} />
      <rect width={w} height="70" rx="3" fill="#8b5e34" />
      {[8, 30, 52].map((yy) => <rect key={yy} x="5" y={yy} width={w - 10} height="3" fill="#6b4423" />)}
      {[0, 1, 2].flatMap((r) => Array.from({ length: Math.floor((w - 14) / 9) }, (_, k) => (
        <rect key={`${r}-${k}`} x={8 + k * 9} y={r * 22 + 12 - (k % 3)} width="6" height={14 + (k % 3)} rx="1"
          fill={["#ef4444", "#3b82f6", "#f59e0b", "#10b981", "#8b5cf6", "#f97316"][(k + r) % 6]} opacity={k % 4 === 3 ? 0 : 0.9} />
      )))}
    </g>
  );
}
function Quadro({ x, y, w = 120 }: { x: number; y: number; w?: number }) {
  const notas: [string, number, number][] = [["#fde047", 10, 10], ["#86efac", 38, 14], ["#f9a8d4", 66, 8], ["#93c5fd", 18, 36], ["#fdba74", 52, 38], ["#fde047", 84, 32]];
  return (
    <g transform={`translate(${x} ${y})`}>
      <Sombra x={w / 2} y={100} w={w} h={8} />
      <rect width={w} height="62" rx="3" fill="#f8fafc" stroke="#94a3b8" strokeWidth="2" />
      {notas.map(([c, xx, yy], k) => <rect key={k} x={xx} y={yy} width="20" height="16" rx="1.5" fill={c} transform={`rotate(${k % 2 ? 3 : -3} ${xx + 10} ${yy + 8})`} />)}
      <rect x={w / 2 - 20} y="62" width="4" height="34" fill="#94a3b8" /><rect x={w / 2 + 16} y="62" width="4" height="34" fill="#94a3b8" />
    </g>
  );
}
function VidroFrente({ x0, x1, y }: { x0: number; x1: number; y: number }) {
  const n = Math.max(2, Math.floor((x1 - x0) / 80));
  return (
    <g>
      <rect x={x0} y={y - 32} width={x1 - x0} height="32" fill="#bfe3ff" opacity=".28" />
      <rect x={x0} y={y - 34} width={x1 - x0} height="3" fill="#94a3b8" /><rect x={x0} y={y - 2} width={x1 - x0} height="3.5" fill="#94a3b8" />
      {Array.from({ length: n + 1 }, (_, k) => <rect key={k} x={x0 + ((x1 - x0) * k) / n - 1} y={y - 34} width="2" height="34" fill="#a5b4c6" />)}
      <path d={`M${x0 + 14} ${y - 6} l12 -22`} stroke="#fff" strokeWidth="1.4" opacity=".7" />
    </g>
  );
}
function VidroLado({ x, y0, y1 }: { x: number; y0: number; y1: number }) {
  return (
    <g>
      <path d={`M${x} ${y0} L${x + 10} ${y0 + 8} L${x + 10} ${y1 + 8} L${x} ${y1} Z`} fill="#bfe3ff" opacity=".38" />
      <path d={`M${x} ${y0} V${y1}`} stroke="#94a3b8" strokeWidth="2" /><path d={`M${x + 10} ${y0 + 8} V${y1 + 8}`} stroke="#cbd5e1" strokeWidth="1.2" />
      <path d={`M${x + 2} ${y0 + 30} l6 10 M${x + 2} ${y0 + 52} l6 6`} stroke="#fff" strokeWidth="1.4" opacity=".8" />
    </g>
  );
}
function SofaGrande({ x, y, cor = "#475569" }: { x: number; y: number; cor?: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <Sombra x={0} y={52} w={250} h={16} />
      <rect x="-105" y="-14" width="210" height="38" rx="12" fill={cor} />
    </g>
  );
}
function SofaFrente({ x, y, cor = "#334155" }: { x: number; y: number; cor?: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-105" y="16" width="210" height="32" rx="10" fill={cor} />
      <rect x="-118" y="2" width="20" height="46" rx="8" fill="#2b3647" /><rect x="98" y="2" width="20" height="46" rx="8" fill="#2b3647" />
      <rect x="-80" y="8" width="26" height="14" rx="5" fill="#f59e0b" opacity=".9" /><rect x="54" y="8" width="26" height="14" rx="5" fill="#38bdf8" opacity=".8" />
    </g>
  );
}
function MesaComprida({ x, y, w }: { x: number; y: number; w: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <Sombra x={w / 2} y={74} w={w + 40} h={20} />
      {Array.from({ length: Math.floor(w / 70) }, (_, k) => <rect key={k} x={24 + k * 70} y="22" width="34" height="30" rx="9" fill="#64748b" />)}
      <rect x="0" y="46" width={w} height="14" rx="5" fill="#e7d3ad" />
      <rect x="6" y="60" width={w - 12} height="10" rx="3" fill="#cfb48a" />
      <rect x={w / 2 - 28} y="38" width="22" height="10" rx="2" fill="#e2e8f0" stroke="#94a3b8" strokeWidth=".8" />
      <circle cx={w / 2 + 20} cy="42" r="5" fill="#fff" stroke="#cbd5e1" />
    </g>
  );
}
function MesaRedonda({ x, y, r = 54 }: { x: number; y: number; r?: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <Sombra x={0} y={r * 0.62} w={r * 2.4} h={r * 0.6} />
      {[-0.8, -0.3, 0.3, 0.8].map((f) => <rect key={f} x={f * r - 14} y={-r * 0.62} width="28" height="24" rx="8" fill="#64748b" />)}
      <ellipse cx="0" cy="6" rx={r} ry={r * 0.38} fill="#a16207" />
      <ellipse cx="0" cy="0" rx={r} ry={r * 0.38} fill="#ca8a04" />
      <rect x="-5" y={r * 0.3} width="10" height={r * 0.36} fill="#78350f" />
      <rect x="-16" y="-8" width="20" height="11" rx="2" fill="#e2e8f0" stroke="#94a3b8" strokeWidth=".8" />
      <circle cx="22" cy="-2" r="4.5" fill="#fff" stroke="#cbd5e1" />
    </g>
  );
}
function BalcaoCopa({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <Sombra x={170} y={70} w={360} h={12} />
      <rect x="0" y="0" width="340" height="62" rx="4" fill="#cbd5e1" />
      <rect x="0" y="-6" width="340" height="9" rx="3" fill="#94a3b8" />
      {[10, 92, 174].map((xx) => <rect key={xx} x={xx} y="10" width="72" height="44" rx="3" fill="#e2e8f0" stroke="#b6c2d1" />)}
      <rect x="22" y="-38" width="30" height="34" rx="4" fill="#1f2937" /><circle cx="44" cy="-30" r="2" fill="#ef4444" />
      <path className="esc-fumaca" d="M34 -42 q-3 -5 0 -9 q3 -4 0 -8" stroke="#cbd5e1" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <rect x="66" y="-20" width="30" height="16" rx="3" fill="#a16207" />
      {[70, 78, 86].map((xx) => <rect key={xx} x={xx} y="-28" width="6" height="8" rx="1" fill="#fff" stroke="#cbd5e1" strokeWidth=".5" />)}
      <rect x="262" y="-70" width="40" height="132" rx="4" fill="#e5e7eb" stroke="#9ca3af" /><rect x="266" y="-30" width="3" height="20" rx="1.5" fill="#9ca3af" />
      <g transform="translate(320 -6)"><rect x="-9" y="20" width="18" height="40" rx="3" fill="#e2e8f0" stroke="#94a3b8" /><rect x="-7" y="0" width="14" height="22" rx="5" fill="#93c5fd" opacity=".85" /></g>
    </g>
  );
}
function MesaBistro({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <Sombra x={0} y={34} w={70} h={12} />
      <ellipse cx="0" cy="0" rx="26" ry="10" fill="#f8fafc" stroke="#cbd5e1" />
      <rect x="-2.5" y="8" width="5" height="26" fill="#64748b" />
      <rect x="-6" y="-8" width="6" height="7" rx="1" fill="#fff" stroke="#cbd5e1" strokeWidth=".6" />
    </g>
  );
}
function Banco({ x, y }: { x: number; y: number }) {
  return <g transform={`translate(${x} ${y})`}><ellipse cx="0" cy="0" rx="11" ry="4.5" fill="#334155" /><rect x="-1.5" y="2" width="3" height="18" fill="#64748b" /><Sombra x={0} y={21} w={20} h={4} /></g>;
}
function Tapete({ x, y, w, h, cor }: { x: number; y: number; w: number; h: number; cor: string }) {
  return <rect x={x} y={y} width={w} height={h} rx={Math.min(18, h / 2.4)} fill={cor} opacity=".5" />;
}
function Luminaria({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="0" cy="70" rx="46" ry="16" fill="#fde68a" opacity=".16" />
      <Sombra x={0} y={64} w={26} h={6} />
      <rect x="-1.5" y="0" width="3" height="62" fill="#475569" />
      <path d="M-14 0 h28 l-6 -16 h-16 Z" fill="#fde68a" stroke="#eab308" strokeWidth=".8" />
    </g>
  );
}
function Camera({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <Sombra x={0} y={64} w={46} h={8} />
      <path d="M-20 62 L0 22 L20 62 M0 22 V62" stroke="#334155" strokeWidth="3" fill="none" />
      <rect x="-14" y="6" width="28" height="18" rx="3" fill="#0f172a" /><circle cx="14" cy="15" r="6" fill="#1e293b" stroke="#475569" />
    </g>
  );
}
function FundoVerde({ x, y }: { x: number; y: number }) {
  return <g transform={`translate(${x} ${y})`}><Sombra x={36} y={128} w={90} h={10} /><rect x="0" y="0" width="72" height="124" rx="4" fill="#22c55e" opacity=".9" /><rect x="0" y="0" width="72" height="8" rx="3" fill="#15803d" /></g>;
}

// ---------------------------------------------------------------- bonecos de pé / andando
function BonecoDePe({ v, andando, xicara }: { v: Visual; andando?: boolean; xicara?: boolean }) {
  return (
    <g className={andando ? "ea-andando" : undefined}>
      <ellipse cx="0" cy="1" rx="11" ry="2.6" fill="#000" opacity=".18" />
      <g className="ea-corpo">
        <g className="ea-perna-e"><rect x="-6.5" y="-25" width="5.5" height="25" rx="2.5" fill="#334155" /><ellipse cx="-3.5" cy="0" rx="4" ry="2" fill="#1e293b" /></g>
        <g className="ea-perna-d"><rect x="1" y="-25" width="5.5" height="25" rx="2.5" fill="#3b4a5f" /><ellipse cx="4" cy="0" rx="4" ry="2" fill="#1e293b" /></g>
        <rect x="-3.5" y="-55" width="7" height="6" rx="2" fill={v.pele} />
        <rect x="-11.5" y="-51" width="23" height="29" rx="8" fill={v.camisa} />
        <rect x="-15" y="-49" width="5" height="21" rx="2.5" fill={v.camisa} /><circle cx="-12.5" cy="-27" r="2.6" fill={v.pele} />
        <g className={xicara ? "ea-gole" : undefined} style={{ transformOrigin: "50% 8%" }}>
          <rect x="10" y="-49" width="5" height="21" rx="2.5" fill={v.camisa} /><circle cx="12.5" cy="-27" r="2.6" fill={v.pele} />
          {xicara && <g><rect x="10" y="-28" width="6" height="5.5" rx="1.2" fill="#fff" stroke="#cbd5e1" strokeWidth=".6" /><rect x="11" y="-28" width="4" height="1.3" fill="#7c4a24" /></g>}
        </g>
        <g transform="translate(-60 -99)">
          {cabeloTras(v)}
          <circle cx="46.8" cy="41.5" r="2.6" fill={v.pele} /><circle cx="73.2" cy="41.5" r="2.6" fill={v.pele} />
          <circle cx="60" cy="39.5" r="13.2" fill={v.pele} />
          {cabeloDe(v)}
          {v.barba && <path d="M47.6 42 Q48.5 54.5 60 55 Q71.5 54.5 72.4 42 Q70.5 49 60 49.5 Q49.5 49 47.6 42 Z" fill={v.corCabelo} opacity=".92" />}
          <g className="bnc-piscar"><circle cx="55" cy="40.5" r="1.5" fill="#2a1d15" /><circle cx="65" cy="40.5" r="1.5" fill="#2a1d15" /></g>
          <path d="M57.5 46 q2.5 1.4 5 0" stroke="#7c2d12" strokeWidth="1" fill="none" strokeLinecap="round" />
          {v.oculos && <g fill="none" stroke="#1f2937" strokeWidth="1"><circle cx="55" cy="40.5" r="3.6" /><circle cx="65" cy="40.5" r="3.6" /><path d="M58.6 40.5 h2.8" /></g>}
        </g>
      </g>
    </g>
  );
}

const ESTILO_ABERTO = `
.ea-andando .ea-perna-e{transform-origin:50% 0;animation:ea-passo .5s linear infinite}
.ea-andando .ea-perna-d{transform-origin:50% 0;animation:ea-passo .5s linear infinite reverse}
.ea-andando .ea-corpo{animation:ea-ginga .25s ease-in-out infinite alternate}
@keyframes ea-passo{0%,100%{transform:rotate(18deg)}50%{transform:rotate(-18deg)}}
@keyframes ea-ginga{to{transform:translateY(-1.4px)}}
.ea-gole{animation:ea-gole 9s ease-in-out infinite}
@keyframes ea-gole{0%,70%,100%{transform:rotate(0)}78%,86%{transform:rotate(-65deg)}}
.ea-mover{transition:transform var(--ea-dur,0s) linear}
.ea-rotulo{transition:left var(--ea-dur,0s) linear, top var(--ea-dur,0s) linear}
@media (prefers-reduced-motion:reduce){.ea-mover,.ea-rotulo{transition:none}.esc *{animation:none!important}}
`;

export const EscritorioAberto = memo(function EscritorioAberto({ setores, onAbrir, forcarNoite, tv, onAbrirSetor }: {
  setores: SetorNoEscritorio[]; onAbrir: (id: string) => void; forcarNoite?: boolean;
  tv?: React.ReactNode; onAbrirSetor?: (id: string) => void;
}) {
  const [noiteAgora, setNoite] = useState(ehNoite);
  const noite = forcarNoite ?? noiteAgora;
  useEffect(() => { const t = window.setInterval(() => setNoite(ehNoite()), 60_000); return () => window.clearInterval(t); }, []);

  const geo = useMemo(() => {
    // Cada setor do projeto ocupa um ambiente: pelo nome; quem não casar pega o primeiro livre.
    const ambDoSetor = new Map<string, Ambiente>();
    const usados = new Set<string>();
    for (const s of setores) {
      const a = AMBIENTES.find((x) => !usados.has(x.chave) && PALAVRAS[x.chave].test(s.nome));
      if (a) { ambDoSetor.set(s.id, a); usados.add(a.chave); }
    }
    for (const s of setores) {
      if (ambDoSetor.has(s.id)) continue;
      const a = AMBIENTES.find((x) => !usados.has(x.chave));
      if (a) { ambDoSetor.set(s.id, a); usados.add(a.chave); }
    }
    const pessoas = setores.flatMap((s) => s.pessoas.map((p) => ({ p, setor: s.id })));
    const alguemConversando = !noite && pessoas.some(({ p }) => p.conversando);
    const lugar = new Map<string, Lugar>();
    const ocupadas = new Map<string, Set<number>>();
    const colab = new Set<number>();
    const reuniao: PessoaNaSala[] = [];
    const livres: PessoaNaSala[] = [];
    const nomeDoSetor = (id: string) => setores.find((s) => s.id === id)?.nome ?? "";
    const sentar = (p: PessoaNaSala, setorId: string, setorDele: string) => {
      const a = ambDoSetor.get(setorId) ?? ambDoSetor.get(setorDele);
      if (a) {
        const usadas = ocupadas.get(a.chave) ?? new Set<number>();
        // A "de costume" (pela ordem na equipe) se estiver livre; senão a primeira livre.
        const ideal = setores.find((s) => s.id === setorDele)?.pessoas.findIndex((x) => x.id === p.id) ?? -1;
        let est = setorId === setorDele && ideal >= 0 && ideal < a.estacoes.length && !usadas.has(ideal) ? ideal : -1;
        if (est < 0) est = a.estacoes.findIndex((_, k) => !usadas.has(k));
        if (est >= 0) {
          usadas.add(est); ocupadas.set(a.chave, usadas);
          const e = a.estacoes[est];
          lugar.set(p.id, { tipo: "mesa", amb: a.chave, est, x: e.x, y: e.y, pes: { x: e.x, y: e.y + 96 }, onde: nomeDoSetor(setorId) || a.rotulo });
          return;
        }
      }
      // Sem estação livre na área: senta na mesa colaborativa.
      const k = COLABORATIVA.findIndex((_, i) => !colab.has(i));
      if (k >= 0) {
        colab.add(k);
        const e = COLABORATIVA[k];
        lugar.set(p.id, { tipo: "mesa", amb: "colab", est: k, x: e.x, y: e.y, pes: { x: e.x, y: e.y + 96 }, onde: "Área colaborativa" });
      }
    };
    const trabalhando = pessoas.filter(({ p }) => {
      if (!noite && (p.conversando || (alguemConversando && ehDavi(p)))) { reuniao.push(p); return false; }
      if (noite || ehRobo(p) || p.sinal !== "parado") return true;
      livres.push(p); return false;
    });
    const zonaDe = (p: PessoaNaSala, setor: string) => (!noite && p.setorTarefa && ambDoSetor.has(p.setorTarefa) ? p.setorTarefa : setor);
    // Primeiro quem é da área (fica no lugar de costume), depois quem veio de outra área.
    for (const { p, setor } of trabalhando.filter(({ p, setor }) => zonaDe(p, setor) === setor)) sentar(p, setor, setor);
    for (const { p, setor } of trabalhando.filter(({ p, setor }) => zonaDe(p, setor) !== setor)) sentar(p, zonaDe(p, setor), setor);
    reuniao.forEach((p, k) => { const v = VAGAS_REUNIAO[k % VAGAS_REUNIAO.length]; lugar.set(p.id, { tipo: "pe", x: v.x, y: v.y, onde: "Reunião", virado: v.virado }); });
    // Livre: cada um com o "seu" lugar na copa ou no sofá (pelo id), sem trocar só porque outro saiu.
    const vagasUsadas = new Set<number>();
    [...livres].sort((a, b) => a.id.localeCompare(b.id)).forEach((p) => {
      let k = somaId(p.id) % VAGAS_LIVRE.length;
      for (let n = 0; vagasUsadas.has(k) && n < VAGAS_LIVRE.length; n++) k = (k + 1) % VAGAS_LIVRE.length;
      vagasUsadas.add(k);
      const v = VAGAS_LIVRE[k];
      lugar.set(p.id, { tipo: "pe", x: v.x, y: v.y, onde: v.onde, sentado: v.sentado, xicara: v.xicara });
    });
    const ambientesUsados = [...ambDoSetor.entries()].map(([id, a]) => ({ a, s: setores.find((x) => x.id === id)! }));
    return { lugar, ambientesUsados, pessoas: pessoas.map((x) => x.p) };
  }, [setores, noite]);

  // ---------------------------------------------------------------- andar quando o lugar muda
  type Andando = { dur: number; chave: number; pontos: Pt[] };
  const [andando, setAndando] = useState<Record<string, Andando>>({});
  const antes = useRef<Map<string, string>>(new Map());
  const pesAntes = useRef<Map<string, Pt>>(new Map());
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    const novos: Record<string, Andando> = {};
    for (const p of geo.pessoas) {
      const l = geo.lugar.get(p.id);
      if (!l || ehRobo(p)) continue;
      const pes = l.tipo === "mesa" ? l.pes : { x: l.x, y: l.y };
      const chave = l.tipo === "mesa" ? `m-${l.amb}-${l.est}` : `p-${l.onde}-${l.x}`;
      const anterior = antes.current.get(p.id);
      const de = pesAntes.current.get(p.id);
      if (anterior && anterior !== chave && de) {
        // Vai até o corredor mais perto (pela passagem entre as colunas, se precisar), anda por ele e entra no destino.
        const meio = (de.y + pes.y) / 2;
        const yc = CORREDORES.reduce((m, y) => (Math.abs(y - meio) < Math.abs(m - meio) ? y : m), CORREDORES[0]);
        const ate = (q: Pt): Pt[] => {
          if (Math.abs(q.y - yc) < 110) return [{ x: q.x, y: yc }];
          const xp = PASSAGENS.reduce((m, x) => (Math.abs(x - q.x) < Math.abs(m - q.x) ? x : m), PASSAGENS[0]);
          const yLivre = q.y + (yc > q.y ? 18 : -18);
          return [{ x: q.x, y: yLivre }, { x: xp, y: yLivre }, { x: xp, y: yc }];
        };
        const pontos = [de, ...ate(de), ...ate(pes).reverse(), pes];
        const total = pontos.slice(1).reduce((t, q, k) => t + Math.hypot(q.x - pontos[k].x, q.y - pontos[k].y), 0);
        const dur = Math.min(14, Math.max(1.6, total / VEL));
        novos[p.id] = { dur, chave: Date.now(), pontos };
        timers.current.push(window.setTimeout(() => setAndando((a) => { const n = { ...a }; delete n[p.id]; return n; }), dur * 1000 + 80));
      }
      antes.current.set(p.id, chave);
      pesAntes.current.set(p.id, pes);
    }
    if (Object.keys(novos).length) setAndando((a) => ({ ...a, ...novos }));
  }, [geo]);

  const { lugar } = geo;
  const pctX = (x: number) => `${(x / W) * 100}%`;
  const pctY = (y: number) => `${(y / H) * 100}%`;
  const quemNaMesa = (amb: string, est: number) => geo.pessoas.find((q) => { const l = lugar.get(q.id); return l?.tipo === "mesa" && l.amb === amb && l.est === est && !andando[q.id]; });
  const estacao = (amb: string, est: number, e: Pt, monitores?: boolean) => {
    const p = quemNaMesa(amb, est);
    return (
      <g key={`${amb}-${est}`}>
        <Sombra x={e.x} y={e.y + 94} w={110} h={12} o={0.16} />
        {p
          ? <BonecoMesa nome={p.nome} ehIa={p.ehIa} sinal={p.sinal} descansando={!noite && p.sinal === "parado"} x={e.x - 52} y={e.y} width={104} height={92} />
          : <BonecoMesa nome="" ehIa={false} sinal="parado" vazio x={e.x - 52} y={e.y} width={104} height={92} />}
        {monitores && <Monitores x={e.x + 54} y={e.y + 44} />}
      </g>
    );
  };
  const dePe = (p: PessoaNaSala) => {
    const l = lugar.get(p.id);
    if (!l || l.tipo !== "pe" || andando[p.id]) return null;
    return (
      <g key={`pe-${p.id}`} transform={`translate(${l.x} ${l.y}) scale(${l.virado ?? 1} 1)`}>
        <BonecoDePe v={visualDe(p.nome)} xicara={l.xicara} />
      </g>
    );
  };
  const sentadosNoSofa = geo.pessoas.filter((p) => { const l = lugar.get(p.id); return l?.tipo === "pe" && l.sentado; });
  const deResto = geo.pessoas.filter((p) => { const l = lugar.get(p.id); return l?.tipo === "pe" && !l.sentado; });
  const usado = (chave: string) => geo.ambientesUsados.some((u) => u.a.chave === chave);

  return (
    <div className="w-full overflow-x-auto overscroll-x-contain rounded-xl">
      <div className="esc relative min-w-[900px] overflow-hidden rounded-xl border border-black/10 shadow-inner" style={{ aspectRatio: `${W} / ${H}` }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" aria-hidden="true">
          <style>{ESTILO + ESTILO_SALA + ESTILO_ABERTO}</style>
          <defs>
            <linearGradient id="ea-ceu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#bae6fd" /><stop offset="1" stopColor="#e0f2fe" /></linearGradient>
            <pattern id="ea-piso" width="96" height="24" patternUnits="userSpaceOnUse">
              <rect width="96" height="24" fill="#e8d2ab" /><path d="M0 23.5 H96 M48 0 V24" stroke="#d9bd8f" strokeWidth="1" />
              <path d="M24 0 V12 M72 12 V24" stroke="#e0c79c" strokeWidth=".8" />
            </pattern>
            <radialGradient id="ea-luz"><stop offset="0" stopColor="#fff7e6" stopOpacity=".7" /><stop offset="1" stopColor="#fff7e6" stopOpacity="0" /></radialGradient>
            <linearGradient id="ea-vinheta" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#000" stopOpacity=".08" /><stop offset=".22" stopColor="#000" stopOpacity="0" /><stop offset=".86" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".12" /></linearGradient>
          </defs>

          {/* Piso contínuo e parede do fundo com janelas */}
          <rect width={W} height={H} fill="url(#ea-piso)" />
          <rect width={W} height={PAREDE} fill="#eef1f5" />
          <rect y={PAREDE - 8} width={W} height="8" fill="#d5dbe4" />
          <rect y={PAREDE} width={W} height="10" fill="#000" opacity=".06" />
          {[70, 250, 430, 1020, 1430].map((x) => (
            <g key={x} transform={`translate(${x} 26)`}>
              <rect width="120" height="84" rx="4" fill="url(#ea-ceu)" stroke="#94a3b8" strokeWidth="3" />
              <path d="M60 0 V84 M0 42 H120" stroke="#94a3b8" strokeWidth="2" />
              <ellipse cx="30" cy="20" rx="12" ry="4.5" fill="#fff" opacity=".9" /><ellipse cx="88" cy="58" rx="9" ry="3.5" fill="#fff" opacity=".7" />
            </g>
          ))}
          {/* Luz das janelas e das luminárias no chão */}
          {[[140, 210, 230], [470, 210, 200], [1250, 230, 240], [800, 520, 300], [270, 520, 260], [1300, 520, 270], [270, 800, 260], [800, 800, 240], [1330, 800, 260]].map(([x, y, r], k) => (
            <circle key={k} cx={x} cy={y} r={r} fill="url(#ea-luz)" />
          ))}
          {/* Corredores: piso mais claro, sem móveis */}
          {CORREDORES.map((y) => <rect key={y} x="0" y={y - 28} width={W} height="56" fill="#f4e6c9" opacity=".6" />)}
          {PASSAGENS.map((x) => <rect key={x} x={x - 34} y={PAREDE} width="68" height={H - PAREDE} fill="#f4e6c9" opacity=".4" />)}

          {/* ---- Faixa de cima: Diretoria (sala de vidro) · sofá de frente para a TV · Copa ---- */}
          <Tapete x={80} y={250} w={400} h={70} cor="#cbd5e1" />
          <Estante x={40} y={154} w={96} />
          <Luminaria x={470} y={164} />
          <Planta x={36} y={316} s={0.8} />
          <rect x={TV.x - 8} y={TV.y - 8} width={TV.w + 16} height={TV.h + 16} rx="6" fill="#0f172a" stroke="#334155" strokeWidth="2" />
          <rect x={TV.x + 40} y={PAREDE + 2} width={TV.w - 80} height="14" rx="3" fill="#8b5e34" />
          <Planta x={TV.x - 30} y={PAREDE + 24} s={0.8} /><Planta x={TV.x + TV.w + 30} y={PAREDE + 24} s={0.8} />
          <Tapete x={660} y={262} w={280} h={64} cor="#d6c4a3" />
          <SofaGrande x={800} y={262} />
          <BalcaoCopa x={1180} y={164} />
          {[1300, 1360, 1420].map((x) => <Banco key={x} x={x} y={262} />)}
          <MesaBistro x={1530} y={268} />

          {/* ---- Faixa do meio: Marketing (ilha) · área colaborativa · Audiovisual (edição) ---- */}
          <Tapete x={70} y={434} w={350} h={196} cor="#d9c7a6" />
          {usado("marketing") && <Quadro x={410} y={420} w={120} />}
          <Planta x={40} y={612} s={0.85} /><Planta x={520} y={612} s={0.8} />
          <rect x={640} y={402} width="150" height="58" rx="4" fill="#f8fafc" stroke="#94a3b8" strokeWidth="2" />
          <path d="M656 418 h60 M656 430 h96 M656 442 h40" stroke="#60a5fa" strokeWidth="3" strokeLinecap="round" />
          <Tapete x={630} y={548} w={340} h={44} cor="#cbd5e1" />
          <MesaComprida x={640} y={492} w={320} />
          <Planta x={990} y={470} s={0.75} />
          <Tapete x={1100} y={434} w={300} h={196} cor="#c8d3e0" />
          <FundoVerde x={1440} y={420} /><Camera x={1500} y={540} />
          <Planta x={1080} y={612} s={0.85} /><Planta x={1580} y={612} s={0.85} />

          {/* ---- Faixa de baixo: Lab. de Viral · sala de reunião (vidro) · Sucesso do cliente · Sales ---- */}
          <Tapete x={70} y={718} w={350} h={196} cor="#d9c7a6" />
          {usado("viral") && <Quadro x={410} y={704} w={120} />}
          <Planta x={40} y={910} s={0.9} /><Planta x={520} y={910} s={0.85} />
          <Tapete x={650} y={740} w={300} h={150} cor="#cbd5e1" />
          <MesaRedonda x={REUNIAO_C.x} y={REUNIAO_C.y} r={74} />
          <VidroLado x={608} y0={700} y1={918} /><VidroLado x={984} y0={700} y1={918} />
          <VidroFrente x0={608} x1={994} y={936} />
          <Tapete x={1100} y={720} w={160} h={196} cor="#d9c7a6" />
          <Tapete x={1350} y={720} w={230} h={196} cor="#d9c7a6" />
          <Planta x={1286} y={910} s={0.85} /><Planta x={1586} y={924} s={0.9} />

          {/* Estações de trabalho (vazias ou com quem está trabalhando ali) */}
          {AMBIENTES.flatMap((a) => (usado(a.chave) ? a.estacoes : []).map((e, k) => estacao(a.chave, k, e, a.monitores)))}
          {COLABORATIVA.map((e, k) => (quemNaMesa("colab", k) ? estacao("colab", k, e) : null))}
          {/* Mesa executiva da Diretoria e o vidro na frente da sala (depois das estações, como na vida real) */}
          <VidroLado x={528} y0={152} y1={330} />
          <VidroFrente x0={24} x1={538} y={346} />

          {/* De pé (copa, reunião) e sentados no sofá — o assento do sofá cobre as pernas */}
          {deResto.map(dePe)}
          {sentadosNoSofa.map(dePe)}
          <SofaFrente x={800} y={262} />

          {/* Andando pelos corredores */}
          {Object.entries(andando).map(([id, a]) => {
            const p = geo.pessoas.find((q) => q.id === id);
            return p ? <Caminhante key={`${id}-${a.chave}`} a={a} v={visualDe(p.nome)} /> : null;
          })}
          <rect width={W} height={H} fill="url(#ea-vinheta)" pointerEvents="none" />
        </svg>

        {/* "Nosso resultado": a tela da TV na parede */}
        {tv && <div className="absolute overflow-hidden rounded-sm" style={{ left: pctX(TV.x), top: pctY(TV.y), width: pctX(TV.w), height: pctY(TV.h) }}>{tv}</div>}

        {/* Placas pequenas dos setores e dos ambientes comuns */}
        {geo.ambientesUsados.map(({ a, s }) => (
          <button key={s.id} type="button" onClick={() => s.temEsteira && onAbrirSetor?.(s.id)}
            className={cn("absolute flex items-center gap-1.5 rounded-md bg-slate-900/85 px-2 py-1 text-white shadow-md", s.temEsteira ? "hover:ring-2 hover:ring-primary/60" : "cursor-default")}
            style={{ left: pctX(a.placa.x), top: pctY(a.placa.y) }} title={s.temEsteira ? "Abrir a esteira (kanban do time)" : undefined}>
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.corPlaca }} />
            <span className="text-[10.5px] font-bold uppercase tracking-wide">{s.nome}</span>
            {s.tarefas > 0 && <span className="text-[10px] text-white/70">· {s.tarefas}{s.atrasadas > 0 && <b className="text-rose-300"> ({s.atrasadas}!)</b>}</span>}
          </button>
        ))}
        {[{ x: 1196, y: 112, t: "☕ Copa" }, { x: 760, y: 676, t: "Reunião" }, { x: 806, y: 404, t: "Colaborativa" }].map((r) => (
          <span key={r.t} className="pointer-events-none absolute rounded-md bg-white/85 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 shadow-sm"
            style={{ left: pctX(r.x), top: pctY(r.y) }}>{r.t}</span>
        ))}

        {/* Nome, status, balão e o clique de cada um (acompanha quem anda) */}
        {geo.pessoas.map((p) => {
          const l = lugar.get(p.id);
          if (!l) return null;
          const a = andando[p.id];
          const topo = l.tipo === "mesa" ? { x: l.x, y: l.y - 14 } : { x: l.x, y: l.y - (l.sentado ? 96 : 104) };
          const balao = a ? `Indo para ${l.onde}` : p.balao;
          return (
            <button key={`r-${p.id}`} type="button" disabled={!p.clicavel} onClick={() => onAbrir(p.id)}
              title={p.clicavel ? (p.ehIa ? `Conversar com ${p.nome}` : `Ver e adicionar tarefas de ${p.nome}`) : undefined}
              className="ea-rotulo absolute flex -translate-x-1/2 flex-col items-center justify-between rounded-lg outline-none transition-colors enabled:hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-primary"
              style={{ left: pctX(topo.x), top: pctY(topo.y), height: pctY(l.tipo === "mesa" ? 110 : 108), width: pctX(l.tipo === "mesa" ? 112 : 92), ["--ea-dur" as string]: a ? `${a.dur}s` : "0s" }}>
              {balao ? (
                <span className={cn("line-clamp-2 max-w-full rounded-md border bg-white/95 px-1.5 py-0.5 text-center text-[10px] font-medium leading-tight text-slate-800 shadow-sm",
                  a && "border-sky-300 italic", p.sinal === "esperando" && !a && "border-amber-400", p.sinal === "problema" && "border-rose-400")}>{balao}</span>
              ) : <span />}
              <span className="flex max-w-full items-center gap-1 rounded-full bg-slate-900/85 px-2 py-0.5 text-[10.5px] font-semibold text-white shadow">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", p.corSinal)} title={p.rotuloSinal} />
                <span className="truncate">{p.nome}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
});

// Anda pelos pontos (estação → corredor → passagem → destino), cada trecho no tempo do tamanho dele.
function Caminhante({ a, v }: { a: { pontos: Pt[]; dur: number }; v: Visual }) {
  const [k, setK] = useState(0);
  const trechos = a.pontos.slice(1).map((q, i) => Math.hypot(q.x - a.pontos[i].x, q.y - a.pontos[i].y));
  const total = trechos.reduce((t, d) => t + d, 0) || 1;
  const durDe = (i: number) => (trechos[i] / total) * a.dur;
  useEffect(() => {
    if (k >= a.pontos.length - 1) return;
    const t = window.setTimeout(() => setK(k + 1), k === 0 ? 30 : durDe(k - 1) * 1000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k, a]);
  const pos = a.pontos[k];
  const ant = a.pontos[Math.max(0, k - 1)];
  const lado = pos.x > ant.x + 1 ? 1 : pos.x < ant.x - 1 ? -1 : (a.pontos[a.pontos.length - 1].x >= a.pontos[0].x ? 1 : -1);
  return (
    <g className="ea-mover" style={{ transform: `translate(${pos.x}px, ${pos.y}px)`, ["--ea-dur" as string]: `${k === 0 ? 0 : durDe(k - 1)}s` }}>
      <g transform={`scale(${lado} 1)`}><BonecoDePe v={v} andando /></g>
    </g>
  );
}
