import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Bookmark, ChevronDown, ChevronLeft, Download, Home, Lock, MoreHorizontal, Pause, Play, Search, Share2, Star, User, X, BookOpenText, Sun, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

// Tela "amostra" do quiz: a pessoa se vê DENTRO do app do Instalivros (18/11/2026, Davi: "copiar o visual dos prints do app").
// Home com o plano dela → detalhe do livro → player "Ouvindo" (toca a amostra) ou leitura "Lendo". Só visual e player;
// quem escolhe os livros é o QuizPlayer. O app é sempre claro (branco/azul), igual ao Instalivros, mesmo no quiz escuro.

export interface LivroAmostra {
  id: string; titulo: string; autor: string; capa: string; minutos?: number;
  /** "Dia 1", "Dia 2"… (ou o tema); não é mais mostrado, fica para quem monta a lista. */
  rotulo?: string;
  /** Sem `amostra` = livro bloqueado (só no plano completo). */
  amostra?: { audio_url?: string; texto?: string };
}

const AZUL = "#3E72E8";
const MARINHO = "#1F2A44";
const VERDE = "#2FA36B";
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const reduzido = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

type Voo = { livro: LivroAmostra; de: DOMRect; alvo: { left: number; top: number; width: number; height: number } };

export function AmostraTela({ livros, nome, titulo, aviso, dica, fimTexto, textoBloqueado, textoSemAmostra, segundos, botao, aoEvento, suave }: {
  livros: LivroAmostra[]; nome: string; titulo: ReactNode; aviso: string; dica: string; fimTexto: string; textoBloqueado: string; textoSemAmostra: string; segundos: number; botao: ReactNode;
  /** `detalhe` curto para o registro da sessão: "abriu;livro=56" ou "ouviu=42s;total=75s;fim=nao;livro=56". */
  aoEvento: (detalhe: string) => void; cor?: string; escuro?: boolean; suave: string;
}) {
  const [aberto, setAberto] = useState<LivroAmostra | null>(null);
  const [voo, setVoo] = useState<Voo | null>(null);
  const [tocouAlgum, setTocouAlgum] = useState(false);
  const quadro = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  const abrir = (livro: LivroAmostra, el: HTMLElement) => {
    setTocouAlgum(true);
    aoEvento(`abriu;livro=${livro.id}`);
    const q = quadro.current?.getBoundingClientRect();
    if (reduzido() || !q) { setAberto(livro); return; }
    // destino = onde a capa fica na tela de detalhe (centralizada, perto do topo do "celular")
    const w = 140, h = 200;
    setVoo({ livro, de: el.getBoundingClientRect(), alvo: { left: q.left + (q.width - w) / 2, top: q.top + 74, width: w, height: h } });
    timers.current.push(window.setTimeout(() => { setAberto(livro); setVoo(null); }, 620));
  };

  return (
    <div className="space-y-2 py-1">
      <div className="text-center text-sm font-bold leading-snug">{titulo}</div>
      <div ref={quadro} className="relative mx-auto flex h-[calc(100dvh-14rem)] max-h-[640px] min-h-[400px] w-full max-w-[390px] flex-col overflow-hidden rounded-[28px] border border-black/10 bg-white shadow-xl" style={{ color: MARINHO }}>
        {aberto
          ? <LivroAberto key={aberto.id} livro={aberto} segundos={segundos} fimTexto={fimTexto} textoBloqueado={textoBloqueado} textoSemAmostra={textoSemAmostra}
              aoEvento={(d) => aoEvento(`${d};livro=${aberto.id}`)} aoVoltar={() => setAberto(null)} />
          : <HomeApp livros={livros} nome={nome} dica={dica} tocouAlgum={tocouAlgum} abrir={abrir} />}
      </div>
      <p className={cn("text-center text-[11px]", suave)}>{aviso}</p>
      <div className="pt-0.5">{botao}</div>
      {voo && <VooDaCapa voo={voo} />}
    </div>
  );
}

function BarraAbas({ ativa }: { ativa: "home" | "biblioteca" }) {
  const abas = [["home", "Home", Home], ["biblioteca", "Biblioteca", Bookmark], ["buscar", "Buscar", Search], ["perfil", "Perfil", User]] as const;
  return (
    <div className="grid shrink-0 grid-cols-4 border-t border-black/5 bg-white pb-2 pt-1.5" aria-hidden>
      {abas.map(([k, rotulo, Icone]) => (
        <span key={k} className="flex flex-col items-center gap-0.5 text-[10px] font-semibold" style={{ color: k === ativa ? MARINHO : "#B8BCCB" }}>
          <Icone className="h-5 w-5" fill={k === ativa ? "currentColor" : "none"} />{rotulo}
        </span>
      ))}
    </div>
  );
}

function HomeApp({ livros, nome, dica, tocouAlgum, abrir }: {
  livros: LivroAmostra[]; nome: string; dica: string; tocouAlgum: boolean; abrir: (l: LivroAmostra, el: HTMLElement) => void;
}) {
  const primeiro = livros.find((l) => l.amostra);
  return (
    <>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-3 pt-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div>
          <p className="text-2xl font-medium leading-tight">Bom dia,</p>
          <p className="text-2xl font-extrabold leading-tight">{nome ? `${nome}!` : "Olá!"}</p>
        </div>
        <div className="flex items-center justify-center gap-3 text-xs font-bold">
          <span className="flex items-center gap-1"><Sun className="h-4 w-4" />Persistência 1</span>
          <span className="h-4 w-px bg-black/20" />
          <span className="flex items-center gap-1"><CalendarDays className="h-4 w-4" />Semanas 1</span>
        </div>

        {primeiro && (
          <button type="button" onClick={(ev) => abrir(primeiro, ev.currentTarget.querySelector("img") ?? ev.currentTarget)}
            className="relative flex w-full items-center gap-3 rounded-lg p-3 text-left text-white active:scale-[0.98]" style={{ background: AZUL }}>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-medium tracking-[0.15em] text-white/80">SEU LIVRO DO DIA 1</p>
              <p className="mt-1 line-clamp-3 text-base font-bold leading-tight">{primeiro.titulo}</p>
            </div>
            <img src={primeiro.capa} alt="" draggable={false} className="h-[84px] w-[60px] shrink-0 rounded object-cover shadow-lg" />
          </button>
        )}

        <div>
          <div className="mb-2 flex items-baseline justify-between"><p className="text-lg font-extrabold">Seu plano</p><span className="text-xs font-semibold" style={{ color: AZUL }}>Ver Todos</span></div>
          <div className="-mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {livros.map((l) => {
              const dica1 = l.id === primeiro?.id && !tocouAlgum;
              return (
                <button key={l.id} type="button" aria-label={`Abrir ${l.titulo}`} onClick={(ev) => abrir(l, ev.currentTarget.querySelector("img") ?? ev.currentTarget)}
                  className="relative w-[118px] shrink-0 snap-start text-left transition-transform active:scale-95">
                  <img src={l.capa} alt="" draggable={false} loading="lazy" className={cn("h-[168px] w-[118px] rounded-lg object-cover shadow-md", !l.amostra && "opacity-70")} />
                  {!l.amostra && <span className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"><Lock className="h-3 w-3" /></span>}
                  {dica1 && <span className="pointer-events-none absolute -bottom-2 right-0 z-10 select-none text-4xl drop-shadow-lg motion-safe:animate-bounce" aria-hidden>👆</span>}
                  <span className="mt-1.5 line-clamp-2 block text-[11px] font-extrabold uppercase leading-tight">{l.titulo}</span>
                  {l.minutos ? <span className="block text-[11px] font-semibold" style={{ color: VERDE }}>🔊 {l.minutos} minutos</span> : null}
                </button>
              );
            })}
          </div>
          {!tocouAlgum && primeiro && (
            <p className="mx-auto mt-1 w-fit rounded-full px-3 py-1.5 text-xs font-bold text-white shadow-lg motion-safe:animate-pulse" style={{ background: AZUL }}>{dica}</p>
          )}
        </div>
      </div>
      <BarraAbas ativa="home" />
    </>
  );
}

// A capa cresce da lista até o lugar onde fica no detalhe do livro.
function VooDaCapa({ voo }: { voo: Voo }) {
  const [destino, setDestino] = useState(false);
  useLayoutEffect(() => { const id = requestAnimationFrame(() => setDestino(true)); return () => cancelAnimationFrame(id); }, []);
  const origem = { left: voo.de.left, top: voo.de.top, width: voo.de.width, height: voo.de.height };
  return createPortal(
    <div className="pointer-events-auto fixed inset-0 z-[100]">
      <img src={voo.livro.capa} alt="" draggable={false} className="absolute rounded-md object-cover shadow-2xl"
        style={{ ...(destino ? voo.alvo : origem), transition: "all 560ms cubic-bezier(.22,1,.36,1)" }} />
    </div>, document.body);
}

function Redondo({ children, rotulo, onClick, pulsa, apagado }: { children: ReactNode; rotulo: string; onClick?: () => void; pulsa?: boolean; apagado?: boolean }) {
  return (
    <button type="button" aria-label={rotulo} onClick={onClick} disabled={!onClick}
      className={cn("flex h-12 w-12 items-center justify-center rounded-full text-white shadow-md active:scale-95", pulsa && "motion-safe:animate-pulse", apagado && "opacity-40")} style={{ background: AZUL }}>
      {children}
    </button>
  );
}

function LivroAberto({ livro, segundos, fimTexto, textoBloqueado, textoSemAmostra, aoEvento, aoVoltar }: {
  livro: LivroAmostra; segundos: number; fimTexto: string; textoBloqueado: string; textoSemAmostra: string;
  aoEvento: (detalhe: string) => void; aoVoltar: () => void;
}) {
  const am = livro.amostra;
  const temAudio = !!am?.audio_url;
  const paragrafos = (am?.texto ?? "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const temTexto = paragrafos.length > 0;
  const [tela, setTela] = useState<"detalhe" | "ouvindo" | "lendo">("detalhe");

  if (tela === "ouvindo" && temAudio) {
    return <Ouvindo livro={livro} url={am!.audio_url!} segundos={segundos} fimTexto={fimTexto} aoEvento={aoEvento}
      aoFechar={() => setTela("detalhe")} aoLer={temTexto ? () => setTela("lendo") : undefined} />;
  }
  if (tela === "lendo" && temTexto) {
    return <Lendo livro={livro} paragrafos={paragrafos} textoBloqueado={textoBloqueado} aoVoltar={() => setTela("detalhe")} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
      <div className="relative flex shrink-0 items-center justify-center px-4 pb-1 pt-5">
        <button type="button" onClick={aoVoltar} aria-label="Voltar" className="absolute left-3 flex h-9 w-9 items-center justify-center"><ChevronLeft className="h-6 w-6" /></button>
        <p className="text-sm font-bold">Detalhe do Livro</p>
      </div>
      <div className="flex shrink-0 flex-col items-center px-5 pt-3 text-center">
        <img src={livro.capa} alt="" draggable={false} className="h-[200px] w-[140px] rounded-md object-cover shadow-[0_10px_24px_rgba(0,0,0,0.28)]" />
        <p className="mt-4 line-clamp-2 text-base font-extrabold leading-tight">{livro.titulo}</p>
        <p className="mt-0.5 line-clamp-1 text-xs">{livro.autor}</p>
        <div className="mt-4 flex items-center justify-center gap-4">
          <Redondo rotulo="Baixar"><Download className="h-5 w-5" /></Redondo>
          <Redondo rotulo="Ler a amostra" onClick={temTexto ? () => setTela("lendo") : undefined} pulsa={temTexto} apagado={!temTexto}><BookOpenText className="h-5 w-5" /></Redondo>
          <Redondo rotulo="Ouvir a amostra" onClick={temAudio ? () => setTela("ouvindo") : undefined} pulsa={temAudio} apagado={!temAudio}><Play className="ml-0.5 h-5 w-5" fill="currentColor" /></Redondo>
          <Redondo rotulo="Compartilhar"><Share2 className="h-5 w-5" /></Redondo>
        </div>
      </div>
      <div className="mt-4 min-h-0 flex-1 rounded-t-3xl bg-white px-6 pb-2 pt-3 text-center shadow-[0_-8px_20px_rgba(0,0,0,0.08)]">
        <div className="mx-auto mb-3 h-1 w-14 rounded-full bg-black/10" />
        <p className="text-sm font-extrabold">Sobre esse Livro</p>
        <div className="mt-2 flex justify-center gap-1">{[0, 1, 2, 3, 4].map((i) => <Star key={i} className="h-5 w-5 text-yellow-400" fill="currentColor" />)}</div>
        {am
          ? <p className="mt-2 text-xs leading-snug">{livro.minutos ? `${livro.minutos} minutos de resumo. ` : ""}Toque em ▶ para ouvir ou em 📖 para ler um trecho agora.</p>
          : (
            <div className="mt-2 space-y-1">
              <p className="flex items-center justify-center gap-1.5 text-sm font-extrabold">🔒 Disponível no seu plano completo</p>
              <p className="text-xs leading-snug">{textoSemAmostra}</p>
            </div>
          )}
      </div>
      <BarraAbas ativa="biblioteca" />
    </div>
  );
}

function Ouvindo({ livro, url, segundos, fimTexto, aoEvento, aoFechar, aoLer }: {
  livro: LivroAmostra; url: string; segundos: number; fimTexto: string; aoEvento: (d: string) => void; aoFechar: () => void; aoLer?: () => void;
}) {
  const [tocando, setTocando] = useState(false);
  const [atual, setAtual] = useState(0);
  const [duracao, setDuracao] = useState(0);
  const [acabou, setAcabou] = useState(false);
  const [vel, setVel] = useState(1);
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
  // Abriu o player = já começa a tocar (o toque no ▶ liberou o som).
  useEffect(() => { void audio.current?.play().catch(() => setTocando(false)); }, []);

  const alternar = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) {
      if (acabou || a.currentTime >= limite) { a.currentTime = 0; setAcabou(false); }
      void a.play().catch(() => setTocando(false));
    } else a.pause();
  };
  const pular = (d: number) => { const a = audio.current; if (a) a.currentTime = Math.max(0, Math.min(limite - 0.1, a.currentTime + d)); };
  const mudarVel = () => { const v = vel === 1 ? 1.25 : vel === 1.25 ? 1.5 : 1; setVel(v); if (audio.current) audio.current.playbackRate = v; };
  const sair = (fn: () => void) => () => { audio.current?.pause(); fn(); };

  return (
    <div className="flex min-h-0 flex-1 flex-col px-5 pb-4 pt-5 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300" style={{ background: "linear-gradient(180deg,#C9DCEB 0%,#E6EEF7 45%,#F6F9FC 100%)" }}>
      <audio ref={audio} src={url} preload="auto"
        onLoadedMetadata={(ev) => setDuracao(ev.currentTarget.duration || 0)}
        onPlay={() => { jaTocou.current = true; setTocando(true); setAcabou(false); avisar(false); }}
        onPause={() => { setTocando(false); avisar(false); }}
        onTimeUpdate={(ev) => {
          const t = ev.currentTarget.currentTime;
          setAtual(t); if (t > maxOuvido.current) maxOuvido.current = t;
          if (t >= limite) { ev.currentTarget.pause(); setAcabou(true); evento.current(`ouviu=${Math.round(maxOuvido.current)}s;total=${Math.round(limite)}s;fim=sim`); }
        }}
        onEnded={() => { setAcabou(true); evento.current(`ouviu=${Math.round(maxOuvido.current)}s;total=${Math.round(limite)}s;fim=sim`); }} />
      <div className="relative flex shrink-0 items-center justify-between">
        <button type="button" onClick={sair(aoFechar)} aria-label="Voltar" className="flex h-9 w-9 items-center justify-center"><ChevronDown className="h-6 w-6" /></button>
        <p className="absolute inset-x-0 text-center text-sm font-bold">Ouvindo</p>
        <button type="button" onClick={sair(aoFechar)} aria-label="Fechar" className="relative flex h-9 w-9 items-center justify-center rounded-full bg-[#BBD0E6]"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-center">
        <img src={livro.capa} alt="" draggable={false} className="h-[min(210px,32dvh)] w-auto max-w-[70%] rounded-lg object-cover shadow-[0_12px_28px_rgba(0,0,0,0.25)]" />
        <p className="mt-2 line-clamp-2 text-base font-extrabold leading-tight">{livro.titulo}</p>
        <p className="line-clamp-1 text-xs">{livro.autor}</p>
      </div>
      <div className="shrink-0 space-y-3">
        <div>
          <div className="mb-1 flex justify-between text-[11px] tabular-nums"><span>{mmss(atual)}</span><span>{mmss(limite)}</span></div>
          <div className="relative h-1.5 rounded-full bg-black/10">
            <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.min(100, (atual / limite) * 100)}%`, background: AZUL }} />
            <span className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full shadow" style={{ left: `${Math.min(100, (atual / limite) * 100)}%`, background: AZUL }} />
          </div>
        </div>
        <div className="flex items-center justify-center gap-7">
          <button type="button" onClick={() => pular(-15)} aria-label="Voltar 15 segundos" className="text-xs font-extrabold active:scale-90">−15</button>
          <button type="button" onClick={alternar} aria-label={tocando ? "Pausar" : "Ouvir a amostra"} className="flex h-16 w-16 items-center justify-center rounded-full text-white shadow-lg active:scale-95" style={{ background: AZUL }}>
            {tocando ? <Pause className="h-7 w-7" fill="currentColor" /> : <Play className="ml-0.5 h-7 w-7" fill="currentColor" />}
          </button>
          <button type="button" onClick={() => pular(15)} aria-label="Avançar 15 segundos" className="text-xs font-extrabold active:scale-90">+15</button>
        </div>
        {acabou
          ? <p className="text-center text-sm font-bold" style={{ color: AZUL }}>{fimTexto}</p>
          : (
            <div className="flex items-center justify-between px-1">
              <button type="button" onClick={mudarVel} className="text-xs font-extrabold">{vel}x</button>
              {aoLer ? <button type="button" onClick={sair(aoLer)} aria-label="Ler"><BookOpenText className="h-5 w-5" /></button> : <span />}
              <Share2 className="h-5 w-5" aria-hidden />
            </div>
          )}
      </div>
    </div>
  );
}

function Lendo({ livro, paragrafos, textoBloqueado, aoVoltar }: { livro: LivroAmostra; paragrafos: string[]; textoBloqueado: string; aoVoltar: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
      <div className="relative flex shrink-0 items-center justify-between px-3 pb-1 pt-5">
        <button type="button" onClick={aoVoltar} aria-label="Voltar" className="flex h-9 w-9 items-center justify-center"><ChevronLeft className="h-6 w-6" /></button>
        <p className="absolute inset-x-0 text-center text-sm font-bold">Lendo</p>
        <MoreHorizontal className="relative mr-2 h-5 w-5" aria-hidden />
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden px-5 pt-3">
        <p className="text-base font-extrabold uppercase leading-snug">{livro.titulo}</p>
        <p className="mt-2 text-xs">{livro.autor}</p>
        <div className="mt-5 space-y-3 text-justify text-[13px] leading-relaxed">
          {paragrafos.slice(0, 2).map((p, i) => <p key={i}>{p}</p>)}
          {paragrafos.slice(2, 4).map((p, i) => <p key={i} className="select-none opacity-40 blur-[1.5px]" aria-hidden>{p}</p>)}
        </div>
        <div className="absolute inset-x-0 bottom-0 flex h-28 items-end justify-center bg-gradient-to-b from-transparent via-white/90 to-white pb-4">
          <p className="flex items-center gap-1.5 text-sm font-extrabold" style={{ color: AZUL }}><Lock className="h-4 w-4" />{textoBloqueado}</p>
        </div>
      </div>
    </div>
  );
}
