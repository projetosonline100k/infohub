import { memo, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { Sinal } from "@/lib/empresa/visaoGeral";
import { BonecoMesa, ESTILO, cabeloDe, cabeloTras, visualDe, type Visual } from "./BonecoMesa";

// Mapa da operação: cada setor é uma sala de escritório (pedido do Davi, no
// estilo da imagem do briefing). Cada pessoa tem a mesa dela:
//   trabalhando / precisa de você / problema → sentada na mesa (BonecoMesa);
//   sem nada pra fazer → levanta, anda até o café, toma um gole e volta
//   (à noite, das 22h às 7h, dorme na mesa).
// Tudo em SVG + CSS; as posições do passeio vêm de variáveis CSS por pessoa.

export interface PessoaNaSala {
  id: string; nome: string; ehIa: boolean; sinal: Sinal; corSinal: string; rotuloSinal: string;
  balao: string | null; tarefas: number; atrasadas: number; clicavel: boolean;
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
const ESTILO_SALA = `
.esc-passeio{animation:esc-passeio var(--dur) linear infinite;animation-delay:var(--atraso)}
@keyframes esc-passeio{0%,6%{transform:translateX(var(--de))}30%,60%{transform:translateX(var(--cafe))}84%,100%{transform:translateX(var(--de))}}
.esc-vira{animation:esc-vira var(--dur) step-end infinite;animation-delay:var(--atraso)}
@keyframes esc-vira{0%{transform:scaleX(var(--ida))}60%{transform:scaleX(calc(var(--ida) * -1))}84%{transform:scaleX(var(--ida))}}
.esc-gingado{animation:esc-gingado var(--dur) linear infinite;animation-delay:var(--atraso)}
@keyframes esc-gingado{${Array.from({ length: 41 }, (_, k) => k * 2.5).map((p) => `${p}%{transform:translateY(${(p > 6 && p < 30) || (p > 60 && p < 84) ? (passoPar(p) ? -1.4 : 0) : 0}px)}`).join("")}}
.esc-perna-e{transform-origin:50% 0;animation:esc-perna-e var(--dur) linear infinite;animation-delay:var(--atraso)}
.esc-perna-d{transform-origin:50% 0;animation:esc-perna-d var(--dur) linear infinite;animation-delay:var(--atraso)}
@keyframes esc-perna-e{${quadrosPernas(1)}}
@keyframes esc-perna-d{${quadrosPernas(-1)}}
.esc-braco{transform-origin:50% 8%;animation:esc-braco var(--dur) ease-in-out infinite;animation-delay:var(--atraso)}
@keyframes esc-braco{0%,33%{transform:rotate(0)}38%,42%{transform:rotate(-125deg)}47%{transform:rotate(-20deg)}50%,54%{transform:rotate(-125deg)}58%,100%{transform:rotate(0)}}
.esc-xicara{animation:esc-xicara var(--dur) step-end infinite;animation-delay:var(--atraso)}
@keyframes esc-xicara{0%{opacity:0}30%{opacity:1}62%{opacity:0}}
.esc-fumaca{animation:esc-fumaca 2.4s ease-out infinite}
@keyframes esc-fumaca{0%{opacity:0;transform:translateY(0) scale(.7)}30%{opacity:.7}100%{opacity:0;transform:translateY(-10px) scale(1.3)}}
.esc-ponteiro{transform-origin:50% 100%;animation:esc-ponteiro 60s linear infinite}
@keyframes esc-ponteiro{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.esc *{animation:none!important}}
`;
function passoPar(p: number) { return Math.round(p / 2.5) % 2 === 0; }

const ehRobo = (p: PessoaNaSala) => p.ehIa && p.nome.trim().toLowerCase() === "jarvis";
// Sem nada pra fazer e de dia: sai da mesa (o Jarvis, robô, fica coordenando).
const vaiPassear = (p: PessoaNaSala, noite: boolean) => p.sinal === "parado" && !noite && !ehRobo(p);
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

function Planta({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
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

function Cafe({ x, y }: { x: number; y: number }) {
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

// Mesa de reunião (enche a fileira de cima ao lado da diretoria).
function Reuniao({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {[-34, -12, 10, 32].map((cx) => <rect key={cx} x={cx - 7} y="-2" width="14" height="16" rx="5" fill="#64748b" />)}
      <ellipse cx="0" cy="24" rx="52" ry="14" fill="#a16207" />
      <ellipse cx="0" cy="22" rx="52" ry="14" fill="#ca8a04" />
      <rect x="-10" y="16" width="20" height="8" rx="2" fill="#f8fafc" opacity=".8" />
      {[-34, -12, 10, 32].map((cx) => <rect key={`f${cx}`} x={cx - 7} y="36" width="14" height="14" rx="5" fill="#475569" />)}
      <text x="0" y="66" textAnchor="middle" fontSize="9" fontWeight="700" fill="#475569" fontFamily="system-ui, sans-serif">REUNIÃO</text>
    </g>
  );
}

// O escritório inteiro (pedido do Davi): a Diretoria em cima, no fundo, com a
// reunião e o café; os outros setores embaixo, na frente, lado a lado
// (divisórias de vidro) com a copa no canto. Quem está livre anda até o
// descanso da própria fileira e volta.
export const EscritorioEmpresa = memo(function EscritorioEmpresa({ setores, onAbrir, forcarNoite }: {
  setores: SetorNoEscritorio[]; onAbrir: (id: string) => void; forcarNoite?: boolean;
}) {
  const [noiteAgora, setNoite] = useState(ehNoite);
  const noite = forcarNoite ?? noiteAgora;
  useEffect(() => { const t = window.setInterval(() => setNoite(ehNoite()), 60_000); return () => window.clearInterval(t); }, []);

  const cima = setores.filter(ehDiretoria);
  const baixo = setores.filter((s) => !ehDiretoria(s));
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
      const z = { setor, r, x0: cursor, largura, yMesa: Y_MESA + r * ALTURA_FILEIRA };
      cursor += largura + FOLGA_SETOR;
      return z;
    });
  });
  const mesas = zonas.flatMap((z) => z.setor.pessoas.map((p, k) => ({
    p, r: z.r, yMesa: z.yMesa,
    x: z.x0 + LARGURA_MESA / 2 + k * LARGURA_MESA + (z.largura - z.setor.pessoas.length * LARGURA_MESA) / 2,
  })));
  const fimCima = fileiras.length > 1 ? larguraFileira(fileiras[0]) : LARGURA;
  const pctX = (x: number) => `${(x / LARGURA) * 100}%`;
  const pctY = (y: number) => `${(y / ALTURA_TOTAL) * 100}%`;

  return (
    <div className="w-full overflow-x-auto overscroll-x-contain rounded-xl">
      <div className="esc relative min-w-[820px] overflow-hidden rounded-xl border border-black/5" style={{ aspectRatio: `${LARGURA} / ${ALTURA_TOTAL}` }}>
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
          {/* Fileira de cima: reunião no espaço livre e o café no canto */}
          {fileiras.length > 1 && fimCima + 150 < xDescanso - 60 && <Reuniao x={(fimCima + xDescanso - 60) / 2} y={Y_MESA + 26} />}
          <Cafe x={xDescanso} y={Y_MESA + 16} />
          {fileiras.length > 1 && <Copa x={xDescanso} y={Y_MESA + ALTURA_FILEIRA + 24} />}
          <Planta x={12} y={Y_MESA + 72} s={0.95} />
          <Planta x={LARGURA - 12} y={ALTURA_TOTAL - 34} s={0.9} />

          {/* Mesas (a fileira de trás primeiro, pra a da frente ficar na frente) */}
          {mesas.map(({ p, x, yMesa }) => (
            <BonecoMesa key={p.id} nome={p.nome} ehIa={p.ehIa} sinal={p.sinal} vazio={vaiPassear(p, noite)} x={x - 52} y={yMesa} width={104} height={92} />
          ))}
          {/* Sala da diretoria fechada em vidro (frente baixa, com porta) */}
          {fileiras.length > 1 && zonas.filter((z) => z.r === 0).map(({ setor, x0, largura, yMesa }) => (
            <VidroFrente key={`frente-${setor.id}`} x0={x0 - 8} x1={x0 + largura + FOLGA_SETOR / 2 - 4} yTopo={yMesa + 70} yBase={yMesa + 100} porta={x0 + largura - 30} />
          ))}
          {/* Quem está livre: vai e volta do descanso da fileira */}
          {mesas.map(({ p, x, r, yMesa }, k) => {
            if (!vaiPassear(p, noite)) return null;
            const destino = xDescanso - 26 + (k % 4) * 14;
            const dur = DUR[k % DUR.length] + Math.min(14, Math.abs(destino - x) / 60);
            const vars = { "--de": `${x}px`, "--cafe": `${destino}px`, "--dur": `${dur}s`, "--atraso": `${-k * 6.1}s`, "--ida": destino >= x ? 1 : -1 } as React.CSSProperties;
            return (
              <g key={`andando-${p.id}`} transform={`translate(0 ${yMesa + PE - (r === 0 && fileiras.length > 1 ? 4 : 0)})`} style={vars}>
                <g className="esc-passeio"><g className="esc-vira"><BonecoAndando v={visualDe(p.nome)} /></g></g>
              </g>
            );
          })}
        </svg>

        {/* Placas dos setores */}
        {zonas.map(({ setor, x0, yMesa, r }) => (
          <div key={setor.id} className="pointer-events-none absolute flex items-center gap-1.5 rounded-md bg-white/95 px-2 py-1 shadow-sm"
            style={{ left: pctX(x0 + 8), top: r === 0 ? "4%" : pctY(yMesa + 104) }}>
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: setor.corPlaca }} />
            <span className="text-[11px] font-bold text-slate-800">{setor.nome}</span>
            <span className="text-[10px] text-slate-500">{setor.tarefas} {setor.tarefas === 1 ? "tarefa" : "tarefas"}{setor.atrasadas > 0 && <b className="text-rose-500"> · {setor.atrasadas} atrasada{setor.atrasadas > 1 ? "s" : ""}</b>}</span>
          </div>
        ))}

        {/* Balões, nomes e o clique de cada mesa */}
        {mesas.map(({ p, x, yMesa }) => (
          <button key={p.id} type="button" disabled={!p.clicavel} onClick={() => onAbrir(p.id)}
            title={p.clicavel ? `Ver e adicionar tarefas de ${p.nome}` : undefined}
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
