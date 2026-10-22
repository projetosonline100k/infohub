import { memo, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ehNomeCoordenador } from "@/lib/empresa/visaoGeral";
import { cabeloDe, cabeloTras, visualDe, ESTILO, type Visual } from "./BonecoMesa";
import type { PessoaNaSala, SetorNoEscritorio } from "./EscritorioEmpresa";

// Escritório isométrico 2.5D (22/10, Davi: "estilo jogo de gerenciamento, com profundidade, paredes em
// perspectiva, móveis com volume, personagens dentro do ambiente"). Solução: SVG com projeção isométrica
// (sem WebGL): cada móvel é uma caixa (topo + duas faces com sombreamento), paredes e vidros em perspectiva,
// e tudo é desenhado do fundo para a frente (ordem de profundidade), então quem está atrás da mesa fica
// atrás dela. A lógica é a mesma do escritório aberto: o lugar de cada um vem do estado real e, quando muda,
// ele anda pelos corredores.

// ---------------------------------------------------------------- projeção
const TW = 60, TH = 30, HZ = 38;          // largura/altura do ladrilho e altura de 1 unidade em z
const GX = 32, GY = 24;                   // tamanho do piso em ladrilhos
const PAREDE_Z = 3.2;
const OX = GY * TW / 2 + 40, OY = PAREDE_Z * HZ + 34;
const LARG = (GX + GY) * TW / 2 + 80, ALT = (GX + GY) * TH / 2 + OY + 30;
type P3 = { x: number; y: number; z?: number };
const P = (x: number, y: number, z = 0) => ({ sx: (x - y) * (TW / 2) + OX, sy: (x + y) * (TH / 2) - z * HZ + OY });
const pts = (...ps: { sx: number; sy: number }[]) => ps.map((p) => `${p.sx.toFixed(1)},${p.sy.toFixed(1)}`).join(" ");

// ---------------------------------------------------------------- formas
interface Caixa { x: number; y: number; z?: number; w: number; d: number; h: number; topo: string; esq: string; dir: string; borda?: string }
function caixa({ x, y, z = 0, w, d, h, topo, esq, dir, borda = "rgba(0,0,0,.12)" }: Caixa) {
  return (
    <g>
      <polygon points={pts(P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h))} fill={esq} stroke={borda} strokeWidth=".6" />
      <polygon points={pts(P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h))} fill={dir} stroke={borda} strokeWidth=".6" />
      <polygon points={pts(P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h))} fill={topo} stroke={borda} strokeWidth=".6" />
    </g>
  );
}
function sombra(x: number, y: number, w: number, d: number, o = 0.16) {
  return <polygon points={pts(P(x - 0.1, y - 0.1), P(x + w + 0.25, y - 0.1), P(x + w + 0.25, y + d + 0.25), P(x - 0.1, y + d + 0.25))} fill="#000" opacity={o} />;
}
function elipsePiso(x: number, y: number, r: number, cor: string, z = 0, o = 1) {
  const c = P(x, y, z);
  return <ellipse cx={c.sx} cy={c.sy} rx={r * TW / Math.SQRT2 * 0.72} ry={r * TH / Math.SQRT2 * 0.72} fill={cor} opacity={o} />;
}

// Cada coisa do cenário vira um item com profundidade (x + y do canto da frente) para ordenar o desenho.
type Item = { prof: number; el: React.ReactNode; chave: string };

function mesa(x: number, y: number, comp = 2, cor = "#d8b98a"): Item[] {
  return [{ chave: `mesa-${x}-${y}`, prof: x + comp + y + 1 - 0.05, el: (
    <g>
      {sombra(x, y, comp, 1)}
      {[[x + 0.06, y + 0.06], [x + comp - 0.16, y + 0.06], [x + 0.06, y + 0.84], [x + comp - 0.16, y + 0.84]].map(([a, b], k) => (
        <g key={k}>{caixa({ x: a, y: b, w: 0.1, d: 0.1, h: 0.72, topo: "#6b4f32", esq: "#5a4029", dir: "#4a3421" })}</g>
      ))}
      {caixa({ x, y, z: 0.72, w: comp, d: 1, h: 0.08, topo: cor, esq: "#c4a273", dir: "#b08f62" })}
    </g>
  ) }];
}
function notebook(x: number, y: number, ligado: boolean): Item {
  // Tela de costas para a câmera (a pessoa senta atrás da mesa, olhando para a gente).
  return { chave: `nb-${x}-${y}`, prof: x + y + 1.05, el: (
    <g>
      {caixa({ x, y, z: 0.8, w: 0.6, d: 0.42, h: 0.03, topo: "#cbd5e1", esq: "#94a3b8", dir: "#64748b" })}
      {caixa({ x, y: y + 0.02, z: 0.83, w: 0.6, d: 0.04, h: 0.4, topo: "#94a3b8", esq: ligado ? "#334155" : "#475569", dir: "#1e293b" })}
    </g>
  ) };
}
function monitor(x: number, y: number): Item {
  return { chave: `mon-${x}-${y}`, prof: x + y + 1.06, el: (
    <g>
      {caixa({ x: x + 0.25, y: y + 0.2, z: 0.8, w: 0.1, d: 0.1, h: 0.25, topo: "#475569", esq: "#334155", dir: "#1e293b" })}
      {caixa({ x, y: y + 0.12, z: 1.02, w: 0.8, d: 0.06, h: 0.5, topo: "#1e293b", esq: "#0f172a", dir: "#020617" })}
    </g>
  ) };
}
function cadeira(x: number, y: number, cor = "#475569"): Item {
  return { chave: `cad-${x}-${y}`, prof: x + y + 0.4, el: (
    <g>
      {caixa({ x: x + 0.15, y: y + 0.15, w: 0.5, d: 0.5, h: 0.45, topo: cor, esq: "#334155", dir: "#1e293b" })}
      {caixa({ x: x + 0.15, y: y + 0.08, z: 0.45, w: 0.5, d: 0.1, h: 0.55, topo: cor, esq: "#334155", dir: "#1e293b" })}
    </g>
  ) };
}
function planta(x: number, y: number, s = 1): Item {
  const c = P(x + 0.3, y + 0.3, 0.5);
  return { chave: `pl-${x}-${y}`, prof: x + y + 0.7, el: (
    <g>
      {elipsePiso(x + 0.3, y + 0.3, 0.45, "#000", 0, 0.15)}
      {caixa({ x, y, w: 0.6, d: 0.6, h: 0.5, topo: "#e7e5e4", esq: "#d6d3d1", dir: "#a8a29e" })}
      <g transform={`translate(${c.sx} ${c.sy}) scale(${s})`}>
        <path d="M0 0 C-22 -12,-26 -34,-8 -48 C-4 -30,-2 -14,0 0" fill="#15803d" />
        <path d="M0 0 C20 -10,28 -32,12 -50 C6 -32,3 -14,0 0" fill="#22c55e" />
        <path d="M0 0 C-6 -20,0 -44,3 -62 C9 -44,7 -20,0 0" fill="#16a34a" />
        <path d="M0 0 C-30 -4,-34 -20,-26 -30 C-16 -18,-8 -8,0 0" fill="#4ade80" opacity=".9" />
      </g>
    </g>
  ) };
}
function sofa(x: number, y: number, comp = 3, cor = "#475569"): Item[] {
  // Encosto atrás (fundo) e assento na frente: quem senta fica entre os dois.
  return [
    { chave: `sofa-e-${x}-${y}`, prof: x + y + 0.2, el: <g>{sombra(x, y, comp, 1.1)}{caixa({ x, y, w: comp, d: 0.3, h: 1, topo: cor, esq: "#334155", dir: "#2b3647" })}</g> },
    { chave: `sofa-a-${x}-${y}`, prof: x + comp + y + 1.1, el: (
      <g>
        {caixa({ x, y: y + 0.3, w: comp, d: 0.8, h: 0.45, topo: cor, esq: "#334155", dir: "#2b3647" })}
        {caixa({ x: x - 0.25, y, w: 0.25, d: 1.1, h: 0.7, topo: cor, esq: "#2b3647", dir: "#1e293b" })}
        {caixa({ x: x + comp, y, w: 0.25, d: 1.1, h: 0.7, topo: cor, esq: "#2b3647", dir: "#1e293b" })}
      </g>
    ) },
  ];
}
function estante(x: number, y: number, comp = 2): Item {
  return { chave: `est-${x}-${y}`, prof: x + comp + y + 0.4, el: (
    <g>
      {caixa({ x, y, w: comp, d: 0.4, h: 1.9, topo: "#8b5e34", esq: "#7a5230", dir: "#5b3a1e" })}
      {Array.from({ length: Math.round(comp * 6) }, (_, k) => {
        const a = P(x + 0.1 + k * (comp - 0.2) / (comp * 6), y + 0.4, 0.3 + (k % 3) * 0.55);
        return <rect key={k} x={a.sx - 3} y={a.sy - 14} width="6" height="14" rx="1" fill={["#ef4444", "#3b82f6", "#f59e0b", "#10b981", "#8b5cf6"][k % 5]} transform={`skewY(-26.57) translate(0 ${a.sx * 0.5})`} opacity=".85" />;
      })}
    </g>
  ) };
}
function quadroBranco(x: number, y: number): Item {
  return { chave: `qb-${x}-${y}`, prof: x + y + 0.3, el: (
    <g>
      {caixa({ x: x + 0.1, y, w: 0.08, d: 0.08, h: 1, topo: "#94a3b8", esq: "#64748b", dir: "#475569" })}
      {caixa({ x: x + 1.82, y, w: 0.08, d: 0.08, h: 1, topo: "#94a3b8", esq: "#64748b", dir: "#475569" })}
      {caixa({ x, y, z: 0.9, w: 2, d: 0.06, h: 1, topo: "#e2e8f0", esq: "#f8fafc", dir: "#cbd5e1" })}
      {[["#fde047", 0.3, 1.6], ["#86efac", 0.7, 1.45], ["#f9a8d4", 1.2, 1.65], ["#93c5fd", 0.5, 1.15], ["#fdba74", 1.4, 1.2]].map(([c, a, z], k) => (
        <polygon key={k} points={pts(P(x + (a as number), y + 0.07, z as number), P(x + (a as number) + 0.25, y + 0.07, z as number), P(x + (a as number) + 0.25, y + 0.07, (z as number) - 0.22), P(x + (a as number), y + 0.07, (z as number) - 0.22))} fill={c as string} />
      ))}
    </g>
  ) };
}
function mesaRedonda(x: number, y: number, r = 1.2): Item {
  return { chave: `mr-${x}-${y}`, prof: x + y + r * 0.9, el: (
    <g>
      {elipsePiso(x, y, r + 0.3, "#000", 0, 0.15)}
      {caixa({ x: x - 0.1, y: y - 0.1, w: 0.2, d: 0.2, h: 0.72, topo: "#5a4029", esq: "#4a3421", dir: "#3b2a1a" })}
      {elipsePiso(x, y, r, "#b8925a", 0.72)}{elipsePiso(x, y, r, "#d8b98a", 0.78)}
    </g>
  ) };
}
function balcao(x: number, y: number, comp: number): Item[] {
  return [
    { chave: `bal-${x}`, prof: x + comp + y + 1, el: <g>{sombra(x, y, comp, 1)}{caixa({ x, y, w: comp, d: 1, h: 0.95, topo: "#f1f5f9", esq: "#cbd5e1", dir: "#94a3b8" })}</g> },
    { chave: `cafe-${x}`, prof: x + y + 1.2, el: (
      <g>
        {caixa({ x: x + 0.3, y: y + 0.2, z: 0.95, w: 0.5, d: 0.45, h: 0.6, topo: "#334155", esq: "#1f2937", dir: "#111827" })}
        {caixa({ x: x + 1.2, y: y + 0.3, z: 0.95, w: 0.5, d: 0.3, h: 0.18, topo: "#a16207", esq: "#854d0e", dir: "#713f12" })}
        {(() => { const c = P(x + 0.55, y + 0.4, 1.6); return <path className="esc-fumaca" d={`M${c.sx} ${c.sy} q-3 -6 0 -11 q3 -5 0 -10`} stroke="#cbd5e1" strokeWidth="1.8" fill="none" />; })()}
      </g>
    ) },
  ];
}
function banqueta(x: number, y: number): Item {
  return { chave: `bq-${x}-${y}`, prof: x + y + 0.5, el: (
    <g>
      {caixa({ x: x + 0.2, y: y + 0.2, w: 0.08, d: 0.08, h: 0.7, topo: "#64748b", esq: "#475569", dir: "#334155" })}
      {elipsePiso(x + 0.24, y + 0.24, 0.32, "#1f2937", 0.72)}
    </g>
  ) };
}
function geladeira(x: number, y: number): Item {
  return { chave: `gel-${x}`, prof: x + y + 1.7, el: <g>{sombra(x, y, 0.9, 0.8)}{caixa({ x, y, w: 0.9, d: 0.8, h: 2, topo: "#f8fafc", esq: "#e2e8f0", dir: "#cbd5e1" })}</g> };
}
function fundoVerde(x: number, y: number): Item {
  return { chave: `fv-${x}`, prof: x + y + 0.3, el: caixa({ x, y, w: 2.2, d: 0.08, h: 2.2, topo: "#15803d", esq: "#22c55e", dir: "#16a34a" }) };
}
function tripe(x: number, y: number): Item {
  const b = P(x, y), t = P(x, y, 1.5);
  return { chave: `tr-${x}`, prof: x + y + 0.2, el: (
    <g>
      <path d={`M${b.sx - 12} ${b.sy + 4} L${t.sx} ${t.sy} L${b.sx + 12} ${b.sy + 4} M${t.sx} ${t.sy} L${b.sx} ${b.sy + 8}`} stroke="#334155" strokeWidth="2.5" fill="none" />
      {caixa({ x: x - 0.2, y: y - 0.15, z: 1.5, w: 0.4, d: 0.3, h: 0.25, topo: "#1e293b", esq: "#0f172a", dir: "#020617" })}
    </g>
  ) };
}
function luminaria(x: number, y: number): Item {
  const t = P(x, y, 1.9);
  return { chave: `lum-${x}`, prof: x + y + 0.2, el: (
    <g>
      {elipsePiso(x, y, 1.2, "#fde68a", 0, 0.18)}
      {caixa({ x: x - 0.04, y: y - 0.04, w: 0.08, d: 0.08, h: 1.9, topo: "#475569", esq: "#334155", dir: "#1e293b" })}
      <path d={`M${t.sx - 10} ${t.sy} h20 l-5 -14 h-10 Z`} fill="#fde68a" stroke="#eab308" strokeWidth=".8" />
    </g>
  ) };
}
// Vidro em pé ao longo de x (y fixo) ou de y (x fixo).
function vidro(x0: number, y0: number, x1: number, y1: number, h = 1.6): Item {
  const a = P(x0, y0), b = P(x1, y1), c = P(x1, y1, h), d = P(x0, y0, h);
  const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 1.5));
  return { chave: `vd-${x0}-${y0}-${x1}-${y1}`, prof: Math.max(x0, x1) + Math.max(y0, y1) + 0.01, el: (
    <g>
      <polygon points={pts(a, b, c, d)} fill="#bfe3ff" opacity=".3" />
      <polyline points={pts(d, c)} stroke="#94a3b8" strokeWidth="2.2" fill="none" /><polyline points={pts(a, b)} stroke="#94a3b8" strokeWidth="2.5" fill="none" />
      {Array.from({ length: n + 1 }, (_, k) => { const t = k / n; const p0 = P(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t), p1 = P(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, h); return <line key={k} x1={p0.sx} y1={p0.sy} x2={p1.sx} y2={p1.sy} stroke="#a5b4c6" strokeWidth="1.4" />; })}
      <line x1={P(x0 + (x1 - x0) * 0.2, y0 + (y1 - y0) * 0.2, 0.3).sx} y1={P(x0 + (x1 - x0) * 0.2, y0 + (y1 - y0) * 0.2, 0.3).sy} x2={P(x0 + (x1 - x0) * 0.28, y0 + (y1 - y0) * 0.28, 1.1).sx} y2={P(x0 + (x1 - x0) * 0.28, y0 + (y1 - y0) * 0.28, 1.1).sy} stroke="#fff" strokeWidth="1.6" opacity=".7" />
    </g>
  ) };
}

// ---------------------------------------------------------------- personagens
function Pessoa({ v, andando, sentado, xicara }: { v: Visual; andando?: boolean; sentado?: boolean; xicara?: boolean }) {
  return (
    <g className={andando ? "ea-andando" : undefined} transform="scale(.86)">
      <ellipse cx="0" cy="1" rx="12" ry="4" fill="#000" opacity=".2" />
      <g className="ea-corpo">
        {!sentado && <>
          <g className="ea-perna-e"><rect x="-6.5" y="-25" width="5.5" height="25" rx="2.5" fill="#334155" /><ellipse cx="-3.5" cy="0" rx="4" ry="2" fill="#1e293b" /></g>
          <g className="ea-perna-d"><rect x="1" y="-25" width="5.5" height="25" rx="2.5" fill="#3b4a5f" /><ellipse cx="4" cy="0" rx="4" ry="2" fill="#1e293b" /></g>
        </>}
        <rect x="-3.5" y="-55" width="7" height="6" rx="2" fill={v.pele} />
        <rect x="-11.5" y="-51" width="23" height="29" rx="8" fill={v.camisa} />
        <rect x="-15" y="-49" width="5" height="21" rx="2.5" fill={v.camisa} /><circle cx="-12.5" cy="-27" r="2.6" fill={v.pele} />
        <g className={xicara ? "ea-gole" : undefined} style={{ transformOrigin: "50% 8%" }}>
          <rect x="10" y="-49" width="5" height="21" rx="2.5" fill={v.camisa} /><circle cx="12.5" cy="-27" r="2.6" fill={v.pele} />
          {xicara && <g><rect x="10" y="-28" width="6" height="5.5" rx="1.2" fill="#fff" stroke="#cbd5e1" strokeWidth=".6" /></g>}
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
function Robo() {
  return (
    <g transform="scale(.86)"><g className="ea-flutua">
      <ellipse cx="0" cy="4" rx="12" ry="4" fill="#000" opacity=".2" />
      <rect x="-12" y="-46" width="24" height="26" rx="8" fill="#e2e8f0" stroke="#94a3b8" />
      <rect x="-16" y="-76" width="32" height="28" rx="12" fill="#0f172a" stroke="#22d3ee" strokeWidth="1.6" />
      <rect x="-9" y="-67" width="6" height="9" rx="3" fill="#67e8f9" /><rect x="3" y="-67" width="6" height="9" rx="3" fill="#67e8f9" />
      <line x1="0" y1="-76" x2="0" y2="-84" stroke="#94a3b8" strokeWidth="2" /><circle cx="0" cy="-86" r="3" fill="#22d3ee" />
    </g></g>
  );
}
function Sinal({ sinal }: { sinal: PessoaNaSala["sinal"] }) {
  if (sinal === "esperando") return <g transform="translate(16 -92)"><circle r="8" fill="#f59e0b" /><text y="4" textAnchor="middle" fontSize="12" fontWeight="800" fill="#fff">!</text></g>;
  if (sinal === "problema") return <g transform="translate(16 -92)" className="animate-pulse"><circle r="8" fill="#ef4444" /><text y="4" textAnchor="middle" fontSize="12" fontWeight="800" fill="#fff">!</text></g>;
  return null;
}

const ESTILO_ISO = `
.ea-andando .ea-perna-e{transform-origin:50% 0;animation:ea-passo .5s linear infinite}
.ea-andando .ea-perna-d{transform-origin:50% 0;animation:ea-passo .5s linear infinite reverse}
.ea-andando .ea-corpo{animation:ea-ginga .25s ease-in-out infinite alternate}
@keyframes ea-passo{0%,100%{transform:rotate(18deg)}50%{transform:rotate(-18deg)}}
@keyframes ea-ginga{to{transform:translateY(-1.4px)}}
.ea-gole{animation:ea-gole 9s ease-in-out infinite}
@keyframes ea-gole{0%,70%,100%{transform:rotate(0)}78%,86%{transform:rotate(-65deg)}}
.ea-digita{animation:ea-digita .6s ease-in-out infinite alternate}
@keyframes ea-digita{to{transform:translateY(-1.5px)}}
.ea-flutua{animation:ea-flutua 2.4s ease-in-out infinite alternate}
@keyframes ea-flutua{to{transform:translateY(-4px)}}
.ea-mover{transition:transform var(--ea-dur,0s) linear}
.esc-fumaca{animation:esc-fumaca 2.4s ease-out infinite}
@keyframes esc-fumaca{0%{opacity:0;transform:translateY(0)}30%{opacity:.7}100%{opacity:0;transform:translateY(-10px)}}
@media (prefers-reduced-motion:reduce){.ea-mover{transition:none}.esc *{animation:none!important}}
`;

// ---------------------------------------------------------------- planta do escritório
type Pt = { x: number; y: number };
interface Ambiente { chave: string; rotulo: string; estacoes: Pt[]; monitores?: boolean; piso: [number, number, number, number]; corPiso: string }
// Estação = mesa (2 × 1) com a cadeira atrás; a pessoa senta na cadeira, olhando para a câmera.
const AMBIENTES: Ambiente[] = [
  { chave: "diretoria", rotulo: "Diretoria", piso: [0.3, 0.3, 9.7, 7.6], corPiso: "#d9cbb4", estacoes: [{ x: 2.5, y: 3.5 }, { x: 6, y: 3.5 }] },
  { chave: "marketing", rotulo: "Marketing", piso: [0.6, 10.6, 9, 6.2], corPiso: "#d7d2c8",
    estacoes: [{ x: 1.5, y: 12.6 }, { x: 4.2, y: 12.6 }, { x: 1.5, y: 15 }, { x: 4.2, y: 15 }, { x: 6.9, y: 15 }] },
  { chave: "audiovisual", rotulo: "Audiovisual", piso: [21.6, 10.6, 10, 6.2], corPiso: "#cfd6df", monitores: true,
    estacoes: [{ x: 22.5, y: 12.6 }, { x: 25.4, y: 12.6 }, { x: 22.5, y: 15 }, { x: 25.4, y: 15 }] },
  { chave: "viral", rotulo: "Laboratório de Viral", piso: [0.6, 18.6, 9, 5], corPiso: "#d7d2c8",
    estacoes: [{ x: 1.5, y: 20.4 }, { x: 4.2, y: 20.4 }, { x: 6.9, y: 20.4 }, { x: 1.5, y: 22.5 }, { x: 4.2, y: 22.5 }] },
  { chave: "sucesso", rotulo: "Sucesso do Cliente", piso: [21.6, 18.6, 4.8, 5], corPiso: "#d9cbb4", estacoes: [{ x: 22.4, y: 20.4 }, { x: 22.4, y: 22.5 }] },
  { chave: "sales", rotulo: "Sales", piso: [26.8, 18.6, 4.8, 5], corPiso: "#d9cbb4", estacoes: [{ x: 27.5, y: 20.4 }, { x: 29.6, y: 20.4 }, { x: 27.5, y: 22.5 }] },
];
const PALAVRAS: Record<string, RegExp> = {
  diretoria: /diretoria|dire[cç][aã]o|ceo|s[oó]cio/i, marketing: /marketing|mkt|grow|tr[aá]fego|conte[uú]do/i,
  audiovisual: /audiovisual|v[ií]deo|edi[cç][aã]o|est[uú]dio|design/i, viral: /viral|lab|roteiro|copy/i,
  sucesso: /sucesso|cliente|suporte|\bcs\b|atendimento/i, sales: /sales|venda|comercial|closer|sdr/i,
};
const COLAB: Pt[] = [{ x: 12.5, y: 13 }, { x: 14.7, y: 13 }, { x: 16.9, y: 13 }];
const REUNIAO = { x: 15.5, y: 21 };
const VAGAS_REUNIAO: Pt[] = [{ x: 13.6, y: 20.2 }, { x: 17.4, y: 21.6 }, { x: 14.6, y: 22.6 }, { x: 16.6, y: 19.4 }, { x: 13.4, y: 21.8 }, { x: 17.6, y: 20 }];
const VAGAS_LIVRE: (Pt & { onde: string; sentado?: boolean; xicara?: boolean })[] = [
  { x: 25.3, y: 3.4, onde: "Copa", xicara: true }, { x: 26.4, y: 3.4, onde: "Copa", xicara: true },
  { x: 13.3, y: 5.9, onde: "Descanso", sentado: true }, { x: 14.6, y: 5.9, onde: "Descanso", sentado: true },
  { x: 15.9, y: 5.9, onde: "Descanso", sentado: true }, { x: 29.6, y: 5.6, onde: "Copa", xicara: true }, { x: 30.6, y: 5.2, onde: "Copa", xicara: true },
];
const CORREDOR_Y = [9, 17.5];
const PASSAGEM_X = [10.8, 20.8];
const VEL = 2.2;   // ladrilhos por segundo

const ehRobo = (p: PessoaNaSala) => p.ehIa && ehNomeCoordenador(p.nome);
const ehNoite = () => { const h = new Date().getHours(); return h >= 22 || h < 7; };
const ehDavi = (p: PessoaNaSala) => !p.ehIa && /^davi\b/i.test(p.nome);
const somaId = (id: string) => [...id].reduce((t, c) => t + c.charCodeAt(0), 0);

type Lugar = { tipo: "mesa" | "pe"; x: number; y: number; onde: string; amb?: string; est?: number; sentado?: boolean; xicara?: boolean };
// Onde a pessoa senta numa estação: na cadeira, atrás do meio da mesa.
const lugarNaMesa = (e: Pt): Pt => ({ x: e.x + 1, y: e.y - 0.15 });

export const EscritorioIso = memo(function EscritorioIso({ setores, onAbrir, forcarNoite, tv, onAbrirSetor }: {
  setores: SetorNoEscritorio[]; onAbrir: (id: string) => void; forcarNoite?: boolean; tv?: React.ReactNode; onAbrirSetor?: (id: string) => void;
}) {
  const [noiteAgora, setNoite] = useState(ehNoite);
  const noite = forcarNoite ?? noiteAgora;
  useEffect(() => { const t = window.setInterval(() => setNoite(ehNoite()), 60_000); return () => window.clearInterval(t); }, []);

  const vagaAntes = useRef<Map<string, number>>(new Map());
  const geo = useMemo(() => {
    const ambDoSetor = new Map<string, Ambiente>();
    const usados = new Set<string>();
    for (const s of setores) { const a = AMBIENTES.find((x) => !usados.has(x.chave) && PALAVRAS[x.chave].test(s.nome)); if (a) { ambDoSetor.set(s.id, a); usados.add(a.chave); } }
    for (const s of setores) { if (ambDoSetor.has(s.id)) continue; const a = AMBIENTES.find((x) => !usados.has(x.chave)); if (a) { ambDoSetor.set(s.id, a); usados.add(a.chave); } }
    const pessoas = setores.flatMap((s) => s.pessoas.map((p) => ({ p, setor: s.id })));
    const alguemConversando = !noite && pessoas.some(({ p }) => p.conversando);
    const lugar = new Map<string, Lugar>();
    const ocupadas = new Map<string, Set<number>>();
    const colab = new Set<number>();
    const reuniao: PessoaNaSala[] = [], livres: PessoaNaSala[] = [];
    const nomeDe = (id: string) => setores.find((s) => s.id === id)?.nome ?? "";
    const sentar = (p: PessoaNaSala, setorId: string, setorDele: string) => {
      const a = ambDoSetor.get(setorId) ?? ambDoSetor.get(setorDele);
      if (a) {
        const usadas = ocupadas.get(a.chave) ?? new Set<number>();
        const ideal = setores.find((s) => s.id === setorDele)?.pessoas.findIndex((x) => x.id === p.id) ?? -1;
        let est = setorId === setorDele && ideal >= 0 && ideal < a.estacoes.length && !usadas.has(ideal) ? ideal : -1;
        if (est < 0) est = a.estacoes.findIndex((_, k) => !usadas.has(k));
        if (est >= 0) { usadas.add(est); ocupadas.set(a.chave, usadas); const q = lugarNaMesa(a.estacoes[est]); lugar.set(p.id, { tipo: "mesa", ...q, amb: a.chave, est, onde: nomeDe(setorId) || a.rotulo }); return; }
      }
      const k = COLAB.findIndex((_, i) => !colab.has(i));
      if (k >= 0) { colab.add(k); const q = lugarNaMesa(COLAB[k]); lugar.set(p.id, { tipo: "mesa", ...q, amb: "colab", est: k, onde: "Área colaborativa" }); }
    };
    const trabalhando = pessoas.filter(({ p }) => {
      if (!noite && (p.conversando || (alguemConversando && ehDavi(p)))) { reuniao.push(p); return false; }
      if (noite || ehRobo(p) || p.sinal !== "parado") return true;
      livres.push(p); return false;
    });
    const zonaDe = (p: PessoaNaSala, setor: string) => (!noite && p.setorTarefa && ambDoSetor.has(p.setorTarefa) ? p.setorTarefa : setor);
    for (const { p, setor } of trabalhando.filter(({ p, setor }) => zonaDe(p, setor) === setor)) sentar(p, setor, setor);
    for (const { p, setor } of trabalhando.filter(({ p, setor }) => zonaDe(p, setor) !== setor)) sentar(p, zonaDe(p, setor), setor);
    reuniao.forEach((p, k) => { const v = VAGAS_REUNIAO[k % VAGAS_REUNIAO.length]; lugar.set(p.id, { tipo: "pe", ...v, onde: "Reunião" }); });
    // Quem já estava descansando fica onde estava (ninguém troca de lugar só porque outro saiu).
    const vagasUsadas = new Set<number>();
    const ordem = [...livres].sort((a, b) => a.id.localeCompare(b.id));
    const fica = ordem.filter((p) => { const k = vagaAntes.current.get(p.id); if (k == null || vagasUsadas.has(k)) return false; vagasUsadas.add(k); return true; });
    const vagaNova = new Map<string, number>();
    fica.forEach((p) => vagaNova.set(p.id, vagaAntes.current.get(p.id)!));
    ordem.filter((p) => !vagaNova.has(p.id)).forEach((p) => {
      let k = somaId(p.id) % VAGAS_LIVRE.length;
      for (let n = 0; vagasUsadas.has(k) && n < VAGAS_LIVRE.length; n++) k = (k + 1) % VAGAS_LIVRE.length;
      vagasUsadas.add(k); vagaNova.set(p.id, k);
    });
    for (const [id, k] of vagaNova) { const v = VAGAS_LIVRE[k]; lugar.set(id, { tipo: "pe", x: v.x, y: v.y, onde: v.onde, sentado: v.sentado, xicara: v.xicara }); }
    vagaAntes.current = vagaNova;
    return { lugar, ambientes: [...ambDoSetor.entries()].map(([id, a]) => ({ a, s: setores.find((x) => x.id === id)! })), pessoas: pessoas.map((x) => x.p) };
  }, [setores, noite]);

  // ---------------------------------------------------------------- andar quando o lugar muda
  type Andando = { dur: number; chave: number; pontos: Pt[] };
  const [andando, setAndando] = useState<Record<string, Andando>>({});
  const antes = useRef<Map<string, string>>(new Map());
  const ondeEstava = useRef<Map<string, Pt>>(new Map());
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    const novos: Record<string, Andando> = {};
    for (const p of geo.pessoas) {
      const l = geo.lugar.get(p.id);
      if (!l || ehRobo(p)) continue;
      const chave = `${l.tipo}-${l.amb ?? l.onde}-${l.est ?? l.x}`;
      const de = ondeEstava.current.get(p.id);
      if (antes.current.get(p.id) && antes.current.get(p.id) !== chave && de) {
        const meio = (de.y + l.y) / 2;
        const yc = CORREDOR_Y.reduce((m, y) => (Math.abs(y - meio) < Math.abs(m - meio) ? y : m), CORREDOR_Y[0]);
        const ate = (q: Pt): Pt[] => {
          if (Math.abs(q.y - yc) < 4.5) return [{ x: q.x, y: yc }];
          const xp = PASSAGEM_X.reduce((m, x) => (Math.abs(x - q.x) < Math.abs(m - q.x) ? x : m), PASSAGEM_X[0]);
          return [{ x: q.x, y: q.y + (yc > q.y ? 0.9 : -0.9) }, { x: xp, y: q.y + (yc > q.y ? 0.9 : -0.9) }, { x: xp, y: yc }];
        };
        const pontos = [de, ...ate(de), ...ate(l).reverse(), { x: l.x, y: l.y }];
        const total = pontos.slice(1).reduce((t, q, k) => t + Math.hypot(q.x - pontos[k].x, q.y - pontos[k].y), 0);
        const dur = Math.min(16, Math.max(1.8, total / VEL));
        novos[p.id] = { dur, chave: Date.now(), pontos };
        timers.current.push(window.setTimeout(() => setAndando((a) => { const n = { ...a }; delete n[p.id]; return n; }), dur * 1000 + 80));
      }
      antes.current.set(p.id, chave);
      ondeEstava.current.set(p.id, { x: l.x, y: l.y });
    }
    if (Object.keys(novos).length) setAndando((a) => ({ ...a, ...novos }));
  }, [geo]);

  const usado = (k: string) => geo.ambientes.some((u) => u.a.chave === k);
  const ocupante = (amb: string, est: number) => geo.pessoas.find((q) => { const l = geo.lugar.get(q.id); return l?.amb === amb && l.est === est && !andando[q.id]; });

  // ---------------------------------------------------------------- cena (tudo com profundidade)
  const itens: Item[] = [];
  const add = (...xs: (Item | Item[])[]) => xs.forEach((x) => (Array.isArray(x) ? itens.push(...x) : itens.push(x)));
  // Diretoria: estante, luminária, vidro
  add(estante(0.5, 0.4, 2.4), luminaria(8.6, 1.2), planta(0.6, 6.4), planta(8.8, 6.4));
  add(vidro(10, 0.2, 10, 7.8), vidro(0.2, 7.8, 10, 7.8));
  // TV + sofá + plantas
  add(sofa(13, 5, 3.4), planta(11.2, 1), planta(19.6, 1), luminaria(18.8, 5.6));
  // Copa
  add(balcao(23, 0.4, 5.5), geladeira(29, 0.3), banqueta(24.8, 2.2), banqueta(25.9, 2.2), banqueta(27, 2.2), mesaRedonda(30, 4.6, 0.7), planta(31, 7));
  // Marketing / Lab: quadros
  if (usado("marketing")) add(quadroBranco(7.2, 11.4));
  if (usado("viral")) add(quadroBranco(7.2, 18.9));
  add(planta(9.2, 16.2), planta(0.4, 16.4), planta(9.2, 23), planta(0.4, 23.2));
  // Colaborativa: mesa comprida + quadro
  add(mesa(12, 13.4, 7.2, "#e7d3ad"), quadroBranco(13, 11), planta(19.6, 12), planta(11.2, 16));
  // Audiovisual: fundo verde + tripé
  if (usado("audiovisual")) add(fundoVerde(29.4, 11.2), tripe(30.2, 14.6));
  add(planta(31.2, 16.6), planta(21.3, 16.6));
  // Reunião (vidro) e mesa redonda com cadeiras
  add(mesaRedonda(REUNIAO.x, REUNIAO.y, 1.6), vidro(12, 18.6, 12, 23.8), vidro(19, 18.6, 19, 23.8), vidro(12, 18.6, 19, 18.6));
  [[13.9, 19.4], [16.6, 19.2], [13.4, 21.2], [17.4, 21.2]].forEach(([a, b]) => add(cadeira(a, b, "#64748b")));
  add(planta(26.4, 23.4), planta(31.4, 23.4), mesaRedonda(25.2, 21.6, 0.7));
  // Estações dos ambientes usados (mesa + cadeira + notebook/monitor) e quem está sentado
  for (const { a } of geo.ambientes) {
    a.estacoes.forEach((e, k) => {
      const quem = ocupante(a.chave, k);
      add(mesa(e.x, e.y), cadeira(e.x + 0.6, e.y - 0.8));
      add(a.monitores ? monitor(e.x + 0.6, e.y) : notebook(e.x + 0.7, e.y + 0.1, !!quem && quem.sinal !== "parado"));
      if (a.monitores) add({ ...monitor(e.x + 1.3, e.y + 0.05), chave: `mon2-${e.x}-${e.y}` });
    });
  }
  COLAB.forEach((e, k) => { if (ocupante("colab", k)) add(cadeira(e.x + 0.6, e.y - 0.8), notebook(e.x + 0.7, e.y + 0.4, true)); });
  // Pessoas paradas no lugar (as que estão andando vão por cima, no fim)
  for (const p of geo.pessoas) {
    const l = geo.lugar.get(p.id);
    if (!l || andando[p.id]) continue;
    const c = P(l.x, l.y, l.tipo === "mesa" ? 0.35 : l.sentado ? 0.3 : 0);
    const v = visualDe(p.nome);
    add({ chave: `p-${p.id}`, prof: l.x + l.y + (l.tipo === "mesa" ? 0.05 : 0.35), el: (
      <g transform={`translate(${c.sx} ${c.sy})`}>
        <g className={l.tipo === "mesa" && p.sinal === "trabalhando" ? "ea-digita" : undefined}>
          {ehRobo(p) ? <Robo /> : <Pessoa v={v} sentado={l.tipo === "mesa" || l.sentado} xicara={l.xicara} />}
        </g>
        <Sinal sinal={p.sinal} />
        {noite && l.tipo === "mesa" && <text x="12" y="-58" fontSize="12" fill="#64748b" fontWeight="700">z z</text>}
      </g>
    ) });
  }
  itens.sort((a, b) => a.prof - b.prof);

  // TV na parede (y = 0): a tela é HTML inclinado no plano da parede.
  const tvA = P(12, 0, 2.7), tvLarg = 6 * TW / 2, tvAlt = 1.7 * HZ;
  const pct = (v: number, t: number) => `${(v / t) * 100}%`;

  return (
    <div className="w-full overflow-x-auto overscroll-x-contain rounded-xl">
      <div className="esc relative min-w-[900px] overflow-hidden rounded-xl border border-black/10 bg-[#1e293b]" style={{ aspectRatio: `${LARG} / ${ALT}` }}>
        <svg viewBox={`0 0 ${LARG} ${ALT}`} className="absolute inset-0 h-full w-full" aria-hidden="true">
          <style>{ESTILO + ESTILO_ISO}</style>
          <defs>
            <radialGradient id="iso-luz"><stop offset="0" stopColor="#fff7e6" stopOpacity=".55" /><stop offset="1" stopColor="#fff7e6" stopOpacity="0" /></radialGradient>
            <linearGradient id="iso-ceu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7dd3fc" /><stop offset="1" stopColor="#e0f2fe" /></linearGradient>
          </defs>
          <clipPath id="iso-piso"><polygon points={pts(P(0, 0), P(GX, 0), P(GX, GY), P(0, GY))} /></clipPath>
          {/* Laje (o escritório como uma maquete) */}
          <polygon points={pts(P(0, GY), P(GX, GY), P(GX, GY, -0.5), P(0, GY, -0.5))} fill="#8a6a45" />
          <polygon points={pts(P(GX, 0), P(GX, GY), P(GX, GY, -0.5), P(GX, 0, -0.5))} fill="#6f5235" />
          {/* Paredes do fundo (esquerda: x = 0; direita: y = 0) com janelas */}
          <polygon points={pts(P(0, 0), P(0, GY), P(0, GY, PAREDE_Z), P(0, 0, PAREDE_Z))} fill="#dfe4ea" />
          <polygon points={pts(P(0, 0), P(GX, 0), P(GX, 0, PAREDE_Z), P(0, 0, PAREDE_Z))} fill="#eef1f5" />
          <polygon points={pts(P(0, 0, PAREDE_Z), P(GX, 0, PAREDE_Z), P(GX, -0.25, PAREDE_Z), P(-0.25, -0.25, PAREDE_Z), P(-0.25, GY, PAREDE_Z), P(0, GY, PAREDE_Z))} fill="#cbd5e1" />
          {[2, 6.5, 22.5, 27].map((x) => <polygon key={`jd${x}`} points={pts(P(x, 0, 1.1), P(x + 3, 0, 1.1), P(x + 3, 0, 2.8), P(x, 0, 2.8))} fill="url(#iso-ceu)" stroke="#94a3b8" strokeWidth="2.5" />)}
          {[3, 9, 15, 20].map((y) => <polygon key={`je${y}`} points={pts(P(0, y, 1.1), P(0, y + 3, 1.1), P(0, y + 3, 2.8), P(0, y, 2.8))} fill="url(#iso-ceu)" stroke="#94a3b8" strokeWidth="2.5" />)}
          {/* Piso: madeira contínua com corredores mais claros e os pisos/tapetes dos ambientes */}
          <polygon points={pts(P(0, 0), P(GX, 0), P(GX, GY), P(0, GY))} fill="#e3c99c" />
          {Array.from({ length: GX }, (_, i) => <line key={`lx${i}`} x1={P(i, 0).sx} y1={P(i, 0).sy} x2={P(i, GY).sx} y2={P(i, GY).sy} stroke="#d4b582" strokeWidth=".8" />)}
          {Array.from({ length: GY }, (_, j) => <line key={`ly${j}`} x1={P(0, j).sx} y1={P(0, j).sy} x2={P(GX, j).sx} y2={P(GX, j).sy} stroke="#d9bd8d" strokeWidth=".5" />)}
          {CORREDOR_Y.map((y) => <polygon key={`c${y}`} points={pts(P(0, y - 0.9), P(GX, y - 0.9), P(GX, y + 0.9), P(0, y + 0.9))} fill="#f3e3c3" opacity=".7" />)}
          {PASSAGEM_X.map((x) => <polygon key={`pa${x}`} points={pts(P(x - 0.8, 0), P(x + 0.8, 0), P(x + 0.8, GY), P(x - 0.8, GY))} fill="#f3e3c3" opacity=".45" />)}
          {geo.ambientes.map(({ a }) => { const [x, y, w, d] = a.piso; return <polygon key={`pz${a.chave}`} points={pts(P(x, y), P(x + w, y), P(x + w, y + d), P(x, y + d))} fill={a.corPiso} opacity=".75" />; })}
          <polygon points={pts(P(12.4, 4.4), P(17.4, 4.4), P(17.4, 7.4), P(12.4, 7.4))} fill="#b9a27e" opacity=".55" />
          <polygon points={pts(P(12.2, 18.8), P(18.8, 18.8), P(18.8, 23.6), P(12.2, 23.6))} fill="#cbd5e1" opacity=".7" />
          <polygon points={pts(P(22.6, 0.2), P(31.8, 0.2), P(31.8, 7.6), P(22.6, 7.6))} fill="#e8edf2" opacity=".75" />
          {/* Luz que entra pelas janelas e das luminárias */}
          <g clipPath="url(#iso-piso)">{[[4, 3, 160], [24, 3, 170], [3, 13, 150], [26, 14, 170], [15, 14, 190], [5, 21, 150], [27, 21, 150]].map(([x, y, r], k) => { const c = P(x, y); return <ellipse key={k} cx={c.sx} cy={c.sy} rx={r * 1.6} ry={r * 0.8} fill="url(#iso-luz)" />; })}</g>
          {/* TV ("Nosso resultado") na parede: moldura */}
          <polygon points={pts(P(11.85, 0, 2.85), P(18.15, 0, 2.85), P(18.15, 0, 0.95), P(11.85, 0, 0.95))} fill="#0f172a" stroke="#334155" strokeWidth="2" />
          {caixa({ x: 12.5, y: 0.1, w: 5, d: 0.5, h: 0.45, topo: "#8b5e34", esq: "#7a5230", dir: "#5b3a1e" })}
          {/* Tudo com volume, do fundo para a frente */}
          {itens.map((i) => <g key={i.chave}>{i.el}</g>)}
          {/* Quem está andando (por cima, pelos corredores) */}
          {Object.entries(andando).map(([id, a]) => {
            const p = geo.pessoas.find((q) => q.id === id);
            return p ? <Caminhante key={`${id}-${a.chave}`} a={a} v={visualDe(p.nome)} nome={p.nome} destino={geo.lugar.get(id)?.onde ?? ""} /> : null;
          })}
        </svg>

        {/* Tela da TV inclinada no plano da parede */}
        {tv && (
          <div className="absolute origin-top-left overflow-hidden" style={{ left: pct(tvA.sx, LARG), top: pct(tvA.sy, ALT), width: pct(tvLarg, LARG), height: pct(tvAlt, ALT), transform: "skewY(26.565deg)" }}>{tv}</div>
        )}

        {/* Placas dos setores, no chão de cada ambiente */}
        {geo.ambientes.map(({ a, s }) => { const c = P(a.piso[0] + a.piso[2] - 0.3, a.piso[1] + a.piso[3] - 0.3, 0); return (
          <button key={s.id} type="button" onClick={() => s.temEsteira && onAbrirSetor?.(s.id)}
            className={cn("absolute z-10 flex -translate-x-1/2 -translate-y-full items-center gap-1.5 rounded-md bg-slate-900/90 px-2 py-1 text-white shadow-lg", s.temEsteira ? "hover:ring-2 hover:ring-primary/60" : "cursor-default")}
            style={{ left: pct(c.sx, LARG), top: pct(c.sy, ALT) }}>
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.corPlaca }} />
            <span className="text-[10.5px] font-bold uppercase tracking-wide">{s.nome}</span>
            {s.tarefas > 0 && <span className="text-[10px] text-white/70">· {s.tarefas}</span>}
          </button>
        ); })}
        {[{ p: P(26, 0.6, 2.8), t: "☕ Copa" }, { p: P(15.5, 18.6, 1.8), t: "Reunião" }, { p: P(15.5, 11, 2.1), t: "Colaborativa" }].map(({ p, t }) => (
          <span key={t} className="pointer-events-none absolute -translate-x-1/2 rounded-md bg-white/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700 shadow"
            style={{ left: pct(p.sx, LARG), top: pct(p.sy, ALT) }}>{t}</span>
        ))}

        {/* Nome, status, balão e o clique de cada um */}
        {geo.pessoas.map((p) => {
          const l = geo.lugar.get(p.id);
          if (!l || andando[p.id]) return null;   // andando: o nome vai junto, desenhado no Caminhante
          const c = P(l.x, l.y, l.tipo === "mesa" ? 0.35 : 0);
          const balao = p.balao;
          return (
            <button key={`r-${p.id}`} type="button" disabled={!p.clicavel} onClick={() => onAbrir(p.id)}
              title={p.clicavel ? (p.ehIa ? `Conversar com ${p.nome}` : `Ver e adicionar tarefas de ${p.nome}`) : undefined}
              className="absolute flex -translate-x-1/2 -translate-y-full flex-col items-center gap-0.5 rounded-lg outline-none enabled:hover:bg-white/10"
              style={{ left: pct(c.sx, LARG), top: pct(c.sy - 86, ALT), width: "10%" }}>
              {balao && (
                <span className={cn("line-clamp-2 max-w-full rounded-md border bg-white/95 px-1.5 py-0.5 text-center text-[10px] font-medium leading-tight text-slate-800 shadow-md",
                  p.sinal === "esperando" && "border-amber-400", p.sinal === "problema" && "border-rose-400")}>{balao}</span>
              )}
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

// Anda pelos pontos do piso; a posição na tela é a projeção de cada ponto.
function Caminhante({ a, v, nome, destino }: { a: { pontos: Pt[]; dur: number }; v: Visual; nome: string; destino: string }) {
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
  const pos = P(a.pontos[k].x, a.pontos[k].y);
  const ant = P(a.pontos[Math.max(0, k - 1)].x, a.pontos[Math.max(0, k - 1)].y);
  const lado = pos.sx > ant.sx + 1 ? 1 : pos.sx < ant.sx - 1 ? -1 : 1;
  return (
    <g className="ea-mover" style={{ transform: `translate(${pos.sx}px, ${pos.sy}px)`, ["--ea-dur" as string]: `${k === 0 ? 0 : durDe(k - 1)}s` }}>
      <g transform={`scale(${lado} 1)`}><Pessoa v={v} andando /></g>
      <g transform="translate(0 -100)" fontFamily="inherit">
        <rect x={-(8 + destino.length) * 4.7 - 10} y="-50" width={(8 + destino.length) * 9.4 + 20} height="24" rx="6" fill="#fff" stroke="#7dd3fc" strokeWidth="1.5" />
        <text y="-33" textAnchor="middle" fontSize="15" fontStyle="italic" fill="#1e293b">Indo para {destino}</text>
        <rect x={-nome.length * 4.9 - 14} y="-20" width={nome.length * 9.8 + 28} height="24" rx="12" fill="#0f172a" opacity=".88" />
        <text y="-3" textAnchor="middle" fontSize="15" fontWeight="600" fill="#fff">{nome}</text>
      </g>
    </g>
  );
}
