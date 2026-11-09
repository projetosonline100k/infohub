import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BarChart3, CheckCircle2, ClipboardList, Copy, ExternalLink, Eye, Loader2, Pause, Pencil, Play, Plus, Send, Users, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { CabecaBoneco } from "@/components/empresa/BonecoMesa";
import { MolduraCelular } from "@/components/quiz/MolduraCelular";
import { confirmar } from "@/components/DialogosGlobais";
import { cn } from "@/lib/utils";
import { abrirLinkExterno } from "@/lib/abrirLink";
import { cancelarTarefa } from "@/lib/empresa/cancelar";
import { ROTULO_STATUS, linkDoQuiz, type QuizResumo, type StatusQuiz } from "@/lib/quiz/quiz";
import { QuizPlayer } from "@/components/quiz/QuizPlayer";
import { QuizMetricas } from "@/components/quiz/QuizMetricas";
import { RevisaoEntrega } from "@/components/empresa/RevisaoEntrega";
import { criarTarefaParaMembro } from "@/components/empresa/FilaPessoa";

// Conteúdo → Quiz (pedido do Davi, 15/10/2026): o Roy do projeto é o
// responsável. Pede aqui → ele faz o esboço → você aprova → ele cria o quiz
// no Infopro → você testa e aprova → publicado, com link público e as
// respostas aqui. Fluxo: docs/QUIZ.md.
const db = supabase as unknown as SupabaseClient;   // quizzes ainda não está nos tipos gerados

interface Tarefa { id: string; situacao: string | null; progresso: number | null; observacao: string | null; concluida: boolean }
interface Resposta { id: string; quiz_id: string; perfil: string | null; nome: string | null; email: string | null; whatsapp: string | null; criada_em: string; respostas: { pergunta: string; resposta: string | null }[] }

const COR_STATUS: Record<StatusQuiz, string> = {
  esboco: "bg-sky-500/15 text-sky-700 dark:text-sky-300", criando: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  revisar: "bg-amber-500/15 text-amber-700 dark:text-amber-300", publicado: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  pausado: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300", cancelado: "bg-zinc-500/15 text-zinc-500",
};

export function QuizzesView({ clienteId }: { clienteId: string }) {
  const [roy, setRoy] = useState<{ id: string; nome: string } | null>(null);
  const [quizzes, setQuizzes] = useState<QuizResumo[]>([]);
  const [tarefas, setTarefas] = useState<Record<string, Tarefa>>({});
  const [respostas, setRespostas] = useState<Resposta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [criando, setCriando] = useState(false);
  const [revisando, setRevisando] = useState<{ id: string; titulo: string } | null>(null);
  const [testando, setTestando] = useState<QuizResumo | null>(null);
  const [vendoRespostas, setVendoRespostas] = useState<QuizResumo | null>(null);
  const [vendoMetricas, setVendoMetricas] = useState<QuizResumo | null>(null);

  const carregar = useCallback(async () => {
    const [{ data: ms }, { data: qs }, { data: rs }] = await Promise.all([
      supabase.from("membros").select("id, nome").eq("cliente_id", clienteId).eq("eh_ia", true).ilike("nome", "roy").limit(1),
      db.from("quizzes").select("id, titulo, slug, status, pedido, atividade_id, estrutura, criado_em, publicado_em")
        .eq("cliente_id", clienteId).neq("status", "cancelado").order("criado_em", { ascending: false }),
      db.from("quiz_respostas").select("id, quiz_id, perfil, nome, email, whatsapp, criada_em, respostas")
        .eq("cliente_id", clienteId).order("criada_em", { ascending: false }).limit(2000),
    ]);
    setRoy(ms?.[0] ?? null);
    const lista = (qs || []) as QuizResumo[];
    setQuizzes(lista);
    setRespostas((rs || []) as Resposta[]);
    const ids = lista.map((q) => q.atividade_id).filter((x): x is string => !!x);
    if (ids.length) {
      const { data: ts } = await supabase.from("atividades").select("id, situacao, progresso, observacao, concluida").in("id", ids);
      setTarefas(Object.fromEntries(((ts || []) as Tarefa[]).map((t) => [t.id, t])));
    }
    setCarregando(false);
  }, [clienteId]);

  useEffect(() => { void carregar(); }, [carregar]);
  const trabalhando = quizzes.some((q) => q.status === "esboco" || q.status === "criando");
  useEffect(() => {
    if (!trabalhando) return;
    const t = window.setInterval(() => void carregar(), 15_000);
    return () => window.clearInterval(t);
  }, [trabalhando, carregar]);

  const porQuiz = useMemo(() => {
    const m = new Map<string, Resposta[]>();
    for (const r of respostas) m.set(r.quiz_id, [...(m.get(r.quiz_id) ?? []), r]);
    return m;
  }, [respostas]);

  const pedir = async (titulo: string, pedido: string) => {
    if (!roy || !titulo.trim()) return;
    try {
      const descricao = `Quiz pedido pela aba Quiz.\nNome provisório: ${titulo.trim()}\n\nO que o quiz precisa fazer:\n${pedido.trim() || "(sem detalhes: pergunte na entrega do esboço o que faltar)"}\n\nFluxo e formato: docs/QUIZ.md (etapa 1: esboço em documento).`;
      const tarefaId = await criarTarefaParaMembro(clienteId, roy.id, { titulo: `Quiz: ${titulo.trim()}`, tipo: "quiz", prazo: null, descricao });
      const { error } = await db.from("quizzes").insert({ id: crypto.randomUUID(), cliente_id: clienteId, titulo: titulo.trim(), pedido: pedido.trim() || null, atividade_id: tarefaId });
      if (error) throw error;
      toast.success(`${roy.nome} começa o esboço e te traz para aprovar`);
      void carregar();
      setCriando(false);
      setRevisando({ id: tarefaId, titulo: titulo.trim() });
    } catch {
      toast.error("Não consegui pedir o quiz");
    }
  };

  const mudarStatus = async (q: QuizResumo, status: StatusQuiz) => {
    const { error } = await db.from("quizzes").update({ status }).eq("id", q.id);
    if (error) { toast.error(error.message); return; }
    toast.success(status === "pausado" ? "Quiz pausado: o link para de funcionar" : "Quiz publicado de novo");
    void carregar();
  };
  const cancelar = async (q: QuizResumo) => {
    if (!(await confirmar(`Cancelar o quiz "${q.titulo}"? O link para de funcionar e a tarefa do Roy vai pra Lixeira.`, { botao: "Cancelar quiz", destrutivo: true }))) return;
    try {
      await db.from("quizzes").update({ status: "cancelado" }).eq("id", q.id);
      if (q.atividade_id && !tarefas[q.atividade_id]?.concluida) await cancelarTarefa(q.atividade_id);
      toast.success("Quiz cancelado");
      void carregar();
    } catch { toast.error("Não consegui cancelar"); }
  };
  const copiar = (q: QuizResumo) => { void navigator.clipboard.writeText(linkDoQuiz(q.slug)); toast.success("Link copiado"); };

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold"><ClipboardList className="h-6 w-6 text-primary" />Quiz</h1>
        <p className="text-sm text-muted-foreground">
          {roy ? `O ${roy.nome} cuida dos quizzes deste projeto: faz o esboço, você aprova, ele cria o quiz aqui no Infopro e você publica.` : "Este projeto ainda não tem o Roy (IA) na equipe."}
        </p>
      </header>

      <div className="flex justify-end">
        <Button className="gap-1.5" disabled={!roy} onClick={() => setCriando(true)}><Plus className="h-4 w-4" />Criar novo quiz</Button>
      </div>

      {carregando ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : quizzes.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">Nenhum quiz ainda. Clique em “Criar novo quiz”.</div>
      ) : (
        <div className="space-y-2">
          {quizzes.map((q) => {
            const t = q.atividade_id ? tarefas[q.atividade_id] : undefined;
            const esperandoVoce = t?.situacao === "aguardando_aprovacao" && !t.concluida;
            const rodando = t?.situacao === "andamento";
            const n = porQuiz.get(q.id)?.length ?? 0;
            return (
              <div key={q.id} className={cn("group rounded-xl border bg-card p-3", esperandoVoce && "border-amber-500/50")}>
                <div className="flex flex-wrap items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-semibold">{q.titulo}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span className={cn("rounded-full px-2 py-0.5 font-medium", esperandoVoce ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : COR_STATUS[q.status])}>
                        {esperandoVoce ? (q.status === "esboco" ? "Esboço pronto: aprove" : "Quiz pronto: teste e aprove") : ROTULO_STATUS[q.status]}
                      </span>
                      <span>pedido em {format(new Date(q.criado_em), "d MMM", { locale: ptBR })}</span>
                      {q.status === "publicado" && <span className="flex items-center gap-1"><Users className="h-3 w-3" />{n} {n === 1 ? "resposta" : "respostas"}</span>}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {esperandoVoce && q.atividade_id && (
                      <Button size="sm" className="h-8 gap-1.5" onClick={() => setRevisando({ id: q.atividade_id!, titulo: q.titulo })}>
                        <CheckCircle2 className="h-4 w-4" />{q.status === "esboco" ? "Ver esboço e aprovar" : "Testar e aprovar"}
                      </Button>
                    )}
                    {q.estrutura && !esperandoVoce && (
                      <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setTestando(q)}><Eye className="h-4 w-4" />Testar</Button>
                    )}
                    {(q.status === "publicado" || q.status === "pausado") && q.atividade_id && !esperandoVoce && (
                      <Button size="sm" variant="outline" className="h-8 gap-1.5" title="Abrir o quiz para editar e conversar com o Roy"
                        onClick={() => setRevisando({ id: q.atividade_id!, titulo: q.titulo })}><Pencil className="h-4 w-4" />Editar</Button>
                    )}
                    {q.status === "publicado" && (
                      <>
                        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => copiar(q)}><Copy className="h-4 w-4" />Link</Button>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Abrir o quiz" onClick={() => void abrirLinkExterno(linkDoQuiz(q.slug))}><ExternalLink className="h-4 w-4" /></Button>
                        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setVendoMetricas(q)}><BarChart3 className="h-4 w-4" />Métricas</Button>
                        {n > 0 && <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setVendoRespostas(q)}><Users className="h-4 w-4" />Respostas</Button>}
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Pausar (o link para de funcionar)" onClick={() => void mudarStatus(q, "pausado")}><Pause className="h-4 w-4" /></Button>
                      </>
                    )}
                    {q.status === "pausado" && <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => void mudarStatus(q, "publicado")}><Play className="h-4 w-4" />Publicar de novo</Button>}
                    <button type="button" title="Cancelar quiz" onClick={() => void cancelar(q)}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-rose-500/10 hover:text-rose-600 group-hover:opacity-100">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {rodando && (
                  <div className="mt-2">
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-sky-500 transition-all" style={{ width: `${t?.progresso ?? 5}%` }} /></div>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />{t?.observacao?.replace(/^Agora: /, "") || `${roy?.nome ?? "Roy"} trabalhando…`}</p>
                  </div>
                )}
                {t?.situacao === "fila" && !t.concluida && (q.status === "esboco" || q.status === "criando") && (
                  <p className="mt-1.5 text-xs text-muted-foreground">Na fila do {roy?.nome ?? "Roy"}: ele começa assim que terminar o que está fazendo.</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <NovoQuiz aberto={criando} roy={roy} onFechar={() => setCriando(false)} onPedir={pedir} />

      <RevisaoEntrega clienteId={clienteId} tarefas={revisando ? [revisando] : []} aberto={!!revisando}
        onFechar={() => setRevisando(null)} onMudou={() => void carregar()} />

      <Dialog open={!!testando} onOpenChange={(a) => { if (!a) setTestando(null); }}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>{testando?.titulo}</DialogTitle><DialogDescription>Teste do quiz (não grava resposta).</DialogDescription></DialogHeader>
          {testando?.estrutura && <QuizPlayer titulo={testando.titulo} estrutura={testando.estrutura} teste />}
        </DialogContent>
      </Dialog>

      <QuizMetricas quiz={vendoMetricas} respostas={vendoMetricas ? porQuiz.get(vendoMetricas.id) ?? [] : []} onFechar={() => setVendoMetricas(null)} />

      <Dialog open={!!vendoRespostas} onOpenChange={(a) => { if (!a) setVendoRespostas(null); }}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Respostas · {vendoRespostas?.titulo}</DialogTitle>
            <DialogDescription>
              {(() => {
                const lista = vendoRespostas ? porQuiz.get(vendoRespostas.id) ?? [] : [];
                const contagem = new Map<string, number>();
                for (const r of lista) contagem.set(r.perfil ?? "sem perfil", (contagem.get(r.perfil ?? "sem perfil") ?? 0) + 1);
                return [...contagem.entries()].sort((a, b) => b[1] - a[1]).map(([p, k]) => `${p}: ${k}`).join(" · ");
              })()}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            {(vendoRespostas ? porQuiz.get(vendoRespostas.id) ?? [] : []).map((r) => (
              <details key={r.id} className="rounded-lg border p-2 text-sm">
                <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-0.5">
                  <span className="font-medium">{r.nome || "Sem nome"}</span>
                  {r.whatsapp && <span className="text-muted-foreground">{r.whatsapp}</span>}
                  {r.email && <span className="text-muted-foreground">{r.email}</span>}
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{r.perfil ?? "—"}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{format(new Date(r.criada_em), "d MMM HH:mm", { locale: ptBR })}</span>
                </summary>
                <ul className="mt-2 space-y-1 text-xs">
                  {(r.respostas || []).map((x, k) => <li key={k}><span className="text-muted-foreground">{x.pergunta}</span> → <b>{x.resposta ?? "—"}</b></li>)}
                </ul>
              </details>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Quiz novo (09/11, Davi): o mesmo desenho do editor, mas vazio — sem fluxo, celular em branco e o chat com o Roy
// sem conversa. A primeira mensagem vira o pedido: o Roy começa o esboço e a tela passa para a revisão dele.
function NovoQuiz({ aberto, roy, onFechar, onPedir }: {
  aberto: boolean; roy: { id: string; nome: string } | null; onFechar: () => void; onPedir: (titulo: string, pedido: string) => Promise<void>;
}) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  useEffect(() => { if (!aberto) setTexto(""); }, [aberto]);
  const nome = roy?.nome ?? "Roy";
  const mandar = async () => {
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    const primeira = t.split("\n")[0].replace(/\s+/g, " ");
    try { await onPedir(primeira.length > 60 ? `${primeira.slice(0, 57)}…` : primeira, t); } finally { setEnviando(false); }
  };
  return (
    <Dialog open={aberto} onOpenChange={(a) => { if (!a) onFechar(); }}>
      <DialogContent className="dark flex h-[92vh] w-[98vw] max-w-[98vw] flex-col gap-3 border-white/10 bg-[#060a12] p-3 text-foreground">
        <DialogHeader className="px-1"><DialogTitle>Novo quiz</DialogTitle><DialogDescription>Conte para o {nome} o que o quiz precisa fazer: ele monta o fluxo e as telas.</DialogDescription></DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row">
          <div className="flex min-h-[200px] flex-col gap-2 rounded-2xl border border-white/10 bg-[#0a1019] p-3 md:w-[30%] md:flex-none">
            <p className="text-base font-semibold text-white">Fluxo do quiz</p>
            <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-white/40">O fluxo aparece aqui quando o {nome} criar o quiz.</div>
          </div>
          <div className="flex min-h-[260px] flex-1 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_50%_40%,#0f1c33,#0a1019_70%)] p-3">
            <div className="flex h-full max-h-[760px] w-full justify-center" style={{ filter: "drop-shadow(0 0 2px rgba(34,211,238,.9)) drop-shadow(0 0 28px rgba(34,211,238,.35))" }}>
              <MolduraCelular escuro={false}><div className="flex flex-1 items-center justify-center text-center text-xs text-neutral-400">A prévia do celular aparece aqui.</div></MolduraCelular>
            </div>
          </div>
          <div className="flex min-h-[260px] flex-col rounded-2xl border border-white/10 bg-[#0a1019] p-3 md:w-[360px] md:flex-none">
            <div className="flex items-center gap-2 border-b border-white/10 pb-2">
              <span className="h-8 w-8 overflow-hidden rounded-full"><CabecaBoneco nome={nome} ehIa className="h-full w-full" /></span>
              <div><p className="text-sm font-semibold">{nome}</p><p className="text-[11px] text-muted-foreground">Assistente do seu quiz</p></div>
            </div>
            <div className="flex-1" />
            <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void mandar(); }}>
              <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} className="text-sm" autoFocus
                placeholder={`Fale com o ${nome}: para que é o quiz? Produto, público, palavra para comentar, link da oferta, referências…`}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void mandar(); } }} />
              <div className="flex justify-end">
                <Button type="submit" className="gap-1.5" disabled={!texto.trim() || enviando}>
                  {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Pedir ao {nome}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
