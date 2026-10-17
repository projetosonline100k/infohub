import { useCallback, useEffect, useMemo, useState } from "react";
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

// Esteira de um escritório (pedido do Davi, 17/10/2026): "o Leo cria as headlines,
// passa para o Junior, que escreve os roteiros, que passa para o Elias revisar; nesse
// kanban tenha o chat, porque eu vou ir instruindo o pessoal". Cada coluna é uma etapa
// (o rosto de quem faz); a peça anda sozinha (scripts/empresa/esteira.py + ouvinte).
// O Davi escreve ideias, lê, devolve ou descarta; o chat do trio fica ao lado.
const db = supabase as unknown as SupabaseClient;

interface Etapa { nome: string; membro_id: string }
interface Peca {
  id: string; titulo: string; textos: Record<string, string>; etapa: number; situacao: "fila" | "fazendo" | "feito" | "descartado";
  nota: string | null; atividade_id: string | null; atualizado_em: string;
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

  const carregar = useCallback(async () => {
    if (!setorId) return;
    const [{ data: s }, { data: ps }] = await Promise.all([
      db.from("setores").select("nome, esteira").eq("id", setorId).maybeSingle(),
      db.from("esteira_itens").select("id, titulo, textos, etapa, situacao, nota, atividade_id, atualizado_em")
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
  useEffect(() => {
    if (!aberto || !setorId || !setor?.esteira.length) return;
    let vivo = true;
    void (async () => {
      const marca = `ESTEIRA_CHAT:${setorId}`;
      const { data } = await supabase.from("atividades").select("id").eq("cliente_id", clienteId).like("descricao", `${marca}%`).is("deleted_at", null).limit(1);
      if (data?.[0]) { if (vivo) setConversaTarefa(data[0].id); return; }
      const { conclusao } = await colunasDoProjeto(clienteId);
      const nova = await criarAtividade({ titulo: `Chat da esteira · ${setor.nome}`, clienteId, pastaId: null, dataAtividade: format(new Date(), "yyyy-MM-dd"), statusKey: conclusao, concluida: true, ordem: 0 });
      await supabase.from("atividades").update({
        responsavel_id: setor.esteira[0].membro_id, setor_id: setorId, situacao: "concluida", tipo: "esteira",
        descricao: `${marca}\nConversa do Davi com o time da esteira (instruções de como fazer).`,
      }).eq("id", nova.id);
      if (vivo) setConversaTarefa(nova.id);
    })().catch(() => {});
    return () => { vivo = false; };
  }, [aberto, setorId, clienteId, setor]);

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
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void novaIdeia(); }}>
                <Input value={ideia} onChange={(e) => setIdeia(e.target.value)} className="h-9"
                  placeholder={`Ideia, tema ou pedido para o ${nomeDe(etapas[0].membro_id)} (ex.: "5 headlines sobre vício em celular")`} />
                <Button type="submit" size="sm" className="h-9 gap-1" disabled={!ideia.trim()}><Plus className="h-4 w-4" />Mandar</Button>
              </form>
              <div className="grid min-h-0 flex-1 gap-2" style={{ gridTemplateColumns: `repeat(${colunas.length}, minmax(0, 1fr))` }}>
                {colunas.map((c) => (
                  <div key={c.chave} className={cn("flex min-h-0 flex-col gap-1.5 rounded-xl border bg-muted/30 p-2", c.membroId === null && "border-emerald-500/40 bg-emerald-500/5")}>
                    <div className="flex items-center gap-1.5">
                      {c.membroId ? (
                        <span className="h-6 w-6 shrink-0 overflow-hidden rounded-full bg-sky-100 dark:bg-slate-700"><CabecaBoneco nome={nomeDe(c.membroId)} ehIa className="h-full w-full" /></span>
                      ) : <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
                      <p className="min-w-0 flex-1 truncate text-xs font-semibold">{c.membroId ? `${nomeDe(c.membroId)} · ${c.titulo}` : c.titulo}</p>
                      <span className="text-[11px] text-muted-foreground">{c.pecas.length}</span>
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-0.5">
                      {c.pecas.length === 0 && <p className="py-4 text-center text-[11px] text-muted-foreground">—</p>}
                      {c.pecas.map((p) => (
                        <CartaoPeca key={p.id} p={p} etapas={etapas} nomeDe={nomeDe} aberta={abertaId === p.id}
                          progresso={p.atividade_id ? progresso.get(p.atividade_id) ?? 0 : null}
                          onAbrir={() => setAbertaId(abertaId === p.id ? null : p.id)} onMover={(e, n) => void mover(p, e, n)} onDescartar={() => void descartar(p)} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* O chat do trio: o Davi instrui; o que valer para as próximas vira aprendizado de quem faz. */}
            <aside className="flex w-[340px] shrink-0 flex-col">
              <p className="mb-1 text-xs font-semibold text-muted-foreground">Chat com {etapas.map((e) => nomeDe(e.membro_id)).join(", ")}</p>
              <div className="min-h-0 flex-1">
                {conversaTarefa ? (
                  <ConversaEntrega key={conversaTarefa} clienteId={clienteId} tarefaId={conversaTarefa} membroId={etapas[0].membro_id}
                    nome={nomeDe(etapas[0].membro_id)} participantesIniciais={etapas.slice(1).map((e) => e.membro_id)} onDocumentoMudou={() => void carregar()} />
                ) : <div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
              </div>
            </aside>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CartaoPeca({ p, etapas, nomeDe, aberta, progresso, onAbrir, onMover, onDescartar }: {
  p: Peca; etapas: Etapa[]; nomeDe: (id: string) => string; aberta: boolean; progresso: number | null;
  onAbrir: () => void; onMover: (etapa: number, nota?: string) => void; onDescartar: () => void;
}) {
  const [nota, setNota] = useState("");
  const pronto = p.etapa >= etapas.length;
  const quem = !pronto ? nomeDe(etapas[p.etapa].membro_id) : null;
  const textos = Object.entries(p.textos ?? {});
  const ultimo = textos.length ? textos[textos.length - 1][1] : "";
  return (
    <div className={cn("rounded-lg border bg-card p-2 text-xs shadow-sm", aberta && "ring-1 ring-primary/40", p.nota && !pronto && "border-amber-400/60")}>
      <button type="button" onClick={onAbrir} className="flex w-full items-start gap-1 text-left">
        <span className="min-w-0 flex-1 break-words text-[12.5px] font-medium leading-snug">{p.titulo}</span>
        <ChevronDown className={cn("mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", aberta && "rotate-180")} />
      </button>
      {!pronto && (
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
