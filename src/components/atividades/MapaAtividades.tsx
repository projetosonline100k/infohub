import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import { AlertTriangle, Expand, Maximize, Minus, Plus, Shrink } from "lucide-react";
import { cn } from "@/lib/utils";
import { KanbanCard } from "./KanbanCard";
import {
  agruparPorColuna, COLUNAS_PADRAO, enquadrar, estaAtrasadaMapa, zoomNoPonto,
  type AtividadeMapa, type ColunaMapa, type Visao,
} from "@/lib/atividades/mapaAtividades";

export interface AtividadeNoMapa extends AtividadeMapa {
  cliente_id: string;
  titulo: string;
  prioridade: string;
  responsavel_nome: string | null;
  alarme_em?: string | null;
  // O card é o mesmo do quadro do projeto (KanbanCard, 19/10): cronômetro, checklist, prazo…
  descricao?: string | null;
  data_inicio?: string | null;
  tempo_estimado?: number | null;
  timer_iniciado_em?: string | null;
  timer_decorrido_segundos?: number | null;
}

/** Cronômetro do card (as mesmas ações do quadro do projeto). */
export interface AcoesTimer {
  iniciar: (id: string) => void;
  pausar: (id: string) => void;
  zerar: (id: string) => void;
  finalizado: (id: string) => void;
}

interface ProjetoNoMapa { id: string; nome: string }

const LARGURA_COLUNA = 210;
const MAX_CONCLUIDAS = 5;

interface Arrasto {
  atividade: AtividadeNoMapa;
  x: number;
  y: number;
  alvo: { clienteId: string; statusKey: string; indice: number } | null;
}

// Visão geral de todas as atividades de todos os projetos num canvas com
// zoom (pinça/⌘+roda), navegação (arrastar o fundo, rolar) e cards que dá
// pra arrastar entre colunas pra mudar o status — sem entrar em cada projeto.
export function MapaAtividades({ projetos, atividades, colunasPorCliente, onMover, onAbrir, onConcluir, onCriar, timer, checklistPorAtividade }: {
  projetos: ProjetoNoMapa[];
  atividades: AtividadeNoMapa[];
  colunasPorCliente: Record<string, ColunaMapa[]>;
  /** `indice`: posição na coluna de destino (19/10: "mudar a ordem dos cards"). */
  onMover: (atividade: AtividadeNoMapa, coluna: ColunaMapa, indice: number) => void;
  timer?: AcoesTimer;
  checklistPorAtividade?: Record<string, { total: number; concluidas: number }>;
  onAbrir: (atividade: AtividadeNoMapa) => void;
  /** "+" na coluna (19/10, Davi: "não consigo criar uma atividade"): cria nesse projeto e coluna. */
  onCriar?: (clienteId: string, statusKey: string, titulo: string) => Promise<void>;
  // Check do card: conclui (vai pra coluna de conclusão) ou reabre.
  onConcluir: (atividade: AtividadeNoMapa, concluida: boolean) => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const conteudoRef = useRef<HTMLDivElement>(null);
  const [visao, setVisao] = useState<Visao>({ x: 32, y: 32, escala: 1 });
  const visaoRef = useRef(visao);
  visaoRef.current = visao;
  const [soAtrasadas, setSoAtrasadas] = useState(false);
  const [arrasto, setArrasto] = useState<Arrasto | null>(null);
  // Tela cheia: o mapa cobre a janela toda (Esc ou o botão volta).
  const [telaCheia, setTelaCheia] = useState(false);
  const [criandoEm, setCriandoEm] = useState<{ clienteId: string; statusKey: string } | null>(null);
  const [novoTitulo, setNovoTitulo] = useState("");
  const [salvandoNova, setSalvandoNova] = useState(false);
  const enquadrouRef = useRef(false);
  const hojeIso = format(new Date(), "yyyy-MM-dd");

  const colunasDe = useCallback((clienteId: string) => {
    const colunas = colunasPorCliente[clienteId];
    return colunas && colunas.length ? colunas : COLUNAS_PADRAO;
  }, [colunasPorCliente]);

  const porProjeto = useMemo(() => projetos.map((projeto) => {
    const lista = atividades.filter((a) => a.cliente_id === projeto.id);
    return {
      projeto,
      colunas: colunasDe(projeto.id),
      grupos: agruparPorColuna(lista, colunasDe(projeto.id)),
      abertas: lista.filter((a) => !a.concluida).length,
      atrasadas: lista.filter((a) => estaAtrasadaMapa(a, hojeIso)).length,
    };
  }), [projetos, atividades, colunasDe, hojeIso]);

  // Projetos lado a lado, quebrando linha pra ficar mais "quadrado".
  const porLinha = Math.max(1, Math.ceil(Math.sqrt(porProjeto.length)));

  const ajustar = useCallback(() => {
    const canvas = canvasRef.current;
    const conteudo = conteudoRef.current;
    if (!canvas || !conteudo) return;
    setVisao(enquadrar(conteudo.offsetWidth, conteudo.offsetHeight, canvas.clientWidth, canvas.clientHeight));
  }, []);

  // Enquadra tudo na primeira vez que há conteúdo.
  useLayoutEffect(() => {
    if (enquadrouRef.current || porProjeto.length === 0) return;
    enquadrouRef.current = true;
    ajustar();
  }, [porProjeto.length, ajustar]);

  // Roda/trackpad: pinça ou ⌘/Ctrl+roda dá zoom no cursor; rolar navega.
  // 19/10: liga quando o mapa existe de fato — antes rodava só na montagem, quando as atividades
  // ainda estavam carregando (sem canvas), e a pinça/rolagem nunca chegavam ao mapa.
  const temMapa = porProjeto.length > 0;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !temMapa) return;
    const aoRolar = (event: WheelEvent) => {
      event.preventDefault();
      const caixa = canvas.getBoundingClientRect();
      const atual = visaoRef.current;
      if (event.ctrlKey || event.metaKey) {
        setVisao(zoomNoPonto(atual, atual.escala * Math.exp(-event.deltaY * 0.01), event.clientX - caixa.left, event.clientY - caixa.top));
      } else {
        setVisao({ ...atual, x: atual.x - event.deltaX, y: atual.y - event.deltaY });
      }
    };
    // Pinça no trackpad: o Chrome manda "wheel" com ctrlKey (tratado acima),
    // mas o WebKit (app desktop no Mac, Safari) manda eventos de gesto.
    type Gesto = Event & { scale: number; clientX: number; clientY: number };
    let escalaInicial = 1;
    const aoIniciarGesto = (event: Event) => { event.preventDefault(); escalaInicial = visaoRef.current.escala; };
    const aoGesto = (event: Event) => {
      event.preventDefault();
      const gesto = event as Gesto;
      const caixa = canvas.getBoundingClientRect();
      setVisao(zoomNoPonto(visaoRef.current, escalaInicial * gesto.scale, gesto.clientX - caixa.left, gesto.clientY - caixa.top));
    };
    canvas.addEventListener("wheel", aoRolar, { passive: false });
    canvas.addEventListener("gesturestart", aoIniciarGesto);
    canvas.addEventListener("gesturechange", aoGesto);
    canvas.addEventListener("gestureend", aoIniciarGesto);
    return () => {
      canvas.removeEventListener("wheel", aoRolar);
      canvas.removeEventListener("gesturestart", aoIniciarGesto);
      canvas.removeEventListener("gesturechange", aoGesto);
      canvas.removeEventListener("gestureend", aoIniciarGesto);
    };
  }, [temMapa]);

  const zoomBotao = useCallback((fator: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setVisao((atual) => zoomNoPonto(atual, atual.escala * fator, canvas.clientWidth / 2, canvas.clientHeight / 2));
  }, []);

  useEffect(() => {
    // Reenquadra depois que o tamanho do canvas muda.
    const quadro = requestAnimationFrame(() => ajustar());
    if (!telaCheia) return () => cancelAnimationFrame(quadro);
    const aoTeclar = (event: KeyboardEvent) => { if (event.key === "Escape") setTelaCheia(false); };
    window.addEventListener("keydown", aoTeclar);
    return () => { cancelAnimationFrame(quadro); window.removeEventListener("keydown", aoTeclar); };
  }, [telaCheia, ajustar]);

  // Atalhos: ⌘− / ⌘= (ou ⌘+) aproximam/afastam, ⌘0 enquadra tudo.
  useEffect(() => {
    const aoTeclar = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !canvasRef.current?.offsetParent) return;
      if (event.key === "-" || event.key === "_") { event.preventDefault(); zoomBotao(1 / 1.2); }
      else if (event.key === "=" || event.key === "+") { event.preventDefault(); zoomBotao(1.2); }
      else if (event.key === "0") { event.preventDefault(); ajustar(); }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [zoomBotao, ajustar]);

  // Arrastar o fundo move o canvas.
  const iniciarPan = (event: React.PointerEvent) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("[data-mapa-card]")) return;
    const inicio = { x: event.clientX, y: event.clientY, visao: visaoRef.current };
    const mover = (e: PointerEvent) => setVisao({ ...inicio.visao, x: inicio.visao.x + e.clientX - inicio.x, y: inicio.visao.y + e.clientY - inicio.y });
    const soltar = () => { window.removeEventListener("pointermove", mover); };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar, { once: true });
  };

  // Arrastar um card: solto numa coluna do mesmo projeto muda o status.
  const arrastouRef = useRef(false);   // depois de arrastar, o clique que vem junto não abre o card
  const iniciarArrastoCard = (event: React.PointerEvent, atividade: AtividadeNoMapa) => {
    // Botões do card (concluir, cronômetro) não arrastam.
    if (event.button !== 0 || (event.target as HTMLElement).closest("button, input, [role=menu]")) return;
    event.stopPropagation();
    const origem = { x: event.clientX, y: event.clientY };
    let ativo = false;
    let alvo: Arrasto["alvo"] = null;
    const mover = (e: PointerEvent) => {
      if (!ativo && Math.hypot(e.clientX - origem.x, e.clientY - origem.y) < 5) return;
      ativo = true;
      const coluna = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-mapa-coluna]");
      // Posição na coluna: quantos cards (fora o arrastado) ficam acima do mouse.
      const indice = coluna
        ? Array.from(coluna.querySelectorAll<HTMLElement>("[data-mapa-card]"))
          .filter((el) => el.dataset.mapaCard !== atividade.id)
          .filter((el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2 < e.clientY; }).length
        : 0;
      alvo = coluna ? { clienteId: coluna.dataset.cliente!, statusKey: coluna.dataset.mapaColuna!, indice } : null;
      setArrasto({ atividade, x: e.clientX, y: e.clientY, alvo });
    };
    const soltar = () => {
      window.removeEventListener("pointermove", mover);
      setArrasto(null);
      if (!ativo) return;   // clique simples: quem abre é o próprio card (onClick)
      arrastouRef.current = true;
      window.setTimeout(() => { arrastouRef.current = false; }, 0);
      if (!alvo || alvo.clienteId !== atividade.cliente_id) return;
      const coluna = colunasDe(alvo.clienteId).find((c) => c.status_key === alvo!.statusKey);
      if (coluna) onMover(atividade, coluna, alvo.indice);
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar, { once: true });
  };

  if (porProjeto.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">Nenhuma atividade para mostrar no mapa.</p>;
  }

  return (
    <div
      ref={canvasRef}
      onPointerDown={iniciarPan}
      className={cn("cursor-grab touch-none select-none overflow-hidden bg-muted/20 active:cursor-grabbing",
        // Tela cheia abaixo da barra de abas (h-10) e abaixo dos painéis (z-50),
        // pra o card da atividade ainda abrir por cima do mapa.
        telaCheia ? "fixed inset-0 z-[45] bg-background" : "relative h-[calc(100vh-15rem)] min-h-[420px] rounded-lg border")}
      style={{
        backgroundImage: "radial-gradient(hsl(var(--muted-foreground) / 0.18) 1px, transparent 1px)",
        backgroundSize: `${24 * visao.escala}px ${24 * visao.escala}px`,
        backgroundPosition: `${visao.x}px ${visao.y}px`,
      }}
    >
      <div
        ref={conteudoRef}
        className="absolute left-0 top-0 grid origin-top-left gap-12"
        style={{ transform: `translate(${visao.x}px, ${visao.y}px) scale(${visao.escala})`, gridTemplateColumns: `repeat(${porLinha}, max-content)` }}
      >
        {porProjeto.map(({ projeto, colunas, grupos, abertas, atrasadas }) => (
          <section key={projeto.id} className="rounded-2xl border bg-card p-4 shadow-sm">
            <header className="mb-3 flex items-center gap-3 px-1">
              <h3 className="text-lg font-semibold">{projeto.nome}</h3>
              <span className="text-xs text-muted-foreground">{abertas} em aberto</span>
              {atrasadas > 0 && (
                <span className="flex items-center gap-1 rounded bg-destructive/15 px-1.5 py-0.5 text-xs font-medium text-destructive">
                  <AlertTriangle className="h-3 w-3" />{atrasadas} atrasada{atrasadas > 1 ? "s" : ""}
                </span>
              )}
            </header>
            <div className="flex items-start gap-3">
              {colunas.map((coluna) => {
                const lista = grupos.get(coluna.status_key) || [];
                const visiveis = coluna.eh_conclusao ? lista.slice(-MAX_CONCLUIDAS) : lista;
                const ehAlvo = arrasto?.alvo?.statusKey === coluna.status_key && arrasto.alvo.clienteId === projeto.id;
                const alvoInvalido = ehAlvo && arrasto?.atividade.cliente_id !== projeto.id;
                return (
                  <div
                    key={coluna.status_key}
                    data-mapa-coluna={coluna.status_key}
                    data-cliente={projeto.id}
                    className={cn("flex min-h-24 flex-col gap-1.5 rounded-xl bg-muted/50 p-2 transition-colors",
                      ehAlvo && !alvoInvalido && "bg-primary/15 ring-2 ring-primary/50", alvoInvalido && "bg-destructive/10")}
                    style={{ width: LARGURA_COLUNA }}
                  >
                    <p className="group/col flex items-center justify-between gap-1 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <span className="truncate">{coluna.nome}</span>
                      <span className="flex items-center gap-1 font-normal">
                        {onCriar && (
                          <button type="button" title={`Nova atividade em ${coluna.nome}`} onPointerDown={(e) => e.stopPropagation()}
                            onClick={() => { setCriandoEm({ clienteId: projeto.id, statusKey: coluna.status_key }); setNovoTitulo(""); }}
                            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground opacity-60 hover:bg-primary hover:text-primary-foreground hover:opacity-100 group-hover/col:opacity-100">
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {lista.length}
                      </span>
                    </p>
                    {onCriar && criandoEm?.clienteId === projeto.id && criandoEm.statusKey === coluna.status_key && (
                      <form onPointerDown={(e) => e.stopPropagation()} className="select-text"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const t = novoTitulo.trim();
                          if (!t || salvandoNova) return;
                          setSalvandoNova(true);
                          void onCriar(projeto.id, coluna.status_key, t).then(() => setNovoTitulo("")).catch(() => {}).finally(() => setSalvandoNova(false));
                        }}>
                        <input autoFocus value={novoTitulo} onChange={(e) => setNovoTitulo(e.target.value)} disabled={salvandoNova}
                          onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") setCriandoEm(null); }}
                          onBlur={() => { if (!novoTitulo.trim()) setCriandoEm(null); }}
                          placeholder="Título e Enter (Esc fecha)"
                          className="w-full rounded-lg border border-primary/50 bg-background px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
                      </form>
                    )}
                    {visiveis.map((atividade, i) => {
                      const atrasada = estaAtrasadaMapa(atividade, hojeIso);
                      const apagada = soAtrasadas && !atrasada;
                      const linhaAntes = ehAlvo && !alvoInvalido && arrasto?.alvo?.indice === i && arrasto.atividade.id !== atividade.id;
                      return (
                        <div key={atividade.id}>
                          {linhaAntes && <div className="mb-1.5 h-1 rounded-full bg-primary" />}
                          <div
                            data-mapa-card={atividade.id}
                            onPointerDown={(event) => iniciarArrastoCard(event, atividade)}
                            onClickCapture={(event) => { if (arrastouRef.current) { event.stopPropagation(); event.preventDefault(); } }}
                            className={cn("transition-opacity", apagada && "opacity-20", arrasto?.atividade.id === atividade.id && "opacity-30")}
                          >
                            <KanbanCard
                              id={atividade.id}
                              titulo={atividade.titulo}
                              descricao={atividade.descricao}
                              concluida={atividade.concluida}
                              prioridade={atividade.prioridade}
                              dataVencimento={atividade.data_vencimento}
                              dataInicio={atividade.data_inicio}
                              tempoEstimado={atividade.tempo_estimado}
                              timerIniciadoEm={atividade.timer_iniciado_em}
                              timerDecorridoSegundos={atividade.timer_decorrido_segundos ?? 0}
                              responsavelNome={atividade.responsavel_nome}
                              alarmeEm={atividade.alarme_em}
                              checklist={checklistPorAtividade?.[atividade.id]}
                              onClick={() => onAbrir(atividade)}
                              onToggleConcluida={(_, concluida) => onConcluir(atividade, concluida)}
                              onIniciarTimer={timer?.iniciar ?? (() => {})}
                              onPausarTimer={timer?.pausar ?? (() => {})}
                              onZerarTimer={timer?.zerar ?? (() => {})}
                              onTimerFinalizado={timer?.finalizado ?? (() => {})}
                            />
                          </div>
                        </div>
                      );
                    })}
                    {ehAlvo && !alvoInvalido && arrasto?.alvo && arrasto.alvo.indice >= visiveis.filter((x) => x.id !== arrasto.atividade.id).length && (
                      <div className="h-1 rounded-full bg-primary" />
                    )}
                    {coluna.eh_conclusao && lista.length > MAX_CONCLUIDAS && (
                      <p className="px-1 text-[11px] text-muted-foreground">+{lista.length - MAX_CONCLUIDAS} concluídas</p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* Controles: zoom, enquadrar tudo e destacar atrasadas. */}
      <div className="absolute left-3 top-3 z-10 flex items-center gap-1 rounded-lg border bg-background/95 p-1 shadow-sm" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" onClick={() => zoomBotao(1 / 1.2)} className="rounded p-1.5 hover:bg-muted" title="Afastar (⌘−)" aria-label="Diminuir zoom"><Minus className="h-4 w-4" /></button>
        <span className="w-12 text-center text-xs tabular-nums">{Math.round(visao.escala * 100)}%</span>
        <button type="button" onClick={() => zoomBotao(1.2)} className="rounded p-1.5 hover:bg-muted" title="Aproximar (⌘=)" aria-label="Aumentar zoom"><Plus className="h-4 w-4" /></button>
        <button type="button" onClick={ajustar} className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium hover:bg-muted" title="Ver tudo (⌘0)" aria-label="Ver tudo"><Maximize className="h-3.5 w-3.5" />Ver tudo</button>
        <span className="mx-1 h-5 w-px bg-border" />
        <button type="button" onClick={() => setSoAtrasadas((v) => !v)}
          className={cn("flex items-center gap-1 rounded px-2 py-1 text-xs font-medium", soAtrasadas ? "bg-destructive/15 text-destructive" : "hover:bg-muted")}>
          <AlertTriangle className="h-3.5 w-3.5" />Destacar atrasadas
        </button>
        <span className="mx-1 h-5 w-px bg-border" />
        <button type="button" onClick={() => setTelaCheia((v) => !v)} className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium hover:bg-muted"
          title={telaCheia ? "Sair da tela cheia (Esc)" : "Tela cheia"}>
          {telaCheia ? <Shrink className="h-3.5 w-3.5" /> : <Expand className="h-3.5 w-3.5" />}{telaCheia ? "Sair" : "Tela cheia"}
        </button>
      </div>
      <p className="pointer-events-none absolute right-3 top-4 text-[11px] text-muted-foreground">Arraste o fundo para navegar · pinça, ⌘+roda ou ⌘− / ⌘= para zoom</p>

      {/* Portal pro body: dentro da guia a prévia ficaria deslocada do mouse. */}
      {arrasto && createPortal(
        <div className="pointer-events-none fixed z-[300] rounded-lg border bg-background p-2 text-sm shadow-xl"
          style={{ left: arrasto.x + 10, top: arrasto.y + 10, width: LARGURA_COLUNA - 16 }}>
          <p className="line-clamp-2">{arrasto.atividade.titulo}</p>
          {arrasto.alvo && arrasto.alvo.clienteId !== arrasto.atividade.cliente_id && (
            <p className="mt-1 text-[11px] text-destructive">Só dá pra mover dentro do mesmo projeto</p>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
