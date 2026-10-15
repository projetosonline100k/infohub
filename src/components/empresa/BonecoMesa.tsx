import { memo } from "react";
import type { Sinal } from "@/lib/empresa/visaoGeral";

// Mapa da operação: cada pessoa sentada na mesa dela, no estilo do escritório
// do briefing do Davi. O boneco reage ao sinal:
//   trabalhando → digitando (mãos no teclado, cabeça acompanhando, tela piscando)
//   parado      → dormindo (cabeça caída, olhos fechados, respirando, "Z z z")
//   esperando   → acenando com "!" pulando (precisa do Davi)
//   problema    → mão na cabeça, tremendo, "!" vermelho
// O Jarvis é um robô (olhos ciano da orbe) flutuando enquanto coordena.
// Tudo em SVG + CSS: leve, sem imagem externa, e para em "reduzir movimento".

type Cabelo = "curto" | "cacheado" | "longo" | "raspado";
export interface Visual { pele: string; cabelo: Cabelo; corCabelo: string; barba?: boolean; oculos?: boolean; camisa: string }

// Aparência de quem já existe (inspirada na imagem do briefing); quem for novo
// ganha uma combinação fixa a partir do nome.
const VISUAIS: Record<string, Visual> = {
  davi: { pele: "#d6a06b", cabelo: "curto", corCabelo: "#2b1d14", barba: true, camisa: "#2f3640" },
  ítalo: { pele: "#e7b78a", cabelo: "curto", corCabelo: "#3b2a1e", barba: true, camisa: "#3b6fd8" },
  italo: { pele: "#e7b78a", cabelo: "curto", corCabelo: "#3b2a1e", barba: true, camisa: "#3b6fd8" },
  pedro: { pele: "#efc6a0", cabelo: "curto", corCabelo: "#5a3d26", oculos: true, camisa: "#1f3a5f" },
  gabriel: { pele: "#c98f5e", cabelo: "curto", corCabelo: "#1f1611", barba: true, oculos: true, camisa: "#4b5563" },
  danilo: { pele: "#d9a574", cabelo: "curto", corCabelo: "#241812", barba: true, oculos: true, camisa: "#18181b" },
  roy: { pele: "#e2ad7e", cabelo: "cacheado", corCabelo: "#2e1f16", oculos: true, camisa: "#6b7280" },
  dalila: { pele: "#f0c8a4", cabelo: "longo", corCabelo: "#3a2418", camisa: "#e8799b" },
};
const PELES = ["#f1c9a5", "#e0ac7e", "#c68a5a", "#9c6a43", "#6e4a2f"];
const CABELOS: Cabelo[] = ["curto", "cacheado", "longo", "raspado"];
const CORES_CABELO = ["#1f1611", "#3b2a1e", "#6b4a2b", "#a0703f", "#2b2b2b"];
const CAMISAS = ["#3b6fd8", "#16a34a", "#9333ea", "#ea580c", "#0d9488", "#475569", "#db2777"];

export function visualDe(nome: string): Visual {
  const chave = nome.trim().toLowerCase().split(/\s+/)[0];
  if (VISUAIS[chave]) return VISUAIS[chave];
  let h = 0;
  for (const c of chave) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const pega = <T,>(lista: T[], n: number) => lista[(h >>> n) % lista.length];
  return { pele: pega(PELES, 0), cabelo: pega(CABELOS, 3), corCabelo: pega(CORES_CABELO, 6), barba: ((h >>> 9) & 3) === 0, oculos: ((h >>> 11) & 3) === 0, camisa: pega(CAMISAS, 13) };
}

export const ESTILO = `
.bnc *{transform-box:fill-box}
.bnc-tecla-e{animation:bnc-tecla .32s ease-in-out infinite alternate}
.bnc-tecla-d{animation:bnc-tecla .32s ease-in-out infinite alternate-reverse}
@keyframes bnc-tecla{from{transform:translateY(0)}to{transform:translateY(-2.6px)}}
.bnc-cabeca-trab{transform-origin:50% 100%;animation:bnc-foco 2.6s ease-in-out infinite}
@keyframes bnc-foco{0%,100%{transform:rotate(0)}30%{transform:rotate(2.5deg)}60%{transform:rotate(-1.5deg) translateY(.6px)}}
.bnc-tela{animation:bnc-tela 1.1s steps(2) infinite}
@keyframes bnc-tela{0%{opacity:.55}50%{opacity:1}100%{opacity:.7}}
.bnc-respirar{transform-origin:50% 100%;animation:bnc-resp 3.8s ease-in-out infinite}
@keyframes bnc-resp{0%,100%{transform:scale(1)}50%{transform:scale(1.025,1.04)}}
.bnc-cabeca-dorme{transform-origin:50% 100%;animation:bnc-cochilo 3.8s ease-in-out infinite}
@keyframes bnc-cochilo{0%,100%{transform:rotate(16deg) translate(2px,5px)}50%{transform:rotate(19deg) translate(2.5px,6.5px)}}
.bnc-z{opacity:0;animation:bnc-z 3.2s linear infinite}
@keyframes bnc-z{0%{opacity:0;transform:translate(0,0) scale(.6)}20%{opacity:1}100%{opacity:0;transform:translate(9px,-20px) scale(1.25)}}
.bnc-acenar{transform-origin:15% 90%;animation:bnc-acenar .55s ease-in-out infinite alternate}
@keyframes bnc-acenar{from{transform:rotate(-14deg)}to{transform:rotate(16deg)}}
.bnc-pular{animation:bnc-pulo .9s ease-in-out infinite}
@keyframes bnc-pulo{0%,100%{transform:translateY(0)}50%{transform:translateY(-3.5px)}}
.bnc-tremer{animation:bnc-tremor .22s ease-in-out infinite alternate}
@keyframes bnc-tremor{from{transform:translateX(-.8px)}to{transform:translateX(.8px)}}
.bnc-flutuar{animation:bnc-flutua 3s ease-in-out infinite}
@keyframes bnc-flutua{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
.bnc-olhar{animation:bnc-olhar 4s ease-in-out infinite}
@keyframes bnc-olhar{0%,40%,100%{transform:translateX(0)}50%,70%{transform:translateX(2px)}80%,90%{transform:translateX(-2px)}}
.bnc-piscar{transform-origin:50% 50%;animation:bnc-piscar 4.5s infinite}
@keyframes bnc-piscar{0%,94%,100%{transform:scaleY(1)}97%{transform:scaleY(.1)}}
.bnc-led{animation:bnc-led 1.4s steps(2) infinite}
@keyframes bnc-led{0%{opacity:1}50%{opacity:.25}}
@media (prefers-reduced-motion:reduce){.bnc *{animation:none!important}}
`;

function Mesa({ tela }: { tela: boolean }) {
  return (
    <>
      {/* Notebook (vemos a tampa por trás) */}
      <path d="M46 57 L74 57 L76 72 L44 72 Z" fill="#cfd6e0" stroke="#9aa4b2" strokeWidth=".8" />
      <circle cx="60" cy="64" r="1.6" fill="#9aa4b2" />
      {tela && <rect className="bnc-tela" x="46.5" y="56" width="27" height="1.6" rx=".8" fill="#67e8f9" />}
      {/* Tampo e frente da mesa */}
      <rect x="16" y="72" width="88" height="7" rx="2" fill="#e9d5b5" />
      <rect x="20" y="79" width="80" height="15" rx="2" fill="#d4b78f" />
      <rect x="24" y="82" width="20" height="9" rx="1.5" fill="#c4a37a" />
      {/* Plantinha e caneca */}
      <rect x="91" y="64" width="7" height="8" rx="1.5" fill="#f8fafc" stroke="#cbd5e1" strokeWidth=".6" />
      <path d="M94.5 64 C 90 56, 92 52, 94.5 50 C 97 52, 99 56, 94.5 64" fill="#22c55e" />
      <path d="M94.5 64 C 99 58, 102 57, 103 55 C 100 55, 97 58, 94.5 64" fill="#16a34a" />
      <rect x="23" y="66" width="6" height="6" rx="1.2" fill="#f97316" />
    </>
  );
}

// Cabelo e cabelo comprido de trás (desenho centrado em 60,39.5).
export function cabeloDe(v: Visual) {
  return {
    curto: <path d="M46.5 38 Q46 24 60 24 Q74 24 73.5 38 Q71 31 60 31 Q49 31 46.5 38 Z" fill={v.corCabelo} />,
    raspado: <path d="M47.5 36 Q48 26 60 26 Q72 26 72.5 36 Q70 31 60 31 Q50 31 47.5 36 Z" fill={v.corCabelo} opacity=".75" />,
    cacheado: <g fill={v.corCabelo}>{[[49, 31], [54, 26.5], [60, 25], [66, 26.5], [71, 31], [47.5, 36], [72.5, 36], [57, 29], [63, 29]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="4.6" />)}</g>,
    longo: <path d="M46.5 39 Q46 24 60 24 Q74 24 73.5 39 Q70 30 62 30.5 Q55 33 46.5 39 Z" fill={v.corCabelo} />,
  }[v.cabelo];
}
export const cabeloTras = (v: Visual) => v.cabelo === "longo"
  ? <path d="M45 34 Q45 22 60 22 Q75 22 75 34 L78 62 Q60 66 42 62 Z" fill={v.corCabelo} /> : null;

function Pessoa({ v, sinal }: { v: Visual; sinal: Sinal }) {
  const cabelo = cabeloDe(v);
  const dormindo = sinal === "parado";
  const acenando = sinal === "esperando";
  const aflito = sinal === "problema";
  const trabalhando = sinal === "trabalhando";
  const olhos = dormindo
    ? <><path d="M53 41 q2 1.6 4 0" stroke="#3b2a20" strokeWidth="1.1" fill="none" strokeLinecap="round" /><path d="M63 41 q2 1.6 4 0" stroke="#3b2a20" strokeWidth="1.1" fill="none" strokeLinecap="round" /></>
    : <g className="bnc-piscar"><circle cx="55" cy="40.5" r="1.5" fill="#2a1d15" /><circle cx="65" cy="40.5" r="1.5" fill="#2a1d15" /></g>;
  const boca = aflito ? <ellipse cx="60" cy="47" rx="2" ry="1.4" fill="#7c2d12" />
    : acenando ? <path d="M56.5 45.5 q3.5 3 7 0" stroke="#7c2d12" strokeWidth="1.1" fill="none" strokeLinecap="round" />
    : <path d="M57.5 46 q2.5 1.2 5 0" stroke="#7c2d12" strokeWidth="1" fill="none" strokeLinecap="round" />;

  return (
    <>
      {/* Cadeira */}
      <rect x="35" y="36" width="50" height="46" rx="11" fill="#64748b" />
      <g className={dormindo ? "bnc-respirar" : undefined}>
        {cabeloTras(v)}
        <rect x="39" y="55" width="42" height="32" rx="13" fill={v.camisa} />
        <rect x="55.5" y="50" width="9" height="8" rx="2" fill={v.pele} />
        <g className={aflito ? "bnc-tremer" : undefined}>
          <g className={dormindo ? "bnc-cabeca-dorme" : trabalhando ? "bnc-cabeca-trab" : undefined}>
            <circle cx="46.8" cy="41.5" r="2.6" fill={v.pele} />
            <circle cx="73.2" cy="41.5" r="2.6" fill={v.pele} />
            <circle cx="60" cy="39.5" r="13.2" fill={v.pele} />
            {cabelo}
            {v.barba && <path d="M47.6 42 Q48.5 54.5 60 55 Q71.5 54.5 72.4 42 Q70.5 49 60 49.5 Q49.5 49 47.6 42 Z" fill={v.corCabelo} opacity=".92" />}
            {olhos}
            {boca}
            {v.oculos && <g fill="none" stroke="#1f2937" strokeWidth="1"><circle cx="55" cy="40.5" r="3.6" /><circle cx="65" cy="40.5" r="3.6" /><path d="M58.6 40.5 h2.8" /></g>}
          </g>
        </g>
      </g>
      <Mesa tela={trabalhando} />
      {/* Braços e mãos */}
      {acenando ? (
        <>
          <path d="M44 62 Q43 68 45 72" stroke={v.camisa} strokeWidth="5" strokeLinecap="round" fill="none" />
          <circle cx="45" cy="72.5" r="2.8" fill={v.pele} />
          <g className="bnc-acenar">
            <path d="M77 62 Q85 52 87 38" stroke={v.camisa} strokeWidth="5" strokeLinecap="round" fill="none" />
            <circle cx="87.5" cy="35" r="3.4" fill={v.pele} />
          </g>
        </>
      ) : aflito ? (
        <>
          <path d="M43 62 Q37 48 48 33" stroke={v.camisa} strokeWidth="5" strokeLinecap="round" fill="none" />
          <path d="M77 62 Q83 48 72 33" stroke={v.camisa} strokeWidth="5" strokeLinecap="round" fill="none" />
          <circle cx="48.5" cy="31.5" r="3" fill={v.pele} /><circle cx="71.5" cy="31.5" r="3" fill={v.pele} />
        </>
      ) : (
        <>
          <path d="M44 62 Q42 68 44 72" stroke={v.camisa} strokeWidth="5" strokeLinecap="round" fill="none" />
          <path d="M76 62 Q78 68 76 72" stroke={v.camisa} strokeWidth="5" strokeLinecap="round" fill="none" />
          <g className={trabalhando ? "bnc-tecla-e" : undefined}><circle cx="44.5" cy="72.5" r="2.8" fill={v.pele} /></g>
          <g className={trabalhando ? "bnc-tecla-d" : undefined}><circle cx="75.5" cy="72.5" r="2.8" fill={v.pele} /></g>
        </>
      )}
      {dormindo && (
        <g fill="#64748b" fontWeight="700" fontFamily="system-ui, sans-serif">
          <text className="bnc-z" x="76" y="30" fontSize="7">z</text>
          <text className="bnc-z" x="76" y="30" fontSize="8" style={{ animationDelay: "1.05s" }}>z</text>
          <text className="bnc-z" x="76" y="30" fontSize="9" style={{ animationDelay: "2.1s" }}>Z</text>
        </g>
      )}
      {(acenando || aflito) && (
        <g className="bnc-pular">
          <circle cx="98" cy="17" r="7" fill={aflito ? "#ef4444" : "#f59e0b"} />
          <text x="98" y="20.6" textAnchor="middle" fontSize="10" fontWeight="800" fill="#fff" fontFamily="system-ui, sans-serif">!</text>
        </g>
      )}
    </>
  );
}

function Robo({ sinal }: { sinal: Sinal }) {
  const dormindo = sinal === "parado";
  return (
    <>
      <g className={dormindo ? undefined : "bnc-flutuar"}>
        <line x1="60" y1="20" x2="60" y2="14" stroke="#64748b" strokeWidth="1.4" />
        <circle className={dormindo ? undefined : "bnc-led"} cx="60" cy="12.5" r="2.2" fill={dormindo ? "#475569" : "#22d3ee"} />
        <rect x="44" y="20" width="32" height="26" rx="12" fill="#0f172a" stroke="#22d3ee" strokeWidth="1.4" />
        <g className={dormindo ? undefined : "bnc-olhar"}>
          {dormindo
            ? <><path d="M51 33 h6" stroke="#22d3ee" strokeWidth="1.6" strokeLinecap="round" /><path d="M63 33 h6" stroke="#22d3ee" strokeWidth="1.6" strokeLinecap="round" /></>
            : <g className="bnc-piscar"><rect x="51" y="29" width="6" height="8" rx="3" fill="#67e8f9" /><rect x="63" y="29" width="6" height="8" rx="3" fill="#67e8f9" /></g>}
        </g>
        <rect x="48" y="47" width="24" height="18" rx="7" fill="#1e293b" stroke="#334155" />
        <circle cx="60" cy="56" r="3" fill={dormindo ? "#475569" : "#22d3ee"} opacity=".9" />
      </g>
      <Mesa tela={!dormindo} />
      {dormindo && (
        <g fill="#64748b" fontWeight="700" fontFamily="system-ui, sans-serif">
          <text className="bnc-z" x="78" y="26" fontSize="7">z</text>
          <text className="bnc-z" x="78" y="26" fontSize="9" style={{ animationDelay: "1.6s" }}>Z</text>
        </g>
      )}
    </>
  );
}

function MesaVazia() {
  return (
    <>
      <rect x="35" y="36" width="50" height="46" rx="11" fill="#64748b" />
      <rect x="16" y="72" width="88" height="7" rx="2" fill="#e9d5b5" />
      <rect x="20" y="79" width="80" height="15" rx="2" fill="#d4b78f" />
      <rect x="24" y="82" width="20" height="9" rx="1.5" fill="#c4a37a" />
      <rect x="46" y="69" width="28" height="3.5" rx="1" fill="#cfd6e0" stroke="#9aa4b2" strokeWidth=".6" />
      <rect x="91" y="64" width="7" height="8" rx="1.5" fill="#f8fafc" stroke="#cbd5e1" strokeWidth=".6" />
      <path d="M94.5 64 C 90 56, 92 52, 94.5 50 C 97 52, 99 56, 94.5 64" fill="#22c55e" />
      <rect x="23" y="66" width="6" height="6" rx="1.2" fill="#f97316" />
    </>
  );
}

export const BonecoMesa = memo(function BonecoMesa({ nome, ehIa, sinal, className, vazio, x, y, width, height }: {
  nome: string; ehIa: boolean; sinal: Sinal; className?: string; vazio?: boolean;
  // Dentro de outro SVG (cena do escritório): posição e tamanho do quadro.
  x?: number; y?: number; width?: number; height?: number;
}) {
  const robo = ehIa && nome.trim().toLowerCase() === "jarvis";
  if (vazio) return <svg viewBox="8 6 104 92" x={x} y={y} width={width} height={height} className={className}><MesaVazia /></svg>;
  return (
    <svg viewBox="8 6 104 92" x={x} y={y} width={width} height={height} className={`bnc ${className ?? ""}`} role="img" aria-label={`${nome}: ${ROTULO[sinal]}`}>
      <style>{ESTILO}</style>
      <ellipse cx="60" cy="95" rx="44" ry="3" fill="#000" opacity=".12" />
      {robo ? <Robo sinal={sinal} /> : <Pessoa v={visualDe(nome)} sinal={sinal} />}
    </svg>
  );
});

const ROTULO: Record<Sinal, string> = { trabalhando: "trabalhando", parado: "parado", esperando: "precisa de você", problema: "com problema" };

// Só a cabeça do boneco (lista da equipe / chat).
export function CabecaBoneco({ nome, ehIa, className }: { nome: string; ehIa: boolean; className?: string }) {
  if (ehIa && nome.trim().toLowerCase() === "jarvis") {
    return (
      <svg viewBox="40 16 40 34" className={className} aria-hidden="true">
        <rect x="44" y="20" width="32" height="26" rx="12" fill="#0f172a" stroke="#22d3ee" strokeWidth="1.4" />
        <rect x="51" y="29" width="6" height="8" rx="3" fill="#67e8f9" /><rect x="63" y="29" width="6" height="8" rx="3" fill="#67e8f9" />
      </svg>
    );
  }
  const v = visualDe(nome);
  return (
    <svg viewBox="42 20 36 38" className={className} aria-hidden="true">
      {cabeloTras(v)}
      <circle cx="46.8" cy="41.5" r="2.6" fill={v.pele} />
      <circle cx="73.2" cy="41.5" r="2.6" fill={v.pele} />
      <circle cx="60" cy="39.5" r="13.2" fill={v.pele} />
      {cabeloDe(v)}
      {v.barba && <path d="M47.6 42 Q48.5 54.5 60 55 Q71.5 54.5 72.4 42 Q70.5 49 60 49.5 Q49.5 49 47.6 42 Z" fill={v.corCabelo} opacity=".92" />}
      <circle cx="55" cy="40.5" r="1.5" fill="#2a1d15" /><circle cx="65" cy="40.5" r="1.5" fill="#2a1d15" />
      <path d="M57.5 46 q2.5 1.4 5 0" stroke="#7c2d12" strokeWidth="1" fill="none" strokeLinecap="round" />
      {v.oculos && <g fill="none" stroke="#1f2937" strokeWidth="1"><circle cx="55" cy="40.5" r="3.6" /><circle cx="65" cy="40.5" r="3.6" /><path d="M58.6 40.5 h2.8" /></g>}
    </svg>
  );
}
