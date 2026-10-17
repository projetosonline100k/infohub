import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AlertTriangle, CheckCircle2, ChevronDown, ClipboardList, Clock, Hand, Lightbulb, Loader2, MessageCircle, Mic, Plus, Rocket, Square, Trash2, X } from "lucide-react";
import { ConversaEntrega } from "./ConversaEntrega";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { isDesktop } from "@/lib/platform";
import { useGravarAudio } from "@/hooks/useGravarAudio";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Kanban de melhorias do Infopro, dentro da janela do Pedro (pedido do Davi,
// 15/10/2026): as ideias que ele traz; o que o Davi arrasta pra "Pode fazer"
// o Pedro implementa sozinho (ouvinte, linha "melhorias"). O app só move entre
// Ideias / Pode fazer / Descartada; Fazendo, Feito e Erro são do Pedro.
// Pendências (16/10): quando depende do Davi, o Pedro para e lista o que falta
// (um check por item) e os dois conversam ali; "Pode continuar" volta pra fila.
// Rodada (16/10): das 8h às 22h, a cada 30 min, o Pedro traz até 5 ideias
// sozinho; cartão novo tem o selo NOVO até o Davi abrir (visto_em). A coluna
// "Não é prioridade agora" (adiada) guarda ideia sem descartar.
// Falta reiniciar (16/10): mudança no ouvinte/Danilo/Roy só roda depois de
// reiniciar o serviço; o cartão fica âmbar no Feito até o serviço voltar
// (servicos_sinal.iniciado_em mais novo que o concluido_em).
const db = supabase as unknown as SupabaseClient;   // melhorias_sistema ainda não está nos tipos gerados

type Status = "ideia" | "pode_fazer" | "fazendo" | "pendente" | "feito" | "descartada" | "erro" | "adiada";
interface Pendencia { texto: string; feito: boolean }
interface Melhoria {
  id: string; titulo: string; problema: string | null; porque: string | null; sugestao: string | null;
  impacto: number | null; esforco: number | null; status: Status; origem: "pedro" | "davi"; ordem: number;
  agora: string | null; progresso: number | null; resultado: string | null; commit_sha: string | null; notas: string | null;
  briefing: string | null; pendencias: Pendencia[] | null; reiniciar: string[] | null;
  criado_em: string; concluido_em: string | null; visto_em: string | null;
}
const COLUNAS: { status: Status; titulo: string; icone: typeof Lightbulb; ajuda: string; podeSoltar: boolean }[] = [
  { status: "ideia", titulo: "Ideias", icone: Lightbulb, ajuda: "o que o Pedro (ou você) sugeriu", podeSoltar: true },
  { status: "pode_fazer", titulo: "Pode fazer", icone: Rocket, ajuda: "arraste pra cá: ele implementa sozinho", podeSoltar: true },
  { status: "fazendo", titulo: "Fazendo", icone: Loader2, ajuda: "o Pedro está implementando", podeSoltar: false },
  { status: "pendente", titulo: "Pendências", icone: Hand, ajuda: "depende de você: marque e converse com ele", podeSoltar: false },
  { status: "feito", titulo: "Feito", icone: CheckCircle2, ajuda: "já está no sistema", podeSoltar: false },
  { status: "adiada", titulo: "Não é prioridade agora", icone: Clock, ajuda: "guardadas pra depois; arraste de volta quando quiser", podeSoltar: true },
];
const MOVEIS: Status[] = ["ideia", "pode_fazer", "erro", "descartada", "adiada"];
const ehNova = (m: Melhoria) => m.origem === "pedro" && !m.visto_em;
const NIVEL = ["", "baixo", "médio", "alto"];
// Ganho rápido (16/10): na coluna Ideias, as que o Davi escreveu vêm primeiro;
// depois as do Pedro por impacto (maior antes) e esforço (menor antes); empate
// fica na ordem de sempre (ordem/data). Sem nota conta como médio.
const ganhoRapido = (m: Melhoria) => m.impacto === 3 && m.esforco === 1;
const ordenarIdeias = (xs: Melhoria[]) => xs
  .map((m, i) => ({ m, i }))
  .sort((a, b) => (a.m.origem === "davi" ? 0 : 1) - (b.m.origem === "davi" ? 0 : 1)
    || (b.m.impacto ?? 2) - (a.m.impacto ?? 2)
    || (a.m.esforco ?? 2) - (b.m.esforco ?? 2)
    || a.i - b.i)
  .map(({ m }) => m);
const NOME_SERVICO: Record<string, string> = { ouvinte: "o ouvinte do Atlas", danilo: "o serviço do Danilo", roy: "o serviço do Roy" };
// Serviços que a melhoria mexeu e que ainda estão no ar desde antes dela ficar pronta.
const faltaReiniciar = (m: Melhoria, ligados: Record<string, string>) =>
  m.status !== "feito" || !m.concluido_em ? [] :
    (m.reiniciar ?? []).filter((s) => !ligados[s] || new Date(ligados[s]) < new Date(m.concluido_em!));

export function KanbanMelhorias({ clienteId }: { clienteId: string }) {
  const [itens, setItens] = useState<Melhoria[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aberta, setAberta] = useState<string | null>(null);
  const [nova, setNova] = useState("");
  const [verDescartadas, setVerDescartadas] = useState(false);
  const [lendo, setLendo] = useState<Melhoria | null>(null);
  const [conversa, setConversa] = useState<Melhoria | null>(null);
  const [pedroId, setPedroId] = useState<string | null>(null);
  useEffect(() => {
    void db.from("membros").select("id").eq("cliente_id", clienteId).eq("eh_ia", true).ilike("nome", "pedro").limit(1)
      .then(({ data }) => setPedroId(data?.[0]?.id ?? null));
  }, [clienteId]);
  const [lidos, setLidos] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem("melhorias-briefing-lidos") || "[]"); } catch { return []; } });
  const abrirBriefing = (m: Melhoria) => {
    setLendo(m);
    if (!lidos.includes(m.id)) {
      const n = [...lidos, m.id];
      setLidos(n);
      try { localStorage.setItem("melhorias-briefing-lidos", JSON.stringify(n)); } catch { /* sem storage */ }
    }
  };

  const carregar = useCallback(async () => {
    const { data } = await db.from("melhorias_sistema").select("*").eq("cliente_id", clienteId).order("ordem").order("criado_em", { ascending: false });
    setItens((data || []) as Melhoria[]);
    setCarregando(false);
  }, [clienteId]);
  useEffect(() => { void carregar(); }, [carregar]);
  // Com algo em andamento (ou na fila), acompanha o Pedro; parado, confere de
  // minuto em minuto as ideias que ele traz sozinho nas rodadas.
  const ativo = itens.some((m) => m.status === "fazendo" || m.status === "pode_fazer" || m.status === "pendente");
  useEffect(() => {
    const t = window.setInterval(() => void carregar(), ativo ? 8000 : 60000);
    return () => window.clearInterval(t);
  }, [ativo, carregar]);
  // Quando cada serviço ligou (servicos_sinal): "pedro_rodada" = última rodada
  // de ideias; ouvinte/danilo/roy = conferir se falta reiniciar.
  const [ligados, setLigados] = useState<Record<string, string>>({});
  useEffect(() => {
    void db.from("servicos_sinal").select("servico, iniciado_em")
      .then(({ data }) => setLigados(Object.fromEntries(((data || []) as { servico: string; iniciado_em: string | null }[])
        .filter((s) => s.iniciado_em).map((s) => [s.servico, s.iniciado_em as string]))));
  }, [itens]);
  const ultimaRodada = ligados.pedro_rodada ?? null;
  // Abrir o cartão tira o selo NOVO.
  const abrir = (m: Melhoria) => {
    setAberta(aberta === m.id ? null : m.id);
    if (!ehNova(m)) return;
    const visto_em = new Date().toISOString();
    setItens((xs) => xs.map((x) => (x.id === m.id ? { ...x, visto_em } : x)));
    void db.from("melhorias_sistema").update({ visto_em }).eq("id", m.id);
  };

  const mover = async (id: string, status: Status) => {
    const m = itens.find((x) => x.id === id);
    if (!m || m.status === status) return;
    if (m.status === "fazendo") { toast("O Pedro já está implementando essa."); return; }
    setItens((xs) => xs.map((x) => (x.id === id ? { ...x, status } : x)));
    const { error } = await db.from("melhorias_sistema").update({ status }).eq("id", id);
    if (error) { toast.error("Não consegui mover"); void carregar(); return; }
    if (status === "pode_fazer") toast.success(m.status === "pendente" ? "Pronto: o Pedro continua de onde parou" : "Liberado: o Pedro começa a implementar (uma de cada vez)");
    if (status === "adiada") toast("Guardada em Não é prioridade agora");
  };
  // "Liberar as 3 de cima": as 3 primeiras da coluna Ideias (já em ordem de
  // ganho rápido) vão juntas pra Pode fazer; o Pedro faz uma de cada vez.
  const liberarTopo = async (ids: string[]) => {
    if (!ids.length || !window.confirm(`Liberar ${ids.length === 1 ? "a ideia de cima" : `as ${ids.length} ideias de cima`} para o Pedro implementar?`)) return;
    setItens((xs) => xs.map((x) => (ids.includes(x.id) ? { ...x, status: "pode_fazer" } : x)));
    const { error } = await db.from("melhorias_sistema").update({ status: "pode_fazer" }).in("id", ids);
    if (error) { toast.error("Não consegui liberar"); void carregar(); return; }
    toast.success(`${ids.length === 1 ? "Liberada" : `${ids.length} liberadas`}: o Pedro implementa uma de cada vez`);
  };
  // × no cartão: ideia vai pra descartadas; descartada sai de vez.
  const apagar = async (m: Melhoria) => {
    if (m.status === "descartada") {
      if (!window.confirm(`Apagar de vez "${m.titulo}"?`)) return;
      setItens((xs) => xs.filter((x) => x.id !== m.id));
      const { error } = await db.from("melhorias_sistema").delete().eq("id", m.id);
      if (error) { toast.error("Não consegui apagar"); void carregar(); }
      return;
    }
    await mover(m.id, "descartada");
    toast("Ideia descartada", { action: { label: "Desfazer", onClick: () => void mover(m.id, m.status) } });
  };
  // Arrastar com @hello-pangea/dnd (o mesmo do kanban de Atividades): o arrastar
  // nativo do navegador não funciona dentro da janela do app no Mac (15/10).
  const soltar = (r: DropResult) => { if (r.destination) void mover(r.draggableId, r.destination.droppableId as Status); };
  const criar = async () => {
    const titulo = nova.trim();
    if (!titulo) return;
    const { error } = await db.from("melhorias_sistema").insert({ id: crypto.randomUUID(), cliente_id: clienteId, titulo, origem: "davi" });
    if (error) { toast.error("Não consegui criar"); return; }
    setNova("");
    void carregar();
  };

  const erros = itens.filter((m) => m.status === "erro");
  const descartadas = itens.filter((m) => m.status === "descartada");
  const novas = itens.filter(ehNova).length;

  const cartao = (m: Melhoria, i: number) => {
    const movel = MOVEIS.includes(m.status);
    return (
      <Draggable key={m.id} draggableId={m.id} index={i} isDragDisabled={!movel || aberta === m.id}>
        {(dp, snap) => {
          const no = (
            <div ref={dp.innerRef} {...dp.draggableProps} {...dp.dragHandleProps} style={dp.draggableProps.style}>
              <CartaoMelhoria m={m} aberto={aberta === m.id} onAbrir={() => abrir(m)} arrastando={snap.isDragging}
                onMover={(st) => void mover(m.id, st)} onMudou={() => void carregar()}
                briefingNovo={!!m.briefing && !lidos.includes(m.id)} onBriefing={() => abrirBriefing(m)} reiniciar={faltaReiniciar(m, ligados)}
                onApagar={() => void apagar(m)} onConversar={() => setConversa(m)} />
            </div>
          );
          // Arrastando: desenha direto no body (a janela por cima desloca o cartão).
          return snap.isDragging ? createPortal(no, document.body) : no;
        }}
      </Draggable>
    );
  };
  const lista = (status: Status, itensDaLista: Melhoria[], podeSoltar: boolean, classe: string, vazio?: React.ReactNode, topo?: React.ReactNode) => (
    <Droppable droppableId={status} isDropDisabled={!podeSoltar}>
      {(p, snap) => (
        <div ref={p.innerRef} {...p.droppableProps} className={cn(classe, snap.isDraggingOver && "border-primary bg-primary/10")}>
          {topo}
          {itensDaLista.map(cartao)}
          {p.placeholder}
          {itensDaLista.length === 0 && vazio}
        </div>
      )}
    </Droppable>
  );

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Melhorias do Infopro</p>
        <span className="text-[11px] text-muted-foreground">Arraste uma ideia para <b>Pode fazer</b> e o Pedro implementa sozinho.</span>
        {novas > 0 && <span className="rounded-full bg-fuchsia-600 px-2 py-0.5 text-[10px] font-bold text-white">{novas} {novas === 1 ? "NOVA" : "NOVAS"}</span>}
        <span className="ml-auto text-[10px] text-muted-foreground" title="Das 8h às 22h, a cada 30 min, com o Mac ligado">
          {ultimaRodada ? `Pedro buscou ideias às ${format(new Date(ultimaRodada), "HH:mm", { locale: ptBR })} · busca a cada 30 min (8h–22h)` : "Pedro busca ideias a cada 30 min (8h–22h)"}
        </span>
      </div>
      {carregando ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <DragDropContext onDragEnd={soltar}>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-6">
            {COLUNAS.map((c) => {
              const daColuna = c.status === "ideia" ? ordenarIdeias(itens.filter((m) => m.status === "ideia")) : itens.filter((m) => m.status === c.status);
              const Icone = c.icone;
              return (
                <div key={c.status} className={cn("flex min-h-[180px] flex-col gap-1.5 rounded-xl border bg-muted/30 p-2", c.status === "pode_fazer" && "border-amber-500/40",
                  c.status === "pendente" && daColuna.length > 0 && "border-orange-500/50 bg-orange-500/5", c.status === "adiada" && "border-dashed")}>
                  <p className="flex items-center gap-1 text-xs font-semibold">
                    <Icone className={cn("h-3.5 w-3.5", c.status === "fazendo" && daColuna.length > 0 && "animate-spin text-sky-500")} />{c.titulo}
                    <span className="font-normal text-muted-foreground">{daColuna.length}</span>
                  </p>
                  <p className="-mt-1 text-[10px] text-muted-foreground">{c.ajuda}</p>
                  {c.status === "ideia" && (
                    <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); void criar(); }}>
                      <Input value={nova} onChange={(e) => setNova(e.target.value)} placeholder="Sua ideia…" className="h-7 text-xs" />
                      <Button type="submit" size="icon" variant="ghost" className="h-7 w-7 shrink-0" disabled={!nova.trim()}><Plus className="h-3.5 w-3.5" /></Button>
                    </form>
                  )}
                  {c.status === "ideia" && daColuna.length > 1 && (
                    <button type="button" onClick={() => void liberarTopo(daColuna.slice(0, 3).map((m) => m.id))}
                      title="Em cima ficam as de impacto alto e esforço baixo" className="flex items-center gap-1 self-start text-[10px] text-muted-foreground hover:text-primary">
                      <Rocket className="h-3 w-3" />Liberar as {Math.min(3, daColuna.length)} de cima
                    </button>
                  )}
                  {lista(c.status, daColuna, c.podeSoltar, "flex min-h-[90px] max-h-[440px] flex-1 flex-col gap-1.5 overflow-y-auto overscroll-contain rounded-lg border border-transparent pr-0.5 transition-colors",
                    c.status !== "ideia" ? <p className="py-3 text-center text-[11px] text-muted-foreground">{c.podeSoltar ? "solte aqui" : "—"}</p> : null)}
                </div>
              );
            })}
          </div>
          {erros.length > 0 && (
            <div className="space-y-1.5 rounded-xl border border-rose-500/30 bg-rose-500/5 p-2">
              <p className="flex items-center gap-1 text-xs font-semibold text-rose-600 dark:text-rose-400"><AlertTriangle className="h-3.5 w-3.5" />Não deu ({erros.length}) · abra para ver o motivo; arraste para Pode fazer para tentar de novo</p>
              {lista("erro", erros, false, "grid max-h-[260px] gap-1.5 overflow-y-auto rounded-lg border border-transparent sm:grid-cols-2")}
            </div>
          )}
          {descartadas.length > 0 && (
            <div>
              <button type="button" onClick={() => setVerDescartadas(!verDescartadas)} className="text-[11px] text-muted-foreground hover:text-foreground">
                {verDescartadas ? "Esconder" : "Ver"} descartadas ({descartadas.length})
              </button>
              {verDescartadas && lista("descartada", descartadas, true, "mt-1.5 grid max-h-[260px] gap-1.5 overflow-y-auto rounded-lg border border-transparent sm:grid-cols-2")}
            </div>
          )}
          </DragDropContext>
          <Dialog open={!!conversa} onOpenChange={(a) => { if (!a) setConversa(null); }}>
            <DialogContent className="flex max-h-[88vh] max-w-xl flex-col">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><MessageCircle className="h-5 w-5 text-primary" />Pedro · {conversa?.titulo}</DialogTitle>
                <DialogDescription>Tire dúvidas sobre as pendências. Quando resolver, diga a ele (ou clique em "Pronto, pode continuar").</DialogDescription>
              </DialogHeader>
              {conversa && pedroId ? (
                <div className="min-h-[360px] flex-1 overflow-hidden">
                  <ConversaEntrega clienteId={clienteId} melhoriaId={conversa.id} membroId={pedroId} nome="Pedro"
                    textoInicial={conversa.status === "pendente" ? "Sobre as pendências: " : ""} onDocumentoMudou={() => void carregar()} />
                </div>
              ) : <p className="text-sm text-muted-foreground">Não achei o Pedro neste projeto.</p>}
            </DialogContent>
          </Dialog>
          <Dialog open={!!lendo} onOpenChange={(a) => { if (!a) setLendo(null); }}>
            <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-primary" />{lendo?.titulo}</DialogTitle>
                <DialogDescription>Briefing do Pedro{lendo?.concluido_em ? ` · ${format(new Date(lendo.concluido_em), "d 'de' MMMM, HH:mm", { locale: ptBR })}` : ""}</DialogDescription>
              </DialogHeader>
              <TextoBriefing texto={lendo?.briefing ?? lendo?.resultado ?? ""} />
            </DialogContent>
          </Dialog>
        </>
      )}
    </section>
  );
}

// Cartão do kanban. Fora do componente do quadro: assim o que o Davi está
// escrevendo nos detalhes não some quando o quadro atualiza sozinho.
function CartaoMelhoria({ m, aberto, onAbrir, arrastando, onMover, onMudou, briefingNovo, onBriefing, onApagar, onConversar, reiniciar }: {
  m: Melhoria; aberto: boolean; onAbrir: () => void; arrastando: boolean; onMover: (status: Status) => void; onMudou: () => void;
  briefingNovo: boolean; onBriefing: () => void; onApagar: () => void; onConversar: () => void; reiniciar: string[];
}) {
  const pendencias = m.pendencias ?? [];
  const marcar = async (i: number) => {
    const nova = pendencias.map((p, j) => (j === i ? { ...p, feito: !p.feito } : p));
    const { error } = await db.from("melhorias_sistema").update({ pendencias: nova }).eq("id", m.id);
    if (error) { toast.error("Não consegui marcar"); return; }
    onMudou();
  };
  const movel = MOVEIS.includes(m.status);
  const nova = ehNova(m);
  const editavel = m.status !== "fazendo" && m.status !== "feito";
  const [notas, setNotas] = useState(m.notas ?? "");
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { setNotas(m.notas ?? ""); }, [m.notas]);
  const salvar = async (valor: string) => {
    setSalvando(true);
    const { error } = await db.from("melhorias_sistema").update({ notas: valor.trim() || null }).eq("id", m.id);
    setSalvando(false);
    if (error) { toast.error("Não consegui salvar os detalhes"); return; }
    toast.success("Detalhes salvos: o Pedro lê antes de implementar");
    onMudou();
  };
  // Áudio: a fala transcrita entra nos detalhes e já salva.
  const audio = useGravarAudio((texto) => {
    const novo = [notas.trim(), `🎙️ ${texto}`].filter(Boolean).join("\n\n");
    setNotas(novo);
    void salvar(novo);
  });
  return (
    <div
      className={cn("group relative rounded-lg border bg-card p-2 text-xs shadow-sm", m.status === "pendente" && "border-orange-500/50", movel && !aberto && "cursor-grab active:cursor-grabbing", arrastando && "rotate-1 shadow-xl ring-2 ring-primary",
        m.status === "erro" && "border-rose-500/40", reiniciar.length > 0 && "border-amber-500/60 bg-amber-500/5", nova && "border-fuchsia-500/60 bg-fuchsia-500/5", aberto && "ring-1 ring-primary/40")}>
      {(m.status === "ideia" || m.status === "descartada") && !aberto && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onApagar(); }} title={m.status === "descartada" ? "Apagar de vez" : "Descartar"}
          className="absolute -right-1.5 -top-1.5 z-10 hidden h-5 w-5 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm hover:bg-rose-500 hover:text-white group-hover:flex">
          <X className="h-3 w-3" />
        </button>
      )}
      <button type="button" onClick={onAbrir} className="flex w-full items-start gap-1 text-left">
        <span className="min-w-0 flex-1 break-words text-[13px] font-medium leading-snug">{m.titulo}</span>
        <ChevronDown className={cn("mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", aberto && "rotate-180")} />
      </button>
      <p className="mt-1 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
        {nova && <span className="rounded bg-fuchsia-600 px-1 font-bold text-white" title={`Chegou ${format(new Date(m.criado_em), "d/MM 'às' HH:mm")}; some quando você abre`}>NOVO</span>}
        {m.origem === "davi" && <span className="rounded bg-primary/10 px-1 text-primary">sua ideia</span>}
        {ganhoRapido(m) && <span className="rounded bg-emerald-600 px-1 font-bold text-white" title="Impacto alto e esforço baixo: rende muito e sai rápido">ganho rápido</span>}
        {m.notas && <span className="rounded bg-amber-500/15 px-1 text-amber-700 dark:text-amber-300">com seus detalhes</span>}
        {m.impacto && <span>impacto {NIVEL[m.impacto]}</span>}
        {m.esforco && <span>· esforço {NIVEL[m.esforco]}</span>}
      </p>
      {reiniciar.length > 0 && (
        <p className="mt-1.5 flex items-start gap-1 rounded-md bg-amber-500/15 px-2 py-1 text-[11px] font-medium leading-snug text-amber-800 dark:text-amber-300"
          title="A mudança está no código, mas o serviço no ar é de antes dela. O aviso some sozinho quando ele reiniciar.">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />Ainda não está rodando: falta reiniciar {reiniciar.map((s) => NOME_SERVICO[s] ?? s).join(" e ")}
        </p>
      )}
      {m.status === "feito" && (m.briefing || m.resultado) && (
        <button type="button" onClick={onBriefing}
          className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300">
          <ClipboardList className="h-3 w-3" />Ver o briefing
          {briefingNovo && <span className="rounded-full bg-emerald-600 px-1.5 text-[9px] font-bold text-white">novo</span>}
        </button>
      )}
      {m.status === "pendente" && (
        <div className="mt-1.5 space-y-1">
          {m.resultado && <p className="text-[11px] text-orange-700 dark:text-orange-300">{m.resultado}</p>}
          {pendencias.map((p, i) => (
            <label key={i} className="flex cursor-pointer items-start gap-1.5 text-[11px] leading-snug" onMouseDown={(e) => e.stopPropagation()}>
              <input type="checkbox" checked={p.feito} onChange={() => void marcar(i)} className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-emerald-600" />
              <span className={cn(p.feito && "text-muted-foreground line-through")}>{p.texto}</span>
            </label>
          ))}
          <div className="flex flex-wrap gap-1 pt-0.5">
            <Button type="button" size="sm" variant="outline" className="h-7 gap-1 px-2 text-[11px]" onClick={onConversar}><MessageCircle className="h-3 w-3" />Conversar com o Pedro</Button>
            <Button type="button" size="sm" className="h-7 gap-1 px-2 text-[11px]" onClick={() => onMover("pode_fazer")}
              disabled={pendencias.length > 0 && !pendencias.every((p) => p.feito)} title="Marque tudo o que fez para liberar">
              <Rocket className="h-3 w-3" />Pronto, pode continuar
            </Button>
          </div>
        </div>
      )}
      {m.status === "fazendo" && (
        <div className="mt-1.5">
          <div className="h-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-sky-500 transition-all" style={{ width: `${m.progresso ?? 5}%` }} /></div>
          <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground"><Loader2 className="h-2.5 w-2.5 animate-spin" />{m.agora ?? "trabalhando"} · {m.progresso ?? 5}%</p>
        </div>
      )}
      {aberto && (
        <div className="mt-1.5 space-y-1.5 border-t pt-1.5 text-[11px] leading-relaxed">
          {m.problema && <p><b>Problema:</b> {m.problema}</p>}
          {m.porque && <p><b>Por que importa:</b> {m.porque}</p>}
          {m.sugestao && <p><b>Sugestão:</b> {m.sugestao}</p>}
          {editavel ? (
            <div className="space-y-1">
              <p className="font-semibold">Seus detalhes <span className="font-normal text-muted-foreground">(o Pedro segue isso ao implementar)</span></p>
              <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} className="min-h-0 text-[11px]"
                placeholder="Como você quer, onde fica na tela, exemplos…" disabled={audio.gravando || audio.transcrevendo} />
              <div className="flex items-center gap-1.5">
                {isDesktop() && (
                  <Button type="button" size="sm" variant={audio.gravando ? "destructive" : "outline"} className="h-7 gap-1 px-2 text-[11px]"
                    disabled={audio.transcrevendo} onClick={() => void audio.alternar()} title={audio.gravando ? "Parar e transcrever" : "Gravar um áudio com os detalhes"}>
                    {audio.transcrevendo ? <Loader2 className="h-3 w-3 animate-spin" /> : audio.gravando ? <><Square className="h-3 w-3 fill-current" />{audio.segundos}s</> : <><Mic className="h-3 w-3" />Áudio</>}
                  </Button>
                )}
                <Button type="button" size="sm" className="h-7 px-2 text-[11px]" disabled={salvando || notas.trim() === (m.notas ?? "").trim()} onClick={() => void salvar(notas)}>
                  {salvando ? <Loader2 className="h-3 w-3 animate-spin" /> : "Salvar detalhes"}
                </Button>
              </div>
            </div>
          ) : m.notas ? <p className="whitespace-pre-line"><b>Seus detalhes:</b> {m.notas}</p> : null}
          {m.resultado && <p className={m.status === "erro" ? "text-rose-600 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400"}><b>{m.status === "erro" ? "Não deu:" : "O que mudou:"}</b> {m.resultado}</p>}
          {m.concluido_em && <p className="text-muted-foreground">{format(new Date(m.concluido_em), "d MMM, HH:mm", { locale: ptBR })}{m.commit_sha ? ` · ${m.commit_sha}` : ""}</p>}
          {movel && (
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              {m.status !== "pode_fazer" && (
                <Button type="button" size="sm" className="h-7 gap-1 px-2 text-[11px]" onClick={() => onMover("pode_fazer")}><Rocket className="h-3 w-3" />Liberar para o Pedro</Button>
              )}
              {(m.status === "pode_fazer" || m.status === "adiada") && (
                <button type="button" onClick={() => onMover("ideia")} className="text-muted-foreground hover:text-foreground">Voltar para ideias</button>
              )}
              {m.status !== "adiada" && m.status !== "descartada" && (
                <button type="button" onClick={() => onMover("adiada")} className="flex items-center gap-1 text-muted-foreground hover:text-foreground"><Clock className="h-3 w-3" />Não é prioridade agora</button>
              )}
              {m.status !== "descartada" && (
                <button type="button" onClick={() => onMover("descartada")} className="flex items-center gap-1 text-muted-foreground hover:text-rose-600"><Trash2 className="h-3 w-3" />Descartar</button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Briefing do Pedro: texto simples; as linhas que abrem seção ("O que mudou",
// "Onde fica no app"…) viram títulos, e "1." / "-" viram listas.
const SECAO = /^(o que mudou|onde fica|como usar|o que testar|limites|pr[óo]ximos passos)/i;
function TextoBriefing({ texto }: { texto: string }) {
  const linhas = texto.split("\n");
  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {linhas.map((l, i) => {
        const t = l.trim().replace(/^#+\s*/, "").replace(/\*\*/g, "");
        if (!t) return <div key={i} className="h-1" />;
        if (SECAO.test(t) && t.length < 60) return <h3 key={i} className="pt-2 text-sm font-semibold text-primary">{t.replace(/:$/, "")}</h3>;
        if (/^(\d+[.)]|[-•])\s/.test(t)) return <p key={i} className="pl-4 -indent-3">{t}</p>;
        return <p key={i}>{t}</p>;
      })}
    </div>
  );
}
