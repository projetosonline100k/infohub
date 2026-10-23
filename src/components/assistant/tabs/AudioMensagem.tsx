import { useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

// Áudio da conversa do WhatsApp (24/10, Davi: "fica borrado, não consigo avançar as partes do áudio nem
// acelerar"). O player padrão do WebKit vinha embaçado, sem velocidade e, com preload="none", sem dar para
// avançar. Aqui: tocar/pausar, barra para clicar ou arrastar, tempo e 1× / 1,5× / 2× (como no WhatsApp).
// O arquivo é baixado inteiro no primeiro play (vira um blob local), então avançar funciona mesmo se o
// receptor do Mac não aceitar pedidos por partes.

const VELOCIDADES = [1, 1.5, 2];
const CHAVE_VELOCIDADE = "whatsapp:velocidade-audio";
const lerVelocidade = () => { try { const v = Number(localStorage.getItem(CHAVE_VELOCIDADE)); return VELOCIDADES.includes(v) ? v : 1; } catch { return 1; } };
const tempo = (s: number) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00");

// Um áudio tocando de cada vez (dar play num pausa o outro).
let tocandoAgora: HTMLAudioElement | null = null;

export function AudioMensagem({ url, deMim }: { url: string; deMim: boolean }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const urlLocal = useRef<string | null>(null);
  const barra = useRef<HTMLDivElement>(null);
  const [carregando, setCarregando] = useState(false);
  const [tocando, setTocando] = useState(false);
  const [atual, setAtual] = useState(0);
  const [duracao, setDuracao] = useState(0);
  const [velocidade, setVelocidade] = useState(lerVelocidade);
  const [erro, setErro] = useState(false);

  useEffect(() => () => {
    audio.current?.pause();
    if (urlLocal.current) URL.revokeObjectURL(urlLocal.current);
  }, []);

  const preparar = async () => {
    if (audio.current) return audio.current;
    setCarregando(true);
    try {
      const blob = await fetch(url).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.blob(); });
      urlLocal.current = URL.createObjectURL(blob);
      const a = new Audio(urlLocal.current);
      a.playbackRate = velocidade;
      a.onloadedmetadata = () => setDuracao(a.duration);
      a.ontimeupdate = () => setAtual(a.currentTime);
      a.onplay = () => setTocando(true);
      a.onpause = () => setTocando(false);
      a.onended = () => { setTocando(false); setAtual(0); a.currentTime = 0; };
      audio.current = a;
      return a;
    } catch {
      setErro(true);
      return null;
    } finally {
      setCarregando(false);
    }
  };

  const alternar = async () => {
    const a = await preparar();
    if (!a) return;
    if (a.paused) {
      if (tocandoAgora && tocandoAgora !== a) tocandoAgora.pause();
      tocandoAgora = a;
      a.playbackRate = velocidade;
      void a.play();
    } else a.pause();
  };

  const irPara = async (clientX: number) => {
    const el = barra.current;
    const a = await preparar();
    if (!el || !a || !Number.isFinite(a.duration)) return;
    const r = el.getBoundingClientRect();
    a.currentTime = Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * a.duration;
    setAtual(a.currentTime);
  };

  const trocarVelocidade = () => {
    const nova = VELOCIDADES[(VELOCIDADES.indexOf(velocidade) + 1) % VELOCIDADES.length];
    setVelocidade(nova);
    if (audio.current) audio.current.playbackRate = nova;
    try { localStorage.setItem(CHAVE_VELOCIDADE, String(nova)); } catch { /* sem storage */ }
  };

  if (erro) return <span className="text-[11px] text-muted-foreground">Não consegui carregar o áudio (o Mac com o WhatsApp está ligado?).</span>;
  const progresso = duracao ? (atual / duracao) * 100 : 0;
  return (
    <div className="flex w-64 max-w-full items-center gap-2 py-0.5">
      <button type="button" onClick={() => void alternar()} aria-label={tocando ? "Pausar" : "Tocar"}
        className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", deMim ? "bg-emerald-700/40 text-white" : "bg-black/10 dark:bg-white/10")}>
        {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : tocando ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
      </button>
      <div className="min-w-0 flex-1">
        <div ref={barra} role="slider" aria-label="Posição do áudio" aria-valuemin={0} aria-valuemax={Math.round(duracao)} aria-valuenow={Math.round(atual)} tabIndex={0}
          className="relative h-4 cursor-pointer"
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); void irPara(e.clientX); }}
          onPointerMove={(e) => { if (e.buttons === 1) void irPara(e.clientX); }}
          onKeyDown={(e) => {
            const a = audio.current;
            if (!a) return;
            if (e.key === "ArrowRight") a.currentTime = Math.min(a.duration, a.currentTime + 5);
            if (e.key === "ArrowLeft") a.currentTime = Math.max(0, a.currentTime - 5);
          }}>
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-current opacity-20" />
          <div className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-sky-500" style={{ width: `${progresso}%` }} />
          <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-500 shadow" style={{ left: `${progresso}%` }} />
        </div>
        <p className="text-[10px] tabular-nums opacity-70">{tempo(atual)}{duracao ? ` / ${tempo(duracao)}` : ""}</p>
      </div>
      <button type="button" onClick={trocarVelocidade} title="Velocidade"
        className="shrink-0 rounded-full bg-black/10 px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums dark:bg-white/15">
        {String(velocidade).replace(".", ",")}×
      </button>
    </div>
  );
}
