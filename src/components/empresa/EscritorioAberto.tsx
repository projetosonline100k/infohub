import { memo, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ehNomeCoordenador } from "@/lib/empresa/visaoGeral";
import { BonecoMesa, ESTILO, cabeloDe, cabeloTras, visualDe, type Visual } from "./BonecoMesa";
import { Cafe, ESTILO_SALA, Planta, type PessoaNaSala, type SetorNoEscritorio } from "./EscritorioEmpresa";

// Escritório aberto (22/10, Davi: "deixar de parecer funcionários presos em salas e virar um escritório
// aberto e vivo, como um jogo de gerenciamento"). Os setores viram ZONAS (tapete na cor, placa, plantas),
// com corredores entre elas; não há mesa fixa: cada zona tem estações e quem trabalha senta numa livre.
// A posição de cada um vem do estado REAL (nada aleatório):
//   trabalhando / esperando você / problema → sentado numa estação da zona da tarefa (setor da tarefa;
//     sem setor, a zona dele). Tarefa de outro setor = ele vai trabalhar lá;
//   conversando com você → mesa de reunião (e o Davi vai junto);
//   livre → copa (café) ou sofá; à noite, cochila na estação da própria zona.
// Mudou o estado → anda do lugar antigo até o novo (o balão diz para onde está indo).

const W_EST = 120;          // largura de uma estação
const H_ZONA = 196;         // altura de uma zona (tapete)
const GAP = 64;             // corredor entre zonas
const TOPO = 150;           // onde começa o piso (parede do fundo em cima)
const MARGEM = 34;
const LOUNGE = 330;         // coluna da copa, reunião e sofá
const MESA_Y = 54;          // topo da estação dentro da zona
const PES_MESA = 142;       // pés de quem chega na estação (relativo ao topo da zona)
const VEL = 140;            // unidades por segundo andando

const ehRobo = (p: PessoaNaSala) => p.ehIa && ehNomeCoordenador(p.nome);
const ehNoite = () => { const h = new Date().getHours(); return h >= 22 || h < 7; };
const ehDavi = (p: PessoaNaSala) => !p.ehIa && /^davi\b/i.test(p.nome);

type Lugar =
  | { tipo: "mesa"; zona: string; est: number; x: number; y: number; pes: { x: number; y: number }; onde: string }
  | { tipo: "pe"; x: number; y: number; xicara?: boolean; onde: string; virado?: 1 | -1; sentado?: boolean };

// Boneco de pé: parado (com ou sem xícara) ou andando (pernas e gingado). Pés em 0,0.
function BonecoDePe({ v, andando, xicara }: { v: Visual; andando?: boolean; xicara?: boolean }) {
  return (
    <g className={andando ? "ea-andando" : undefined}>
      <ellipse cx="0" cy="1" rx="11" ry="2.6" fill="#000" opacity=".15" />
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

// Sofá, bebedouro, mesa de reunião redonda e tapetes.
// Sofá em duas partes: o encosto atrás de quem senta e o assento/braços na frente (cobre as pernas).
function SofaEncosto({ x, y }: { x: number; y: number }) {
  return <g transform={`translate(${x - 75} ${y})`}><rect x="0" y="-14" width="150" height="40" rx="10" fill="#475569" /></g>;
}
function SofaAssento({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x - 75} ${y})`}>
      <rect x="0" y="18" width="150" height="30" rx="9" fill="#334155" />
      <rect x="-10" y="4" width="16" height="44" rx="7" fill="#2b3647" /><rect x="144" y="4" width="16" height="44" rx="7" fill="#2b3647" />
    </g>
  );
}
function MesaReuniao({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="0" cy="34" rx="104" ry="40" fill="#0ea5e9" opacity=".08" />
      <ellipse cx="0" cy="8" rx="62" ry="22" fill="#a16207" />
      <ellipse cx="0" cy="4" rx="62" ry="22" fill="#ca8a04" />
      <rect x="-5" y="20" width="10" height="20" fill="#78350f" />
      <rect x="-14" y="-6" width="18" height="11" rx="2" fill="#e2e8f0" stroke="#94a3b8" strokeWidth=".8" />
      <circle cx="22" cy="2" r="4" fill="#fff" stroke="#cbd5e1" />
    </g>
  );
}

export const EscritorioAberto = memo(function EscritorioAberto({ setores, onAbrir, forcarNoite, tv, onAbrirSetor }: {
  setores: SetorNoEscritorio[]; onAbrir: (id: string) => void; forcarNoite?: boolean;
  tv?: React.ReactNode; onAbrirSetor?: (id: string) => void;
}) {
  const [noiteAgora, setNoite] = useState(ehNoite);
  const noite = forcarNoite ?? noiteAgora;
  useEffect(() => { const t = window.setInterval(() => setNoite(ehNoite()), 60_000); return () => window.clearInterval(t); }, []);

  // ---------------------------------------------------------------- planta do escritório
  const geo = useMemo(() => {
    const filDe = (s: SetorNoEscritorio) => (s.fileira === 0 || s.fileira === 1 ? s.fileira : /diretoria/i.test(s.nome) ? 0 : 1);
    const pessoas = setores.flatMap((s) => s.pessoas.map((p) => ({ p, setor: s.id })));
    const existe = new Set(setores.map((s) => s.id));
    // Onde cada um precisa estar agora.
    const conversa = pessoas.filter(({ p }) => p.conversando && !noite);
    const alguemConversando = conversa.length > 0;
    const zonaDe = new Map<string, string>();      // pessoa → zona onde trabalha (estação)
    const livres: PessoaNaSala[] = [];
    const reuniao: PessoaNaSala[] = [];
    for (const { p, setor } of pessoas) {
      if (!noite && (p.conversando || (alguemConversando && ehDavi(p)))) { reuniao.push(p); continue; }
      if (noite || ehRobo(p) || p.sinal !== "parado") {
        zonaDe.set(p.id, p.setorTarefa && existe.has(p.setorTarefa) && !noite ? p.setorTarefa : setor);
        continue;
      }
      livres.push(p);
    }
    // Estações por zona: o tamanho da equipe dela (mínimo 2) ou quem está trabalhando lá, o que for maior.
    const zonas = setores.map((s) => {
      const aqui = [...zonaDe.entries()].filter(([, z]) => z === s.id).length;
      return { s, fil: filDe(s), est: Math.max(2, s.pessoas.length, aqui) };
    });
    const fileiras = [0, 1].map((f) => zonas.filter((z) => z.fil === f)).filter((f) => f.length);
    const largFila = (f: typeof zonas) => f.reduce((t, z) => t + z.est * W_EST + 40 + GAP, 0) - GAP;
    const larguraTrabalho = Math.max(760, ...fileiras.map(largFila)) + MARGEM * 2;
    const W = larguraTrabalho + LOUNGE;
    const H = Math.max(TOPO + fileiras.length * (H_ZONA + GAP) + 20, 700);
    const caixas = fileiras.flatMap((f, r) => {
      let x = MARGEM + (larguraTrabalho - MARGEM * 2 - largFila(f)) / 2;
      return f.map((z) => {
        const largura = z.est * W_EST + 40;
        const c = { ...z, r, x0: x, y0: TOPO + 18 + r * (H_ZONA + GAP), largura };
        x += largura + GAP;
        return c;
      });
    });
    // Senta cada um numa estação: quem é da zona fica com "a sua" (mesma posição de sempre), visitante pega a livre.
    const lugar = new Map<string, Lugar>();
    for (const c of caixas) {
      const ocupada = new Set<number>();
      const daqui = [...zonaDe.entries()].filter(([, z]) => z === c.s.id).map(([id]) => id);
      const ordem = [...daqui].sort((a, b) => {
        const ia = c.s.pessoas.findIndex((p) => p.id === a), ib = c.s.pessoas.findIndex((p) => p.id === b);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      });
      for (const id of ordem) {
        const ideal = c.s.pessoas.findIndex((p) => p.id === id);
        let est = ideal >= 0 && !ocupada.has(ideal) ? ideal : 0;
        while (ocupada.has(est)) est++;
        ocupada.add(est);
        const x = c.x0 + 20 + est * W_EST + W_EST / 2;
        lugar.set(id, { tipo: "mesa", zona: c.s.id, est, x, y: c.y0 + MESA_Y, pes: { x, y: c.y0 + PES_MESA }, onde: c.s.nome });
      }
    }
    // Lounge: café (de pé, com xícara), sofá e mesa de reunião.
    const L = larguraTrabalho;
    const cafe = { x: L + 92, y: TOPO + 40 };
    const reuniaoC = { x: L + LOUNGE / 2, y: TOPO + 250 };
    const sofa = { x: L + LOUNGE / 2, y: H - 150 };
    const vagasCafe = [0, 1, 2].map((k) => ({ x: cafe.x - 50 + k * 62, y: cafe.y + 122 }));
    const vagasSofa = [0, 1, 2].map((k) => ({ x: sofa.x - 50 + k * 50, y: sofa.y + 40 }));
    const vagasReuniao = [-78, 78, -44, 44, -100, 100, 0].map((dx, k) => ({ x: reuniaoC.x + dx, y: reuniaoC.y + (k < 2 ? 10 : k < 4 ? 46 : k < 6 ? -22 : 56), virado: (dx > 0 ? -1 : 1) as 1 | -1 }));
    reuniao.forEach((p, k) => {
      const v = vagasReuniao[k % vagasReuniao.length];
      lugar.set(p.id, { tipo: "pe", x: v.x, y: v.y, onde: "Reunião", virado: v.virado });
    });
    // Cada um tem o "seu" lugar no descanso (pelo id), para ninguém trocar de lugar só porque outro saiu.
    const vagas = [...vagasCafe.map((v) => ({ ...v, cafe: true })), ...vagasSofa.map((v) => ({ ...v, cafe: false }))];
    const usadas = new Set<number>();
    [...livres].sort((a, b) => a.id.localeCompare(b.id)).forEach((p) => {
      let k = [...p.id].reduce((t, c) => t + c.charCodeAt(0), 0) % vagas.length;
      for (let n = 0; usadas.has(k) && n < vagas.length; n++) k = (k + 1) % vagas.length;
      usadas.add(k);
      const v = vagas[k];
      lugar.set(p.id, { tipo: "pe", x: v.x, y: v.y, xicara: v.cafe, onde: v.cafe ? "Copa" : "Descanso", sentado: !v.cafe });
    });
    // Corredores: a faixa entre as fileiras de zonas (e acima da primeira); o lounge tem o corredor vertical em L.
    const corredores = [TOPO + 8, ...fileiras.map((_, r) => TOPO + 18 + r * (H_ZONA + GAP) + H_ZONA + GAP / 2)];
    return { W, H, L, caixas, lugar, cafe, reuniaoC, sofa, corredores, pessoas: pessoas.map((x) => x.p) };
  }, [setores, noite]);

  // ---------------------------------------------------------------- andar quando o lugar muda
  type Andando = { de: { x: number; y: number }; para: { x: number; y: number }; dur: number; chave: number; pontos: { x: number; y: number }[] };
  const [andando, setAndando] = useState<Record<string, Andando>>({});
  const antes = useRef<Map<string, string>>(new Map());
  const pesAntes = useRef<Map<string, { x: number; y: number }>>(new Map());
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    const novos: Record<string, Andando> = {};
    for (const p of geo.pessoas) {
      const l = geo.lugar.get(p.id);
      if (!l || ehRobo(p)) continue;
      const pes = l.tipo === "mesa" ? l.pes : { x: l.x, y: l.y };
      const chaveLugar = l.tipo === "mesa" ? `m-${l.zona}-${l.est}` : `p-${l.onde}-${l.x}`;
      const anterior = antes.current.get(p.id);
      const de = pesAntes.current.get(p.id);
      if (anterior && anterior !== chaveLugar && de) {
        // Pelo corredor: sai da zona até a faixa mais perto, anda por ela e entra no destino.
        const yc = geo.corredores.reduce((m, y) => (Math.abs(y - (de.y + pes.y) / 2) < Math.abs(m - (de.y + pes.y) / 2) ? y : m), geo.corredores[0]);
        const pontos = Math.abs(de.y - pes.y) < 4 && Math.abs(de.x - pes.x) < 4 ? [de, pes] : [de, { x: de.x, y: yc }, { x: pes.x, y: yc }, pes];
        const total = pontos.slice(1).reduce((t, q, k) => t + Math.hypot(q.x - pontos[k].x, q.y - pontos[k].y), 0);
        const durTotal = Math.min(12, Math.max(1.6, total / VEL));
        novos[p.id] = { de, para: pes, dur: durTotal, chave: Date.now(), pontos };
        timers.current.push(window.setTimeout(() => setAndando((a) => { const n = { ...a }; delete n[p.id]; return n; }), durTotal * 1000 + 80));
      }
      antes.current.set(p.id, chaveLugar);
      pesAntes.current.set(p.id, pes);
    }
    if (Object.keys(novos).length) setAndando((a) => ({ ...a, ...novos }));
  }, [geo]);

  const { W, H, L, caixas, lugar, cafe, reuniaoC, sofa } = geo;
  const pctX = (x: number) => `${(x / W) * 100}%`;
  const pctY = (y: number) => `${(y / H) * 100}%`;
  const tvW = 300, tvH = 120, tvX = L / 2 - tvW / 2, tvY = 12;

  return (
    <div className="w-full overflow-x-auto overscroll-x-contain rounded-xl">
      <div className="esc relative min-w-[880px] overflow-hidden rounded-xl border border-black/5" style={{ aspectRatio: `${W} / ${H}` }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" aria-hidden="true">
          <style>{ESTILO + ESTILO_SALA + ESTILO_ABERTO}</style>
          <defs>
            <linearGradient id="ea-ceu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#bae6fd" /><stop offset="1" stopColor="#e0f2fe" /></linearGradient>
            <pattern id="ea-piso" width="60" height="14" patternUnits="userSpaceOnUse">
              <rect width="60" height="14" fill="#ead6b2" /><path d="M0 13.5 H60 M30 0 V14" stroke="#dcc196" strokeWidth="1" />
            </pattern>
          </defs>
          {/* Parede do fundo com janelas, e o piso aberto */}
          <rect width={W} height={TOPO} fill="#eef2f7" />
          <rect y={TOPO - 6} width={W} height="6" fill="#d9e0ea" />
          <rect y={TOPO} width={W} height={H - TOPO} fill="url(#ea-piso)" />
          {Array.from({ length: Math.floor(W / 210) }, (_, k) => 40 + k * 210).filter((x) => x + 70 < tvX - 10 || x > tvX + tvW + 10).map((x) => (
            <g key={x} transform={`translate(${x} 34)`}>
              <rect width="70" height="62" rx="4" fill="url(#ea-ceu)" stroke="#94a3b8" strokeWidth="3" />
              <path d="M35 0 V62 M0 31 H70" stroke="#94a3b8" strokeWidth="2" />
              <ellipse cx="18" cy="15" rx="8" ry="3.5" fill="#fff" opacity=".9" />
            </g>
          ))}
          {/* Moldura do "Nosso resultado" (a tela é HTML por cima) */}
          <rect x={tvX - 6} y={tvY - 6} width={tvW + 12} height={tvH + 12} rx="5" fill="#0f172a" stroke="#334155" strokeWidth="1.5" />

          {/* Zonas: tapete na cor do setor (sem paredes), plantas nos cantos */}
          {caixas.map((c) => (
            <g key={c.s.id}>
              <rect x={c.x0} y={c.y0} width={c.largura} height={H_ZONA} rx="18" fill={c.s.corPlaca} opacity=".13" />
              <rect x={c.x0} y={c.y0} width={c.largura} height={H_ZONA} rx="18" fill="none" stroke={c.s.corPlaca} strokeOpacity=".35" strokeWidth="2" strokeDasharray="10 8" />
              <Planta x={c.x0 + 14} y={c.y0 + H_ZONA - 26} s={0.6} />
              <Planta x={c.x0 + c.largura - 14} y={c.y0 + H_ZONA - 26} s={0.6} />
            </g>
          ))}

          {/* Lounge: copa com café, mesa de reunião e sofá — separados do trabalho por um corredor */}
          <rect x={L - 8} y={TOPO} width="10" height={H - TOPO} fill="#dcc196" opacity=".45" />
          <Cafe x={cafe.x} y={cafe.y} />
          <g transform={`translate(${cafe.x + 120} ${cafe.y - 6})`}>
            <rect x="-9" y="20" width="18" height="34" rx="3" fill="#e2e8f0" stroke="#94a3b8" />
            <rect x="-7" y="0" width="14" height="22" rx="5" fill="#93c5fd" opacity=".85" />
          </g>
          <MesaReuniao x={reuniaoC.x} y={reuniaoC.y} />
          <SofaEncosto x={sofa.x} y={sofa.y} />
          <Planta x={W - 20} y={H - 40} s={0.95} />
          <Planta x={L + 18} y={H - 40} s={0.8} />

          {/* Estações: vazias ou com quem está trabalhando ali (sentado) */}
          {caixas.flatMap((c) => Array.from({ length: c.est }, (_, est) => {
            const x = c.x0 + 20 + est * W_EST + W_EST / 2;
            const p = geo.pessoas.find((q) => { const l = lugar.get(q.id); return l?.tipo === "mesa" && l.zona === c.s.id && l.est === est; });
            const chegou = p && !andando[p.id];
            return chegou
              ? <BonecoMesa key={`${c.s.id}-${est}`} nome={p.nome} ehIa={p.ehIa} sinal={p.sinal} descansando={!noite && p.sinal === "parado"} x={x - 52} y={c.y0 + MESA_Y} width={104} height={92} />
              : <BonecoMesa key={`${c.s.id}-${est}`} nome="" ehIa={false} sinal="parado" vazio x={x - 52} y={c.y0 + MESA_Y} width={104} height={92} />;
          }))}

          {/* De pé: na copa, no sofá e na reunião */}
          {geo.pessoas.map((p) => {
            const l = lugar.get(p.id);
            if (!l || l.tipo !== "pe" || andando[p.id]) return null;
            return (
              <g key={`pe-${p.id}`} transform={`translate(${l.x} ${l.y}) scale(${l.virado ?? 1} 1)`}>
                <BonecoDePe v={visualDe(p.nome)} xicara={l.xicara} />
              </g>
            );
          })}

          <SofaAssento x={sofa.x} y={sofa.y} />

          {/* Andando: do lugar antigo até o novo */}
          {Object.entries(andando).map(([id, a]) => {
            const p = geo.pessoas.find((q) => q.id === id);
            if (!p) return null;
            return <Caminhante key={`${id}-${a.chave}`} a={a} v={visualDe(p.nome)} />;
          })}
        </svg>

        {/* "Nosso resultado" na parede (HTML por cima) */}
        {tv && <div className="absolute" style={{ left: pctX(tvX), top: pctY(tvY), width: pctX(tvW), height: pctY(tvH) }}>{tv}</div>}

        {/* Placas das zonas */}
        {caixas.map((c) => (
          <button key={c.s.id} type="button" onClick={() => c.s.temEsteira && onAbrirSetor?.(c.s.id)}
            className={cn("absolute flex items-center gap-1.5 rounded-md bg-white/95 px-2 py-1 shadow-sm", c.s.temEsteira ? "hover:ring-2 hover:ring-primary/40" : "cursor-default")}
            style={{ left: pctX(c.x0 + 10), top: pctY(c.y0 + 8) }} title={c.s.temEsteira ? "Abrir a esteira (kanban do time)" : undefined}>
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c.s.corPlaca }} />
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-800">{c.s.nome}</span>
            <span className="text-[10px] text-slate-500">{c.s.tarefas} {c.s.tarefas === 1 ? "tarefa" : "tarefas"}{c.s.atrasadas > 0 && <b className="text-rose-500"> · {c.s.atrasadas} atrasada{c.s.atrasadas > 1 ? "s" : ""}</b>}</span>
          </button>
        ))}
        {[{ x: cafe.x - 30, y: cafe.y - 50, t: "☕ Copa" }, { x: reuniaoC.x - 40, y: reuniaoC.y - 70, t: "Reunião" }, { x: sofa.x - 26, y: sofa.y - 30, t: "Descanso" }].map((r) => (
          <span key={r.t} className="pointer-events-none absolute rounded-md bg-white/85 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 shadow-sm"
            style={{ left: pctX(r.x), top: pctY(r.y) }}>{r.t}</span>
        ))}

        {/* Nome, status, balão e o clique de cada um (acompanha quem anda) */}
        {geo.pessoas.map((p) => {
          const l = lugar.get(p.id);
          if (!l) return null;
          const a = andando[p.id];
          const topo = l.tipo === "mesa" ? { x: l.x, y: l.y - 14 } : { x: l.x, y: l.y - 104 };
          const balao = a ? `Indo para ${l.onde}` : p.balao;
          return (
            <button key={`r-${p.id}`} type="button" disabled={!p.clicavel} onClick={() => onAbrir(p.id)}
              title={p.clicavel ? (p.ehIa ? `Conversar com ${p.nome}` : `Ver e adicionar tarefas de ${p.nome}`) : undefined}
              className="ea-rotulo group/mesa absolute flex -translate-x-1/2 flex-col items-center justify-between rounded-lg outline-none transition-colors enabled:hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-primary"
              style={{ left: pctX(topo.x), top: pctY(topo.y), height: pctY(l.tipo === "mesa" ? 110 : 108), width: pctX(l.tipo === "mesa" ? W_EST - 8 : 86), ["--ea-dur" as string]: a ? `${a.dur}s` : "0s" }}>
              {balao ? (
                <span className={cn("line-clamp-2 max-w-full rounded-md border bg-white/95 px-1.5 py-0.5 text-center text-[10px] font-medium leading-tight text-slate-800 shadow-sm",
                  a && "border-sky-300 italic", p.sinal === "esperando" && !a && "border-amber-400", p.sinal === "problema" && "border-rose-400")}>{balao}</span>
              ) : <span />}
              <span className="flex max-w-full items-center gap-1 rounded-full bg-slate-900/80 px-2 py-0.5 text-[10.5px] font-semibold text-white shadow">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", p.corSinal)} title={p.rotuloSinal} />
                <span className="truncate">{p.nome}</span>
                {p.clicavel && p.tarefas > 0 && <span className="shrink-0 font-normal text-white/70">· {p.tarefas}{p.atrasadas > 0 && <b className="text-rose-300"> ({p.atrasadas}!)</b>}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
});

// Anda em linha reta do ponto de partida até o destino (vira para o lado em que vai).
function Caminhante({ a, v }: { a: { pontos: { x: number; y: number }[]; dur: number }; v: Visual }) {
  // Segue os pontos (saída da zona → corredor → destino), cada trecho no tempo proporcional ao tamanho.
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
