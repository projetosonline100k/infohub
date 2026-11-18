import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BookOpen, Headphones, Lock, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

// Tela "amostra" do quiz (18/11/2026, Davi, vendo o app Ziggur: "uma amostra grátis, a pessoa já usa o app"): "Seu primeiro livro chegou",
// ela toca no livro, ele abre como num app com Ouvir / Ler e só um pedaço do conteúdo. Só visual e player; quem escolhe o livro é o QuizPlayer.

export interface LivroAmostra { titulo: string; autor: string; capa: string; minutos?: number; audio_url?: string; texto?: string }

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function AmostraTela({ livro, titulo, aviso, fimTexto, textoBloqueado, segundos, botao, aoEvento, cor, escuro, suave }: {
  livro: LivroAmostra; titulo: ReactNode; aviso: string; fimTexto: string; textoBloqueado: string; segundos: number; botao: ReactNode;
  /** `detalhe` curto para o registro da sessão: "abriu" ou "ouviu=42s;total=75s;fim=nao". */
  aoEvento: (detalhe: string) => void; cor: string; escuro: boolean; suave: string;
}) {
  const [aberto, setAberto] = useState(false);
  const temAudio = !!livro.audio_url;
  const paragrafos = (livro.texto ?? "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
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

  if (!aberto) {
    return (
      <div className="space-y-5 py-2 text-center">
        <div className="text-2xl font-extrabold leading-snug">{titulo}</div>
        <button type="button" onClick={() => { setAberto(true); aoEvento("abriu"); }} aria-label={`Abrir ${livro.titulo}`}
          className={cn("mx-auto block w-56 rounded-2xl border p-4 shadow-xl transition-transform active:scale-95", escuro ? "border-white/15 bg-white/5" : "border-gray-200 bg-white")}>
          <img src={livro.capa} alt="" draggable={false} className="mx-auto h-64 w-44 animate-pulse rounded-lg object-cover shadow-2xl" />
          <span className="mt-3 block text-sm font-bold leading-tight">{livro.titulo}</span>
          <span className={cn("block truncate text-xs", suave)}>{livro.autor}</span>
        </button>
        <p className="text-sm font-semibold" style={{ color: escuro ? undefined : cor }}>{aviso}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center gap-3">
        <img src={livro.capa} alt="" draggable={false} className="h-[104px] w-[72px] shrink-0 rounded-lg object-cover shadow-lg" />
        <div className="min-w-0 space-y-1">
          <p className="line-clamp-3 text-lg font-extrabold leading-tight">{livro.titulo}</p>
          <p className={cn("truncate text-sm", suave)}>{livro.autor}</p>
          {livro.minutos ? <span className="inline-flex items-center gap-1 rounded-full bg-black/5 px-2 py-0.5 text-[11px] font-semibold"><Headphones className="h-3 w-3" />{livro.minutos} min</span> : null}
        </div>
      </div>

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
          <audio ref={audio} src={livro.audio_url} preload="metadata"
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
        <div className={cn("relative space-y-3 overflow-hidden rounded-2xl border p-4 text-[15px] leading-relaxed", aba !== "ler" && "hidden", escuro ? "border-white/15 bg-white/5" : "border-gray-200 bg-white")}>
          {paragrafos.slice(0, 2).map((p, i) => <p key={i}>{p}</p>)}
          <div className="relative">
            {paragrafos.slice(2, 4).map((p, i) => <p key={i} className="select-none opacity-40 blur-[1.5px]" aria-hidden>{p}</p>)}
            <div className={cn("flex items-center justify-center gap-1.5 py-3 text-sm font-bold", paragrafos.length > 2 && "absolute inset-0 bg-gradient-to-b from-transparent", paragrafos.length > 2 && (escuro ? "to-[#0a1a3a]" : "to-white"))}><Lock className="h-4 w-4" />{textoBloqueado}</div>
          </div>
        </div>
      )}

      {!temAudio && !temTexto && <p className={cn("flex items-center justify-center gap-1.5 text-center text-sm", suave)}><BookOpen className="h-4 w-4" />Amostra em breve</p>}
      <div className="sticky bottom-3 z-10 pt-1">{botao}</div>
    </div>
  );
}
