import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ElementType, type ReactNode } from "react";
import { Award, BookOpen, BookCopy, Clock, Crosshair, Gamepad2, Sparkles, Star, Zap, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, ChevronDown, Copy, ImagePlus, Loader2, Lock, Mic, Plus, Quote, ShieldCheck, Trash2, VolumeX, X } from "lucide-react";
import confetti from "canvas-confetti";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  barrasDoResultado, calcularPerfil, comValor, corDoQuiz, montarPassos, preencher, primeiroNome,
  type BarraFixa, type CampoCaptura, type Depoimento, type EstruturaQuiz, type PerfilQuiz, type TelaQuiz,
} from "@/lib/quiz/quiz";
import { cn } from "@/lib/utils";

// O quiz rodando: abertura → perguntas (com telas de respiro, especialista e
// carregando no meio) → captura → resultado e oferta. Na página pública envia
// a resposta; no Infopro (teste) não grava nada. Com `editar`, o Davi clica num
// texto pra mudar a palavra e numa imagem pra enviar (onMudar/onImagem).
export interface FimDoQuiz { escolhas: Record<string, number>; perfil: PerfilQuiz | null; contato: Partial<Record<CampoCaptura, string>> }

const ROTULO_CAMPO: Record<CampoCaptura, { rotulo: string; tipo: string; exemplo: string }> = {
  nome: { rotulo: "Seu nome", tipo: "text", exemplo: "Como você se chama?" },
  email: { rotulo: "Seu e-mail", tipo: "email", exemplo: "voce@email.com" },
  whatsapp: { rotulo: "Seu WhatsApp", tipo: "tel", exemplo: "(11) 99999-9999" },
};
const LETRAS = "ABCDEFGH";
const ENTRA = "animate-in fade-in slide-in-from-bottom-3 duration-500";

// Jogo de montar o nome (Davi, 13/11): teclado de letras em botões grandes; cada toque faz a letra
// subir até a linha do nome. Sem teclado nativo do celular (que cobria a tela no navegador do Instagram).
const TECLAS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
const ACENTOS = ["Á", "É", "Í", "Ó", "Ú", "Ã", "Õ", "Â", "Ê", "Ô", "Ç"];
const maiusculaInicial = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

function NomeLetras({ valor, cor, escuro, suave, aoMudar }: { valor: string; cor: string; escuro: boolean; suave: string; aoMudar: (v: string) => void }) {
  const letras = Array.from(valor);
  const tecla = escuro ? "border-white/20 bg-white/10 text-white" : "border-gray-300 bg-white text-gray-800";
  const botao = "flex h-11 min-w-0 flex-1 items-center justify-center rounded-lg border-b-4 text-lg font-bold uppercase active:translate-y-0.5 active:border-b-2";
  const por = (l: string) => { if (letras.length < 20) aoMudar(maiusculaInicial(valor + l)); };
  return (
    <div className="space-y-3">
      <div className="flex min-h-14 flex-wrap items-end justify-center gap-1 border-b-2 pb-1" style={{ borderColor: cor }} aria-live="polite">
        {letras.length === 0 && <span className={cn("text-base", suave)}>toque nas letras</span>}
        {letras.map((l, i) => (
          <span key={`${i}-${l}`} className="inline-block text-4xl font-extrabold motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-16 motion-safe:zoom-in-50 motion-safe:duration-300" style={{ color: cor }}>{i === 0 ? l.toUpperCase() : l.toLowerCase()}</span>
        ))}
      </div>
      <div className="space-y-1.5">
        {TECLAS.map((linha, k) => (
          <div key={linha} className="flex justify-center gap-1">
            {Array.from(linha).map((l) => <button key={l} type="button" className={cn(botao, tecla)} onClick={() => por(l)}>{l}</button>)}
            {k === 2 && (
              <button type="button" aria-label="Apagar" className={cn(botao, "flex-[1.5]", tecla)} onClick={() => aoMudar(Array.from(valor).slice(0, -1).join(""))}>⌫</button>
            )}
          </div>
        ))}
        <div className="flex justify-center gap-1">
          {ACENTOS.map((l) => <button key={l} type="button" className={cn(botao, "h-10 text-base", tecla)} onClick={() => por(l)}>{l}</button>)}
        </div>
      </div>
    </div>
  );
}

interface Ctx {
  editar: boolean; mostrarFaltas: boolean; cor: string; escuro: boolean;
  mudarTexto: (caminho: string, valor: string) => void;
  mudarImagem: (caminho: string, arquivo: File | null) => void;
  // 25/10 (Davi): no teste da revisão também dá pra enviar a foto/áudio que falta, sem entrar no Editar.
  podeEnviar: boolean;
  aoClicarOferta?: () => void;   // métrica: clique no link da oferta
}
const QuizCtx = createContext<Ctx>({ editar: false, mostrarFaltas: false, cor: "#0ea5e9", escuro: false, mudarTexto: () => {}, mudarImagem: () => {}, podeEnviar: false });

// Texto do quiz: normal mostra já preenchido ({perfil}, {resposta:q1}); editando, o original.
function Txt({ caminho, valor, mostrar, as: Tag = "span", className }: {
  caminho: string; valor?: string; mostrar?: string; as?: ElementType; className?: string;
}) {
  const { editar, mudarTexto } = useContext(QuizCtx);
  if (editar) {
    return (
      <Tag contentEditable suppressContentEditableWarning title="Clique para editar"
        className={cn("cursor-text whitespace-pre-line rounded outline-dashed outline-1 outline-offset-2 outline-current focus:outline-2", !valor && "min-w-[4rem] opacity-50", className)}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
        onBlur={(e: React.FocusEvent<HTMLElement>) => { const t = e.currentTarget.innerText.trim(); if (t !== (valor ?? "").trim()) mudarTexto(caminho, t); }}>
        {valor || "…"}
      </Tag>
    );
  }
  const t = mostrar ?? valor;
  return t ? <Tag className={cn("whitespace-pre-line", className)}>{t}</Tag> : null;
}

// Imagem do quiz. Sem URL: no teste aparece o espaço reservado (com o que vai ali); no link público some.
function Img({ caminho, url, nota, className, redonda, inteira }: { caminho: string; url?: string; nota?: string; className?: string; redonda?: boolean; inteira?: boolean }) {
  const { editar: editando, mostrarFaltas, mudarImagem, podeEnviar } = useContext(QuizCtx);
  const editar = editando || (mostrarFaltas && podeEnviar);
  const input = useRef<HTMLInputElement>(null);
  const escolher = editar ? (e: React.MouseEvent) => { e.stopPropagation(); input.current?.click(); } : undefined;
  const campo = editar && (
    <input ref={input} type="file" accept="image/*" className="hidden"
      onChange={(e) => { const f = e.target.files?.[0]; if (f) mudarImagem(caminho, f); e.target.value = ""; }} />
  );
  if (url) {
    return (
      <div className={cn("group relative overflow-hidden", redonda ? "rounded-full" : "rounded-xl", className)}>
        <img src={url} alt={nota ?? ""} className={cn("h-full w-full", inteira ? "object-contain" : "object-cover")} />
        {editando && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
            <button type="button" onClick={escolher} className="rounded-md bg-white/90 px-2 py-1 text-xs text-black">Trocar</button>
            <button type="button" onClick={(e) => { e.stopPropagation(); mudarImagem(caminho, null); }} className="rounded-md bg-white/90 p-1 text-black"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        )}
        {campo}
      </div>
    );
  }
  if (!mostrarFaltas && !editar) return null;
  return (
    <div onClick={escolher} role={editar ? "button" : undefined}
      className={cn("flex flex-col items-center justify-center gap-1 border-2 border-dashed border-gray-500/40 p-3 text-center text-xs opacity-70",
        redonda ? "rounded-full" : "rounded-xl", editar && "cursor-pointer hover:opacity-100", className)}>
      <ImagePlus className="h-5 w-5" />
      <span className="font-medium">{nota ? `Falta: ${nota}` : "Falta imagem"}</span>
      {editar && <span className="opacity-70">clique para enviar</span>}
      {campo}
    </div>
  );
}

// Mascote animado (estilo Duolingo): entra pulando, acena devagar, fala no balão, pisca e fica respirando.
// `quadros` (13) = rosto [0 neutro, 1 meio piscado, 2 piscado, 3 boca leve, 4 boca aberta, 5 "o"],
// aceno [6 braço baixo … 11 braço descendo], [12 pulo] e gestos do outro braço [13…18, sem uso: não ficou bom].
// Os quadros ficam empilhados e só muda a opacidade (transição de 110 ms), então a troca é suave.
// Sem quadros: uma imagem só, flutuando. Anima em qualquer vista (inclusive no editor); lá, um botão sobre o
// mascote troca a imagem. Quem pede menos movimento vê só o quadro parado.
const Q = { PARADO: 0, PISCA_MEIO: 1, PISCA: 2, BOCA_LEVE: 3, BOCA_ABERTA: 4, BOCA_O: 5, ACENO: 6, PULO: 12 };
const N_QUADROS = 13;   // quadros em 320 px (leves): 6 de rosto, 6 de aceno e 1 de pulo
// [ms, quadro]: aceno lento → fala (só a boca) → parado. Toca UMA vez; depois ele só pisca (veja `piscar`).
const ROTEIRO: [number, number][] = [
  [0, Q.ACENO], [140, Q.ACENO + 1], [280, Q.ACENO + 2], [420, Q.ACENO + 3], [600, Q.ACENO + 4], [780, Q.ACENO + 3],
  [960, Q.ACENO + 4], [1140, Q.ACENO + 3], [1320, Q.ACENO + 4], [1500, Q.ACENO + 5], [1650, Q.ACENO + 2], [1800, Q.ACENO + 1], [1950, Q.PARADO],
  [2300, Q.BOCA_LEVE], [2450, Q.BOCA_ABERTA], [2600, Q.BOCA_LEVE], [2750, Q.BOCA_O], [2900, Q.BOCA_ABERTA], [3050, Q.BOCA_LEVE],
  [3200, Q.BOCA_ABERTA], [3350, Q.BOCA_LEVE], [3500, Q.PARADO],
];
const FIM_ROTEIRO_MS = 4200;
const FALA_MS = 3200;   // tempo de cada fala antes de emendar a próxima
function Mascote({ caminho, url, nota, fala, falas, onFala, quadros, abertura, onAberto, pose, balaoGrande }: { caminho: string; url?: string; nota?: string; fala?: string; falas?: string[]; onFala?: (i: number) => void; quadros?: string[]; abertura?: TelaQuiz["abertura"]; onAberto?: () => void; pose?: number; balaoGrande?: boolean }) {
  const { editar, mudarImagem } = useContext(QuizCtx);
  const trocar = useRef<HTMLInputElement>(null);
  const reduzido = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const comAbertura = !!abertura?.paraquedas && !!quadros && quadros.length >= N_QUADROS && !reduzido;
  // fases da abertura: 2 desce de paraquedas · 3 pouso · 4 acabou (fala + animação normal)
  const [fase, setFase] = useState(comAbertura ? 2 : 4);
  useEffect(() => {
    if (!comAbertura) return;
    const t = [setTimeout(() => setFase(3), 2500), setTimeout(() => { setFase(4); onAberto?.(); }, 2850)];
    return () => t.forEach(clearTimeout);
  }, [comAbertura]);   // eslint-disable-line react-hooks/exhaustive-deps
  const aberto = fase >= 4;
  const lista = falas?.length ? falas : fala ? [fala] : [];
  const [iFala, setIFala] = useState(0);
  useEffect(() => {
    if (!aberto) return;
    onFala?.(iFala);
    if (iFala >= lista.length - 1) return;
    const t = setTimeout(() => setIFala(iFala + 1), iFala === 0 ? FALA_MS + 700 : FALA_MS);   // a 1ª espera o balão entrar
    return () => clearTimeout(t);
  }, [iFala, lista.length, aberto]);   // eslint-disable-line react-hooks/exhaustive-deps
  const temQuadros = !!quadros && quadros.length >= N_QUADROS;
  // atual + anterior: o anterior fica opaco por baixo enquanto o novo aparece por cima. Se os dois fossem
  // meio transparentes ao mesmo tempo, o fundo branco apareceria entre eles (o "flash" na troca).
  const [par, setPar] = useState({ atual: pose !== undefined ? pose : temQuadros && !comAbertura ? Q.PULO : Q.PARADO, antes: -1 });
  const setQ = (k: number) => setPar((p) => (p.atual === k ? p : { atual: k, antes: p.atual }));
  useEffect(() => {
    if (pose !== undefined) return;   // pose fixa (ex.: comemorando): sem ciclo de aceno/fala/piscada
    if (!temQuadros || reduzido) { setQ(Q.PARADO); return; }
    if (!aberto) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let vivo = true;
    const em = (ms: number, fn: () => void) => { timers.push(setTimeout(() => { if (vivo) fn(); }, ms)); };
    ROTEIRO.forEach(([ms, k]) => em(600 + ms, () => setQ(k)));      // 0,6 s: espera o mascote terminar de entrar
    // depois do roteiro ele não repete nada: só pisca, de tempos em tempos
    const piscar = () => {
      setQ(Q.PISCA_MEIO); em(90, () => setQ(Q.PISCA)); em(200, () => setQ(Q.PISCA_MEIO)); em(290, () => setQ(Q.PARADO));
      em(2800 + Math.random() * 2600, piscar);
    };
    em(600 + FIM_ROTEIRO_MS, piscar);
    return () => { vivo = false; timers.forEach(clearTimeout); };
  }, [temQuadros, aberto]);
  if (!url) return <Img caminho={caminho} url={url} nota={nota} inteira className="mx-auto h-48 w-48" />;
  return (
    <div className="group relative mx-auto flex w-64 flex-col items-center">
      {!!lista.length && (
        <div className={cn("mb-3 flex items-end", balaoGrande ? "min-h-[120px]" : "min-h-[84px]")}>   {/* altura fixa: o balão maior da 2ª fala não empurra o mascote */}
        <div key={iFala} className={cn("relative rounded-2xl border-2 bg-white px-4 py-2 text-sm font-semibold text-gray-800 shadow-sm", balaoGrande && "w-[19rem] max-w-[88vw] rounded-3xl border-[#d6e0f5] px-5 py-3 text-center text-[1.35rem] font-extrabold leading-tight text-[#1c2a5e] shadow-lg", !aberto && "invisible", iFala === 0 ? "motion-safe:animate-balao-entra" : "motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-90 motion-safe:duration-300")}>
          {lista[iFala]}
          <span className={cn("absolute -bottom-[9px] left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 border-b-2 border-r-2 bg-white", balaoGrande && "border-[#d6e0f5]")} />
        </div>
        </div>
      )}
      <div key={fase < 4 ? "antes" : "depois"} className={cn("motion-safe:animate-mascote-entra", fase < 4 && "invisible")}>
        <div data-voo className={cn("relative h-64 w-64", pose !== undefined ? "motion-safe:animate-empolgado" : "motion-safe:animate-mascote-flutua")}>
          {temQuadros ? quadros!.map((u, k) => (
            <img key={k} src={u} alt={k === 0 ? (nota ?? "") : ""} draggable={false}
              decoding="sync"
              className={cn("absolute inset-0 h-full w-full object-contain", k === par.atual ? "z-10 opacity-100 transition-opacity duration-100" : k === par.antes ? "opacity-100" : "opacity-0")} />
          )) : <img src={url} alt={nota ?? ""} className="h-full w-full object-contain" draggable={false} />}
        </div>
      </div>
      <div className="-mt-2 h-3 w-32 rounded-[50%] bg-black motion-safe:animate-mascote-sombra" style={{ opacity: 0.2 }} />
      {comAbertura && fase < 4 && (
        <div className="pointer-events-none absolute bottom-0 left-1/2 z-30 h-[380px] w-64 -translate-x-1/2">
          {fase >= 2 && (
            <div className={cn("absolute inset-0", fase === 2 ? "animate-paraquedas-desce" : "animate-paraquedas-some")}>
              <div className="h-full w-full origin-top animate-paraquedas-balanca"><img src={abertura!.paraquedas} alt="" className="h-full w-full object-contain" draggable={false} /></div>
            </div>
          )}
        </div>
      )}
      {editar && (
        <>
          <input ref={trocar} type="file" accept="image/*" className="hidden"
            onChange={(ev) => { const f = ev.target.files?.[0]; if (f) mudarImagem(caminho, f); ev.target.value = ""; }} />
          <button type="button" onClick={(ev) => { ev.stopPropagation(); trocar.current?.click(); }}
            className="absolute right-0 top-0 z-20 rounded-md bg-black/60 px-2 py-1 text-xs text-white opacity-0 transition-opacity hover:opacity-100 focus:opacity-100 group-hover:opacity-100">
            Trocar imagem
          </button>
        </>
      )}
    </div>
  );
}

// Voo do mascote (estilo Duolingo): ao avançar da tela do mascote grande, ele "voa" até o canto superior esquerdo
// da pergunta e o título passa a ser falado no balão ao lado dele. A tela grande guarda onde o mascote estava
// (retângulo na tela); o mascote pequeno, ao nascer, parte dali e anima até o seu lugar (técnica FLIP).
let ORIGEM_MASCOTE: { rect: DOMRect; em: number } | null = null;

function MascoteCanto({ quadros, children }: { quadros: string[]; children: ReactNode }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [par, setPar] = useState({ atual: Q.PARADO, antes: -1 });
  const setQ = (k: number) => setPar((p) => (p.atual === k ? p : { atual: k, antes: p.atual }));
  useLayoutEffect(() => {
    const el = caixa.current; const o = ORIGEM_MASCOTE; ORIGEM_MASCOTE = null;
    if (!el || !o || performance.now() - o.em > 1500 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    el.style.transformOrigin = "0 0"; el.style.transition = "none";
    el.style.transform = `translate(${o.rect.left - r.left}px, ${o.rect.top - r.top}px) scale(${o.rect.width / r.width})`;
    void el.offsetWidth;   // fixa o ponto de partida antes de animar
    el.style.transition = "transform 650ms cubic-bezier(0.4, 0, 0.2, 1)";
    el.style.transform = "none";
  }, []);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timers: ReturnType<typeof setTimeout>[] = []; let vivo = true;
    const em = (ms: number, fn: () => void) => { timers.push(setTimeout(() => { if (vivo) fn(); }, ms)); };
    const piscar = () => { setQ(Q.PISCA_MEIO); em(90, () => setQ(Q.PISCA)); em(200, () => setQ(Q.PISCA_MEIO)); em(290, () => setQ(Q.PARADO)); em(2800 + Math.random() * 2600, piscar); };
    em(3000, piscar);
    return () => { vivo = false; timers.forEach(clearTimeout); };
  }, []);
  return (
    <div className="flex items-center gap-1">
      <div ref={caixa} className="relative z-10 h-24 w-24 shrink-0">
        {quadros.slice(0, 6).map((u, k) => (
          <img key={k} src={u} alt="" draggable={false} decoding="sync"
            className={cn("absolute inset-0 h-full w-full object-contain", k === par.atual ? "z-10 opacity-100 transition-opacity duration-100" : k === par.antes ? "opacity-100" : "opacity-0")} />
        ))}
      </div>
      <div className="relative min-w-0 flex-1 rounded-2xl border-2 bg-white px-4 py-3 text-gray-800 shadow-sm">
        <span className="absolute -left-[9px] top-1/2 h-4 w-4 -translate-y-1/2 rotate-45 border-b-2 border-l-2 bg-white" />
        {children}
      </div>
    </div>
  );
}

// Mascote com várias poses que se alternam sem parar (ex.: de fone, fazendo várias coisas). Mesma regra de troca
// suave do mascote principal: o quadro anterior fica opaco por baixo e o novo entra por cima.
function MascoteLoop({ frames }: { frames: string[] }) {
  const [par, setPar] = useState({ atual: 0, antes: -1 });
  useEffect(() => {
    if (frames.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setPar((p) => ({ atual: (p.atual + 1) % frames.length, antes: p.atual })), 1300);
    return () => clearInterval(id);
  }, [frames.length]);
  return (
    <div className="relative mx-auto h-60 w-60 motion-safe:animate-mascote-entra">
      <div className="relative h-full w-full motion-safe:animate-[mascote-flutua_4.5s_ease-in-out_infinite]">
        {frames.map((u, k) => (
          <img key={k} src={u} alt="" draggable={false} decoding="sync"
            className={cn("absolute inset-0 h-full w-full object-contain", k === par.atual ? "z-10 opacity-100 transition-opacity duration-300" : k === par.antes ? "opacity-100" : "opacity-0")} />
        ))}
      </div>
    </div>
  );
}

// Mapa com os leitores ligados por setas: arcos tracejados que correm, setinhas indo e voltando e pontos pulsando.
function MapaConectado({ url, pontos, cor }: { url: string; pontos: [number, number][]; cor: string }) {
  const arcos = useMemo(() => {
    const par = new Set<string>(), lista: [number, number][] = [];
    pontos.forEach((a, i) => {
      pontos.map((b, j) => ({ j, d: Math.hypot(a[0] - b[0], a[1] - b[1]) })).filter((x) => x.j !== i).sort((x, y) => x.d - y.d).slice(0, 2).forEach(({ j }) => {
        const k = [Math.min(i, j), Math.max(i, j)].join("-");
        if (!par.has(k)) { par.add(k); lista.push(i % 2 ? [i, j] : [j, i]); }
      });
    });
    return lista;
  }, [pontos]);
  return (
    <div className="relative mx-auto aspect-square w-full max-w-xs">
      <img src={url} alt="" className="absolute inset-0 h-full w-full object-contain opacity-50" draggable={false} />
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
        {arcos.map(([a, b], k) => {
          const [x1, y1] = pontos[a], [x2, y2] = pontos[b];
          const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - Math.hypot(x2 - x1, y2 - y1) * 0.22;
          const d = `M${x1} ${y1} Q${mx} ${my} ${x2} ${y2}`;
          return (
            <g key={k}>
              <path id={`arco${k}`} d={d} fill="none" stroke={cor} strokeOpacity=".5" strokeWidth=".5" strokeDasharray="2 2" className="motion-safe:animate-fluxo-traco" />
              <path d="M-1.3 -1.1 L1.5 0 L-1.3 1.1 Z" fill={cor}>
                <animateMotion dur={`${2.4 + (k % 4) * 0.4}s`} repeatCount="indefinite" rotate="auto" begin={`${(k % 5) * 0.3}s`}><mpath href={`#arco${k}`} /></animateMotion>
              </path>
            </g>
          );
        })}
        {pontos.map(([x, y], k) => (
          <g key={k}>
            <circle cx={x} cy={y} r="1.6" fill="none" stroke={cor} strokeWidth=".5">
              <animate attributeName="r" values="1.6;6" dur="2.2s" begin={`${(k % 6) * 0.35}s`} repeatCount="indefinite" />
              <animate attributeName="opacity" values=".7;0" dur="2.2s" begin={`${(k % 6) * 0.35}s`} repeatCount="indefinite" />
            </circle>
            <circle cx={x} cy={y} r="1.7" fill={cor} />
          </g>
        ))}
      </svg>
    </div>
  );
}

// Gráfico de curva do plano: linha que se desenha subindo mês a mês, "você está aqui" no primeiro ponto.
function GraficoCurva({ barras, aqui, cor }: { barras: BarraFixa[]; aqui?: string; cor: string }) {
  const n = barras.length, L = 300, A = 170, ml = 28, mr = 28, topo = 44, base = 128;
  const max = Math.max(1, ...barras.map((b) => b.valor));
  const pt = barras.map((b, i) => ({ x: ml + (i * (L - ml - mr)) / Math.max(1, n - 1), y: base - (b.valor / max) * (base - topo), b }));
  const linha = pt.map((q, i) => { if (!i) return `M${q.x} ${q.y}`; const a = pt[i - 1], dx = (q.x - a.x) * 0.45; return `C${a.x + dx} ${a.y} ${q.x - dx} ${q.y} ${q.x} ${q.y}`; }).join(" ");
  const area = `${linha} L${pt[n - 1].x} ${base} L${pt[0].x} ${base} Z`;
  const gid = useMemo(() => `g${Math.random().toString(36).slice(2, 7)}`, []);
  return (
    <svg viewBox={`0 0 ${L} ${A}`} className="w-full overflow-visible">
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={cor} stopOpacity=".28" /><stop offset="100%" stopColor={cor} stopOpacity="0" /></linearGradient></defs>
      <line x1={ml - 8} x2={L - mr + 8} y1={base} y2={base} stroke="currentColor" strokeOpacity=".15" />
      <path d={area} fill={`url(#${gid})`} className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-1000" />
      <path d={linha} fill="none" stroke={cor} strokeWidth="3.5" strokeLinecap="round" pathLength={1} strokeDasharray={1} className="motion-safe:animate-desenhar-linha" />
      {pt.map((q, i) => {
        const ultimo = i === n - 1, atraso = `${0.3 + (i * 1.8) / n}s`;
        return (
          <g key={i} className="motion-safe:animate-ponto-entra" style={{ animationDelay: atraso, transformOrigin: `${q.x}px ${q.y}px` }}>
            <circle cx={q.x} cy={q.y} r={ultimo ? 6.5 : 5} fill={ultimo ? cor : "white"} stroke={cor} strokeWidth="3" />
            <text x={q.x} y={q.y - (i === 0 ? 30 : 12)} textAnchor="middle" fontSize="10" fontWeight="700" fill="currentColor">{q.b.legenda ?? q.b.valor}</text>
            <text x={q.x} y={base + 16} textAnchor="middle" fontSize="9" fill="currentColor" fillOpacity=".6">{q.b.rotulo}</text>
            {i === 0 && (
              <g>
                <rect x={q.x - 30} y={q.y - 27} width="60" height="14" rx="7" fill={cor} />
                <text x={q.x} y={q.y - 17.5} textAnchor="middle" fontSize="8" fontWeight="700" fill="white">{aqui ?? "Você está aqui"}</text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// Som curto e leve de "fase concluída" (duas notas). Web Audio: só toca depois do primeiro toque e o iPhone
// respeita o modo silencioso; qualquer falha é ignorada.
function somFaseConcluida() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    if (ctx.state === "suspended") void ctx.resume();
    [[784, 0], [1175, 0.11]].forEach(([freq, atraso]) => {
      const osc = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + atraso;
      osc.type = "sine"; osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      osc.connect(g).connect(ctx.destination);
      osc.start(t); osc.stop(t + 0.32);
    });
    setTimeout(() => void ctx.close().catch(() => {}), 800);
  } catch { /* sem som */ }
}

// Confete rápido (~1,2 s) do alto da tela, sem pegar eventos de toque; sem confete se a pessoa pediu menos movimento.
function confeteFase() {
  try {
    void confetti({ particleCount: 60, spread: 70, startVelocity: 32, gravity: 1.3, ticks: 70, scalar: 0.9, origin: { x: 0.5, y: 0.12 }, colors: ["#fbbf24", "#f59e0b", "#34d399", "#60a5fa", "#f472b6"], disableForReducedMotion: true, zIndex: 60 });
  } catch { /* sem confete */ }
}

// Barra de progresso por fases, como a do 12min: "← Voltar" arredondado, a marca no meio e uma linha com uma
// bolinha por fase (✓ nas que já passaram, anel escuro na atual) e o nome da fase embaixo.
function BarraFases({ fases, atual, frac, cor, escuro, comemorar = true, onVoltar }: { fases: string[]; atual: number; frac: number; cor: string; escuro: boolean; comemorar?: boolean; onVoltar?: () => void }) {
  const n = fases.length;
  // Ao entrar numa fase mais adiante, a bolinha da anterior vira estrela com confete e som (voltar não comemora).
  const maior = useRef(atual);
  const [recem, setRecem] = useState(-1);
  useEffect(() => {
    if (atual <= maior.current) return;
    maior.current = atual;
    if (!comemorar) return;
    setRecem(atual - 1);
    confeteFase(); somFaseConcluida();
    const t = setTimeout(() => setRecem(-1), 900);
    return () => clearTimeout(t);
  }, [atual, comemorar]);
  const fill = Math.min(100, ((atual + frac) / n) * 100);
  const claro = escuro ? "rgba(255,255,255,.14)" : `${cor}26`;
  return (
    <div className="shrink-0 space-y-1.5">
      <div className="relative flex h-9 items-center justify-center">
        <button type="button" onClick={onVoltar} disabled={!onVoltar} aria-label="Voltar"
          className={cn("absolute left-0 flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition-opacity", !onVoltar && "invisible")}
          style={{ background: claro, color: cor }}><ArrowLeft className="h-4 w-4" />Voltar</button>
        <span className="text-xl font-extrabold tracking-tight" style={{ color: cor }}>Instalivros</span>
      </div>
      <div className="relative mx-1 pb-5 pt-1">
        <div className="relative h-5">
          <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full" style={{ background: claro }} />
          <div className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full transition-all duration-500" style={{ width: `${fill}%`, background: cor }} />
          <span className="absolute left-0 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full" style={{ background: cor }} />
          {fases.map((nome, i) => {
            const feito = i < atual, ativo = i === atual;
            return (
              <span key={nome} className="absolute top-1/2 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[3px] transition-colors duration-500"
                style={{ left: `${((i + 1) / n) * 100}%`, borderColor: feito && comemorar ? "transparent" : feito || ativo ? cor : `${cor}55`, background: feito && comemorar ? "transparent" : feito ? cor : escuro ? "#0a0a0a" : "#fff" }}>
                {feito && (comemorar
                  ? <Star className={cn("h-6 w-6 shrink-0 fill-amber-400 text-amber-500", recem === i && "motion-safe:animate-estrela-pula")} strokeWidth={2} />
                  : <Check className="h-3 w-3 text-white" strokeWidth={4} />)}
              </span>
            );
          })}
        </div>
        <span className="absolute top-8 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.14em]" style={{ left: `${Math.min(Math.max(((atual + 1) / n) * 100, 14), 86)}%`, color: cor }}>{fases[atual]}</span>
      </div>
    </div>
  );
}

function Depoimentos({ caminho, lista, nota }: { caminho: string; lista?: Depoimento[]; nota?: string }) {
  const { mostrarFaltas, editar, escuro } = useContext(QuizCtx);
  const validos = (lista ?? []).filter((d) => d.texto);
  if (!validos.length) {
    return (mostrarFaltas || editar) && nota
      ? <p className="rounded-xl border-2 border-dashed border-gray-500/40 p-3 text-center text-xs opacity-70">Falta: {nota}</p>
      : null;
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {(lista ?? []).map((d, k) => d.texto && (
        <figure key={k} className={cn("rounded-xl p-3 text-left text-sm", escuro ? "bg-white/5" : "bg-black/5")}>
          <Txt caminho={`${caminho}.${k}.texto`} valor={d.texto} as="blockquote" className="italic" />
          <Txt caminho={`${caminho}.${k}.nome`} valor={d.nome} as="figcaption" className="mt-1 text-xs opacity-70" />
        </figure>
      ))}
    </div>
  );
}

function Botao({ children, onClick, href }: { children: React.ReactNode; onClick?: () => void; href?: string }) {
  const { cor, editar, aoClicarOferta } = useContext(QuizCtx);
  const cls = "h-auto min-h-12 w-full whitespace-normal rounded-xl text-base font-semibold text-white shadow-lg transition-transform hover:scale-[1.02] active:scale-[0.98]";
  const estilo = { background: cor, boxShadow: `0 8px 24px -8px ${cor}` };
  if (editar) return <div className={cn(cls, "flex items-center justify-center px-4 py-3")} style={estilo}>{children}</div>;
  if (href) return <Button asChild size="lg" className={cls} style={estilo}><a href={href} target="_blank" rel="noreferrer" onClick={() => aoClicarOferta?.()}>{children}</a></Button>;
  return <Button size="lg" className={cls} style={estilo} onClick={onClick}>{children}<ArrowRight className="ml-2 h-4 w-4 shrink-0" /></Button>;
}

export function QuizPlayer({ titulo, estrutura, onFim, teste, editar = false, onMudar, onImagem, telaCheia = false, onTrocarTela, onEvento, passoFixo, perfilFixo, respostas }: {
  titulo: string; estrutura: EstruturaQuiz; onFim?: (r: FimDoQuiz) => Promise<void> | void; teste?: boolean;
  editar?: boolean; onMudar?: (e: EstruturaQuiz) => void; onImagem?: (arquivo: File) => Promise<string>;
  // Link público no celular (15/10): ocupa a tela toda, barra de progresso fixa no
  // topo e o conteúdo centralizado; a cada tela nova o pai volta a rolagem pro início.
  telaCheia?: boolean; onTrocarTela?: () => void;
  // Métricas do link público (15/10): cada tela alcançada e o clique na oferta.
  onEvento?: (tipo: "passo" | "cta", passo?: number) => void;
  /** Vista em fileira da revisão (25/10): mostra só esta tela, sem avançar; no fim, o resultado deste perfil. */
  passoFixo?: number; perfilFixo?: string;
  /** Respostas já dadas (ex.: { genero: 1 }) para mostrar um caminho do quiz no editor: as imagens que dependem delas já aparecem. */
  respostas?: Record<string, number>;
}) {
  const e = estrutura;
  const cor = corDoQuiz(e);
  const escuro = e.tema === "escuro";
  const perguntas = e.perguntas ?? [];
  const telas = e.telas ?? [];
  const pedir = e.captura?.ativa === false ? [] : (e.captura?.pedir ?? []);
  const passos = useMemo(() => montarPassos(e, pedir.length > 0), [e, pedir.length]);
  const travado = passoFixo != null;
  // intro.pular: o quiz já abre na primeira tela seguinte (pedido do Davi, 10/11: abre direto na cena do foguete).
  // Só no quiz rodando; nas vistas fixas e no editor a abertura continua existindo como lâmina.
  const [pos, setPos] = useState(passoFixo ?? (estrutura.intro?.pular && !editar ? 1 : 0));
  useEffect(() => { if (passoFixo != null) setPos(passoFixo); }, [passoFixo]);
  const [escolhas, setEscolhas] = useState<Record<string, number>>(respostas ?? {});
  const respostasChave = JSON.stringify(respostas ?? {});
  useEffect(() => { if (respostas) setEscolhas((x) => ({ ...x, ...respostas })); }, [respostasChave]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [marcadas, setMarcadas] = useState<Record<string, number[]>>({});   // perguntas de "escolha quantas quiser"
  const [contato, setContato] = useState<Partial<Record<CampoCaptura, string>>>({});
  const [enviando, setEnviando] = useState(false);
  const enviado = useRef(false);   // captura no meio do quiz: a resposta já foi gravada ali
  const passo = passos[Math.min(pos, passos.length - 1)];
  const perfil = useMemo(() => (perfilFixo ? e.perfis.find((p) => p.id === perfilFixo) ?? null : calcularPerfil(e, escolhas)), [e, escolhas, perfilFixo]);
  const iPerfil = perfil ? e.perfis.findIndex((p) => p.id === perfil.id) : -1;
  const f = (t?: string) => preencher(t, e, escolhas, perfil, contato.nome);
  const temTelaResultado = telas.some((t) => t.tipo === "resultado");

  // Depois da abertura, baixa as imagens das próximas telas: a troca de tela não fica esperando a imagem.
  useEffect(() => {
    const urls = JSON.stringify(e).match(/https?:\/\/[^"]+\.(?:webp|jpe?g|png|gif)/gi) ?? [];
    const t = setTimeout(() => { for (const u of new Set(urls)) new Image().src = u; }, 1200);
    return () => clearTimeout(t);
  }, [e]);

  const trocou = useRef(onTrocarTela);
  trocou.current = onTrocarTela;
  const evento = useRef(onEvento);
  evento.current = onEvento;
  useEffect(() => { trocou.current?.(); if (pos > 0) evento.current?.("passo", pos); }, [pos]);

  // Opções da pergunta da tela `posicao`, editadas direto no celular.
  const mudarOpcoes = (posicao: number, f: (opcoes: EstruturaQuiz["perguntas"][number]["opcoes"]) => void) => {
    const passo = passos[posicao];
    if (passo?.tipo !== "pergunta" || !onMudar) return;
    const n = structuredClone(e);
    f(n.perguntas[passo.indice].opcoes);
    onMudar(n);
  };
  const ctx: Ctx = {
    editar, mostrarFaltas: !!teste, cor, escuro, podeEnviar: !!onImagem && !!onMudar,
    aoClicarOferta: () => evento.current?.("cta"),
    mudarTexto: (c, v) => onMudar?.(comValor(e, c, v)),
    mudarImagem: (c, arq) => {
      if (!arq) { onMudar?.(comValor(e, c, "")); return; }
      void onImagem?.(arq).then((url) => onMudar?.(comValor(e, c, url)));
    },
  };

  const gravar = async (dados: Partial<Record<CampoCaptura, string>>) => {
    if (enviado.current) return;
    setEnviando(true);
    try { await onFim?.({ escolhas, perfil, contato: dados }); enviado.current = true; } finally { setEnviando(false); }
  };
  const terminar = async (dados: Partial<Record<CampoCaptura, string>>) => {
    await gravar(dados);
    setPos(passos.length - 1);
  };
  // Captura no meio: grava já (quem sair antes do fim não se perde) e segue o quiz.
  const enviarContato = async () => {
    if (passos[pos + 1]?.tipo === "fim") { await terminar(contato); return; }
    await gravar(contato);
    setPos((p) => Math.min(p + 1, passos.length - 1));
  };
  const avancar = () => {
    if (travado) return;
    const prox = pos + 1;
    if (passos[prox]?.tipo === "fim" && !editar) void terminar(contato);
    else setPos(Math.min(prox, passos.length - 1));
  };
  const voltar = () => { if (!travado) setPos((p) => Math.max(0, p - 1)); };
  const escolher = (qid: string, k: number) => {
    setEscolhas((x) => ({ ...x, [qid]: k }));
    if (!editar && !travado) window.setTimeout(avancar, 280);
  };
  // Múltipla escolha: marca/desmarca e só segue no botão Continuar; no perfil conta a 1ª opção marcada.
  const alternar = (qid: string, k: number) => {
    const atual = marcadas[qid] ?? [];
    const nova = atual.includes(k) ? atual.filter((x) => x !== k) : [...atual, k];
    setMarcadas((m) => ({ ...m, [qid]: nova }));
    setEscolhas((x) => { const y = { ...x }; if (nova.length) y[qid] = nova[0]; else delete y[qid]; return y; });
  };
  const reiniciar = () => { setPos(0); setEscolhas({}); setMarcadas({}); setContato({}); enviado.current = false; };

  const meio = passos.filter((p) => p.tipo !== "intro" && p.tipo !== "fim").length;
  const progresso = passo.tipo === "intro" ? 0 : passo.tipo === "fim" ? 100 : Math.round((pos / (meio + 1)) * 100);
  const nPergunta = passo.tipo === "pergunta" ? passo.indice + 1 : 0;
  const quadrosMascote = telas.find((x) => x.animada && (x.quadros?.length ?? 0) >= N_QUADROS)?.quadros;
  // Fase atual (barra do 12min): a fase começa no passo cujo id (pergunta ou tela) é `fases[i].de`; a 1ª, na primeira tela.
  const fasesInfo = useMemo(() => {
    const lista = e.fases ?? [];
    if (!lista.length) return null;
    const idDoPasso = (pp: (typeof passos)[number]) => (pp.tipo === "pergunta" ? perguntas[pp.indice]?.id : pp.tipo === "tela" ? telas[pp.indice]?.id : undefined);
    const inicios = lista.map((fz, i) => (i === 0 ? 0 : Math.max(0, passos.findIndex((pp) => idDoPasso(pp) === fz.de))));
    return { nomes: lista.map((fz) => fz.nome), inicios };
  }, [e.fases, passos, perguntas, telas]);
  let faseAtual = 0, fracFase = 0;
  if (fasesInfo) {
    fasesInfo.inicios.forEach((ini, i) => { if (pos >= ini && ini >= (fasesInfo.inicios[faseAtual] ?? 0)) faseAtual = i; });
    const ini = fasesInfo.inicios[faseAtual], fim = fasesInfo.inicios[faseAtual + 1] ?? passos.length - 1;
    fracFase = Math.min(1, Math.max(0, (pos - ini) / Math.max(1, fim - ini)));
  }

  const contatoOk = pedir.every((c) => {
    const v = (contato[c] ?? "").trim();
    if (c === "whatsapp") return v.replace(/\D/g, "").length >= 10;   // com DDD
    if (c === "email") return /^\S+@\S+\.\S+$/.test(v);
    return v.length >= 2;
  });
  const suave = escuro ? "text-neutral-400" : "text-muted-foreground";

  return (
    <QuizCtx.Provider value={ctx}>
      {/* O quiz usa sempre a própria paleta (quiz-claro / quiz-escuro em index.css), não o tema do Infopro
          (25/10, Davi: "o fundo do quiz está da mesma cor do Infopro; preciso que mostre a cor original"). */}
      <div className={cn("mx-auto flex w-full max-w-xl flex-col gap-5", escuro ? "quiz-escuro" : "quiz-claro",
        telaCheia ? "flex-1" : escuro ? "rounded-2xl bg-neutral-950 p-5 text-neutral-100 sm:p-7" : "rounded-2xl bg-white p-5 text-neutral-900 shadow-sm sm:p-7")}
        style={passo.tipo === "tela" && telas[passo.indice]?.fundo ? { background: telas[passo.indice].fundo } : undefined}>
        {teste && !editar && !travado && <p className="rounded-md bg-amber-500/15 px-3 py-1.5 text-center text-xs text-amber-600 dark:text-amber-300">Modo teste: suas respostas não são gravadas. O pontilhado mostra o que ainda falta{onImagem && onMudar ? " — clique nele para enviar" : ""}.</p>}
        {editar && !travado && (
          <div className="sticky top-0 z-10 flex items-center justify-between gap-2 rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs text-amber-600 backdrop-blur dark:text-amber-300">
            <button type="button" onClick={voltar} disabled={pos === 0} className="flex items-center gap-1 disabled:opacity-40"><ArrowLeft className="h-3 w-3" />Anterior</button>
            <span>Editando · tela {pos + 1} de {passos.length} · clique no texto ou na imagem</span>
            <button type="button" onClick={() => setPos((p) => Math.min(passos.length - 1, p + 1))} disabled={pos >= passos.length - 1} className="flex items-center gap-1 disabled:opacity-40">Próxima<ArrowRight className="h-3 w-3" /></button>
          </div>
        )}
        {passo.tipo !== "intro" && passo.tipo !== "fim" && fasesInfo ? (
          <BarraFases fases={fasesInfo.nomes} atual={faseAtual} frac={fracFase} cor={cor} escuro={escuro} comemorar={e.fases_comemorar !== false} onVoltar={pos > 1 && !editar && !travado ? voltar : undefined} />
        ) : passo.tipo !== "intro" && passo.tipo !== "fim" ? (
          <div className={cn("h-2 shrink-0 overflow-hidden rounded-full", escuro ? "bg-white/10" : "bg-black/10")}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progresso}%`, background: cor, boxShadow: `0 0 12px ${cor}` }} />
          </div>
        ) : telaCheia && <div className="h-2 shrink-0" />}

        {/* Tela cheia: a pergunta começa sempre na mesma altura (título fixo, imagem abaixo dele);
            abertura, respiro e "analisando" ficam no centro da tela. */}
        <div key={pos} className={cn(ENTRA, telaCheia && (passo.tipo === "pergunta" ? "mt-[2dvh] w-full" : "my-auto w-full"))}>
          {passo.tipo === "intro" && (
            <div className="space-y-5 py-4 text-center">
              <Img caminho="intro.imagem" url={e.intro?.imagem} nota={e.intro?.imagem_nota} redonda className="mx-auto h-24 w-24" />
              <Txt caminho="intro.titulo" valor={e.intro?.titulo || titulo} as="h1" className="block text-3xl font-extrabold leading-tight sm:text-4xl" />
              <Txt caminho="intro.subtitulo" valor={e.intro?.subtitulo} as="p" className={cn("block text-base leading-relaxed", suave)} />
              {!!e.intro?.credenciais?.length && (
                <div className="flex flex-wrap justify-center gap-1.5">
                  {e.intro.credenciais.map((c, k) => (
                    <Txt key={k} caminho={`intro.credenciais.${k}`} valor={c} className="rounded-full border px-2.5 py-0.5 text-xs" />
                  ))}
                </div>
              )}
              <Botao onClick={avancar}><Txt caminho="intro.botao" valor={e.intro?.botao || "Começar"} /></Botao>
              <Txt caminho="intro.rodape" valor={e.intro?.rodape} as="p" className={cn("block text-xs", suave)} />
            </div>
          )}

          {passo.tipo === "pergunta" && (() => {
            const q = perguntas[passo.indice];
            const base = `perguntas.${passo.indice}`;
            const fotos = q.estilo === "fotos";   // rostos em grade de 3, nome embaixo (como o 12min)
            const avatares = q.estilo === "avatares";   // cartões com rosto redondo; o rosto pode depender de uma resposta anterior (o.imagens)
            const icones = q.estilo === "icones";   // cartões com ícone 3D pequeno em cima do nome
            const cartoes = q.estilo === "cartoes" || fotos || avatares || icones;
            const imagemDe = (o: (typeof q.opcoes)[number]) => {
              for (const [chave, url] of Object.entries(o.imagens ?? {})) { const [pid, i] = chave.split("="); if (escolhas[pid] === Number(i)) return url; }
              return o.imagem;
            };
            const emojiDe = (o: (typeof q.opcoes)[number]) => {
              for (const [chave, em] of Object.entries(o.emojis ?? {})) { const [pid, i] = chave.split("="); if (escolhas[pid] === Number(i)) return em; }
              return undefined;
            };
            const livro = q.estilo === "livro";
            const quadrosM = telas.find((x) => x.animada && (x.quadros?.length ?? 0) >= N_QUADROS)?.quadros;   // o mascote fala o título (não nas telas de livro)   // capa inteira em pé + Não ✗ / Sim ✓ lado a lado (como o 12min)
            return (
              <div className="space-y-3">
                {quadrosM && !livro
                  ? <MascoteCanto key={passo.indice} quadros={quadrosM}><Txt caminho={`${base}.texto`} valor={q.texto} mostrar={f(q.texto)} as="h2" className="block text-xl font-bold leading-snug" /></MascoteCanto>
                  : quadrosM && livro
                    ? <>
                        <MascoteCanto key={passo.indice} quadros={quadrosM}><Txt caminho={`${base}.subtitulo`} valor={q.subtitulo || "Este livro é interessante para você?"} as="p" className="block text-base font-semibold leading-snug" /></MascoteCanto>
                        <Txt caminho={`${base}.texto`} valor={q.texto} mostrar={f(q.texto)} as="h2" className="block text-center text-2xl font-bold leading-snug" />
                      </>
                    : <Txt caminho={`${base}.texto`} valor={q.texto} mostrar={f(q.texto)} as="h2" className="block text-2xl font-bold leading-snug" />}
                {!(quadrosM && livro) && <Txt caminho={`${base}.subtitulo`} valor={q.subtitulo} as="p" className={cn("block text-sm", suave)} />}
                {(q.imagem || q.imagem_nota) && (livro
                  ? <Img caminho={`${base}.imagem`} url={q.imagem} nota={q.imagem_nota} inteira className="mx-auto aspect-[2/3] h-[34dvh] max-h-[320px] shadow-lg" />
                  : <Img caminho={`${base}.imagem`} url={q.imagem} nota={q.imagem_nota} className="aspect-[16/9] max-h-[30dvh] w-full" />)}
                <div className={cn(fotos ? "grid grid-cols-3 gap-x-2 gap-y-2" : cartoes ? "grid grid-cols-2 gap-2" : livro ? "grid grid-cols-2 gap-3" : "space-y-2")}>
                  {q.opcoes.map((o, k) => {
                    const marcada = q.multipla ? (marcadas[q.id] ?? []).includes(k) : escolhas[q.id] === k;
                    const Opcao = editar ? "div" : "button";
                    return (
                      <Opcao key={k} type={editar ? undefined : "button"} onClick={() => (q.multipla ? alternar(q.id, k) : q.botao ? setEscolhas((x) => ({ ...x, [q.id]: k })) : escolher(q.id, k))}
                        className={cn("group flex w-full items-center gap-3 rounded-xl border-2 px-3 py-3 text-left text-[15px] transition-all hover:-translate-y-0.5 hover:shadow-md",
                          escuro ? "border-white/15 bg-white/5 hover:border-white/40" : "hover:border-foreground/30",
                          (cartoes || livro) && "flex-col justify-center text-center", livro && "py-3 text-base font-semibold", fotos && "gap-1 border-0 px-0 py-1 hover:translate-y-0 hover:shadow-none", marcada && !fotos && "scale-[1.02] text-white")}
                        style={marcada ? (fotos ? { color: cor, fontWeight: 700 } : { background: cor, borderColor: cor }) : undefined}>
                        {cartoes && emojiDe(o) && <span className="flex h-24 w-24 items-center justify-center text-6xl leading-none">{emojiDe(o)}</span>}
                        {cartoes && !emojiDe(o) && (o.imagem !== undefined || !!o.imagens) && (
                          <span className={cn("rounded-full", fotos && "p-[3px]")} style={fotos && marcada ? { boxShadow: `0 0 0 3px ${cor}` } : undefined}>
                            <Img caminho={`${base}.opcoes.${k}.imagem`} url={imagemDe(o)} redonda={fotos || avatares} className={avatares ? "mx-auto aspect-square w-24" : icones ? "mx-auto aspect-square w-14" : fotos ? "mx-auto aspect-square w-20" : "aspect-square w-full"} />
                          </span>
                        )}
                        {livro ? (k === 0 ? <X className={cn("h-7 w-7", marcada ? "text-white" : "text-orange-500")} /> : <Check className={cn("h-7 w-7", marcada ? "text-white" : "text-green-600")} />)
                          : editar ? <Txt caminho={`${base}.opcoes.${k}.emoji`} valor={o.emoji} className="text-xl" /> : o.emoji ? <span className="text-xl">{o.emoji}</span> : !cartoes && (
                          <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold", marcada ? "bg-white/25" : escuro ? "bg-white/10" : "bg-black/5")}>
                            {marcada ? <Check className="h-4 w-4" /> : LETRAS[k]}
                          </span>
                        )}
                        <Txt caminho={`${base}.opcoes.${k}.texto`} valor={o.texto} className={livro ? "" : fotos ? "text-xs leading-tight" : "flex-1"} />
                        {editar && (
                          // 03/11 (Davi: "editar direto no que estou vendo"): as ações da opção, só ao passar o mouse.
                          <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                            {([["Subir", ArrowUp, () => mudarOpcoes(pos, (l) => { if (k > 0) l.splice(k - 1, 0, ...l.splice(k, 1)); })],
                              ["Descer", ArrowDown, () => mudarOpcoes(pos, (l) => { if (k < l.length - 1) l.splice(k + 1, 0, ...l.splice(k, 1)); })],
                              ["Duplicar", Copy, () => mudarOpcoes(pos, (l) => { l.splice(k + 1, 0, structuredClone(l[k])); })],
                              ["Remover", Trash2, () => mudarOpcoes(pos, (l) => { if (l.length > 2) l.splice(k, 1); })]] as const).map(([rotulo, Icone, acao]) => (
                              <button key={rotulo} type="button" title={rotulo} onClick={(ev) => { ev.stopPropagation(); acao(); }} className="rounded p-1 opacity-60 hover:bg-black/10 hover:opacity-100"><Icone className="h-3.5 w-3.5" /></button>
                            ))}
                          </span>
                        )}
                      </Opcao>
                    );
                  })}
                  {editar && (
                    <button type="button" onClick={() => mudarOpcoes(pos, (l) => { l.push({ texto: "Nova opção", perfil: e.perfis[0]?.id ?? null }); })}
                      className={cn("flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-3 py-2.5 text-sm", suave)}><Plus className="h-4 w-4" />Adicionar opção</button>
                  )}
                </div>
                {(q.multipla || q.botao) && (
                  <div className={cn("sticky bottom-3 z-10 pt-1", !editar && (q.multipla ? !marcadas[q.id]?.length : escolhas[q.id] === undefined) && "pointer-events-none opacity-40")}>
                    <Botao onClick={avancar}>Continuar</Botao>
                  </div>
                )}
                {pos > 1 && !editar && !travado && (
                  <button type="button" onClick={voltar} className={cn("flex items-center gap-1 text-xs hover:opacity-100", suave)}><ArrowLeft className="h-3 w-3" />Voltar</button>
                )}
              </div>
            );
          })()}

          {passo.tipo === "tela" && (() => {
            const t = telas[passo.indice];
            const base = `telas.${passo.indice}`;
            if (t.tipo === "carregando") return <Carregando key={t.id} t={t} base={base} f={f} onPronto={editar || travado ? undefined : avancar} suave={suave} />;
            if (t.tipo === "resultado") return <Resultado e={e} t={t} base={base} perfil={perfil} iPerfil={iPerfil} escolhas={escolhas} nome={contato.nome} f={f} onSeguir={avancar} suave={suave} />;
            return <Tela t={t} base={base} f={f} onSeguir={avancar} suave={suave} />;
          })()}

          {passo.tipo === "nome" && (() => {
            const pn = e.nome!;
            const ok = (contato.nome ?? "").trim().length >= 2;
            return (
              <form className="space-y-4 py-2" onSubmit={(ev) => { ev.preventDefault(); if (travado) return; if (editar || ok) avancar(); }}>
                {quadrosMascote && (pn.fala || editar) && (
                  <MascoteCanto key="nome" quadros={quadrosMascote}><Txt caminho="nome.fala" valor={pn.fala} as="p" className="block text-base font-semibold leading-snug" /></MascoteCanto>
                )}
                <div className="space-y-2 text-center">
                  <Txt caminho="nome.titulo" valor={pn.titulo || "Como posso te chamar?"} as="h2" className="block text-2xl font-bold leading-snug" />
                  <Txt caminho="nome.texto" valor={pn.texto} as="p" className={cn("block text-base", suave)} />
                </div>
                {pn.modo === "letras" ? (
                  <NomeLetras valor={contato.nome ?? ""} cor={cor} escuro={escuro} suave={suave} aoMudar={(v) => setContato({ ...contato, nome: v })} />
                ) : (
                  <Input value={contato.nome ?? ""} placeholder={pn.exemplo || "Seu primeiro nome"} autoComplete="given-name" autoCapitalize="words" enterKeyHint="next"
                    className={cn("h-12 text-base", escuro && "border-white/20 bg-white/5")}
                    onChange={(ev) => setContato({ ...contato, nome: ev.target.value })} />
                )}
                <Button type={editar ? "button" : "submit"} size="lg" className="h-auto min-h-12 w-full whitespace-normal rounded-xl text-base font-semibold text-white" style={{ background: cor, boxShadow: `0 8px 24px -8px ${cor}` }} disabled={!editar && !ok}>
                  <Txt caminho="nome.botao" valor={pn.botao || "Continuar"} />
                </Button>
                {pn.pular && (
                  <div className="text-center">
                    <button type="button" className={cn("text-xs underline underline-offset-2 hover:opacity-100", suave)}
                      onClick={() => { if (travado || editar) return; setContato({ ...contato, nome: "" }); avancar(); }}>
                      <Txt caminho="nome.pular" valor={pn.pular} />
                    </button>
                  </div>
                )}
                {pos > 1 && !editar && !travado && (
                  <button type="button" onClick={voltar} className={cn("flex items-center gap-1 text-xs hover:opacity-100", suave)}><ArrowLeft className="h-3 w-3" />Voltar</button>
                )}
              </form>
            );
          })()}

          {passo.tipo === "captura" && (
            <form className="space-y-4 py-2" onSubmit={(ev) => { ev.preventDefault(); if (travado) return; if (editar) setPos((p) => p + 1); else if (contatoOk) void enviarContato(); }}>
              {quadrosMascote && (e.captura?.fala || editar) && (
                <MascoteCanto key="captura" quadros={quadrosMascote}><Txt caminho="captura.fala" valor={e.captura?.fala} mostrar={f(e.captura?.fala)} as="p" className="block text-base font-semibold leading-snug" /></MascoteCanto>
              )}
              <div className="space-y-2 text-center">
                <Txt caminho="captura.titulo" valor={e.captura?.titulo || "Para onde enviamos o seu resultado?"} mostrar={f(e.captura?.titulo || "Para onde enviamos o seu resultado?")} as="h2" className="block text-2xl font-bold leading-snug" />
                <Txt caminho="captura.texto" valor={e.captura?.texto} mostrar={f(e.captura?.texto)} as="p" className={cn("block text-base", suave)} />
              </div>
              {pedir.map((c) => (
                <label key={c} className="block space-y-1 text-sm">
                  <Txt caminho={`captura.rotulos.${c}`} valor={e.captura?.rotulos?.[c] || ROTULO_CAMPO[c].rotulo} className={suave} />
                  <Input type={ROTULO_CAMPO[c].tipo} value={contato[c] ?? ""} placeholder={ROTULO_CAMPO[c].exemplo}
                    inputMode={c === "whatsapp" ? "tel" : undefined} autoComplete={c === "nome" ? "given-name" : c === "whatsapp" ? "tel" : "email"}
                    className={cn("h-12 text-base", escuro && "border-white/20 bg-white/5")}
                    onChange={(ev) => setContato({ ...contato, [c]: ev.target.value })} />
                </label>
              ))}
              <Button type={editar ? "button" : "submit"} size="lg" className="h-auto min-h-12 w-full whitespace-normal rounded-xl text-base font-semibold text-white" style={{ background: cor, boxShadow: `0 8px 24px -8px ${cor}` }} disabled={!editar && (!contatoOk || enviando)}>
                {enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}<Txt caminho="captura.botao" valor={e.captura?.botao || "Ver meu resultado"} />
              </Button>
              {(e.captura?.nota || editar) && (
                <p className={cn("flex items-center justify-center gap-1.5 text-center text-xs", suave)}>
                  <Lock className="h-3 w-3 shrink-0" /><Txt caminho="captura.nota" valor={e.captura?.nota} />
                </p>
              )}
              {!!e.captura?.selos?.length && (
                // Quadro de selos embaixo do botão (como o do 12min): só fatos reais da oferta, dentro de um ramo de louro.
                <div className={cn("flex flex-wrap justify-center gap-2 rounded-2xl border p-3", escuro ? "border-white/15 bg-white/5" : "bg-black/[0.02]")}>
                  {e.captura.selos.map((sl, k) => (
                    <div key={k} className={cn("relative", k === 0 ? "w-full" : "w-[48%]")}>
                      {e.captura?.louro && <img src={e.captura.louro} alt="" draggable={false} className="mx-auto w-full max-w-[220px] object-contain" />}
                      <div className="absolute inset-0 flex flex-col items-center justify-center px-[22%] text-center leading-tight text-amber-600">
                        <span className={cn("font-extrabold", k === 0 ? "text-2xl" : "text-lg")}>{sl.destaque}</span>
                        <span className="text-[11px] font-medium opacity-90">{sl.texto}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </form>
          )}

          {passo.tipo === "fim" && (
            <div className="space-y-8">
              {!temTelaResultado && !e.sem_resultado && (
                <Resultado e={e} base="" perfil={perfil} iPerfil={iPerfil} escolhas={escolhas} nome={contato.nome} f={f} suave={suave} />
              )}
              {e.oferta ? <Oferta e={e} perfil={perfil} iPerfil={iPerfil} f={f} suave={suave} />
                : perfil?.cta_texto && (
                  perfil.cta_url ? <Botao href={perfil.cta_url}>{perfil.cta_texto}</Botao>
                    : <Button size="lg" className="w-full" disabled>{perfil.cta_texto} (link ainda não definido)</Button>
                )}
              {teste && !editar && !travado && <div className="text-center"><Button variant="outline" size="sm" className={escuro ? "border-white/20 bg-transparent" : undefined} onClick={reiniciar}>Testar de novo</Button></div>}
            </div>
          )}
        </div>
      </div>
    </QuizCtx.Provider>
  );
}

// Áudio da tela. Sem arquivo: no teste aparece "Falta: …" e, podendo enviar, clicar abre o arquivo.
function AudioDaTela({ caminho, url, nota }: { caminho: string; url?: string; nota?: string }) {
  const { editar, mostrarFaltas, mudarImagem, podeEnviar } = useContext(QuizCtx);
  const input = useRef<HTMLInputElement>(null);
  const enviar = editar || (mostrarFaltas && podeEnviar);
  const escolher = (e: React.MouseEvent) => { e.stopPropagation(); input.current?.click(); };
  const campo = enviar && (
    <input ref={input} type="file" accept="audio/*" className="hidden"
      onChange={(e) => { const f = e.target.files?.[0]; if (f) mudarImagem(caminho, f); e.target.value = ""; }} />
  );
  if (url) {
    return (
      <div className="space-y-1">
        <audio controls src={url} className="w-full" />
        {enviar && (
          <div className="flex justify-center gap-3 text-xs opacity-70">
            <button type="button" onClick={escolher} className="underline-offset-2 hover:underline">Trocar áudio</button>
            <button type="button" onClick={(e) => { e.stopPropagation(); mudarImagem(caminho, null); }} className="underline-offset-2 hover:underline">Tirar</button>
          </div>
        )}
        {campo}
      </div>
    );
  }
  if (!nota || !(mostrarFaltas || editar)) return null;
  return (
    <div onClick={enviar ? escolher : undefined} role={enviar ? "button" : undefined}
      className={cn("flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-gray-500/40 p-3 text-center text-xs opacity-70", enviar && "cursor-pointer hover:opacity-100")}>
      <span className="flex items-center gap-1.5"><Mic className="h-4 w-4" />Falta: {nota}</span>
      {enviar && <span className="opacity-70">clique para enviar o áudio</span>}
      {campo}
    </div>
  );
}

const ICONES_SELO = { raio: Zap, alvo: Crosshair, controle: Gamepad2, relogio: Clock };
const ICONES_ENFEITE = { livro: BookOpen, livros: BookCopy, estrela: Star, trofeu: Award, brilho: Sparkles };
// Enfeite solto em volta do mascote (flutua devagar, fica atrás do conteúdo; quem pede menos movimento o vê parado).
function Enfeite({ en, k }: { en: NonNullable<TelaQuiz["enfeites"]>[number]; k: number }) {
  const Ic = en.icone ? ICONES_ENFEITE[en.icone] : null;
  const tam = en.tam ?? 48;
  return (
    <div aria-hidden className="pointer-events-none absolute z-0 motion-safe:animate-[mascote-flutua_5s_ease-in-out_infinite]"
      style={{ left: `${en.x}%`, top: `${en.y}%`, width: tam, height: tam, transform: `translate(-50%,-50%) rotate(${en.rot ?? 0}deg)`, animationDelay: `${(k % 4) * -1.1}s` }}>
      {en.imagem ? <img src={en.imagem} alt="" draggable={false} className="h-full w-full object-contain" />
        : Ic && <Ic className="h-full w-full drop-shadow-md" style={{ color: en.cor ?? "#2f6fe4", fill: en.icone === "estrela" || en.icone === "trofeu" ? en.cor ?? "#2f6fe4" : "none" }} strokeWidth={en.icone === "estrela" ? 1.5 : 2} />}
    </div>
  );
}

// Tela de respiro (dado, frase, prova social) ou de apresentação do especialista.
function Tela({ t, base, f, onSeguir, suave }: { t: TelaQuiz; base: string; f: (s?: string) => string; onSeguir: () => void; suave: string }) {
  const { cor } = useContext(QuizCtx);
  const especialista = t.tipo === "especialista";
  const maior = Math.max(1, ...(t.grafico?.barras ?? []).map((b) => b.valor));
  const [iFala, setIFala] = useState(0);
  const raiz = useRef<HTMLDivElement>(null);
  const seguir = () => {
    const v = t.animada ? raiz.current?.querySelector("[data-voo]") : null;
    if (v) ORIGEM_MASCOTE = { rect: v.getBoundingClientRect(), em: performance.now() };
    onSeguir();
  };
  const [aberto, setAberto] = useState(!t.abertura);   // com abertura, o botão só aparece quando a cena termina
  const ultimaFala = !t.falas?.length || iFala >= t.falas.length - 1;
  return (
    <div ref={raiz} className={cn("space-y-5 py-2", especialista && "text-center", !!t.enfeites?.length && "relative")}>
      {t.enfeites?.map((en, k) => <Enfeite key={k} en={en} k={k} />)}
      {t.animada && (t.imagem || t.imagem_nota) ? <Mascote caminho={`${base}.imagem`} url={t.imagem} nota={t.imagem_nota} fala={f(t.fala) || undefined} falas={t.falas?.map((x) => f(x))} onFala={setIFala} quadros={t.quadros} abertura={t.abertura} onAberto={() => setAberto(true)} pose={t.pose} balaoGrande={t.balao_grande} />
      : t.loop?.length ? <MascoteLoop frames={t.loop} />
      : t.mapa && t.imagem ? <MapaConectado url={t.imagem} pontos={t.mapa.pontos} cor={cor} />
      : t.imagem_mascote && t.imagem ? <img src={t.imagem} alt="" draggable={false} className="mx-auto h-52 w-52 object-contain motion-safe:animate-empolgado" />
      : (t.imagem || t.imagem_nota) && (
        <Img caminho={`${base}.imagem`} url={t.imagem} nota={t.imagem_nota} redonda={especialista}
          className={especialista ? "mx-auto h-28 w-28" : "aspect-[16/9] max-h-[30dvh] w-full"} />
      )}
      <Txt caminho={`${base}.titulo`} valor={t.titulo} mostrar={f(t.titulo)} as="h2" className="block text-2xl font-bold leading-snug" />
      {!!t.credenciais?.length && (
        <div className="flex flex-wrap justify-center gap-1.5">
          {t.credenciais.map((c, k) => <Txt key={k} caminho={`${base}.credenciais.${k}`} valor={c} className="rounded-full border px-2.5 py-0.5 text-xs" />)}
        </div>
      )}
      {t.citacao?.texto && (
        <figure className="rounded-xl border-l-4 py-1 pl-4 text-left" style={{ borderColor: cor }}>
          <Quote className="mb-1 h-5 w-5 opacity-50" />
          <Txt caminho={`${base}.citacao.texto`} valor={t.citacao.texto} as="blockquote" className="block text-lg font-medium italic leading-snug" />
          <Txt caminho={`${base}.citacao.autor`} valor={t.citacao.autor} as="figcaption" className={cn("mt-1 block text-sm", suave)} />
        </figure>
      )}
      {t.grafico?.tipo === "curva" && (
        <div className="space-y-1 text-left">
          <Txt caminho={`${base}.grafico.titulo`} valor={t.grafico.titulo} as="p" className={cn("block text-xs font-semibold uppercase tracking-wider", suave)} />
          <GraficoCurva barras={t.grafico.barras} aqui={t.grafico.aqui} cor={cor} />
        </div>
      )}
      {t.grafico && t.grafico.tipo !== "curva" && (
        <div className="space-y-2 text-left">
          <Txt caminho={`${base}.grafico.titulo`} valor={t.grafico.titulo} as="p" className={cn("block text-xs font-semibold uppercase tracking-wider", suave)} />
          {t.grafico.barras.map((b, k) => (
            <div key={k} className="space-y-1">
              <div className="flex justify-between text-sm"><span>{b.rotulo}</span><span className="font-bold">{b.legenda ?? b.valor}</span></div>
              <div className="h-3 overflow-hidden rounded-full bg-gray-500/20">
                <div className="h-full rounded-full animate-in slide-in-from-left duration-1000"
                  style={{ width: `${(b.valor / maior) * 100}%`, background: b.destaque ? cor : "currentColor", opacity: b.destaque ? 1 : 0.35 }} />
              </div>
            </div>
          ))}
        </div>
      )}
      <Txt caminho={`${base}.texto`} valor={t.texto} mostrar={f(t.texto)} as="p" className={cn("block text-base leading-relaxed", !especialista && "text-left")} />
      <AudioDaTela caminho={`${base}.audio`} url={t.audio} nota={t.audio_nota} />
      <Depoimentos caminho={`${base}.depoimentos`} lista={t.depoimentos} nota={t.depoimentos_nota} />
      <Txt caminho={`${base}.fonte`} valor={t.fonte} as="p" className={cn("block text-left text-[11px]", suave)} />
      {!!t.selos?.length && (
        <div className="relative flex flex-wrap justify-center gap-2">
          {t.selos.map((sl, k) => {
            const Ic = sl.icone ? ICONES_SELO[sl.icone] : null;
            return (
              <span key={k} className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-bold shadow-sm" style={{ background: sl.fundo, color: sl.cor }}>
                {Ic && <Ic className="h-4 w-4" />}{sl.texto}
              </span>
            );
          })}
        </div>
      )}
      <div className={cn((!aberto || !ultimaFala) && "invisible")}><Botao onClick={seguir}>{ultimaFala ? <Txt caminho={`${base}.botao`} valor={t.botao || "Continuar"} /> : <span>{t.botao_inicial || "Continuar"}</span>}</Botao></div>
    </div>
  );
}

// "Analisando…": barra enchendo e as etapas sendo marcadas; passa sozinha.
/** Vídeo no estilo do vturb: começa mudo e em loop assim que aparece, com o aviso "Clique para ouvir";
 * ao clicar recomeça do zero com som, sem pausar nem avançar, e vai até o fim. */
function VideoVsl({ url, poster }: { url: string; poster?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [ouvindo, setOuvindo] = useState(false);
  const [progresso, setProgresso] = useState(0);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting && !ouvindo) void v.play().catch(() => {}); }, { threshold: 0.4 });
    io.observe(v);
    return () => io.disconnect();
  }, [ouvindo]);
  const ouvir = () => {
    const v = ref.current;
    if (!v) return;
    v.loop = false;
    v.muted = false;
    v.currentTime = 0;
    setOuvindo(true);
    void v.play().catch(() => {});
  };
  return (
    <div className="relative mx-auto aspect-[9/16] max-h-[70dvh] w-full max-w-[280px] select-none overflow-hidden rounded-2xl bg-black" onContextMenu={(e) => e.preventDefault()}>
      <video
        ref={ref}
        src={url}
        poster={poster}
        muted
        loop
        playsInline
        preload="auto"
        disablePictureInPicture
        controlsList="nodownload noplaybackrate noremoteplayback"
        onTimeUpdate={(e) => ouvindo && setProgresso(e.currentTarget.currentTime / (e.currentTarget.duration || 1))}
        className="pointer-events-none h-full w-full object-cover"
      />
      {!ouvindo && (
        <button type="button" onClick={ouvir} className="absolute inset-0 flex items-center justify-center p-4">
          <span className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-white/90 bg-[#e0623f]/85 px-3 py-5 text-white">
            <span className="text-base font-extrabold leading-tight">Seu vídeo já começou</span>
            <VolumeX className="h-14 w-14" strokeWidth={2.2} />
            <span className="text-base font-extrabold leading-tight">Clique para ouvir</span>
          </span>
        </button>
      )}
      {ouvindo && <div className="absolute inset-x-0 bottom-0 h-1 bg-white/25"><div className="h-full bg-white" style={{ width: `${progresso * 100}%` }} /></div>}
    </div>
  );
}

function Carregando({ t, base, f, onPronto, suave }: { t: TelaQuiz; base: string; f: (s?: string) => string; onPronto?: () => void; suave: string }) {
  const { cor } = useContext(QuizCtx);
  const itens = t.itens ?? [];
  const jogando = !!onPronto;   // no editor ele não anda: dá para ver cada etapa e editar a pergunta daquela etapa
  const pausas = jogando ? (t.pausas ?? []) : (t.pausas ?? []);
  const [pct, setPct] = useState(0);
  // Perguntas que param o carregamento (como no 12min): ao chegar em `pct`, espera um pouco (para dar tempo de ler o item
  // que está carregando) e abre o cartão "Para seguir em frente, responda" por cima da tela.
  const [pausa, setPausa] = useState<number | null>(null);
  const feitas = useRef(0);
  const decorrido = useRef(0);
  const pronto = useRef(onPronto);
  pronto.current = onPronto;
  useEffect(() => {
    if (!jogando || pausa !== null) return;
    const dur = 9500;   // devagar: dá para ler cada etapa (Davi, 10/11: "as perguntas estão aparecendo rápido demais")
    let espera: number | undefined;
    const id = window.setInterval(() => {
      decorrido.current += 60;
      const p = Math.min(100, Math.round((decorrido.current / dur) * 100));
      const prox = pausas[feitas.current];
      if (prox && p >= prox.pct) {
        window.clearInterval(id); setPct(prox.pct);
        espera = window.setTimeout(() => setPausa(feitas.current), 1600);
        return;
      }
      setPct(p);
      if (p >= 100) { window.clearInterval(id); window.setTimeout(() => pronto.current?.(), 900); }
    }, 60);
    return () => { window.clearInterval(id); if (espera) window.clearTimeout(espera); };
  }, [pausa]);   // eslint-disable-line react-hooks/exhaustive-deps
  const responder = () => { feitas.current += 1; setPausa(null); };
  // Editor: escolhe a etapa para ver (0..n-1 = com a pergunta; n = 100%).
  const [etapa, setEtapa] = useState(0);
  const pctMostrado = jogando ? pct : (etapa < pausas.length ? pausas[etapa].pct : 100);
  const pergunta = jogando ? (pausa !== null ? pausas[pausa] : undefined) : (etapa < pausas.length ? pausas[etapa] : undefined);
  const iPergunta = jogando ? pausa : (etapa < pausas.length ? etapa : null);
  const cartao = pergunta && iPergunta !== null && (
    <div className={cn("flex items-center justify-center bg-black/45 p-6", jogando ? "fixed inset-0 z-50 animate-in fade-in duration-200" : "absolute inset-0 z-10 rounded-2xl")}>
      <div className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-5 text-center text-gray-900 shadow-2xl animate-in zoom-in-95 duration-300">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Para seguir em frente, responda</p>
        <Txt caminho={`${base}.pausas.${iPergunta}.texto`} valor={pergunta.texto} as="p" className="block text-lg font-bold leading-snug" />
        <div className="grid grid-cols-2 gap-2">
          {pergunta.opcoes.map((o, k) => (jogando
            ? <button key={k} type="button" onClick={responder} className="rounded-xl border-2 px-3 py-3 text-sm font-semibold transition-colors hover:text-white" style={{ borderColor: cor }}
                onMouseEnter={(ev) => { ev.currentTarget.style.background = cor; }} onMouseLeave={(ev) => { ev.currentTarget.style.background = ""; }}>{o}</button>
            : <div key={k} className="rounded-xl border-2 px-3 py-3 text-sm font-semibold" style={{ borderColor: cor }}><Txt caminho={`${base}.pausas.${iPergunta}.opcoes.${k}`} valor={o} /></div>))}
        </div>
      </div>
    </div>
  );
  return (
    <div className="relative space-y-5 py-6 text-center">
      <Txt caminho={`${base}.titulo`} valor={t.titulo} mostrar={f(t.titulo)} as="h2" className="block text-xl font-bold" />
      {t.imagem && <img src={t.imagem} alt="" draggable={false} className="mx-auto h-36 object-contain motion-safe:animate-[mascote-flutua_4s_ease-in-out_infinite]" />}
      <div className="relative mx-auto h-28 w-28">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" strokeOpacity=".1" strokeWidth="8" />
          <circle cx="50" cy="50" r="44" fill="none" stroke={cor} strokeWidth="8" strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 44} strokeDashoffset={2 * Math.PI * 44 * (1 - pctMostrado / 100)} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-2xl font-extrabold">{pctMostrado}%</span>
      </div>
      <ul className="mx-auto max-w-sm space-y-2 text-left text-sm">
        {itens.map((it, k) => {
          const feito = pctMostrado >= ((k + 1) / (itens.length + 0.5)) * 100;
          return (
            <li key={k} className={cn("flex items-center gap-2 transition-opacity duration-500", feito ? "opacity-100" : "opacity-35")}>
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white" style={{ background: feito ? cor : "transparent", border: feito ? "none" : "1px solid currentColor" }}>
                {feito ? <Check className="h-3 w-3" /> : <Loader2 className="h-3 w-3 animate-spin" />}
              </span>
              <Txt caminho={`${base}.itens.${k}`} valor={it} mostrar={f(it)} />
            </li>
          );
        })}
      </ul>
      {!jogando && !!pausas.length && (
        <div className="flex flex-wrap items-center justify-center gap-1.5 text-xs">
          <span className={suave}>Etapa:</span>
          {[...pausas.map((x) => `${x.pct}%`), "100%"].map((r, k) => (
            <button key={k} type="button" onClick={() => setEtapa(k)} className={cn("rounded-full border px-2.5 py-0.5 font-semibold", etapa === k ? "text-white" : "opacity-70")}
              style={etapa === k ? { background: cor, borderColor: cor } : undefined}>{r}</button>
          ))}
        </div>
      )}
      {!jogando && <p className={cn("text-xs", suave)}>(editando: no quiz de verdade esta tela passa sozinha e a pergunta abre por cima)</p>}
      {cartao}
    </div>
  );
}

// Resultado: o perfil em destaque, o gráfico de onde o dia vaza e o texto em blocos.
function Resultado({ e, t, base, perfil, iPerfil, escolhas, nome, f, onSeguir, suave }: {
  e: EstruturaQuiz; t?: TelaQuiz; base: string; perfil: PerfilQuiz | null; iPerfil: number;
  escolhas: Record<string, number>; nome?: string; f: (s?: string) => string; onSeguir?: () => void; suave: string;
}) {
  const { cor, escuro, editar } = useContext(QuizCtx);
  const barras = barrasDoResultado(e, escolhas);
  const maior = Math.max(...barras.map((b) => b.pct));
  const pp = `perfis.${iPerfil}`;
  const blocos = (perfil?.descricao ?? "").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="space-y-6">
      <div className="space-y-3 text-center animate-in zoom-in-95 duration-700">
        {t?.titulo
          ? <Txt caminho={`${base}.titulo`} valor={t.titulo} mostrar={f(t.titulo)} as="p" className={cn("block text-xs font-semibold uppercase tracking-[0.2em]", suave)} />
          : <p className={cn("text-xs font-semibold uppercase tracking-[0.2em]", suave)}>Seu resultado</p>}
        {perfil && <Img caminho={`${pp}.imagem`} url={perfil.imagem} nota={perfil.imagem_nota} className="mx-auto aspect-square w-40" />}
        {perfil && (primeiroNome(nome) || editar) && (
          <Txt caminho="resultado.chamada" valor={e.resultado?.chamada || "{nome}, você é"} mostrar={f(e.resultado?.chamada || "{nome}, você é")} as="p" className="block text-lg font-medium" />
        )}
        <h2 className="text-3xl font-extrabold leading-tight sm:text-4xl" style={{ color: cor }}>
          {perfil ? <Txt caminho={`${pp}.nome`} valor={perfil.nome} /> : "Obrigado!"}
        </h2>
        {perfil && <Txt caminho={`${pp}.resumo`} valor={perfil.resumo} as="p" className="block text-lg font-medium" />}
      </div>
      {barras.length > 1 && (
        <div className={cn("space-y-2.5 rounded-2xl p-4", escuro ? "bg-white/5" : "bg-black/[0.03]")}>
          <Txt caminho="resultado.grafico.titulo" valor={e.resultado?.grafico?.titulo ?? "Onde o seu dia vaza"} as="p" className={cn("block text-xs font-semibold uppercase tracking-wider", suave)} />
          <Txt caminho="resultado.grafico.subtitulo" valor={e.resultado?.grafico?.subtitulo} as="p" className={cn("block text-sm", suave)} />
          {barras.map((b, k) => (
            <div key={k} className="space-y-1">
              <div className="flex justify-between text-sm"><span className={b.pct === maior ? "font-semibold" : undefined}>{b.rotulo}</span><span className="font-bold tabular-nums">{b.pct}%</span></div>
              <div className="h-3 overflow-hidden rounded-full bg-gray-500/20">
                <div className="h-full rounded-full animate-in slide-in-from-left duration-1000"
                  style={{ width: `${Math.max(3, b.pct)}%`, background: b.pct === maior ? cor : "currentColor", opacity: b.pct === maior ? 1 : 0.3 }} />
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="space-y-3 text-left">
        {blocos.map((b, k) => {
          const destaque = /^O que está te sabotando/i.test(b);
          return (
            <p key={k} className={cn("whitespace-pre-line text-base leading-relaxed", destaque && "rounded-xl border-l-4 py-2 pl-4 font-medium", destaque && (escuro ? "bg-white/5" : "bg-black/[0.03]"))}
              style={destaque ? { borderColor: cor } : undefined}>{b}</p>
          );
        })}
      </div>
      {perfil && editar && (
        <div className="space-y-1">
          <p className={cn("text-xs", suave)}>Texto do perfil (separe os blocos com uma linha em branco):</p>
          <Txt caminho={`${pp}.descricao`} valor={perfil.descricao} as="div" className="block text-sm" />
        </div>
      )}
      {t && <Txt caminho={`${base}.texto`} valor={t.texto} mostrar={f(t.texto)} as="p" className="block text-base font-medium" />}
      {onSeguir && t && <Botao onClick={onSeguir}><Txt caminho={`${base}.botao`} valor={t.botao || "Continuar"} /></Botao>}
    </div>
  );
}

// A oferta no fim do quiz (a página de vendas dentro do quiz), no visual escuro do 12min (Davi, 10/11): o que a pessoa
// recebe, o plano pronto com o cupom e o preço De/Por, o botão, a garantia, depoimentos, perguntas frequentes e o
// bloco de compra repetido no fim.
function Oferta({ e, perfil, f }: { e: EstruturaQuiz; perfil: PerfilQuiz | null; iPerfil?: number; f: (s?: string) => string; suave?: string }) {
  const { aoClicarOferta, editar } = useContext(QuizCtx);
  const o = e.oferta!;
  const url = o.cta_url || perfil?.cta_url;
  const texto = o.cta_texto || perfil?.cta_texto || "Ativar meu plano";
  const verde = "#34d399", roxo = "#9aa7ff";
  const de = o.preco_de, por = o.preco_por ?? o.preco;
  const compra = (k: number) => (
    <div key={k} className="space-y-4">
      <Txt caminho="oferta.titulo" valor={o.titulo} mostrar={f(o.titulo)} as="h2" className="block text-center text-2xl font-extrabold leading-tight" />
      {(o.cupom || o.subtitulo) && (
        <div className="space-y-1">
          <p className="text-center text-sm font-semibold" style={{ color: verde }}>Seu cupom foi aplicado!</p>
          <div className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5" style={{ borderColor: `${verde}66`, background: `${verde}14` }}>
            <span className="flex items-center gap-2 text-sm font-semibold"><Check className="h-4 w-4" style={{ color: verde }} /><Txt caminho="oferta.cupom.codigo" valor={o.cupom?.codigo ?? o.subtitulo} /></span>
            {o.cupom?.desconto && <span className="rounded-md px-2 py-0.5 text-xs font-extrabold text-[#0a1020]" style={{ background: verde }}><Txt caminho="oferta.cupom.desconto" valor={o.cupom.desconto} /></span>}
          </div>
        </div>
      )}
      <div className="text-center">
        {o.parcelas ? (
          <>
            {de && <p className="text-sm text-white/60">De <s><Txt caminho="oferta.preco_de" valor={de} /></s> por apenas</p>}
            <p className="text-4xl font-extrabold"><span className="text-xl font-bold text-white/80">{o.parcelas.n}x de </span><Txt caminho="oferta.parcelas.valor" valor={o.parcelas.valor} /></p>
          </>
        ) : (
          <>
            {de && <p className="text-sm text-white/60">De <s><Txt caminho="oferta.preco_de" valor={de} /></s> por</p>}
            <Txt caminho="oferta.preco_por" valor={por} as="p" className="block text-4xl font-extrabold" />
            <Txt caminho="oferta.preco_detalhe" valor={o.preco_detalhe && !de ? o.preco_detalhe : undefined} as="p" className="block text-sm text-white/60" />
          </>
        )}
      </div>
      {url
        ? <a href={url} target="_blank" rel="noreferrer" onClick={() => aoClicarOferta?.()} className="flex min-h-12 w-full items-center justify-center rounded-xl px-4 py-3 text-base font-bold text-[#0a1020] transition-transform hover:scale-[1.02] active:scale-[0.98]" style={{ background: roxo, boxShadow: `0 8px 24px -8px ${roxo}` }}><Txt caminho="oferta.cta_texto" valor={texto} /></a>
        : <div className="flex min-h-12 w-full items-center justify-center rounded-xl px-4 py-3 text-base font-bold text-[#0a1020] opacity-90" style={{ background: roxo }}><Txt caminho="oferta.cta_texto" valor={texto} />{!editar && <span className="ml-2 text-xs font-medium">(link ainda não definido)</span>}</div>}
      {o.garantia && (
        <div className="flex items-start gap-3 rounded-2xl border p-4 text-sm" style={{ borderColor: `${verde}55`, background: `${verde}10` }}>
          <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0" style={{ color: verde }} />
          <Txt caminho="oferta.garantia" valor={o.garantia} className="font-semibold" />
        </div>
      )}
    </div>
  );
  return (
    <div className="space-y-7 bg-[#0a1020] p-5 text-white [box-shadow:0_0_0_100vmax_#0a1020] [clip-path:inset(-100vmax)]">   {/* ponta a ponta: o fundo escuro vai até as bordas da tela, também em cima e embaixo (sem faixa branca) */}
      {!!o.itens?.length && (
        <section className="space-y-3">
          <Txt caminho="oferta.recebe_titulo" valor={o.recebe_titulo ?? "O que você recebe com o Instalivros"} as="h3" className="block text-lg font-extrabold" />
          <ul className="space-y-2.5">
            {o.itens.map((it, k) => (
              <li key={k} className="flex items-start gap-2.5 text-sm leading-snug">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ background: verde }}><Check className="h-3.5 w-3.5 text-[#0a1020]" strokeWidth={3.5} /></span>
                <Txt caminho={`oferta.itens.${k}`} valor={it} />
              </li>
            ))}
          </ul>
          {!!o.bonus?.length && (
            <div className="space-y-2.5 pt-3">
              <Txt caminho="oferta.bonus_titulo" valor={o.bonus_titulo ?? "Bônus"} as="h3" className="block text-lg font-extrabold" />
              {o.bonus.map((b, k) => (
                <div key={k} className="space-y-1 rounded-2xl border border-white/15 bg-white/5 p-4">
                  <p className="text-sm font-extrabold leading-snug"><span aria-hidden>🎁 </span><Txt caminho={`oferta.bonus.${k}.titulo`} valor={b.titulo} /></p>
                  <Txt caminho={`oferta.bonus.${k}.texto`} valor={b.texto} as="p" className="block text-sm leading-snug text-white/80" />
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      {o.video?.url
        ? (
          <div className="space-y-3">
            <Txt caminho="oferta.video.titulo" valor={o.video.titulo ?? "Veja por dentro do app"} as="h3" className="block text-center text-lg font-extrabold" />
            <VideoVsl url={o.video.url} poster={o.video.poster} />
          </div>
        )
        : <Img caminho="oferta.imagem" url={o.imagem} nota={o.imagem_nota} className="aspect-[16/9] max-h-[30dvh] w-full" />}
      {compra(0)}
      {(!!o.depoimentos?.length || editar) && (
        <section className="space-y-3">
          <Txt caminho="oferta.depoimentos_titulo" valor={o.depoimentos_titulo ?? "Os usuários adoram o Instalivros!"} as="h3" className="block text-center text-lg font-extrabold" />
          <div className="space-y-2.5">
            {(o.depoimentos ?? []).map((d, k) => (
              <figure key={k} className="space-y-1.5 rounded-2xl border border-white/10 bg-white/5 p-4 text-left">
                <p className="text-sm tracking-widest" style={{ color: "#fbbf24" }}>★★★★★</p>
                <Txt caminho={`oferta.depoimentos.${k}.texto`} valor={d.texto} as="blockquote" className="block text-sm italic leading-relaxed text-white/90" />
                <Txt caminho={`oferta.depoimentos.${k}.nome`} valor={d.nome} as="figcaption" className="block text-xs font-semibold text-white/60" />
              </figure>
            ))}
          </div>
          {!o.depoimentos?.length && !!o.depoimentos_nota && <p className="rounded-xl border-2 border-dashed border-white/20 p-3 text-center text-xs text-white/60">Falta: {o.depoimentos_nota}</p>}
        </section>
      )}
      {!!o.faq?.length && (
        <section className="space-y-2">
          <h3 className="text-center text-lg font-extrabold">Perguntas frequentes</h3>
          {o.faq.map((q, k) => (
            <details key={k} open={editar || undefined} className="group rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                <Txt caminho={`oferta.faq.${k}.pergunta`} valor={q.pergunta} />
                <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" style={{ color: roxo }} />
              </summary>
              <Txt caminho={`oferta.faq.${k}.resposta`} valor={q.resposta} as="p" className="mt-2 block text-sm leading-relaxed text-white/70" />
            </details>
          ))}
        </section>
      )}
      {o.repetir !== false && compra(1)}
      <Txt caminho="oferta.fechamento" valor={o.fechamento} mostrar={f(o.fechamento)} as="p" className="block text-center text-sm italic text-white/60" />
    </div>
  );
}
