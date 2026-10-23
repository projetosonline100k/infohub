import { memo, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ehNomeCoordenador } from "@/lib/empresa/visaoGeral";
import { cabeloDe, cabeloTras, visualDe, ESTILO, type Visual } from "./BonecoMesa";
import type { PessoaNaSala, SetorNoEscritorio } from "./EscritorioEmpresa";

// Escritório em salas (23/10, Davi mandou um reel de um "escritório de agentes IA" e pediu "esse layout"):
// losango isométrico clássico, salas fechadas por paredes claras com portas, uma encostada na outra; no
// centro a recepção com a orbe do Atlas; placa escura com o nome da sala no canto de cima, etiqueta com o
// nome embaixo de cada pessoa e o painel "Hoje". Mesma lógica de antes: o lugar de cada um vem do estado
// real (mesa do setor da tarefa, reunião, copa) e, quando muda, ele anda até lá.

// ---------------------------------------------------------------- projeção
const TW = 64, TH = 32, HZ = 34;           // losango 2:1 e altura de 1 unidade em z
const AX = TW * 0.72, CY = TH * 0.72;      // tamanho das elipses no chão (formas)
const R = 6, N = 3, G = R * N;             // cada sala tem 6 × 6; 3 × 3 salas
const PAREDE = 1.55;
const OX = G * TW / 2 + 40, OY = PAREDE * HZ + 100;
const LARG = G * TW + 80, ALT = G * TH + OY + 56;
const P = (x: number, y: number, z = 0) => ({ sx: (x - y) * (TW / 2) + OX, sy: (x + y) * (TH / 2) - z * HZ + OY });
const pts = (...ps: { sx: number; sy: number }[]) => ps.map((p) => `${p.sx.toFixed(1)},${p.sy.toFixed(1)}`).join(" ");
const ESCALA = 0.72;
// Ordem de desenho: quem está mais perto da câmera (x + y maior) por cima.
const pr = (x: number, y: number) => x + y;

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
// Retângulo no chão (tapete, sombra) e retângulos nas paredes do fundo (x = 0 à esquerda, y = 0 à direita).
const noChao = (x: number, y: number, w: number, d: number, z = 0) => pts(P(x, y, z), P(x + w, y, z), P(x + w, y + d, z), P(x, y + d, z));
const naParedeX = (y: number, z: number, comp: number, alt: number) => pts(P(0.02, y, z), P(0.02, y + comp, z), P(0.02, y + comp, z + alt), P(0.02, y, z + alt));
const naParedeY = (x: number, z: number, comp: number, alt: number) => pts(P(x, 0.02, z), P(x + comp, 0.02, z), P(x + comp, 0.02, z + alt), P(x, 0.02, z + alt));
function sombra(x: number, y: number, w: number, d: number, o = 0.24) {
  return <polygon points={pts(P(x - 0.1, y - 0.1), P(x + w + 0.25, y - 0.1), P(x + w + 0.25, y + d + 0.25), P(x - 0.1, y + d + 0.25))} fill="#000" opacity={o} />;
}
function elipsePiso(x: number, y: number, r: number, cor: string, z = 0, o = 1) {
  const c = P(x, y, z);
  return <ellipse cx={c.sx} cy={c.sy} rx={r * AX * 0.62} ry={r * CY * 0.62} fill={cor} opacity={o} />;
}

// Cada coisa do cenário vira um item com profundidade (x + y do canto da frente) para ordenar o desenho.
type Item = { prof: number; el: React.ReactNode; chave: string };

type Madeira = { topo: string; esq: string; dir: string; perna: string };
const CLARA: Madeira = { topo: "#e2c595", esq: "#c9a571", dir: "#b08f62", perna: "#5a4029" };
const ESCURA: Madeira = { topo: "#7a5536", esq: "#5e3f26", dir: "#4b311c", perna: "#2b1d12" };
const BRANCA: Madeira = { topo: "#f4f1ea", esq: "#dcd6cb", dir: "#c7c0b3", perna: "#64748b" };

function mesa(x: number, y: number, comp = 2, m: Madeira = CLARA, prof = 1): Item {
  return { chave: `mesa-${x}-${y}`, prof: pr(x, y + prof), el: (
    <g>
      {sombra(x, y, comp, prof)}
      {[[x + 0.06, y + 0.06], [x + comp - 0.16, y + 0.06], [x + 0.06, y + prof - 0.16], [x + comp - 0.16, y + prof - 0.16]].map(([a, b], k) => (
        <g key={k}>{caixa({ x: a, y: b, w: 0.1, d: 0.1, h: 0.72, topo: m.perna, esq: m.perna, dir: m.perna })}</g>
      ))}
      {caixa({ x, y, z: 0.72, w: comp, d: prof, h: 0.08, topo: m.topo, esq: m.esq, dir: m.dir })}
    </g>
  ) };
}
function notebook(x: number, y: number, ligado: boolean) {
  // Tela de costas para a câmera (a pessoa senta atrás da mesa, olhando para a gente).
  const c = P(x + 0.3, y + 0.06, 1.05);
  return (
    <g>
      {caixa({ x, y, z: 0.8, w: 0.6, d: 0.42, h: 0.03, topo: "#cbd5e1", esq: "#94a3b8", dir: "#64748b" })}
      {caixa({ x, y: y + 0.02, z: 0.83, w: 0.6, d: 0.04, h: 0.4, topo: "#94a3b8", esq: "#cbd5e1", dir: "#94a3b8" })}
      <circle cx={c.sx} cy={c.sy} r="2.2" fill={ligado ? "#f8fafc" : "#e2e8f0"} opacity={ligado ? 1 : 0.6} />
    </g>
  );
}
function monitor(x: number, y: number, larg = 0.8, ligado = true) {
  // Monitor de costas para a câmera; o brilho da tela aparece em volta (estação de edição/laboratório).
  return (
    <g>
      {caixa({ x: x + larg / 2 - 0.05, y: y + 0.2, z: 0.8, w: 0.1, d: 0.1, h: 0.25, topo: "#475569", esq: "#334155", dir: "#1e293b" })}
      {ligado && <polygon points={pts(P(x - 0.05, y + 0.1, 1.0), P(x + larg + 0.05, y + 0.1, 1.0), P(x + larg + 0.05, y + 0.1, 1.05 + larg * 0.66), P(x - 0.05, y + 0.1, 1.05 + larg * 0.66))} fill="#7dd3fc" opacity=".35" />}
      {caixa({ x, y: y + 0.12, z: 1.02, w: larg, d: 0.06, h: larg * 0.62, topo: "#1e293b", esq: "#273449", dir: "#0f172a" })}
    </g>
  );
}
function caneca(x: number, y: number, cor = "#f8fafc") {
  return caixa({ x, y, z: 0.8, w: 0.14, d: 0.14, h: 0.16, topo: "#7c4a1e", esq: cor, dir: "#cbd5e1" });
}
function papeis(x: number, y: number) {
  return <g>{caixa({ x, y, z: 0.8, w: 0.4, d: 0.3, h: 0.05, topo: "#fff", esq: "#e2e8f0", dir: "#cbd5e1" })}{caixa({ x: x + 0.05, y: y + 0.04, z: 0.85, w: 0.4, d: 0.3, h: 0.03, topo: "#fef9c3", esq: "#fde68a", dir: "#fcd34d" })}</g>;
}
function vasinho(x: number, y: number) {
  const c = P(x + 0.09, y + 0.09, 0.98);
  return <g>{caixa({ x, y, z: 0.8, w: 0.18, d: 0.18, h: 0.16, topo: "#a16207", esq: "#d6d3d1", dir: "#a8a29e" })}<circle cx={c.sx} cy={c.sy - 4} r="7" fill="#22c55e" /><circle cx={c.sx + 4} cy={c.sy - 8} r="5" fill="#4ade80" /></g>;
}
function headset(x: number, y: number) {
  const c = P(x, y, 0.82);
  return <g><path d={`M${c.sx - 7} ${c.sy} a7 7 0 0 1 14 0`} stroke="#0f172a" strokeWidth="2.4" fill="none" /><rect x={c.sx - 9} y={c.sy - 2} width="4" height="5" rx="1.5" fill="#0f172a" /><rect x={c.sx + 5} y={c.sy - 2} width="4" height="5" rx="1.5" fill="#0f172a" /></g>;
}
function cadeira(x: number, y: number, cor = "#334155", frente = false): Item {
  // frente: encosto do lado da câmera (cadeira do lado de cá da mesa).
  const esc = "#1e293b";
  return { chave: `cad-${x}-${y}`, prof: pr(x, frente ? y + 0.75 : y + 0.3), el: (
    <g>
      {elipsePiso(x + 0.4, y + 0.4, 0.4, "#000", 0, 0.14)}
      {caixa({ x: x + 0.36, y: y + 0.36, w: 0.08, d: 0.08, h: 0.38, topo: esc, esq: esc, dir: esc })}
      {caixa({ x: x + 0.15, y: y + 0.15, z: 0.38, w: 0.5, d: 0.5, h: 0.09, topo: cor, esq: esc, dir: "#0f172a" })}
      {caixa({ x: x + 0.15, y: frente ? y + 0.6 : y + 0.08, z: 0.47, w: 0.5, d: 0.1, h: 0.5, topo: cor, esq: cor, dir: esc })}
    </g>
  ) };
}
function pufe(x: number, y: number, cor = "#94a3b8"): Item {
  return { chave: `pufe-${x}-${y}`, prof: pr(x, y - 0.1), el: <g>{elipsePiso(x, y, 0.35, "#000", 0, 0.14)}{caixa({ x: x - 0.25, y: y - 0.25, w: 0.5, d: 0.5, h: 0.42, topo: cor, esq: "#64748b", dir: "#475569" })}</g> };
}
function planta(x: number, y: number, s = 1): Item {
  const c = P(x + 0.3, y + 0.3, 0.5);
  return { chave: `pl-${x}-${y}`, prof: pr(x, y + 0.6), el: (
    <g>
      {elipsePiso(x + 0.3, y + 0.3, 0.45, "#000", 0, 0.15)}
      {caixa({ x, y, w: 0.6, d: 0.6, h: 0.5, topo: "#57534e", esq: "#e7e5e4", dir: "#c8c2bd" })}
      <g transform={`translate(${c.sx} ${c.sy}) scale(${s * 1.3})`}>
        <path d="M0 0 C-22 -12,-26 -34,-8 -48 C-4 -30,-2 -14,0 0" fill="#15803d" />
        <path d="M0 0 C20 -10,28 -32,12 -50 C6 -32,3 -14,0 0" fill="#22c55e" />
        <path d="M0 0 C-6 -20,0 -44,3 -62 C9 -44,7 -20,0 0" fill="#16a34a" />
        <path d="M0 0 C-30 -4,-34 -20,-26 -30 C-16 -18,-8 -8,0 0" fill="#4ade80" opacity=".9" />
        <path d="M0 0 C26 -2,34 -16,28 -28 C18 -16,10 -6,0 0" fill="#86efac" opacity=".8" />
      </g>
    </g>
  ) };
}
function sofa(x: number, y: number, comp = 3, cor = "#475569", lateral = "#334155"): Item[] {
  // Encosto atrás (fundo) e assento na frente: quem senta fica entre os dois.
  return [
    { chave: `sofa-e-${x}-${y}`, prof: pr(x, y + 0.3), el: <g>{sombra(x - 0.25, y, comp + 0.5, 1.1)}{caixa({ x, y, w: comp, d: 0.3, h: 1, topo: cor, esq: lateral, dir: lateral })}</g> },
    { chave: `sofa-a-${x}-${y}`, prof: pr(x, y + 1.1), el: (
      <g>
        {caixa({ x, y: y + 0.3, w: comp, d: 0.8, h: 0.45, topo: cor, esq: lateral, dir: lateral })}
        {caixa({ x: x - 0.25, y, w: 0.25, d: 1.1, h: 0.7, topo: cor, esq: lateral, dir: lateral })}
        {caixa({ x: x + comp, y, w: 0.25, d: 1.1, h: 0.7, topo: cor, esq: lateral, dir: lateral })}
        {Array.from({ length: Math.max(1, Math.round(comp / 1.2)) }, (_, k) => (
          <g key={k}>{caixa({ x: x + 0.15 + k * (comp / Math.max(1, Math.round(comp / 1.2))), y: y + 0.32, z: 0.45, w: 0.35, d: 0.12, h: 0.32, topo: k % 2 ? "#fbbf24" : "#f1f5f9", esq: k % 2 ? "#f59e0b" : "#e2e8f0", dir: k % 2 ? "#d97706" : "#cbd5e1" })}</g>
        ))}
      </g>
    ) },
  ];
}
// Estante com livros: ao longo de x (encostada na parede da direita) ou de y (parede da esquerda).
function estante(x: number, y: number, comp: number, eixo: "x" | "y" = "x", alt = 1.9): Item {
  const w = eixo === "x" ? comp : 0.4, d = eixo === "x" ? 0.4 : comp;
  const cores = ["#ef4444", "#3b82f6", "#f59e0b", "#10b981", "#8b5cf6", "#f1f5f9", "#0f172a"];
  const livros: React.ReactNode[] = [];
  for (let n = 0; n < 3; n++) {
    const z = 0.15 + n * (alt / 3);
    let t = 0.1, k = n * 3;
    while (t < comp - 0.2) {
      const lw = 0.08 + ((k * 7) % 4) * 0.025, lh = 0.32 + ((k * 5) % 3) * 0.06;
      if ((k * 11) % 9 !== 0) {
        const pol = eixo === "x"
          ? pts(P(x + t, y + d, z), P(x + t + lw, y + d, z), P(x + t + lw, y + d, z + lh), P(x + t, y + d, z + lh))
          : pts(P(x + w, y + t, z), P(x + w, y + t + lw, z), P(x + w, y + t + lw, z + lh), P(x + w, y + t, z + lh));
        livros.push(<polygon key={`${n}-${k}`} points={pol} fill={cores[k % cores.length]} opacity=".9" />);
      }
      t += lw + 0.02; k++;
    }
  }
  return { chave: `est-${x}-${y}`, prof: pr(x, y + d), el: (
    <g>
      {sombra(x, y, w, d, 0.12)}
      {caixa({ x, y, w, d, h: alt, topo: "#6b4a2b", esq: eixo === "x" ? "#5b3d22" : "#4a3019", dir: eixo === "x" ? "#4a3019" : "#5b3d22" })}
      {livros}
    </g>
  ) };
}
function armario(x: number, y: number, w = 1.2, d = 0.6): Item {
  const gavetas = [0.2, 0.55, 0.9].map((z) => <polygon key={z} points={pts(P(x + 0.1, y + d, z), P(x + w - 0.1, y + d, z), P(x + w - 0.1, y + d, z + 0.28), P(x + 0.1, y + d, z + 0.28))} fill="#cbd5e1" stroke="#94a3b8" strokeWidth=".8" />);
  return { chave: `arm-${x}-${y}`, prof: pr(x, y + d), el: <g>{sombra(x, y, w, d, 0.12)}{caixa({ x, y, w, d, h: 1.25, topo: "#e2e8f0", esq: "#d5dde7", dir: "#b6c2d1" })}{gavetas}</g> };
}
function quadroBranco(x: number, y: number, comp = 2): Item {
  return { chave: `qb-${x}-${y}`, prof: pr(x, y + 0.1), el: (
    <g>
      {caixa({ x: x + 0.1, y, w: 0.08, d: 0.08, h: 1, topo: "#94a3b8", esq: "#64748b", dir: "#475569" })}
      {caixa({ x: x + comp - 0.18, y, w: 0.08, d: 0.08, h: 1, topo: "#94a3b8", esq: "#64748b", dir: "#475569" })}
      {caixa({ x, y, z: 0.9, w: comp, d: 0.06, h: 1.1, topo: "#e2e8f0", esq: "#f8fafc", dir: "#cbd5e1" })}
      <polyline points={pts(P(x + 0.3, y + 0.07, 1.3), P(x + 0.7, y + 0.07, 1.55), P(x + 1.1, y + 0.07, 1.4), P(x + 1.5, y + 0.07, 1.75))} stroke="#2563eb" strokeWidth="1.6" fill="none" />
      {[["#fde047", 0.25, 1.85], ["#86efac", 0.65, 1.85], ["#f9a8d4", 1.05, 1.85], ["#93c5fd", 1.45, 1.85]].map(([c, a, z], k) => (
        <polygon key={k} points={pts(P(x + (a as number), y + 0.07, z as number), P(x + (a as number) + 0.25, y + 0.07, z as number), P(x + (a as number) + 0.25, y + 0.07, (z as number) - 0.22), P(x + (a as number), y + 0.07, (z as number) - 0.22))} fill={c as string} />
      ))}
    </g>
  ) };
}
function mesaRedonda(x: number, y: number, r = 1.2, m: Madeira = CLARA, alt = 0.72): Item {
  return { chave: `mr-${x}-${y}`, prof: pr(x, y + r * 0.62), el: (
    <g>
      {elipsePiso(x, y, r + 0.3, "#000", 0, 0.15)}
      {caixa({ x: x - 0.1, y: y - 0.1, w: 0.2, d: 0.2, h: alt, topo: m.perna, esq: m.perna, dir: m.perna })}
      {elipsePiso(x, y, r, m.dir, alt)}{elipsePiso(x, y, r, m.topo, alt + 0.06)}
    </g>
  ) };
}
function banqueta(x: number, y: number): Item {
  return { chave: `bq-${x}-${y}`, prof: pr(x, y - 0.1), el: (
    <g>
      {elipsePiso(x, y, 0.3, "#000", 0, 0.14)}
      {caixa({ x: x - 0.04, y: y - 0.04, w: 0.08, d: 0.08, h: 0.7, topo: "#64748b", esq: "#475569", dir: "#334155" })}
      {elipsePiso(x, y, 0.32, "#1f2937", 0.72)}
    </g>
  ) };
}
function luminaria(x: number, y: number): Item {
  const t = P(x, y, 1.9);
  return { chave: `lum-${x}-${y}`, prof: pr(x, y + 0.05), el: (
    <g>
      {elipsePiso(x, y, 1.3, "#fde68a", 0, 0.22)}
      {caixa({ x: x - 0.04, y: y - 0.04, w: 0.08, d: 0.08, h: 1.9, topo: "#475569", esq: "#334155", dir: "#1e293b" })}
      <path d={`M${t.sx - 11} ${t.sy} h22 l-5 -15 h-12 Z`} fill="#fef3c7" stroke="#eab308" strokeWidth=".8" />
      <ellipse cx={t.sx} cy={t.sy + 2} rx="10" ry="3" fill="#fde68a" opacity=".9" />
    </g>
  ) };
}
function softbox(x: number, y: number): Item {
  const t = P(x, y, 1.7);
  return { chave: `sb-${x}-${y}`, prof: pr(x, y + 0.05), el: (
    <g>
      {elipsePiso(x, y, 1.1, "#fff7ed", 0, 0.3)}
      <path d={`M${P(x, y).sx - 10} ${P(x, y).sy + 3} L${t.sx} ${t.sy} L${P(x, y).sx + 10} ${P(x, y).sy + 3}`} stroke="#1f2937" strokeWidth="2" fill="none" />
      <rect x={t.sx - 13} y={t.sy - 26} width="26" height="24" rx="3" fill="#f8fafc" stroke="#1f2937" strokeWidth="2.5" />
    </g>
  ) };
}
function fundoVerde(x: number, y: number, comp = 2.4): Item {
  return { chave: `fv-${x}`, prof: pr(x, y + 0.1), el: <g>{caixa({ x, y, w: comp, d: 0.08, h: 2.3, topo: "#166534", esq: "#22c55e", dir: "#15803d" })}<polygon points={noChao(x, y + 0.08, comp, 1.4)} fill="#22c55e" opacity=".85" /></g> };
}
function tripe(x: number, y: number): Item {
  const b = P(x, y), t = P(x, y, 1.45);
  return { chave: `tr-${x}`, prof: pr(x, y + 0.15), el: (
    <g>
      <path d={`M${b.sx - 12} ${b.sy + 4} L${t.sx} ${t.sy} L${b.sx + 12} ${b.sy + 4} M${t.sx} ${t.sy} L${b.sx} ${b.sy + 8}`} stroke="#1f2937" strokeWidth="2.5" fill="none" />
      {caixa({ x: x - 0.25, y: y - 0.15, z: 1.45, w: 0.5, d: 0.3, h: 0.3, topo: "#1e293b", esq: "#0f172a", dir: "#020617" })}
      {(() => { const l = P(x, y + 0.2, 1.6); return <circle cx={l.sx} cy={l.sy} r="4" fill="#38bdf8" stroke="#0f172a" strokeWidth="1.5" />; })()}
    </g>
  ) };
}
function caixasEquip(x: number, y: number): Item {
  return { chave: `cx-${x}`, prof: pr(x, y + 0.6), el: <g>{sombra(x, y, 0.9, 0.6)}{caixa({ x, y, w: 0.9, d: 0.6, h: 0.45, topo: "#334155", esq: "#1f2937", dir: "#111827" })}{caixa({ x: x + 0.1, y: y + 0.05, z: 0.45, w: 0.7, d: 0.5, h: 0.35, topo: "#475569", esq: "#334155", dir: "#1e293b" })}</g> };
}
function bebedouro(x: number, y: number): Item {
  return { chave: `beb-${x}`, prof: pr(x, y + 0.5), el: (
    <g>
      {sombra(x, y, 0.5, 0.5)}
      {caixa({ x, y, w: 0.5, d: 0.5, h: 1.05, topo: "#f1f5f9", esq: "#e2e8f0", dir: "#cbd5e1" })}
      {caixa({ x: x + 0.07, y: y + 0.07, z: 1.05, w: 0.36, d: 0.36, h: 0.55, topo: "#bae6fd", esq: "#7dd3fc", dir: "#38bdf8" })}
    </g>
  ) };
}
// Vidro em pé ao longo de x (y fixo) ou de y (x fixo).
function vidro(x0: number, y0: number, x1: number, y1: number, h = 1.7): Item {
  const a = P(x0, y0), b = P(x1, y1), c = P(x1, y1, h), d = P(x0, y0, h);
  const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 1.5));
  const em = (t: number, z: number) => P(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z);
  return { chave: `vd-${x0}-${y0}-${x1}-${y1}`, prof: pr(Math.max(x0, x1), Math.max(y0, y1) + 0.01), el: (
    <g>
      <polygon points={pts(a, b, c, d)} fill="#cfe9ff" opacity=".22" />
      <polyline points={pts(d, c)} stroke="#64748b" strokeWidth="2.4" fill="none" /><polyline points={pts(a, b)} stroke="#64748b" strokeWidth="2.6" fill="none" />
      {Array.from({ length: n + 1 }, (_, k) => { const p0 = em(k / n, 0), p1 = em(k / n, h); return <line key={k} x1={p0.sx} y1={p0.sy} x2={p1.sx} y2={p1.sy} stroke="#94a3b8" strokeWidth="1.4" />; })}
      <line x1={em(0.18, 0.3).sx} y1={em(0.18, 0.3).sy} x2={em(0.26, 1.2).sx} y2={em(0.26, 1.2).sy} stroke="#fff" strokeWidth="1.8" opacity=".6" />
      <line x1={em(0.62, 0.4).sx} y1={em(0.62, 0.4).sy} x2={em(0.68, 1.0).sx} y2={em(0.68, 1.0).sy} stroke="#fff" strokeWidth="1.2" opacity=".45" />
    </g>
  ) };
}
function divisoria(x: number, y0: number, y1: number): Item {
  return { chave: `div-${x}-${y0}`, prof: pr(x, y1), el: caixa({ x, y: y0, w: 0.1, d: y1 - y0, h: 0.95, topo: "#94a3b8", esq: "#cbd5e1", dir: "#e2e8f0" }) };
}

// ---------------------------------------------------------------- personagens
function Pessoa({ v, andando, sentado, xicara }: { v: Visual; andando?: boolean; sentado?: boolean; xicara?: boolean }) {
  return (
    <g className={andando ? "ea-andando" : undefined} transform={`scale(${ESCALA})`}>
      <ellipse cx="0" cy="1" rx="12" ry="4" fill="#000" opacity=".2" />
      <g className="ea-corpo">
        {!sentado && <>
          <g className="ea-perna-e"><rect x="-6.5" y="-25" width="5.5" height="25" rx="2.5" fill="#334155" /><ellipse cx="-3.5" cy="0" rx="4" ry="2" fill="#1e293b" /></g>
          <g className="ea-perna-d"><rect x="1" y="-25" width="5.5" height="25" rx="2.5" fill="#3b4a5f" /><ellipse cx="4" cy="0" rx="4" ry="2" fill="#1e293b" /></g>
        </>}
        {sentado && <rect x="-10" y="-26" width="20" height="9" rx="4" fill="#334155" />}
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
    <g transform={`scale(${ESCALA})`}><g className="ea-flutua">
      <ellipse cx="0" cy="4" rx="12" ry="4" fill="#000" opacity=".2" />
      <rect x="-12" y="-46" width="24" height="26" rx="8" fill="#e2e8f0" stroke="#94a3b8" />
      <rect x="-16" y="-76" width="32" height="28" rx="12" fill="#0f172a" stroke="#22d3ee" strokeWidth="1.6" />
      <rect x="-9" y="-67" width="6" height="9" rx="3" fill="#67e8f9" /><rect x="3" y="-67" width="6" height="9" rx="3" fill="#67e8f9" />
      <line x1="0" y1="-76" x2="0" y2="-84" stroke="#94a3b8" strokeWidth="2" /><circle cx="0" cy="-86" r="3" fill="#22d3ee" />
    </g></g>
  );
}
function Sinal({ sinal }: { sinal: PessoaNaSala["sinal"] }) {
  if (sinal === "esperando") return <g transform={`translate(${18 * ESCALA} ${-90 * ESCALA})`}><circle r="9" fill="#f59e0b" stroke="#fff" strokeWidth="2" /><text y="4.5" textAnchor="middle" fontSize="13" fontWeight="800" fill="#fff">!</text></g>;
  if (sinal === "problema") return <g transform={`translate(${18 * ESCALA} ${-90 * ESCALA})`} className="animate-pulse"><circle r="9" fill="#ef4444" stroke="#fff" strokeWidth="2" /><text y="4.5" textAnchor="middle" fontSize="13" fontWeight="800" fill="#fff">!</text></g>;
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


// ---------------------------------------------------------------- planta: 3 × 3 salas
// Na tela: (0,0) em cima, (2,0) à direita, (0,2) à esquerda, (2,2) embaixo (a entrada).
type Pt = { x: number; y: number };
type TipoEstacao = "executiva" | "criativa" | "edicao" | "lab" | "atendimento";
interface Sala { chave: string; rotulo: string; cx: number; cy: number; tipo?: TipoEstacao; tapete: string; borda: string }
const SALAS: Sala[] = [
  { chave: "diretoria", rotulo: "Diretoria", cx: 0, cy: 0, tipo: "executiva", tapete: "rgba(245,158,11,.18)", borda: "rgba(245,158,11,.55)" },
  { chave: "marketing", rotulo: "Marketing", cx: 0, cy: 1, tipo: "criativa", tapete: "rgba(168,85,247,.2)", borda: "rgba(168,85,247,.55)" },
  { chave: "audiovisual", rotulo: "Audiovisual", cx: 1, cy: 0, tipo: "edicao", tapete: "rgba(59,130,246,.22)", borda: "rgba(96,165,250,.6)" },
  { chave: "viral", rotulo: "Laboratório de Viral", cx: 0, cy: 2, tipo: "lab", tapete: "rgba(16,185,129,.2)", borda: "rgba(52,211,153,.6)" },
  { chave: "sucesso", rotulo: "Sucesso do Cliente", cx: 2, cy: 0, tipo: "atendimento", tapete: "rgba(236,72,153,.18)", borda: "rgba(244,114,182,.55)" },
  { chave: "sales", rotulo: "Sales", cx: 1, cy: 2, tipo: "atendimento", tapete: "rgba(239,68,68,.18)", borda: "rgba(248,113,113,.55)" },
  { chave: "recepcao", rotulo: "Recepção", cx: 1, cy: 1, tapete: "rgba(34,211,238,.12)", borda: "rgba(34,211,238,.5)" },
  { chave: "reuniao", rotulo: "Sala de reunião", cx: 2, cy: 1, tapete: "rgba(148,163,184,.18)", borda: "rgba(203,213,225,.45)" },
  { chave: "copa", rotulo: "Copa", cx: 2, cy: 2, tapete: "rgba(251,191,36,.12)", borda: "rgba(251,191,36,.4)" },
];
const SETORIAIS = SALAS.filter((s) => s.tipo);
const PALAVRAS: Record<string, RegExp> = {
  diretoria: /diretoria|dire[cç][aã]o|ceo|s[oó]cio/i, marketing: /marketing|mkt|grow|tr[aá]fego|conte[uú]do/i,
  audiovisual: /audiovisual|v[ií]deo|edi[cç][aã]o|est[uú]dio|design/i, viral: /viral|lab|roteiro|copy/i,
  sucesso: /sucesso|cliente|suporte|\bcs\b|atendimento/i, sales: /sales|venda|comercial|closer|sdr/i,
};
const origem = (s: Sala) => ({ x0: s.cx * R, y0: s.cy * R });
const SALA = Object.fromEntries(SALAS.map((s) => [s.chave, s])) as Record<string, Sala>;
// Mesas dentro da sala (canto de trás da mesa); só as da equipe aparecem.
const MESAS: Pt[] = [{ x: 0.8, y: 1.4 }, { x: 3.5, y: 1.4 }, { x: 0.8, y: 3.25 }, { x: 3.5, y: 3.25 }, { x: 0.8, y: 4.9 }, { x: 3.5, y: 4.9 }];
const MESAS_EXEC: Pt[] = [{ x: 0.9, y: 2.3 }, { x: 3.4, y: 2.3 }, { x: 0.9, y: 4.3 }];
// Recepção: duas mesas livres para quem sobra de um setor.
const { x0: RX, y0: RY } = origem(SALA.recepcao);
const AVULSAS: Pt[] = [{ x: RX + 0.5, y: RY + 4.7 }, { x: RX + 3.9, y: RY + 4.7 }];
const ORBE = { x: RX + 3, y: RY + 2.8 };
const { x0: MX, y0: MY } = origem(SALA.reuniao);
const MESA_REUNIAO = { x: MX + 1.3, y: MY + 2.4, w: 3.4, d: 1.2 };
const VAGAS_REUNIAO: (Pt & { cadeira: boolean })[] = [
  ...[1.9, 3.0, 4.1].map((x) => ({ x: MX + x, y: MY + 2.05, cadeira: true })),
  ...[1.9, 3.0, 4.1].map((x) => ({ x: MX + x, y: MY + 4.05, cadeira: false })),
];
const { x0: CX, y0: CYY } = origem(SALA.copa);
type Vaga = Pt & { onde: string; z: number; xicara?: boolean };
const VAGAS_LIVRE: Vaga[] = [
  { x: CX + 1.1, y: CYY + 1.75, onde: "Copa", z: 0.72, xicara: true }, { x: CX + 2.3, y: CYY + 1.75, onde: "Copa", z: 0.72, xicara: true },
  { x: CX + 1.2, y: CYY + 4.3, onde: "Copa", z: 0.3 }, { x: CX + 2.3, y: CYY + 4.3, onde: "Copa", z: 0.3 },
  { x: CX + 4.3, y: CYY + 3.75, onde: "Copa", z: 0.72, xicara: true }, { x: CX + 5.4, y: CYY + 3.75, onde: "Copa", z: 0.72, xicara: true },
  { x: CX + 3.4, y: CYY + 1.75, onde: "Copa", z: 0.72, xicara: true }, { x: CX + 3.4, y: CYY + 4.3, onde: "Copa", z: 0.3 },
];
const VEL = 2.6;

const ehRobo = (p: PessoaNaSala) => p.ehIa && ehNomeCoordenador(p.nome);
const ehNoite = () => { const h = new Date().getHours(); return h >= 22 || h < 7; };
const ehDavi = (p: PessoaNaSala) => !p.ehIa && /^davi\b/i.test(p.nome);
const somaId = (id: string) => [...id].reduce((t, c) => t + c.charCodeAt(0), 0);
const centroDaSala = (q: Pt): Pt => ({ x: Math.floor(Math.min(G - 0.01, Math.max(0, q.x)) / R) * R + R / 2, y: Math.floor(Math.min(G - 0.01, Math.max(0, q.y)) / R) * R + R / 2 });

type Lugar = { tipo: "mesa" | "pe" | "orbe"; x: number; y: number; z: number; onde: string; amb?: string; est?: number; xicara?: boolean };

// Parede de 1 unidade (ao longo de x, no y fixo; ou ao longo de y, no x fixo), com porta ou janela.
function parede(eixo: "x" | "y", a: number, fixo: number, abertura?: "porta" | "janela"): Item {
  const esp = 0.12;
  const corpo = eixo === "x"
    ? caixa({ x: a, y: fixo - esp / 2, w: 1, d: esp, h: PAREDE, topo: "#2c221b", esq: "#ece5d8", dir: "#d9d0c0", borda: "rgba(0,0,0,.08)" })
    : caixa({ x: fixo - esp / 2, y: a, w: esp, d: 1, h: PAREDE, topo: "#2c221b", esq: "#d9d0c0", dir: "#e4dccd", borda: "rgba(0,0,0,.08)" });
  const f = fixo + esp / 2 + 0.01;
  const face = (u0: number, u1: number, z0: number, z1: number) => eixo === "x"
    ? pts(P(a + u0, f, z0), P(a + u1, f, z0), P(a + u1, f, z1), P(a + u0, f, z1))
    : pts(P(f, a + u0, z0), P(f, a + u1, z0), P(f, a + u1, z1), P(f, a + u0, z1));
  return { chave: `par-${eixo}-${a}-${fixo}`, prof: (eixo === "x" ? a + 0.2 + fixo : fixo + a + 0.2) - 0.35, el: (
    <g>
      {corpo}
      <polygon points={face(0, 1, 0, 0.09)} fill="#3b2f26" opacity=".55" />
      {abertura === "porta" && <><polygon points={face(0.15, 0.85, 0, 1.12)} fill="#2a2420" /><polygon points={face(0.7, 0.76, 0.5, 0.58)} fill="#d6c7a8" /></>}
      {abertura === "janela" && <><polygon points={face(0.08, 0.92, 0.75, 1.32)} fill="#9cc9e8" /><polygon points={face(0.08, 0.92, 1.24, 1.32)} fill="#d7ecf8" opacity=".8" /><polygon points={face(0.48, 0.52, 0.75, 1.32)} fill="#5b6b78" /></>}
    </g>
  ) };
}

function Orbe() {
  // Holograma do Atlas na recepção: base hexagonal, feixe de luz e a esfera com anéis.
  const b = P(ORBE.x, ORBE.y), t = P(ORBE.x, ORBE.y, 1.55);
  const hex = (r: number, z: number) => pts(...Array.from({ length: 6 }, (_, k) => { const a = (Math.PI / 3) * k; return P(ORBE.x + r * Math.cos(a), ORBE.y + r * Math.sin(a), z); }));
  return (
    <g className="orbe">
      <polygon points={hex(1.35, 0)} fill="rgba(34,211,238,.18)" stroke="#22d3ee" strokeWidth="2" />
      <polygon points={hex(0.85, 0.12)} fill="rgba(34,211,238,.35)" stroke="#67e8f9" strokeWidth="1.5" />
      <polygon points={hex(0.45, 0.2)} fill="#0e3a47" stroke="#22d3ee" strokeWidth="1.2" />
      <path d={`M${b.sx - 10} ${b.sy - 6} L${t.sx - 4} ${t.sy} L${t.sx + 4} ${t.sy} L${b.sx + 10} ${b.sy - 6} Z`} fill="url(#orbe-feixe)" />
      <circle cx={t.sx} cy={t.sy} r="34" fill="url(#orbe-brilho)" />
      <ellipse className="orbe-anel" cx={t.sx} cy={t.sy} rx="30" ry="11" fill="none" stroke="#67e8f9" strokeWidth="1.6" opacity=".8" />
      <ellipse className="orbe-anel2" cx={t.sx} cy={t.sy} rx="26" ry="9" fill="none" stroke="#a5f3fc" strokeWidth="1.2" opacity=".6" transform={`rotate(60 ${t.sx} ${t.sy})`} />
      <circle cx={t.sx} cy={t.sy} r="15" fill="#cffafe" />
      <circle cx={t.sx} cy={t.sy} r="11" fill="#ecfeff" />
    </g>
  );
}

function luzAnel(x: number, y: number): Item {
  const b = P(x, y), t = P(x, y, 1.55);
  return { chave: `anel-${x}`, prof: pr(x, y), el: (
    <g>
      {elipsePiso(x, y, 0.9, "#fff7ed", 0, 0.25)}
      <path d={`M${b.sx - 9} ${b.sy + 3} L${t.sx} ${t.sy + 16} L${b.sx + 9} ${b.sy + 3} M${t.sx} ${t.sy + 16} L${b.sx} ${b.sy + 6}`} stroke="#1f2937" strokeWidth="2" fill="none" />
      <circle cx={t.sx} cy={t.sy} r="15" fill="none" stroke="#fde68a" strokeWidth="5" />
      <circle cx={t.sx} cy={t.sy} r="15" fill="none" stroke="#fffbeb" strokeWidth="2" />
    </g>
  ) };
}

export const EscritorioSalas = memo(function EscritorioSalas({ setores, onAbrir, forcarNoite, tv, onAbrirSetor }: {
  setores: SetorNoEscritorio[]; onAbrir: (id: string) => void; forcarNoite?: boolean; tv?: React.ReactNode; onAbrirSetor?: (id: string) => void;
}) {
  const [noiteAgora, setNoite] = useState(ehNoite);
  const noite = forcarNoite ?? noiteAgora;
  const [foco, setFoco] = useState<string | null>(null);
  useEffect(() => { const t = window.setInterval(() => setNoite(ehNoite()), 60_000); return () => window.clearInterval(t); }, []);

  // Qual sala é de qual setor (pelo nome; o que sobra vai para a primeira sala de setor livre).
  const salaDoSetor = useMemo(() => {
    const m = new Map<string, string>();
    const usadas = new Set<string>();
    for (const s of setores) { const a = SETORIAIS.find((x) => !usadas.has(x.chave) && PALAVRAS[x.chave].test(s.nome)); if (a) { m.set(s.id, a.chave); usadas.add(a.chave); } }
    for (const s of setores) { if (m.has(s.id)) continue; const a = SETORIAIS.find((x) => !usadas.has(x.chave)); if (a) { m.set(s.id, a.chave); usadas.add(a.chave); } }
    return m;
  }, [setores]);
  const setorDaSala = useMemo(() => { const m = new Map<string, SetorNoEscritorio>(); for (const s of setores) { const k = salaDoSetor.get(s.id); if (k) m.set(k, s); } return m; }, [setores, salaDoSetor]);
  const mesasDe = (chave: string) => {
    const sala = SALA[chave]; const { x0, y0 } = origem(sala);
    const n = Math.max(1, setorDaSala.get(chave)?.pessoas.length ?? 0);
    return (sala.tipo === "executiva" ? MESAS_EXEC : MESAS).slice(0, n).map((m) => ({ x: x0 + m.x, y: y0 + m.y }));
  };

  const vagaAntes = useRef<Map<string, number>>(new Map());
  const geo = useMemo(() => {
    const pessoas = setores.flatMap((s) => s.pessoas.map((p) => ({ p, setor: s.id })));
    const alguemConversando = !noite && pessoas.some(({ p }) => p.conversando);
    const lugar = new Map<string, Lugar>();
    const ocupadas = new Map<string, Set<number>>();
    const avulsas = new Set<number>();
    const reuniao: PessoaNaSala[] = [], livres: PessoaNaSala[] = [];
    const nomeDe = (id: string) => setores.find((s) => s.id === id)?.nome ?? "";
    const sentar = (p: PessoaNaSala, setorId: string, setorDele: string) => {
      const chave = salaDoSetor.get(setorId) ?? salaDoSetor.get(setorDele);
      if (chave) {
        const mesas = mesasDe(chave), comp = SALA[chave].tipo === "executiva" ? 1.9 : 1.6;
        const usadas = ocupadas.get(chave) ?? new Set<number>();
        const ideal = setores.find((s) => s.id === setorDele)?.pessoas.findIndex((x) => x.id === p.id) ?? -1;
        let est = setorId === setorDele && ideal >= 0 && ideal < mesas.length && !usadas.has(ideal) ? ideal : -1;
        if (est < 0) est = mesas.findIndex((_, k) => !usadas.has(k));
        if (est >= 0) {
          usadas.add(est); ocupadas.set(chave, usadas);
          lugar.set(p.id, { tipo: "mesa", x: mesas[est].x + comp / 2, y: mesas[est].y - 0.28, z: 0.4, amb: chave, est, onde: nomeDe(setorId) || SALA[chave].rotulo }); return;
        }
      }
      const k = AVULSAS.findIndex((_, i) => !avulsas.has(i));
      if (k >= 0) { avulsas.add(k); lugar.set(p.id, { tipo: "mesa", x: AVULSAS[k].x + 0.8, y: AVULSAS[k].y - 0.28, z: 0.4, amb: "avulsa", est: k, onde: "Recepção" }); }
    };
    const trabalhando = pessoas.filter(({ p }) => {
      if (ehRobo(p)) { lugar.set(p.id, { tipo: "orbe", x: ORBE.x, y: ORBE.y, z: 1.55, onde: "Recepção" }); return false; }
      if (!noite && (p.conversando || (alguemConversando && ehDavi(p)))) { reuniao.push(p); return false; }
      if (noite || p.sinal !== "parado") return true;
      livres.push(p); return false;
    });
    const zonaDe = (p: PessoaNaSala, setor: string) => (!noite && p.setorTarefa && salaDoSetor.has(p.setorTarefa) ? p.setorTarefa : setor);
    for (const { p, setor } of trabalhando.filter(({ p, setor }) => zonaDe(p, setor) === setor)) sentar(p, setor, setor);
    for (const { p, setor } of trabalhando.filter(({ p, setor }) => zonaDe(p, setor) !== setor)) sentar(p, zonaDe(p, setor), setor);
    reuniao.forEach((p, k) => { const v = VAGAS_REUNIAO[k % VAGAS_REUNIAO.length]; lugar.set(p.id, { tipo: "pe", x: v.x, y: v.y, z: 0.4, onde: "Reunião", est: k }); });
    // Quem já estava descansando fica onde estava (ninguém troca de lugar só porque outro saiu).
    const vagasUsadas = new Set<number>();
    const ordem = [...livres].sort((a, b) => a.id.localeCompare(b.id));
    const vagaNova = new Map<string, number>();
    ordem.forEach((p) => { const k = vagaAntes.current.get(p.id); if (k != null && !vagasUsadas.has(k)) { vagasUsadas.add(k); vagaNova.set(p.id, k); } });
    ordem.filter((p) => !vagaNova.has(p.id)).forEach((p) => {
      let k = somaId(p.id) % VAGAS_LIVRE.length;
      for (let n = 0; vagasUsadas.has(k) && n < VAGAS_LIVRE.length; n++) k = (k + 1) % VAGAS_LIVRE.length;
      vagasUsadas.add(k); vagaNova.set(p.id, k);
    });
    for (const [id, k] of vagaNova) { const v = VAGAS_LIVRE[k]; lugar.set(id, { tipo: "pe", x: v.x, y: v.y, z: v.z, onde: v.onde, xicara: v.xicara, est: k }); }
    vagaAntes.current = vagaNova;
    return { lugar, pessoas: pessoas.map((x) => x.p) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setores, noite, salaDoSetor, setorDaSala]);

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
      if (!l || l.tipo === "orbe") continue;
      const chave = `${l.tipo}-${l.amb ?? l.onde}-${l.est ?? l.x}`;
      const de = ondeEstava.current.get(p.id);
      if (antes.current.get(p.id) && antes.current.get(p.id) !== chave && de) {
        // Sai pelo meio da própria sala, passa pelo meio da sala de destino e senta.
        const a = centroDaSala(de), b = centroDaSala(l);
        const pontos = [de, a, ...(a.x === b.x && a.y === b.y ? [] : [{ x: b.x, y: a.y }, b]), { x: l.x, y: l.y }];
        const total = pontos.slice(1).reduce((t, q, k) => t + Math.hypot(q.x - pontos[k].x, q.y - pontos[k].y), 0);
        const dur = Math.min(14, Math.max(1.6, total / VEL));
        novos[p.id] = { dur, chave: Date.now(), pontos };
        timers.current.push(window.setTimeout(() => setAndando((x) => { const n = { ...x }; delete n[p.id]; return n; }), dur * 1000 + 80));
      }
      antes.current.set(p.id, chave);
      ondeEstava.current.set(p.id, { x: l.x, y: l.y });
    }
    if (Object.keys(novos).length) setAndando((x) => ({ ...x, ...novos }));
  }, [geo]);
  const ocupante = (amb: string, est: number) => geo.pessoas.find((q) => { const l = geo.lugar.get(q.id); return l?.amb === amb && l.est === est && !andando[q.id]; });

  // ---------------------------------------------------------------- cena
  const itens: Item[] = [];
  const add = (...xs: (Item | Item[])[]) => xs.forEach((x) => (Array.isArray(x) ? itens.push(...x) : itens.push(x)));

  // Paredes: cada sala tem a de trás e a da esquerda; por fora, janelas; por dentro, uma porta no meio.
  for (const s of SALAS) {
    const { x0, y0 } = origem(s);
    for (let i = 0; i < R; i++) {
      add(parede("x", x0 + i, y0, y0 === 0 ? (i === 1 || i === 4 ? "janela" : undefined) : i === 2 ? "porta" : undefined));
      add(parede("y", y0 + i, x0, x0 === 0 ? (i === 1 || i === 4 ? "janela" : undefined) : i === 3 ? "porta" : undefined));
    }
  }
  // Mobília de cada sala de setor (as mesas são só as da equipe) e o que é próprio do setor.
  for (const s of SETORIAIS) {
    const { x0, y0 } = origem(s);
    const setor = setorDaSala.get(s.chave);
    if (!setor) {
      // Sala sem setor vira um cantinho de descanso.
      add(sofa(x0 + 1.2, y0 + 2.2, 2.6, "#475569", "#334155"), mesaRedonda(x0 + 2.5, y0 + 4.1, 0.5, ESCURA, 0.45), planta(x0 + 0.3, y0 + 0.4, 1), planta(x0 + R - 0.9, y0 + R - 1, 1));
      continue;
    }
    const exec = s.tipo === "executiva", comp = exec ? 1.9 : 1.6, madeira = exec ? ESCURA : s.tipo === "edicao" || s.tipo === "lab" ? BRANCA : CLARA;
    mesasDe(s.chave).forEach((m, k) => {
      const quem = ocupante(s.chave, k), ligado = !!quem && quem.sinal !== "parado";
      add(cadeira(m.x + comp / 2 - 0.4, m.y - 0.65, exec ? "#3f2a1d" : "#334155"));
      const base = mesa(m.x, m.y, comp, madeira, 0.8);
      add({ ...base, el: (
        <g>
          {base.el}
          {s.tipo === "edicao" ? <>{monitor(m.x + 0.1, m.y + 0.02, 0.7, ligado)}{monitor(m.x + 0.85, m.y + 0.02, 0.7, ligado)}</>
            : s.tipo === "lab" ? monitor(m.x + 0.45, m.y + 0.02, 0.75, ligado)
            : notebook(m.x + comp / 2 - 0.3, m.y + 0.1, ligado)}
          {s.tipo === "atendimento" && headset(m.x + 0.25, m.y + 0.45)}
          {exec && papeis(m.x + 0.15, m.y + 0.35)}
        </g>
      ) });
    });
    add(planta(x0 + 0.25, y0 + R - 0.85, 0.9));
    if (exec) add(estante(x0 + 0.3, y0 + 0.2, 2.4, "x", 1.35), planta(x0 + R - 0.85, y0 + 0.3, 1));
    if (s.chave === "marketing") add(quadroBranco(x0 + 3.0, y0 + 0.25, 2.2));
    if (s.chave === "audiovisual") add(luzAnel(x0 + R - 0.8, y0 + R - 1.4), tripe(x0 + R - 1.7, y0 + R - 0.8));
    if (s.chave === "viral") add({ chave: "painel-lab", prof: pr(x0 + 3, y0 + 0.4), el: (
      <g>
        {caixa({ x: x0 + 3.0, y: y0 + 0.25, w: 2.2, d: 0.06, h: 0.95, z: 0.55, topo: "#1e293b", esq: "#0f172a", dir: "#020617" })}
        <polyline points={pts(P(x0 + 3.2, y0 + 0.32, 0.85), P(x0 + 3.7, y0 + 0.32, 1.05), P(x0 + 4.2, y0 + 0.32, 0.95), P(x0 + 4.6, y0 + 0.32, 1.3), P(x0 + 5.0, y0 + 0.32, 1.38))} stroke="#34d399" strokeWidth="2.2" fill="none" />
      </g>
    ) });
  }
  // Recepção: a orbe do Atlas, duas mesas livres e plantas.
  AVULSAS.forEach((m, k) => {
    add(cadeira(m.x + 0.4, m.y - 0.65, "#334155"));
    const base = mesa(m.x, m.y, 1.6, CLARA, 0.8);
    add({ ...base, el: <g>{base.el}{notebook(m.x + 0.5, m.y + 0.1, !!ocupante("avulsa", k))}</g> });
  });
  add(planta(RX + 0.3, RY + 0.4, 1.1), planta(RX + R - 0.9, RY + 0.4, 1.1));
  add({ chave: "orbe", prof: pr(ORBE.x, ORBE.y) + 0.6, el: <Orbe /> });
  // Sala de reunião: mesa comprida, cadeiras de um lado, pufes do outro, tela na parede.
  add(mesa(MESA_REUNIAO.x, MESA_REUNIAO.y, MESA_REUNIAO.w, ESCURA, MESA_REUNIAO.d));
  VAGAS_REUNIAO.forEach((v) => add(v.cadeira ? cadeira(v.x - 0.4, v.y - 0.45, "#475569") : pufe(v.x, v.y + 0.05, "#94a3b8")));
  add({ chave: "tela-reuniao", prof: pr(MX + 1.6, MY + 0.3), el: caixa({ x: MX + 1.6, y: MY + 0.2, z: 0.55, w: 2.8, d: 0.06, h: 0.85, topo: "#0f172a", esq: "#1e293b", dir: "#020617" }) });
  add(planta(MX + 0.3, MY + R - 0.9, 0.9));
  // Copa: balcão com café, geladeira, banquetas, sofá e mesinha.
  add({ chave: "balcao", prof: pr(CX + 0.4, CYY + 1.1), el: (
    <g>
      {sombra(CX + 0.4, CYY + 0.25, 3.6, 0.85)}
      {caixa({ x: CX + 0.4, y: CYY + 0.25, w: 3.6, d: 0.85, h: 0.95, topo: "#f1f5f9", esq: "#8b6a4a", dir: "#6f5235" })}
      {caixa({ x: CX + 0.7, y: CYY + 0.35, z: 0.95, w: 0.5, d: 0.42, h: 0.55, topo: "#334155", esq: "#1f2937", dir: "#111827" })}
      {caneca(CX + 1.5, CYY + 0.65)}{caneca(CX + 2.9, CYY + 0.7, "#fecaca")}
      {(() => { const c = P(CX + 0.95, CYY + 0.55, 1.55); return <path className="esc-fumaca" d={`M${c.sx} ${c.sy} q-3 -6 0 -11 q3 -5 0 -10`} stroke="#cbd5e1" strokeWidth="1.8" fill="none" />; })()}
    </g>
  ) });
  add({ chave: "geladeira", prof: pr(CX + 4.3, CYY + 1.0), el: <g>{sombra(CX + 4.3, CYY + 0.25, 0.8, 0.75)}{caixa({ x: CX + 4.3, y: CYY + 0.25, w: 0.8, d: 0.75, h: 1.9, topo: "#f8fafc", esq: "#eef2f6", dir: "#cbd5e1" })}</g> });
  [1.1, 2.3, 3.4].forEach((x) => add(banqueta(CX + x, CYY + 1.75)));
  add(sofa(CX + 0.7, CYY + 3.5, 2.9, "#0f766e", "#115e59"), mesaRedonda(CX + 4.85, CYY + 3.7, 0.5, BRANCA, 0.95), banqueta(CX + 4.3, CYY + 3.75), banqueta(CX + 5.4, CYY + 3.75), planta(CX + R - 0.8, CYY + 0.3, 1));

  // Pessoas paradas no lugar (quem anda vai por cima, no fim)
  for (const p of geo.pessoas) {
    const l = geo.lugar.get(p.id);
    if (!l || andando[p.id] || l.tipo === "orbe") continue;
    const c = P(l.x, l.y, l.z);
    add({ chave: `p-${p.id}`, prof: pr(l.x, l.y) + 0.05, el: (
      <g transform={`translate(${c.sx} ${c.sy})`} onMouseEnter={() => setFoco(p.id)} onMouseLeave={() => setFoco((f) => (f === p.id ? null : f))}
        onClick={() => p.clicavel && onAbrir(p.id)} style={{ cursor: p.clicavel ? "pointer" : undefined }}>
        <g className={l.tipo === "mesa" && p.sinal === "trabalhando" ? "ea-digita" : undefined}>
          <Pessoa v={visualDe(p.nome)} sentado={l.z > 0} xicara={l.xicara} />
        </g>
        <Sinal sinal={p.sinal} />
        {noite && l.tipo === "mesa" && <text x="10" y="-60" fontSize="12" fill="#94a3b8" fontWeight="700">z z</text>}
      </g>
    ) });
  }
  itens.sort((a, b) => a.prof - b.prof);

  const pct = (v: number, t: number) => `${(v / t) * 100}%`;
  const etiqueta = (l: Lugar) => (l.tipo === "orbe" ? P(l.x, l.y + 1.1) : l.tipo === "mesa" ? P(l.x, l.y + 1.15) : P(l.x, l.y + 0.35));
  const entrada = P(G, G);
  const piso = (x0: number, y0: number, w: number, d: number) => pts(P(x0, y0), P(x0 + w, y0), P(x0 + w, y0 + d), P(x0, y0 + d));

  return (
    <div className="w-full overflow-hidden rounded-xl border border-black/10 bg-[radial-gradient(ellipse_at_50%_40%,#4a3a2e_0%,#2a211b_60%,#1a1411_100%)]">
      <div className="esc relative w-full" style={{ aspectRatio: `${LARG} / ${ALT}` }}>
        <svg viewBox={`0 0 ${LARG} ${ALT}`} className="absolute inset-0 h-full w-full select-none">
          <style>{ESTILO + ESTILO_ISO + ESTILO_SALAS}</style>
          <defs>
            <radialGradient id="orbe-brilho"><stop offset="0" stopColor="#67e8f9" stopOpacity=".75" /><stop offset=".55" stopColor="#22d3ee" stopOpacity=".25" /><stop offset="1" stopColor="#22d3ee" stopOpacity="0" /></radialGradient>
            <linearGradient id="orbe-feixe" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#22d3ee" stopOpacity=".55" /><stop offset="1" stopColor="#a5f3fc" stopOpacity=".1" /></linearGradient>
            <radialGradient id="sala-luz"><stop offset="0" stopColor="#ffe9c2" stopOpacity=".22" /><stop offset="1" stopColor="#ffe9c2" stopOpacity="0" /></radialGradient>
          </defs>
          {/* Laje */}
          <polygon points={pts(P(0, G), P(G, G), P(G, G, -0.35), P(0, G, -0.35))} fill="#24190f" />
          <polygon points={pts(P(G, 0), P(G, G), P(G, G, -0.35), P(G, 0, -0.35))} fill="#1b130c" />
          {/* Piso de madeira e o tapete de cada sala */}
          <polygon points={piso(0, 0, G, G)} fill="#5a4535" />
          {Array.from({ length: G * 2 }, (_, j) => <line key={`t${j}`} x1={P(0, j / 2).sx} y1={P(0, j / 2).sy} x2={P(G, j / 2).sx} y2={P(G, j / 2).sy} stroke="#4c3a2c" strokeWidth=".8" />)}
          {SALAS.map((s) => { const { x0, y0 } = origem(s); const c = P(x0 + R / 2, y0 + R / 2); return (
            <g key={`piso-${s.chave}`}>
              <ellipse cx={c.sx} cy={c.sy} rx={R * TW * 0.42} ry={R * TH * 0.42} fill="url(#sala-luz)" />
              <polygon points={piso(x0 + 0.7, y0 + 0.9, R - 1.4, R - 1.6)} fill={s.tapete} stroke={s.borda} strokeWidth="1.5" />
            </g>
          ); })}
          {/* Tudo com volume, do fundo para a frente */}
          {itens.map((i) => <g key={i.chave}>{i.el}</g>)}
          {Object.entries(andando).map(([id, a]) => {
            const p = geo.pessoas.find((q) => q.id === id);
            return p ? <Caminhante key={`${id}-${a.chave}`} a={a} v={visualDe(p.nome)} nome={p.nome} destino={geo.lugar.get(id)?.onde ?? ""} /> : null;
          })}
          <text x={entrada.sx} y={entrada.sy + 26} textAnchor="middle" fontSize="13" letterSpacing="4" fontWeight="700" fill="#a8927a">ENTRADA</text>
          {noite && <rect width={LARG} height={ALT} fill="#0b1026" opacity=".42" pointerEvents="none" />}
        </svg>

        {/* Placa de cada sala, no canto de cima (clica para abrir a esteira do setor) */}
        {SALAS.map((s) => {
          const setor = setorDaSala.get(s.chave);
          if (s.tipo && !setor) return null;
          const { x0, y0 } = origem(s); const c = P(x0 + 0.1, y0 + 0.1, PAREDE + 0.35);
          return (
            <button key={`pl-${s.chave}`} type="button" onClick={() => setor?.temEsteira && onAbrirSetor?.(setor.id)}
              className={cn("absolute z-10 flex -translate-x-1/2 -translate-y-full flex-col items-center rounded-lg border border-white/10 bg-[#171310]/90 px-2.5 py-1 text-white shadow-lg", setor?.temEsteira ? "hover:border-white/30" : "cursor-default")}
              style={{ left: pct(c.sx, LARG), top: pct(c.sy, ALT) }}>
              <span className="flex items-center gap-1.5 whitespace-nowrap text-[10.5px] font-semibold">
                <span className="h-2 w-2 rounded-full" style={{ background: setor?.corPlaca ?? (s.chave === "recepcao" ? "#22d3ee" : "#94a3b8") }} />{setor?.nome ?? s.rotulo}
              </span>
              {setor && setor.tarefas > 0 && <span className="text-[9px] font-semibold text-emerald-400">✓ {setor.tarefas}</span>}
            </button>
          );
        })}

        {/* Etiqueta com o nome embaixo de cada um; o balão (o que está fazendo) no hover ou quando precisa de você */}
        {geo.pessoas.map((p) => {
          const l = geo.lugar.get(p.id);
          if (!l || andando[p.id]) return null;
          const e = etiqueta(l), cabeca = P(l.x, l.y, l.z);
          const importante = p.sinal === "esperando" || p.sinal === "problema";
          const balao = (foco === p.id || importante) ? p.balao : null;
          return (
            <div key={`r-${p.id}`}>
              {balao && (
                <span className={cn("pointer-events-none absolute z-30 max-w-[16%] -translate-x-1/2 -translate-y-full rounded-lg border bg-white/95 px-1.5 py-0.5 text-center text-[10px] font-medium leading-tight text-slate-800 shadow-md",
                  p.sinal === "esperando" && "border-amber-400", p.sinal === "problema" && "border-rose-400")}
                  style={{ left: pct(cabeca.sx, LARG), top: pct(cabeca.sy - (l.tipo === "orbe" ? 50 : 76 * ESCALA), ALT) }}>{balao}</span>
              )}
              <button type="button" disabled={!p.clicavel} onClick={() => onAbrir(p.id)}
                onMouseEnter={() => setFoco(p.id)} onMouseLeave={() => setFoco((f) => (f === p.id ? null : f))} onFocus={() => setFoco(p.id)} onBlur={() => setFoco(null)}
                title={p.clicavel ? (p.ehIa ? `Conversar com ${p.nome}` : `Ver e adicionar tarefas de ${p.nome}`) : undefined}
                className={cn("absolute flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-md border border-white/10 px-1.5 py-px text-[9.5px] font-medium text-white shadow outline-none",
                  foco === p.id ? "z-30 bg-[#0f0c0a]" : "z-20 bg-[#171310]/85")}
                style={{ left: pct(e.sx, LARG), top: pct(e.sy, ALT) }}>
                <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", p.corSinal)} title={p.rotuloSinal} />{p.nome}
              </button>
            </div>
          );
        })}

        {/* Painel "Hoje" e a TV do Nosso resultado nos cantos */}
        <div className="absolute bottom-[3%] right-[2%] z-20 w-[19%] min-w-[150px] rounded-xl border border-white/10 bg-[#171310]/90 p-2 text-white shadow-xl">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-white/80">Hoje</p>
          {setores.map((s) => (
            <button key={s.id} type="button" onClick={() => s.temEsteira && onAbrirSetor?.(s.id)}
              className={cn("flex w-full items-center gap-1.5 py-[1px] text-left text-[10px]", s.temEsteira ? "hover:text-white" : "cursor-default text-white/85")}>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: s.corPlaca }} />
              <span className="min-w-0 flex-1 truncate">{s.nome}</span>
              <span className="tabular-nums text-white/70">{s.tarefas}</span>
            </button>
          ))}
        </div>
        {tv && <div className="absolute right-[2%] top-[3%] z-20 aspect-video w-[22%] min-w-[170px] overflow-hidden rounded-lg border border-white/10 shadow-xl">{tv}</div>}
      </div>
    </div>
  );
});

const ESTILO_SALAS = `
.orbe-anel{transform-box:fill-box;transform-origin:center;animation:orbe-gira 6s linear infinite}
@keyframes orbe-gira{to{transform:rotate(360deg)}}
.orbe{animation:orbe-pulsa 3s ease-in-out infinite alternate}
@keyframes orbe-pulsa{from{opacity:.9}to{opacity:1}}
`;

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
  const texto = `${nome} → ${destino}`, larg = texto.length * 6.6 + 18;
  return (
    <g className="ea-mover" style={{ transform: `translate(${pos.sx}px, ${pos.sy}px)`, ["--ea-dur" as string]: `${k === 0 ? 0 : durDe(k - 1)}s` }}>
      <g transform={`scale(${lado} 1)`}><Pessoa v={v} andando /></g>
      <rect x={-larg / 2} y="8" width={larg} height="17" rx="5" fill="#171310" opacity=".9" />
      <text y="20.5" textAnchor="middle" fontSize="11" fontWeight="600" fill="#fff">{texto}</text>
    </g>
  );
}
