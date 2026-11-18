import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, BookOpen, Headphones, Library, Lock, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

// Tela "amostra" do quiz (18/11/2026, Davi: "precisa ser uma experiência, como se a pessoa estivesse no app do Instalivros").
// Biblioteca com as capas do plano dela (as que têm amostra ganham selo), mãozinha indicando o 1º livro, e ao tocar a capa
// voa até o centro, gira e abre como um livro e vira o player (Ouvir / Ler). Só visual e player; quem escolhe os livros é o QuizPlayer.

export interface LivroAmostra {
  id: string; titulo: string; autor: string; capa: string; minutos?: number;
  /** "Dia 1", "Dia 2"… (ou o tema) mostrado embaixo da capa. */
  rotulo?: string;
  /** Sem `amostra` = livro bloqueado (só no plano completo). */
  amostra?: { audio_url?: string; texto?: string };
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const reduzido = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

type Voo = { livro: LivroAmostra; de: DOMRect; fase: "voa" | "abre" };
const CAP_W = 176, CAP_H = 256;

export function AmostraTela({ livros, nome, titulo, aviso, dica, fimTexto, textoBloqueado, textoSemAmostra, segundos, botao, aoEvento, cor, escuro, suave }: {
  livros: LivroAmostra[]; nome: string; titulo: ReactNode; aviso: string; dica: string; fimTexto: string; textoBloqueado: string; textoSemAmostra: string; segundos: number; botao: ReactNode;
  /** `detalhe` curto para o registro da sessão: "abriu;livro=56" ou "ouviu=42s;total=75s;fim=nao;livro=56". */
  aoEvento: (detalhe: string) => void; cor: string; escuro: boolean; suave: string;
}) {
  const [aberto, setAberto] = useState<LivroAmostra | null>(null);
  const [voo, setVoo] = useState<Voo | null>(null);
  const [tocouAlgum, setTocouAlgum] = useState(false);
  const primeiro = livros.find((l) => l.amostra)?.id;
  const timers = useRef<number[]>([]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  const abrir = (livro: LivroAmostra, el: HTMLElement) => {
    setTocouAlgum(true);
    aoEvento(`abriu;livro=${livro.id}`);
    if (reduzido()) { setAberto(livro); return; }
    setVoo({ livro, de: el.getBoundingClientRect(), fase: "voa" });
    timers.current.push(window.setTimeout(() => setVoo((v) => (v ? { ...v, fase: "abre" } : v)), 520));
    timers.current.push(window.setTimeout(() => { setAberto(livro); setVoo(null); }, 1150));
  };

  if (aberto) {
    return <LivroAberto key={aberto.id} livro={aberto} cor={cor} escuro={escuro} suave={suave} segundos={segundos}
      fimTexto={fimTexto} textoBloqueado={textoBloqueado} textoSemAmostra={textoSemAmostra}
      aoEvento={(d) => aoEvento(`${d};livro=${aberto.id}`)} aoVoltar={() => setAberto(null)} botao={botao} />;
  }

  return (
    <div className="space-y-3 py-1">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white shadow" style={{ background: cor }}>
          {nome ? <span className="text-base font-extrabold">{nome.charAt(0).toUpperCase()}</span> : <Library className="h-5 w-5" />}
        </span>
        <div className="min-w-0 text-left">
          <p className="text-lg font-extrabold leading-tight">Sua biblioteca</p>
          <p className={cn("truncate text-xs", suave)}>{nome ? `Olá, ${nome}` : "Os livros que o plano escolheu para você"}</p>
        </div>
      </div>
      <div className="text-center text-base font-bold leading-snug">{titulo}</div>

      <div className={cn("rounded-2xl border px-2 pb-3 pt-4", escuro ? "border-white/15 bg-white/5" : "border-gray-200 bg-gray-50")}>
        <div className="flex snap-x gap-3 overflow-x-auto px-2 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {livros.map((l) => {
            const dica1 = l.id === primeiro && !tocouAlgum;
            return (
              <button key={l.id} type="button" aria-label={`Abrir ${l.titulo}`} onClick={(ev) => abrir(l, ev.currentTarget.querySelector("img") ?? ev.currentTarget)}
                className="relative w-[104px] shrink-0 snap-start text-left transition-transform active:scale-95">
                <img src={l.capa} alt="" draggable={false} loading="lazy"
                  className={cn("h-[150px] w-[104px] rounded-lg object-cover shadow-xl", !l.amostra && "opacity-80", dica1 && "ring-2 ring-offset-2 ring-offset-transparent")} style={dica1 ? { ["--tw-ring-color" as string]: cor } : undefined} />
                {l.amostra
                  ? <span className="absolute left-1 top-1 rounded-full px-1.5 py-0.5 text-[9px] font-extrabold text-white shadow" style={{ background: cor }}>▶ Amostra grátis</span>
                  : <span className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"><Lock className="h-3 w-3" /></span>}
                {dica1 && (
                  <span className="pointer-events-none absolute -bottom-1 right-1 z-10 select-none text-4xl drop-shadow-lg motion-safe:animate-bounce" aria-hidden>👆</span>
                )}
                <span className="mt-1.5 block truncate text-[11px] font-bold leading-tight">{l.rotulo ?? l.titulo}</span>
                <span className={cn("block truncate text-[10px]", suave)}>{l.titulo}</span>
              </button>
            );
          })}
        </div>
        {!tocouAlgum && primeiro && (
          <p className="mx-auto mt-1 w-fit rounded-full px-3 py-1.5 text-xs font-bold text-white shadow-lg motion-safe:animate-pulse" style={{ background: cor }}>{dica}</p>
        )}
      </div>
      <p className={cn("text-center text-xs", suave)}>{aviso}</p>
      <div className="sticky bottom-3 z-10 pt-1">{botao}</div>
      {voo && <VooDaCapa voo={voo} cor={cor} />}
    </div>
  );
}

// A capa cresce da prateleira até o centro, gira em 3D e abre (capa virando, páginas aparecendo).
function VooDaCapa({ voo, cor }: { voo: Voo; cor: string }) {
  const [destino, setDestino] = useState(false);
  useLayoutEffect(() => { const id = requestAnimationFrame(() => setDestino(true)); return () => cancelAnimationFrame(id); }, []);
  const vw = window.innerWidth, vh = window.innerHeight;
  const w = Math.min(CAP_W, vw * 0.55), h = w * (CAP_H / CAP_W);
  const alvo = { left: (vw - w) / 2, top: (vh - h) / 2, width: w, height: h };
  const origem = { left: voo.de.left, top: voo.de.top, width: voo.de.width, height: voo.de.height };
  const pos = destino ? alvo : origem;
  const abre = voo.fase === "abre";
  return createPortal(
    <div className="fixed inset-0 z-[100]" style={{ pointerEvents: "all" }}>
      <div className="absolute inset-0 bg-black/70 transition-opacity duration-500" style={{ opacity: destino ? 1 : 0 }} />
      <div className="absolute" style={{ ...pos, perspective: 900, transition: "all 520ms cubic-bezier(.22,1,.36,1)" }}>
        <div className="relative h-full w-full" style={{ transformStyle: "preserve-3d", transform: abre ? "rotateY(-12deg)" : "rotateY(0deg)", transition: "transform 600ms ease" }}>
          {/* páginas */}
          <div className="absolute inset-0 overflow-hidden rounded-r-md rounded-l-sm bg-[#faf6ec] shadow-2xl" style={{ opacity: abre ? 1 : 0, transition: "opacity 200ms" }}>
            <div className="space-y-2 p-4 pt-8">
              {[90, 100, 80, 100, 70, 95, 60].map((p, i) => <div key={i} className="h-1.5 rounded-full bg-black/10" style={{ width: `${p}%` }} />)}
            </div>
            <div className="absolute inset-x-0 bottom-3 flex justify-center"><Play className="h-5 w-5" style={{ color: cor }} /></div>
          </div>
          {/* capa que vira */}
          <img src={voo.livro.capa} alt="" draggable={false} className="absolute inset-0 h-full w-full rounded-md object-cover shadow-2xl"
            style={{ transformOrigin: "left center", backfaceVisibility: "hidden", transform: abre ? "rotateY(-165deg)" : "rotateY(0deg)", transition: "transform 620ms cubic-bezier(.5,0,.2,1)" }} />
        </div>
      </div>
    </div>, document.body);
}

function LivroAberto({ livro, cor, escuro, suave, segundos, fimTexto, textoBloqueado, textoSemAmostra, aoEvento, aoVoltar, botao }: {
  livro: LivroAmostra; cor: string; escuro: boolean; suave: string; segundos: number; fimTexto: string; textoBloqueado: string; textoSemAmostra: string;
  aoEvento: (detalhe: string) => void; aoVoltar: () => void; botao: ReactNode;
}) {
  const am = livro.amostra;
  const temAudio = !!am?.audio_url;
  const paragrafos = (am?.texto ?? "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const temTexto = paragrafos.length > 0;
  const [aba, setAba] = useState<"ouvir" | "ler">(temAudio ? "ouvir" : "ler");
  const [tocando, setTocando] = useState(false);
  const [atual, setAtual] = useState(0);
  const [duracao, setDuracao] = useState(0);
  const [acabou, setAcabou] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const maxOuvido = useRef(0);
  const jaTocou = useRef(false);
  const evento = useRef(aoEvento);
  evento.current = aoEvento;
  const limite = Math.max(5, duracao > 0 ? Math.min(segundos, duracao) : segundos);

  const avisar = useCallback((fim: boolean) => {
    if (!jaTocou.current) return;
    evento.current(`ouviu=${Math.round(maxOuvido.current)}s;total=${Math.round(limite)}s;fim=${fim ? "sim" : "nao"}`);
  }, [limite]);

  // Enquanto toca, atualiza o registro a cada 10 s; ao sair da tela, grava o que foi ouvido.
  useEffect(() => {
    if (!tocando) return;
    const id = setInterval(() => avisar(false), 10000);
    return () => clearInterval(id);
  }, [tocando, avisar]);
  const avisarRef = useRef(avisar);
  avisarRef.current = avisar;
  useEffect(() => () => avisarRef.current(false), []);

  const alternar = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) {
      if (acabou || a.currentTime >= limite) { a.currentTime = 0; setAcabou(false); }
      void a.play().catch(() => setTocando(false));
    } else a.pause();
  };

  const voltar = () => { audio.current?.pause(); aoVoltar(); };

  return (
    <div className="space-y-3 py-1 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-500">
      <button type="button" onClick={voltar} className={cn("flex items-center gap-1 text-sm font-bold", suave)}><ArrowLeft className="h-4 w-4" />Voltar à biblioteca</button>
      <div className="flex items-center gap-3">
        <img src={livro.capa} alt="" draggable={false} className="h-[120px] w-[84px] shrink-0 rounded-lg object-cover shadow-xl" />
        <div className="min-w-0 space-y-1">
          <p className="line-clamp-3 text-lg font-extrabold leading-tight">{livro.titulo}</p>
          <p className={cn("truncate text-sm", suave)}>{livro.autor}</p>
          {livro.minutos ? <span className="inline-flex items-center gap-1 rounded-full bg-black/5 px-2 py-0.5 text-[11px] font-semibold"><Headphones className="h-3 w-3" />{livro.minutos} min</span> : null}
        </div>
      </div>

      {!am && (
        <div className={cn("space-y-2 rounded-2xl border p-5 text-center", escuro ? "border-white/15 bg-white/5" : "border-gray-200 bg-white")}>
          <Lock className="mx-auto h-8 w-8" />
          <p className="text-base font-extrabold">🔒 Disponível no seu plano completo</p>
          <p className={cn("text-xs", suave)}>{textoSemAmostra}</p>
          <button type="button" onClick={voltar} className="mx-auto mt-1 rounded-full px-4 py-2 text-sm font-bold text-white shadow active:scale-95" style={{ background: cor }}>Abrir outro livro</button>
        </div>
      )}

      {temAudio && temTexto && (
        <div role="tablist" className={cn("grid grid-cols-2 gap-1 rounded-full p-1", escuro ? "bg-white/10" : "bg-gray-100")}>
          {([["ouvir", "▶ Ouvir"], ["ler", "📖 Ler"]] as const).map(([k, rotulo]) => (
            <button key={k} type="button" role="tab" aria-selected={aba === k} onClick={() => { if (k === "ler") audio.current?.pause(); setAba(k); }}
              className={cn("rounded-full py-2 text-sm font-bold transition-colors", aba === k ? "text-white shadow" : suave)} style={aba === k ? { background: cor } : undefined}>{rotulo}</button>
          ))}
        </div>
      )}

      {temAudio && (
        <>
          <audio ref={audio} src={am?.audio_url} preload="metadata"
            onLoadedMetadata={(ev) => setDuracao(ev.currentTarget.duration || 0)}
            onPlay={() => { jaTocou.current = true; setTocando(true); setAcabou(false); avisar(false); }}
            onPause={() => { setTocando(false); avisar(false); }}
            onTimeUpdate={(ev) => {
              const t = ev.currentTarget.currentTime;
              setAtual(t); if (t > maxOuvido.current) maxOuvido.current = t;
              if (t >= limite) { ev.currentTarget.pause(); setAcabou(true); evento.current(`ouviu=${Math.round(maxOuvido.current)}s;total=${Math.round(limite)}s;fim=sim`); }
            }}
            onEnded={() => { setAcabou(true); evento.current(`ouviu=${Math.round(maxOuvido.current)}s;total=${Math.round(limite)}s;fim=sim`); }} />
          <div className={cn("space-y-3 rounded-2xl border p-4", aba !== "ouvir" && "hidden", escuro ? "border-white/15 bg-white/5" : "border-gray-200 bg-white")}>
            <div className="flex items-center gap-3">
              <button type="button" onClick={alternar} aria-label={tocando ? "Pausar" : "Ouvir a amostra"}
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white shadow-lg active:scale-95" style={{ background: cor }}>
                {tocando ? <Pause className="h-6 w-6" /> : <Play className="ml-0.5 h-6 w-6" />}
              </button>
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="h-2 overflow-hidden rounded-full bg-black/10"><div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.min(100, (atual / limite) * 100)}%`, background: cor }} /></div>
                <div className={cn("flex justify-between text-[11px] tabular-nums", suave)}><span>{mmss(atual)}</span><span>amostra · {mmss(limite)}</span></div>
              </div>
            </div>
            {acabou && <p className="text-center text-sm font-semibold" style={{ color: escuro ? undefined : cor }}>{fimTexto}</p>}
          </div>
        </>
      )}

      {temTexto && (
        <div className={cn("relative max-h-[30vh] space-y-3 overflow-hidden rounded-2xl border p-4 text-[15px] leading-relaxed", aba !== "ler" && "hidden", escuro ? "border-white/15 bg-white/5" : "border-gray-200 bg-white")}>
          {paragrafos.slice(0, 2).map((p, i) => <p key={i}>{p}</p>)}
          <div className="relative">
            {paragrafos.slice(2, 4).map((p, i) => <p key={i} className="select-none opacity-40 blur-[1.5px]" aria-hidden>{p}</p>)}
            <div className={cn("flex items-center justify-center gap-1.5 py-3 text-sm font-bold", paragrafos.length > 2 && "absolute inset-0 bg-gradient-to-b from-transparent", paragrafos.length > 2 && (escuro ? "to-[#0a1a3a]" : "to-white"))}><Lock className="h-4 w-4" />{textoBloqueado}</div>
          </div>
        </div>
      )}

      {am && !temAudio && !temTexto && <p className={cn("flex items-center justify-center gap-1.5 text-center text-sm", suave)}><BookOpen className="h-4 w-4" />Amostra em breve</p>}
      <div className="sticky bottom-3 z-10 pt-1">{botao}</div>
    </div>
  );
}
