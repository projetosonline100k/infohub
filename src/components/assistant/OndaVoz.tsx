import { useEffect, useRef } from "react";
import { FAIXAS, ouvirNivel } from "@/lib/desktop/nivelAudio";

// Órbita do Atlas enquanto ele ouve (18/10/2026): um anel de barras em volta da orbe que
// vibra com a voz do Davi, uma órbita fina que respira com o volume e uma lua que gira
// mais rápido quanto mais alto ele fala. Atualiza direto no SVG a cada quadro
// (requestAnimationFrame via nivelAudio), sem re-render do React.
const TAM = 132;                 // cabe na janela da orbe (140x140), centrado na face de 64px
const C = TAM / 2;
const R_BASE = 37;               // logo fora da face
const R_MAX = 24;                // quanto a barra cresce no máximo
const R_ORBITA = 47;

export function OndaVoz() {
  const barras = useRef<(SVGLineElement | null)[]>([]);
  const orbita = useRef<SVGCircleElement>(null);
  const lua = useRef<SVGCircleElement>(null);
  const brilho = useRef<SVGCircleElement>(null);

  useEffect(() => {
    let angulo = -Math.PI / 2;
    let ultimo = performance.now();
    return ouvirNivel((faixas, volume) => {
      const agora = performance.now();
      const dt = Math.min(0.05, (agora - ultimo) / 1000);
      ultimo = agora;
      for (let i = 0; i < FAIXAS; i++) {
        const el = barras.current[i];
        if (!el) continue;
        const a = (i / FAIXAS) * Math.PI * 2 - Math.PI / 2;
        const comp = 2 + faixas[i] * R_MAX;
        el.setAttribute("x2", String(C + Math.cos(a) * (R_BASE + comp)));
        el.setAttribute("y2", String(C + Math.sin(a) * (R_BASE + comp)));
        el.setAttribute("stroke-opacity", String(0.45 + faixas[i] * 0.55));
      }
      const r = R_ORBITA + volume * 6;
      orbita.current?.setAttribute("r", String(r));
      orbita.current?.setAttribute("stroke-opacity", String(0.25 + volume * 0.6));
      brilho.current?.setAttribute("opacity", String(0.15 + volume * 0.55));
      angulo += dt * (0.8 + volume * 7);   // gira devagar parado, rápido falando alto
      lua.current?.setAttribute("cx", String(C + Math.cos(angulo) * r));
      lua.current?.setAttribute("cy", String(C + Math.sin(angulo) * r));
    });
  }, []);

  return (
    <svg aria-hidden="true" width={TAM} height={TAM} viewBox={`0 0 ${TAM} ${TAM}`}
      className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 overflow-visible">
      <defs>
        <radialGradient id="onda-brilho">
          <stop offset="45%" stopColor="#22d3ee" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="onda-cor" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
      <circle ref={brilho} cx={C} cy={C} r={C - 2} fill="url(#onda-brilho)" opacity="0.15" />
      {Array.from({ length: FAIXAS }, (_, i) => {
        const a = (i / FAIXAS) * Math.PI * 2 - Math.PI / 2;
        return (
          <line key={i} ref={(el) => { barras.current[i] = el; }}
            x1={C + Math.cos(a) * R_BASE} y1={C + Math.sin(a) * R_BASE}
            x2={C + Math.cos(a) * (R_BASE + 2)} y2={C + Math.sin(a) * (R_BASE + 2)}
            stroke="url(#onda-cor)" strokeWidth={2.4} strokeLinecap="round" strokeOpacity={0.45} />
        );
      })}
      <circle ref={orbita} cx={C} cy={C} r={R_ORBITA} fill="none" stroke="#67e8f9" strokeWidth={1} strokeOpacity={0.25} strokeDasharray="2 4" />
      <circle ref={lua} cx={C} cy={C - R_ORBITA} r={3.2} fill="#f0abfc" style={{ filter: "drop-shadow(0 0 4px #f0abfc)" }} />
    </svg>
  );
}
