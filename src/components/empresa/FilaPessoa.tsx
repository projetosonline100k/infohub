import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Bot, CalendarDays, Copy, ExternalLink, Eye, Loader2, Plus, X } from "lucide-react";
import { confirmar } from "@/components/DialogosGlobais";
import { cancelarTarefa } from "@/lib/empresa/cancelar";
import { toast } from "sonner";
import type { SupabaseClient } from "@supabase/supabase-js";
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
import { RevisaoEntrega } from "./RevisaoEntrega";

type TarefaFila = TarefaResumo & {
  video_vertical_id?: string | null; video_youtube_id?: string | null;
  tempo_estimado?: number | null; timer_iniciado_em?: string | null; timer_decorrido_segundos?: number | null;
  observacao?: string | null; created_at?: string | null;
  // Quando a Dalila publica (post programado): vira o "fim" da barra.
  publica_em?: string | null;
};
// Trabalho das IAs que não é tarefa: carrossel do Roy montando, edição do Danilo.
interface TrabalhoAgora { id: string; titulo: string; etapa: string; desde: string }

const minutos = (ms: number) => Math.max(0, Math.round(ms / 60000));
const duracaoTexto = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? String(min % 60).padStart(2, "0") : ""}` : `${min} min`);
// Quanto já foi trabalhado (cronômetro da tarefa) e quanto falta pelo tempo estimado.
function tempoDaTarefa(t: TarefaFila, agora: number) {
  const rodando = t.timer_iniciado_em ? (agora - new Date(t.timer_iniciado_em).getTime()) / 1000 : 0;
  const feito = Math.round(((t.timer_decorrido_segundos ?? 0) + Math.max(0, rodando)) / 60);
  const estimado = t.tempo_estimado ?? null;
  if (estimado != null) {
    const pct = t.progresso != null && t.progresso > 0 ? t.progresso : Math.min(100, Math.round((feito / estimado) * 100));
    return { feito, falta: Math.max(0, estimado - feito), pct, rodando: !!t.timer_iniciado_em, alvo: null as Date | null, rotuloAlvo: "" };
  }
  // Sem estimativa: a barra vai de quando a tarefa nasceu até a publicação (Dalila) ou o prazo (fim do dia).
  const alvo = t.publica_em ? new Date(t.publica_em) : t.data_vencimento ? new Date(`${t.data_vencimento}T23:59:00`) : null;
  const inicio = t.created_at ? new Date(t.created_at).getTime() : null;
  if (alvo && inicio != null) {
    const total = Math.max(1, alvo.getTime() - inicio);
    const pct = Math.max(0, Math.min(100, Math.round(((agora - inicio) / total) * 100)));
    return { feito, falta: Math.max(0, Math.round((alvo.getTime() - agora) / 60000)), pct, rodando: !!t.timer_iniciado_em, alvo, rotuloAlvo: t.publica_em ? "publica" : "prazo" };
  }
  return { feito, falta: null as number | null, pct: t.progresso || null, rodando: !!t.timer_iniciado_em, alvo: null as Date | null, rotuloAlvo: "" };
}
// "2 dias 3h", "5h20", "40 min".
function faltaTexto(min: number) {
  if (min >= 24 * 60) { const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60); return `${d} ${d === 1 ? "dia" : "dias"}${h ? ` ${h}h` : ""}`; }
  return duracaoTexto(min);
}

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
  { valor: "quiz", rotulo: "Quiz" },
  { valor: "estudo", rotulo: "Estudo / pesquisa" },
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

// Cria a tarefa combinada no briefing (usado aqui e na gaveta da equipe).
export async function criarTarefaParaMembro(clienteId: string, membroId: string, t: TarefaDoBriefing): Promise<string> {
  const { inicial } = await colunasDoProjeto(clienteId);
  const nova = await criarAtividade({
    titulo: t.titulo, clienteId, pastaId: null, dataAtividade: t.prazo || format(new Date(), "yyyy-MM-dd"),
    statusKey: inicial, concluida: false, ordem: 0,
  });
  const { error } = await supabase.from("atividades").update({
    responsavel_id: membroId, situacao: "fila", tipo: t.tipo, data_vencimento: t.prazo, descricao: t.descricao,
  }).eq("id", nova.id);
  if (error) throw error;
  return nova.id;
}

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
  const [passarTarefa, setPassarTarefa] = useState(false);
  const [trabalho, setTrabalho] = useState<TrabalhoAgora[]>([]);
  const [agora, setAgora] = useState(() => Date.now());
  const [revisando, setRevisando] = useState(false);
  useEffect(() => { const t = window.setInterval(() => setAgora(Date.now()), 30_000); return () => window.clearInterval(t); }, []);
  const hoje = format(new Date(), "yyyy-MM-dd");

  const carregar = useCallback(async () => {
    if (!membro) return;
    setCarregando(true);
    const { data } = await supabase.from("atividades")
      .select("id, titulo, responsavel_id, setor_id, situacao, tipo, data_vencimento, concluida, progresso, concluida_em, video_vertical_id, video_youtube_id, tempo_estimado, timer_iniciado_em, timer_decorrido_segundos, observacao, created_at")
      .eq("responsavel_id", membro.id).is("deleted_at", null)
      // Abertas + as concluídas hoje (pra ver o que já saiu).
      .or(`concluida.eq.false,concluida_em.gte.${hoje}T00:00:00`);
    const lista = (data || []) as TarefaFila[];
    const programacao = lista.filter((t) => t.tipo === "programacao").map((t) => t.id);
    if (programacao.length) {
      const { data: cs } = await (supabase as unknown as SupabaseClient).from("carrosseis")
        .select("atividade_id, programado_para").in("atividade_id", programacao);
      const quando = new Map(((cs || []) as { atividade_id: string; programado_para: string | null }[]).map((c) => [c.atividade_id, c.programado_para]));
      for (const t of lista) if (quando.get(t.id)) t.publica_em = quando.get(t.id);
    }
    setTarefas(lista);
    // O que a IA está fazendo fora das tarefas (carrossel / edição em curso).
    const nome = membro.nome.toLowerCase();
    if (nome === "roy") {
      const { data: cs } = await supabase.from("carrosseis").select("id, numero, tema, status, mensagem, atualizado_em")
        .eq("cliente_id", clienteId).in("status", ["produzindo", "ajuste"]);
      setTrabalho((cs || []).map((c) => ({ id: c.id, titulo: `Carrossel ${String(c.numero ?? "").padStart(3, "0")} · ${c.tema}`,
        etapa: c.status === "ajuste" ? "Refazendo com o seu ajuste" : c.mensagem || "Montando as páginas", desde: c.atualizado_em })));
    } else if (nome === "danilo") {
      const { data: es } = await supabase.from("edicoes_video").select("id, titulo, status, mensagem, atualizado_em")
        .eq("cliente_id", clienteId).in("status", ["na_fila", "editando", "renderizando", "aprovando"]);
      const ETAPA: Record<string, string> = { na_fila: "Na fila de edição", editando: "Editando", renderizando: "Gerando a versão", aprovando: "Gerando o vídeo final" };
      setTrabalho((es || []).map((e) => ({ id: e.id, titulo: e.titulo, etapa: e.mensagem || ETAPA[e.status] || e.status, desde: e.atualizado_em })));
    } else setTrabalho([]);
    setCarregando(false);
  }, [membro, hoje, clienteId]);

  useEffect(() => {
    setTitulo(""); setTipo(""); setPrazo(""); setSituacao("fila"); setPassarTarefa(false); setRapida(false);
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
    const id = await criarTarefaParaMembro(clienteId, membro.id, t);
    await carregar();
    onMudou();
    return id;
  };

  const cancelar = async (t: TarefaFila) => {
    if (!(await confirmar(`Cancelar "${t.titulo}"? Sai da fila de ${membro?.nome ?? "da pessoa"} e vai pra Lixeira (dá pra recuperar).`, { botao: "Cancelar tarefa", destrutivo: true }))) return;
    try { await cancelarTarefa(t.id); toast.success("Tarefa cancelada"); await carregar(); onMudou(); } catch { toast.error("Não consegui cancelar"); }
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

  const abertas = ordenarFila(tarefas.filter((t) => !t.concluida)) as TarefaFila[];
  const emAndamento = abertas.filter((t) => t.situacao === "andamento");
  const naFila = abertas.filter((t) => (t.situacao ?? "fila") === "fila");
  const esperando = abertas.filter((t) => t.situacao === "aguardando_aprovacao");
  const feitasHoje = tarefas.filter((t) => t.concluida);

  return (
    <Dialog open={!!membro} onOpenChange={(aberto) => { if (!aberto) onFechar(); }}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto overflow-x-hidden">
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

            {/* 1. O que está fazendo agora */}
            {carregando ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : (
              <div className="space-y-4">
                <section className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-400">Agora</p>
                  {emAndamento.length === 0 && trabalho.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{membro.nome} não está fazendo nada agora{abertas.length ? ` · ${abertas.length} na fila` : ""}.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {trabalho.map((w) => (
                        <div key={w.id}>
                          <p className="text-sm font-medium">{w.titulo}</p>
                          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />{w.etapa} · desde {format(new Date(w.desde), "HH:mm")} ({duracaoTexto(minutos(agora - new Date(w.desde).getTime()))})</p>
                        </div>
                      ))}
                      {emAndamento.map((t) => {
                        const tt = tempoDaTarefa(t, agora);
                        return (
                          <div key={t.id}>
                            <div className="flex items-baseline justify-between gap-2">
                              <p className="min-w-0 break-words text-sm font-medium">{t.titulo}</p>
                              {tt.falta != null && <span className="shrink-0 text-xs font-semibold text-sky-700 dark:text-sky-400">falta {faltaTexto(tt.falta)}</span>}
                            </div>
                            {tt.pct != null && <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-sky-500 transition-all" style={{ width: `${tt.pct}%` }} /></div>}
                            <p className="mt-1 text-xs text-muted-foreground">
                              {tt.feito > 0 ? `${duracaoTexto(tt.feito)} trabalhados${tt.rodando ? " (cronômetro rodando)" : ""}` : t.created_at ? `Desde ${format(new Date(t.created_at), "dd/MM HH:mm")}` : "Em andamento"}
                              {tt.alvo && <> · {tt.rotuloAlvo === "publica" ? "a Dalila publica" : "prazo"} <b className="text-foreground">{format(tt.alvo, tt.rotuloAlvo === "publica" ? "EEE, d MMM 'às' HH:mm" : "EEE, d MMM", { locale: ptBR })}</b></>}
                              {!tt.alvo && t.data_vencimento && <> · prazo {format(new Date(`${t.data_vencimento}T12:00:00`), "EEE, d MMM", { locale: ptBR })}</>}
                            </p>
                            {t.observacao && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">“{t.observacao}”</p>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* 2. As tarefas, por situação */}
                <ListaTarefas titulo="Em andamento" tarefas={emAndamento} hoje={hoje} agora={agora} onMudar={mudarSituacao} onCancelar={(t) => void cancelar(t)} onCopiar={ia ? (t) => void copiarParaIa(t) : undefined} />
                <ListaTarefas titulo="Na fila" vazio="Nada na fila." tarefas={naFila} hoje={hoje} agora={agora} onMudar={mudarSituacao} onCancelar={(t) => void cancelar(t)} onCopiar={ia ? (t) => void copiarParaIa(t) : undefined} />
                {esperando.length > 0 && <ListaTarefas titulo="Esperando sua aprovação" tarefas={esperando} hoje={hoje} agora={agora} onMudar={mudarSituacao} onCancelar={(t) => void cancelar(t)} onRevisar={() => setRevisando(true)} />}
                {feitasHoje.length > 0 && <ListaTarefas titulo="Concluídas hoje" tarefas={feitasHoje} hoje={hoje} agora={agora} onMudar={mudarSituacao} />}
              </div>
            )}

            {/* 3. Passar tarefa: conversa com o funcionário; a tarefa rápida fica de reserva. */}
            <div className="rounded-lg border">
              <button type="button" onClick={() => setPassarTarefa(!passarTarefa)}
                className="flex w-full items-center gap-1.5 px-3 py-2 text-sm font-medium hover:bg-muted/50">
                <Plus className="h-4 w-4" />Passar tarefa para {membro.nome}
              </button>
              {passarTarefa && (
                <div className="space-y-2 border-t p-3">
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

                </div>
              )}
            </div>

            <InteligenciaMembro clienteId={clienteId} membro={membro} />
            <RevisaoEntrega clienteId={clienteId} tarefas={esperando} aberto={revisando} onFechar={() => setRevisando(false)}
              onMudou={() => { void carregar(); onMudou(); }} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ListaTarefas({ titulo, vazio, tarefas, hoje, agora, onMudar, onCopiar, onCancelar, onRevisar }: {
  onRevisar?: (t: TarefaFila) => void;
  titulo: string; vazio?: string; tarefas: TarefaFila[]; hoje: string; agora: number; onMudar: (t: TarefaResumo, situacao: string) => void;
  onCancelar?: (t: TarefaFila) => void;
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
                  <p className={cn("break-words text-sm font-medium", t.concluida && "text-muted-foreground line-through")}>{t.titulo}</p>
                  <p className={cn("flex items-center gap-1 text-xs", atrasada ? "text-rose-500" : "text-muted-foreground")}>
                    {t.data_vencimento && <><CalendarDays className="h-3 w-3" />{atrasada ? "Atrasada · " : ""}{format(new Date(`${t.data_vencimento}T12:00:00`), "EEE, d MMM", { locale: ptBR })}</>}
                    {t.tipo && <span>{t.data_vencimento ? " · " : ""}{TIPOS.find((x) => x.valor === t.tipo)?.rotulo ?? t.tipo}</span>}
                    {(() => { const tt = tempoDaTarefa(t, agora); return !t.concluida && tt.falta != null ? <span> · falta {faltaTexto(tt.falta)}{tt.rotuloAlvo === "publica" ? " pra publicar" : ""}</span> : null; })()}
                  </p>
                  {!t.concluida && (() => { const tt = tempoDaTarefa(t, agora); return tt.pct != null && tt.pct > 0 ? <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-sky-500" style={{ width: `${tt.pct}%` }} /></div> : null; })()}
                </div>
                {onRevisar && !t.concluida && (
                  <button type="button" onClick={() => onRevisar(t)} title="Ler a entrega e aprovar ou pedir ajuste"
                    className="flex h-7 shrink-0 items-center gap-1 rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                    <Eye className="h-3 w-3" />Ver e aprovar
                  </button>
                )}
                {onCopiar && !t.concluida && (
                  <button type="button" onClick={() => onCopiar(t)} title="Copiar título e roteiro pro ChatGPT"
                    className="flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-xs hover:bg-accent">
                    <Copy className="h-3 w-3" />Copiar
                  </button>
                )}
                {onCancelar && !t.concluida && (
                  <button type="button" onClick={() => onCancelar(t)} title="Cancelar tarefa (vai pra Lixeira)"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600">
                    <X className="h-3.5 w-3.5" />
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
