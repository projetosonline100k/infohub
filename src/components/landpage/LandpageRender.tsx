import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { comUtm, type Utm } from "@/lib/quiz/utm";
import { linkSeguro, videoEmbutido, type Bloco, type ConfigLandpage } from "@/lib/landpage/landpage";

export type EventoLandpage = "play" | "metade" | "fim_video" | "cta";

interface Props { mostrarTudo?: boolean; config: ConfigLandpage; utm?: Utm; onEvento?: (tipo: EventoLandpage) => void; className?: string }

// A mesma página serve o editor (prévia) e o link público (/p/<slug>). No editor `onEvento` não existe: nada é gravado.
export function LandpageRender({ config, utm = {}, onEvento, className, mostrarTudo }: Props) {
  const escuro = config.escuro !== false;
  const cor = config.cor || "#16a34a";
  return (
    <div className={cn("mx-auto w-full space-y-10 px-5 py-8", escuro ? "bg-[#0b0b0f] text-white" : "bg-white text-neutral-900", className)} style={{ ["--lp-cor" as string]: cor }}>
      {config.blocos.map((b) => <Temporizado key={b.id} b={b} mostrarTudo={mostrarTudo}><BlocoView b={b} escuro={escuro} cor={cor} utm={utm} onEvento={onEvento} /></Temporizado>)}
    </div>
  );
}

/** Bloco com hora marcada (`aparecer_apos`): fica escondido até passar esse tempo desde que a página abriu. No editor (`mostrarTudo`) aparece sempre, com a etiqueta. */
function Temporizado({ b, mostrarTudo, children }: { b: Bloco; mostrarTudo?: boolean; children: React.ReactNode }) {
  const apos = Math.max(0, b.aparecer_apos ?? 0);
  const [passou, setPassou] = useState(apos === 0);
  useEffect(() => {
    if (apos === 0) { setPassou(true); return; }
    setPassou(false);
    const t = window.setTimeout(() => setPassou(true), apos * 1000);
    return () => window.clearTimeout(t);
  }, [apos]);
  if (!mostrarTudo && !passou) return null;
  return (
    <div className={passou || apos === 0 ? "animate-in fade-in duration-500" : ""}>
      {mostrarTudo && apos > 0 && <p className="mb-2 text-center text-[11px] font-semibold uppercase tracking-wider text-amber-500">Aparece depois de {apos}s</p>}
      {children}
    </div>
  );
}

function Botao({ texto, url, cor, utm, onEvento }: { texto?: string; url?: string; cor: string; utm: Utm; onEvento?: Props["onEvento"] }) {
  const href = linkSeguro(url);
  return (
    <a href={href === "#" ? href : comUtm(href, utm)} onClick={() => onEvento?.("cta")} className="mx-auto block w-full max-w-md rounded-xl px-6 py-4 text-center text-lg font-bold text-white shadow-lg transition-transform hover:scale-[1.02]" style={{ background: cor, boxShadow: `0 8px 28px -10px ${cor}` }}>
      {texto || "Quero começar"}
    </a>
  );
}

function Paragrafos({ texto, className }: { texto?: string; className?: string }) {
  return <div className={cn("space-y-3 text-base leading-relaxed", className)}>{(texto ?? "").split(/\n\s*\n/).map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}</div>;
}

function Vsl({ b, cor, utm, onEvento }: { b: Bloco; cor: string; utm: Utm; onEvento?: Props["onEvento"] }) {
  const v = b.video ? videoEmbutido(b.video) : null;
  const apos = Math.max(0, b.botao_apos ?? 0);
  const [mostrar, setMostrar] = useState(apos === 0);
  const [metade, fimMarcado] = [useRef(false), useRef(false)];
  // YouTube/Vimeo não avisam o tempo: o botão sai depois de `apos` segundos na página.
  useEffect(() => {
    if (apos === 0 || (v && v.tipo === "arquivo")) return;
    const t = window.setTimeout(() => setMostrar(true), apos * 1000);
    return () => window.clearTimeout(t);
  }, [apos, v?.tipo]);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className="space-y-5">
      {b.titulo && <h2 className="text-center text-2xl font-extrabold leading-tight">{b.titulo}</h2>}
      <div className="mx-auto aspect-video w-full max-w-3xl overflow-hidden rounded-2xl bg-black">
        {!v ? <div className="flex h-full items-center justify-center text-sm text-white/50">Cole o link do vídeo no editor</div>
          : v.tipo === "iframe" ? <iframe src={v.src} title="Vídeo" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen className="h-full w-full border-0" onLoad={() => undefined} />
          : (
            <video src={v.src} poster={b.poster || undefined} controls playsInline preload="metadata" className="h-full w-full"
              onPlay={() => onEvento?.("play")}
              onTimeUpdate={(e) => {
                const el = e.currentTarget;
                if (apos > 0 && el.currentTime >= apos) setMostrar(true);
                if (!metade.current && el.duration && el.currentTime / el.duration >= 0.5) { metade.current = true; onEvento?.("metade"); }
              }}
              onEnded={() => { setMostrar(true); if (!fimMarcado.current) { fimMarcado.current = true; onEvento?.("fim_video"); } }} />
          )}
      </div>
      {mostrar && b.botao_texto && <Botao texto={b.botao_texto} url={b.botao_url} cor={cor} utm={utm} onEvento={onEvento} />}
    </section>
  );
}

function BlocoView({ b, escuro, cor, utm, onEvento }: { b: Bloco; escuro: boolean; cor: string; utm: Utm; onEvento?: Props["onEvento"] }) {
  const suave = escuro ? "text-white/70" : "text-neutral-600";
  const cartao = escuro ? "border-white/15 bg-white/5" : "border-neutral-200 bg-neutral-50";
  switch (b.tipo) {
    case "vsl": return <Vsl b={b} cor={cor} utm={utm} onEvento={onEvento} />;
    case "titulo": return (
      <header className="mx-auto max-w-3xl space-y-3 text-center">
        <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">{b.titulo}</h1>
        {b.subtitulo && <p className={cn("text-lg", suave)}>{b.subtitulo}</p>}
      </header>
    );
    case "texto": return <Paragrafos texto={b.texto} className="mx-auto max-w-2xl" />;
    case "imagem": return b.url ? <figure className="mx-auto max-w-3xl"><img src={b.url} alt={b.titulo ?? ""} draggable={false} className="w-full rounded-2xl" /></figure> : <div className={cn("mx-auto max-w-3xl rounded-2xl border border-dashed p-8 text-center text-sm", suave)}>Cole o link da imagem no editor</div>;
    case "lista": return (
      <section className="mx-auto max-w-2xl space-y-4">
        {b.titulo && <h2 className="text-center text-2xl font-extrabold">{b.titulo}</h2>}
        <ul className="space-y-3">{(b.itens ?? []).map((it, i) => <li key={i} className={cn("flex items-start gap-3 rounded-xl border p-3", cartao)}><span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white" style={{ background: cor }}><Check className="h-4 w-4" /></span><span>{it}</span></li>)}</ul>
      </section>
    );
    case "depoimentos": return (
      <section className="mx-auto max-w-3xl space-y-4">
        {b.titulo && <h2 className="text-center text-2xl font-extrabold">{b.titulo}</h2>}
        <div className="grid gap-3 sm:grid-cols-2">
          {(b.depoimentos ?? []).map((d, i) => (
            <figure key={i} className={cn("space-y-3 rounded-2xl border p-4", cartao)}>
              <blockquote className="text-sm leading-relaxed">“{d.texto}”</blockquote>
              <figcaption className="flex items-center gap-2 text-sm font-semibold">{d.foto && <img src={d.foto} alt="" draggable={false} className="h-9 w-9 rounded-full object-cover" />}{d.nome}</figcaption>
            </figure>
          ))}
        </div>
      </section>
    );
    case "apresentacao": return (
      <section className={cn("mx-auto max-w-2xl space-y-3 rounded-2xl border p-5", cartao)}>
        <div className="flex items-center gap-4">
          {b.foto && <img src={b.foto} alt={b.nome ?? ""} draggable={false} className="h-20 w-20 shrink-0 rounded-full object-cover" />}
          <div><p className={cn("text-xs font-semibold uppercase tracking-wider", suave)}>{b.titulo}</p>{b.nome && <h3 className="text-xl font-extrabold">{b.nome}</h3>}</div>
        </div>
        <Paragrafos texto={b.texto} className={cn("text-sm", suave)} />
      </section>
    );
    case "preco": return (
      <section className={cn("mx-auto max-w-md space-y-4 rounded-3xl border p-6 text-center", cartao)}>
        {b.titulo && <h2 className="text-2xl font-extrabold">{b.titulo}</h2>}
        <div>
          {b.de && <p className={cn("text-sm line-through", suave)}>de {b.de}</p>}
          <p className="text-4xl font-extrabold" style={{ color: cor }}>{b.por}</p>
          {b.detalhe && <p className={cn("text-sm", suave)}>{b.detalhe}</p>}
        </div>
        <Botao texto={b.botao_texto} url={b.botao_url} cor={cor} utm={utm} onEvento={onEvento} />
        {b.garantia && <p className={cn("text-xs", suave)}>{b.garantia}</p>}
      </section>
    );
    case "faq": return (
      <section className="mx-auto max-w-2xl space-y-3">
        {b.titulo && <h2 className="text-center text-2xl font-extrabold">{b.titulo}</h2>}
        {(b.faq ?? []).map((f, i) => (
          <details key={i} className={cn("group rounded-xl border p-4", cartao)}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold">{f.p}<ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" /></summary>
            <Paragrafos texto={f.r} className={cn("mt-2 text-sm", suave)} />
          </details>
        ))}
      </section>
    );
    case "botao": return <Botao texto={b.botao_texto} url={b.botao_url} cor={cor} utm={utm} onEvento={onEvento} />;
  }
}
