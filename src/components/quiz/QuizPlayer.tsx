import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ElementType, type ReactNode } from "react";
import { DepoimentoCartao, CurtirLivros, SeteDias } from "./TelasPosCaptura";
import type { LucideIcon } from "lucide-react";
import { Ban, Calendar, CheckCircle2, Compass, MessageCircle, Moon, RefreshCw, Smartphone, Target, User, Award, BookOpen, BookCopy, Clock, Crosshair, Gamepad2, Lightbulb, Sparkles, Star, Zap, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, ChevronDown, Copy, Headphones, ImagePlus, Loader2, Lock, Mic, Plus, Quote, ShieldCheck, Trash2, VolumeX, X, Plane, Briefcase, Film, Sprout, Leaf, TreeDeciduous, Crown, Volume1, Volume2, Play, Ear, CircleHelp } from "lucide-react";
import confetti from "canvas-confetti";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  barrasDoResultado, calcularPerfil, comValor, corDoQuiz, montarPassos, nomeCompleto, notaDoIndice, ofertaMensalUnica, preencher, primeiroNome,
  type BarraFixa, type CampoCaptura, type Depoimento, type EstruturaQuiz, type PerfilQuiz, type PlanoOferta, type TelaQuiz, type VisualQuiz,
} from "@/lib/quiz/quiz";
import { alternarMarcada, metaDaSelecao } from "@/lib/quiz/selecao";
import { beneficiosDoIndice } from "@/lib/quiz/indice";
import { faixaDoNumero, limitesDoNumero, listaEmTexto, livrosEm12Meses, resumosPorSemana, textoDoNumero } from "@/lib/quiz/numeros";
import { comDadosDoLead } from "@/lib/quiz/utm";
import { montarPlano, razoesDoPerfil, temaDaOpcao, tituloBonito, ROTULO_TEMA, type LivroPlano, type PlanoMontado, type Tema } from "@/lib/quiz/plano";
import { PerfilTela, PlanoLivrosTela } from "./PlanoQuiz";
import { AmostraTela, type LivroAmostra } from "./AmostraQuiz";
import { OrbitaTrio } from "./OrbitaQuiz";
import { ChatMensagens, ChatPergunta, type HistoricoChat } from "./ChatPergunta";
import { BotaoSegurar, CartaoCompromisso, BarrasMentores, DepoimentoAnimado, PlanoEmNumeros, ProjecaoLivros, ReguaNumero, RoletaNumero, type BarraMentor, type LinhaDoPlano } from "./NumerosQuiz";
import { cn } from "@/lib/utils";

// O quiz rodando: abertura → perguntas (com telas de respiro, especialista e
// carregando no meio) → captura → resultado e oferta. Na página pública envia
// a resposta; no Infopro (teste) não grava nada. Com `editar`, o Davi clica num
// texto pra mudar a palavra e numa imagem pra enviar (onMudar/onImagem).
export interface FimDoQuiz { escolhas: Record<string, number>; /** Respostas em número (roleta/régua), por id da pergunta. */ numeros: Record<string, number>; perfil: PerfilQuiz | null; contato: Partial<Record<CampoCaptura, string>>; /** Perguntas de "escolha quantas quiser": índices marcados por id da pergunta. */ marcadas: Record<string, number[]>; /** Livros que a pessoa curtiu (ids do catálogo do Instalivros). */ curtidos: number[]; /** Livros que a pessoa passou (👎). */ rejeitados: number[] }

const ROTULO_CAMPO: Record<CampoCaptura, { rotulo: string; tipo: string; exemplo: string }> = {
  nome: { rotulo: "Seu nome", tipo: "text", exemplo: "Como você se chama?" },
  email: { rotulo: "Seu e-mail", tipo: "email", exemplo: "voce@email.com" },
  whatsapp: { rotulo: "Seu WhatsApp", tipo: "tel", exemplo: "(11) 99999-9999" },
};
/** Países do WhatsApp (visual cartão): bandeira + DDI; Brasil vem escolhido e o "+55" já aparece. */
const PAISES_FONE: { bandeira: string; nome: string; ddi: string }[] = [
  { bandeira: "🇧🇷", nome: "Brasil", ddi: "55" }, { bandeira: "🇵🇹", nome: "Portugal", ddi: "351" }, { bandeira: "🇺🇸", nome: "Estados Unidos / Canadá", ddi: "1" },
  { bandeira: "🇦🇴", nome: "Angola", ddi: "244" }, { bandeira: "🇲🇿", nome: "Moçambique", ddi: "258" }, { bandeira: "🇨🇻", nome: "Cabo Verde", ddi: "238" },
  { bandeira: "🇪🇸", nome: "Espanha", ddi: "34" }, { bandeira: "🇬🇧", nome: "Reino Unido", ddi: "44" }, { bandeira: "🇫🇷", nome: "França", ddi: "33" },
  { bandeira: "🇩🇪", nome: "Alemanha", ddi: "49" }, { bandeira: "🇮🇹", nome: "Itália", ddi: "39" }, { bandeira: "🇨🇭", nome: "Suíça", ddi: "41" },
  { bandeira: "🇮🇪", nome: "Irlanda", ddi: "353" }, { bandeira: "🇦🇷", nome: "Argentina", ddi: "54" }, { bandeira: "🇵🇾", nome: "Paraguai", ddi: "595" },
  { bandeira: "🇺🇾", nome: "Uruguai", ddi: "598" }, { bandeira: "🇨🇱", nome: "Chile", ddi: "56" }, { bandeira: "🇨🇴", nome: "Colômbia", ddi: "57" },
  { bandeira: "🇲🇽", nome: "México", ddi: "52" }, { bandeira: "🇯🇵", nome: "Japão", ddi: "81" }, { bandeira: "🇦🇺", nome: "Austrália", ddi: "61" },
  { bandeira: "🇦🇪", nome: "Emirados Árabes", ddi: "971" },
];
/** (11) 99999-8888 enquanto digita (Brasil); tira o 55 colado na frente. */
function mascaraBR(digitos: string): string {
  let d = digitos.replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  d = d.slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
/** O que vale como telefone certo: Brasil = DDD + número (10 ou 11 dígitos); outro país (“+351 …”) = 6 a 13 dígitos depois do código. */
function foneValido(v: string): boolean {
  const t = v.trim();
  const d = t.replace(/\D/g, "");
  if (t.startsWith("+")) { const p = PAISES_FONE.find((x) => d.startsWith(x.ddi) && x.ddi !== "55"); const resto = p ? d.length - p.ddi.length : d.length; return resto >= 6 && resto <= 13; }
  return d.length === 10 || d.length === 11;
}
function CampoWhatsapp({ valor, onChange, id, invalido, placeholder }: { valor: string; onChange: (v: string) => void; id?: string; invalido?: boolean; placeholder?: string }) {
  const [ddi, setDdi] = useState(() => (valor.startsWith("+") ? PAISES_FONE.find((p) => valor.replace(/\D/g, "").startsWith(p.ddi) && p.ddi !== "55")?.ddi ?? "55" : "55"));
  const pais = PAISES_FONE.find((p) => p.ddi === ddi) ?? PAISES_FONE[0];
  const br = ddi === "55";
  const numero = br ? valor : valor.replace(/^\+\d+\s?/, "");
  const compor = (n: string, d = ddi) => (d === "55" ? mascaraBR(n) : n.replace(/[^\d\s-]/g, "").trim() ? `+${d} ${n.replace(/[^\d\s-]/g, "")}` : "");
  return (
    <div className="qs-fone">
      <label className="qs-ddi">
        <span aria-hidden>{pais.bandeira} +{pais.ddi} <i>▾</i></span>
        <select aria-label="País do WhatsApp" value={ddi} onChange={(ev) => { setDdi(ev.target.value); onChange(compor(valor.startsWith("+") ? valor.replace(/^\+\d+\s?/, "") : valor.replace(/\D/g, ""), ev.target.value)); }}>
          {PAISES_FONE.map((p) => <option key={p.ddi + p.nome} value={p.ddi}>{p.bandeira} {p.nome} (+{p.ddi})</option>)}
        </select>
      </label>
      <Input id={id} type="tel" inputMode="tel" autoComplete="tel-national" value={numero} placeholder={br ? placeholder : "Seu número"} aria-invalid={invalido || undefined}
        className={cn("h-12 text-base", "qs-input", invalido && "qs-invalido")} onChange={(ev) => onChange(compor(ev.target.value))} />
    </div>
  );
}
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
  aoClicarOferta?: (plano?: string) => void;   // métrica: clique no link da oferta (e qual plano estava escolhido)
  /** Antes de abrir o checkout: leva nome, e-mail e WhatsApp que a pessoa já deu para o formulário de compra (Eduzz). */
  linkDeCompra?: (url: string) => string;
  /** Identidade visual do quiz (estrutura.visual): cor e texto dos botões principais. */
  botao?: { fundo: string; texto: string };
  /** Visual com `cartao` (Instalivros do Claude): telas de resultado/oferta no estilo do cartão. */
  skin?: boolean;
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
  return t ? <Tag className={cn("whitespace-pre-line", className)}>{comGrifo(t)}</Tag> : null;
}

// Carrossel de depoimentos da captura: passa sozinho (~3,5 s), volta ao 1º no fim e dá para arrastar com o dedo. Altura fixa.
function CarrosselDepoimentos({ lista, titulo, escuro, suave }: { lista: { nome: string; fonte?: string; texto: string }[]; titulo?: string; escuro: boolean; suave: string }) {
  const { editar } = useContext(QuizCtx);
  const trilho = useRef<HTMLDivElement>(null);
  const [atual, setAtual] = useState(0);
  const pausa = useRef(0);
  const parado = useRef(false); // editor: mouse em cima ou foco num texto do trilho
  const irPara = (i: number) => {
    const el = trilho.current; const cartao = el?.children[i] as HTMLElement | undefined;
    if (el && cartao) el.scrollTo({ left: cartao.offsetLeft - (el.clientWidth - cartao.clientWidth) / 2, behavior: "smooth" });
  };
  useEffect(() => {
    if (lista.length < 2) return;
    const t = setInterval(() => {
      if (Date.now() < pausa.current || (editar && parado.current)) return;
      setAtual((a) => { const p = (a + 1) % lista.length; irPara(p); return p; });
    }, 3500);
    return () => clearInterval(t);
  }, [editar, lista.length]);
  const pararEditando = editar ? {
    onMouseEnter: () => { parado.current = true; },
    onMouseLeave: () => { parado.current = !!trilho.current?.contains(document.activeElement); },
    onFocus: () => { parado.current = true; },
    onBlur: (e: React.FocusEvent<HTMLDivElement>) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) parado.current = false; },
  } : {};
  const aoRolar = () => {
    const el = trilho.current; if (!el) return;
    let melhor = 0, dist = Infinity;
    Array.from(el.children).forEach((c, i) => { const h = c as HTMLElement; const d = Math.abs(h.offsetLeft + h.clientWidth / 2 - (el.scrollLeft + el.clientWidth / 2)); if (d < dist) { dist = d; melhor = i; } });
    setAtual(melhor);
  };
  return (
    <div className="space-y-2">
      {(titulo || editar) && <Txt caminho="captura.depoimentos_titulo" valor={titulo} as="p" className={cn("block text-center text-sm font-semibold", suave)} />}
      <div ref={trilho} onScroll={aoRolar} {...pararEditando} onTouchStart={() => { pausa.current = Date.now() + 8000; }} onPointerDown={() => { pausa.current = Date.now() + 8000; }}
        className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-[7.5%] pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {lista.map((d, i) => {
          const loja = /app\s*store/i.test(d.fonte || "") ? "App Store" : /google/i.test(d.fonte || "") ? "Google Play" : "";
          return (
            <div key={i} className={cn("flex h-[132px] w-[85%] shrink-0 snap-center flex-col justify-between rounded-xl border p-3 text-left", escuro ? "border-white/15 bg-white/10" : "border-black/10 bg-white text-[#1f2937] shadow-sm")}>
              <div className="space-y-1">
                <div className="flex gap-0.5 text-amber-400">{[0, 1, 2, 3, 4].map((s) => <Star key={s} className="h-3.5 w-3.5 fill-amber-400" strokeWidth={0} />)}</div>
                <Txt caminho={`captura.depoimentos.${i}.texto`} valor={d.texto} mostrar={d.texto ? `“${d.texto}”` : ""} as="p" className="line-clamp-4 text-xs leading-snug" />
              </div>
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <Txt caminho={`captura.depoimentos.${i}.nome`} valor={d.nome} as="span" className="truncate font-semibold" />
                {loja && <span className="shrink-0 rounded-full border border-current/20 px-2 py-0.5 text-[10px] font-medium opacity-80">{loja}</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-center gap-1.5">
        {lista.map((_, i) => <span key={i} className={cn("h-1.5 rounded-full transition-all", i === atual ? "w-4 bg-current opacity-60" : "w-1.5 bg-current opacity-20")} />)}
      </div>
    </div>
  );
}

// Grifo de marca-texto: ==trecho== vira fundo amarelo atrás das palavras (Davi, 13/11).
function comGrifo(t: string): ReactNode {
  if (!t.includes("==")) return t;
  return t.split(/==(.+?)==/g).map((p, i) => i % 2
    ? <mark key={i} className="rounded-sm bg-[#fde047] px-1 text-[#0a1020] [box-decoration-break:clone]">{p}</mark>
    : p);
}

// **negrito** (V3): o trecho entre dois asteriscos duplos vira negrito.
function comNegrito(t: string): ReactNode {
  if (!t.includes("**")) return t;
  return t.split(/\*\*(.+?)\*\*/g).map((p, i) => (i % 2 ? <strong key={i} className="font-extrabold">{p}</strong> : p));
}
// Igual ao Txt, mas com **negrito** fora do editor.
function TxtNegrito({ caminho, valor, mostrar, as: Tag = "span", className }: { caminho: string; valor?: string; mostrar?: string; as?: ElementType; className?: string }) {
  const { editar } = useContext(QuizCtx);
  if (editar) return <Txt caminho={caminho} valor={valor} as={Tag} className={className} />;
  const t = mostrar ?? valor;
  return t ? <Tag className={cn("whitespace-pre-line", className)}>{comNegrito(t)}</Tag> : null;
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
function BarraFases({ fases, atual, frac, cor, escuro, comemorar = true, vturb = false, onVoltar }: { fases: string[]; atual: number; frac: number; cor: string; escuro: boolean; comemorar?: boolean; vturb?: boolean; onVoltar?: () => void }) {
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
  // Estilo vturb: dentro da fase a barra enche rápido no começo e desacelera (ease-out); nunca passa da bolinha.
  const visual = vturb ? 1 - Math.pow(1 - frac, 2.2) : frac;
  const fill = Math.min(100, ((atual + visual) / n) * 100);
  const claro = escuro ? "rgba(255,255,255,.14)" : `${cor}26`;
  return (
    <div className="shrink-0 space-y-1.5">
      <div className="relative flex h-9 items-center justify-center">
        <button type="button" onClick={onVoltar} disabled={!onVoltar} aria-label="Voltar"
          className={cn("absolute left-0 flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition-opacity", !onVoltar && "invisible")}
          style={{ background: claro, color: cor }}><ArrowLeft className="h-4 w-4" />Voltar</button>
        <span className="text-xl font-extrabold tracking-tight" style={{ color: cor }}>Instalivros</span>
      </div>
      <div className={cn("relative mx-1 pt-1", n > 1 && atual === n - 2 ? "pb-9" : "pb-5")}>
        <div className="relative h-5">
          <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full" style={{ background: claro }} />
          <div className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full transition-all duration-500 ease-out" style={{ width: `${fill}%`, background: cor }} />
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
        {/* O nome da última fase fica sempre visível embaixo do último ponto (ex.: "Acessar o App"); se colidir com o da fase atual, desce para a linha de baixo. */}
        {n > 1 && atual < n - 1 && (
          <span className={cn("absolute right-0 whitespace-nowrap text-right text-[10px] font-bold uppercase tracking-[0.14em] opacity-60", atual === n - 2 ? "top-[3.1rem]" : "top-8")} style={{ color: cor }}>{fases[n - 1]}</span>
        )}
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

// Escala com emojis (13/11/2026, Davi: "as perguntas com emoji em lista ficariam melhor assim"): uma trilha com um ponto por opção; a pessoa toca
// (ou arrasta) e o ponto escolhido cresce, a trilha enche até ele e um balão mostra a resposta; embaixo, o emoji e o texto de cada opção.
function Escala({ q, base, escolhida, aoEscolher, f }: { q: EstruturaQuiz["perguntas"][number]; base: string; escolhida: number | undefined; aoEscolher: (k: number) => void; f: (t?: string) => string }) {
  const { cor, escuro, editar } = useContext(QuizCtx);
  const n = q.opcoes.length;
  const trilha = useRef<HTMLDivElement>(null);
  const pct = (k: number) => (n > 1 ? (k / (n - 1)) * 100 : 50);
  const doPonteiro = (clientX: number) => {
    const el = trilha.current; if (!el) return;
    const r = el.getBoundingClientRect();
    aoEscolher(Math.max(0, Math.min(n - 1, Math.round(((clientX - r.left) / r.width) * (n - 1)))));
  };
  const arrastando = useRef(false);
  return (
    <div className={cn("rounded-2xl border p-4 shadow-sm", escuro ? "border-white/15 bg-white/5" : "border-gray-200 bg-white")}>
      {/* trilha: o balão fica em cima do ponto escolhido */}
      <div className="px-5 pt-10">
        <div ref={trilha} className="relative h-9 touch-none select-none"
          onPointerDown={(ev) => { if (editar) return; arrastando.current = true; (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId); doPonteiro(ev.clientX); }}
          onPointerMove={(ev) => { if (arrastando.current) doPonteiro(ev.clientX); }}
          onPointerUp={() => { arrastando.current = false; }} onPointerCancel={() => { arrastando.current = false; }}>
          <div className={cn("absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full", escuro ? "bg-white/15" : "bg-gray-200")} />
          {escolhida !== undefined && <div className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full transition-all duration-300" style={{ width: `${pct(escolhida)}%`, background: cor }} />}
          {q.opcoes.map((_, k) => {
            const sel = escolhida === k, passou = escolhida !== undefined && k < escolhida;
            return (
              <span key={k} className={cn("absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-white transition-all duration-300", sel ? "h-9 w-9 border-[5px]" : "h-5 w-5", !sel && !passou && (escuro ? "border-white/30" : "border-gray-300"))}
                style={{ left: `${pct(k)}%`, ...(sel || passou ? { borderColor: cor } : {}), ...(sel ? { boxShadow: `0 0 0 6px ${cor}33, 0 6px 14px -4px ${cor}` } : {}) }} />
            );
          })}
          {escolhida !== undefined && (
            <span className="pointer-events-none absolute -top-9 -translate-x-1/2 whitespace-nowrap rounded-xl px-3.5 py-1.5 text-sm font-bold text-white shadow-md transition-all duration-300" style={{ left: `${pct(escolhida)}%`, background: cor }}>
              {f(q.opcoes[escolhida].texto)}
              <span className="absolute left-1/2 top-full h-2.5 w-2.5 -translate-x-1/2 -translate-y-1.5 rotate-45" style={{ background: cor }} />
            </span>
          )}
        </div>
      </div>
      <div className="mt-3 grid gap-1" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {q.opcoes.map((o, k) => {
          const sel = escolhida === k;
          const Coluna = editar ? "div" : "button";
          return (
            <Coluna key={k} type={editar ? undefined : "button"} onClick={() => aoEscolher(k)}
              className={cn("flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-center transition-colors", sel ? (escuro ? "bg-white/15 font-bold" : "bg-blue-50 font-bold") : "hover:bg-black/5")}>
              {editar ? <Txt caminho={`${base}.opcoes.${k}.emoji`} valor={o.emoji} className="text-2xl leading-none" /> : <span className="text-3xl leading-none">{o.emoji}</span>}
              <Txt caminho={`${base}.opcoes.${k}.texto`} valor={o.texto} className="text-[12px] leading-tight" />
            </Coluna>
          );
        })}
      </div>
    </div>
  );
}

// Escala em velocímetro (15/11/2026, Davi, pelo Roy: "a pessoa só move o ponteiro"): meio-círculo com degradê vermelho → verde, o emoji de cada opção em volta do arco,
// um ponteiro que a pessoa arrasta (ou toca num ponto) e que encaixa na opção mais próxima, e uma pílula com o nome da opção. Começa no meio, sem resposta até mexer.
function Velocimetro({ q, base, escolhida, aoEscolher, f }: { q: EstruturaQuiz["perguntas"][number]; base: string; escolhida: number | undefined; aoEscolher: (k: number) => void; f: (t?: string) => string }) {
  const { cor, escuro, editar } = useContext(QuizCtx);
  const n = q.opcoes.length;
  const svg = useRef<SVGSVGElement>(null);
  const arrastando = useRef(false);
  const CX = 160, CY = 160, R = 100, RE = 134;
  const frac = (k: number) => (n > 1 ? k / (n - 1) : 0.5);
  const ponto = (t: number, r: number) => ({ x: CX + r * Math.cos(Math.PI * (1 - t)), y: CY - r * Math.sin(Math.PI * (1 - t)) });
  const doPonteiro = (clientX: number, clientY: number) => {
    const el = svg.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = clientX - (r.left + (r.width * CX) / 320), dy = clientY - (r.top + (r.height * CY) / 200);
    const ang = dy > 0 ? (dx >= 0 ? 0 : Math.PI) : Math.atan2(-dy, dx);
    aoEscolher(Math.max(0, Math.min(n - 1, Math.round((1 - ang / Math.PI) * (n - 1)))));
  };
  const t = escolhida === undefined ? 0.5 : frac(escolhida);
  const SEG = 48;
  const segmentos = Array.from({ length: SEG }, (_, i) => {
    const a = ponto(i / SEG, R), b = ponto((i + 1.4) / SEG, R);
    return <path key={i} d={`M${a.x},${a.y} A${R},${R} 0 0 1 ${b.x},${b.y}`} fill="none" strokeWidth={20} stroke={`hsl(${Math.round(((i + 0.5) / SEG) * 125)} 78% ${escuro ? 55 : 58}%)`} />;
  });
  const marcas = Array.from({ length: 21 }, (_, i) => { const a = ponto(i / 20, R - 14), b = ponto(i / 20, R - (i % 5 === 0 ? 22 : 19)); return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={escuro ? "rgba(255,255,255,.55)" : "rgba(15,23,42,.35)"} strokeWidth={i % 5 === 0 ? 1.6 : 1} strokeLinecap="round" />; });
  const ponteiro = escuro ? "#ffffff" : cor;
  return (
    <div className={cn("rounded-2xl border p-4 shadow-sm", escuro ? "border-white/15 bg-white/5" : "border-gray-200 bg-white")}>
      <svg ref={svg} viewBox="0 0 320 200" className="mx-auto block w-full max-w-[340px] touch-none select-none"
        onPointerDown={(ev) => { arrastando.current = true; (ev.currentTarget as SVGSVGElement).setPointerCapture(ev.pointerId); doPonteiro(ev.clientX, ev.clientY); }}
        onPointerMove={(ev) => { if (arrastando.current) doPonteiro(ev.clientX, ev.clientY); }}
        onPointerUp={() => { arrastando.current = false; }} onPointerCancel={() => { arrastando.current = false; }}>
        {segmentos}
        {marcas}
        {q.opcoes.map((o, k) => {
          const p = ponto(frac(k), RE), sel = escolhida === k;
          return <text key={k} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" style={{ fontSize: sel ? 34 : 24, opacity: escolhida === undefined || sel ? 1 : 0.45, transition: "all .25s", cursor: "pointer" }}>{o.emoji}</text>;
        })}
        <g style={{ transformOrigin: `${CX}px ${CY}px`, transform: `rotate(${-90 + 180 * t}deg)`, transition: "transform .3s cubic-bezier(.3,1.4,.5,1)" }}>
          <path d={`M${CX - 6},${CY} L${CX},${CY - R + 8} L${CX + 6},${CY} Z`} fill={ponteiro} />
        </g>
        <circle cx={CX} cy={CY} r={11} fill={ponteiro} />
        <circle cx={CX} cy={CY} r={4.5} fill={escuro ? "#0f172a" : "#ffffff"} />
      </svg>
      <div className="-mt-3 flex justify-center">
        <span className={cn("rounded-full px-5 py-2 text-base font-bold shadow-md transition-all", escolhida === undefined && "opacity-60")} style={{ background: cor, color: "#fff" }}>
          {escolhida === undefined ? "Mova o ponteiro" : f(q.opcoes[escolhida].texto)}
        </span>
      </div>
      {editar && (
        <div className="mt-3 grid gap-1" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          {q.opcoes.map((o, k) => (
            <div key={k} className="flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-center">
              <Txt caminho={`${base}.opcoes.${k}.emoji`} valor={o.emoji} className="text-2xl leading-none" />
              <Txt caminho={`${base}.opcoes.${k}.texto`} valor={o.texto} className="text-[12px] leading-tight" />
            </div>
          ))}
        </div>
      )}
      <p className={cn("mt-3 flex items-center justify-center gap-1.5 text-center text-xs", escuro ? "text-white/70" : "text-gray-500")}>
        <Lightbulb className="h-3.5 w-3.5 shrink-0 text-amber-400" />Arraste o marcador para o nível que mais representa você.
      </p>
    </div>
  );
}

// Criar a conta em etapas (13/11/2026, Davi, com um desenho: "primeiro o nome, que é mais fácil; ao dar OK sai para o lado; aí e-mail e WhatsApp; ao dar OK sai para o lado;
// aparece 'Conta criada!' com confete e embaixo o botão 'Ver meu plano personalizado'"). O lead é gravado quando e-mail e WhatsApp são confirmados (quem sair na última etapa não se perde).
function CapturaEtapas({ e, contato, setContato, pedir, f, quadros, selos, cor, escuro, suave, enviando, editar, onGravar, onVerPlano }: {
  e: EstruturaQuiz; contato: Partial<Record<CampoCaptura, string>>; setContato: (c: Partial<Record<CampoCaptura, string>>) => void; pedir: CampoCaptura[]; f: (t?: string) => string;
  quadros?: string[]; selos: ReactNode; cor: string; escuro: boolean; suave: string; enviando: boolean; editar: boolean; onGravar: () => Promise<void>; onVerPlano: () => void;
}) {
  const [fase, setFase] = useState(0);
  const [saindo, setSaindo] = useState(false);
  const cap = e.captura;
  const ir = (prox: number) => { setSaindo(true); window.setTimeout(() => { setFase(prox); setSaindo(false); }, 220); };
  useEffect(() => { if (fase === 2 && !editar) { confeteFase(); somFaseConcluida(); const t = window.setTimeout(confeteFase, 350); return () => window.clearTimeout(t); } }, [fase, editar]);
  const nomeOk = nomeCompleto(contato.nome ?? "");
  const contatoOk = pedir.filter((c) => c !== "nome").every((c) => { const v = (contato[c] ?? "").trim(); return c === "whatsapp" ? v.replace(/\D/g, "").length >= 10 : c === "email" ? /^\S+@\S+\.\S+$/.test(v) : v.length >= 2; });
  const campo = (c: CampoCaptura, rotulo: string, placeholder: string, auto: string) => (
    <label key={c} className="block space-y-1 text-sm">
      <Txt caminho={`captura.rotulos.${c}`} valor={cap?.rotulos?.[c] || rotulo} className={suave} />
      <Input type={ROTULO_CAMPO[c].tipo} value={contato[c] ?? ""} placeholder={placeholder} inputMode={c === "whatsapp" ? "tel" : undefined} autoComplete={auto} autoFocus={!editar}
        aria-invalid={c === "nome" && (contato.nome ?? "").trim().length >= 1 && !nomeCompleto(contato.nome ?? "")}
        className={cn("h-12 text-base", escuro && "border-white/20 bg-white/5", c === "nome" && (contato.nome ?? "").trim().length >= 1 && !nomeCompleto(contato.nome ?? "") && "border-red-500 focus-visible:ring-red-500")} onChange={(ev) => setContato({ ...contato, [c]: ev.target.value })} />
      {c === "nome" && (contato.nome ?? "").trim().length >= 1 && !nomeCompleto(contato.nome ?? "") && <span className="block text-xs font-semibold text-red-500">Coloque o nome e o sobrenome.</span>}
    </label>
  );
  const ok = (rotulo: ReactNode, habilitado: boolean, carregando = false) => (
    <Button type="submit" size="lg" disabled={!editar && (!habilitado || carregando)} className="h-auto min-h-12 w-full whitespace-normal rounded-xl text-base font-semibold text-white" style={{ background: cor, boxShadow: `0 8px 24px -8px ${cor}` }}>
      {carregando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{rotulo}
    </Button>
  );
  const anim = saindo ? "animate-out fade-out slide-out-to-left-8 duration-200 fill-mode-forwards" : "animate-in fade-in slide-in-from-right-8 duration-300";
  const fala0 = cap?.fala || "Falta pouco! Crie sua conta para liberar o seu acesso.";
  return (
    <div className="space-y-3 py-2">
      <div className="flex justify-center gap-1 text-[11px] sm:text-xs">{["Nome", "E-mail e WhatsApp", "Conta criada"].map((r, i) => {
        const cls = cn("flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-1 font-semibold sm:px-2.5", fase === i && "text-white", !editar && fase < i && "opacity-45");
        const estilo = fase === i ? { background: cor, borderColor: cor } : !editar && fase > i ? { borderColor: cor, color: cor } : undefined;
        const texto = <>{!editar && fase > i && <Check className="h-3 w-3" />}{i + 1}. {r}</>;
        // O lead não pula etapa: só o editor troca de etapa clicando.
        return editar
          ? <button key={r} type="button" onClick={() => setFase(i)} className={cls} style={estilo}>{texto}</button>
          : <div key={r} aria-current={fase === i ? "step" : undefined} className={cls} style={estilo}>{texto}</div>;
      })}</div>
      <div key={fase} className={anim}>
        {fase === 0 && (
          <form className="space-y-4" onSubmit={(ev) => { ev.preventDefault(); if (editar) setFase(1); else if (nomeOk) ir(1); }}>
            {quadros ? <MascoteCanto key="conta0" quadros={quadros}><Txt caminho="captura.fala" valor={fala0} mostrar={f(fala0)} as="p" className="block text-base font-semibold leading-snug" /></MascoteCanto>
              : <Txt caminho="captura.fala" valor={fala0} mostrar={f(fala0)} as="h2" className="block text-2xl font-bold leading-snug" />}
            {campo("nome", "Nome", "Seu nome e sobrenome", "name")}
            {ok("OK", nomeOk)}
          </form>
        )}
        {fase === 1 && (
          <form className="space-y-4" onSubmit={(ev) => { ev.preventDefault(); if (editar) { setFase(2); return; } if (contatoOk && !enviando) void onGravar().then(() => ir(2)); }}>
            <div className="space-y-1.5 text-center">
              <Txt caminho="captura.titulo" valor={cap?.titulo || "Quase lá! Para onde enviamos o seu plano?"} mostrar={f(cap?.titulo || "Quase lá! Para onde enviamos o seu plano?")} as="h2" className="block text-2xl font-bold leading-snug" />
              <Txt caminho="captura.texto" valor={cap?.texto || "Rapidinho: só e-mail e WhatsApp."} mostrar={f(cap?.texto || "Rapidinho: só e-mail e WhatsApp.")} as="p" className={cn("block text-base", suave)} />
            </div>
            {pedir.filter((c) => c !== "nome").map((c) => campo(c, ROTULO_CAMPO[c].rotulo, ROTULO_CAMPO[c].exemplo, c === "whatsapp" ? "tel" : "email"))}
            {ok("OK", contatoOk, enviando)}
            {(cap?.nota || editar) && <p className={cn("flex items-center justify-center gap-1.5 text-center text-xs", suave)}><Lock className="h-3 w-3 shrink-0" /><Txt caminho="captura.nota" valor={cap?.nota} /></p>}
            {selos}
            {e.voltar_embaixo !== false && <button type="button" onClick={() => ir(0)} className={cn("flex items-center gap-1 text-xs hover:opacity-100", suave)}><ArrowLeft className="h-3 w-3" />Voltar</button>}
          </form>
        )}
        {fase === 2 && (
          <div className="space-y-5 py-4 text-center">
            <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full text-white shadow-xl motion-safe:animate-in motion-safe:zoom-in-50 duration-500" style={{ background: cor, boxShadow: `0 12px 30px -8px ${cor}` }}><Check className="h-11 w-11" strokeWidth={3.5} /></span>
            <div className="space-y-1.5">
              <Txt caminho="captura.conta_criada.titulo" valor={cap?.conta_criada?.titulo || "Conta criada!"} as="h2" className="block text-3xl font-extrabold leading-tight" />
              <Txt caminho="captura.conta_criada.texto" valor={cap?.conta_criada?.texto || "{nome}, o seu plano personalizado já está pronto."} mostrar={f(cap?.conta_criada?.texto || "{nome}, o seu plano personalizado já está pronto.")} as="p" className={cn("block text-base", suave)} />
            </div>
            <Button type="button" size="lg" onClick={editar ? undefined : onVerPlano} className="h-auto min-h-12 w-full whitespace-normal rounded-xl text-base font-semibold text-white" style={{ background: cor, boxShadow: `0 8px 24px -8px ${cor}` }}>
              <Txt caminho="captura.conta_criada.botao" valor={cap?.conta_criada?.botao || "Ver meu plano personalizado"} /><ArrowRight className="ml-2 h-4 w-4 shrink-0" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// Junta as respostas (áreas marcadas, livros que curtiu, perfil) com a lista de livros do Instalivros e monta os dias do plano.
function usePlanoDaTela(t: TelaQuiz, e: EstruturaQuiz, perfil: PerfilQuiz | null, escolhas: Record<string, number>, marcadas: Record<string, number[]>) {
  const [livros, setLivros] = useState<LivroPlano[] | null>(null);
  useEffect(() => { let vivo = true; void import("@/data/livros-instalivros.json").then((m) => { if (vivo) setLivros(m.default as LivroPlano[]); }); return () => { vivo = false; }; }, []);
  const cfg = useMemo(() => t.plano ?? {}, [t.plano]);
  const { areas, plano } = useMemo(() => {
    const pa = e.perguntas.find((q) => q.id === (cfg.areas_pergunta ?? "areas"));
    const areas = (pa ? (marcadas[pa.id] ?? []).map((k) => temaDaOpcao(pa.opcoes[k]?.texto ?? "")) : []).filter((x): x is Tema => !!x);
    const curtidos = Object.entries(cfg.livros_temas ?? {}).filter(([qid]) => escolhas[qid] === 1).flatMap(([, temas]) => temas);
    const montado: PlanoMontado | null = livros ? montarPlano(livros, { areas, curtidos, perfil: cfg.perfil_temas?.[perfil?.id ?? ""] ?? [] }, cfg) : null;
    return { areas, plano: montado };
  }, [livros, e.perguntas, marcadas, escolhas, perfil, cfg]);
  return { livros, areas, plano };
}

// "Seus livros e o seu plano".
function PlanoLivros({ t, base, e, perfil, escolhas, marcadas, f, cor, escuro, suave, onSeguir }: {
  t: TelaQuiz; base: string; e: EstruturaQuiz; perfil: PerfilQuiz | null; escolhas: Record<string, number>; marcadas: Record<string, number[]>; f: (s?: string) => string; cor: string; escuro: boolean; suave: string; onSeguir: () => void;
}) {
  const { livros, areas, plano } = usePlanoDaTela(t, e, perfil, escolhas, marcadas);
  const titulo = t.titulo || "{nome}, seus livros e o seu plano";
  return <PlanoLivrosTela plano={plano} carregando={!livros} areas={areas.map((a) => ROTULO_TEMA[a])} cor={cor} escuro={escuro} suave={suave}
    titulo={<Txt caminho={`${base}.titulo`} valor={titulo} mostrar={f(titulo)} as="h2" className="block" />}
    botao={<Botao onClick={onSeguir}><Txt caminho={`${base}.botao`} valor={t.botao || "Continuar"} /></Botao>} />;
}

// "Seu primeiro livro chegou" (18/11): o livro nº 1 do plano que tem amostra cadastrada em `amostra.amostras`; sem nenhum, a tela segue sozinha.
function AmostraLivro({ teste, t, base, e, perfil, escolhas, marcadas, f, cor, escuro, suave, onSeguir, onEvento, pular, chaveQuiz, cheia, onVoltar }: {
  t: TelaQuiz; base: string; e: EstruturaQuiz; perfil: PerfilQuiz | null; escolhas: Record<string, number>; marcadas: Record<string, number[]>; f: (s?: string) => string; cor: string; escuro: boolean; suave: string; onSeguir: () => void; onEvento: (detalhe: string) => void; pular: boolean; chaveQuiz: string;
  /** Tela cheia no celular (sem o cabeçalho do quiz) e a setinha que volta uma tela do quiz. */
  cheia?: boolean; onVoltar?: () => void; teste?: boolean;
}) {
  const cfg = t.amostra ?? {};
  const telaPlano = (e.telas ?? []).find((x) => x.tipo === "plano_livros" && (!cfg.plano_de || x.id === cfg.plano_de)) ?? t;
  const { livros, areas, plano } = usePlanoDaTela(telaPlano, e, perfil, escolhas, marcadas);
  const prateleira = useMemo(() => {
    if (!plano || !livros) return null;
    // 19/11 (Davi): o livro do dia é UM dos livros com amostra cadastrada (os 5 do Instalivros), o que mais combina com a pessoa; só ele
    // toca áudio, os outros da prateleira aparecem sem amostra. Mais temas em comum com as respostas vence (empate: o primeiro cadastrado).
    const pc = telaPlano.plano ?? {};
    const temas = new Set<string>([...areas, ...Object.entries(pc.livros_temas ?? {}).filter(([qid]) => escolhas[qid] === 1).flatMap(([, x]) => x), ...(pc.perfil_temas?.[perfil?.id ?? ""] ?? [])]);
    let melhor: { livro: LivroPlano; n: number } | null = null;
    for (const [id, a] of Object.entries(cfg.amostras ?? {})) {
      const livro = livros.find((l) => String(l.id) === id);
      if (!a || !livro) continue;
      const n = livro.temas.filter((x) => temas.has(x)).length;
      if (!melhor || n > melhor.n) melhor = { livro, n };
    }
    const doDia = melhor ? String(melhor.livro.id) : null;
    const montar = (livro: LivroPlano, rotulo: string, tema?: string): LivroAmostra => {
      const a = String(livro.id) === doDia ? cfg.amostras?.[String(livro.id)] : undefined;
      return { id: String(livro.id), titulo: (a?.titulo || tituloBonito(livro.titulo)), autor: a?.autor || livro.autor, capa: a?.capa || livro.capa, minutos: a?.minutos ?? livro.audio, rotulo, tema: tema ? ROTULO_TEMA[tema as Tema] ?? tema : undefined,
        amostra: a ? { audio_url: a.audio_url, texto: a.texto_amostra } : undefined };
    };
    const lista = plano.dias.slice(0, 8).filter((d) => String(d.livro.id) !== doDia).map((d) => montar(d.livro, `Dia ${d.dia}`, d.tema));
    if (melhor) lista.unshift(montar(melhor.livro, "Dia 1", melhor.livro.temas[0]));
    lista.forEach((l, i) => { l.rotulo = `Dia ${i + 1}`; });
    return lista;
  }, [plano, livros, areas, telaPlano, escolhas, perfil, cfg.amostras]);
  const semAmostra = !!prateleira && !prateleira.some((l) => l.amostra);
  useEffect(() => { if (semAmostra && pular) onSeguir(); }, [semAmostra, pular, onSeguir]);
  if (!prateleira) return <div className="space-y-2 py-2" aria-busy="true"><div className={cn("h-72 animate-pulse rounded-2xl", escuro ? "bg-white/10" : "bg-gray-200")} /></div>;
  const titulo = t.titulo || "{nome}, esses são os livros selecionados para você";
  const nome = f("{nome}").trim();
  return <AmostraTela cheia={cheia} aoVoltarQuiz={onVoltar} semMemoria={!!teste} chave={`${chaveQuiz}:${t.id}`} cor={cor} escuro={escuro} suave={suave} segundos={cfg.segundos ?? 75} aoEvento={onEvento} livros={prateleira} nome={nome && !nome.includes("{") ? nome : ""}
    titulo={<Txt caminho={`${base}.titulo`} valor={titulo} mostrar={f(titulo)} as="h2" className="block" />}
    porque={areas.length ? `Escolhidos a dedo para quem quer evoluir em ${areas.map((a) => ROTULO_TEMA[a]).join(", ")}` : undefined}
    aviso={cfg.aviso || "Toque no livro do dia 1 para começar"} dica="Este é o seu livro de hoje — toque para começar" dicaDeslize="Role para o lado para ver os livros que foram selecionados para você" dicaRolar="Role para baixo e veja tudo o que você vai ter no app" fimTexto={cfg.fim_texto || "Gostou? O resumo completo está no seu plano"} textoBloqueado={cfg.texto_bloqueado || "Continue lendo no app"}
    textoSemAmostra="Escolha outro livro com o selo “Amostra grátis” para experimentar agora."
    botaoPasso={(rotulo, aoTocar) => <Botao onClick={aoTocar}>{rotulo}</Botao>}
    botao={<Botao onClick={onSeguir}><Txt caminho={`${base}.botao`} valor={t.botao || "Continuar"} /></Botao>} />;
}

// Continuar das perguntas que só seguem no botão: bloqueado (cinza, cadeado e o que falta) até a pessoa responder.
function ContinuarTravavel({ liberado, falta, onClick, rotulo = "Continuar" }: { liberado: boolean; falta: string; onClick: () => void; rotulo?: string }) {
  const { escuro, editar } = useContext(QuizCtx);
  if (liberado) return <Botao onClick={onClick}>{rotulo}</Botao>;
  return (
    <button type="button" disabled={!editar} aria-disabled="true" onClick={editar ? onClick : undefined}
      className={cn("flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-2xl px-6 py-4 text-base font-bold shadow-none", escuro ? "bg-white/10 text-white/40" : "bg-gray-200 text-gray-400")}>
      <Lock className="h-4 w-4" />{falta}
    </button>
  );
}

/** Ícones de linha das opções (opcao.icone). */
const ICONES_OPCAO: Record<string, LucideIcon> = {
  Lightbulb, Target, MessageCircle, RefreshCw, BookOpen, Calendar, Clock, Ban, Smartphone, Moon, CheckCircle2, User, Compass, Star, Zap, Headphones, ShieldCheck, Lock,
  Plane, Briefcase, Film, Sparkles, Sprout, Leaf, TreeDeciduous, Crown, VolumeX, Volume1, Volume2, Play, Ear, Mic, CircleHelp,
};

// Variáveis CSS da identidade visual (usadas por .quiz-visual em index.css).
const varsDoVisual = (v: VisualQuiz) => ({
  "--qv-texto": v.texto ?? "#FFFFFF", "--qv-texto-2": v.texto_2 ?? "#AAB6D0",
  "--qv-card": v.card ?? "rgba(8,31,79,.5)", "--qv-borda": v.borda_card ?? "rgba(129,160,255,.25)",
  "--qv-fonte-texto": v.fonte_texto ?? "inherit", "--qv-fonte-titulo": v.fonte_titulo ?? v.fonte_texto ?? "inherit",
  "--qv-destaque": v.destaque ?? v.botao ?? "#34d399", "--qv-ok": v.ok ?? "#5dd6a2", "--qv-base": v.base,
} as React.CSSProperties);

/** Carrega as fontes do Google do visual do quiz (uma vez por link). */
function useFontesDoVisual(url?: string) {
  useEffect(() => {
    if (!url || !/^https:\/\/fonts\.googleapis\.com\//.test(url) || document.head.querySelector(`link[href="${url}"]`)) return;
    const l = document.createElement("link"); l.rel = "stylesheet"; l.href = url; document.head.appendChild(l);
  }, [url]);
}

function Botao({ children, onClick, href }: { children: React.ReactNode; onClick?: () => void; href?: string }) {
  const { cor: corQuiz, editar, aoClicarOferta, linkDeCompra, botao } = useContext(QuizCtx);
  const cor = botao?.fundo ?? corQuiz;
  const cls = cn("qs-cta h-auto min-h-12 w-full whitespace-normal rounded-xl text-base font-semibold shadow-lg transition-transform hover:scale-[1.02] active:scale-[0.98]", !botao && "text-white");
  const estilo = { background: cor, boxShadow: `0 8px 24px -8px ${cor}`, ...(botao && { color: botao.texto }) };
  if (editar) return <div className={cn(cls, "flex items-center justify-center px-4 py-3")} style={estilo}>{children}</div>;
  if (href) return <Button asChild size="lg" className={cls} style={estilo}><a href={linkDeCompra ? linkDeCompra(href) : href} target="_blank" rel="noreferrer" onClick={() => aoClicarOferta?.()}>{children}</a></Button>;
  return <Button size="lg" className={cls} style={estilo} onClick={onClick}>{children}<ArrowRight className="ml-2 h-4 w-4 shrink-0" /></Button>;
}

export function QuizPlayer({ titulo, estrutura, onFim, onAtualizar, teste, editar = false, onMudar, onImagem, telaCheia = false, onTrocarTela, onEvento, onPasso, irPara, passoFixo, perfilFixo, respostas }: {
  titulo: string; estrutura: EstruturaQuiz; onFim?: (r: FimDoQuiz) => Promise<void> | void; /** Depois que o lead já foi gravado (contato no meio do quiz), avisa cada resposta nova para completar o lead. */ onAtualizar?: (r: FimDoQuiz) => void; teste?: boolean;
  editar?: boolean; onMudar?: (e: EstruturaQuiz) => void; onImagem?: (arquivo: File) => Promise<string>;
  // Link público no celular (15/10): ocupa a tela toda, barra de progresso fixa no
  // topo e o conteúdo centralizado; a cada tela nova o pai volta a rolagem pro início.
  telaCheia?: boolean; onTrocarTela?: () => void;
  // Métricas do link público (15/10): cada tela alcançada e o clique na oferta.
  onEvento?: (tipo: "passo" | "cta" | "amostra", passo?: number, detalhe?: string) => void;
  /** Modo teste (15/11): avisa em que tela o quiz está (e o perfil do resultado) para o mapa mental destacar o bloco. */
  onPasso?: (passo: number, perfilId: string | null) => void;
  /** Modo teste (15/11): o mapa mental manda o teste para uma tela (`n` muda a cada clique, para repetir o mesmo destino). `respostas`: o caminho escolhido (ex.: gênero Mulher). */
  irPara?: { n: number; passo: number; perfil?: string | null; respostas?: Record<string, number> };
  /** Vista em fileira da revisão (25/10): mostra só esta tela, sem avançar; no fim, o resultado deste perfil. */
  passoFixo?: number; perfilFixo?: string;
  /** Respostas já dadas (ex.: { genero: 1 }) para mostrar um caminho do quiz no editor: as imagens que dependem delas já aparecem. */
  respostas?: Record<string, number>;
}) {
  const e = estrutura;
  const v = e.visual;
  useFontesDoVisual(v?.fontes_url);
  const skin = !!v?.cartao;
  const cor = corDoQuiz(e);
  const escuro = e.tema === "escuro" || !!v;
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
  const [curtidos, setCurtidos] = useState<number[]>([]);
  const [rejeitados, setRejeitados] = useState<number[]>([]);
  const [numeros, setNumeros] = useState<Record<string, number>>({});   // perguntas de número (roleta/régua); escolhas guarda a faixa do número, para o perfil
  const [desenhou, setDesenhou] = useState(false);   // tela "compromisso": segurou o botão até o fim e já passou ~1,5 s (o botão vira Continuar)
  const [comprometeu, setComprometeu] = useState(false);   // tela "compromisso": acabou de completar (botão ✓ verde + cartão)
  useEffect(() => {
    if (!comprometeu || desenhou) return;
    const t = setTimeout(() => setDesenhou(true), 1500);
    return () => clearTimeout(t);
  }, [comprometeu, desenhou]);
  const [contato, setContato] = useState<Partial<Record<CampoCaptura, string>>>({});
  const [enviando, setEnviando] = useState(false);
  const enviado = useRef(false);   // captura no meio do quiz: a resposta já foi gravada ali
  const passo = passos[Math.min(pos, passos.length - 1)];
  const [perfilSalto, setPerfilSalto] = useState<string | null>(null);   // perfil do resultado escolhido no mapa (modo teste)
  const perfil = useMemo(() => (perfilFixo ? e.perfis.find((p) => p.id === perfilFixo) ?? null : (perfilSalto && e.perfis.find((p) => p.id === perfilSalto)) || calcularPerfil(e, escolhas)), [e, escolhas, perfilFixo, perfilSalto]);
  const iPerfil = perfil ? e.perfis.findIndex((p) => p.id === perfil.id) : -1;
  const f = (t?: string) => preencher(t, e, escolhas, perfil, contato.nome, numeros);
  const v3 = !!e.indice;   // quiz V3 (Índice de Leitor): abertura, perguntas, captura e resultado no visual novo
  const temTelaResultado = telas.some((t) => t.tipo === "resultado");

  // Depois da abertura, baixa as imagens das próximas telas: a troca de tela não fica esperando a imagem.
  useEffect(() => {
    const urls = JSON.stringify(e).match(/https?:\/\/[^"]+\.(?:webp|jpe?g|png|gif)/gi) ?? [];
    // (21/11, quiz lento) Antes: ~70 imagens de uma vez, brigando com a tela atual no celular. Agora: fila de 3 por vez, começando depois da abertura.
    const fila = [...new Set(urls)];
    let vivo = true;
    const proxima = () => {
      const u = fila.shift();
      if (!vivo || !u) return;
      const img = new Image();
      img.onload = img.onerror = proxima;
      img.src = u;
    };
    const t = setTimeout(() => { for (let i = 0; i < 3; i++) proxima(); }, 2500);
    return () => { vivo = false; clearTimeout(t); };
  }, [e]);

  const trocou = useRef(onTrocarTela);
  trocou.current = onTrocarTela;
  const evento = useRef(onEvento);
  evento.current = onEvento;
  // Sim/Não em conversa: de uma pergunta de chat para outra não volta ao topo (a conversa só desce; quem rola é o próprio chat).
  const posAnterior = useRef(pos);
  const passosRef = useRef(passos);
  passosRef.current = passos;
  useEffect(() => {
    const ehChat = (i: number) => { const ps = passosRef.current[i]; const q = ps?.tipo === "pergunta" ? e.perguntas[ps.indice] : undefined; return !!q?.chat && !q.multipla && q.opcoes.length === 2; };
    const dentroDoChat = !editar && posAnterior.current !== pos && ehChat(posAnterior.current) && ehChat(pos);
    posAnterior.current = pos;
    if (!dentroDoChat) trocou.current?.();
    if (pos > 0) evento.current?.("passo", pos);
  }, [pos]); // eslint-disable-line react-hooks/exhaustive-deps
  const ultimoSalto = useRef(irPara?.n ?? 0);
  useEffect(() => {
    if (!irPara || irPara.n === ultimoSalto.current) return;
    ultimoSalto.current = irPara.n;
    if (irPara.respostas) setEscolhas((r) => ({ ...r, ...irPara.respostas }));
    setPerfilSalto(irPara.perfil ?? null);
    setPos(Math.max(0, Math.min(irPara.passo, passos.length - 1)));
  }, [irPara, passos.length]);
  useEffect(() => { if (passos[Math.min(pos, passos.length - 1)]?.tipo !== "fim") setPerfilSalto(null); }, [pos, passos]);
  const avisoPasso = useRef(onPasso);
  avisoPasso.current = onPasso;
  useEffect(() => { avisoPasso.current?.(pos, perfil?.id ?? null); }, [pos, perfil?.id]);

  // Opções da pergunta da tela `posicao`, editadas direto no celular.
  const mudarOpcoes = (posicao: number, f: (opcoes: EstruturaQuiz["perguntas"][number]["opcoes"]) => void) => {
    const passo = passos[posicao];
    if (passo?.tipo !== "pergunta" || !onMudar) return;
    const n = structuredClone(e);
    f(n.perguntas[passo.indice].opcoes);
    onMudar(n);
  };
  const mudarPergunta = (posicao: number, f: (q: EstruturaQuiz["perguntas"][number]) => void) => {
    const passo = passos[posicao];
    if (passo?.tipo !== "pergunta" || !onMudar) return;
    const n = structuredClone(e);
    f(n.perguntas[passo.indice]);
    onMudar(n);
  };
  const ctx: Ctx = {
    editar, mostrarFaltas: !!teste, cor, escuro, botao: v?.botao ? { fundo: v.botao, texto: v.botao_texto ?? "#010F24" } : undefined, skin: !!v?.cartao, podeEnviar: !!onImagem && !!onMudar,
    aoClicarOferta: (plano) => evento.current?.("cta", undefined, plano),
    linkDeCompra: editar ? undefined : (u) => comDadosDoLead(u, { nome: contato.nome, email: contato.email, whatsapp: contato.whatsapp }),
    mudarTexto: (c, v) => onMudar?.(comValor(e, c, v)),
    mudarImagem: (c, arq) => {
      if (!arq) { onMudar?.(comValor(e, c, "")); return; }
      void onImagem?.(arq).then((url) => onMudar?.(comValor(e, c, url)));
    },
  };

  const gravar = async (dados: Partial<Record<CampoCaptura, string>>) => {
    if (enviado.current) return;
    setEnviando(true);
    try { await onFim?.({ escolhas, numeros, perfil, contato: dados, marcadas, curtidos, rejeitados }); enviado.current = true; } finally { setEnviando(false); }
  };
  // Lead já gravado e a pessoa seguiu respondendo (objetivos, livros curtidos…): completa o lead com as respostas novas.
  useEffect(() => {
    if (editar || !enviado.current) return;
    onAtualizar?.({ escolhas, numeros, perfil, contato, marcadas, curtidos, rejeitados });
  }, [escolhas, numeros, marcadas, curtidos, rejeitados]);   // eslint-disable-line react-hooks/exhaustive-deps
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
  const alternar = (qid: string, k: number, limite?: number) => {
    const atual = marcadas[qid] ?? [];
    const nova = alternarMarcada(atual, k, limite);
    if (!nova) return;   // já marcou o máximo: só troca desmarcando uma
    setMarcadas((m) => ({ ...m, [qid]: nova }));
    setEscolhas((x) => { const y = { ...x }; if (nova.length) y[qid] = nova[0]; else delete y[qid]; return y; });
  };
  // Número da roleta/régua: guarda o valor e a faixa dele (a opção que dá os pontos de perfil e o selo).
  const definirNumero = (q: EstruturaQuiz["perguntas"][number], n: number) => {
    setNumeros((x) => ({ ...x, [q.id]: n }));
    const k = faixaDoNumero(q, n);
    setEscolhas((x) => { const y = { ...x }; if (k >= 0) y[q.id] = k; else delete y[q.id]; return y; });
  };
  const [verOferta, setVerOferta] = useState(false);
  const reiniciar = () => { setPos(0); setEscolhas({}); setMarcadas({}); setCurtidos([]); setRejeitados([]); setVerOferta(false); setNumeros({}); setDesenhou(false); setComprometeu(false); setContato({}); enviado.current = false; };

  // Resumo do plano em números (tela "perfil" com plano_numeros): só entram as linhas que a pessoa já respondeu.
  const linhasDoPlano = (c: NonNullable<TelaQuiz["plano_numeros"]>): LinhaDoPlano[] => {
    const lista: LinhaDoPlano[] = [];
    const pergunta = (id: string) => perguntas.find((x) => x.id === id);
    const min = numeros[c.minutos], cfg = pergunta(c.minutos)?.numero;
    if (min !== undefined) lista.push({ emoji: "⏱️", rotulo: "Tempo por dia", valor: textoDoNumero(cfg, min) });
    const mo = pergunta(c.momento)?.opcoes[escolhas[c.momento]];
    if (mo) lista.push({ emoji: "🗓️", rotulo: "Momento do dia", valor: mo.ritual ?? mo.texto });
    if (min !== undefined) {
      lista.push({ emoji: "📖", rotulo: "Resumos por semana", valor: String(resumosPorSemana(min, cfg)) });
      lista.push({ emoji: "📚", rotulo: "Livros em 12 meses", valor: String(livrosEm12Meses(min, cfg)) });
    }
    const ob = pergunta(c.objetivo)?.opcoes[escolhas[c.objetivo]];
    if (ob) lista.push({ emoji: ob.emoji ?? "🎯", rotulo: "Seu objetivo", valor: ob.resumo ? ob.resumo.charAt(0).toLocaleUpperCase("pt-BR") + ob.resumo.slice(1) : ob.texto });
    return lista;
  };

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
    if (c === "nome") return nomeCompleto(v);
    return v.length >= 2;
  });
  // Visual cartão: contato opcional. Campo vazio passa; o que foi preenchido precisa estar certo, e a mensagem diz qual (nunca fica mudo).
  const [erroContato, setErroContato] = useState("");
  const [campoErro, setCampoErro] = useState<CampoCaptura | null>(null);
  const conferirContato = (): { campo: CampoCaptura; msg: string } | null => {
    for (const c of pedir) {
      const v = (contato[c] ?? "").trim();
      if (!v) continue;
      if (c === "nome" && !nomeCompleto(v)) return { campo: c, msg: v.includes(" ") ? "Confira o nome completo." : "Falta o sobrenome: precisamos do nome e sobrenome." };
      if (c === "email" && !/^\S+@\S+\.\S+$/.test(v)) return { campo: c, msg: "Confira o e-mail: parece que falta alguma parte." };
      if (c === "whatsapp" && !foneValido(v)) return { campo: c, msg: "Confira o WhatsApp: digite o DDD e o número." };
    }
    return null;
  };
  const suave = escuro ? "text-neutral-400" : "text-muted-foreground";
  // Amostra do app no quiz de verdade e no Testar → Celular (19/11, Davi: "quero ver como o usuário vê"; só o editor fica de fora): ocupa a tela toda, sem barra de progresso nem "Instalivros" em cima.
  // Perguntas em chat: o contêiner da tela não muda entre uma pergunta e a outra (a conversa só cresce, sem recarregar nem animar de novo).
  const perguntaAtual = passo.tipo === "pergunta" ? perguntas[passo.indice] : undefined;
  const emConversa = !editar && !!perguntaAtual?.chat && !perguntaAtual.multipla && perguntaAtual.opcoes.length === 2;
  const amostraCheia = telaCheia && !editar && passo.tipo === "tela" && telas[passo.indice]?.tipo === "amostra";

  return (
    <QuizCtx.Provider value={ctx}>
      {skin && v?.marca && !(passo.tipo === "tela" && telas[passo.indice]?.tipo === "curtir_livros") && (
        <div className="mx-auto mb-4 mt-2 w-full max-w-[480px] text-center" style={{ fontFamily: v.fonte_texto }}>
          {v.marca.imagem
            ? <img src={v.marca.imagem} alt={`${v.marca.antes}${v.marca.destaque ?? ""}`} className="mx-auto h-[46px] w-auto" draggable={false} />
            : <div className="text-[26px] font-bold tracking-tight" style={{ fontFamily: v.fonte_titulo, color: v.texto }}>{v.marca.antes}<span style={{ color: v.destaque ?? cor }}>{v.marca.destaque}</span></div>}
          {v.marca.subtitulo && passo.tipo === "intro" && <p className={cn("text-[15px] leading-snug", v.marca.imagem ? "mt-3" : "mt-1.5")} style={{ color: v.texto_2 }}>{v.marca.subtitulo}</p>}
        </div>
      )}
      {/* O quiz usa sempre a própria paleta (quiz-claro / quiz-escuro em index.css), não o tema do Infopro
          (25/10, Davi: "o fundo do quiz está da mesma cor do Infopro; preciso que mostre a cor original"). */}
      <div className={cn("mx-auto flex w-full flex-col gap-5", skin ? "quiz-skin max-w-[480px]" : "max-w-xl", escuro ? "quiz-escuro" : "quiz-claro", v && "quiz-visual",
        skin ? "" : telaCheia ? "flex-1" : escuro ? "rounded-2xl bg-neutral-950 p-5 text-neutral-100 sm:p-7" : "rounded-2xl bg-white p-5 text-neutral-900 shadow-sm sm:p-7")}
        style={v ? { ...varsDoVisual(v), ...(skin && v.cartao ? { background: v.cartao.fundo, border: v.cartao.borda ? `1px solid ${v.cartao.borda}` : undefined, borderRadius: v.cartao.raio ?? 20, boxShadow: v.cartao.sombra, padding: "24px 20px" } : telaCheia ? {} : { background: v.fundo_css }) } : passo.tipo === "tela" && telas[passo.indice]?.fundo ? { background: telas[passo.indice].fundo } : undefined}>
        {teste && !editar && !travado && !amostraCheia && <p className="rounded-md bg-amber-500/15 px-3 py-1.5 text-center text-xs text-amber-600 dark:text-amber-300">Modo teste: suas respostas não são gravadas. O pontilhado mostra o que ainda falta{onImagem && onMudar ? " — clique nele para enviar" : ""}.</p>}
        {editar && !travado && (
          <div className="sticky top-0 z-10 flex items-center justify-between gap-2 rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs text-amber-600 backdrop-blur dark:text-amber-300">
            <button type="button" onClick={voltar} disabled={pos === 0} className="flex items-center gap-1 disabled:opacity-40"><ArrowLeft className="h-3 w-3" />Anterior</button>
            <span>Editando · tela {pos + 1} de {passos.length} · clique no texto ou na imagem</span>
            <button type="button" onClick={() => setPos((p) => Math.min(passos.length - 1, p + 1))} disabled={pos >= passos.length - 1} className="flex items-center gap-1 disabled:opacity-40">Próxima<ArrowRight className="h-3 w-3" /></button>
          </div>
        )}
        {amostraCheia ? null : passo.tipo !== "intro" && passo.tipo !== "fim" && fasesInfo ? (
          <BarraFases fases={fasesInfo.nomes} atual={faseAtual} frac={fracFase} cor={cor} escuro={escuro} comemorar={e.fases_comemorar !== false} vturb={e.progresso === "vturb"} onVoltar={pos > 1 && !editar && !travado ? voltar : undefined} />
        ) : skin && v3 && passo.tipo === "pergunta" ? (
          <div className="qs-prog">
            {!editar && !travado && nPergunta > 1 && <button type="button" onClick={voltar} className="qs-back"><span aria-hidden>‹</span> Voltar</button>}
            {!perguntas[passo.indice]?.kicker && (
              <div className="qs-prog-in">
                <small>Pergunta {nPergunta} de {perguntas.length}</small>
                <div className="qs-bar"><i style={{ width: `${Math.round((nPergunta / Math.max(1, perguntas.length)) * 100)}%` }} /></div>
              </div>
            )}
          </div>
        ) : v3 && passo.tipo === "pergunta" ? (
          <div className="shrink-0 space-y-2">
            <div className="flex items-center justify-between text-sm font-semibold">
              {!editar && !travado
                ? <button type="button" onClick={voltar} className={cn("flex items-center gap-1 hover:opacity-100", suave)}><ArrowLeft className="h-4 w-4" />Voltar</button>
                : <span />}
              <span className={suave}>Pergunta {nPergunta} de {perguntas.length}</span>
            </div>
            <div className={cn("h-2 overflow-hidden rounded-full", escuro ? "bg-white/10" : "bg-black/10")}>
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.round((nPergunta / Math.max(1, perguntas.length)) * 100)}%`, background: cor }} />
            </div>
          </div>
        ) : skin ? null : passo.tipo !== "intro" && passo.tipo !== "fim" ? (
          <div className={cn("h-2 shrink-0 overflow-hidden rounded-full", escuro ? "bg-white/10" : "bg-black/10")}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progresso}%`, background: cor, boxShadow: `0 0 12px ${cor}` }} />
          </div>
        ) : telaCheia && !skin && <div className="h-2 shrink-0" />}

        {/* Tela cheia: a pergunta começa sempre na mesma altura (título fixo, imagem abaixo dele);
            abertura, respiro e "analisando" ficam no centro da tela. */}
        <div key={emConversa ? "conversa" : pos} className={cn(ENTRA, telaCheia && (passo.tipo === "pergunta" ? "mt-[2dvh] w-full" : "my-auto w-full"))}>
          {passo.tipo === "intro" && (
            <div className={cn("space-y-5 py-4 text-center", skin && "qs-intro")}>
              <Img caminho="intro.imagem" url={e.intro?.imagem} nota={e.intro?.imagem_nota} redonda className="mx-auto h-24 w-24" />
              <Txt caminho="intro.titulo" valor={e.intro?.titulo || titulo} as="h1" className={cn("block text-3xl font-extrabold leading-tight sm:text-4xl", skin && "qs-h1")} />
              <Txt caminho="intro.subtitulo" valor={e.intro?.subtitulo} as="p" className={cn("block text-base leading-relaxed", suave, skin && "qs-sub")} />
              {!!e.intro?.credenciais?.length && v3 && (
                <div className={cn("grid grid-cols-3 gap-2", skin && "qs-stats")}>
                  {e.intro.credenciais.map((c, k) => {
                    // "900+|livros resumidos" → destaque grande + texto embaixo (a barra separa os dois); sem barra, "900+ livros resumidos" divide no 1º espaço.
                    const [a, ...resto] = c.includes("|") ? c.split("|") : c.split(" ");
                    const grande = (c.includes("|") || /\d/.test(a)) && resto.length > 0 && !editar;
                    return (
                      <div key={k} className={cn("flex flex-col items-center justify-center gap-0.5 rounded-xl border px-1.5 py-3 text-center", skin && "qs-stat")} style={v ? { borderColor: "var(--qv-borda)", background: "var(--qv-card)" } : { borderColor: `${cor}33`, background: `${cor}0d` }}>
                        {grande
                          ? <><span className="qs-stat-n text-lg font-extrabold leading-tight" style={{ color: v?.destaque ?? cor, fontFamily: v ? "var(--qv-fonte-titulo)" : undefined }}>{a}</span><span className="qs-stat-l text-[11px] font-medium leading-tight">{resto.join(c.includes("|") ? "|" : " ")}</span></>
                          : <Txt caminho={`intro.credenciais.${k}`} valor={c} className="text-[11px] font-semibold leading-tight" />}
                      </div>
                    );
                  })}
                </div>
              )}
              {!!e.intro?.credenciais?.length && !v3 && (
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
            let fotoPergunta = q.imagem;
            for (const [chave, url] of Object.entries(q.imagens ?? {})) { const [pid, i] = chave.split("="); if (escolhas[pid] === Number(i)) { fotoPergunta = url; break; } }
            const emojiDe = (o: (typeof q.opcoes)[number]) => {
              for (const [chave, em] of Object.entries(o.emojis ?? {})) { const [pid, i] = chave.split("="); if (escolhas[pid] === Number(i)) return em; }
              return undefined;
            };
            const livro = q.estilo === "livro";
            const quadrosM = q.sem_mascote ? undefined : telas.find((x) => x.animada && (x.quadros?.length ?? 0) >= N_QUADROS)?.quadros;   // o mascote fala o título (não nas telas de livro)   // capa inteira em pé + Não ✗ / Sim ✓ lado a lado (como o 12min)
            // Sim ou não como conversa (19/11, Davi: "tipo um typebot, o Insta vai perguntando"): perguntas seguidas marcadas com `chat` viram um chat só.
            // No modo de edição continua o formato normal (é nele que se clica para editar).
            const ehChat = (x?: (typeof perguntas)[number]) => !!x?.chat && !x.multipla && x.opcoes.length === 2;
            const semAcento = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
            const simNao = q.opcoes.length === 2 && semAcento(q.opcoes[0].texto) === "nao" && semAcento(q.opcoes[1].texto) === "sim";
            if (ehChat(q) && !editar) {
              const historico: HistoricoChat[] = [];
              for (let j = pos - 1; j >= 0; j--) {
                const ps = passos[j];
                const pq = ps?.tipo === "pergunta" ? perguntas[ps.indice] : undefined;
                if (!pq || !ehChat(pq) || escolhas[pq.id] === undefined) break;
                historico.unshift({ texto: pq.texto ? f(pq.texto) : "", subtitulo: pq.subtitulo, imagem: pq.imagem, aparencia: pq.estilo === "livro" ? "livro" : "normal", resposta: pq.opcoes[escolhas[pq.id]]?.texto ?? "", respostaImagem: pq.opcoes[escolhas[pq.id]]?.imagem });
              }
              return (
                <ChatPergunta key="chat-conversa" chave={q.id} avatar={quadrosM?.[Q.PARADO]} cor={cor} escuro={escuro} historico={historico}
                  texto={q.texto ? f(q.texto) : ""} subtitulo={q.subtitulo} imagem={fotoPergunta} imagemNota={teste ? q.imagem_nota : undefined} aparencia={livro ? "livro" : "normal"}
                  opcoes={q.opcoes.map((o) => ({ texto: o.texto, imagem: o.imagem }))} simNao={simNao} marcada={escolhas[q.id]}
                  aoEscolher={(k) => { setEscolhas((x) => ({ ...x, [q.id]: k })); if (!travado) window.setTimeout(avancar, 900); }} />
              );
            }
            if ((q.estilo === "roleta" || q.estilo === "regua") && q.numero) {
              // Pergunta de número (15/11, V2): roleta vertical ou régua; sem mexer, vale o valor inicial.
              const cfg = q.numero;
              const valor = numeros[q.id] ?? limitesDoNumero(cfg).inicial;
              const faixa = faixaDoNumero(q, valor);
              return (
                <div className="space-y-4">
                  <Txt caminho={`${base}.texto`} valor={q.texto} mostrar={f(q.texto)} as="h2" className="block text-center text-2xl font-bold leading-snug" />
                  <Txt caminho={`${base}.subtitulo`} valor={q.subtitulo} as="p" className={cn("block text-center text-sm", suave)} />
                  {q.estilo === "roleta"
                    ? <RoletaNumero key={q.id} config={cfg} valor={numeros[q.id]} selo={faixa >= 0 ? f(q.opcoes[faixa].texto) : undefined} aoMudar={(n) => definirNumero(q, n)} cor={cor} escuro={escuro} suave={suave} />
                    : <ReguaNumero key={q.id} config={cfg} valor={numeros[q.id]} aoMudar={(n) => definirNumero(q, n)} cor={cor} escuro={escuro} suave={suave} />}
                  <div className="sticky bottom-3 z-10 pt-1">
                    <Botao onClick={() => { if (numeros[q.id] === undefined) definirNumero(q, valor); avancar(); }}>Continuar</Botao>
                  </div>
                  {pos > 1 && !editar && !travado && e.voltar_embaixo !== false && (
                    <button type="button" onClick={voltar} className={cn("flex items-center gap-1 text-xs hover:opacity-100", suave)}><ArrowLeft className="h-3 w-3" />Voltar</button>
                  )}
                </div>
              );
            }
            if (q.estilo === "orbita") {
              // Monte seu trio (15/11, V2): habilidades em bolhas em volta do mascote; as escolhidas sobem para as vagas 1·2·3.
              const meta = metaDaSelecao(q);
              const sel = marcadas[q.id] ?? [];
              const completa = sel.length >= meta;
              return (
                <div className="space-y-3">
                  <Txt caminho={`${base}.texto`} valor={q.texto} mostrar={f(q.texto)} as="h2" className="block text-center text-xl font-bold leading-snug" />
                  <Txt caminho={`${base}.subtitulo`} valor={q.subtitulo} as="p" className={cn("block text-center text-sm", suave)} />
                  <OrbitaTrio opcoes={q.opcoes} sel={sel} meta={meta} aoAlternar={(k) => alternar(q.id, k, meta)} quadro={quadrosM?.[12]} cor={cor} escuro={escuro} suave={suave} editar={editar} />
                  <div className="sticky bottom-3 z-10 pt-1">
                    {completa
                      ? <Botao onClick={avancar}>Continuar</Botao>
                      : (
                        <button type="button" disabled={!editar} aria-disabled="true" onClick={editar ? avancar : undefined}
                          className={cn("flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-2xl px-6 py-4 text-base font-bold shadow-none", escuro ? "bg-white/10 text-white/40" : "bg-gray-200 text-gray-400")}>
                          <Lock className="h-4 w-4" />Escolha mais {meta - sel.length}
                        </button>
                      )}
                  </div>
                  {pos > 1 && !editar && !travado && e.voltar_embaixo !== false && (
                    <button type="button" onClick={voltar} className={cn("flex items-center gap-1 text-xs hover:opacity-100", suave)}><ArrowLeft className="h-3 w-3" />Voltar</button>
                  )}
                </div>
              );
            }
            if (q.estilo === "lado") {
              // Seleção ao lado do mascote (desenho do Davi, 13/11): ele fica de um lado, a pessoa marca N itens no painel e a barra de baixo enche até completar.
              const meta = metaDaSelecao(q);
              const sel = marcadas[q.id] ?? [];
              const completa = sel.length >= meta;
              return (
                <div className="space-y-3">
                  <Txt caminho={`${base}.texto`} valor={q.texto} mostrar={f(q.texto)} as="h2" className="block text-center text-xl font-bold leading-snug" />
                  <Txt caminho={`${base}.subtitulo`} valor={q.subtitulo} as="p" className={cn("block text-center text-sm", suave)} />
                  <div className="flex items-end gap-2">
                    <div className={cn("grid min-w-0 flex-1 grid-cols-2 gap-1.5 overflow-y-auto rounded-2xl border-2 p-1.5", escuro ? "border-white/15 bg-white/5" : "border-gray-200 bg-white/60", !editar && "max-h-[46dvh]")}>
                      {q.opcoes.map((o, k) => {
                        const marcada = sel.includes(k);
                        const Opcao = editar ? "div" : "button";
                        return (
                          <Opcao key={k} type={editar ? undefined : "button"} onClick={() => alternar(q.id, k, meta)}
                            className={cn("group relative flex flex-col items-center justify-center gap-1 rounded-xl border-2 px-1.5 py-2 text-center text-[13px] font-semibold leading-tight transition-all",
                              escuro ? "border-white/15" : "border-gray-200", marcada ? "scale-[1.03] text-white shadow-md" : completa && !editar ? "opacity-45" : "hover:-translate-y-0.5 hover:shadow-md")}
                            style={marcada ? { background: cor, borderColor: cor } : undefined}>
                            {(o.imagem !== undefined || !!o.imagens) && <Img caminho={`${base}.opcoes.${k}.imagem`} url={imagemDe(o)} className="mx-auto aspect-square w-14" />}
                            {o.emoji && !(o.imagem !== undefined || !!o.imagens) && <span className="text-3xl leading-none">{o.emoji}</span>}
                            <Txt caminho={`${base}.opcoes.${k}.texto`} valor={o.texto} />
                            {marcada && <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-white/90"><Check className="h-3 w-3" style={{ color: cor }} /></span>}
                          </Opcao>
                        );
                      })}
                    </div>
                  </div>
                  {/* Barra de baixo: um pedaço por item; enche conforme a pessoa marca, até completar */}
                  <div className="space-y-1">
                    <div className="flex gap-1" role="progressbar" aria-valuemin={0} aria-valuemax={meta} aria-valuenow={Math.min(sel.length, meta)}>
                      {Array.from({ length: meta }, (_, i) => (
                        <span key={i} className={cn("flex h-8 flex-1 items-center justify-center rounded-lg text-sm font-bold transition-all duration-300", i < sel.length ? "text-white" : escuro ? "bg-white/10 text-white/40" : "bg-gray-200 text-gray-400")}
                          style={i < sel.length ? { background: cor } : undefined}>{i + 1}</span>
                      ))}
                    </div>
                    <p className={cn("text-center text-xs", suave)}>{completa ? "Tudo certo! Se quiser trocar, desmarque uma e escolha outra." : `${sel.length} de ${meta} escolhidas`}</p>
                  </div>
                  <div className="sticky bottom-3 z-10 pt-1">
                    {completa
                      ? <Botao onClick={avancar}>Continuar</Botao>
                      : (
                        // Bloqueado até completar: cinza, com cadeado e o que falta (no editor continua clicável para navegar).
                        <button type="button" disabled={!editar} aria-disabled="true" onClick={editar ? avancar : undefined}
                          className={cn("flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-2xl px-6 py-4 text-base font-bold shadow-none", escuro ? "bg-white/10 text-white/40" : "bg-gray-200 text-gray-400")}>
                          <Lock className="h-4 w-4" />Escolha mais {meta - sel.length}
                        </button>
                      )}
                  </div>
                  {pos > 1 && !editar && !travado && e.voltar_embaixo !== false && (
                    <button type="button" onClick={voltar} className={cn("flex items-center gap-1 text-xs hover:opacity-100", suave)}><ArrowLeft className="h-3 w-3" />Voltar</button>
                  )}
                </div>
              );
            }
            return (
              <div className="space-y-3">
                {q.cabecalho && (
                  <div className="space-y-3 pb-3 text-center">
                    {q.cabecalho.imagem && <img src={q.cabecalho.imagem} alt="" fetchPriority="high" decoding="async" className="mx-auto max-h-[27dvh] w-auto max-w-full rounded-2xl" />}
                    {q.cabecalho.selo && <span className="inline-block rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider" style={{ background: `${cor}1a`, color: cor }}>{q.cabecalho.selo}</span>}
                    {q.cabecalho.titulo && (editar
                      ? <Txt caminho={`${base}.cabecalho.titulo`} valor={q.cabecalho.titulo} mostrar={f(q.cabecalho.titulo)} as="h1" className="block text-2xl font-extrabold leading-tight" />
                      // **trecho** = grifado em amarelo (como na imagem antiga da abertura)
                      : <h1 className="text-2xl font-extrabold leading-tight">{f(q.cabecalho.titulo).split("**").map((t, k) => (k % 2 ? <mark key={k} className="rounded-md bg-yellow-300 px-1.5 text-neutral-900 [box-decoration-break:clone]">{t}</mark> : t))}</h1>)}
                    {q.cabecalho.subtitulo && <Txt caminho={`${base}.cabecalho.subtitulo`} valor={q.cabecalho.subtitulo} mostrar={f(q.cabecalho.subtitulo)} as="p" className={cn("block text-base leading-relaxed", suave)} />}
                  </div>
                )}
                {quadrosM && !livro
                  ? <MascoteCanto key={passo.indice} quadros={quadrosM}><Txt caminho={`${base}.texto`} valor={q.texto} mostrar={f(q.texto)} as="h2" className="block text-xl font-bold leading-snug" /></MascoteCanto>
                  : quadrosM && livro
                    // 19/11 (Davi: "o título poderia ser a pergunta do Insta, só que maior"): a pergunta vai no balão do mascote, em letra de título, sem título repetido embaixo.
                    ? <MascoteCanto key={passo.indice} quadros={quadrosM}><Txt caminho={`${base}.texto`} valor={q.texto || q.subtitulo || ""} mostrar={f(q.texto || q.subtitulo)} as="h2" className="block text-xl font-bold leading-snug" /></MascoteCanto>
                    : <>{skin && !q.cabecalho && <div className="qs-kicker">{q.kicker || `Pergunta ${nPergunta}`}</div>}<Txt caminho={`${base}.texto`} valor={q.texto} mostrar={f(q.texto)} as="h2" className={cn("block font-bold leading-snug", q.cabecalho ? "pt-1 text-center text-lg" : "text-2xl", skin && "qs-q")} /></>}
                {!(quadrosM && livro) && <Txt caminho={`${base}.subtitulo`} valor={q.subtitulo} as="p" className={cn("block text-sm", suave, skin && "qs-hint")} />}
                {(fotoPergunta || q.imagem_nota) && (livro
                  ? <Img caminho={`${base}.imagem`} url={fotoPergunta} nota={q.imagem_nota} inteira className="mx-auto aspect-[2/3] h-[34dvh] max-h-[320px] shadow-lg" />
                  : <Img caminho={`${base}.imagem`} url={fotoPergunta} nota={q.imagem_nota} className="aspect-[16/9] max-h-[30dvh] w-full" />)}
                {q.estilo === "escala" && !q.multipla
                  ? (e.escala_visual === "velocimetro"
                    ? <Velocimetro q={q} base={base} escolhida={escolhas[q.id]} aoEscolher={(k) => setEscolhas((x) => ({ ...x, [q.id]: k }))} f={f} />
                    : <Escala q={q} base={base} escolhida={escolhas[q.id]} aoEscolher={(k) => setEscolhas((x) => ({ ...x, [q.id]: k }))} f={f} />)
                  : <div className={cn(fotos ? "grid grid-cols-3 gap-x-2 gap-y-2" : cartoes ? "grid grid-cols-2 gap-2" : livro ? "grid grid-cols-2 gap-3" : "space-y-2", skin && (cartoes ? "qs-opts-grid" : "qs-opts-list"))}>
                  {q.opcoes.map((o, k) => {
                    const marcada = q.multipla ? (marcadas[q.id] ?? []).includes(k) : escolhas[q.id] === k;
                    const Opcao = editar ? "div" : "button";
                    return (
                      <Opcao key={k} type={editar ? undefined : "button"} onClick={() => (q.multipla ? alternar(q.id, k) : q.botao ? setEscolhas((x) => ({ ...x, [q.id]: k })) : escolher(q.id, k))}
                        className={cn("group flex w-full items-center gap-3 rounded-xl border-2 px-3 py-3 text-left text-[15px] transition-all hover:-translate-y-0.5 hover:shadow-md", skin && "qs-opt", skin && marcada && "qs-sel",
                          escuro ? "border-white/15 bg-white/5 hover:border-white/40" : "hover:border-foreground/30",
                          (cartoes || livro) && "flex-col justify-center text-center", v3 && "py-4 font-semibold", livro && "py-3 text-base font-semibold", fotos && "gap-1 border-0 px-0 py-1 hover:translate-y-0 hover:shadow-none", marcada && !fotos && "scale-[1.02] text-white")}
                        style={marcada ? (fotos ? { color: cor, fontWeight: 700 } : { background: cor, borderColor: cor }) : undefined}>
                        {v3 && !editar && o.icone && ICONES_OPCAO[o.icone] && (() => {
                          const Ic = ICONES_OPCAO[o.icone!], cDest = marcada ? "currentColor" : v?.destaque ?? cor;
                          return cartoes
                            ? <span className="qs-ic grid h-14 w-full place-items-center rounded-lg bg-white/5"><Ic className="h-7 w-7" style={{ color: cDest }} strokeWidth={1.7} /></span>
                            : <span className="qs-ic-r grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10"><Ic className="h-[18px] w-[18px]" style={{ color: cDest }} strokeWidth={1.8} /></span>;
                        })()}
                        {cartoes && emojiDe(o) && <span className="flex h-24 w-24 items-center justify-center text-6xl leading-none">{emojiDe(o)}</span>}
                        {cartoes && !emojiDe(o) && (o.imagem !== undefined || !!o.imagens) && (
                          <span className={cn("rounded-full", fotos && "p-[3px]")} style={fotos && marcada ? { boxShadow: `0 0 0 3px ${cor}` } : undefined}>
                            <Img caminho={`${base}.opcoes.${k}.imagem`} url={imagemDe(o)} redonda={fotos || avatares} className={avatares ? "mx-auto aspect-square w-24" : icones ? "mx-auto aspect-square w-14" : fotos ? "mx-auto aspect-square w-20" : "aspect-square w-full"} />
                          </span>
                        )}
                        {livro ? (k === 0 ? <X className={cn("h-7 w-7", marcada ? "text-white" : "text-orange-500")} /> : <Check className={cn("h-7 w-7", marcada ? "text-white" : "text-green-600")} />)
                          : editar ? <Txt caminho={`${base}.opcoes.${k}.emoji`} valor={o.emoji} className="text-xl" /> : o.emoji && !(v3 && o.icone && ICONES_OPCAO[o.icone]) ? <span className={v3 ? "text-4xl leading-none" : "text-xl"}>{o.emoji}</span> : (v3 && o.icone && ICONES_OPCAO[o.icone]) ? null : !cartoes && !v3 && (
                          <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold", marcada ? "bg-white/25" : escuro ? "bg-white/10" : "bg-black/5")}>
                            {marcada ? <Check className="h-4 w-4" /> : LETRAS[k]}
                          </span>
                        )}
                        <Txt caminho={`${base}.opcoes.${k}.texto`} valor={o.texto} className={livro ? "" : fotos ? "text-xs leading-tight" : "flex-1"} />
                        {v3 && !cartoes && !editar && <ArrowRight className={cn("h-4 w-4 shrink-0", marcada ? "opacity-100" : "opacity-40")} />}
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
                </div>}
                {(q.multipla || q.botao || (q.estilo === "escala" && !q.multipla)) && (
                  <div className="sticky bottom-3 z-10 pt-1">
                    <ContinuarTravavel liberado={q.multipla ? !!marcadas[q.id]?.length : escolhas[q.id] !== undefined} falta={q.multipla ? "Escolha pelo menos uma" : "Escolha uma opção"} onClick={avancar} />
                  </div>
                )}
                {pos > 1 && !editar && !travado && !v3 && e.voltar_embaixo !== false && (
                  <button type="button" onClick={voltar} className={cn("flex items-center gap-1 text-xs hover:opacity-100", suave)}><ArrowLeft className="h-3 w-3" />Voltar</button>
                )}
              </div>
            );
          })()}

          {passo.tipo === "tela" && (() => {
            const t = telas[passo.indice];
            const base = `telas.${passo.indice}`;
            if (t.tipo === "barras_mentores" || t.tipo === "depoimento_animado" || t.tipo === "projecao" || t.tipo === "compromisso") {
              const visual = { cor, escuro, suave };
              const botao = (rotulo: string) => <Botao onClick={avancar}><Txt caminho={`${base}.botao`} valor={t.botao || rotulo} /></Botao>;
              let corpo: ReactNode = null, titulo = f(t.titulo), rodape: ReactNode = botao("Continuar");
              if (t.tipo === "barras_mentores" && t.mentores) {
                const m = t.mentores;
                const pq = perguntas.find((x) => x.id === m.pergunta);
                const escolhidos = (marcadas[m.pergunta] ?? []).map((k) => ({ nome: pq?.opcoes[k]?.texto, foto: pq?.opcoes[k]?.imagem })).filter((x): x is { nome: string; foto: string | undefined } => !!x.nome);
                const comDado = (nome: string) => typeof m.dados[nome]?.livros_ano === "number";
                // Mostra todos os que a pessoa marcou: número vira barra, fato vira texto, sem nenhum dos dois a linha some.
                const mostrar = escolhidos.filter((x) => comDado(x.nome) || !!m.dados[x.nome]?.fato);
                const geral = mostrar.length === 0;   // nenhum dos escolhidos tem dado público: mostra os que têm número
                const lista = geral ? Object.keys(m.dados).filter(comDado).map((nome) => ({ nome, foto: pq?.opcoes.find((o) => o.texto === nome)?.imagem })) : mostrar;
                const barras: BarraMentor[] = lista.map((x) => ({ nome: x.nome, foto: x.foto, livros: m.dados[x.nome]?.livros_ano, fato: m.dados[x.nome]?.fato, fonte: m.dados[x.nome]?.fonte }));
                const nomes = lista.map((x) => x.nome);
                const vq = m.voce && perguntas.find((x) => x.id === m.voce?.pergunta);
                if (vq && numeros[vq.id] !== undefined) barras.push({ nome: m.voce?.rotulo ?? "Você", livros: numeros[vq.id], voce: true });
                const comNumero = barras.filter((b) => !b.voce && b.livros !== undefined);
                const media = comNumero.length ? Math.round(comNumero.reduce((s, b) => s + (b.livros ?? 0), 0) / comNumero.length) : 0;
                // Uma pessoa só: "Ele lê cerca de N"; duas ou mais: "Eles leem, em média, N".
                const singular = nomes.length === 1;
                titulo = (geral && m.titulo_geral ? f(m.titulo_geral) : titulo).replace(/\{mentores\}/g, listaEmTexto(nomes)).replace(/\{media_livros\}/g, String(media));
                if (!geral) titulo = singular ? titulo.replace(/Eles (liam|leem), em média,?/, "Ele lê cerca de").replace(/\bEles (liam|leem)\b/, "Ele lê") : titulo.replace(/\bEles liam\b/, "Eles leem");
                if (!geral && !comNumero.length) titulo = f(`Você escolheu ${listaEmTexto(nomes)}`);
                corpo = <BarrasMentores barras={barras} fontes={[...new Set(barras.filter((b) => !b.voce && b.fonte).map((b) => b.fonte as string))]} {...visual} />;
              } else if (t.tipo === "depoimento_animado" && t.depoimento_animado) {
                corpo = <DepoimentoAnimado key={t.id} cfg={t.depoimento_animado} {...visual} />;
              } else if (t.tipo === "projecao" && t.projecao) {
                const pq = perguntas.find((x) => x.id === t.projecao?.pergunta);
                const min = numeros[t.projecao.pergunta] ?? (pq?.numero ? limitesDoNumero(pq.numero).inicial : 0);
                const aq = (t.projecao.antes ? perguntas.find((x) => x.id === t.projecao?.antes) : undefined) ?? perguntas.find((x) => x.id !== t.projecao?.pergunta && /livro/i.test(x.numero?.unidade ?? ""));
                const antes = aq ? numeros[aq.id] : undefined;
                corpo = <ProjecaoLivros key={t.id} livros={livrosEm12Meses(min, pq?.numero)} antes={antes} {...visual} />;
                titulo = titulo.replace(/\{minutos\}/g, String(min)).replace(/\{livros\}/g, String(livrosEm12Meses(min, pq?.numero)));
              } else if (t.tipo === "compromisso") {
                const idMin = t.compromisso?.pergunta ?? telas.find((x) => x.tipo === "projecao")?.projecao?.pergunta ?? telas.find((x) => x.plano_numeros)?.plano_numeros?.minutos;
                const pm = idMin ? perguntas.find((x) => x.id === idMin) : undefined;
                const minutos = idMin ? numeros[idMin] ?? (pm?.numero ? limitesDoNumero(pm.numero).inicial : undefined) : undefined;
                corpo = comprometeu ? <CartaoCompromisso key={t.id} jaFez={desenhou} nome={contato.nome} minutos={minutos} {...visual} /> : null;
                rodape = desenhou
                  ? <div className="animate-pulse"><Botao onClick={avancar}>Continuar</Botao></div>
                  : <BotaoSegurar key={t.id} aoCompletar={() => setComprometeu(true)} rotulo={t.botao || t.compromisso?.segurar} cor={visual.cor} />;
              }
              return (
                <div key={t.id} className="space-y-5 py-2">
                  <Txt caminho={`${base}.titulo`} valor={t.titulo} mostrar={titulo} as="h2" className="block text-2xl font-bold leading-snug" />
                  {corpo}
                  <Txt caminho={`${base}.texto`} valor={t.texto} mostrar={f(t.texto)} as="p" className={cn("block text-base leading-relaxed", suave)} />
                  <div className="sticky bottom-3 z-10 pt-1">{rodape}</div>
                </div>
              );
            }
            if (t.tipo === "previa_perfil") {
              const msgs = ((perfil && t.previa?.perfis?.[perfil.id]) || t.previa?.padrao || []).map((m) => f(m).replace(/\{perfil\}/g, perfil?.nome ?? ""));
              return <ChatMensagens key={`${t.id}-${perfil?.id ?? ""}`} avatar={quadrosMascote?.[Q.PARADO]} cor={cor} escuro={escuro} mensagens={msgs} botao={t.botao || "Continuar"} aoContinuar={avancar} atraso={editar ? 0 : 1100} />;
            }
            if (t.tipo === "depoimento") return <DepoimentoCartao key={t.id} t={t} f={f} rodape={<Botao onClick={avancar}><Txt caminho={`${base}.botao`} valor={t.botao || "Continuar"} /></Botao>} />;
            if (t.tipo === "curtir_livros") return <CurtirLivros key={t.id} t={t} e={e} marcadas={marcadas} f={f} onSeguir={avancar} parado={editar} corBotao={v?.botao ?? cor} onCurtir={(id, sim) => (sim ? setCurtidos : setRejeitados)((x) => (x.includes(id) ? x : [...x, id]))} />;
            if (t.tipo === "carregando") return <Carregando key={t.id} t={t} base={base} f={f} onPronto={editar || travado ? undefined : avancar} suave={suave} />;
            if (t.tipo === "perfil") {
              const razoes = razoesDoPerfil(perguntas, escolhas, perfil?.id ?? "");
              return <PerfilTela key={t.id} perfil={perfil} razoes={razoes} cor={cor} escuro={escuro} suave={suave}
                titulo={<Txt caminho={`${base}.titulo`} valor={t.titulo || "Com base nas suas respostas, seu perfil é"} mostrar={f(t.titulo || "Com base nas suas respostas, seu perfil é")} as="p" className="block" />}
                numeros={t.plano_numeros && <PlanoEmNumeros titulo={f(t.plano_numeros.titulo || "Seu plano em números")} linhas={linhasDoPlano(t.plano_numeros)} cor={cor} escuro={escuro} suave={suave} />}
                botao={<Botao onClick={avancar}><Txt caminho={`${base}.botao`} valor={t.botao || "Ver meu plano"} /></Botao>} />;
            }
            if (t.tipo === "plano_livros") return <PlanoLivros key={t.id} t={t} base={base} e={e} perfil={perfil} escolhas={escolhas} marcadas={marcadas} f={f} cor={cor} escuro={escuro} suave={suave} onSeguir={avancar} />;
            if (t.tipo === "amostra") return <AmostraLivro key={t.id} teste={teste} t={t} base={base} e={e} perfil={perfil} escolhas={escolhas} marcadas={marcadas} f={f} cor={cor} escuro={escuro} suave={suave} onSeguir={avancar} onEvento={(d) => evento.current?.("amostra", undefined, d)} pular={!editar && !travado} chaveQuiz={titulo} cheia={amostraCheia} onVoltar={pos > 1 && !editar && !travado ? voltar : undefined} />;
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
                  {(editar || pn.titulo !== "") && <Txt caminho="nome.titulo" valor={pn.titulo ?? "Como posso te chamar?"} as="h2" className="block text-2xl font-bold leading-snug" />}
                  <Txt caminho="nome.texto" valor={pn.texto} as="p" className={cn("block text-base", suave)} />
                </div>
                {pn.modo === "letras" ? (
                  <NomeLetras valor={contato.nome ?? ""} cor={cor} escuro={escuro} suave={suave} aoMudar={(v) => setContato({ ...contato, nome: v })} />
                ) : (
                  <Input value={contato.nome ?? ""} placeholder={pn.exemplo || "Seu primeiro nome"} autoComplete="given-name" autoCapitalize="words" enterKeyHint="next"
                    className={cn("h-12 text-base", escuro && "border-white/20 bg-white/5", skin && "qs-input")}
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
                {pos > 1 && !editar && !travado && e.voltar_embaixo !== false && (
                  <button type="button" onClick={voltar} className={cn("flex items-center gap-1 text-xs hover:opacity-100", suave)}><ArrowLeft className="h-3 w-3" />Voltar</button>
                )}
              </form>
            );
          })()}

          {passo.tipo === "captura" && e.captura?.etapas && (
            <CapturaEtapas e={e} contato={contato} setContato={setContato} pedir={pedir} f={f} quadros={quadrosMascote} cor={cor} escuro={escuro} suave={suave} enviando={enviando} editar={editar}
              onGravar={() => gravar(contato)} onVerPlano={avancar}
              selos={e.captura.depoimentos?.length ? <CarrosselDepoimentos lista={e.captura.depoimentos} titulo={e.captura.depoimentos_titulo} escuro={escuro} suave={suave} />
                : !!e.captura.selos?.length && (
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
              )} />
          )}
          {passo.tipo === "captura" && !e.captura?.etapas && (
            <form className="space-y-4 py-2" noValidate={skin} onSubmit={(ev) => { ev.preventDefault(); if (travado) return; if (editar) { setPos((p) => p + 1); return; }
              if (skin) {
                const erro = conferirContato();
                setErroContato(erro?.msg ?? "");
                setCampoErro(erro?.campo ?? null);
                if (erro) { window.setTimeout(() => (document.getElementById(`qs-campo-${erro.campo}`) as HTMLInputElement | null)?.focus(), 30); return; }
                if (pedir.some((c) => (contato[c] ?? "").trim())) void enviarContato(); else setPos((p) => Math.min(p + 1, passos.length - 1));
                return;
              }
              if (contatoOk) void enviarContato(); }}>
              {quadrosMascote && (e.captura?.fala || editar) && (
                <MascoteCanto key="captura" quadros={quadrosMascote}><Txt caminho="captura.fala" valor={e.captura?.fala} mostrar={f(e.captura?.fala)} as="p" className="block text-base font-semibold leading-snug" /></MascoteCanto>
              )}
              <div className="space-y-2 text-center">
                {(e.captura?.selo || v3) && <span className={cn("inline-block rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider", skin && "qs-badge")} style={skin ? undefined : { background: `${cor}1a`, color: cor }}>{skin && <Check className="mr-1 inline h-3.5 w-3.5" strokeWidth={2.5} />}<Txt caminho="captura.selo" valor={e.captura?.selo || "QUIZ COMPLETO"} /></span>}
                <Txt caminho="captura.titulo" valor={e.captura?.titulo || "Para onde enviamos o seu resultado?"} mostrar={f(e.captura?.titulo || "Para onde enviamos o seu resultado?")} as="h2" className={cn("block text-2xl font-bold leading-snug", skin && "qs-lead-h")} />
                <Txt caminho="captura.texto" valor={e.captura?.texto} mostrar={f(e.captura?.texto)} as="p" className={cn("block text-base", suave)} />
              </div>
              {pedir.map((c) => (
                <label key={c} className="block space-y-1 text-sm">
                  <Txt caminho={`captura.rotulos.${c}`} valor={e.captura?.rotulos?.[c] || ROTULO_CAMPO[c].rotulo} className={cn(suave, skin && "qs-label")} />
                  {skin && c === "whatsapp"
                    ? <CampoWhatsapp id="qs-campo-whatsapp" valor={contato.whatsapp ?? ""} invalido={campoErro === "whatsapp"} placeholder={e.captura?.exemplos?.whatsapp ?? ROTULO_CAMPO.whatsapp.exemplo}
                        onChange={(val) => { setCampoErro(null); setErroContato(""); setContato((x) => ({ ...x, whatsapp: val })); }} />
                    : <Input id={`qs-campo-${c}`} type={ROTULO_CAMPO[c].tipo} value={contato[c] ?? ""} placeholder={e.captura?.exemplos?.[c] ?? ROTULO_CAMPO[c].exemplo}
                        inputMode={c === "whatsapp" ? "tel" : undefined} autoComplete={c === "nome" ? "given-name" : c === "whatsapp" ? "tel" : "email"} aria-invalid={campoErro === c || undefined}
                        className={cn("h-12 text-base", escuro && "border-white/20 bg-white/5", skin && "qs-input", skin && campoErro === c && "qs-invalido")}
                        onChange={(ev) => { if (skin) { setCampoErro(null); setErroContato(""); } setContato({ ...contato, [c]: ev.target.value }); }} />}
                </label>
              ))}
              {skin && erroContato && <p role="alert" className="qs-erro">{erroContato}</p>}
              <Button type={editar ? "button" : "submit"} size="lg" className={cn("h-auto min-h-12 w-full whitespace-normal rounded-xl text-base font-semibold text-white", skin && "qs-cta")} style={{ background: skin && v?.botao ? v.botao : cor, boxShadow: `0 8px 24px -8px ${cor}`, ...(skin && v?.botao_texto ? { color: v.botao_texto } : {}) }} disabled={!editar && ((!contatoOk && !skin) || enviando)}>
                {enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}<Txt caminho="captura.botao" valor={e.captura?.botao || "Ver meu resultado"} />
              </Button>
              {(e.captura?.pular || (editar && v3)) && (
                // Segue para o resultado sem gravar nada (sem lead).
                <button type="button" onClick={() => { if (!travado) setPos((p) => Math.min(p + 1, passos.length - 1)); }} className={cn("block w-full text-center text-sm underline underline-offset-4", suave)}><Txt caminho="captura.pular" valor={e.captura?.pular} /></button>
              )}
              {(e.captura?.nota || editar) && (
                <p className={cn("flex items-center justify-center gap-1.5 text-center text-xs", suave)}>
                  {!skin && <Lock className="h-3 w-3 shrink-0" />}<Txt caminho="captura.nota" valor={e.captura?.nota} />
                </p>
              )}
              {!!e.captura?.depoimentos?.length && <CarrosselDepoimentos lista={e.captura.depoimentos} titulo={e.captura.depoimentos_titulo} escuro={escuro} suave={suave} />}
              {!e.captura?.depoimentos?.length && !!e.captura?.selos?.length && (
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
              {(!temTelaResultado && !e.sem_resultado && !(v3 && e.oferta?.modo === "direto" && verOferta)) && (
                v3 ? <ResultadoIndice e={e} perfil={perfil} escolhas={escolhas} f={f} suave={suave} />
                  : <Resultado e={e} base="" perfil={perfil} iPerfil={iPerfil} escolhas={escolhas} nome={contato.nome} f={f} suave={suave} />
              )}
              {e.oferta?.modo === "direto" ? <OfertaDireta e={e} perfil={perfil} f={f} marcadas={marcadas} curtidos={curtidos} aoAvancar={() => { setVerOferta(true); window.scrollTo({ top: 0 }); }} />
                : ofertaMensalUnica(e) ? <OfertaMensal e={e} f={f} suave={suave} />
                : e.oferta ? <Oferta e={e} perfil={perfil} iPerfil={iPerfil} f={f} suave={suave} />
                : perfil?.cta_texto && (
                  perfil.cta_url ? <Botao href={perfil.cta_url}>{perfil.cta_texto}</Botao>
                    : <Button size="lg" className="w-full" disabled>{perfil.cta_texto} (link ainda não definido)</Button>
                )}
              {teste && !editar && !travado && <div className="text-center"><Button variant="outline" size="sm" className={escuro ? "border-white/20 bg-transparent" : undefined} onClick={reiniciar}>Testar de novo</Button></div>}
            </div>
          )}
        </div>
      </div>
      {skin && v?.marca?.rodape && <p className="mx-auto mt-6 w-full max-w-[480px] text-center text-[13px]" style={{ color: v.texto_2, fontFamily: v.fonte_texto }}>{v.marca.rodape}</p>}
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
    <div ref={raiz} className={cn("space-y-5 py-2", (especialista || (t.imagem_cheia && !!t.imagem)) && "text-center", !!t.enfeites?.length && "relative")}>
      {t.enfeites?.map((en, k) => <Enfeite key={k} en={en} k={k} />)}
      {t.imagem_cheia && t.imagem ? <img src={t.imagem} alt="" draggable={false} className={cn("mx-auto w-full rounded-2xl object-contain", t.titulo ? "max-h-[50dvh]" : "max-h-[55dvh]")} />
      : t.animada && (t.imagem || t.imagem_nota) ? <Mascote caminho={`${base}.imagem`} url={t.imagem} nota={t.imagem_nota} fala={f(t.fala) || undefined} falas={t.falas?.map((x) => f(x))} onFala={setIFala} quadros={t.quadros} abertura={t.abertura} onAberto={() => setAberto(true)} pose={t.pose} balaoGrande={t.balao_grande} />
      : t.loop?.length ? <MascoteLoop frames={t.loop} />
      : t.mapa && t.imagem ? <MapaConectado url={t.imagem} pontos={t.mapa.pontos} cor={cor} />
      : t.imagem_mascote && t.imagem ? <img src={t.imagem} alt="" draggable={false} className="mx-auto h-52 w-52 object-contain motion-safe:animate-empolgado" />
      : (t.imagem || t.imagem_nota) && (
        <Img caminho={`${base}.imagem`} url={t.imagem} nota={t.imagem_nota} redonda={especialista}
          className={especialista ? "mx-auto h-28 w-28" : "aspect-[16/9] max-h-[30dvh] w-full"} />
      )}
      <Txt caminho={`${base}.titulo`} valor={t.titulo} mostrar={f(t.titulo)} as="h2" className={cn("block leading-snug", t.imagem_cheia && t.imagem ? "-mt-2 text-xl font-semibold" : "text-2xl font-bold")} />
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
        <div className="relative flex flex-nowrap justify-center gap-1.5 sm:gap-2">
          {t.selos.map((sl, k) => {
            const Ic = sl.icone ? ICONES_SELO[sl.icone] : null;
            return (
              <span key={k} className="flex min-w-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[13px] font-bold shadow-sm sm:gap-1.5 sm:px-3.5 sm:py-1.5 sm:text-sm" style={{ background: sl.fundo, color: sl.cor }}>
                {Ic && <Ic className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />}<span className="min-w-0 truncate">{sl.texto}</span>
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
function VideoVsl({ url, poster, grande }: { url: string; poster?: string; grande?: boolean }) {
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
    <div className={"relative mx-auto aspect-[9/16] w-full select-none overflow-hidden rounded-2xl bg-black " + (grande ? "max-h-[64dvh] max-w-[380px]" : "max-h-[70dvh] max-w-[280px]")} onContextMenu={(e) => e.preventDefault()}>
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
    const dur = (t.duracao ?? 9.5) * 1000;   // devagar: dá para ler cada etapa (Davi, 10/11: "as perguntas estão aparecendo rápido demais")
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
  const { aoClicarOferta, editar, linkDeCompra } = useContext(QuizCtx);
  const o = e.oferta!;
  const planos = (o.planos ?? []).filter((p) => editar || !p.oculto);
  const [planoId, setPlanoId] = useState<string | null>(null);
  const plano = planos.find((p) => p.id === planoId) ?? planos.find((p) => p.destaque) ?? planos[0];
  const comBonus = !plano || plano.com_bonus !== false;
  const urlBase = plano ? plano.cta_url : (o.cta_url || perfil?.cta_url);
  const url = urlBase && linkDeCompra ? linkDeCompra(urlBase) : urlBase;
  const texto = o.cta_texto || perfil?.cta_texto || "Ativar meu plano";
  const verde = e.visual?.botao ?? "#34d399", roxo = "#9aa7ff";
  const de = o.preco_de, por = o.preco_por ?? o.preco;
  const cartoesDePlano = () => (
    <div className="space-y-2.5">
      {planos.map((p) => {
        const on = p.id === plano?.id;
        const cor = corDoQuiz(e);
        return (
          <button key={p.id} type="button" onClick={() => setPlanoId(p.id)} aria-pressed={on}
            className="relative block w-full rounded-2xl border-2 p-4 text-left transition-colors"
            style={{ borderColor: on ? cor : "rgba(255,255,255,0.15)", background: on ? `${cor}1f` : "rgba(255,255,255,0.04)" }}>
            {p.selo && <span className="absolute -top-2.5 right-4 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold uppercase text-white" style={{ background: cor }}>{p.selo}</span>}
            <div className="flex items-center gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2" style={{ borderColor: on ? cor : "rgba(255,255,255,0.4)", background: on ? cor : "transparent" }}>{on && <Check className="h-3 w-3 text-[#0a1020]" strokeWidth={4} />}</span>
              <div className="min-w-fit flex-1">
                <p className="text-base font-extrabold leading-tight">{p.nome}{p.oculto && <span className="ml-2 text-xs font-medium text-white/50">(oculto)</span>}</p>
                {o.planos_acesso && <p className="flex items-center gap-1 whitespace-nowrap text-xs font-medium" style={{ color: verde }}><Check className="h-3 w-3 shrink-0" strokeWidth={3} />{o.planos_acesso}</p>}
                <p className="whitespace-nowrap text-xs text-white/60">{p.com_bonus !== false && <span className="font-semibold" style={{ color: verde }}>+ {o.bonus?.length ?? 0} bônus inclusos</span>}</p>
              </div>
              <div className="shrink-0 text-right">
                {p.preco_de && <p className="text-xs text-white/50"><s>{p.preco_de}</s></p>}
                <p className="text-lg font-extrabold leading-tight">{p.preco}</p>
                {p.parcelas && <p className="text-xs text-white/60">ou {p.parcelas.n}x de {p.parcelas.valor}</p>}
                {p.equivalente && <p className="text-[11px] font-semibold" style={{ color: verde }}>{p.equivalente}</p>}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
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
      {plano ? cartoesDePlano() : <div className="text-center">
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
      </div>}
      {url
        ? <a href={url} target="_blank" rel="noreferrer" onClick={() => aoClicarOferta?.(plano?.nome)} className="flex min-h-12 w-full items-center justify-center rounded-xl px-4 py-3 text-base font-bold text-[#0a1020] transition-transform hover:scale-[1.02] active:scale-[0.98]" style={{ background: verde, boxShadow: `0 8px 24px -8px ${verde}` }}><Txt caminho="oferta.cta_texto" valor={texto} /></a>
        : <div className="flex min-h-12 w-full items-center justify-center rounded-xl px-4 py-3 text-base font-bold text-[#0a1020] opacity-90" style={{ background: verde }}><Txt caminho="oferta.cta_texto" valor={texto} />{!editar && <span className="ml-2 text-xs font-medium">(link ainda não definido)</span>}</div>}
      {o.garantia && (
        <div className="flex items-start gap-3 rounded-2xl border p-4 text-sm" style={{ borderColor: `${verde}55`, background: `${verde}10` }}>
          <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0" style={{ color: verde }} />
          <Txt caminho="oferta.garantia" valor={o.garantia} className="font-semibold" />
        </div>
      )}
    </div>
  );
  return (
    <div className={cn("space-y-7 p-5 text-white", !e.visual && "bg-[#0a1020] [box-shadow:0_0_0_100vmax_#0a1020] [clip-path:inset(-100vmax)]")}>   {/* ponta a ponta: o fundo escuro vai até as bordas da tela, também em cima e embaixo (sem faixa branca) */}
      {(o.headline || editar) && <Txt caminho="oferta.headline" valor={o.headline} as="h2" className="block text-center text-2xl font-extrabold leading-tight" />}
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
              {plano && (
                <p className="rounded-lg px-3 py-1.5 text-xs font-extrabold uppercase" style={comBonus ? { background: `${verde}22`, color: verde } : { background: "#f8717122", color: "#fca5a5" }}>
                  {comBonus ? "Exclusivo do plano anual" : `Você perde os ${o.bonus.length} bônus neste plano. Escolha o anual para levar.`}
                </p>
              )}
              {o.bonus.map((b, k) => (
                <div key={k} className={cn("space-y-1 rounded-2xl border border-white/15 bg-white/5 p-4 transition-opacity", !comBonus && "opacity-40 grayscale [&_p]:line-through")}>
                  <p className="text-sm font-extrabold leading-snug"><span aria-hidden>🎁 </span><Txt caminho={`oferta.bonus.${k}.titulo`} valor={b.titulo} /></p>
                  {(b.preco_de || b.preco_por) && (
                    <p className="text-sm font-semibold text-white/70">De <s><Txt caminho={`oferta.bonus.${k}.preco_de`} valor={b.preco_de} /></s> por <span className="font-extrabold" style={{ color: verde }}><Txt caminho={`oferta.bonus.${k}.preco_por`} valor={b.preco_por} /></span></p>
                  )}
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


// Resultado "Índice de Leitor" (V3, 22/11): selo, anel com a nota que enche até nota/10, nome do perfil, recap com as respostas,
// "faltam X pontos" e os cartões de benefício das respostas. A oferta vem logo depois, na mesma página.
function ResultadoIndice({ e, perfil, escolhas, f, suave }: { e: EstruturaQuiz; perfil: PerfilQuiz | null; escolhas: Record<string, number>; f: (s?: string) => string; suave: string }) {
  const { cor, escuro, editar, skin } = useContext(QuizCtx);
  const ind = e.indice!;
  const nivel = ind.anel === "nivel";   // anel mostra o nível (1 de 3), não os pontos
  const iPerfil = perfil ? e.perfis.findIndex((p) => p.id === perfil.id) : -1;
  const nota = nivel ? Math.max(0, iPerfil + 1) : (notaDoIndice(e, escolhas) ?? 0), max = nivel ? e.perfis.length : (ind.max ?? 10);
  const [cheio, setCheio] = useState(false);
  useEffect(() => { const t = setTimeout(() => setCheio(true), 150); return () => clearTimeout(t); }, []);
  const R = 52, C = 2 * Math.PI * R;
  // No editor ninguém respondeu: mostra o cartão da opção escolhida (ou da 1ª) de cada pergunta de `beneficios_de`, com o texto editável.
  const cartoesEditor = editar ? (ind.beneficios_de ?? []).flatMap((id) => {
    const qi = e.perguntas.findIndex((q) => q.id === id);
    const k = escolhas[id] ?? 0;
    const b = e.perguntas[qi]?.opcoes[k]?.beneficio;
    return b ? [{ titulo: b.titulo ?? "", texto: b.texto ?? "", caminho: `perguntas.${qi}.opcoes.${k}.beneficio` }] : [];
  }) : [];
  const cartoes: { titulo: string; texto: string; caminho?: string }[] = editar ? cartoesEditor : beneficiosDoIndice(ind, e.perguntas, escolhas);
  // Com `nivel_titulo`, o cartão "Seu nível" (descrição do perfil) entra em 2º lugar entre os benefícios.
  if (nivel && ind.nivel_titulo && perfil?.descricao) cartoes.splice(Math.min(1, cartoes.length), 0, { titulo: ind.nivel_titulo, texto: perfil.descricao });
  return (
    <div className={cn("space-y-5", skin && "qs-res")}>
      <div className="text-center">
        <span className={cn("inline-block rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider", skin && "qs-badge")} style={skin ? undefined : { background: `${cor}1a`, color: cor }}>{skin && <Check className="mr-1 inline h-3.5 w-3.5" strokeWidth={2.5} />}Resultado pronto</span>
      </div>
      <div className={cn("flex items-center animate-in zoom-in-95 duration-700", skin ? "qs-score gap-[18px]" : "gap-4")}>
        <div className={cn("relative shrink-0", skin ? "h-[92px] w-[92px]" : "h-32 w-32")}>
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden>
            <circle cx="60" cy="60" r={R} fill="none" strokeWidth={skin ? 10.5 : 11} stroke={escuro ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)"} />
            <circle cx="60" cy="60" r={R} fill="none" strokeWidth={skin ? 10.5 : 11} strokeLinecap={skin ? "butt" : "round"} stroke={cor}
              strokeDasharray={C} strokeDashoffset={cheio ? C * (1 - nota / max) : C} style={{ transition: "stroke-dashoffset 1.4s cubic-bezier(0.22,1,0.36,1)" }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
            <span className={cn("text-5xl font-extrabold", skin && "qs-ring-n")} style={{ color: cor }}>{nota}</span>
            <span className={cn("mt-1 text-xs font-semibold", suave, skin && "qs-ring-s")}>de {max}</span>
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-1.5 text-left">
          {nivel && perfil?.resumo
            ? <Txt caminho={`perfis.${iPerfil}.resumo`} valor={perfil.resumo} as="p" className={cn("block text-[11px] font-bold uppercase tracking-wider", suave, skin && "qs-kick")} />
            : <Txt caminho="indice.titulo" valor={ind.titulo} as="p" className={cn("block text-[11px] font-bold uppercase tracking-wider", suave, skin && "qs-kick")} />}
          <h2 className={cn("text-2xl font-extrabold leading-tight", skin && "qs-res-h")} style={skin ? undefined : { color: cor }}>{perfil ? <Txt caminho={`perfis.${iPerfil}.nome`} valor={perfil.nome} /> : "Obrigado!"}</h2>
          <TxtNegrito caminho="indice.recap" valor={ind.recap} mostrar={f(ind.recap)} as="p" className={cn("block text-sm leading-snug", skin && "qs-res-p")} />
        </div>
      </div>
      {(ind.falta || editar || (nivel && perfil?.frase)) && (
        <TxtNegrito caminho={!ind.falta && nivel && perfil?.frase ? `perfis.${iPerfil}.frase` : "indice.falta"} valor={!ind.falta && nivel ? perfil?.frase : ind.falta} mostrar={f(!ind.falta && nivel ? perfil?.frase : ind.falta)} as="p" className={cn("block rounded-xl px-4 py-3 text-center text-sm font-semibold", skin && "qs-gap")} />
      )}
      {!!cartoes.length && (
        <section className="space-y-3">
          <Txt caminho="indice.beneficios_titulo" valor={ind.beneficios_titulo} as="h3" className={cn("block text-center text-lg font-extrabold", skin && "qs-sec-t")} />
          {cartoes.map((c, k) => (
            <div key={k} className={cn("rounded-2xl border p-4 text-left", escuro ? "border-white/15 bg-white/5" : "bg-black/[0.02]", skin && "qs-do")}>
              <p className="flex items-center gap-2 text-base font-extrabold">{!skin && <Check className="h-5 w-5 shrink-0" style={{ color: cor }} strokeWidth={3} />}{c.caminho ? <Txt caminho={`${c.caminho}.titulo`} valor={c.titulo} /> : c.titulo}</p>
              <p className={cn("mt-1 text-sm leading-relaxed", suave)}>{c.caminho ? <Txt caminho={`${c.caminho}.texto`} valor={c.texto} /> : c.texto}</p>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

// "@perfil" no texto vira link para o Instagram (não pega e-mail: "suporte@instalivros.com" fica como está).
const INSTA_PERFIL = /((?<![\w.])@[\w.]*\w)/g;
function comLinkInsta(t: string): ReactNode {
  return t.split(INSTA_PERFIL).map((p, i) => (i % 2 ? <a key={i} href={`https://instagram.com/${p.slice(1).toLowerCase()}`} target="_blank" rel="noreferrer" className="font-semibold underline">{p}</a> : p));
}

/** Depoimento compacto da oferta (visual cartão): 4 linhas e "ler mais" para abrir o resto. */
function CartaoDepoimento({ d, k }: { d: Depoimento; k: number }) {
  const { editar } = useContext(QuizCtx);
  const [aberto, setAberto] = useState(false);
  const longo = (d.texto ?? "").length > 150;
  return (
    <div className="qs-tcard">
      <q className={cn(!aberto && !editar && "qs-clamp")}><Txt caminho={`oferta.depoimentos.${k}.texto`} valor={d.texto} /></q>
      {longo && !editar && <button type="button" className="qs-mais" onClick={() => setAberto((x) => !x)}>{aberto ? "ler menos" : "ler mais"}</button>}
      <small><Txt caminho={`oferta.depoimentos.${k}.nome`} valor={d.nome} /></small>
    </div>
  );
}

// Oferta mensal única da V3 (22/11): título, aviso honesto, cartão do preço, botão, selos, o que recebe, perguntas e fechamento com o botão de novo.
function OfertaMensal({ e, f, suave }: { e: EstruturaQuiz; f: (s?: string) => string; suave: string }) {
  const { cor, escuro, editar, skin } = useContext(QuizCtx);
  const o = e.oferta!;
  const icones = [Lock, ShieldCheck, BookOpen, Headphones];
  const cta = (
    <Botao href={o.cta_url}><Txt caminho="oferta.cta_texto" valor={o.cta_texto || "Quero o Instalivros"} /></Botao>
  );
  if (skin) {
    return (
      <div className="qs-oferta">
        <section className="qs-offer" id="oferta" style={e.visual?.oferta_fundo ? { background: e.visual.oferta_fundo } : undefined}>
          <Txt caminho="oferta.titulo" valor={o.titulo} mostrar={f(o.titulo)} as="h2" className="qs-offer-h block" />
          {(o.prova_social || editar) && <Txt caminho="oferta.prova_social" valor={o.prova_social} as="p" className="qs-soc block" />}
          {(o.aviso || editar) && (
            <div className="qs-honest"><Headphones className="qs-dot" strokeWidth={1.8} aria-hidden /><TxtNegrito caminho="oferta.aviso" valor={o.aviso} mostrar={f(o.aviso)} as="div" className="block" /></div>
          )}
          <div className="qs-price">
            <Txt caminho="oferta.preco_rotulo" valor={o.preco_rotulo} as="small" className="block" />
            <div className="qs-price-v"><Txt caminho="oferta.preco" valor={o.preco} as="span" />{" "}<Txt caminho="oferta.preco_detalhe" valor={o.preco_detalhe} as="span" className="qs-price-d" /></div>
            <Txt caminho="oferta.preco_sub" valor={o.preco_sub} as="p" className="block" />
          </div>
          {cta}
          <Txt caminho="oferta.garantia" valor={o.garantia} as="p" className="qs-note block" />
          {!!o.selos?.length && (
            <div className="qs-badges">
              {o.selos.slice(0, 4).map((t, k) => {
                const Icone = icones[k] ?? Check;
                return <div key={k}><Icone className="qs-badge-ic" strokeWidth={1.8} /><Txt caminho={`oferta.selos.${k}`} valor={t} /></div>;
              })}
            </div>
          )}
        </section>
        {o.video?.url && (
          <div className="qs-video">
            <Txt caminho="oferta.video.titulo" valor={o.video.titulo ?? "Veja por dentro do app"} as="h3" className="block text-center text-lg font-extrabold" />
            <VideoVsl url={o.video.url} poster={o.video.poster} />
          </div>
        )}
        {!!o.itens?.length && (
          <>
            <Txt caminho="oferta.recebe_titulo" valor={o.recebe_titulo ?? "O que você recebe"} as="div" className="qs-sec-t block" />
            <ul className="qs-give">{o.itens.map((it, k) => <li key={k}><span className="qs-ok" aria-hidden>✓</span><Txt caminho={`oferta.itens.${k}`} valor={it} /></li>)}</ul>
          </>
        )}
        {!!o.depoimentos?.length && (
          <>
            <Txt caminho="oferta.depoimentos_titulo" valor={o.depoimentos_titulo ?? "Os usuários adoram o Instalivros!"} as="div" className="qs-sec-t block" />
            <div className="qs-tests">
              {o.depoimentos.map((d, k) => (
                <CartaoDepoimento key={k} d={d} k={k} />
              ))}
            </div>
          </>
        )}
        {!!o.faq?.length && (
          <>
            <div className="qs-sec-t">Perguntas frequentes</div>
            {o.faq.map((q, k) => (
              <details key={k} open={editar || undefined} className="qs-details">
                <summary><Txt caminho={`oferta.faq.${k}.pergunta`} valor={q.pergunta} /></summary>
                {editar ? <Txt caminho={`oferta.faq.${k}.resposta`} valor={q.resposta} as="p" className="block" /> : <p>{comLinkInsta(q.resposta)}</p>}
              </details>
            ))}
          </>
        )}
        <div className="qs-final">
          <Txt caminho="oferta.fechamento_titulo" valor={o.fechamento_titulo} as="h2" className="block" />
          <Txt caminho="oferta.fechamento" valor={o.fechamento} mostrar={f(o.fechamento)} as="p" className="block" />
          {cta}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <Txt caminho="oferta.titulo" valor={o.titulo} mostrar={f(o.titulo)} as="h2" className="block text-center text-2xl font-extrabold leading-tight" />
      {(o.aviso || editar) && (
        <div className={cn("flex items-start gap-3 rounded-2xl border p-4 text-left text-sm leading-relaxed", escuro ? "border-white/15 bg-white/5" : "bg-black/[0.02]")}>
          <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full bg-yellow-400" aria-hidden />
          <TxtNegrito caminho="oferta.aviso" valor={o.aviso} mostrar={f(o.aviso)} as="p" className="block" />
        </div>
      )}
      {o.video?.url && (
        <div className="space-y-3">
          <Txt caminho="oferta.video.titulo" valor={o.video.titulo ?? "Veja por dentro do app"} as="h3" className="block text-center text-lg font-extrabold" />
          <VideoVsl url={o.video.url} poster={o.video.poster} />
        </div>
      )}
      <div className="space-y-3 rounded-2xl border-2 p-5 text-center" style={{ borderColor: cor, background: `${cor}0d` }}>
        <Txt caminho="oferta.preco_rotulo" valor={o.preco_rotulo} as="p" className="block text-xs font-bold uppercase tracking-wider" />
        <div className="flex items-baseline justify-center gap-2" style={{ color: cor }}>
          <Txt caminho="oferta.preco" valor={o.preco} as="span" className="text-5xl font-extrabold leading-none" />
          <Txt caminho="oferta.preco_detalhe" valor={o.preco_detalhe} as="span" className={cn("text-base font-semibold", suave)} />
        </div>
        <Txt caminho="oferta.preco_sub" valor={o.preco_sub} as="p" className={cn("block text-sm", suave)} />
        {cta}
        <Txt caminho="oferta.garantia" valor={o.garantia} as="p" className={cn("block text-xs", suave)} />
      </div>
      {!!o.selos?.length && (
        <div className="grid grid-cols-4 gap-1.5">
          {o.selos.slice(0, 4).map((t, k) => {
            const Icone = icones[k] ?? Check;
            return (
              <div key={k} className="flex flex-col items-center gap-1 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: `${cor}1a`, color: cor }}><Icone className="h-5 w-5" /></span>
                <Txt caminho={`oferta.selos.${k}`} valor={t} className="text-[11px] font-semibold leading-tight" />
              </div>
            );
          })}
        </div>
      )}
      {!!o.itens?.length && (
        <section className="space-y-3">
          <Txt caminho="oferta.recebe_titulo" valor={o.recebe_titulo ?? "O que você recebe"} as="h3" className="block text-lg font-extrabold" />
          <ul className="space-y-2.5">
            {o.itens.map((it, k) => (
              <li key={k} className="flex items-start gap-2.5 text-left text-sm leading-snug">
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-green-600" strokeWidth={3} />
                <Txt caminho={`oferta.itens.${k}`} valor={it} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {!!o.faq?.length && (
        <section className="space-y-2">
          <h3 className="text-lg font-extrabold">Perguntas frequentes</h3>
          {o.faq.map((q, k) => (
            <details key={k} open={editar || undefined} className={cn("group rounded-2xl border px-4 py-3 text-left", escuro ? "border-white/15 bg-white/5" : "bg-black/[0.02]")}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                <Txt caminho={`oferta.faq.${k}.pergunta`} valor={q.pergunta} />
                <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" style={{ color: cor }} />
              </summary>
              {editar
                ? <Txt caminho={`oferta.faq.${k}.resposta`} valor={q.resposta} as="p" className="mt-2 block text-sm leading-relaxed" />
                : <p className={cn("mt-2 text-sm leading-relaxed", suave)}>{comLinkInsta(q.resposta)}</p>}
            </details>
          ))}
        </section>
      )}
      <div className="space-y-3 pt-2 text-center">
        <Txt caminho="oferta.fechamento_titulo" valor={o.fechamento_titulo} as="h2" className="block text-3xl font-extrabold leading-tight" />
        <Txt caminho="oferta.fechamento" valor={o.fechamento} mostrar={f(o.fechamento)} as="p" className={cn("block text-sm", suave)} />
        {cta}
      </div>
    </div>
  );
}

// Fim "direto" da V2 (Davi, 18/11): em vez da página completa, 3 lâminas — escolher 1 bônus, conferir o que vai receber e o plano
// anual na cara do gol, com "Ver outros planos" abrindo uma folha de baixo com os planos.
const slugBonus = (b: { id?: string; titulo: string }) => b.id ?? b.titulo.replace(/^\s*b[ôo]nus\s*\d*\s*[:\-–]?\s*/i, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function OfertaDireta({ e, perfil, f, marcadas, curtidos, aoAvancar }: { e: EstruturaQuiz; perfil: PerfilQuiz | null; f: (s?: string) => string; marcadas: Record<string, number[]>; curtidos: number[]; aoAvancar?: () => void }) {
  const { aoClicarOferta, editar, linkDeCompra } = useContext(QuizCtx);
  const o = e.oferta!;
  const bonus = o.bonus ?? [];
  const planos = (o.planos ?? []).filter((p) => editar || !p.oculto);
  const [etapa, setEtapa] = useState(bonus.length ? 0 : 1);
  const [escolhido, setEscolhido] = useState<number | null>(null);
  const [folha, setFolha] = useState(false);
  const [verApp, setVerApp] = useState(false);
  const [planoId, setPlanoId] = useState<string | null>(null);
  const anual = planos.find((p) => p.destaque) ?? planos[0];
  const plano = planos.find((p) => p.id === planoId) ?? anual;
  const verde = e.visual?.botao ?? "#34d399", cor = corDoQuiz(e);
  const b = escolhido != null ? bonus[escolhido] : undefined;
  // Bônus de cada plano: "todos" = o escolhido + o outro; "escolhido" = só o escolhido; "nenhum". Sem `bonus_regra`, vale `com_bonus`.
  const bonusDoPlano = (p?: PlanoOferta): typeof bonus => {
    const regra = p?.bonus_regra ?? (p?.com_bonus !== false ? "escolhido" : "nenhum");
    if (regra === "nenhum") return [];
    if (regra === "todos") return b ? [b, ...bonus.filter((x) => x !== b)] : bonus;
    return b ? [b] : [];
  };
  const nomeCurto = (t: string) => t.replace(/^\s*b[ôo]nus\s*\d*\s*[:\-–]?\s*/i, "");
  // O bônus que a pessoa escolheu aparece só como "Bônus escolhido" (editável em `oferta.bonus_escolhido_rotulo`); o outro mostra o nome.
  const rotuloEscolhido = o.bonus_escolhido_rotulo || "Bônus escolhido";
  const nomeNoPlano = (x: (typeof bonus)[number]) => (b && x === b && !o.bonus_mostrar_nome ? rotuloEscolhido : nomeCurto(x.titulo));
  const irPara = (p?: PlanoOferta) => {
    const base = p ? p.cta_url : (o.cta_url || perfil?.cta_url);
    if (!base) return undefined;
    let u = linkDeCompra ? linkDeCompra(base) : base;
    const lb = bonusDoPlano(p);
    if (lb.length && /^https?:\/\//i.test(u)) { try { const x = new URL(u); x.searchParams.set("bonus", (p?.bonus_regra === "todos" ? bonus : lb).map(slugBonus).join(",")); u = x.toString(); } catch { /* mantém */ } }
    return u;
  };
  const abrir = (p?: PlanoOferta) => {
    const u = irPara(p);
    const lb = p?.bonus_regra === "todos" ? bonus : bonusDoPlano(p);
    aoClicarOferta?.(`${p?.nome ?? "Plano"}${lb.length ? ` + bônus ${lb.map(slugBonus).join(",")}` : ""}`);
    if (u && !editar) window.open(u, "_blank", "noopener");
  };
  const voltar = () => {
    if (verApp) { setVerApp(false); return; }
    if (etapa === 2 && o.app_demo) { setVerApp(true); setEtapa(1); return; }
    setEtapa((x) => Math.max(bonus.length ? 0 : 1, x - 1));
  };
  const titulo = (c: string, v: string, m?: string) => <Txt caminho={c} valor={v} mostrar={m} as="h2" className="block text-center text-2xl font-extrabold leading-tight" />;
  const btn = "flex min-h-12 w-full items-center justify-center rounded-xl px-4 py-3 text-base font-bold text-[#0a1020] transition-transform active:scale-[0.98] disabled:opacity-40";
  const topo = etapa > (bonus.length ? 0 : 1) && (
    <button type="button" onClick={voltar} className="flex items-center gap-1 text-xs text-white/70"><ArrowLeft className="h-3 w-3" />Voltar</button>
  );
  const cartao = (p: PlanoOferta) => {
    const on = p.id === plano?.id;
    const lb = bonusDoPlano(p);
    return (
      <button key={p.id} type="button" role="radio" aria-checked={on} onClick={() => setPlanoId(p.id)}
        className="relative flex w-full items-center gap-3 rounded-2xl p-3.5 text-left transition-colors"
        style={{ border: on ? "2px solid rgba(255,255,255,0.9)" : "1px solid rgba(255,255,255,0.2)", background: on ? "rgba(255,255,255,0.08)" : "transparent" }}>
        {(p.selo || p.destaque) && <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#f4efe6] px-3 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[#14110d]">{p.selo || "Melhor valor"}</span>}
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2" style={{ borderColor: on ? "#f4efe6" : "rgba(255,255,255,0.4)", background: on ? "#f4efe6" : "transparent" }}>{on && <Check className="h-3 w-3 text-[#14110d]" strokeWidth={4} />}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-extrabold leading-tight">{p.nome}</span>
          {lb.length > 0 && (
            <span className="mt-1 block text-[11px] font-semibold leading-snug" style={{ color: verde }}>
              {p.bonus_regra === "todos" && lb.length > 1 && <span className="mb-0.5 block font-extrabold uppercase tracking-wide">Leva os {lb.length} bônus</span>}
              {lb.map((x, k) => <span key={k} className="block">{k > 0 ? "+ " : ""}🎁 {nomeNoPlano(x)}{p.bonus_regra === "todos" && k > 0 ? " (de presente)" : ""}</span>)}
            </span>
          )}
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-lg font-extrabold leading-tight">{p.parcelas ? p.parcelas.valor.replace(/^R\$\s*/, "R$ ") : p.preco}</span>
          <span className="block text-[11px] text-white/60">{p.parcelas ? (o.preco_descricao || "por mês") : (o.preco_descricao || "à vista")}</span>
        </span>
      </button>
    );
  };
  if (etapa === 2) {
    const imagem = o.imagem_planos;
    const video = imagem ? undefined : o.video?.url;
    const lista = folha ? planos : [anual, ...planos.filter((x) => x.id !== anual?.id).slice(0, 1)].filter(Boolean) as PlanoOferta[];
    const sel = plano ?? anual;
    const tit = o.titulo ?? "{nome}, seu plano personalizado está pronto!";
    return (
      <div className={(editar ? "relative min-h-[640px]" : "fixed inset-0 z-40") + " flex flex-col overflow-hidden bg-[#0a1020] text-white"}>
        {video && <video src={video} poster={o.video?.poster} autoPlay loop muted playsInline preload="auto" className="absolute inset-x-0 top-0 h-[120%] w-full -translate-y-[14%] object-cover object-top" />}
        {!imagem && <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/50 to-black/90" />}
        <div className={"relative flex flex-1 flex-col justify-between"}>
          <div className="space-y-3 p-5 pt-6">
            {topo}
            {!imagem && <Txt caminho="oferta.titulo" valor={tit} mostrar={f(tit)} as="h2" className="block text-center text-3xl font-extrabold leading-tight drop-shadow" />}
          </div>
          {imagem && (
            <div className="relative -mt-14 min-h-0 flex-1 overflow-hidden">
              <img src={imagem} alt="" draggable={false} className="absolute inset-x-0 -bottom-12 top-0 h-[calc(100%+3rem)] w-full select-none object-cover object-bottom" />
              <div className="absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-[#0a1020] to-transparent" />
              <div className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-[#0a1020] to-transparent" />
            </div>
          )}
          <div className={"mx-auto w-full max-w-xl space-y-3 px-4 pb-5 pt-6 " + (imagem ? "" : "rounded-t-3xl bg-[#14110d]/95 backdrop-blur")} role="radiogroup" aria-label="Planos">
            {lista.map(cartao)}
            {planos.length > 2 && !folha && <button type="button" onClick={() => setFolha(true)} className="block w-full text-center text-xs font-bold uppercase tracking-wide text-white/70 underline underline-offset-4"><Txt caminho="oferta.outros_planos_texto" valor={o.outros_planos_texto ?? "Ver outros planos"} /></button>}
            <button type="button" onClick={() => abrir(sel)} className="flex min-h-14 w-full items-center justify-center rounded-full bg-[#f4efe6] px-6 text-base font-extrabold uppercase tracking-[0.2em] text-[#14110d] transition-transform active:scale-[0.98]">CONTINUAR</button>
            <p className="text-center text-xs text-white/70">
              {sel?.parcelas ? `${sel.preco} à vista ou ${sel.parcelas.n}x de ${sel.parcelas.valor}` : (planos.length > 1 ? `${sel?.preco ?? ""} ${o.preco_descricao ?? ""}`.trim() : null)}
              {o.cancele_texto && <span className="mt-0.5 block text-white/70"><Txt caminho="oferta.cancele_texto" valor={o.cancele_texto} /></span>}
              {bonusDoPlano(sel).length > 0 && <span className="mt-0.5 block font-semibold" style={{ color: verde }}>🎁 {bonusDoPlano(sel).length > 1 ? "com os seus bônus" : "com o seu bônus"}: {bonusDoPlano(sel).map(nomeNoPlano).join(" + ")}</span>}
              {o.rodape_legal && <span className="mt-1.5 block text-[10px] text-white/45"><Txt caminho="oferta.rodape_legal" valor={o.rodape_legal} /></span>}
            </p>
          </div>
        </div>
      </div>
    );
  }
  const casca = "flex min-h-[78dvh] flex-col justify-center gap-5 p-5 text-white " + (!e.visual ? "bg-[#0a1020] [box-shadow:0_0_0_100vmax_#0a1020] [clip-path:inset(-100vmax)]" : "");
  return (
    <div className={casca}>
      {topo}
      {etapa === 0 && (
        <>
          {titulo("oferta.bonus_escolha_titulo", o.bonus_escolha_titulo ?? "{nome}, escolha 1 bônus para levar de presente", f(o.bonus_escolha_titulo ?? "{nome}, escolha 1 bônus para levar de presente"))}
          <div className="space-y-3" role="radiogroup">
            {bonus.map((x, k) => {
              const on = escolhido === k;
              return (
                <button key={k} type="button" role="radio" aria-checked={on} onClick={() => setEscolhido(k)}
                  className="flex w-full items-start gap-3 rounded-2xl border-2 p-4 text-left transition-colors"
                  style={{ borderColor: on ? cor : "rgba(255,255,255,0.15)", background: on ? `${cor}1f` : "rgba(255,255,255,0.04)" }}>
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2" style={{ borderColor: on ? cor : "rgba(255,255,255,0.4)", background: on ? cor : "transparent" }}>{on && <Check className="h-3 w-3 text-[#0a1020]" strokeWidth={4} />}</span>
                  <span className="min-w-0 space-y-1">
                    <span className="block text-sm font-extrabold leading-snug"><span aria-hidden>🎁 </span><Txt caminho={`oferta.bonus.${k}.titulo`} valor={x.titulo} /></span>
                    <Txt caminho={`oferta.bonus.${k}.texto`} valor={x.texto} as="span" className="line-clamp-3 block text-sm leading-snug text-white/80" />
                    {(x.preco_de || x.preco_por) && <span className="block text-sm font-semibold text-white/70">De <s>{x.preco_de}</s> por <span className="font-extrabold" style={{ color: verde }}>{x.preco_por}</span></span>}
                  </span>
                </button>
              );
            })}
          </div>
          <button type="button" className={btn} style={{ background: verde }} disabled={!editar && escolhido == null} onClick={() => { setEtapa(1); aoAvancar?.(); }}>Avançar</button>
        </>
      )}
      {etapa === 1 && verApp && o.app_demo && (
        <>
          <Txt caminho="oferta.app_demo.titulo" valor={o.app_demo.titulo ?? "Veja o Instalivros por dentro"} as="h2" className="block text-center text-2xl font-extrabold leading-tight" />
          {o.app_demo.texto && <Txt caminho="oferta.app_demo.texto" valor={o.app_demo.texto} as="p" className="block text-center text-sm leading-snug text-white/80" />}
          <VideoVsl grande url={(o.app_demo.url || o.video?.url) ?? ""} poster={o.app_demo.poster || o.video?.poster} />
          <button type="button" className={btn} style={{ background: verde }} onClick={() => { setVerApp(false); setEtapa(2); window.scrollTo({ top: 0 }); }}>Continuar</button>
        </>
      )}
      {etapa === 1 && !verApp && o.sete_dias && !o.mostrar_recebe && (
        <SeteDias e={e} o={o} marcadas={marcadas} curtidos={curtidos} f={f}
          rodape={<button type="button" className={btn} style={{ background: verde }} onClick={() => { if (o.app_demo) { setVerApp(true); window.scrollTo({ top: 0 }); } else setEtapa(2); }}>Continuar</button>} />
      )}
      {etapa === 1 && !verApp && (!o.sete_dias || o.mostrar_recebe) && (
        <>
          {titulo("oferta.recebe_titulo", o.recebe_titulo ?? "Confira o que você vai receber")}
          <ul className="space-y-2.5">
            {(o.itens ?? []).map((it, k) => (
              <li key={k} className="flex items-start gap-2.5 text-sm leading-snug">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ background: verde }}><Check className="h-3.5 w-3.5 text-[#0a1020]" strokeWidth={3.5} /></span>
                <Txt caminho={`oferta.itens.${k}`} valor={it} />
              </li>
            ))}
          </ul>
          {b && (
            <div className="space-y-1 rounded-2xl border-2 p-4" style={{ borderColor: verde, background: `${verde}14` }}>
              <p className="text-xs font-extrabold uppercase" style={{ color: verde }}>🎁 Seu bônus</p>
              <p className="text-sm font-extrabold leading-snug">{b.titulo}</p>
              <p className="line-clamp-3 text-sm leading-snug text-white/80">{b.texto}</p>
            </div>
          )}
          <button type="button" className={btn} style={{ background: verde }} onClick={() => { if (o.app_demo) { setVerApp(true); window.scrollTo({ top: 0 }); } else setEtapa(2); }}>Avançar</button>
        </>
      )}
    </div>
  );
}
