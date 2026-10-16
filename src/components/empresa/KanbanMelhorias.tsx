import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AlertTriangle, CheckCircle2, ChevronDown, Lightbulb, Loader2, Mic, Plus, Rocket, Square, Trash2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
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
const db = supabase as unknown as SupabaseClient;   // melhorias_sistema ainda não está nos tipos gerados

type Status = "ideia" | "pode_fazer" | "fazendo" | "feito" | "descartada" | "erro";
interface Melhoria {
  id: string; titulo: string; problema: string | null; porque: string | null; sugestao: string | null;
  impacto: number | null; esforco: number | null; status: Status; origem: "pedro" | "davi"; ordem: number;
  agora: string | null; progresso: number | null; resultado: string | null; commit_sha: string | null; notas: string | null;
  criado_em: string; concluido_em: string | null;
}
const COLUNAS: { status: Status; titulo: string; icone: typeof Lightbulb; ajuda: string; podeSoltar: boolean }[] = [
  { status: "ideia", titulo: "Ideias", icone: Lightbulb, ajuda: "o que o Pedro (ou você) sugeriu", podeSoltar: true },
  { status: "pode_fazer", titulo: "Pode fazer", icone: Rocket, ajuda: "arraste pra cá: ele implementa sozinho", podeSoltar: true },
  { status: "fazendo", titulo: "Fazendo", icone: Loader2, ajuda: "o Pedro está implementando", podeSoltar: false },
  { status: "feito", titulo: "Feito", icone: CheckCircle2, ajuda: "já está no sistema", podeSoltar: false },
];
const NIVEL = ["", "baixo", "médio", "alto"];

export function KanbanMelhorias({ clienteId }: { clienteId: string }) {
  const [itens, setItens] = useState<Melhoria[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aberta, setAberta] = useState<string | null>(null);
  const [nova, setNova] = useState("");
  const [verDescartadas, setVerDescartadas] = useState(false);

  const carregar = useCallback(async () => {
    const { data } = await db.from("melhorias_sistema").select("*").eq("cliente_id", clienteId).order("ordem").order("criado_em", { ascending: false });
    setItens((data || []) as Melhoria[]);
    setCarregando(false);
  }, [clienteId]);
  useEffect(() => { void carregar(); }, [carregar]);
  // Com algo em andamento (ou na fila), acompanha o Pedro.
  const ativo = itens.some((m) => m.status === "fazendo" || m.status === "pode_fazer");
  useEffect(() => {
    if (!ativo) return;
    const t = window.setInterval(() => void carregar(), 8000);
    return () => window.clearInterval(t);
  }, [ativo, carregar]);

  const mover = async (id: string, status: Status) => {
    const m = itens.find((x) => x.id === id);
    if (!m || m.status === status) return;
    if (m.status === "fazendo") { toast("O Pedro já está implementando essa."); return; }
    setItens((xs) => xs.map((x) => (x.id === id ? { ...x, status } : x)));
    const { error } = await db.from("melhorias_sistema").update({ status }).eq("id", id);
    if (error) { toast.error("Não consegui mover"); void carregar(); return; }
    if (status === "pode_fazer") toast.success("Liberado: o Pedro começa a implementar (uma de cada vez)");
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

  const cartao = (m: Melhoria, i: number) => {
    const movel = m.status === "ideia" || m.status === "pode_fazer" || m.status === "erro" || m.status === "descartada";
    return (
      <Draggable key={m.id} draggableId={m.id} index={i} isDragDisabled={!movel || aberta === m.id}>
        {(dp, snap) => {
          const no = (
            <div ref={dp.innerRef} {...dp.draggableProps} {...dp.dragHandleProps} style={dp.draggableProps.style}>
              <CartaoMelhoria m={m} aberto={aberta === m.id} onAbrir={() => setAberta(aberta === m.id ? null : m.id)} arrastando={snap.isDragging}
                onMover={(st) => void mover(m.id, st)} onMudou={() => void carregar()} />
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
      </div>
      {carregando ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <DragDropContext onDragEnd={soltar}>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {COLUNAS.map((c) => {
              const daColuna = itens.filter((m) => m.status === c.status);
              const Icone = c.icone;
              return (
                <div key={c.status} className={cn("flex min-h-[180px] flex-col gap-1.5 rounded-xl border bg-muted/30 p-2", c.status === "pode_fazer" && "border-amber-500/40")}>
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
                  {lista(c.status, daColuna, c.podeSoltar, "flex min-h-[90px] flex-1 flex-col gap-1.5 rounded-lg border border-transparent transition-colors",
                    c.status !== "ideia" ? <p className="py-3 text-center text-[11px] text-muted-foreground">{c.podeSoltar ? "solte aqui" : "—"}</p> : null)}
                </div>
              );
            })}
          </div>
          {erros.length > 0 && (
            <div className="space-y-1.5 rounded-xl border border-rose-500/30 bg-rose-500/5 p-2">
              <p className="flex items-center gap-1 text-xs font-semibold text-rose-600 dark:text-rose-400"><AlertTriangle className="h-3.5 w-3.5" />Não deu ({erros.length}) · abra para ver o motivo; arraste para Pode fazer para tentar de novo</p>
              {lista("erro", erros, false, "grid gap-1.5 rounded-lg border border-transparent sm:grid-cols-2")}
            </div>
          )}
          {descartadas.length > 0 && (
            <div>
              <button type="button" onClick={() => setVerDescartadas(!verDescartadas)} className="text-[11px] text-muted-foreground hover:text-foreground">
                {verDescartadas ? "Esconder" : "Ver"} descartadas ({descartadas.length})
              </button>
              {verDescartadas && lista("descartada", descartadas, true, "mt-1.5 grid gap-1.5 rounded-lg border border-transparent sm:grid-cols-2")}
            </div>
          )}
          </DragDropContext>
        </>
      )}
    </section>
  );
}

// Cartão do kanban. Fora do componente do quadro: assim o que o Davi está
// escrevendo nos detalhes não some quando o quadro atualiza sozinho.
function CartaoMelhoria({ m, aberto, onAbrir, arrastando, onMover, onMudou }: {
  m: Melhoria; aberto: boolean; onAbrir: () => void; arrastando: boolean; onMover: (status: Status) => void; onMudou: () => void;
}) {
  const movel = m.status === "ideia" || m.status === "pode_fazer" || m.status === "erro" || m.status === "descartada";
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
      className={cn("rounded-lg border bg-card p-2 text-xs shadow-sm", movel && !aberto && "cursor-grab active:cursor-grabbing", arrastando && "rotate-1 shadow-xl ring-2 ring-primary",
        m.status === "erro" && "border-rose-500/40", aberto && "ring-1 ring-primary/40")}>
      <button type="button" onClick={onAbrir} className="flex w-full items-start gap-1 text-left">
        <span className="min-w-0 flex-1 break-words text-[13px] font-medium leading-snug">{m.titulo}</span>
        <ChevronDown className={cn("mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", aberto && "rotate-180")} />
      </button>
      <p className="mt-1 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
        {m.origem === "davi" && <span className="rounded bg-primary/10 px-1 text-primary">sua ideia</span>}
        {m.notas && <span className="rounded bg-amber-500/15 px-1 text-amber-700 dark:text-amber-300">com seus detalhes</span>}
        {m.impacto && <span>impacto {NIVEL[m.impacto]}</span>}
        {m.esforco && <span>· esforço {NIVEL[m.esforco]}</span>}
      </p>
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
              {m.status === "pode_fazer" && (
                <button type="button" onClick={() => onMover("ideia")} className="text-muted-foreground hover:text-foreground">Voltar para ideias</button>
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
