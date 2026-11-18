import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Bookmark, ChevronDown, ChevronLeft, Download, Home, Lock, MoreHorizontal, Pause, Play, Search, Share2, Star, User, X, BookOpenText } from "lucide-react";
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

type Voo = { livro: LivroAmostra; de: DOMRect; alvo: { left: number; top: number; width: number; height: number } };

export function AmostraTela({ livros, nome, titulo, porque, aviso, dica, dicaDeslize, dicaRolar, fimTexto, textoBloqueado, textoSemAmostra, segundos, botao, aoEvento, suave }: {
  livros: LivroAmostra[]; nome: string; titulo: ReactNode; porque?: string; aviso: string; dica: string; dicaDeslize: string; dicaRolar?: string; fimTexto: string; textoBloqueado: string; textoSemAmostra: string; segundos: number; botao: ReactNode;
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
      <div ref={quadro} className="relative mx-auto flex h-[calc(100dvh-12rem)] max-h-[640px] min-h-[440px] w-full max-w-[390px] flex-col overflow-hidden rounded-[28px] border border-black/10 bg-white shadow-xl" style={{ color: MARINHO }}>
        {aberto
          ? <LivroAberto key={aberto.id} livro={aberto} segundos={segundos} fimTexto={fimTexto} textoBloqueado={textoBloqueado} textoSemAmostra={textoSemAmostra}
              aoEvento={(d) => aoEvento(`${d};livro=${aberto.id}`)} aoVoltar={() => setAberto(null)} />
          : <HomeApp livros={livros} titulo={titulo} porque={porque} dica={dica} dicaDeslize={dicaDeslize} dicaRolar={dicaRolar ?? "Role para baixo e veja tudo o que você vai ter no app"} tocouAlgum={tocouAlgum} abrir={abrir} />}
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
function HomeApp({ livros, titulo, porque, dica, dicaDeslize, dicaRolar, tocouAlgum, abrir }: {
  livros: LivroAmostra[]; titulo: ReactNode; porque?: string; dica: string; dicaDeslize: string; dicaRolar: string; tocouAlgum: boolean; abrir: (l: LivroAmostra, el: HTMLElement) => void;
}) {
  const primeiro = livros.find((l) => l.amostra);
  const { faixas, total } = useCategorias();
  const faixa = useRef<HTMLDivElement>(null);
  const rolagem = useRef<HTMLDivElement>(null);
  const empurrando = useRef(false);
  const [atual, setAtual] = useState(0);
  const [fase, setFase] = useState<"selecionados" | "categorias" | "foco" | "livre">(tocouAlgum ? "livre" : "selecionados");
  const [toque, setToque] = useState(0);
  const [rolou, setRolou] = useState(false);
  const passo = CAPA_W + VAO;
  const alvoDeslize = Math.min(3, livros.length - 1);
  const compacto = fase !== "selecionados";
  const capaW = compacto ? 96 : CAPA_W;

  // empurrãozinho: mostra a próxima capa e volta
  useEffect(() => {
    if (reduzido() || livros.length < 2 || fase !== "selecionados") return;
    const el = faixa.current;
    if (!el) return;
    const ids: number[] = [];
    const ir = (x: number) => { empurrando.current = true; el.scrollTo({ left: x, behavior: "smooth" }); ids.push(window.setTimeout(() => { empurrando.current = false; }, 700)); };
    ids.push(window.setTimeout(() => ir(passo * 0.8), 900), window.setTimeout(() => ir(0), 1900));
    return () => ids.forEach(clearTimeout);
  }, [livros.length, passo, fase]);

  // Parte 1 → 2: Dia 4 alcançado ou ~4 s sem mexer
  useEffect(() => {
    if (fase !== "selecionados") return;
    const id = window.setTimeout(() => setFase("categorias"), toque === 0 ? 6000 : 4000);
    return () => clearTimeout(id);
  }, [fase, toque]);

  // Parte 2 → 3: rolou um pouco (~1,8 s depois) ou ~6,5 s
  useEffect(() => {
    if (fase !== "categorias") return;
    const id = window.setTimeout(() => setFase("foco"), rolou ? 1800 : 6500);
    return () => clearTimeout(id);
  }, [fase, rolou]);

  // Parte 3: volta ao topo
  useEffect(() => {
    if (fase !== "foco") return;
    rolagem.current?.scrollTo({ top: 0, behavior: reduzido() ? "auto" : "smooth" });
  }, [fase]);

  // pulou as etapas (tocou num livro): a home volta já completa, sem foco
  useEffect(() => { if (tocouAlgum) setFase("livre"); }, [tocouAlgum]);

  const aoRolarFaixa = () => {
    const el = faixa.current;
    if (!el) return;
    setAtual(Math.max(0, Math.min(livros.length - 1, Math.round(el.scrollLeft / (CAPA_W + VAO)))));
    if (fase === "selecionados" && !empurrando.current) {
      setToque((n) => n + 1);
      if (el.scrollLeft >= passo * (alvoDeslize - 0.3)) setFase("categorias");
    }
  };

  const deslizando = fase === "selecionados";
  const emFoco = fase === "foco";
  const livroAtual = livros[atual];
  return (
    <>
      <style>{`@keyframes amostra-arrasta{0%{transform:translateX(70px);opacity:0}15%{opacity:1}75%{transform:translateX(-90px);opacity:1}100%{transform:translateX(-90px);opacity:0}}@keyframes amostra-sobe{0%{transform:translateY(40px);opacity:0}15%{opacity:1}75%{transform:translateY(-70px);opacity:1}100%{transform:translateY(-70px);opacity:0}}`}</style>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div ref={rolagem} onScroll={(ev) => { if (fase === "categorias" && ev.currentTarget.scrollTop > 80) setRolou(true); }}
          className={cn("min-h-0 flex-1 px-5 pb-2 pt-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", emFoco ? "overflow-y-hidden" : "overflow-y-auto")}>
          <div className="relative space-y-2.5">
            {emFoco && <div className="absolute -inset-x-5 -top-5 bottom-[-400px] z-20 bg-black/65 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500" aria-hidden />}

            {deslizando && (
              <div className="text-center">
                <div className="text-[17px] font-extrabold leading-snug">{titulo}</div>
                {porque && <p className="mt-0.5 text-[11px] leading-snug text-black/55">{porque}</p>}
              </div>
            )}

            {primeiro && (fase === "foco" || fase === "livre") && (
              <div className={cn("relative pb-12", emFoco && "z-30")}>
                <button type="button" onClick={(ev) => abrir(primeiro, ev.currentTarget.querySelector("img") ?? ev.currentTarget)}
                  className={cn("relative flex w-full items-center gap-3 rounded-lg p-2.5 text-left text-white active:scale-[0.98]", emFoco && "scale-[1.03] shadow-2xl ring-4 ring-white/80 motion-safe:animate-pulse")} style={{ background: AZUL }}>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-medium tracking-[0.15em] text-white/80">SEU LIVRO DO DIA 1</p>
                    <p className="mt-0.5 line-clamp-2 text-[15px] font-bold leading-tight">{primeiro.titulo}</p>
                  </div>
                  <img src={primeiro.capa} alt="" draggable={false} className="h-[66px] w-[47px] shrink-0 rounded object-cover shadow-lg" />
                </button>
                {emFoco && (
                  <>
                    <span className="pointer-events-none absolute bottom-3 right-6 select-none text-4xl drop-shadow-lg motion-safe:animate-bounce" aria-hidden>👆</span>
                    <p className="pointer-events-none absolute bottom-0 left-1/2 w-max max-w-[92%] -translate-x-1/2 rounded-full bg-white px-3 py-1 text-center text-[11px] font-bold leading-tight shadow-lg" style={{ color: MARINHO }}>{dica}</p>
                  </>
                )}
              </div>
            )}

            {compacto && faixas.length > 0 && (
              <div className="space-y-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-10 motion-safe:duration-700">
                <div>
                  <div className="flex items-center justify-between"><p className="text-[15px] font-extrabold">Categorias</p><span className="text-[11px] font-bold" style={{ color: AZUL }}>+{Math.max(450, Math.floor((total - 1) / 50) * 50)} resumos</span></div>
                  <div className="-mx-5 mt-2 flex gap-3 overflow-hidden px-5">
                    {faixas.slice(0, 5).map((c) => (
                      <div key={c.nome} className="flex w-[64px] shrink-0 flex-col items-center gap-1 text-center">
                        <span className="flex h-14 w-14 items-center justify-center rounded-full text-2xl text-white" style={{ background: AZUL }}>{c.icone}</span>
                        <span className="line-clamp-2 text-[9px] font-semibold leading-tight">{c.nome}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {faixas.map((c) => (
                  <div key={c.nome}>
                    <div className="flex items-center justify-between"><p className="text-[14px] font-extrabold">{c.nome}</p><span className="text-[10px] font-bold" style={{ color: AZUL }}>Ver Todos</span></div>
                    <div className="-mx-5 mt-1.5 flex gap-3 overflow-hidden px-5">
                      {c.livros.map((l) => (
                        <div key={l.id} className="w-[104px] shrink-0">
                          <img src={l.capa} alt="" draggable={false} loading="lazy" className="h-[146px] w-full rounded-lg object-cover shadow-md" />
                          <p className="mt-1 line-clamp-2 text-[10px] font-extrabold uppercase leading-tight">{tituloCurto(l.titulo)}</p>
                          <p className="text-[10px] font-semibold" style={{ color: VERDE }}>🔊 {l.audio} minutos</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-1.5">
              {compacto && <p className="mb-1 text-[15px] font-extrabold">Seu plano</p>}
              <div className="relative">
                <div ref={faixa} onScroll={aoRolarFaixa} className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ scrollPaddingLeft: 20 }}>
                  {livros.map((l, i) => (
                    <button key={l.id} type="button" aria-label={`Abrir ${l.titulo}`} onClick={(ev) => abrir(l, ev.currentTarget.querySelector("img") ?? ev.currentTarget)}
                      className="relative shrink-0 snap-start text-left transition-all duration-700 active:scale-95" style={{ width: capaW }}>
                      <span className="mb-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white" style={{ background: i === atual ? AZUL : MARINHO }}>{l.rotulo ?? `Dia ${i + 1}`}</span>
                      <span className="relative block">
                        <img src={l.capa} alt="" draggable={false} loading="lazy" className={cn("w-full rounded-lg object-cover shadow-md transition-all duration-700", !l.amostra && "opacity-70")} style={{ height: capaW * 1.4 }} />
                        {!l.amostra && <span className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"><Lock className="h-3 w-3" /></span>}
                      </span>
                      <span className="mt-1 line-clamp-1 block text-[11px] font-extrabold uppercase leading-tight">{l.titulo}</span>
                      <span className="flex items-center gap-1.5 text-[10px] font-semibold">
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
                  <span className="text-[11px] font-bold" style={{ color: AZUL }}>{livroAtual?.rotulo ?? ""}</span>
                </div>
              )}
              {deslizando && livros.length > 1 && (
                <p className="mx-auto mt-1.5 w-fit max-w-full rounded-full px-3 py-1 text-center text-[11px] font-bold leading-tight text-white shadow-lg motion-safe:animate-pulse" style={{ background: AZUL }}>{dicaDeslize}</p>
              )}
            </div>
          </div>
        </div>
        {fase === "categorias" && (
          <div className="pointer-events-none absolute inset-x-0 bottom-2 z-10 flex flex-col items-center">
            <span className="select-none text-5xl drop-shadow-lg motion-safe:[animation:amostra-sobe_1.6s_ease-in-out_infinite]" aria-hidden>👆</span>
            <p className="mt-1 max-w-[88%] rounded-full px-3 py-1 text-center text-[11px] font-bold leading-tight text-white shadow-lg ring-2 ring-white" style={{ background: MARINHO }}>{dicaRolar}</p>
          </div>
        )}
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

function Redondo({ children, rotulo, onClick, pulsa, apagado, grande }: { children: ReactNode; rotulo: string; onClick?: () => void; pulsa?: boolean; apagado?: boolean; grande?: boolean }) {
  return (
    <button type="button" aria-label={rotulo} onClick={onClick} disabled={!onClick}
      className={cn("flex items-center justify-center rounded-full text-white shadow-md active:scale-95", grande ? "h-14 w-14" : "h-12 w-12", pulsa && "ring-4 ring-white/80 shadow-xl motion-safe:animate-pulse", apagado && "opacity-40")} style={{ background: AZUL }}>
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
          <Redondo rotulo="Baixar" apagado><Download className="h-5 w-5" /></Redondo>
          <Redondo rotulo="Ler a amostra" onClick={temTexto ? () => setTela("lendo") : undefined} apagado><BookOpenText className="h-5 w-5" /></Redondo>
          <div className="relative">
            {temAudio && (
              <>
                <p className="pointer-events-none absolute -top-9 left-1/2 w-max -translate-x-1/2 rounded-full bg-white px-3 py-1 text-[11px] font-bold leading-tight shadow-lg motion-safe:animate-pulse" style={{ color: AZUL }}>Toque no play para ouvir</p>
                <span className="pointer-events-none absolute -top-3 left-1/2 z-10 -translate-x-1/2 select-none text-3xl drop-shadow-lg motion-safe:animate-bounce" aria-hidden>👆</span>
              </>
            )}
            <Redondo rotulo="Ouvir a amostra" onClick={temAudio ? () => setTela("ouvindo") : undefined} pulsa={temAudio} apagado={!temAudio} grande><Play className="ml-0.5 h-6 w-6" fill="currentColor" /></Redondo>
          </div>
          <Redondo rotulo="Compartilhar" apagado><Share2 className="h-5 w-5" /></Redondo>
        </div>
      </div>
      <div className="mt-4 min-h-0 flex-1 rounded-t-3xl bg-white px-6 pb-2 pt-3 text-center shadow-[0_-8px_20px_rgba(0,0,0,0.08)]">
        <div className="mx-auto mb-3 h-1 w-14 rounded-full bg-black/10" />
        <p className="text-sm font-extrabold">Sobre esse Livro</p>
        <div className="mt-2 flex justify-center gap-1">{[0, 1, 2, 3, 4].map((i) => <Star key={i} className="h-5 w-5 text-yellow-400" fill="currentColor" />)}</div>
        {am
          ? <p className="mt-2 text-xs leading-snug">{livro.minutos ? `${livro.minutos} minutos de resumo. ` : ""}Toque em ▶ para ouvir um trecho agora.</p>
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
