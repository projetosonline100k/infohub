import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BookOpen, Clock, GraduationCap, Loader2, Search, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { htmlLimpo, resumoDoHtml } from "@/lib/conteudo/htmlLimpo";
import { separarQuiz } from "@/lib/conteudo/quizEstudo";
import { QuizEstudo } from "./QuizEstudo";
import { criarTarefaParaMembro } from "@/components/empresa/FilaPessoa";

// Conteúdo → Fonte de conhecimento (pedido do Davi, 15/10/2026): tudo que o
// Gabriel (IA de estudos) entrega aparece aqui como uma newsletter. Daqui
// mesmo dá pra pedir um estudo novo (vira tarefa do Gabriel, que pesquisa e
// entrega sozinho, sem precisar de aprovação). Manual: docs/agentes/gabriel-estudos.md.
interface Estudo { id: string; titulo: string; conteudo: string; created_at: string }
interface Pendente { id: string; titulo: string; situacao: string | null; observacao: string | null }
const CHAVE_LIDOS = "fonte-conhecimento:lidos";
const lerLidos = (): string[] => { try { return JSON.parse(localStorage.getItem(CHAVE_LIDOS) || "[]"); } catch { return []; } };

export function FonteConhecimento({ clienteId }: { clienteId: string }) {
  const [gabriel, setGabriel] = useState<{ id: string; nome: string } | null>(null);
  const [estudos, setEstudos] = useState<Estudo[]>([]);
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [pedido, setPedido] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<Estudo | null>(null);
  const quizDoAberto = useMemo(() => separarQuiz(aberto?.conteudo ?? ""), [aberto]);
  const [lidos, setLidos] = useState<string[]>(lerLidos);

  const carregar = useCallback(async () => {
    const { data: ms } = await supabase.from("membros").select("id, nome").eq("cliente_id", clienteId).eq("eh_ia", true).ilike("nome", "gabriel").limit(1);
    const g = ms?.[0] ?? null;
    setGabriel(g);
    // Tarefas de estudo: as do Gabriel + qualquer uma marcada como "estudo".
    let consulta = supabase.from("atividades").select("id, titulo, situacao, observacao, concluida").eq("cliente_id", clienteId).is("deleted_at", null);
    consulta = g ? consulta.or(`responsavel_id.eq.${g.id},tipo.eq.estudo`) : consulta.eq("tipo", "estudo");
    const { data: ts } = await consulta;
    const tarefas = (ts || []) as (Pendente & { concluida: boolean })[];
    setPendentes(tarefas.filter((t) => !t.concluida));
    const ids = tarefas.map((t) => t.id);
    if (ids.length) {
      const { data: docs } = await supabase.from("documentos").select("id, titulo, conteudo, created_at")
        .eq("cliente_id", clienteId).is("deleted_at", null).in("atividade_id", ids).order("created_at", { ascending: false });
      setEstudos(((docs || []) as unknown as Estudo[]).filter((d) => typeof d.conteudo === "string"));
    } else setEstudos([]);
    setCarregando(false);
  }, [clienteId]);

  useEffect(() => { void carregar(); }, [carregar]);
  // Enquanto o Gabriel estuda, confere de tempos em tempos se já entregou.
  useEffect(() => {
    if (!pendentes.length) return;
    const t = window.setInterval(() => void carregar(), 20_000);
    return () => window.clearInterval(t);
  }, [pendentes.length, carregar]);

  const pedir = async () => {
    const texto = pedido.trim();
    if (!texto || !gabriel || enviando) return;
    setEnviando(true);
    try {
      await criarTarefaParaMembro(clienteId, gabriel.id, {
        titulo: texto.length > 90 ? `${texto.slice(0, 87)}…` : texto, tipo: "estudo", prazo: null,
        descricao: `Pedido do Davi pela Fonte de conhecimento:\n${texto}\n\nEntregue no formato de newsletter do manual (docs/agentes/gabriel-estudos.md).`,
      });
      setPedido("");
      toast.success(`${gabriel.nome} vai estudar e o resultado aparece aqui`);
      void carregar();
    } catch {
      toast.error("Não consegui mandar o pedido");
    } finally {
      setEnviando(false);
    }
  };

  const abrir = (e: Estudo) => {
    setAberto(e);
    if (!lidos.includes(e.id)) {
      const novo = [...lidos, e.id];
      setLidos(novo);
      try { localStorage.setItem(CHAVE_LIDOS, JSON.stringify(novo)); } catch { /* sem storage */ }
    }
  };

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return t ? estudos.filter((e) => e.titulo.toLowerCase().includes(t) || e.conteudo.toLowerCase().includes(t)) : estudos;
  }, [estudos, busca]);

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold"><GraduationCap className="h-6 w-6 text-primary" />Fonte de conhecimento</h1>
        <p className="text-sm text-muted-foreground">Os estudos que o {gabriel?.nome ?? "Gabriel"} traz para você se manter atualizado, como uma newsletter.</p>
      </header>

      {/* Pedir um estudo novo */}
      <form className="flex gap-2 rounded-xl border bg-card p-3" onSubmit={(e) => { e.preventDefault(); void pedir(); }}>
        <Sparkles className="mt-2 h-4 w-4 shrink-0 text-primary" />
        <Input value={pedido} onChange={(e) => setPedido(e.target.value)} disabled={!gabriel}
          placeholder={gabriel ? "Sobre o que você quer aprender? Ex.: tendências de IA para infoprodutores este mês" : "O Gabriel (IA de estudos) não está na equipe deste projeto"} />
        <Button type="submit" disabled={!pedido.trim() || !gabriel || enviando} className="shrink-0 gap-1.5">
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Pedir
        </Button>
      </form>

      {pendentes.length > 0 && (
        <div className="space-y-1.5">
          {pendentes.map((p) => (
            <div key={p.id} className="flex items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/5 px-3 py-2 text-sm">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sky-500" />
              <span className="min-w-0 flex-1 truncate"><b>{gabriel?.nome ?? "Gabriel"} estudando:</b> {p.titulo}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{p.situacao === "andamento" ? "pesquisando…" : "na fila"}</span>
            </div>
          ))}
        </div>
      )}

      {estudos.length > 3 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nos estudos…" className="pl-8" />
        </div>
      )}

      {carregando ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : filtrados.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          <BookOpen className="mx-auto mb-2 h-8 w-8 opacity-50" />
          {estudos.length ? "Nada com essa busca." : "Nenhum estudo ainda. Peça o primeiro aí em cima."}
        </div>
      ) : (
        <div className="space-y-3">
          {filtrados.map((e, i) => {
            const { resumo, minutos } = resumoDoHtml(e.conteudo);
            const novo = !lidos.includes(e.id);
            return (
              <button key={e.id} type="button" onClick={() => abrir(e)}
                className={cn("block w-full rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/40",
                  i === 0 && !busca && "border-primary/30 bg-primary/5")}>
                <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{format(new Date(e.created_at), "EEEE, d 'de' MMMM", { locale: ptBR })}</span>
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{minutos} min</span>
                  {novo && <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">novo</span>}
                </div>
                <h2 className={cn("font-semibold leading-snug", i === 0 && !busca ? "text-xl" : "text-base")}>{e.titulo}</h2>
                <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{resumo}</p>
              </button>
            );
          })}
        </div>
      )}

      <Dialog open={!!aberto} onOpenChange={(a) => { if (!a) setAberto(null); }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          {aberto && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl leading-snug">{aberto.titulo}</DialogTitle>
                <DialogDescription>{gabriel?.nome ?? "Gabriel"} · {format(new Date(aberto.created_at), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}</DialogDescription>
              </DialogHeader>
              {/* As perguntas e o gabarito do estudo viram um quiz de clicar no fim (16/10). */}
              <article className="prose prose-sm max-w-none dark:prose-invert prose-headings:mt-5 prose-a:text-primary"
                dangerouslySetInnerHTML={{ __html: htmlLimpo(quizDoAberto.html) }} />
              {quizDoAberto.perguntas.length > 0 && <QuizEstudo key={aberto.id} estudoId={aberto.id} perguntas={quizDoAberto.perguntas} />}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
