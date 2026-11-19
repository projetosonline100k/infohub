import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronLeft, Download, Lock, MoreHorizontal, Pause, Play, Share2, Star, X, BookOpenText } from "lucide-react";
import { cn } from "@/lib/utils";

// Tela "amostra" do quiz: a pessoa se vê DENTRO do app do Instalivros (18/11/2026, Davi: "copiar o visual dos prints do app").
// Home com o plano dela → detalhe do livro → player "Ouvindo" (toca a amostra) ou leitura "Lendo". Só visual e player;
// quem escolhe os livros é o QuizPlayer. O app é sempre claro (branco/azul), igual ao Instalivros, mesmo no quiz escuro.

export interface LivroAmostra {
  id: string; titulo: string; autor: string; capa: string; minutos?: number;
  /** "Dia 1", "Dia 2"… (ou "Para você"): vira o rótulo em cima da capa. */
  rotulo?: string;
  /** Tema que ligou o livro à pessoa ("Finanças"…): o chip embaixo da capa. */
  tema?: string;
  /** Sem `amostra` = livro bloqueado (só no plano completo). */
  amostra?: { audio_url?: string; texto?: string };
}

const AZUL = "#3E72E8";
const MARINHO = "#1F2A44";
const VERDE = "#2FA36B";
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const reduzido = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Estado da amostra guardado enquanto a pessoa está no quiz (18/11/2026, Davi: "se eu der o play e voltar sem querer, preciso que esteja
// ainda naquela parte"). Em memória (sobrevive a desmontar a tela) e em sessionStorage por quiz (sobrevive a recarregar).
type SubTela = "detalhe" | "ouvindo" | "lendo";
type FaseHome = "selecionados" | "categorias" | "foco" | "livre";
interface EstadoAmostra { livroId?: string; sub?: SubTela; tempo?: number; liberado?: boolean; fase?: FaseHome; tocouAlgum?: boolean }
const memoriaAmostra = new Map<string, EstadoAmostra>();
const lerEstado = (chave: string): EstadoAmostra => {
  const m = memoriaAmostra.get(chave);
  if (m) return m;
  try { const raw = window.sessionStorage.getItem(`amostra:${chave}`); if (raw) { const e = JSON.parse(raw) as EstadoAmostra; memoriaAmostra.set(chave, e); return e; } } catch { /* sem sessionStorage */ }
  return {};
};
const gravarEstado = (chave: string, parte: EstadoAmostra) => {
  const novo = { ...lerEstado(chave), ...parte };
  memoriaAmostra.set(chave, novo);
  try { window.sessionStorage.setItem(`amostra:${chave}`, JSON.stringify(novo)); } catch { /* sem sessionStorage */ }
};

type Voo = { livro: LivroAmostra; de: DOMRect; alvo: { left: number; top: number; width: number; height: number } };

// Altura da moldura em tela cheia: a tela menos o respiro da página (topo/rodapé, com área segura do iPhone) e o que fica embaixo (Continuar + dica).
// (classes escritas por extenso para o Tailwind enxergar; sem a dica embaixo sobram 24 px a mais)
const ALTURA_CHEIA = "h-[calc(100dvh_-_max(env(safe-area-inset-top),1.25rem)_-_max(env(safe-area-inset-bottom),1.5rem)_-_66px)] [@media(min-height:760px)]:h-[calc(100dvh_-_max(env(safe-area-inset-top),1.25rem)_-_max(env(safe-area-inset-bottom),1.5rem)_-_90px)]";

export function AmostraTela({ livros, nome, titulo, porque, aviso, dica, dicaDeslize, dicaRolar, fimTexto, textoBloqueado, textoSemAmostra, segundos, botao, botaoPasso, aoEvento, suave, chave: chaveBase = "amostra", cheia = false, aoVoltarQuiz, semMemoria = false }: {
  livros: LivroAmostra[]; nome: string; titulo: ReactNode; porque?: string; aviso: string; dica: string; dicaDeslize: string; dicaRolar?: string; fimTexto: string; textoBloqueado: string; textoSemAmostra: string; segundos: number; botao: ReactNode;
  /** Botão das partes 1 e 2 (mesmo estilo do Continuar); a pessoa avança tocando nele. */
  botaoPasso?: (rotulo: string, aoTocar: () => void) => ReactNode;
  /** `detalhe` curto para o registro da sessão: "abriu;livro=56" ou "ouviu=42s;total=75s;fim=nao;livro=56". */
  aoEvento: (detalhe: string) => void; cor?: string; escuro?: boolean; suave: string;
  /** Identifica esta amostra para lembrar onde a pessoa parou (quiz + tela). */
  chave?: string;
  /** Tela cheia no celular: a moldura ocupa a altura toda e tudo dentro fica maior (18/11/2026, Davi: "ficou minúsculo"). */
  cheia?: boolean;
  /** Setinha discreta por cima da home do app que volta uma tela do quiz (sem o cabeçalho do quiz). */
  aoVoltarQuiz?: () => void;
  /** Testar (19/11, Davi: "no celular eu vejo por etapas"): não lembra onde a pessoa parou, e a tela sempre recomeça na etapa 1. */
  semMemoria?: boolean;
}) {
  const aleatoria = useRef(Math.random().toString(36).slice(2));
  const chave = semMemoria ? `${chaveBase}#${aleatoria.current}` : chaveBase;
  const salvo = useMemo(() => lerEstado(chave), [chave]);
  const [aberto, setAberto] = useState<LivroAmostra | null>(() => livros.find((l) => l.id === salvo.livroId) ?? null);
  const [sub, setSubTela] = useState<SubTela>(() => (livros.some((l) => l.id === salvo.livroId) ? salvo.sub ?? "detalhe" : "detalhe"));
  const setSub = (v: SubTela) => { setSubTela(v); gravarEstado(chave, { sub: v }); };
  const [voo, setVoo] = useState<Voo | null>(null);
  const [tocouAlgum, setTocouAlgum] = useState(!!salvo.tocouAlgum);
  const [liberado, setLiberado] = useState(!!salvo.liberado);
  // Partes da home (sobem para cá para o botão de avançar ocupar o lugar do Continuar)
  const [fase, setFase] = useState<FaseHome>(salvo.tocouAlgum ? "livre" : salvo.fase ?? "selecionados");
  const [passoPronto, setPassoPronto] = useState(false);
  useEffect(() => { gravarEstado(chave, { fase }); }, [fase, chave]);
  const emPasso = !aberto && !!botaoPasso && (fase === "selecionados" || fase === "categorias");
  const quadro = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);
  // O botão só aparece depois de 5 s de áudio tocando; plano B: 25 s na tela.
  const liberar = useCallback(() => { setLiberado(true); gravarEstado(chave, { liberado: true }); }, [chave]);
  useEffect(() => { const id = window.setTimeout(liberar, 25000); return () => clearTimeout(id); }, [liberar]);

  const abrir = (livro: LivroAmostra, el: HTMLElement) => {
    setTocouAlgum(true);
    setFase("livre");
    // outro livro: recomeça do detalhe; o mesmo livro: volta de onde parou (tela e segundo do áudio)
    if (lerEstado(chave).livroId !== livro.id) { gravarEstado(chave, { livroId: livro.id, sub: "detalhe", tempo: 0 }); setSubTela("detalhe"); }
    gravarEstado(chave, { tocouAlgum: true });
    aoEvento(`abriu;livro=${livro.id}`);
    const q = quadro.current?.getBoundingClientRect();
    if (reduzido() || !q) { setAberto(livro); return; }
    // destino = onde a capa fica na tela de detalhe (centralizada, perto do topo do "celular")
    const h = cheia ? Math.min(240, Math.max(150, window.innerHeight * 0.25)) : 200, w = cheia ? h * 0.7 : 140;
    setVoo({ livro, de: el.getBoundingClientRect(), alvo: { left: q.left + (q.width - w) / 2, top: q.top + 74, width: w, height: h } });
    timers.current.push(window.setTimeout(() => { setAberto(livro); setVoo(null); }, 620));
  };

  return (
    <div className={cn("space-y-2 py-1", cheia && "-mx-2.5 py-0")}>
      <div ref={quadro} className={cn("relative mx-auto flex w-full flex-col overflow-hidden border border-black/10 bg-white shadow-xl", cheia
        ? `max-w-[430px] rounded-2xl ${ALTURA_CHEIA}`
        : "h-[calc(100dvh-12rem)] max-h-[640px] min-h-[440px] max-w-[390px] rounded-[28px]")} style={{ color: MARINHO }}>
        {cheia && !aberto && aoVoltarQuiz && (
          <button type="button" onClick={aoVoltarQuiz} aria-label="Voltar" className="absolute left-1.5 top-1.5 z-30 flex h-9 w-9 items-center justify-center rounded-full bg-black/5 text-black/50 active:scale-90"><ChevronLeft className="h-5 w-5" /></button>
        )}
        {aberto
          ? <LivroAberto key={aberto.id} cheia={cheia} livro={aberto} segundos={segundos} fimTexto={fimTexto} textoBloqueado={textoBloqueado} textoSemAmostra={textoSemAmostra} aoLiberar={liberar}
              sub={sub} aoSub={setSub} tempoInicial={lerEstado(chave).livroId === aberto.id ? lerEstado(chave).tempo ?? 0 : 0} aoTempo={(t) => gravarEstado(chave, { tempo: t })}
              aoEvento={(d) => aoEvento(`${d};livro=${aberto.id}`)} aoVoltar={() => { gravarEstado(chave, { livroId: undefined, sub: "detalhe", tempo: 0 }); setAberto(null); }} />
          : <HomeApp cheia={cheia} livros={livros} titulo={titulo} porque={porque} dica={dica} dicaDeslize={dicaDeslize} dicaRolar={dicaRolar ?? "Role para baixo e veja tudo o que você vai ter no app"} tocouAlgum={tocouAlgum} abrir={abrir} fase={fase} aoPronto={setPassoPronto} />}
      </div>
      <p className={cn("text-center text-[11px]", suave, cheia && "hidden [@media(min-height:760px)]:block")}>{aberto && sub === "ouvindo" ? "Ouvindo um trecho do livro do dia" : aviso}</p>
      {(() => {
        const visivel = emPasso ? passoPronto : liberado;
        return (
          <div aria-hidden={!visivel} className={cn("pt-0.5 transition-[opacity,transform,visibility] duration-500 ease-out", visivel ? "visible translate-y-0 opacity-100" : "invisible translate-y-4 opacity-0")}>
            {emPasso ? botaoPasso!(fase === "selecionados" ? "Ver mais livros" : "Ver meu livro do dia", () => { setPassoPronto(false); setFase(fase === "selecionados" ? "categorias" : "foco"); }) : botao}
          </div>
        );
      })()}
      {voo && <VooDaCapa voo={voo} />}
    </div>
  );
}

const CAPA_W = 138, VAO = 12;

type LivroCatalogo = { id: number; titulo: string; capa: string; nota: number; audio: number; temas: string[] };
const CATEGORIAS: { nome: string; icone: string; tema?: string }[] = [
  { nome: "Best Sellers", icone: "🏆" },
  { nome: "Mentalidade", icone: "🧠", tema: "mentalidade" },
  { nome: "Comunicação & Networking", icone: "🗣️", tema: "comunicacao" },
  { nome: "Dinheiro & Investimentos", icone: "💰", tema: "financas" },
  { nome: "Carreira & Empreendedorismo", icone: "🚀", tema: "carreira" },
  { nome: "Foco & Aprendizagem", icone: "🎯", tema: "foco" },
  { nome: "Liderança", icone: "👑", tema: "lideranca" },
  { nome: "Hábitos", icone: "🔁", tema: "habitos" },
  { nome: "Autoconfiança", icone: "💪", tema: "autoconfianca" },
];
const tituloCurto = (t: string) => t.toLowerCase().replace(/(^|[\s:—-])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());

// Faixas por categoria como na home do app (capas reais do catálogo; Best Sellers = os mais bem avaliados).
function useCategorias() {
  const [catalogo, setCatalogo] = useState<LivroCatalogo[]>([]);
  useEffect(() => { let vivo = true; void import("@/data/livros-instalivros.json").then((m) => { if (vivo) setCatalogo(m.default as LivroCatalogo[]); }); return () => { vivo = false; }; }, []);
  const faixas = useMemo(() => {
    const ordenado = [...catalogo].sort((x, y) => y.nota - x.nota || y.audio - x.audio);
    return CATEGORIAS.map((c) => ({ ...c, livros: (c.tema ? ordenado.filter((l) => l.temas.includes(c.tema!)) : ordenado).slice(0, 8) })).filter((c) => c.livros.length > 0);
  }, [catalogo]);
  return { faixas, total: catalogo.length };
}

// Home do app em 3 partes (18/11/2026, Davi):
// 1) só os livros selecionados, a mãozinha manda deslizar para o lado; 2) o plano desce e entram as categorias do app, a mãozinha manda rolar para baixo;
// 3) a lista volta ao topo e o livro do dia 1 fica em foco (resto escurece) para a pessoa tocar. Tocar em qualquer livro antes pula as etapas.
function HomeApp({ cheia, livros, titulo, porque, dica, dicaDeslize, dicaRolar, tocouAlgum, abrir, fase, aoPronto }: {
  cheia?: boolean;
  livros: LivroAmostra[]; titulo: ReactNode; porque?: string; dica: string; dicaDeslize: string; dicaRolar: string; tocouAlgum: boolean; abrir: (l: LivroAmostra, el: HTMLElement) => void; fase: FaseHome; aoPronto: (v: boolean) => void;
}) {
  const primeiro = livros.find((l) => l.amostra);
  const { faixas, total } = useCategorias();
  const faixa = useRef<HTMLDivElement>(null);
  const rolagem = useRef<HTMLDivElement>(null);
  const [atual, setAtual] = useState(0);
  const capaBase = cheia ? 190 : CAPA_W;
  const compacto = fase !== "selecionados";
  const capaW = compacto ? (cheia ? 150 : 96) : capaBase;

  // Nada avança sozinho (19/11/2026, Davi: "era muito rápido, ia me empurrando"): o botão embaixo aparece depois que a pessoa
  // desliza/rola um pouco ou após ~4 s na parte, e é ela que toca para ir à próxima.
  useEffect(() => {
    aoPronto(false);
    if (fase !== "selecionados" && fase !== "categorias") return;
    const id = window.setTimeout(() => aoPronto(true), 4000);
    return () => clearTimeout(id);
  }, [fase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Parte 3: volta ao topo
  useEffect(() => {
    if (fase !== "foco") return;
    rolagem.current?.scrollTo({ top: 0, behavior: reduzido() ? "auto" : "smooth" });
  }, [fase]);

  const aoRolarFaixa = () => {
    const el = faixa.current;
    if (!el) return;
    setAtual(Math.max(0, Math.min(livros.length - 1, Math.round(el.scrollLeft / (capaBase + VAO)))));
    if (fase === "selecionados" && el.scrollLeft > 8) aoPronto(true);
  };

  const deslizando = fase === "selecionados";
  const emFoco = fase === "foco";
  const livroAtual = livros[atual];
  return (
    <>
      <style>{`@keyframes amostra-arrasta{0%{transform:translateX(70px);opacity:0}15%{opacity:1}75%{transform:translateX(-90px);opacity:1}100%{transform:translateX(-90px);opacity:0}}@keyframes amostra-toque{0%,100%{transform:translateY(8px)}45%{transform:translateY(-4px)}}@keyframes amostra-afunda{0%,100%{transform:scale(1)}45%{transform:scale(1)}60%{transform:scale(.9)}80%{transform:scale(1)}}@keyframes amostra-sobe{0%{transform:translateY(40px);opacity:0}15%{opacity:1}75%{transform:translateY(-70px);opacity:1}100%{transform:translateY(-70px);opacity:0}}`}</style>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div ref={rolagem} onScroll={(ev) => { if (fase === "categorias" && ev.currentTarget.scrollTop > 40) aoPronto(true); }}
          className={cn("min-h-0 flex-1 px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", cheia ? "pt-11" : "pt-5", emFoco ? "overflow-y-hidden" : "overflow-y-auto")}>
          <div className="relative space-y-2.5">
            {emFoco && <div className="absolute -inset-x-5 -top-5 bottom-[-400px] z-20 bg-black/65 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500" aria-hidden />}

            {deslizando && (
              <div className="text-center">
                <div className={cn("font-extrabold leading-snug", cheia ? "text-[22px]" : "text-[17px]")}>{titulo}</div>
                {porque && <p className={cn("mt-0.5 leading-snug text-black/55", cheia ? "text-[13px]" : "text-[11px]")}>{porque}</p>}
              </div>
            )}

            {primeiro && (fase === "foco" || fase === "livre") && (
              <div className={cn("relative pb-12", emFoco && "z-30")}>
                <button type="button" onClick={(ev) => abrir(primeiro, ev.currentTarget.querySelector("img") ?? ev.currentTarget)}
                  className={cn("relative flex w-full items-center gap-3 rounded-lg p-2.5 text-left text-white active:scale-[0.98]", emFoco && "scale-[1.03] shadow-2xl ring-4 ring-white/80 motion-safe:animate-pulse")} style={{ background: AZUL }}>
                  <div className="min-w-0 flex-1">
                    <p className={cn("font-medium tracking-[0.15em] text-white/80", cheia ? "text-[12px]" : "text-[10px]")}>SEU LIVRO DO DIA 1</p>
                    <p className={cn("mt-0.5 line-clamp-2 font-bold leading-tight", cheia ? "text-[18px]" : "text-[15px]")}>{primeiro.titulo}</p>
                  </div>
                  <img src={primeiro.capa} alt="" draggable={false} className={cn("shrink-0 rounded object-cover shadow-lg", cheia ? "h-[84px] w-[60px]" : "h-[66px] w-[47px]")} />
                </button>
                {emFoco && (
                  <>
                    <span className="pointer-events-none absolute bottom-3 right-6 select-none text-4xl drop-shadow-lg motion-safe:[animation:amostra-toque_1.2s_ease-in-out_infinite]" aria-hidden>👆</span>
                    <p className={cn("pointer-events-none absolute bottom-0 left-1/2 w-max max-w-[92%] -translate-x-1/2 rounded-full bg-white px-3 py-1 text-center font-bold leading-tight shadow-lg", cheia ? "text-[13px]" : "text-[11px]")} style={{ color: MARINHO }}>{dica}</p>
                  </>
                )}
              </div>
            )}

            {compacto && faixas.length > 0 && (
              <div className="space-y-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-10 motion-safe:duration-700">
                <div>
                  <div className="flex items-center justify-between"><p className={cn("font-extrabold", cheia ? "text-[22px]" : "text-[15px]")}>Categorias</p><span className={cn("font-bold", cheia ? "text-[13px]" : "text-[11px]")} style={{ color: AZUL }}>+{Math.max(450, Math.floor((total - 1) / 50) * 50)} resumos</span></div>
                  <div className="-mx-5 mt-2 flex gap-3 overflow-hidden px-5">
                    {faixas.slice(0, 5).map((c) => (
                      <div key={c.nome} className={cn("flex shrink-0 flex-col items-center gap-1 text-center", cheia ? "w-[80px]" : "w-[64px]")}>
                        <span className={cn("flex items-center justify-center rounded-full text-white", cheia ? "h-[68px] w-[68px] text-3xl" : "h-14 w-14 text-2xl")} style={{ background: AZUL }}>{c.icone}</span>
                        <span className={cn("line-clamp-2 font-semibold leading-tight", cheia ? "text-[12px]" : "text-[9px]")}>{c.nome}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {faixas.map((c) => (
                  <div key={c.nome}>
                    <div className="flex items-center justify-between"><p className={cn("font-extrabold", cheia ? "text-[20px]" : "text-[14px]")}>{c.nome}</p><span className={cn("font-bold", cheia ? "text-[13px]" : "text-[10px]")} style={{ color: AZUL }}>Ver Todos</span></div>
                    <div className="-mx-5 mt-1.5 flex gap-3 overflow-hidden px-5">
                      {c.livros.map((l) => (
                        <div key={l.id} className={cn("shrink-0", cheia ? "w-[150px]" : "w-[104px]")}>
                          <img src={l.capa} alt="" draggable={false} loading="lazy" className={cn("w-full rounded-lg object-cover shadow-md", cheia ? "h-[210px]" : "h-[146px]")} />
                          <p className={cn("mt-1 line-clamp-2 font-extrabold uppercase leading-tight", cheia ? "text-[14px]" : "text-[10px]")}>{tituloCurto(l.titulo)}</p>
                          <p className={cn("font-semibold", cheia ? "text-[14px]" : "text-[10px]")} style={{ color: VERDE }}>🔊 {l.audio} minutos</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-1.5">
              {compacto && <p className={cn("mb-1 font-extrabold", cheia ? "text-[22px]" : "text-[15px]")}>Seu plano</p>}
              <div className="relative">
                <div ref={faixa} onScroll={aoRolarFaixa} className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ scrollPaddingLeft: 20 }}>
                  {livros.map((l, i) => (
                    <button key={l.id} type="button" aria-label={l.amostra && !deslizando ? `Abrir ${l.titulo}` : l.titulo} disabled={!l.amostra || deslizando} onClick={l.amostra && !deslizando ? (ev) => abrir(l, ev.currentTarget.querySelector("img") ?? ev.currentTarget) : undefined}
                      className={cn("relative shrink-0 snap-start text-left transition-all duration-700", l.amostra && !deslizando ? "active:scale-95" : "cursor-default")} style={{ width: capaW }}>
                      <span className={cn("mb-1 inline-block rounded-full px-2 py-0.5 font-extrabold uppercase tracking-wider text-white", cheia ? "text-[12px]" : "text-[10px]")} style={{ background: i === atual ? AZUL : MARINHO }}>{l.rotulo ?? `Dia ${i + 1}`}</span>
                      <span className="relative block">
                        <img src={l.capa} alt="" draggable={false} loading="lazy" className={cn("w-full rounded-lg object-cover shadow-md transition-all duration-700", !l.amostra && "opacity-70")} style={{ height: capaW * 1.4 }} />
                        {!l.amostra && <span className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"><Lock className="h-3 w-3" /></span>}
                      </span>
                      <span className={cn("mt-1 line-clamp-1 block font-extrabold uppercase leading-tight", cheia ? "text-[14px]" : "text-[11px]")}>{l.titulo}</span>
                      <span className={cn("flex items-center gap-1.5 font-semibold", cheia ? "text-[14px]" : "text-[10px]")}>
                        {l.minutos ? <span style={{ color: VERDE }}>🔊 {l.minutos} minutos</span> : null}
                        {!compacto && l.tema && <span className="truncate rounded-full bg-black/5 px-1.5 py-px">{l.tema}</span>}
                      </span>
                    </button>
                  ))}
                  <span className="w-2 shrink-0" aria-hidden />
                </div>
                {deslizando && livros.length > 1 && (
                  <span className="pointer-events-none absolute left-1/2 top-24 z-10 select-none text-5xl drop-shadow-lg motion-safe:[animation:amostra-arrasta_1.6s_ease-in-out_infinite]" aria-hidden>👆</span>
                )}
              </div>
              {deslizando && (
                <div className="mt-1 flex items-center justify-center gap-2" aria-hidden>
                  <div className="flex gap-1">{livros.map((l, i) => <span key={l.id} className="h-1.5 rounded-full transition-all" style={{ width: i === atual ? 16 : 6, background: i === atual ? AZUL : "#D5D9E6" }} />)}</div>
                  <span className={cn("font-bold", cheia ? "text-[13px]" : "text-[11px]")} style={{ color: AZUL }}>{livroAtual?.rotulo ?? ""}</span>
                </div>
              )}
              {deslizando && livros.length > 1 && (
                <p className={cn("mx-auto mt-1.5 w-fit max-w-full rounded-full px-3 py-1 text-center font-bold leading-tight text-white shadow-lg motion-safe:animate-pulse", cheia ? "text-[13px]" : "text-[11px]")} style={{ background: AZUL }}>{dicaDeslize}</p>
              )}
            </div>
          </div>
        </div>
        {fase === "categorias" && (
          <div className="pointer-events-none absolute inset-x-0 bottom-2 z-10 flex flex-col items-center">
            <span className="select-none text-5xl drop-shadow-lg motion-safe:[animation:amostra-sobe_1.6s_ease-in-out_infinite]" aria-hidden>👆</span>
            <p className={cn("mt-1 max-w-[88%] rounded-full px-3 py-1 text-center font-bold leading-tight text-white shadow-lg ring-2 ring-white", cheia ? "text-[13px]" : "text-[11px]")} style={{ background: MARINHO }}>{dicaRolar}</p>
          </div>
        )}
      </div>
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

function Redondo({ children, rotulo, onClick, pulsa, apagado, grande, cheia }: { children: ReactNode; rotulo: string; onClick?: () => void; pulsa?: boolean; apagado?: boolean; grande?: boolean; cheia?: boolean }) {
  return (
    <button type="button" aria-label={rotulo} onClick={onClick} disabled={!onClick}
      className={cn("flex items-center justify-center rounded-full text-white shadow-md active:scale-95", grande ? (cheia ? "h-16 w-16" : "h-14 w-14") : (cheia ? "h-14 w-14" : "h-12 w-12"), pulsa && "ring-4 ring-white/80 shadow-xl motion-safe:animate-pulse", apagado && "opacity-40")} style={{ background: AZUL }}>
      {children}
    </button>
  );
}

function LivroAberto({ cheia, livro, segundos, fimTexto, textoBloqueado, textoSemAmostra, aoEvento, aoVoltar, aoLiberar, sub, aoSub, tempoInicial, aoTempo }: {
  cheia?: boolean; livro: LivroAmostra; segundos: number; fimTexto: string; textoBloqueado: string; textoSemAmostra: string;
  aoEvento: (detalhe: string) => void; aoVoltar: () => void; aoLiberar: () => void;
  sub: SubTela; aoSub: (t: SubTela) => void; tempoInicial: number; aoTempo: (t: number) => void;
}) {
  const am = livro.amostra;
  const temAudio = !!am?.audio_url;
  const paragrafos = (am?.texto ?? "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const temTexto = paragrafos.length > 0;
  const tela = sub, setTela = aoSub;

  // 19/11 (Davi: "mesmo que a pessoa ative o modo texto, o áudio precisa continuar tocando"): o player fica montado enquanto o livro está aberto;
  // "Ouvindo" mostra o player inteiro, "Lendo" mostra o texto com uma barrinha do áudio em cima, e no detalhe ele só pausa.
  const emLeitura = tela === "lendo" && temTexto;
  const emPlayer = tela === "ouvindo" && temAudio;
  if (emPlayer || (emLeitura && temAudio)) {
    return (
      <>
        <Ouvindo modo={emPlayer ? "cheio" : "mini"} cheia={cheia} livro={livro} url={am!.audio_url!} segundos={segundos} fimTexto={fimTexto} aoEvento={aoEvento} aoLiberar={aoLiberar} tempoInicial={tempoInicial} aoTempo={aoTempo}
          aoFechar={() => setTela("detalhe")} aoLer={temTexto ? () => setTela("lendo") : undefined} />
        {emLeitura && <Lendo cheia={cheia} livro={livro} paragrafos={paragrafos} textoBloqueado={textoBloqueado} aoVoltar={() => setTela("detalhe")} />}
      </>
    );
  }
  if (emLeitura) {
    return <Lendo cheia={cheia} livro={livro} paragrafos={paragrafos} textoBloqueado={textoBloqueado} aoVoltar={() => setTela("detalhe")} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
      <div className={cn("relative flex shrink-0 items-center justify-center px-4 pb-1", cheia ? "pt-3" : "pt-5")}>
        <button type="button" onClick={aoVoltar} aria-label="Voltar" className="absolute left-3 flex h-9 w-9 items-center justify-center"><ChevronLeft className="h-6 w-6" /></button>
        <p className={cn("font-bold", cheia ? "text-base" : "text-sm")}>Detalhe do Livro</p>
      </div>
      <div className={cn("flex shrink-0 flex-col items-center px-5 text-center", cheia ? "pt-2" : "pt-3")}>
        <img src={livro.capa} alt="" draggable={false} className={cn("rounded-md object-cover shadow-[0_10px_24px_rgba(0,0,0,0.28)]", cheia ? "aspect-[7/10] h-[clamp(150px,25dvh,240px)] w-auto" : "h-[200px] w-[140px]")} />
        <p className={cn("line-clamp-2 font-extrabold leading-tight", cheia ? "mt-3 text-[22px]" : "mt-4 text-base")}>{livro.titulo}</p>
        <p className={cn("mt-0.5 line-clamp-1", cheia ? "text-sm" : "text-xs")}>{livro.autor}</p>
        <div className={cn("flex items-center justify-center gap-4", cheia ? "mt-10" : "mt-11")}>
          <Redondo cheia={cheia} rotulo="Baixar" apagado><Download className="h-5 w-5" /></Redondo>
          <Redondo cheia={cheia} rotulo="Ler a amostra" onClick={temTexto ? () => setTela("lendo") : undefined} apagado><BookOpenText className="h-5 w-5" /></Redondo>
          <div className="relative">
            {temAudio && (
              <>
                <p className={cn("pointer-events-none absolute -top-9 left-1/2 w-max -translate-x-1/2 rounded-full bg-white px-3 py-1 font-bold leading-tight shadow-lg motion-safe:animate-pulse", cheia ? "text-[13px]" : "text-[11px]")} style={{ color: AZUL }}>Toque no play para ouvir</p>
                <span className="pointer-events-none absolute left-1/2 top-[calc(100%-22px)] z-10 -translate-x-1/2 select-none text-3xl leading-none drop-shadow-lg" aria-hidden><span className="block motion-safe:[animation:amostra-toque_1.2s_ease-in-out_infinite]">👆</span></span>
              </>
            )}
            <div className={temAudio ? "motion-safe:[animation:amostra-afunda_1.2s_ease-in-out_infinite]" : undefined}><Redondo cheia={cheia} rotulo="Ouvir a amostra" onClick={temAudio ? () => setTela("ouvindo") : undefined} pulsa={temAudio} apagado={!temAudio} grande><Play className={cn("ml-0.5", cheia ? "h-8 w-8" : "h-6 w-6")} fill="currentColor" /></Redondo></div>
          </div>
          <Redondo cheia={cheia} rotulo="Compartilhar" apagado><Share2 className="h-5 w-5" /></Redondo>
        </div>
      </div>
      <div className={cn("min-h-0 flex-1 rounded-t-3xl bg-white px-6 pb-2 pt-3 text-center shadow-[0_-8px_20px_rgba(0,0,0,0.08)]", cheia ? "mt-3 overflow-hidden" : "mt-4")}>
        <div className="mx-auto mb-3 h-1 w-14 rounded-full bg-black/10" />
        <p className={cn("font-extrabold", cheia ? "text-base" : "text-sm")}>Sobre esse Livro</p>
        <div className={cn("mt-2 flex justify-center gap-1", cheia && "[@media(max-height:700px)]:hidden")}>{[0, 1, 2, 3, 4].map((i) => <Star key={i} className="h-5 w-5 text-yellow-400" fill="currentColor" />)}</div>
        {am
          ? <p className={cn("mt-2 leading-snug", cheia ? "text-sm" : "text-xs")}>{livro.minutos ? `${livro.minutos} minutos de resumo. ` : ""}Toque em ▶ para ouvir um trecho agora.</p>
          : (
            <div className="mt-2 space-y-1">
              <p className={cn("flex items-center justify-center gap-1.5 font-extrabold", cheia ? "text-base" : "text-sm")}>🔒 Disponível no seu plano completo</p>
              <p className={cn("leading-snug", cheia ? "text-sm" : "text-xs")}>{textoSemAmostra}</p>
            </div>
          )}
      </div>
    </div>
  );
}

function Ouvindo({ modo = "cheio", cheia, livro, url, segundos, fimTexto, aoEvento, aoFechar, aoLer, aoLiberar, tempoInicial, aoTempo }: {
  modo?: "cheio" | "mini"; cheia?: boolean; livro: LivroAmostra; url: string; segundos: number; fimTexto: string; aoEvento: (d: string) => void; aoFechar: () => void; aoLer?: () => void; aoLiberar: () => void; tempoInicial: number; aoTempo: (t: number) => void;
}) {
  const retomada = useRef(tempoInicial > 0.5).current;
  const [tocando, setTocando] = useState(false);
  const [atual, setAtual] = useState(tempoInicial);
  const [duracao, setDuracao] = useState(0);
  const [acabou, setAcabou] = useState(false);
  const [vel, setVel] = useState(1);
  const audio = useRef<HTMLAudioElement>(null);
  const maxOuvido = useRef(0);
  const jaTocou = useRef(false);
  const tocado = useRef(0);
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
  // Tempo de reprodução de verdade (pausa não conta): 5 s libera o Continuar.
  useEffect(() => {
    if (!tocando) return;
    const id = setInterval(() => { tocado.current += 0.25; if (tocado.current >= 5) { aoLiberar(); clearInterval(id); } }, 250);
    return () => clearInterval(id);
  }, [tocando, aoLiberar]);
  const avisarRef = useRef(avisar);
  avisarRef.current = avisar;
  useEffect(() => () => avisarRef.current(false), []);
  // Abriu o player = já começa a tocar (o toque no ▶ liberou o som). Voltando de onde parou: fica pausado no mesmo segundo, com o ▶ pronto.
  useEffect(() => { if (!retomada && modo === "cheio") void audio.current?.play().catch(() => setTocando(false)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Ao sair da tela (ou do player) o áudio para.
  useEffect(() => { const a = audio.current; return () => { a?.pause(); }; }, []);

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

  const elementoAudio = (
      <audio ref={audio} src={url} preload="auto" onError={aoLiberar}
        onLoadedMetadata={(ev) => { setDuracao(ev.currentTarget.duration || 0); if (retomada && ev.currentTarget.currentTime < 0.5) ev.currentTarget.currentTime = tempoInicial; }}
        onPlay={() => { jaTocou.current = true; setTocando(true); setAcabou(false); avisar(false); }}
        onPause={() => { setTocando(false); avisar(false); }}
        onTimeUpdate={(ev) => {
          const t = ev.currentTarget.currentTime;
          setAtual(t); aoTempo(t); if (t > maxOuvido.current) maxOuvido.current = t;
          if (t >= limite) { ev.currentTarget.pause(); setAcabou(true); evento.current(`ouviu=${Math.round(maxOuvido.current)}s;total=${Math.round(limite)}s;fim=sim`); }
        }}
        onEnded={() => { setAcabou(true); evento.current(`ouviu=${Math.round(maxOuvido.current)}s;total=${Math.round(limite)}s;fim=sim`); }} />
  );
  if (modo === "mini") {
    // Lendo: barrinha do áudio em cima do texto (continua tocando; dá para pausar).
    return (
      <>
        {elementoAudio}
        <div className="flex shrink-0 items-center gap-2.5 px-4 py-1.5 text-white" style={{ background: AZUL }}>
          <button type="button" onClick={alternar} aria-label={tocando ? "Pausar" : "Ouvir a amostra"} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20 active:scale-90">
            {tocando ? <Pause className="h-3.5 w-3.5" fill="currentColor" /> : <Play className="ml-0.5 h-3.5 w-3.5" fill="currentColor" />}
          </button>
          <div className="min-w-0 flex-1">
            <p className={cn("truncate font-bold", cheia ? "text-xs" : "text-[11px]")}>{acabou ? fimTexto : `🔊 Ouvindo: ${livro.titulo}`}</p>
            <div className="mt-1 h-1 rounded-full bg-white/25"><div className="h-full rounded-full bg-white transition-[width] duration-300" style={{ width: `${Math.min(100, (atual / limite) * 100)}%` }} /></div>
          </div>
          <span className="shrink-0 text-[11px] tabular-nums">{mmss(atual)}</span>
        </div>
      </>
    );
  }
  return (
    <>
      {elementoAudio}
    <div className={cn("flex min-h-0 flex-1 flex-col px-5 pb-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300", cheia ? "pt-3" : "pt-5")} style={{ background: "linear-gradient(180deg,#C9DCEB 0%,#E6EEF7 45%,#F6F9FC 100%)" }}>
      <div className="relative flex shrink-0 items-center justify-between">
        <button type="button" onClick={sair(aoFechar)} aria-label="Voltar" className="flex h-9 w-9 items-center justify-center"><ChevronDown className="h-6 w-6" /></button>
        <p className={cn("absolute inset-x-0 text-center font-bold", cheia ? "text-base" : "text-sm")}>Ouvindo</p>
        <button type="button" onClick={sair(aoFechar)} aria-label="Fechar" className="relative flex h-9 w-9 items-center justify-center rounded-full bg-[#BBD0E6]"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-center">
        <img src={livro.capa} alt="" draggable={false} className={cn("w-auto rounded-lg object-cover shadow-[0_12px_28px_rgba(0,0,0,0.25)]", cheia ? "h-[clamp(140px,calc(100dvh-440px),340px)] max-w-[80%]" : "h-[min(210px,32dvh)] max-w-[70%]")} />
        <p className={cn("mt-2 line-clamp-2 font-extrabold leading-tight", cheia ? "text-[22px]" : "text-base")}>{livro.titulo}</p>
        <p className={cn("line-clamp-1", cheia ? "text-sm" : "text-xs")}>{livro.autor}</p>
      </div>
      <div className="shrink-0 space-y-3">
        <div>
          <div className={cn("mb-1 flex justify-between tabular-nums", cheia ? "text-xs" : "text-[11px]")}><span>{mmss(atual)}</span><span>{mmss(limite)}</span></div>
          <div className="relative h-1.5 rounded-full bg-black/10">
            <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.min(100, (atual / limite) * 100)}%`, background: AZUL }} />
            <span className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full shadow" style={{ left: `${Math.min(100, (atual / limite) * 100)}%`, background: AZUL }} />
          </div>
        </div>
        <div className="flex items-center justify-center gap-7">
          <button type="button" onClick={() => pular(-15)} aria-label="Voltar 15 segundos" className={cn("font-extrabold active:scale-90", cheia ? "text-base" : "text-xs")}>−15</button>
          <button type="button" onClick={alternar} aria-label={tocando ? "Pausar" : "Ouvir a amostra"} className={cn("flex items-center justify-center rounded-full text-white shadow-lg active:scale-95", cheia ? "h-20 w-20" : "h-16 w-16")} style={{ background: AZUL }}>
            {tocando ? <Pause className={cheia ? "h-9 w-9" : "h-7 w-7"} fill="currentColor" /> : <Play className={cn("ml-0.5", cheia ? "h-9 w-9" : "h-7 w-7")} fill="currentColor" />}
          </button>
          <button type="button" onClick={() => pular(15)} aria-label="Avançar 15 segundos" className={cn("font-extrabold active:scale-90", cheia ? "text-base" : "text-xs")}>+15</button>
        </div>
        {acabou
          ? <p className={cn("text-center font-bold", cheia ? "text-base" : "text-sm")} style={{ color: AZUL }}>{fimTexto}</p>
          : (
            <div className="flex items-center justify-between px-1">
              <button type="button" onClick={mudarVel} className={cn("font-extrabold", cheia ? "text-sm" : "text-xs")}>{vel}x</button>
              {aoLer ? <button type="button" onClick={aoLer} aria-label="Ler"><BookOpenText className="h-5 w-5" /></button> : <span />}
              <Share2 className="h-5 w-5" aria-hidden />
            </div>
          )}
      </div>
    </div>
    </>
  );
}

function Lendo({ cheia, livro, paragrafos, textoBloqueado, aoVoltar }: { cheia?: boolean; livro: LivroAmostra; paragrafos: string[]; textoBloqueado: string; aoVoltar: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
      <div className={cn("relative flex shrink-0 items-center justify-between px-3 pb-1", cheia ? "pt-3" : "pt-5")}>
        <button type="button" onClick={aoVoltar} aria-label="Voltar" className="flex h-9 w-9 items-center justify-center"><ChevronLeft className="h-6 w-6" /></button>
        <p className={cn("absolute inset-x-0 text-center font-bold", cheia ? "text-base" : "text-sm")}>Lendo</p>
        <MoreHorizontal className="relative mr-2 h-5 w-5" aria-hidden />
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden px-5 pt-3">
        <p className={cn("font-extrabold uppercase leading-snug", cheia ? "text-xl" : "text-base")}>{livro.titulo}</p>
        <p className={cn("mt-2", cheia ? "text-sm" : "text-xs")}>{livro.autor}</p>
        <div className={cn("mt-5 space-y-3 text-justify leading-relaxed", cheia ? "text-[16px]" : "text-[13px]")}>
          {paragrafos.slice(0, 2).map((p, i) => <p key={i}>{p}</p>)}
          {paragrafos.slice(2, 4).map((p, i) => <p key={i} className="select-none opacity-40 blur-[1.5px]" aria-hidden>{p}</p>)}
        </div>
        <div className="absolute inset-x-0 bottom-0 flex h-28 items-end justify-center bg-gradient-to-b from-transparent via-white/90 to-white pb-4">
          <p className={cn("flex items-center gap-1.5 font-extrabold", cheia ? "text-base" : "text-sm")} style={{ color: AZUL }}><Lock className="h-4 w-4" />{textoBloqueado}</p>
        </div>
      </div>
    </div>
  );
}
