import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

// Pergunta "monte seu trio" (estilo "orbita", 15/11/2026, Davi: "das coisas ao redor do instalivros e a pessoa vai selecionando"):
// vagas numeradas no topo, o mascote comemorando no meio e as opções em bolhas em volta. Ao tocar, o ícone voa até a próxima vaga livre.
interface OpcaoOrbita { texto: string; imagem?: string; emoji?: string }
interface Voo { id: number; img?: string; emoji?: string; de: [number, number]; para: [number, number] }

const TAM_BOLHA = 19;   // % da largura do círculo
const RAIO = 37;        // % da largura, do centro até o meio da bolha

function VooIcone({ voo, tam }: { voo: Voo; tam: number }) {
  const [indo, setIndo] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => requestAnimationFrame(() => setIndo(true))); return () => cancelAnimationFrame(id); }, []);
  const [x, y] = indo ? voo.para : voo.de;
  return (
    <span className="pointer-events-none absolute z-30 flex items-center justify-center"
      style={{ left: 0, top: 0, width: tam, height: tam, transform: `translate(${x - tam / 2}px, ${y - tam / 2}px) scale(${indo ? 0.9 : 1.15})`, transition: "transform 650ms cubic-bezier(.3,.7,.3,1)" }}>
      {voo.img ? <img src={voo.img} alt="" draggable={false} className="h-full w-full object-contain drop-shadow-md" /> : <span className="text-2xl leading-none">{voo.emoji}</span>}
    </span>
  );
}

function IconeVaga({ img, emoji }: { img?: string; emoji?: string }) {
  const [ve, setVe] = useState(false);
  useEffect(() => { const t = window.setTimeout(() => setVe(true), 620); return () => window.clearTimeout(t); }, []);
  return (
    <span className={cn("flex h-full w-full items-center justify-center transition-all duration-300", ve ? "scale-100 opacity-100" : "scale-50 opacity-0")}>
      {img ? <img src={img} alt="" draggable={false} className="h-[78%] w-[78%] object-contain" /> : <span className="text-xl leading-none">{emoji}</span>}
    </span>
  );
}

export function OrbitaTrio({ opcoes, sel, meta, aoAlternar, quadro, cor, escuro, suave, editar }: {
  opcoes: OpcaoOrbita[]; sel: number[]; meta: number; aoAlternar: (k: number) => void; quadro?: string;
  cor: string; escuro: boolean; suave: string; editar: boolean;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const bolhas = useRef<(HTMLElement | null)[]>([]);
  const vagas = useRef<(HTMLElement | null)[]>([]);
  const [voos, setVoos] = useState<Voo[]>([]);
  const contador = useRef(0);
  const completa = sel.length >= meta;
  const n = opcoes.length;

  const centro = (el: HTMLElement | null, raiz: DOMRect): [number, number] | null => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return [r.left - raiz.left + r.width / 2, r.top - raiz.top + r.height / 2];
  };

  const tocar = (k: number) => {
    if (!sel.includes(k) && sel.length < meta && !editar && caixa.current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const raiz = caixa.current.getBoundingClientRect();
      const de = centro(bolhas.current[k], raiz);
      const para = centro(vagas.current[sel.length], raiz);
      if (de && para) {
        const id = ++contador.current;
        setVoos((v) => [...v, { id, img: opcoes[k].imagem, emoji: opcoes[k].emoji, de, para }]);
        window.setTimeout(() => setVoos((v) => v.filter((x) => x.id !== id)), 900);
      }
    }
    aoAlternar(k);
  };

  const tamVoo = caixa.current ? caixa.current.getBoundingClientRect().width * (TAM_BOLHA / 100) * 0.6 : 40;

  return (
    <div className="space-y-2">
      <div className="flex justify-center gap-3">
        {Array.from({ length: meta }, (_, i) => {
          const k = sel[i];
          const cheia = k !== undefined;
          return (
            <button key={i} type="button" ref={(el) => { vagas.current[i] = el; }} disabled={!cheia} onClick={() => cheia && tocar(k)} aria-label={cheia ? `Vaga ${i + 1}: ${opcoes[k].texto} (tocar para tirar)` : `Vaga ${i + 1} livre`}
              className={cn("relative flex h-14 w-14 items-center justify-center rounded-full border-2 transition-all duration-300", cheia ? "border-solid bg-white shadow-md" : cn("border-dashed", escuro ? "border-white/25" : "border-gray-300"))}
              style={cheia ? { borderColor: cor, boxShadow: `0 0 12px ${cor}55` } : undefined}>
              {cheia
                ? <IconeVaga key={`${i}-${k}`} img={opcoes[k].imagem} emoji={opcoes[k].emoji} />
                : <span className={cn("text-base font-bold", escuro ? "text-white/35" : "text-gray-300")}>{i + 1}</span>}
              <span className={cn("absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white transition-all", cheia ? "scale-100" : "scale-0")} style={{ background: cor }}>{i + 1}</span>
            </button>
          );
        })}
      </div>

      <div ref={caixa} className="relative mx-auto aspect-square w-full max-w-[360px]">
        {/* O centramento fica no invólucro: a animação "empolgado" usa transform e anularia o -translate da imagem. */}
        {quadro && (
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-[40%] w-[40%] -translate-x-1/2 -translate-y-1/2">
            <img src={quadro} alt="" draggable={false} className="h-full w-full object-contain motion-safe:animate-empolgado" />
          </div>
        )}
        {opcoes.map((o, k) => {
          const ang = (-90 + (360 / n) * k) * (Math.PI / 180);
          const marcada = sel.includes(k);
          return (
            <button key={k} type="button" ref={(el) => { bolhas.current[k] = el; }} onClick={() => tocar(k)}
              className={cn("absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border-2 px-0.5 text-center transition-all duration-300",
                escuro ? "bg-white/5" : "bg-white", marcada ? "scale-105" : completa && !editar ? "opacity-45" : "active:scale-95")}
              style={{ left: `${50 + RAIO * Math.cos(ang)}%`, top: `${50 + RAIO * Math.sin(ang)}%`, width: `${TAM_BOLHA}%`, height: `${TAM_BOLHA}%`,
                borderColor: marcada ? cor : escuro ? "rgba(255,255,255,.15)" : "#e5e7eb", boxShadow: marcada ? `0 0 14px ${cor}66` : "0 1px 3px rgba(0,0,0,.06)" }}>
              {o.imagem ? <img src={o.imagem} alt="" draggable={false} className="h-[46%] w-[46%] object-contain" /> : o.emoji ? <span className="text-xl leading-none">{o.emoji}</span> : null}
              <span className="mt-0.5 block text-[9px] font-semibold leading-[1.05]">{o.texto}</span>
              {marcada && <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-white shadow"><Check className="h-3 w-3" strokeWidth={3} /></span>}
            </button>
          );
        })}
        {voos.map((v) => (
          <svg key={`r${v.id}`} className="pointer-events-none absolute inset-0 z-20 h-full w-full overflow-visible">
            <line x1={v.de[0]} y1={v.de[1]} x2={v.para[0]} y2={v.para[1]} stroke={cor} strokeWidth={2} strokeDasharray="2 6" strokeLinecap="round" className="animate-[pulse_0.9s_ease-out_1]" opacity={0.6} />
          </svg>
        ))}
        {voos.map((v) => <VooIcone key={v.id} voo={v} tam={tamVoo} />)}
      </div>

      <p className={cn("text-center text-xs", suave)}>{completa ? "Tudo certo! Toque numa escolhida para trocar." : `${sel.length} de ${meta} escolhidas`}</p>
    </div>
  );
}
