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
// 22/10 (2ª rodada): "parecer um jogo de gerenciamento vivo, não uma maquete" — piso mais compacto (pessoas
// e móveis ~30% maiores), cada setor com a sua mobília, etiquetas só quando importam (o resto no hover).

// ---------------------------------------------------------------- projeção
const TW = 60, TH = 30, HZ = 38;          // largura/altura do ladrilho e altura de 1 unidade em z
const GX = 24, GY = 18;                   // tamanho do piso em ladrilhos
const PAREDE_Z = 3.3;
const OX = GY * TW / 2 + 30, OY = PAREDE_Z * HZ + 24;
const LARG = (GX + GY) * TW / 2 + 60, ALT = (GX + GY) * TH / 2 + OY + 34;
const P = (x: number, y: number, z = 0) => ({ sx: (x - y) * (TW / 2) + OX, sy: (x + y) * (TH / 2) - z * HZ + OY });
const pts = (...ps: { sx: number; sy: number }[]) => ps.map((p) => `${p.sx.toFixed(1)},${p.sy.toFixed(1)}`).join(" ");
const ESCALA = 0.95;                      // tamanho dos bonecos

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
function sombra(x: number, y: number, w: number, d: number, o = 0.16) {
  return <polygon points={pts(P(x - 0.1, y - 0.1), P(x + w + 0.25, y - 0.1), P(x + w + 0.25, y + d + 0.25), P(x - 0.1, y + d + 0.25))} fill="#000" opacity={o} />;
}
function elipsePiso(x: number, y: number, r: number, cor: string, z = 0, o = 1) {
  const c = P(x, y, z);
  return <ellipse cx={c.sx} cy={c.sy} rx={r * TW / Math.SQRT2 * 0.72} ry={r * TH / Math.SQRT2 * 0.72} fill={cor} opacity={o} />;
}

// Cada coisa do cenário vira um item com profundidade (x + y do canto da frente) para ordenar o desenho.
type Item = { prof: number; el: React.ReactNode; chave: string };

type Madeira = { topo: string; esq: string; dir: string; perna: string };
const CLARA: Madeira = { topo: "#e2c595", esq: "#c9a571", dir: "#b08f62", perna: "#5a4029" };
const ESCURA: Madeira = { topo: "#7a5536", esq: "#5e3f26", dir: "#4b311c", perna: "#2b1d12" };
const BRANCA: Madeira = { topo: "#f4f1ea", esq: "#dcd6cb", dir: "#c7c0b3", perna: "#64748b" };

function mesa(x: number, y: number, comp = 2, m: Madeira = CLARA, prof = 1): Item {
  return { chave: `mesa-${x}-${y}`, prof: x + comp + y + prof - 0.05, el: (
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
  return { chave: `cad-${x}-${y}`, prof: x + y + (frente ? 0.75 : 0.4), el: (
    <g>
      {elipsePiso(x + 0.4, y + 0.4, 0.4, "#000", 0, 0.14)}
      {caixa({ x: x + 0.36, y: y + 0.36, w: 0.08, d: 0.08, h: 0.38, topo: esc, esq: esc, dir: esc })}
      {caixa({ x: x + 0.15, y: y + 0.15, z: 0.38, w: 0.5, d: 0.5, h: 0.09, topo: cor, esq: esc, dir: "#0f172a" })}
      {caixa({ x: x + 0.15, y: frente ? y + 0.6 : y + 0.08, z: 0.47, w: 0.5, d: 0.1, h: 0.5, topo: cor, esq: cor, dir: esc })}
    </g>
  ) };
}
function pufe(x: number, y: number, cor = "#94a3b8"): Item {
  return { chave: `pufe-${x}-${y}`, prof: x + y + 0.5, el: <g>{elipsePiso(x, y, 0.35, "#000", 0, 0.14)}{caixa({ x: x - 0.25, y: y - 0.25, w: 0.5, d: 0.5, h: 0.42, topo: cor, esq: "#64748b", dir: "#475569" })}</g> };
}
function planta(x: number, y: number, s = 1): Item {
  const c = P(x + 0.3, y + 0.3, 0.5);
  return { chave: `pl-${x}-${y}`, prof: x + y + 0.7, el: (
    <g>
      {elipsePiso(x + 0.3, y + 0.3, 0.45, "#000", 0, 0.15)}
      {caixa({ x, y, w: 0.6, d: 0.6, h: 0.5, topo: "#57534e", esq: "#e7e5e4", dir: "#c8c2bd" })}
      <g transform={`translate(${c.sx} ${c.sy}) scale(${s})`}>
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
    { chave: `sofa-e-${x}-${y}`, prof: x + y + 0.2, el: <g>{sombra(x - 0.25, y, comp + 0.5, 1.1)}{caixa({ x, y, w: comp, d: 0.3, h: 1, topo: cor, esq: lateral, dir: lateral })}</g> },
    { chave: `sofa-a-${x}-${y}`, prof: x + comp + y + 1.1, el: (
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
  return { chave: `est-${x}-${y}`, prof: x + w + y + d, el: (
    <g>
      {sombra(x, y, w, d, 0.12)}
      {caixa({ x, y, w, d, h: alt, topo: "#6b4a2b", esq: eixo === "x" ? "#5b3d22" : "#4a3019", dir: eixo === "x" ? "#4a3019" : "#5b3d22" })}
      {livros}
    </g>
  ) };
}
function armario(x: number, y: number, w = 0.6, d = 1.2): Item {
  const gavetas = [0.2, 0.55, 0.9].map((z) => <polygon key={z} points={pts(P(x + w, y + 0.1, z), P(x + w, y + d - 0.1, z), P(x + w, y + d - 0.1, z + 0.28), P(x + w, y + 0.1, z + 0.28))} fill="#cbd5e1" stroke="#94a3b8" strokeWidth=".8" />);
  return { chave: `arm-${x}-${y}`, prof: x + w + y + d, el: <g>{sombra(x, y, w, d, 0.12)}{caixa({ x, y, w, d, h: 1.25, topo: "#e2e8f0", esq: "#cbd5e1", dir: "#b6c2d1" })}{gavetas}</g> };
}
function quadroBranco(x: number, y: number, comp = 2): Item {
  return { chave: `qb-${x}-${y}`, prof: x + y + 0.3, el: (
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
  return { chave: `mr-${x}-${y}`, prof: x + y + r * 0.9, el: (
    <g>
      {elipsePiso(x, y, r + 0.3, "#000", 0, 0.15)}
      {caixa({ x: x - 0.1, y: y - 0.1, w: 0.2, d: 0.2, h: alt, topo: m.perna, esq: m.perna, dir: m.perna })}
      {elipsePiso(x, y, r, m.dir, alt)}{elipsePiso(x, y, r, m.topo, alt + 0.06)}
    </g>
  ) };
}
function banqueta(x: number, y: number): Item {
  return { chave: `bq-${x}-${y}`, prof: x + y + 0.5, el: (
    <g>
      {elipsePiso(x, y, 0.3, "#000", 0, 0.14)}
      {caixa({ x: x - 0.04, y: y - 0.04, w: 0.08, d: 0.08, h: 0.7, topo: "#64748b", esq: "#475569", dir: "#334155" })}
      {elipsePiso(x, y, 0.32, "#1f2937", 0.72)}
    </g>
  ) };
}
function luminaria(x: number, y: number): Item {
  const t = P(x, y, 1.9);
  return { chave: `lum-${x}-${y}`, prof: x + y + 0.2, el: (
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
  return { chave: `sb-${x}-${y}`, prof: x + y + 0.2, el: (
    <g>
      {elipsePiso(x, y, 1.1, "#fff7ed", 0, 0.3)}
      <path d={`M${P(x, y).sx - 10} ${P(x, y).sy + 3} L${t.sx} ${t.sy} L${P(x, y).sx + 10} ${P(x, y).sy + 3}`} stroke="#1f2937" strokeWidth="2" fill="none" />
      <rect x={t.sx - 13} y={t.sy - 26} width="26" height="24" rx="3" fill="#f8fafc" stroke="#1f2937" strokeWidth="2.5" />
    </g>
  ) };
}
function fundoVerde(x: number, y: number, comp = 2.4): Item {
  return { chave: `fv-${x}`, prof: x + y + 0.3, el: <g>{caixa({ x, y, w: comp, d: 0.08, h: 2.3, topo: "#166534", esq: "#22c55e", dir: "#15803d" })}<polygon points={noChao(x, y + 0.08, comp, 1.4)} fill="#22c55e" opacity=".85" /></g> };
}
function tripe(x: number, y: number): Item {
  const b = P(x, y), t = P(x, y, 1.45);
  return { chave: `tr-${x}`, prof: x + y + 0.2, el: (
    <g>
      <path d={`M${b.sx - 12} ${b.sy + 4} L${t.sx} ${t.sy} L${b.sx + 12} ${b.sy + 4} M${t.sx} ${t.sy} L${b.sx} ${b.sy + 8}`} stroke="#1f2937" strokeWidth="2.5" fill="none" />
      {caixa({ x: x - 0.25, y: y - 0.15, z: 1.45, w: 0.5, d: 0.3, h: 0.3, topo: "#1e293b", esq: "#0f172a", dir: "#020617" })}
      {(() => { const l = P(x, y + 0.2, 1.6); return <circle cx={l.sx} cy={l.sy} r="4" fill="#38bdf8" stroke="#0f172a" strokeWidth="1.5" />; })()}
    </g>
  ) };
}
function caixasEquip(x: number, y: number): Item {
  return { chave: `cx-${x}`, prof: x + y + 1.2, el: <g>{sombra(x, y, 0.9, 0.6)}{caixa({ x, y, w: 0.9, d: 0.6, h: 0.45, topo: "#334155", esq: "#1f2937", dir: "#111827" })}{caixa({ x: x + 0.1, y: y + 0.05, z: 0.45, w: 0.7, d: 0.5, h: 0.35, topo: "#475569", esq: "#334155", dir: "#1e293b" })}</g> };
}
function bebedouro(x: number, y: number): Item {
  return { chave: `beb-${x}`, prof: x + y + 1, el: (
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
  return { chave: `vd-${x0}-${y0}-${x1}-${y1}`, prof: Math.max(x0, x1) + Math.max(y0, y1) + 0.01, el: (
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
  return { chave: `div-${x}-${y0}`, prof: x + 0.1 + y1, el: caixa({ x, y: y0, w: 0.1, d: y1 - y0, h: 0.95, topo: "#94a3b8", esq: "#cbd5e1", dir: "#e2e8f0" }) };
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
  if (sinal === "esperando") return <g transform="translate(18 -100)"><circle r="9" fill="#f59e0b" stroke="#fff" strokeWidth="2" /><text y="4.5" textAnchor="middle" fontSize="13" fontWeight="800" fill="#fff">!</text></g>;
  if (sinal === "problema") return <g transform="translate(18 -100)" className="animate-pulse"><circle r="9" fill="#ef4444" stroke="#fff" strokeWidth="2" /><text y="4.5" textAnchor="middle" fontSize="13" fontWeight="800" fill="#fff">!</text></g>;
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
// Três faixas (fundo, meio, frente) separadas por dois corredores (y ≈ 6,3 e 12,3) e duas passagens
// (x ≈ 8,15 e 14,5). Cada ambiente tem o seu tipo de estação.
type Pt = { x: number; y: number };
type TipoEstacao = "executiva" | "criativa" | "edicao" | "lab" | "atendimento";
interface Ambiente { chave: string; rotulo: string; estacoes: Pt[]; tipo: TipoEstacao; piso: [number, number, number, number]; tapete: string; borda: string }
const AMBIENTES: Ambiente[] = [
  { chave: "diretoria", rotulo: "Diretoria", tipo: "executiva", piso: [0.3, 0.3, 7.3, 5.1], tapete: "#c8b08a", borda: "#a88d63", estacoes: [{ x: 1.3, y: 2.5 }, { x: 4.5, y: 2.5 }] },
  { chave: "marketing", rotulo: "Marketing", tipo: "criativa", piso: [0.3, 7.2, 7.3, 4.4], tapete: "#c9ced6", borda: "#a7afbb",
    estacoes: [{ x: 0.7, y: 8.4 }, { x: 3.0, y: 8.4 }, { x: 5.3, y: 8.4 }, { x: 0.7, y: 10.45 }, { x: 3.0, y: 10.45 }, { x: 5.3, y: 10.45 }] },
  { chave: "audiovisual", rotulo: "Audiovisual", tipo: "edicao", piso: [15.0, 7.2, 8.8, 4.4], tapete: "#9aa3b2", borda: "#7d8798",
    estacoes: [{ x: 15.4, y: 8.4 }, { x: 17.9, y: 8.4 }, { x: 15.4, y: 10.45 }, { x: 17.9, y: 10.45 }] },
  { chave: "viral", rotulo: "Laboratório de Viral", tipo: "lab", piso: [0.3, 13.0, 7.3, 4.7], tapete: "#c3cfc6", borda: "#9fb0a4",
    estacoes: [{ x: 0.7, y: 14.2 }, { x: 3.0, y: 14.2 }, { x: 5.3, y: 14.2 }, { x: 0.7, y: 16.3 }, { x: 3.0, y: 16.3 }, { x: 5.3, y: 16.3 }] },
  { chave: "sucesso", rotulo: "Sucesso do Cliente", tipo: "atendimento", piso: [15.0, 13.0, 4.2, 4.7], tapete: "#d3c4b0", borda: "#b6a48c",
    estacoes: [{ x: 15.3, y: 14.2 }, { x: 17.3, y: 14.2 }, { x: 15.3, y: 16.3 }, { x: 17.3, y: 16.3 }] },
  { chave: "sales", rotulo: "Sales", tipo: "atendimento", piso: [19.5, 13.0, 4.3, 4.7], tapete: "#d3c4b0", borda: "#b6a48c",
    estacoes: [{ x: 19.7, y: 14.2 }, { x: 21.8, y: 14.2 }, { x: 19.7, y: 16.3 }, { x: 21.8, y: 16.3 }] },
];
const PALAVRAS: Record<string, RegExp> = {
  diretoria: /diretoria|dire[cç][aã]o|ceo|s[oó]cio/i, marketing: /marketing|mkt|grow|tr[aá]fego|conte[uú]do/i,
  audiovisual: /audiovisual|v[ií]deo|edi[cç][aã]o|est[uú]dio|design/i, viral: /viral|lab|roteiro|copy/i,
  sucesso: /sucesso|cliente|suporte|\bcs\b|atendimento/i, sales: /sales|venda|comercial|closer|sdr/i,
};
// Colaborativa: mesa comprida; quem sobra de um setor senta aqui.
const COLAB: Pt[] = [{ x: 9.3, y: 9.2 }, { x: 10.8, y: 9.2 }, { x: 12.3, y: 9.2 }];
const REUNIAO = { x: 11.25, y: 15.3 };
// Lugares em volta da mesa de reunião (sentados); os do fundo têm cadeira, os da frente pufe.
const VAGAS_REUNIAO: (Pt & { cadeira: boolean })[] = [
  { x: 10.5, y: 14.15, cadeira: true }, { x: 12.0, y: 14.15, cadeira: true }, { x: 9.75, y: 15.35, cadeira: false },
  { x: 12.75, y: 15.35, cadeira: false }, { x: 10.6, y: 16.5, cadeira: false }, { x: 11.9, y: 16.5, cadeira: false },
];
type Vaga = Pt & { onde: string; z: number; xicara?: boolean };
const VAGAS_LIVRE: Vaga[] = [
  { x: 16.3, y: 1.75, onde: "Copa", z: 0.72, xicara: true }, { x: 17.5, y: 1.75, onde: "Copa", z: 0.72, xicara: true },
  { x: 9.9, y: 3.4, onde: "Descanso", z: 0.3 }, { x: 11.1, y: 3.4, onde: "Descanso", z: 0.3 },
  { x: 16.9, y: 4.2, onde: "Copa", z: 0.72, xicara: true }, { x: 20.7, y: 3.8, onde: "Copa", z: 0.72, xicara: true },
  { x: 12.3, y: 3.4, onde: "Descanso", z: 0.3 }, { x: 18.7, y: 1.75, onde: "Copa", z: 0.72, xicara: true },
  { x: 18.6, y: 4.2, onde: "Copa", z: 0.72, xicara: true }, { x: 22.3, y: 3.8, onde: "Copa", z: 0.72, xicara: true },
];
const CORREDOR_Y = [6.3, 12.3];
const PASSAGEM_X = [8.15, 14.5];
const VEL = 2.0;   // ladrilhos por segundo

const ehRobo = (p: PessoaNaSala) => p.ehIa && ehNomeCoordenador(p.nome);
const ehNoite = () => { const h = new Date().getHours(); return h >= 22 || h < 7; };
const ehDavi = (p: PessoaNaSala) => !p.ehIa && /^davi\b/i.test(p.nome);
const somaId = (id: string) => [...id].reduce((t, c) => t + c.charCodeAt(0), 0);

type Lugar = { tipo: "mesa" | "pe"; x: number; y: number; z: number; onde: string; amb?: string; est?: number; xicara?: boolean };
// Onde a pessoa senta numa estação: na cadeira, atrás do meio da mesa.
const lugarNaMesa = (e: Pt, comp = 2): Pt => ({ x: e.x + comp / 2, y: e.y - 0.3 });

export const EscritorioIso = memo(function EscritorioIso({ setores, onAbrir, forcarNoite, tv, onAbrirSetor }: {
  setores: SetorNoEscritorio[]; onAbrir: (id: string) => void; forcarNoite?: boolean; tv?: React.ReactNode; onAbrirSetor?: (id: string) => void;
}) {
  const [noiteAgora, setNoite] = useState(ehNoite);
  const noite = forcarNoite ?? noiteAgora;
  const [foco, setFoco] = useState<string | null>(null);
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
        if (est >= 0) {
          usadas.add(est); ocupadas.set(a.chave, usadas);
          const q = lugarNaMesa(a.estacoes[est], a.tipo === "executiva" ? 2.3 : 2);
          lugar.set(p.id, { tipo: "mesa", ...q, z: 0.4, amb: a.chave, est, onde: nomeDe(setorId) || a.rotulo }); return;
        }
      }
      const k = COLAB.findIndex((_, i) => !colab.has(i));
      if (k >= 0) { colab.add(k); lugar.set(p.id, { tipo: "mesa", x: COLAB[k].x + 0.4, y: COLAB[k].y - 0.3, z: 0.4, amb: "colab", est: k, onde: "Área colaborativa" }); }
    };
    const trabalhando = pessoas.filter(({ p }) => {
      if (!noite && (p.conversando || (alguemConversando && ehDavi(p)))) { reuniao.push(p); return false; }
      if (noite || ehRobo(p) || p.sinal !== "parado") return true;
      livres.push(p); return false;
    });
    const zonaDe = (p: PessoaNaSala, setor: string) => (!noite && p.setorTarefa && ambDoSetor.has(p.setorTarefa) ? p.setorTarefa : setor);
    for (const { p, setor } of trabalhando.filter(({ p, setor }) => zonaDe(p, setor) === setor)) sentar(p, setor, setor);
    for (const { p, setor } of trabalhando.filter(({ p, setor }) => zonaDe(p, setor) !== setor)) sentar(p, zonaDe(p, setor), setor);
    reuniao.forEach((p, k) => { const v = VAGAS_REUNIAO[k % VAGAS_REUNIAO.length]; lugar.set(p.id, { tipo: "pe", x: v.x, y: v.y, z: v.cadeira ? 0.4 : 0.38, onde: "Reunião", est: k }); });
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
    for (const [id, k] of vagaNova) { const v = VAGAS_LIVRE[k]; lugar.set(id, { tipo: "pe", x: v.x, y: v.y, z: v.z, onde: v.onde, xicara: v.xicara }); }
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
        // Sai da mesa para o corredor; de longe, vai pela passagem mais próxima.
        const ate = (q: Pt): Pt[] => {
          if (Math.abs(q.y - yc) < 4) return [{ x: q.x, y: yc }];
          const xp = PASSAGEM_X.reduce((m, x) => (Math.abs(x - q.x) < Math.abs(m - q.x) ? x : m), PASSAGEM_X[0]);
          const sai = q.y + (yc > q.y ? 0.7 : -0.7);
          return [{ x: q.x, y: sai }, { x: xp, y: sai }, { x: xp, y: yc }];
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

  // Diretoria: executiva — madeira escura, estante, armário, poltronas e luminária.
  add(estante(0.4, 0.3, 2.6), armario(0.3, 3.4), luminaria(7.1, 0.9), planta(6.8, 4.5, 1.1), planta(0.4, 0.4 + 2.7, 0.9));
  add(vidro(7.7, 0.2, 7.7, 5.5), vidro(0.2, 5.5, 3.0, 5.5), vidro(4.3, 5.5, 7.7, 5.5));
  // Descanso: sofá, mesa de centro, poltrona, tapete, plantas e luminária (de frente para a TV da parede).
  add(sofa(9.4, 2.6, 3.4, "#475569", "#334155"), sofa(13.1, 3.6, 0.6, "#b45309", "#92400e"), planta(8.6, 0.4, 1.1), planta(13.6, 0.4, 1.1), luminaria(8.8, 4.6));
  add({ chave: "mesa-centro", prof: 9.9 + 2.4 + 4.3 + 0.7, el: <g>{sombra(9.9, 4.3, 2.4, 0.7, 0.12)}{caixa({ x: 9.9, y: 4.3, w: 2.4, d: 0.7, h: 0.35, topo: "#7a5536", esq: "#5e3f26", dir: "#4b311c" })}{caneca(10.3, 4.5, "#fde68a")}{papeis(11.3, 4.45)}</g> });
  // Copa: balcão com café e pia, geladeira, bebedouro, banquetas e mesinhas.
  add({ chave: "balcao", prof: 15.4 + 4.4 + 1, el: (
    <g>
      {sombra(15.4, 0.3, 4.4, 1)}
      {caixa({ x: 15.4, y: 0.3, w: 4.4, d: 0.9, h: 0.95, topo: "#f1f5f9", esq: "#8b6a4a", dir: "#6f5235" })}
      {caixa({ x: 15.8, y: 0.4, z: 0.95, w: 0.5, d: 0.45, h: 0.6, topo: "#334155", esq: "#1f2937", dir: "#111827" })}
      {caixa({ x: 17.0, y: 0.45, z: 0.95, w: 0.9, d: 0.5, h: 0.05, topo: "#94a3b8", esq: "#64748b", dir: "#475569" })}
      {caixa({ x: 18.4, y: 0.4, z: 0.95, w: 0.6, d: 0.35, h: 0.2, topo: "#a16207", esq: "#854d0e", dir: "#713f12" })}
      {caneca(16.5, 0.7)}{caneca(18.2, 0.8, "#fecaca")}
      {(() => { const c = P(16.05, 0.6, 1.6); return <path className="esc-fumaca" d={`M${c.sx} ${c.sy} q-3 -6 0 -11 q3 -5 0 -10`} stroke="#cbd5e1" strokeWidth="1.8" fill="none" />; })()}
    </g>
  ) });
  add({ chave: "geladeira", prof: 20.1 + 0.9 + 0.3 + 0.8, el: <g>{sombra(20.1, 0.3, 0.9, 0.8)}{caixa({ x: 20.1, y: 0.3, w: 0.9, d: 0.8, h: 2.1, topo: "#f8fafc", esq: "#e2e8f0", dir: "#cbd5e1" })}</g> });
  add(bebedouro(21.3, 0.45), planta(23.2, 0.4, 1.1), planta(23.2, 4.7), planta(15.1, 4.7, 0.9));
  [16.3, 17.5, 18.7].forEach((x) => add(banqueta(x, 1.75)));
  add(mesaRedonda(17.75, 4.2, 0.55, BRANCA, 0.95), banqueta(16.9, 4.2), banqueta(18.6, 4.2));
  add(mesaRedonda(21.5, 3.8, 0.55, BRANCA, 0.95), banqueta(20.7, 3.8), banqueta(22.3, 3.8));

  // Marketing: estações criativas + quadro de ideias na parede (desenhado com a parede).
  add(planta(7.2, 7.25, 0.9), planta(7.2, 11.0, 0.9));
  // Colaborativa: mesa grande, cadeiras dos dois lados e quadro branco.
  add(mesa(9.1, 9.2, 4.6, CLARA, 1.2), quadroBranco(9.4, 7.3, 2.4), planta(12.9, 7.3), planta(13.4, 11.0, 0.9));
  COLAB.forEach((e) => add(cadeira(e.x, e.y - 0.75, "#64748b")));
  [9.3, 10.8, 12.3].forEach((x) => add(cadeira(x, 10.45, "#64748b", true)));
  // Audiovisual: fundo verde, câmera no tripé, softbox e cases de equipamento.
  add(fundoVerde(20.6, 7.35, 2.6), tripe(21.9, 10.6), softbox(20.4, 9.9), softbox(23.4, 9.7), caixasEquip(22.7, 11.0), planta(14.95 + 5.1, 11.0, 0.8));
  // Laboratório: estante com referências e planta.
  add(planta(7.2, 13.1, 0.9), planta(7.2, 17.2, 0.9));
  // Reunião (vidro): mesa redonda, cadeiras/pufes em volta, tela.
  add(mesaRedonda(REUNIAO.x, REUNIAO.y, 1.05, ESCURA), vidro(8.7, 13.0, 8.7, 17.8), vidro(13.8, 13.0, 13.8, 17.8), vidro(8.7, 13.0, 10.6, 13.0), vidro(11.8, 13.0, 13.8, 13.0));
  VAGAS_REUNIAO.forEach((v) => add(v.cadeira ? cadeira(v.x - 0.4, v.y - 0.4, "#475569") : pufe(v.x, v.y + 0.05, "#94a3b8")));
  add(planta(13.2, 17.1, 0.8), planta(8.9, 17.1, 0.8));
  // Sucesso / Sales: estações de atendimento separadas por divisória baixa.
  add(divisoria(19.3, 13.3, 17.6), planta(14.75, 17.2, 0.8), planta(23.3, 12.8, 0.8));

  // Estações (mesa + cadeira + o que é de cada setor) e quem está sentado.
  for (const a of AMBIENTES) {
    a.estacoes.forEach((e, k) => {
      const quem = ocupante(a.chave, k);
      const ligado = !!quem && quem.sinal !== "parado";
      const comp = a.tipo === "executiva" ? 2.3 : 2;
      const m = a.tipo === "executiva" ? ESCURA : a.tipo === "edicao" || a.tipo === "lab" ? BRANCA : CLARA;
      const base = mesa(e.x, e.y, comp, m);
      const cad = a.tipo === "executiva" ? "#3f2a1d" : a.tipo === "edicao" ? "#111827" : "#334155";
      add(cadeira(e.x + comp / 2 - 0.4, e.y - 0.7, cad));
      // Objetos de cima da mesa entram junto com ela (na frente de quem está sentado).
      add({ ...base, el: (
        <g>
          {base.el}
          {a.tipo === "edicao" ? <>{monitor(e.x + 0.15, e.y + 0.05, 0.85, ligado)}{monitor(e.x + 1.05, e.y + 0.05, 0.85, ligado)}</>
            : a.tipo === "lab" ? <>{monitor(e.x + 0.6, e.y + 0.05, 0.8, ligado)}{papeis(e.x + 1.45, e.y + 0.5)}</>
            : <>{notebook(e.x + comp / 2 - 0.3, e.y + 0.15, ligado)}{k % 3 === 0 ? caneca(e.x + comp - 0.35, e.y + 0.55) : k % 3 === 1 ? papeis(e.x + 0.15, e.y + 0.45) : vasinho(e.x + comp - 0.35, e.y + 0.3)}</>}
          {a.tipo === "atendimento" && headset(e.x + 0.35, e.y + 0.55)}
          {a.tipo === "executiva" && <>{papeis(e.x + 0.2, e.y + 0.45)}{caneca(e.x + comp - 0.35, e.y + 0.5)}</>}
          {a.tipo === "edicao" && caneca(e.x + 1.8, e.y + 0.7)}
        </g>
      ) });
    });
  }
  COLAB.forEach((e, k) => { if (ocupante("colab", k)) add({ chave: `nb-colab-${k}`, prof: 9.1 + 4.6 + 9.2 + 1.2, el: notebook(e.x + 0.1, e.y + 0.2, true) }); });

  // Pessoas paradas no lugar (as que estão andando vão por cima, no fim)
  for (const p of geo.pessoas) {
    const l = geo.lugar.get(p.id);
    if (!l || andando[p.id]) continue;
    const c = P(l.x, l.y, l.z);
    const v = visualDe(p.nome);
    add({ chave: `p-${p.id}`, prof: l.x + l.y + 0.35, el: (
      <g transform={`translate(${c.sx} ${c.sy})`} onMouseEnter={() => setFoco(p.id)} onMouseLeave={() => setFoco((f) => (f === p.id ? null : f))}
        onClick={() => p.clicavel && onAbrir(p.id)} style={{ cursor: p.clicavel ? "pointer" : undefined }}>
        <g className={l.tipo === "mesa" && p.sinal === "trabalhando" ? "ea-digita" : undefined}>
          {ehRobo(p) ? <Robo /> : <Pessoa v={v} sentado={l.z > 0} xicara={l.xicara} />}
        </g>
        <Sinal sinal={p.sinal} />
        {noite && l.tipo === "mesa" && <text x="14" y="-70" fontSize="13" fill="#94a3b8" fontWeight="700">z z</text>}
      </g>
    ) });
  }
  itens.sort((a, b) => a.prof - b.prof);

  // TV na parede (y = 0): a tela é HTML inclinado no plano da parede.
  const TV_X = 8.95, TV_W = 5.2, TV_Z0 = 1.0, TV_H = 2.05;
  const tvA = P(TV_X, 0, TV_Z0 + TV_H), tvLarg = TV_W * TW / 2, tvAlt = TV_H * HZ;
  const pct = (v: number, t: number) => `${(v / t) * 100}%`;
  const notas = (lista: [string, number, number][], eixo: "x" | "y") => lista.map(([c, a, z], k) => (
    <polygon key={k} points={eixo === "x" ? naParedeX(a, z, 0.42, 0.34) : naParedeY(a, z, 0.42, 0.34)} fill={c} />
  ));

  return (
    <div className="w-full overflow-x-auto overscroll-x-contain rounded-xl">
      <div className="esc relative min-w-[880px] overflow-hidden rounded-xl border border-black/10 bg-[radial-gradient(ellipse_at_50%_30%,#3b4a63_0%,#1e293b_55%,#0f172a_100%)]" style={{ aspectRatio: `${LARG} / ${ALT}` }}>
        <svg viewBox={`0 0 ${LARG} ${ALT}`} className="absolute inset-0 h-full w-full">
          <style>{ESTILO + ESTILO_ISO}</style>
          <defs>
            <radialGradient id="iso-luz"><stop offset="0" stopColor="#fff4d6" stopOpacity=".6" /><stop offset="1" stopColor="#fff4d6" stopOpacity="0" /></radialGradient>
            <linearGradient id="iso-ceu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#60a5fa" /><stop offset=".7" stopColor="#bfdbfe" /><stop offset="1" stopColor="#e0f2fe" /></linearGradient>
            <linearGradient id="iso-fundo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".18" /><stop offset="1" stopColor="#000" stopOpacity=".14" /></linearGradient>
            <linearGradient id="iso-parede" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f5efe6" /><stop offset="1" stopColor="#e4dbcd" /></linearGradient>
            <clipPath id="iso-piso"><polygon points={noChao(0, 0, GX, GY)} /></clipPath>
          </defs>
          {/* Laje */}
          <polygon points={pts(P(0, GY), P(GX, GY), P(GX, GY, -0.45), P(0, GY, -0.45))} fill="#7a5c3c" />
          <polygon points={pts(P(GX, 0), P(GX, GY), P(GX, GY, -0.45), P(GX, 0, -0.45))} fill="#5f472e" />
          {/* Paredes do fundo (esquerda: x = 0; direita: y = 0), rodapé e topo */}
          <polygon points={pts(P(0, 0), P(0, GY), P(0, GY, PAREDE_Z), P(0, 0, PAREDE_Z))} fill="url(#iso-parede)" />
          <polygon points={pts(P(0, 0), P(0, GY), P(0, GY, PAREDE_Z), P(0, 0, PAREDE_Z))} fill="#000" opacity=".06" />
          <polygon points={pts(P(0, 0), P(GX, 0), P(GX, 0, PAREDE_Z), P(0, 0, PAREDE_Z))} fill="url(#iso-parede)" />
          <polygon points={naParedeX(0, 0, GY, 0.14)} fill="#8b6a4a" /><polygon points={naParedeY(0, 0, GX, 0.14)} fill="#8b6a4a" />
          <polygon points={pts(P(0, 0, PAREDE_Z), P(GX, 0, PAREDE_Z), P(GX, -0.3, PAREDE_Z), P(-0.3, -0.3, PAREDE_Z), P(-0.3, GY, PAREDE_Z), P(0, GY, PAREDE_Z))} fill="#cbbfae" />
          {/* Janelas com céu */}
          {[[3.2, 3.2], [15.6, 2.4], [21.9, 1.8]].map(([x, w]) => <g key={`jd${x}`}><polygon points={naParedeY(x, 1.15, w, 1.85)} fill="url(#iso-ceu)" stroke="#475569" strokeWidth="3" /><polygon points={naParedeY(x + w / 2 - 0.03, 1.15, 0.06, 1.85)} fill="#475569" /></g>)}
          {[[0.7, 2.4]].map(([y, w]) => <g key={`je${y}`}><polygon points={naParedeX(y, 1.15, w, 1.85)} fill="url(#iso-ceu)" stroke="#475569" strokeWidth="3" /><polygon points={naParedeX(y + w / 2 - 0.03, 1.15, 0.06, 1.85)} fill="#475569" /></g>)}
          {/* Quadro de ideias (Marketing) e de experimentos (Laboratório) na parede da esquerda */}
          <polygon points={naParedeX(7.9, 1.0, 3.2, 1.6)} fill="#fafaf9" stroke="#78716c" strokeWidth="3" />
          {usado("marketing") && notas([["#fde047", 8.2, 2.2], ["#f9a8d4", 8.75, 2.25], ["#86efac", 9.3, 2.15], ["#93c5fd", 9.85, 2.2], ["#fdba74", 10.4, 2.25], ["#fde047", 8.5, 1.65], ["#c4b5fd", 9.1, 1.6], ["#86efac", 9.7, 1.7], ["#f9a8d4", 10.3, 1.6]], "x")}
          <polygon points={naParedeX(13.4, 1.0, 3.6, 1.6)} fill="#0f172a" stroke="#334155" strokeWidth="3" />
          {usado("viral") && <>
            <polyline points={pts(P(0.03, 13.7, 1.3), P(0.03, 14.4, 1.5), P(0.03, 15.0, 1.4), P(0.03, 15.7, 2.1), P(0.03, 16.6, 2.4))} stroke="#34d399" strokeWidth="2.5" fill="none" />
            {[13.8, 14.3, 14.8, 15.3, 15.8, 16.3].map((y, k) => <polygon key={y} points={naParedeX(y, 1.15, 0.3, 0.15 + ((k * 7) % 5) * 0.12)} fill={k % 2 ? "#38bdf8" : "#a78bfa"} opacity=".9" />)}
          </>}
          {/* Relógio no corredor e quadro na Diretoria */}
          {(() => { const c = P(0.03, 12.3, 2.45); return <g transform={`matrix(0.894 -0.447 0 1 ${c.sx} ${c.sy})`}><circle r="15" fill="#fff" stroke="#334155" strokeWidth="3" /><path d="M0 0 V-9 M0 0 H7" stroke="#0f172a" strokeWidth="2.2" strokeLinecap="round" /></g>; })()}
          <polygon points={naParedeX(3.6, 1.6, 1.6, 1.0)} fill="#d6c4a5" stroke="#6b4a2b" strokeWidth="3" />
          <polygon points={naParedeX(3.8, 1.75, 1.2, 0.7)} fill="#7c9cbf" opacity=".8" />
          {/* Piso de madeira em tábuas, corredores e tapetes dos ambientes */}
          <polygon points={noChao(0, 0, GX, GY)} fill="#e6cfa3" />
          {Array.from({ length: GY * 2 }, (_, j) => <line key={`ly${j}`} x1={P(0, j / 2).sx} y1={P(0, j / 2).sy} x2={P(GX, j / 2).sx} y2={P(GX, j / 2).sy} stroke="#d2b585" strokeWidth=".7" />)}
          {Array.from({ length: GY * 2 }, (_, j) => { const x = ((j * 7) % 11) * 2.2 + 0.6; return <line key={`jt${j}`} x1={P(x, j / 2).sx} y1={P(x, j / 2).sy} x2={P(x, j / 2 + 0.5).sx} y2={P(x, j / 2 + 0.5).sy} stroke="#d2b585" strokeWidth=".7" />; })}
          {CORREDOR_Y.map((y) => <polygon key={`c${y}`} points={noChao(0, y - 0.75, GX, 1.5)} fill="#f2e2c2" opacity=".55" />)}
          {AMBIENTES.map((a) => { const [x, y, w, d] = a.piso; return <polygon key={`pz${a.chave}`} points={noChao(x + 0.15, y + 0.15, w - 0.3, d - 0.3)} fill={a.tapete} stroke={a.borda} strokeWidth="3" opacity=".8" />; })}
          <polygon points={noChao(9.0, 2.0, 5.0, 3.4)} fill="#a8b4c4" stroke="#8795a8" strokeWidth="3" opacity=".75" />
          <polygon points={noChao(8.9, 7.3, 5.1, 4.2)} fill="#d8cdbb" stroke="#bcae96" strokeWidth="3" opacity=".6" />
          <polygon points={noChao(8.7, 13.0, 5.1, 4.8)} fill="#cbd5e1" opacity=".75" />
          <polygon points={noChao(15.2, 0.3, 8.5, 5.1)} fill="#ece7df" opacity=".85" />
          {Array.from({ length: 8 }, (_, i) => <line key={`cp${i}`} x1={P(15.2 + i * 1.06, 0.3).sx} y1={P(15.2 + i * 1.06, 0.3).sy} x2={P(15.2 + i * 1.06, 5.4).sx} y2={P(15.2 + i * 1.06, 5.4).sy} stroke="#d8d0c3" strokeWidth=".8" />)}
          <polygon points={noChao(0, 0, GX, GY)} fill="url(#iso-fundo)" />
          {/* Luz que entra pelas janelas e das luminárias */}
          <g clipPath="url(#iso-piso)">{[[4.5, 2.5, 150], [17.5, 2.5, 150], [3, 9, 130], [19, 9, 140], [11.5, 9.5, 150], [3.5, 15, 130], [19, 15, 140], [11, 15, 120]].map(([x, y, r], k) => { const c = P(x, y); return <ellipse key={k} cx={c.sx} cy={c.sy} rx={r * 1.6} ry={r * 0.8} fill="url(#iso-luz)" />; })}</g>
          {/* TV ("Nosso resultado") na parede: moldura e aparador */}
          <polygon points={naParedeY(TV_X - 0.15, TV_Z0 - 0.12, TV_W + 0.3, TV_H + 0.24)} fill="#0b1220" stroke="#1e293b" strokeWidth="3" />
          {caixa({ x: TV_X + 0.4, y: 0.1, w: TV_W - 0.8, d: 0.45, h: 0.45, topo: "#7a5536", esq: "#5e3f26", dir: "#4b311c" })}
          {/* Tudo com volume, do fundo para a frente */}
          {itens.map((i) => <g key={i.chave}>{i.el}</g>)}
          {/* Quem está andando (por cima, pelos corredores) */}
          {Object.entries(andando).map(([id, a]) => {
            const p = geo.pessoas.find((q) => q.id === id);
            return p ? <Caminhante key={`${id}-${a.chave}`} a={a} v={visualDe(p.nome)} nome={p.nome} destino={geo.lugar.get(id)?.onde ?? ""} /> : null;
          })}
          {/* Noite: escritório na penumbra, só as luminárias acesas */}
          {noite && <polygon points={pts(P(-0.3, -0.3, PAREDE_Z), P(GX, -0.3, PAREDE_Z), P(GX, 0), P(GX, GY, -0.45), P(0, GY, -0.45), P(-0.3, GY, PAREDE_Z))} fill="#0b1026" opacity=".42" pointerEvents="none" />}
        </svg>

        {/* Tela da TV inclinada no plano da parede */}
        {tv && (
          <div className="absolute origin-top-left overflow-hidden rounded-[2px]" style={{ left: pct(tvA.sx, LARG), top: pct(tvA.sy, ALT), width: pct(tvLarg, LARG), height: pct(tvAlt, ALT), transform: "skewY(26.565deg)" }}>{tv}</div>
        )}

        {/* Nome do setor: discreto, no fundo do ambiente (clica para abrir a esteira, quando tem) */}
        {geo.ambientes.map(({ a, s }) => { const c = P(a.piso[0] + 0.55, a.piso[1] + 0.55, 0); return (
          <button key={s.id} type="button" onClick={() => s.temEsteira && onAbrirSetor?.(s.id)}
            className={cn("absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-white/75 px-2 py-0.5 text-slate-700 shadow-sm ring-1 ring-black/5 backdrop-blur-sm",
              s.temEsteira ? "hover:bg-white" : "cursor-default")}
            style={{ left: pct(c.sx, LARG), top: pct(c.sy, ALT) }} title={s.tarefas > 0 ? `${s.tarefas} tarefa(s)` : undefined}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.corPlaca }} />
            <span className="text-[9.5px] font-semibold uppercase tracking-wider">{s.nome}</span>
          </button>
        ); })}
        {[{ p: P(16.0, 2.6, 0), t: "Copa" }, { p: P(9.4, 13.55, 0), t: "Reunião" }, { p: P(9.5, 7.85, 0), t: "Colaborativa" }, { p: P(10.4, 1.25, 0), t: "Descanso" }].map(({ p, t }) => (
          <span key={t} className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-white/55 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-600"
            style={{ left: pct(p.sx, LARG), top: pct(p.sy, ALT) }}>{t}</span>
        ))}

        {/* Nome de cada um; o balão (o que está fazendo) só no hover ou quando precisa de você */}
        {geo.pessoas.map((p) => {
          const l = geo.lugar.get(p.id);
          if (!l || andando[p.id]) return null;   // andando: o nome vai junto, desenhado no Caminhante
          const c = P(l.x, l.y, l.z);
          const importante = p.sinal === "esperando" || p.sinal === "problema";
          const balao = (foco === p.id || importante) ? p.balao : null;
          return (
            <button key={`r-${p.id}`} type="button" disabled={!p.clicavel} onClick={() => onAbrir(p.id)}
              onMouseEnter={() => setFoco(p.id)} onMouseLeave={() => setFoco((f) => (f === p.id ? null : f))} onFocus={() => setFoco(p.id)} onBlur={() => setFoco(null)}
              title={p.clicavel ? (p.ehIa ? `Conversar com ${p.nome}` : `Ver e adicionar tarefas de ${p.nome}`) : undefined}
              className={cn("absolute flex -translate-x-1/2 -translate-y-full flex-col items-center gap-0.5 rounded-lg outline-none", foco === p.id ? "z-30" : importante ? "z-20" : "z-10")}
              style={{ left: pct(c.sx, LARG), top: pct(c.sy - 100 * ESCALA, ALT), maxWidth: "13%" }}>
              {balao && (
                <span className={cn("line-clamp-2 max-w-full rounded-lg border bg-white/95 px-1.5 py-0.5 text-center text-[10px] font-medium leading-tight text-slate-800 shadow-md animate-in fade-in-0 zoom-in-95 duration-150",
                  p.sinal === "esperando" && "border-amber-400", p.sinal === "problema" && "border-rose-400")}>{balao}</span>
              )}
              <span className={cn("flex max-w-full items-center gap-1 rounded-full px-1.5 py-px text-[9.5px] font-semibold shadow-sm transition-colors",
                foco === p.id ? "bg-slate-900 text-white" : "bg-slate-900/70 text-white/95")}>
                <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", p.corSinal)} title={p.rotuloSinal} />
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
  const largNome = nome.length * 8.4 + 22, texto = `→ ${destino}`, largDest = texto.length * 7 + 16;
  return (
    <g className="ea-mover" style={{ transform: `translate(${pos.sx}px, ${pos.sy}px)`, ["--ea-dur" as string]: `${k === 0 ? 0 : durDe(k - 1)}s` }}>
      <g transform={`scale(${lado} 1)`}><Pessoa v={v} andando /></g>
      <g transform={`translate(0 ${-100 * ESCALA - 6})`}>
        <rect x={-largDest / 2} y="-42" width={largDest} height="19" rx="9.5" fill="#e0f2fe" stroke="#7dd3fc" />
        <text y="-28.5" textAnchor="middle" fontSize="12" fontStyle="italic" fill="#0c4a6e">{texto}</text>
        <rect x={-largNome / 2} y="-20" width={largNome} height="20" rx="10" fill="#0f172a" opacity=".85" />
        <text y="-6" textAnchor="middle" fontSize="12.5" fontWeight="600" fill="#fff">{nome}</text>
      </g>
    </g>
  );
}
