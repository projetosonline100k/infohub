import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, Fingerprint } from "lucide-react";
import { cn } from "@/lib/utils";
import { limitesDoNumero, preencherCalculos, valoresDoNumero, type ConfigNumero } from "@/lib/quiz/numeros";
import type { ConfigDepoimentoAnimado } from "@/lib/quiz/quiz";

// Telas e perguntas "de número" do quiz V2 do Instalivros (15/11/2026, a partir do app Ziggur): roleta, régua, barras dos mentores, depoimento animado,
// projeção em livros, compromisso (segurar o botão) e o plano em números. Só visual: os cálculos ficam em src/lib/quiz/numeros.ts.

interface Visual { cor: string; escuro: boolean; suave: string }

/** Número que sobe (ou desce) de `de` até `alvo` em `ms`, só depois de `ativo`. */
function useContagem(alvo: number, ativo: boolean, ms = 1600, de = 0) {
  const [n, setN] = useState(de);
  useEffect(() => {
    if (!ativo) { setN(de); return; }
    let raf = 0;
    const ini = performance.now();
    const passo = (agora: number) => {
      const p = Math.min(1, (agora - ini) / ms);
      setN(Math.round(de + (alvo - de) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [alvo, ativo, ms, de]);
  return n;
}

// ---------------------------------------------------------------- Roleta (Ziggur 06)

const ALTURA_ITEM = 52;
const ITENS_VISIVEIS = 5;

/** Roleta vertical: a pessoa rola e o número do meio vale; embaixo, um selo muda com a faixa do número. */
export function RoletaNumero({ config, valor, selo, aoMudar, cor, escuro, suave }: { config: ConfigNumero; valor: number | undefined; selo?: string; aoMudar: (n: number) => void } & Visual) {
  const valores = useMemo(() => valoresDoNumero(config), [config]);
  const { max, inicial } = limitesDoNumero(config);
  const atual = valor ?? inicial;
  const indice = Math.max(0, valores.indexOf(atual));
  const raiz = useRef<HTMLDivElement>(null);
  const [vista, setVista] = useState(indice);   // posição durante a rolagem (destaca o item do meio)
  useLayoutEffect(() => { raiz.current?.scrollTo({ top: indice * ALTURA_ITEM }); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const rolou = () => {
    const el = raiz.current; if (!el) return;
    const k = Math.max(0, Math.min(valores.length - 1, Math.round(el.scrollTop / ALTURA_ITEM)));
    setVista(k);
    if (valores[k] !== valor) aoMudar(valores[k]);
  };
  const folga = ((ITENS_VISIVEIS - 1) / 2) * ALTURA_ITEM;
  return (
    <div className="space-y-4">
      <div className="relative mx-auto w-44" style={{ height: ALTURA_ITEM * ITENS_VISIVEIS }}>
        {/* faixa do número escolhido */}
        <div className="pointer-events-none absolute inset-x-0 rounded-2xl border-2" style={{ top: folga, height: ALTURA_ITEM, borderColor: cor, background: escuro ? "rgba(255,255,255,.06)" : `${cor}10` }} />
        <div ref={raiz} onScroll={rolou} role="listbox" aria-label="Número"
          className="h-full snap-y snap-mandatory overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ paddingTop: folga, paddingBottom: folga, touchAction: "pan-y", maskImage: "linear-gradient(transparent, #000 30%, #000 70%, transparent)", WebkitMaskImage: "linear-gradient(transparent, #000 30%, #000 70%, transparent)" }}>
          {valores.map((v, k) => {
            const dist = Math.abs(k - vista);
            return (
              <button key={v} type="button" role="option" aria-selected={k === vista} onClick={() => raiz.current?.scrollTo({ top: k * ALTURA_ITEM, behavior: "smooth" })}
                className={cn("flex w-full snap-center items-center justify-center font-extrabold tabular-nums transition-all duration-150", dist === 0 ? "text-4xl" : dist === 1 ? "text-2xl opacity-60" : "text-xl opacity-30")}
                style={{ height: ALTURA_ITEM, color: dist === 0 && !escuro ? cor : undefined }}>
                {config.mais && v >= max ? `${v}+` : v}
              </button>
            );
          })}
        </div>
      </div>
      {config.unidade && <p className={cn("text-center text-sm font-medium", suave)}>{config.unidade}</p>}
      {selo && (
        <div key={selo} className="flex justify-center animate-in fade-in zoom-in-95 duration-300">
          <span className="rounded-full px-4 py-2 text-sm font-bold text-white shadow-md" style={{ background: cor }}>{selo}</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Régua (Ziggur 09)

/** Régua arrastável (min–max): o valor grande e a linha "≈ X resumos por mês" se recalculam enquanto ela arrasta. */
export function ReguaNumero({ config, valor, aoMudar, cor, escuro, suave }: { config: ConfigNumero; valor: number | undefined; aoMudar: (n: number) => void } & Visual) {
  const { min, max, passo, inicial } = limitesDoNumero(config);
  const atual = valor ?? inicial;
  const pct = max > min ? ((atual - min) / (max - min)) * 100 : 0;
  const linha = preencherCalculos(config.linha ?? "≈ {resumos_mes} resumos por mês", atual, config);
  return (
    <div className={cn("space-y-5 rounded-2xl border p-5 shadow-sm", escuro ? "border-white/15 bg-white/5" : "border-gray-200 bg-white")}>
      <div className="text-center">
        <span className="text-6xl font-extrabold tabular-nums leading-none" style={{ color: escuro ? undefined : cor }}>{atual}</span>
        {config.unidade && <span className={cn("ml-2 text-lg font-semibold", suave)}>{config.unidade}</span>}
      </div>
      <input type="range" min={min} max={max} step={passo} value={atual} aria-label={config.unidade ?? "Valor"}
        onChange={(ev) => aoMudar(Number(ev.target.value))}
        className="h-9 w-full cursor-pointer touch-pan-y appearance-none rounded-full bg-transparent [&::-moz-range-thumb]:h-8 [&::-moz-range-thumb]:w-8 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-4 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-[var(--cor)] [&::-webkit-slider-thumb]:h-8 [&::-webkit-slider-thumb]:w-8 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-[var(--cor)] [&::-webkit-slider-thumb]:shadow-lg"
        style={{ ["--cor" as string]: cor, background: `linear-gradient(to right, ${cor} ${pct}%, ${escuro ? "rgba(255,255,255,.18)" : "#e5e7eb"} ${pct}%) center / 100% 8px no-repeat` }} />
      <div className={cn("flex justify-between text-xs font-semibold", suave)}><span>{min} min</span><span>{max} min</span></div>
      <p className="text-center text-base font-bold" aria-live="polite">{linha}</p>
    </div>
  );
}

// ---------------------------------------------------------------- Barras pelos mentores (Ziggur 10)

export interface BarraMentor { nome: string; livros?: number; fato?: string; foto?: string; fonte?: string; voce?: boolean }

/** Uma barra por mentor (livros por ano); a barra "Você" aparece em destaque. As barras crescem quando a tela entra. */
export function BarrasMentores({ barras, fontes, cor, escuro, suave }: { barras: BarraMentor[]; fontes: string[] } & Visual) {
  const maior = Math.max(1, ...barras.map((b) => b.livros ?? 0));
  const [entrou, setEntrou] = useState(false);
  useEffect(() => { const t = setTimeout(() => setEntrou(true), 150); return () => clearTimeout(t); }, []);
  return (
    <div className="space-y-3">
      {/* Lista longa (até 10 mentores) rola dentro do card para o Continuar não sair da tela. */}
      <div className="max-h-[42dvh] space-y-3 overflow-y-auto pr-1">
        {barras.map((b, k) => (
          <div key={b.nome} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                {b.foto && <img src={b.foto} alt="" draggable={false} className="h-7 w-7 shrink-0 rounded-full object-cover" />}
                <span className={cn("font-semibold", b.voce && "underline decoration-2 underline-offset-4")}>{b.nome}</span>
              </span>
              {b.livros !== undefined
                ? <span className="shrink-0 font-bold tabular-nums">{b.livros} livros/ano</span>
                : <span className={cn("text-right text-xs", suave)}>{b.fato}</span>}
            </div>
            {b.livros !== undefined && (
              <div className={cn("h-4 overflow-hidden rounded-full", escuro ? "bg-white/10" : "bg-gray-200")}>
                <div className="h-full rounded-full transition-[width] duration-1000 ease-out" style={{ width: entrou ? `${(b.livros / maior) * 100}%` : "0%", transitionDelay: `${k * 150}ms`, background: b.voce ? "#94a3b8" : cor }} />
              </div>
            )}
          </div>
        ))}
      </div>
      {fontes.length > 0 && <p className={cn("text-[11px] leading-snug", suave)}>Fonte: {fontes.join("; ")}.</p>}
    </div>
  );
}

// ---------------------------------------------------------------- Depoimento animado (Ziggur 08)

/** O texto se escreve sozinho; depois um trecho é riscado, outro grifado e os números "antes → agora" contam. */
export function DepoimentoAnimado({ cfg, cor, escuro, suave }: { cfg: ConfigDepoimentoAnimado } & Visual) {
  const total = cfg.texto.length;
  const [digitado, setDigitado] = useState(0);
  const [etapa, setEtapa] = useState(0);   // 1 = riscado, 2 = grifado, 3 = números
  useEffect(() => {
    if (digitado < total) { const t = setTimeout(() => setDigitado((d) => Math.min(total, d + 1)), 28); return () => clearTimeout(t); }
    if (etapa < 3) { const t = setTimeout(() => setEtapa((x) => x + 1), etapa === 0 ? 500 : 900); return () => clearTimeout(t); }
  }, [digitado, etapa, total]);
  const trecho = (t?: string) => { const i = t ? cfg.texto.indexOf(t) : -1; return i >= 0 && t ? ([i, i + t.length] as const) : null; };
  const ri = trecho(cfg.riscado), gr = trecho(cfg.grifado);
  // Parte o texto nos pontos em que o riscado/grifado começam e terminam e mostra só o que já foi escrito.
  const pontos = [0, ...(ri ?? []), ...(gr ?? []), total].sort((a, b) => a - b).filter((v, i, l) => l.indexOf(v) === i);
  const pedacos: ReactNode[] = [];
  for (let k = 0; k < pontos.length - 1; k++) {
    const [a, b] = [pontos[k], pontos[k + 1]];
    if (digitado <= a) break;
    const dentro = (r: readonly [number, number] | null) => !!r && a >= r[0] && b <= r[1];
    const riscado = dentro(ri) && etapa >= 1, grifado = dentro(gr) && etapa >= 2;
    pedacos.push(
      <span key={k} className={cn("rounded transition-all duration-500", riscado && "line-through decoration-2 opacity-60")} style={grifado ? { background: "#fde68a", color: "#1f2937" } : undefined}>{cfg.texto.slice(a, Math.min(b, digitado))}</span>,
    );
  }
  return (
    <div className="space-y-5">
      <figure className={cn("rounded-2xl border p-5 text-left shadow-sm", escuro ? "border-white/15 bg-white/5" : "border-gray-200 bg-white")}>
        <blockquote className="min-h-[5.5rem] text-lg font-medium leading-snug">“{pedacos}{digitado < total && <span className="ml-0.5 inline-block h-5 w-0.5 animate-pulse align-middle" style={{ background: cor }} />}{digitado >= total && "”"}</blockquote>
        {cfg.autor && <figcaption className={cn("mt-2 text-sm", suave)}>{cfg.autor}</figcaption>}
      </figure>
      {!!cfg.numeros?.length && (
        <div className={cn("grid gap-2 transition-all duration-700", cfg.numeros.length > 1 ? "grid-cols-2" : "grid-cols-1", etapa >= 3 ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0")}>
          {cfg.numeros.map((n, k) => <NumeroAntesAgora key={k} n={n} ativo={etapa >= 3} cor={cor} escuro={escuro} suave={suave} />)}
        </div>
      )}
    </div>
  );
}

function NumeroAntesAgora({ n, ativo, cor, escuro, suave }: { n: { rotulo: string; antes: number; agora: number }; ativo: boolean } & Visual) {
  const contando = useContagem(n.agora, ativo, 1500, n.antes);
  return (
    <div className={cn("rounded-2xl border px-3 py-3 text-center", escuro ? "border-white/15 bg-white/5" : "border-gray-200 bg-white")}>
      <p className={cn("text-xs font-semibold uppercase tracking-wide", suave)}>{n.rotulo}</p>
      <p className="mt-1 flex items-center justify-center gap-2 text-2xl font-extrabold tabular-nums">
        <span className="opacity-50 line-through decoration-2">{n.antes}</span><span aria-hidden>→</span><span style={{ color: escuro ? undefined : cor }}>{contando}</span>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- Projeção (Ziggur 15)

const CORES_LOMBADA = ["#31428B", "#e11d48", "#f59e0b", "#10b981", "#8b5cf6", "#0ea5e9"];

/** Livros caindo e empilhando e o número de livros contando até o total. */
export function ProjecaoLivros({ livros, cor, escuro, suave }: { livros: number } & Visual) {
  const n = useContagem(livros, true, 2200);
  // pirâmide: 5 livros embaixo, 4, 3, 2, 1
  const linhas = [5, 4, 3, 2, 1];
  let i = 0;
  return (
    <div className="space-y-3">
      <div className="mx-auto flex h-44 w-64 flex-col-reverse items-center justify-start gap-0.5 overflow-hidden" aria-hidden>
        {linhas.map((qtd, r) => (
          <div key={r} className="flex items-end justify-center gap-1">
            {Array.from({ length: qtd }, () => {
              const k = i++;
              return (
                <span key={k} className="h-7 w-10 rounded-sm shadow-md motion-safe:animate-livro-cai" style={{ background: CORES_LOMBADA[k % CORES_LOMBADA.length], animationDelay: `${k * 130}ms`, ["--rot" as string]: `${((k * 7) % 5) - 2}deg`, borderBottom: "3px solid rgba(0,0,0,.25)" }} />
              );
            })}
          </div>
        ))}
      </div>
      <div className="text-center">
        <span className="text-7xl font-extrabold tabular-nums leading-none" style={{ color: escuro ? undefined : cor }}>{n}</span>
        <p className={cn("mt-1 text-sm font-semibold", suave)}>livros em 12 meses</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Compromisso: segurar o botão (18/11/2026, pedido do Davi)

const TEMPO_SEGURAR = 2000;   // ms segurando até completar
const TEMPO_VOLTAR = 450;     // ms para a barra voltar a zero se soltar antes
const CONFETES = ["#22c55e", "#facc15", "#38bdf8", "#f472b6", "#fb923c", "#a78bfa"];

/** Botão "Segure para se comprometer": a barra enche em ~2 s; soltar antes volta. Ao completar mostra o cartão com a assinatura sendo escrita.
 *  `aoMudar(true)` chega ~1,5 s depois da animação (libera o Continuar). `jaFez`: voltou à tela depois de ter se comprometido (mostra o cartão pronto). */
export function SegureCompromisso({ aoMudar, jaFez, nome, minutos, rotulo = "Segure para se comprometer", cor, escuro, suave }: { aoMudar: (fez: boolean) => void; jaFez?: boolean; nome?: string; minutos?: number; rotulo?: string } & Visual) {
  const reduzido = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [progresso, setProgresso] = useState(jaFez ? 1 : 0);
  const [feito, setFeito] = useState(!!jaFez);
  const prog = useRef(jaFez ? 1 : 0);
  const segurando = useRef(false);
  const raf = useRef(0);
  const ultimo = useRef(0);
  const completou = useRef(!!jaFez);
  const aoMudarRef = useRef(aoMudar);
  aoMudarRef.current = aoMudar;

  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  useEffect(() => {
    if (!feito || jaFez) return;
    const t = setTimeout(() => aoMudarRef.current(true), 1500);
    return () => clearTimeout(t);
  }, [feito, jaFez]);

  const passo = (agora: number) => {
    const dt = Math.min(64, agora - ultimo.current); ultimo.current = agora;
    prog.current = segurando.current ? Math.min(1, prog.current + dt / TEMPO_SEGURAR) : Math.max(0, prog.current - dt / TEMPO_VOLTAR);
    setProgresso(prog.current);
    if (segurando.current && prog.current >= 1) {
      completou.current = true; setFeito(true);
      try { navigator.vibrate?.([60, 40, 120]); } catch { /* sem vibração */ }
      return;
    }
    if (segurando.current || prog.current > 0) raf.current = requestAnimationFrame(passo);
  };
  const comecar = () => {
    if (completou.current || segurando.current) return;
    segurando.current = true; ultimo.current = performance.now();
    cancelAnimationFrame(raf.current); raf.current = requestAnimationFrame(passo);
    try { navigator.vibrate?.(15); } catch { /* sem vibração */ }
  };
  const soltar = () => { segurando.current = false; };

  const hoje = new Date().toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
  const primeiroNome = (nome ?? "").trim().split(/\s+/)[0];
  const anim = (css: string) => (reduzido || jaFez ? undefined : css);

  return (
    <div className="space-y-3">
      <style>{`
        @keyframes cmp-escrever { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
        @keyframes cmp-entrar { from { opacity: 0; transform: translateY(12px) scale(.96); } to { opacity: 1; transform: none; } }
        @keyframes cmp-confete { 0% { opacity: 1; transform: translate(0,0) rotate(0); } 100% { opacity: 0; transform: translate(var(--dx), var(--dy)) rotate(var(--rot)); } }
      `}</style>
      <div className="relative">
        <button type="button" disabled={feito} aria-label={feito ? "Compromisso feito" : rotulo}
          onPointerDown={(ev) => { ev.currentTarget.setPointerCapture?.(ev.pointerId); comecar(); }}
          onPointerUp={soltar} onPointerCancel={soltar} onLostPointerCapture={soltar} onContextMenu={(ev) => ev.preventDefault()}
          onKeyDown={(ev) => { if ((ev.key === " " || ev.key === "Enter") && !ev.repeat) { ev.preventDefault(); comecar(); } }} onKeyUp={soltar} onBlur={soltar}
          className={cn("relative flex h-16 w-full touch-none select-none items-center justify-center gap-2 overflow-hidden rounded-2xl text-base font-bold transition-colors",
            feito ? "bg-green-500 text-white" : escuro ? "bg-white/10 text-white" : "bg-gray-100 text-gray-800")}
          style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none" }}>
          {!feito && <span className="absolute inset-y-0 left-0" style={{ width: `${progresso * 100}%`, backgroundColor: cor, opacity: 0.9 }} aria-hidden />}
          <span className={cn("relative z-10 flex items-center gap-2", !feito && progresso > 0.45 && "text-white")}>
            {feito ? <><Check className="h-6 w-6" strokeWidth={3} />Compromisso feito</> : <><Fingerprint className="h-6 w-6" />{rotulo}</>}
          </span>
        </button>
        {feito && !reduzido && !jaFez && (
          <div className="pointer-events-none absolute inset-x-0 top-1/2" aria-hidden>
            {Array.from({ length: 18 }, (_, i) => {
              const ang = (i / 18) * Math.PI * 2, d = 70 + (i % 3) * 30;
              return <span key={i} className="absolute left-1/2 h-2 w-1.5 rounded-sm" style={{ backgroundColor: CONFETES[i % CONFETES.length], animation: `cmp-confete 1.1s ease-out ${(i % 4) * 40}ms forwards`,
                ["--dx" as string]: `${Math.cos(ang) * d * 1.6}px`, ["--dy" as string]: `${Math.sin(ang) * d - 20}px`, ["--rot" as string]: `${i * 53}deg` }} />;
            })}
          </div>
        )}
      </div>
      {feito && (
        <div className="space-y-2" role="status">
          <p className="text-center text-lg font-extrabold" style={{ animation: anim("cmp-entrar .5s ease-out both") }}>Você se comprometeu! 🎉</p>
          <div className={cn("rounded-2xl border-2 px-4 py-3 text-center", escuro ? "border-white/20 bg-white/5" : "border-gray-200 bg-white")}
            style={{ animation: anim("cmp-entrar .6s ease-out .15s both") }}>
            <p className={cn("text-[11px] font-bold uppercase tracking-widest", suave)}>Compromisso de leitura</p>
            <p className="mt-1 text-sm leading-snug">
              Eu{primeiroNome ? `, ${primeiroNome},` : ""} me comprometo a ler{typeof minutos === "number" && minutos > 0 ? ` ${minutos} minutos por dia e` : ""} seguir o meu plano
            </p>
            <p className={cn("mt-1 text-xs", suave)}>{hoje}</p>
            <div className="mt-2 border-b border-current/30 pb-1" style={{ opacity: 1 }}>
              <span className="inline-block text-3xl leading-tight" style={{ fontFamily: "'Segoe Script','Snell Roundhand','Brush Script MT','Apple Chancery',cursive", color: escuro ? undefined : cor, animation: anim("cmp-escrever 1.4s steps(28, end) .5s both") }}>
                {primeiroNome || "Assinado ✓"}
              </span>
            </div>
            <p className={cn("mt-0.5 text-[10px]", suave)}>Assinatura</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Plano em números (Ziggur 24)

export interface LinhaDoPlano { emoji: string; rotulo: string; valor: string }

/** Resumo com os números dela, dentro da tela de perfil/plano. */
export function PlanoEmNumeros({ titulo, linhas, cor, escuro, suave }: { titulo: string; linhas: LinhaDoPlano[] } & Visual) {
  if (!linhas.length) return null;
  return (
    <div className="mx-auto max-w-sm space-y-2 text-left">
      <p className={cn("text-xs font-bold uppercase tracking-wider", suave)}>{titulo}</p>
      <div className={cn("divide-y rounded-2xl border", escuro ? "divide-white/10 border-white/15 bg-white/5" : "divide-gray-100 border-gray-200 bg-white")}>
        {linhas.map((l, k) => (
          <div key={k} className="flex items-center gap-3 px-3.5 py-3">
            <span className="text-2xl leading-none">{l.emoji}</span>
            <span className={cn("min-w-0 flex-1 text-sm", suave)}>{l.rotulo}</span>
            <b className="text-right text-[15px]" style={{ color: escuro ? undefined : cor }}>{l.valor}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
