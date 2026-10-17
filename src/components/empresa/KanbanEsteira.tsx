import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import type { SupabaseClient } from "@supabase/supabase-js";
import { format } from "date-fns";
import { CheckCircle2, ChevronDown, Copy, Loader2, Plus, RotateCcw, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { criarAtividade } from "@/lib/atividades/criarAtividade";
import { colunasDoProjeto } from "@/lib/empresa/colunas";
import { CabecaBoneco } from "./BonecoMesa";
import { ConversaEntrega } from "./ConversaEntrega";
import { htmlLimpo } from "@/lib/conteudo/htmlLimpo";

// Esteira de um escritório (pedido do Davi, 17/10/2026): "o Leo cria as headlines,
// passa para o Junior, que escreve os roteiros, que passa para o Elias revisar; nesse
// kanban tenha o chat, porque eu vou ir instruindo o pessoal". Cada coluna é uma etapa
// (o rosto de quem faz); a peça anda sozinha (scripts/empresa/esteira.py + ouvinte).
// O Davi escreve ideias, lê, devolve ou descarta; o chat do trio fica ao lado.
const db = supabase as unknown as SupabaseClient;

// criterios: como o Davi quer o trabalho desta etapa (17/10); davi_aprova: a etapa para e espera ele passar adiante.
interface Etapa { nome: string; membro_id: string; criterios?: string; davi_aprova?: boolean }
interface Peca {
  id: string; titulo: string; textos: Record<string, string>; etapa: number; situacao: "fila" | "fazendo" | "feito" | "descartado";
  nota: string | null; atividade_id: string | null; atualizado_em: string; documento_id: string | null;
}
interface Membro { id: string; nome: string; eh_ia: boolean }

export function KanbanEsteira({ clienteId, setorId, aberto, onFechar }: { clienteId: string; setorId: string | null; aberto: boolean; onFechar: () => void }) {
  const [setor, setSetor] = useState<{ nome: string; esteira: Etapa[] } | null>(null);
  const [membros, setMembros] = useState<Membro[]>([]);
  const [pecas, setPecas] = useState<Peca[]>([]);
  const [progresso, setProgresso] = useState<Map<string, number>>(new Map());
  const [ideia, setIdeia] = useState("");
  const [abertaId, setAbertaId] = useState<string | null>(null);
  const [conversaTarefa, setConversaTarefa] = useState<string | null>(null);
  // Clicou num cartão (ou no topo da coluna): o chat vira só com quem faz aquela etapa (17/10:
  // "se eu clicar num bloco do Leo, a mensagem é para ele, em vez de falar com os três").
  const [foco, setFoco] = useState<{ membroId: string; peca?: Peca } | null>(null);
  const [conversaDe, setConversaDe] = useState<Record<string, string>>({});
  // Documento da peça aberto no lugar do quadro, com o chat de quem faz ao lado (17/10: "quando o Junior
  // for escrever, eu queria conseguir ver, conversar com ele mesmo").
  const [docAberto, setDocAberto] = useState<Peca | null>(null);
  const [criteriosDe, setCriteriosDe] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    if (!setorId) return;
    const [{ data: s }, { data: ps }] = await Promise.all([
      db.from("setores").select("nome, esteira").eq("id", setorId).maybeSingle(),
      db.from("esteira_itens").select("id, titulo, textos, etapa, situacao, nota, atividade_id, atualizado_em, documento_id")
        .eq("setor_id", setorId).neq("situacao", "descartado").order("ordem").order("criado_em"),
    ]);
    const st = s as { nome: string; esteira: Etapa[] | null } | null;
    setSetor(st ? { nome: st.nome, esteira: st.esteira ?? [] } : null);
    const lista = (ps || []) as Peca[];
    setPecas(lista);
    const ids = (st?.esteira ?? []).map((e) => e.membro_id);
    if (ids.length) {
      const { data: ms } = await supabase.from("membros").select("id, nome, eh_ia").in("id", ids);
      setMembros((ms || []) as Membro[]);
    }
    const tarefas = lista.map((p) => p.atividade_id).filter(Boolean) as string[];
    if (tarefas.length) {
      const { data: ts } = await supabase.from("atividades").select("id, progresso").in("id", tarefas);
      setProgresso(new Map(((ts || []) as { id: string; progresso: number | null }[]).map((t) => [t.id, t.progresso ?? 0])));
    }
  }, [setorId]);

  useEffect(() => {
    if (!aberto || !setorId) return;
    void carregar();
    const canal = supabase.channel(`esteira-${setorId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "esteira_itens", filter: `setor_id=eq.${setorId}` }, () => void carregar())
      .subscribe();
    const t = window.setInterval(() => void carregar(), 20_000);   // progresso das tarefas
    return () => { void supabase.removeChannel(canal); window.clearInterval(t); };
  }, [aberto, setorId, carregar]);

  // A conversa do trio fica numa tarefa-âncora do escritório (criada na 1ª vez, já concluída).
  // Cada conversa (o grupo, ou só com um deles) fica numa tarefa-âncora do escritório (criada na 1ª vez, já concluída).
  const ancora = useCallback(async (membroId: string | null) => {
    if (!setorId || !setor?.esteira.length) return null;
    const marca = membroId ? `ESTEIRA_CHAT:${setorId}:${membroId}` : `ESTEIRA_CHAT:${setorId}`;
    const { data } = await supabase.from("atividades").select("id, descricao").eq("cliente_id", clienteId).like("descricao", `${marca}%`).is("deleted_at", null).limit(5);
    const achada = (data || []).find((a) => (a.descricao ?? "").split(/\s/)[0] === marca);
    if (achada) return achada.id;
    const { conclusao } = await colunasDoProjeto(clienteId);
    const nome = membroId ? setor.esteira.length && membros.find((m) => m.id === membroId)?.nome : null;
    const nova = await criarAtividade({ titulo: `Chat da esteira · ${setor.nome}${nome ? ` · ${nome}` : ""}`, clienteId, pastaId: null, dataAtividade: format(new Date(), "yyyy-MM-dd"), statusKey: conclusao, concluida: true, ordem: 0 });
    await supabase.from("atividades").update({
      responsavel_id: membroId ?? setor.esteira[0].membro_id, setor_id: setorId, situacao: "concluida", tipo: "esteira",
      descricao: `${marca}\nConversa do Davi com ${nome ? `o ${nome}` : "o time"} da esteira (instruções de como fazer).`,
    }).eq("id", nova.id);
    return nova.id;
  }, [setorId, setor, clienteId, membros]);
  useEffect(() => {
    if (!aberto || !setor?.esteira.length) return;
    let vivo = true;
    void ancora(null).then((id) => { if (vivo && id) setConversaTarefa(id); }).catch(() => {});
    return () => { vivo = false; };
  }, [aberto, setor, ancora]);
  useEffect(() => {
    if (!foco || conversaDe[foco.membroId]) return;
    let vivo = true;
    void ancora(foco.membroId).then((id) => { if (vivo && id) setConversaDe((c) => ({ ...c, [foco.membroId]: id })); }).catch(() => {});
    return () => { vivo = false; };
  }, [foco, conversaDe, ancora]);

  const etapas = setor?.esteira ?? [];
  const nomeDe = (id: string) => membros.find((m) => m.id === id)?.nome ?? "?";
  const colunas = useMemo(() => [
    ...etapas.map((e, i) => ({ chave: i, titulo: e.nome, membroId: e.membro_id as string | null, pecas: pecas.filter((p) => p.etapa === i) })),
    { chave: etapas.length, titulo: "Pronto para você", membroId: null as string | null, pecas: pecas.filter((p) => p.etapa >= etapas.length) },
  ], [etapas, pecas]);

  const novaIdeia = async () => {
    const t = ideia.trim();
    if (!t || !setorId) return;
    const { error } = await db.from("esteira_itens").insert({ cliente_id: clienteId, setor_id: setorId, titulo: t, etapa: 0 });
    if (error) { toast.error("Não consegui criar"); return; }
    setIdeia("");
    toast.success(`${nomeDe(etapas[0]?.membro_id ?? "")} começa em até 1 minuto`);
    void carregar();
  };
  const mover = async (p: Peca, etapa: number, nota?: string) => {
    const { error } = await db.from("esteira_itens").update({ etapa, situacao: etapa >= etapas.length ? "feito" : "fila", nota: nota ?? null, atividade_id: null }).eq("id", p.id);
    if (error) { toast.error("Não consegui mover"); return; }
    void carregar();
  };
  const descartar = async (p: Peca) => {
    const { error } = await db.from("esteira_itens").update({ situacao: "descartado" }).eq("id", p.id);
    if (error) { toast.error("Não consegui descartar"); return; }
    void carregar();
  };

  return (
    <Dialog open={aberto} onOpenChange={(a) => { if (!a) onFechar(); }}>
      <DialogContent className="flex h-[90vh] max-w-[1400px] flex-col gap-3 overflow-hidden">
        <DialogHeader>
          <DialogTitle>Esteira · {setor?.nome ?? ""}</DialogTitle>
          <DialogDescription>
            {etapas.map((e) => `${nomeDe(e.membro_id)} (${e.nome})`).join(" → ")}{etapas.length ? " → você" : ""}. Cada um faz a sua parte e passa adiante sozinho.
          </DialogDescription>
        </DialogHeader>
        {!etapas.length ? (
          <p className="text-sm text-muted-foreground">Este escritório ainda não tem esteira.</p>
        ) : (
          <div className="flex min-h-0 flex-1 gap-3">
            {docAberto ? (
              <DocumentoDaPeca clienteId={clienteId} peca={docAberto} etapas={etapas} nomeDe={nomeDe}
                onVoltar={() => setDocAberto(null)} onPassar={(e) => { void mover(docAberto, e); setDocAberto(null); }} />
            ) : (
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void novaIdeia(); }}>
                <Input value={ideia} onChange={(e) => setIdeia(e.target.value)} className="h-9"
                  placeholder={`Ideia, tema ou pedido para o ${nomeDe(etapas[0].membro_id)} (ex.: "5 headlines sobre vício em celular")`} />
                <Button type="submit" size="sm" className="h-9 gap-1" disabled={!ideia.trim()}><Plus className="h-4 w-4" />Mandar</Button>
              </form>
              {/* Arrastar entre colunas (17/10: "eu que devo arrastar para o Junior começar"). */}
              <DragDropContext onDragEnd={(r: DropResult) => {
                if (!r.destination || r.destination.droppableId === r.source.droppableId) return;
                const p = pecas.find((x) => x.id === r.draggableId);
                if (p) void mover(p, Number(r.destination.droppableId));
              }}>
              <div className="grid min-h-0 flex-1 gap-2" style={{ gridTemplateColumns: `repeat(${colunas.length}, minmax(0, 1fr))` }}>
                {colunas.map((c) => (
                  <div key={c.chave} className={cn("flex min-h-0 flex-col gap-1.5 rounded-xl border bg-muted/30 p-2", c.membroId === null && "border-emerald-500/40 bg-emerald-500/5")}>
                    <div className={cn("flex items-center gap-1.5 rounded-md", c.membroId && "cursor-pointer hover:bg-muted", foco?.membroId === c.membroId && c.membroId && "bg-primary/10")}
                      onClick={() => c.membroId && setFoco({ membroId: c.membroId })} title={c.membroId ? `Falar só com o ${nomeDe(c.membroId)}` : undefined}>
                      {c.membroId ? (
                        <span className="h-6 w-6 shrink-0 overflow-hidden rounded-full bg-sky-100 dark:bg-slate-700"><CabecaBoneco nome={nomeDe(c.membroId)} ehIa className="h-full w-full" /></span>
                      ) : <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
                      <p className="min-w-0 flex-1 truncate text-xs font-semibold">{c.membroId ? `${nomeDe(c.membroId)} · ${c.titulo}` : c.titulo}</p>
                      <span className="text-[11px] text-muted-foreground">{c.pecas.length}</span>
                    </div>
                    {c.membroId && (
                      <button type="button" onClick={() => setCriteriosDe(c.chave)}
                        className={cn("-mt-0.5 rounded-md px-1.5 py-0.5 text-left text-[10.5px]",
                          etapas[c.chave]?.criterios?.trim() ? "text-muted-foreground hover:bg-muted" : "bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300")}>
                        {etapas[c.chave]?.criterios?.trim() ? "Critérios definidos ✎" : "⚠ Definir critérios desta etapa"}
                      </button>
                    )}
                    <Droppable droppableId={String(c.chave)}>
                    {(dp, snap) => (
                    <div ref={dp.innerRef} {...dp.droppableProps}
                      className={cn("flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto rounded-lg pr-0.5 transition-colors", snap.isDraggingOver && "bg-primary/10")}>
                      {c.pecas.length === 0 && <p className="py-4 text-center text-[11px] text-muted-foreground">{snap.isDraggingOver ? "solte aqui" : "—"}</p>}
                      {c.pecas.map((p, i) => (
                        <Draggable key={p.id} draggableId={p.id} index={i} isDragDisabled={abertaId === p.id}>
                        {(dg, snapDg) => {
                          const no = (
                        <div ref={dg.innerRef} {...dg.draggableProps} {...dg.dragHandleProps} style={dg.draggableProps.style}>
                        <CartaoPeca p={p} etapas={etapas} nomeDe={nomeDe} aberta={abertaId === p.id}
                          progresso={p.atividade_id ? progresso.get(p.atividade_id) ?? 0 : null}
                          onDocumento={p.documento_id ? () => { setDocAberto(p); const e = etapas[Math.min(p.etapa, etapas.length - 1)]; if (e) setFoco({ membroId: e.membro_id, peca: p }); } : undefined}
                          onAbrir={() => {
                            setAbertaId(abertaId === p.id ? null : p.id);
                            // O chat passa a ser com quem faz a etapa desta peça (pronta: com quem revisou por último).
                            const e = etapas[Math.min(p.etapa, etapas.length - 1)];
                            if (e) setFoco({ membroId: e.membro_id, peca: p });
                          }} onMover={(e, n) => void mover(p, e, n)} onDescartar={() => void descartar(p)} />
                        </div>
                          );
                          // Arrastando dentro de uma janela: desenha no body (senão o cartão sai do lugar).
                          return snapDg.isDragging ? createPortal(no, document.body) : no;
                        }}
                        </Draggable>
                      ))}
                      {dp.placeholder}
                    </div>
                    )}
                    </Droppable>
                  </div>
                ))}
              </div>
              </DragDropContext>
            </div>
            )}
            {/* O chat do trio: o Davi instrui; o que valer para as próximas vira aprendizado de quem faz. */}
            <aside className="flex w-[340px] shrink-0 flex-col">
              {foco ? (
                <p className="mb-1 flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground">
                  <span className="truncate">Só com o {nomeDe(foco.membroId)}{foco.peca ? ` · ${foco.peca.titulo}` : ""}</span>
                  <button type="button" onClick={() => setFoco(null)} className="shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] font-medium hover:bg-muted">Falar com os três</button>
                </p>
              ) : <p className="mb-1 text-xs font-semibold text-muted-foreground">Chat com {etapas.map((e) => nomeDe(e.membro_id)).join(", ")} · clique num cartão para falar só com quem faz</p>}
              <div className="min-h-0 flex-1">
                {foco ? (conversaDe[foco.membroId] ? (
                  <ConversaEntrega key={`${conversaDe[foco.membroId]}-${foco.peca?.id ?? ""}`} clienteId={clienteId} tarefaId={conversaDe[foco.membroId]} membroId={foco.membroId}
                    nome={nomeDe(foco.membroId)} textoInicial={foco.peca ? `Sobre "${foco.peca.titulo}": ` : undefined} onDocumentoMudou={() => void carregar()} />
                ) : <div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>) : conversaTarefa ? (
                  <ConversaEntrega key={conversaTarefa} clienteId={clienteId} tarefaId={conversaTarefa} membroId={etapas[0].membro_id}
                    nome={nomeDe(etapas[0].membro_id)} participantesIniciais={etapas.slice(1).map((e) => e.membro_id)} onDocumentoMudou={() => void carregar()} />
                ) : <div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
              </div>
            </aside>
          </div>
        )}
        {criteriosDe !== null && etapas[criteriosDe] && (
          <CriteriosEtapa etapa={etapas[criteriosDe]} quem={nomeDe(etapas[criteriosDe].membro_id)} onFechar={() => setCriteriosDe(null)}
            onSalvar={async (texto, daviAprova) => {
              const nova = etapas.map((e, i) => (i === criteriosDe ? { ...e, criterios: texto, davi_aprova: daviAprova } : e));
              const { error } = await db.from("setores").update({ esteira: nova }).eq("id", setorId);
              if (error) { toast.error("Não consegui salvar os critérios"); return; }
              toast.success(`Critérios do ${nomeDe(etapas[criteriosDe].membro_id)} salvos: ele segue isso nas próximas peças`);
              setCriteriosDe(null);
              void carregar();
            }} />
        )}
      </DialogContent>
    </Dialog>
  );
}

// Critérios de uma etapa (17/10: "tem que ter critérios para o Elias revisar e o Junior escrever").
function CriteriosEtapa({ etapa, quem, onFechar, onSalvar }: { etapa: Etapa; quem: string; onFechar: () => void; onSalvar: (t: string, daviAprova: boolean) => Promise<void> }) {
  const [texto, setTexto] = useState(etapa.criterios ?? "");
  const [daviAprova, setDaviAprova] = useState(etapa.davi_aprova ?? true);
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70 p-6 backdrop-blur-sm">
      <div className="w-full max-w-lg space-y-3 rounded-xl border bg-card p-4 shadow-xl">
        <p className="text-sm font-semibold">Critérios do {quem} · {etapa.nome}</p>
        <p className="text-xs text-muted-foreground">Como você quer esse trabalho: tamanho, tom, estrutura, o que nunca fazer, exemplos bons. Ele lê isso antes de cada peça.</p>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={9} autoFocus
          className="w-full rounded-md border bg-background p-2 text-sm"
          placeholder={etapa.nome.toLowerCase().includes("revis") ? "Ex.: aprovar só se o gancho prende nos 3 primeiros segundos; cortar palavras difíceis; máx. 45 s de fala…" : "Ex.: roteiro de 40 a 60 s; começa com uma pergunta; 3 pontos com dado ou exemplo; fecha com chamada para comentar…"} />
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={daviAprova} onChange={(e) => setDaviAprova(e.target.checked)} />
          Parar e esperar eu passar adiante quando terminar
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onFechar}>Cancelar</Button>
          <Button size="sm" onClick={() => void onSalvar(texto.trim(), daviAprova)}>Salvar critérios</Button>
        </div>
      </div>
    </div>
  );
}

// O documento da peça com o botão de passar adiante; o chat com quem faz fica ao lado (o do quadro).
function DocumentoDaPeca({ clienteId, peca, etapas, nomeDe, onVoltar, onPassar }: {
  clienteId: string; peca: Peca; etapas: Etapa[]; nomeDe: (id: string) => string; onVoltar: () => void; onPassar: (etapa: number) => void;
}) {
  const navigate = useNavigate();
  const [doc, setDoc] = useState<{ titulo: string; conteudo: string } | null>(null);
  const [mudou, setMudou] = useState(false);
  useEffect(() => {
    if (!peca.documento_id) return;
    let vivo = true;
    let ultimo = "";
    const ler = async () => {
      const { data } = await supabase.from("documentos").select("titulo, conteudo").eq("id", peca.documento_id!).maybeSingle();
      if (!vivo || !data) return;
      const c = typeof data.conteudo === "string" ? data.conteudo : "";
      if (ultimo && c !== ultimo) { setMudou(true); window.setTimeout(() => setMudou(false), 2500); }
      ultimo = c;
      setDoc({ titulo: data.titulo, conteudo: c });
    };
    void ler();
    const t = window.setInterval(() => void ler(), 4000);   // ele reescrevendo: a tela acompanha
    return () => { vivo = false; window.clearInterval(t); };
  }, [peca.documento_id]);
  const prox = peca.etapa + 1 < etapas.length ? peca.etapa + 1 : null;
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onVoltar} className="rounded-md border px-2 py-1 text-xs hover:bg-muted">← Voltar ao quadro</button>
        <button type="button" onClick={() => navigate(`/clientes/${clienteId}?documento=${peca.documento_id}`)} className="rounded-md border px-2 py-1 text-xs hover:bg-muted">Abrir em Documentos (editar)</button>
        {mudou && <span className="text-xs font-medium text-emerald-600">✎ atualizado agora</span>}
        <span className="ml-auto" />
        {prox !== null && (
          <Button size="sm" className="h-8 gap-1" onClick={() => onPassar(prox)}><Send className="h-3.5 w-3.5" />Passar para o {nomeDe(etapas[prox].membro_id)} ({etapas[prox].nome})</Button>
        )}
      </div>
      <div className={cn("min-h-0 flex-1 overflow-y-auto rounded-xl border bg-card p-5 transition-shadow", mudou && "ring-2 ring-emerald-400/60")}>
        {doc ? (
          <article className="prose prose-sm max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: htmlLimpo(doc.conteudo) }} />
        ) : <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
      </div>
      <p className="text-[11px] text-muted-foreground">Converse ao lado com o {nomeDe(etapas[Math.min(peca.etapa, etapas.length - 1)].membro_id)}: o que você pedir, ele ajusta aqui no documento.</p>
    </div>
  );
}

function CartaoPeca({ p, etapas, nomeDe, aberta, progresso, onAbrir, onMover, onDescartar, onDocumento }: {
  p: Peca; etapas: Etapa[]; nomeDe: (id: string) => string; aberta: boolean; progresso: number | null;
  onAbrir: () => void; onMover: (etapa: number, nota?: string) => void; onDescartar: () => void; onDocumento?: () => void;
}) {
  const [nota, setNota] = useState("");
  const pronto = p.etapa >= etapas.length;
  const quem = !pronto ? nomeDe(etapas[p.etapa].membro_id) : null;
  const textos = Object.entries(p.textos ?? {});
  const ultimo = textos.length ? textos[textos.length - 1][1] : "";
  return (
    <div className={cn("rounded-lg border bg-card p-2 text-xs shadow-sm", aberta && "ring-1 ring-primary/40", p.nota && !pronto && "border-amber-400/60")}>
      {/* Com documento (do Roteiro em diante): clicar abre o documento com o chat ao lado. */}
      <button type="button" onClick={onDocumento ?? onAbrir} className="flex w-full items-start gap-1 text-left">
        <span className="min-w-0 flex-1 break-words text-[12.5px] font-medium leading-snug">{p.titulo}</span>
        <ChevronDown className={cn("mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", aberta && "rotate-180")} />
      </button>
      {!pronto && p.situacao === "feito" ? (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <span className="text-[10px] font-medium text-emerald-700 dark:text-emerald-300">✓ pronta · arraste para o {nomeDe(etapas[p.etapa + 1]?.membro_id ?? "")}</span>
          {etapas[p.etapa + 1] && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onMover(p.etapa + 1); }}
              className="flex items-center gap-1 rounded-md bg-primary px-1.5 py-0.5 text-[10.5px] font-medium text-primary-foreground hover:bg-primary/90">
              <Send className="h-3 w-3" />Passar para o {nomeDe(etapas[p.etapa + 1].membro_id)}
            </button>
          )}
        </div>
      ) : !pronto && (
        p.situacao === "fazendo" ? (
          <div className="mt-1">
            <div className="h-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-sky-500 transition-all" style={{ width: `${Math.max(5, progresso ?? 5)}%` }} /></div>
            <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground"><Loader2 className="h-2.5 w-2.5 animate-spin" />{quem} trabalhando</p>
          </div>
        ) : <p className="mt-1 text-[10px] text-muted-foreground">na fila do {quem}</p>
      )}
      {p.nota && !pronto && <p className="mt-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10.5px] text-amber-700 dark:text-amber-300">Ajuste: {p.nota}</p>}
      {!aberta && ultimo && ultimo !== p.titulo && <p className="mt-1 line-clamp-3 whitespace-pre-line text-[11px] text-muted-foreground">{ultimo}</p>}
      {aberta && (
        <div className="mt-1.5 space-y-2 border-t pt-1.5">
          {textos.length === 0 && <p className="text-[11px] text-muted-foreground">Ainda sem texto.</p>}
          {textos.map(([nome, texto]) => (
            <div key={nome}>
              <p className="flex items-center justify-between text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                {nome}
                <button type="button" title="Copiar" onClick={() => { void navigator.clipboard.writeText(texto); toast.success("Copiado"); }} className="rounded p-0.5 hover:bg-muted"><Copy className="h-3 w-3" /></button>
              </p>
              <p className="whitespace-pre-line text-[11.5px] leading-relaxed">{texto}</p>
            </div>
          ))}
          <div className="space-y-1">
            <Input value={nota} onChange={(e) => setNota(e.target.value)} className="h-7 text-[11px]" placeholder="O que ajustar (opcional)" />
            <div className="flex flex-wrap gap-1">
              {etapas.map((e, i) => i !== p.etapa && (
                <button key={i} type="button" onClick={() => onMover(i, nota.trim() || undefined)}
                  className="flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] hover:bg-muted">
                  {i < p.etapa ? <RotateCcw className="h-3 w-3" /> : <Send className="h-3 w-3" />}{nomeDe(e.membro_id)} ({e.nome})
                </button>
              ))}
              <button type="button" onClick={onDescartar} className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] text-muted-foreground hover:text-rose-600">
                <Trash2 className="h-3 w-3" />Descartar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
