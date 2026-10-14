import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Bot, CalendarDays, Copy, ExternalLink, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { criarAtividade } from "@/lib/atividades/criarAtividade";
import { colunasDoProjeto } from "@/lib/empresa/colunas";
import { ehIaOperaria, ordenarFila, tarefaAtrasada, type MembroResumo, type TarefaResumo } from "@/lib/empresa/visaoGeral";
import { abrirLinkExterno } from "@/lib/abrirLink";
import { InteligenciaMembro } from "./InteligenciaMembro";
import { BriefingTarefa, type TarefaDoBriefing } from "./BriefingTarefa";

type TarefaFila = TarefaResumo & { video_vertical_id?: string | null; video_youtube_id?: string | null };

// O que o Davi cola na conversa do ChatGPT (as instruções já estão lá):
// o vídeo, o roteiro e o link do bruto, quando subiu pelo Infopro.
async function pacoteParaIa(t: TarefaFila): Promise<string> {
  const tabela = t.video_youtube_id ? "videos_youtube" : "videos_vertical";
  const id = t.video_youtube_id ?? t.video_vertical_id;
  if (!id) return t.titulo;
  const { data: v } = await supabase.from(tabela).select("titulo, roteiro, arquivo_url").eq("id", id).maybeSingle();
  if (!v) return t.titulo;
  return [
    `Vídeo: ${v.titulo}`,
    v.roteiro?.trim() ? `\nRoteiro:\n${v.roteiro.trim()}` : "",
    v.arquivo_url ? `\nVídeo bruto: ${v.arquivo_url}` : "\n(Anexei o vídeo bruto.)",
  ].filter(Boolean).join("\n");
}
import { cn } from "@/lib/utils";

// Fila de uma pessoa da empresa (clique no mapa da operação): ver o que ela
// tem, mudar a situação e adicionar tarefa. A tarefa é uma atividade comum
// do projeto (aparece também em Atividades), com responsável e situação.

export const SITUACOES = [
  { valor: "fila", rotulo: "Na fila" },
  { valor: "andamento", rotulo: "Em andamento" },
  { valor: "aguardando_aprovacao", rotulo: "Aguardando aprovação" },
  { valor: "concluida", rotulo: "Concluída" },
] as const;

export const TIPOS = [
  { valor: "", rotulo: "Tipo (opcional)" },
  { valor: "edicao", rotulo: "Edição de vídeo" },
  { valor: "carrossel", rotulo: "Carrossel" },
  { valor: "programacao", rotulo: "Programação" },
  { valor: "copy", rotulo: "Copy" },
  { valor: "pagina", rotulo: "Página" },
  { valor: "metricas", rotulo: "Métricas" },
  { valor: "gravacao", rotulo: "Gravação" },
] as const;

const CORES_SITUACAO: Record<string, string> = {
  fila: "bg-muted text-muted-foreground",
  andamento: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  aguardando_aprovacao: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  concluida: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
};

// Coluna do quadro em que a tarefa entra (a primeira que não conclui) e a de
// conclusão — cada projeto tem as suas (no do Davi são dias da semana).

export function FilaPessoa({ clienteId, membro, setorNome, onFechar, onMudou }: {
  clienteId: string;
  membro: MembroResumo | null;
  setorNome?: string;
  onFechar: () => void;
  onMudou: () => void;
}) {
  const [tarefas, setTarefas] = useState<TarefaFila[]>([]);
  const ia = !!membro && ehIaOperaria(membro);
  const [linkIa, setLinkIa] = useState("");
  useEffect(() => { setLinkIa(membro?.link_ia ?? ""); }, [membro]);
  const salvarLinkIa = async () => {
    if (!membro) return;
    const valor = linkIa.trim() || null;
    const { error } = await supabase.from("membros").update({ link_ia: valor }).eq("id", membro.id);
    if (error) { toast.error("Não consegui salvar o link"); return; }
    membro.link_ia = valor;
    toast.success("Link da conversa salvo");
    onMudou();
  };
  const copiarParaIa = async (t: TarefaFila) => {
    try {
      await navigator.clipboard.writeText(await pacoteParaIa(t));
      toast.success("Copiado — cole na conversa do ChatGPT e anexe o vídeo");
    } catch { toast.error("Não consegui copiar"); }
  };
  const [carregando, setCarregando] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState("");
  const [prazo, setPrazo] = useState("");
  const [situacao, setSituacao] = useState("fila");
  const [salvando, setSalvando] = useState(false);
  const [rapida, setRapida] = useState(false);
  const hoje = format(new Date(), "yyyy-MM-dd");

  const carregar = useCallback(async () => {
    if (!membro) return;
    setCarregando(true);
    const { data } = await supabase.from("atividades")
      .select("id, titulo, responsavel_id, setor_id, situacao, tipo, data_vencimento, concluida, progresso, concluida_em, video_vertical_id, video_youtube_id")
      .eq("responsavel_id", membro.id).is("deleted_at", null)
      // Abertas + as concluídas hoje (pra ver o que já saiu).
      .or(`concluida.eq.false,concluida_em.gte.${hoje}T00:00:00`);
    setTarefas((data || []) as TarefaFila[]);
    setCarregando(false);
  }, [membro, hoje]);

  useEffect(() => {
    setTitulo(""); setTipo(""); setPrazo(""); setSituacao("fila");
    void carregar();
  }, [carregar]);

  const adicionar = async () => {
    if (!membro || !titulo.trim()) return;
    setSalvando(true);
    try {
      const { inicial, conclusao } = await colunasDoProjeto(clienteId);
      const feita = situacao === "concluida";
      const nova = await criarAtividade({
        titulo: titulo.trim(), clienteId, pastaId: null, dataAtividade: prazo || hoje,
        statusKey: feita ? conclusao : inicial, concluida: feita, ordem: 0,
      });
      const { error } = await supabase.from("atividades").update({
        responsavel_id: membro.id, situacao, tipo: tipo || null, data_vencimento: prazo || null,
      }).eq("id", nova.id);
      if (error) throw error;
      setTitulo(""); setTipo(""); setPrazo(""); setSituacao("fila");
      await carregar();
      onMudou();
    } catch {
      toast.error("Não consegui criar a tarefa");
    } finally {
      setSalvando(false);
    }
  };

  // Tarefa que nasce do briefing confirmado: o combinado vai na descrição.
  const criarTarefaDoBriefing = async (t: TarefaDoBriefing) => {
    if (!membro) throw new Error("sem funcionário");
    const { inicial } = await colunasDoProjeto(clienteId);
    const nova = await criarAtividade({
      titulo: t.titulo, clienteId, pastaId: null, dataAtividade: t.prazo || hoje,
      statusKey: inicial, concluida: false, ordem: 0,
    });
    const { error } = await supabase.from("atividades").update({
      responsavel_id: membro.id, situacao: "fila", tipo: t.tipo, data_vencimento: t.prazo, descricao: t.descricao,
    }).eq("id", nova.id);
    if (error) throw error;
    await carregar();
    onMudou();
    return nova.id;
  };

  const mudarSituacao = async (tarefa: TarefaResumo, nova: string) => {
    const feita = nova === "concluida";
    const mudancas: Record<string, unknown> = { situacao: nova, concluida: feita };
    if (feita !== tarefa.concluida) {
      const { inicial, conclusao } = await colunasDoProjeto(clienteId);
      mudancas.status = feita ? conclusao : inicial;
    }
    setTarefas((atual) => atual.map((t) => (t.id === tarefa.id ? { ...t, situacao: nova, concluida: feita } : t)));
    const { error } = await supabase.from("atividades").update(mudancas).eq("id", tarefa.id);
    if (error) { toast.error("Não consegui mudar a situação"); void carregar(); return; }
    onMudou();
  };

  const abertas = ordenarFila(tarefas.filter((t) => !t.concluida));
  const feitasHoje = tarefas.filter((t) => t.concluida);

  return (
    <Dialog open={!!membro} onOpenChange={(aberto) => { if (!aberto) onFechar(); }}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        {membro && (
          <>
            <DialogHeader>
              <DialogTitle>{membro.nome}</DialogTitle>
              <DialogDescription>{[membro.funcao, setorNome].filter(Boolean).join(" · ")}</DialogDescription>
            </DialogHeader>

            {ia && membro.nome.toLowerCase() === "roy" ? (
              // O Roy roda no Mac com o Claude (scripts/roy/servico.py): não precisa levar nada até ele.
              <div className="space-y-1 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
                <p className="flex items-center gap-1.5 font-medium"><Bot className="h-4 w-4 text-emerald-500" />{membro.nome} trabalha sozinho, no seu Mac</p>
                <p className="text-xs text-muted-foreground">Passe uma tarefa pra ele (ex.: “transforme um reel em carrossel”): ele cria e manda pra sua revisão em <b>Precisa de você</b>. Lá você aprova, exclui página, edita texto ou escreve o que ele deve mudar: ele refaz em segundo plano.</p>
              </div>
            ) : ia && membro.link_ia && (
              // IA operária que ainda é conversa do ChatGPT: o Davi leva o trabalho até ela.
              <div className="space-y-2 rounded-lg border border-sky-500/30 bg-sky-500/5 p-3 text-sm">
                <p className="flex items-center gap-1.5 font-medium"><Bot className="h-4 w-4 text-sky-500" />{membro.nome} é uma conversa do ChatGPT</p>
                {membro.link_ia ? (
                  <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => void abrirLinkExterno(membro.link_ia!)}>
                    <ExternalLink className="h-3.5 w-3.5" />Abrir a conversa no ChatGPT
                  </Button>
                ) : (
                  <div className="flex gap-1.5">
                    <Input value={linkIa} onChange={(e) => setLinkIa(e.target.value)} placeholder="Cole o link da conversa (chatgpt.com/...)" className="h-8 text-xs" />
                    <Button size="sm" className="h-8" disabled={!linkIa.trim()} onClick={() => void salvarLinkIa()}>Salvar</Button>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Em cada tarefa, <b>Copiar</b> leva o título e o roteiro. Ao mandar pro ChatGPT, mude a tarefa pra <b>Em andamento</b>.</p>
              </div>
            )}

            {/* Nova tarefa: conversa com o funcionário; a tarefa rápida fica de reserva. */}
            <BriefingTarefa clienteId={clienteId} membro={membro} onCriarTarefa={criarTarefaDoBriefing} />
            <button type="button" onClick={() => setRapida(!rapida)} className="text-xs text-muted-foreground hover:text-foreground">
              {rapida ? "Fechar tarefa rápida" : "+ Tarefa rápida, sem conversa"}
            </button>
            {rapida && <form className="space-y-2 rounded-lg border p-3" onSubmit={(e) => { e.preventDefault(); void adicionar(); }}>
              <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={`O que ${membro.nome} vai fazer?`} autoFocus />
              <div className="flex flex-wrap gap-2">
                <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm" aria-label="Tipo">
                  {TIPOS.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
                </select>
                <select value={situacao} onChange={(e) => setSituacao(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm" aria-label="Situação">
                  {SITUACOES.map((s) => <option key={s.valor} value={s.valor}>{s.rotulo}</option>)}
                </select>
                <Input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} className="h-9 w-auto" aria-label="Prazo" />
                <Button type="submit" size="sm" className="ml-auto h-9 gap-1" disabled={!titulo.trim() || salvando}>
                  {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Adicionar
                </Button>
              </div>
            </form>}

            {carregando ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : (
              <div className="space-y-4">
                <ListaTarefas titulo="Tarefas" vazio={`${membro.nome} não tem tarefas abertas.`} tarefas={abertas} hoje={hoje} onMudar={mudarSituacao}
                  onCopiar={ia ? (t) => void copiarParaIa(t) : undefined} />
                {feitasHoje.length > 0 && <ListaTarefas titulo="Concluídas hoje" tarefas={feitasHoje} hoje={hoje} onMudar={mudarSituacao} />}
              </div>
            )}

            <InteligenciaMembro clienteId={clienteId} membro={membro} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ListaTarefas({ titulo, vazio, tarefas, hoje, onMudar, onCopiar }: {
  titulo: string; vazio?: string; tarefas: TarefaFila[]; hoje: string; onMudar: (t: TarefaResumo, situacao: string) => void;
  onCopiar?: (t: TarefaFila) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo} ({tarefas.length})</p>
      {tarefas.length === 0 ? (
        <p className="py-3 text-center text-sm text-muted-foreground">{vazio}</p>
      ) : (
        <div className="space-y-1.5">
          {tarefas.map((t) => {
            const atrasada = tarefaAtrasada(t, hoje);
            const sit = t.concluida ? "concluida" : t.situacao ?? "fila";
            return (
              <div key={t.id} className="flex items-center gap-2 rounded-lg border p-2">
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate text-sm font-medium", t.concluida && "text-muted-foreground line-through")}>{t.titulo}</p>
                  <p className={cn("flex items-center gap-1 text-xs", atrasada ? "text-rose-500" : "text-muted-foreground")}>
                    {t.data_vencimento && <><CalendarDays className="h-3 w-3" />{atrasada ? "Atrasada · " : ""}{format(new Date(`${t.data_vencimento}T12:00:00`), "EEE, d MMM", { locale: ptBR })}</>}
                    {t.tipo && <span>{t.data_vencimento ? " · " : ""}{TIPOS.find((x) => x.valor === t.tipo)?.rotulo ?? t.tipo}</span>}
                  </p>
                </div>
                {onCopiar && !t.concluida && (
                  <button type="button" onClick={() => onCopiar(t)} title="Copiar título e roteiro pro ChatGPT"
                    className="flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-xs hover:bg-accent">
                    <Copy className="h-3 w-3" />Copiar
                  </button>
                )}
                <select value={sit} onChange={(e) => onMudar(t, e.target.value)} aria-label="Situação"
                  className={cn("h-7 shrink-0 rounded-md border-0 px-2 text-xs font-medium", CORES_SITUACAO[sit])}>
                  {SITUACOES.map((s) => <option key={s.valor} value={s.valor}>{s.rotulo}</option>)}
                </select>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
