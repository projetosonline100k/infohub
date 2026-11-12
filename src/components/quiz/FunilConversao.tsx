import type { Eye } from "lucide-react";
import { porcento } from "@/lib/quiz/painel";

// Funil na horizontal, como o do UTMify: a faixa afina de uma etapa para a outra, azul → roxo.
export function Funil({ etapas }: { etapas: { rotulo: string; n: number; Icone: typeof Eye }[] }) {
  const topo = Math.max(1, etapas[0]?.n ?? 1);
  const W = 560, H = 150, col = W / etapas.length;
  const alt = etapas.map((e) => Math.max(e.n ? 6 : 2, Math.min(1, e.n / topo) * (H - 20)));
  const pontos = etapas.map((_, i) => ({ x: i * col + col / 2, h: alt[i] }));
  const cima = [`M 0 ${H / 2 - alt[0] / 2}`, ...pontos.map((p, i) => { const prev = i ? pontos[i - 1] : { x: 0, h: alt[0] }; const mx = (prev.x + p.x) / 2; return `C ${mx} ${H / 2 - prev.h / 2} ${mx} ${H / 2 - p.h / 2} ${p.x} ${H / 2 - p.h / 2}`; }), `L ${W} ${H / 2 - alt[alt.length - 1] / 2}`];
  const baixo = [`L ${W} ${H / 2 + alt[alt.length - 1] / 2}`, ...[...pontos].reverse().map((p, k, arr) => { const next = k < arr.length - 1 ? arr[k + 1] : { x: 0, h: alt[0] }; const mx = (p.x + next.x) / 2; return `C ${mx} ${H / 2 + p.h / 2} ${mx} ${H / 2 + next.h / 2} ${next.x} ${H / 2 + next.h / 2}`; }), "Z"];
  return (
    <div className="mt-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <defs><linearGradient id="funil-grad" x1="0" x2="1"><stop offset="0%" stopColor="#1d4ed8" /><stop offset="60%" stopColor="#6d28d9" /><stop offset="100%" stopColor="#db2777" /></linearGradient></defs>
        <path d={`${cima.join(" ")} ${baixo.join(" ")}`} fill="url(#funil-grad)" opacity="0.9" />
        {pontos.slice(1).map((p, i) => <line key={i} x1={i * col + col} x2={i * col + col} y1="0" y2={H} stroke="rgba(255,255,255,0.12)" />)}
        {pontos.map((p, i) => <text key={i} x={p.x} y={H / 2 + 4} textAnchor="middle" className="fill-white" fontSize="13" fontWeight="700">{porcento(etapas[i].n, topo)}%</text>)}
      </svg>
      <div className="mt-1 grid" style={{ gridTemplateColumns: `repeat(${etapas.length}, minmax(0, 1fr))` }}>
        {etapas.map((e) => (
          <div key={e.rotulo} className="px-1 text-center"><p className="flex items-center justify-center gap-1 text-[11px] text-white/55"><e.Icone className="h-3 w-3" />{e.rotulo}</p><p className="text-base font-bold tabular-nums text-white">{e.n}</p></div>
        ))}
      </div>
    </div>
  );
}
