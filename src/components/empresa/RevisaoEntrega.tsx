import { useMemo, useCallback, useEffect, useRef, useState } from "react";
import { EntregaSemDocumento } from "./EntregaSemDocumento";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BarChart3, CheckCircle2, FileText, GalleryHorizontal, Loader2, Monitor, Pencil, Play, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { htmlLimpo } from "@/lib/conteudo/htmlLimpo";
import { SlidesDoDocumento } from "./SlidesDoDocumento";
import { aprovarEntrega } from "@/lib/empresa/entregas";
import { aprovarEPassarParaRoy, pareceEsbocoDeQuiz } from "@/lib/quiz/passarParaRoy";
import { diffBlocos, type Bloco } from "@/lib/conteudo/diffBlocos";
import { ConversaEntrega } from "./ConversaEntrega";
import { QuizPlayer } from "@/components/quiz/QuizPlayer";
import { MolduraCelular } from "@/components/quiz/MolduraCelular";
import { FileiraQuiz } from "@/components/quiz/FileiraQuiz";
import { AjustesDaTela, EstruturaDoQuiz, faltasDaLamina, PreviaDaTela } from "@/components/quiz/EditorQuiz";
import { MetricasDoQuiz } from "@/components/quiz/QuizMetricas";
import { faltasDoQuiz } from "@/lib/quiz/faltas";
import { AndamentoEntrega } from "./AndamentoEntrega";
import type { Andamento } from "./ConversaEntrega";
import { laminasDoQuiz, ROTULO_STATUS, type EstruturaQuiz, type StatusQuiz } from "@/lib/quiz/quiz";
import type { SupabaseClient } from "@supabase/supabase-js";

const db = supabase as unknown as SupabaseClient;   // quizzes ainda não está nos tipos gerados

// "Aprovar entrega" (pedido do Davi, 15/10): abre o documento que o
// funcionário entregou, pra ler ali mesmo e aprovar ou pedir ajuste. Ao lado,
// o chat com quem entregou (ConversaEntrega): é pela conversa que ele entende
// se é elogio, ajuste ou refazer (sem botão de refazer, pedido do Davi). Quando
// ele mexe no documento, a tela mostra ao vivo: o novo surgindo em verde e o
// que saiu riscado, sumindo.
const ESTILO_REVISAO = `
.rev-novo{background:rgb(16 185 129 / .12);border-left:3px solid rgb(16 185 129);padding-left:.5rem;border-radius:.25rem;
  animation:rev-escreve 1.1s steps(28,end) both;animation-delay:var(--atraso,0s)}
@keyframes rev-escreve{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
.rev-removido{color:rgb(244 63 94);text-decoration:line-through;overflow:hidden;animation:rev-some 6s ease-in forwards}
.rev-removido *{color:inherit!important}
@keyframes rev-some{0%,70%{opacity:.8;max-height:600px}100%{opacity:0;max-height:0;margin:0}}
@media (prefers-reduced-motion:reduce){.rev-novo,.rev-removido{animation:none}}
`;
export interface TarefaParaRevisar { id: string; titulo: string }
interface Doc { id: string; titulo: string; conteudo: string | null; updated_at: string }

const CHAVE_MODO_DOC = "entrega:modo-doc";

export function RevisaoEntrega({ clienteId, tarefas, aberto, onFechar, onMudou }: {
  clienteId: string; tarefas: TarefaParaRevisar[]; aberto: boolean; onFechar: () => void; onMudou: () => void;
}) {
  const [modoDoc, setModoDoc] = useState<"slides" | "documento">(() => {
    try { return localStorage.getItem(CHAVE_MODO_DOC) === "documento" ? "documento" : "slides"; } catch { return "slides"; }
  });
  const mudarModoDoc = (m: "slides" | "documento") => { setModoDoc(m); try { localStorage.setItem(CHAVE_MODO_DOC, m); } catch { /* sem storage */ } };
  const [indice, setIndice] = useState(0);
  const [docs, setDocs] = useState<Doc[]>([]);
  // Quiz criado (etapa 2): o Davi testa aqui mesmo; o esboço fica na outra aba.
  const [quiz, setQuiz] = useState<{ id: string; titulo: string; status: StatusQuiz; estrutura: EstruturaQuiz | null } | null>(null);
  const faltasQuiz = useMemo(() => faltasDoQuiz(quiz?.estrutura), [quiz?.estrutura]);
  // Abas do quiz: Testar / Em andamento (25/10, no lugar de "Esboço aprovado", que fica a um clique de dentro dela).
  // 02/11 (Davi: "mais fácil de usar, ver em qual etapa é cada coisa"): Editar (estrutura, tela grande e ajustes) é o
  // padrão; Visão geral é a fileira; Testar roda o quiz; Métricas funciona mesmo antes de aprovar.
  const [abaQuiz, setAbaQuiz] = useState<"editar" | "geral" | "testar" | "metricas" | "andamento" | "esboco">("editar");
  const verEsboco = abaQuiz === "andamento" || abaQuiz === "esboco";
  const [telaSel, setTelaSel] = useState<string | null>(null);
  const [lateralQuiz, setLateralQuiz] = useState<"ajustes" | "conversa">("ajustes");
  const [respostasQuiz, setRespostasQuiz] = useState<{ perfil: string | null }[]>([]);
  const laminas = useMemo(() => (quiz?.estrutura ? laminasDoQuiz(quiz.estrutura) : []), [quiz?.estrutura]);
  const iTela = Math.max(0, laminas.findIndex((l) => l.chave === telaSel));
  const tela = laminas[iTela];
  const telasProntas = useMemo(() => (quiz?.estrutura ? laminas.filter((l) => !faltasDaLamina(l, quiz.estrutura!, faltasQuiz).length).length : 0), [laminas, quiz?.estrutura, faltasQuiz]);
  const quizId = quiz?.id;
  useEffect(() => {
    if (abaQuiz !== "metricas" || !quizId) return;
    void db.from("quiz_respostas").select("perfil").eq("quiz_id", quizId).then(({ data }) => setRespostasQuiz((data ?? []) as { perfil: string | null }[]));
  }, [abaQuiz, quizId]);
  const [andamento, setAndamento] = useState<Andamento | null>(null);
  // 25/10 (Davi): ver o quiz como no celular (é onde o lead abre). Fica lembrado neste navegador.
  // 25/10: e "em fileira" (todas as telas lado a lado, cada uma com editar e pedido ao agente), que é o padrão.
  type Vista = "computador" | "celular" | "fileira";
  const [vista, setVista] = useState<Vista>(() => {
    try { const v = localStorage.getItem("revisao:quiz-vista"); return v === "computador" || v === "celular" || v === "fileira" ? v : "fileira"; } catch { return "fileira"; }
  });
  const mudarVista = (v: Vista) => { setVista(v); try { localStorage.setItem("revisao:quiz-vista", v); } catch { /* sem armazenamento */ } };
  const noCelular = vista !== "computador";
  const [pedidoTela, setPedidoTela] = useState<{ id: number; texto: string } | null>(null);
  // Editar o quiz aqui mesmo (pedido do Davi, 15/10): clica no texto ou na imagem.
  // O quiz só recomeça quando a estrutura muda por fora (o Roy salvou).
  const [chaveQuiz, setChaveQuiz] = useState(0);
  const estruturaConhecida = useRef("");
  const [info, setInfo] = useState<{ observacao: string | null; responsavel: string | null; responsavelId: string | null } | null>(null);
  const [versao, setVersao] = useState(0);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [escrevendo, setEscrevendo] = useState(false);   // o chat espera resposta: o documento pode mudar a qualquer momento
  const [mudancas, setMudancas] = useState<Record<string, Bloco[]>>({});
  const conhecidos = useRef<Record<string, string>>({});
  const primeiraMudanca = useRef<HTMLDivElement | null>(null);
  const tarefa = tarefas[Math.min(indice, tarefas.length - 1)];
  const tarefaId = tarefa?.id;
  const recarregarDoc = useCallback(() => setVersao((v) => v + 1), []);
  // Quiz já no ar (Conteúdo → Quiz → Editar): só conversa e edição, sem aprovar de novo.
  const noAr = quiz?.status === "publicado" || quiz?.status === "pausado";

  useEffect(() => { if (aberto) setIndice(0); }, [aberto]);
  useEffect(() => {
    if (!aberto || !tarefaId) return;
    let vivo = true;
    if (versao === 0) setCarregando(true);
    void (async () => {
      const [{ data: d }, , { data: a }] = await Promise.all([
        supabase.from("documentos").select("id, titulo, conteudo, updated_at").eq("atividade_id", tarefaId).is("deleted_at", null).order("updated_at", { ascending: false }),
        db.from("quizzes").select("id, titulo, status, estrutura").eq("atividade_id", tarefaId).order("criado_em", { ascending: false }).limit(1).maybeSingle()
          .then((r) => {
            if (!vivo) return;
            const novo = (r.data as typeof quiz) ?? null;
            const json = JSON.stringify(novo?.estrutura ?? null);
            if (json !== estruturaConhecida.current) { estruturaConhecida.current = json; setChaveQuiz((k) => k + 1); }
            setQuiz(novo);
          }),
        supabase.from("atividades").select("observacao, responsavel_id").eq("id", tarefaId).maybeSingle(),
      ]);
      const { data: m } = a?.responsavel_id ? await supabase.from("membros").select("nome").eq("id", a.responsavel_id).maybeSingle() : { data: null };
      if (!vivo) return;
      const lista = (d || []) as Doc[];
      // Versão nova de um documento que já estava na tela: guarda o que mudou pra animar.
      const novas: Record<string, Bloco[]> = {};
      for (const doc of lista) {
        const antes = conhecidos.current[doc.id];
        if (antes != null && antes !== (doc.conteudo ?? "")) novas[doc.id] = diffBlocos(antes, doc.conteudo ?? "");
        conhecidos.current[doc.id] = doc.conteudo ?? "";
      }
      if (Object.keys(novas).length) setMudancas((m) => ({ ...m, ...novas }));
      setDocs(lista);
      setInfo({ observacao: a?.observacao ?? null, responsavel: m?.nome ?? null, responsavelId: a?.responsavel_id ?? null });
      setCarregando(false);
    })();
    return () => { vivo = false; };
  }, [aberto, tarefaId, versao]);
  useEffect(() => { setVersao(0); setMudancas({}); conhecidos.current = {}; setQuiz(null); setAbaQuiz("editar"); setTelaSel(null); setLateralQuiz("ajustes"); setAndamento(null); estruturaConhecida.current = ""; }, [tarefaId]);
  // Enquanto ele trabalha na resposta, confere o documento a cada 3 s (ele pode entregar por partes).
  useEffect(() => {
    if (!escrevendo) return;
    const t = window.setInterval(recarregarDoc, 3000);
    return () => window.clearInterval(t);
  }, [escrevendo, recarregarDoc]);
  useEffect(() => { primeiraMudanca.current?.scrollIntoView({ block: "center", behavior: "smooth" }); }, [mudancas]);

  const depois = (msg: string) => {
    toast.success(msg);
    onMudou();
    if (tarefas.length > 1) setIndice((i) => Math.min(i, tarefas.length - 2)); else onFechar();
  };

  const aprovar = async () => {
    setSalvando(true);
    try { depois(await aprovarEntrega(tarefa.id, clienteId)); }
    catch { toast.error("Não consegui aprovar"); } finally { setSalvando(false); }
  };
  const passarParaRoy = async () => {
    setSalvando(true);
    try { depois(await aprovarEPassarParaRoy(tarefa.id, clienteId)); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Não consegui passar para o Roy"); } finally { setSalvando(false); }
  };
  const salvarQuiz = async (estrutura: EstruturaQuiz) => {
    if (!quiz) return;
    estruturaConhecida.current = JSON.stringify(estrutura);
    setQuiz({ ...quiz, estrutura });
    const { error } = await db.from("quizzes").update({ estrutura }).eq("id", quiz.id);
    if (error) toast.error("Não consegui salvar a mudança no quiz");
  };
  const enviarImagemQuiz = async (arquivo: File) => {
    const { data: u } = await supabase.auth.getUser();
    const ext = (arquivo.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const caminho = `${u.user?.id}/${quiz?.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("quiz-imagens").upload(caminho, arquivo, { contentType: arquivo.type || undefined });
    if (error) { toast.error(arquivo.type.startsWith("audio/") ? "Não consegui enviar o áudio (até 20 MB, mp3/m4a/wav)" : "Não consegui enviar a imagem (até 20 MB)"); throw error; }
    return supabase.storage.from("quiz-imagens").getPublicUrl(caminho).data.publicUrl;
  };
  const pedirAoAgente = (texto: string) => {
    if (!info?.responsavelId) { toast.error("Esta entrega não tem chat com o agente"); return; }
    setPedidoTela({ id: Date.now(), texto });
    setLateralQuiz("conversa");
    toast.success("Pedido mandado para o chat");
  };
  // Esboço de quiz de outro funcionário (sem quiz ligado ainda): dá pra mandar pro Roy criar.
  const esbocoParaRoy = !quiz && !/^roy$/i.test(info?.responsavel ?? "") && pareceEsbocoDeQuiz(tarefa?.titulo, docs[0]?.titulo);
  let marcouPrimeira = false;

  return (
    <Dialog open={aberto && !!tarefa} onOpenChange={(a) => { if (!a) onFechar(); }}>
      <DialogContent className={cn("flex flex-col gap-3 overflow-hidden",
        // Em fileira a revisão ocupa quase a tela toda: cabem mais celulares, inteiros (25/10).
        quiz?.estrutura ? "h-[96vh] w-[98vw] max-w-[98vw]" : "h-[92vh] max-w-6xl")}>
        {tarefa && (
          <>
            <style>{ESTILO_REVISAO}</style>
            <DialogHeader>
              <DialogTitle className="break-words pr-6 text-lg leading-snug">{tarefa.titulo}</DialogTitle>
              <DialogDescription className="line-clamp-2 break-words">
                {info?.responsavel ? `${info.responsavel} entregou` : "Entrega"}{info?.observacao ? ` · ${info.observacao}` : ""}
              </DialogDescription>
            </DialogHeader>
            {tarefas.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {tarefas.map((t, i) => (
                  <button key={t.id} type="button" onClick={() => setIndice(i)}
                    className={cn("max-w-[220px] shrink-0 truncate rounded-full border px-2.5 py-1 text-xs", i === indice ? "border-primary bg-primary/10 font-medium" : "text-muted-foreground hover:bg-muted")}>
                    {i + 1}. {t.titulo}
                  </button>
                ))}
              </div>
            )}
            {quiz?.estrutura && (
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
                  {([["editar", Pencil, "Editar quiz"], ["geral", GalleryHorizontal, "Visão geral"], ["testar", Play, "Testar"], ["metricas", BarChart3, "Métricas"]] as const).map(([a, Icone, rotulo]) => (
                    <button key={a} type="button" onClick={() => setAbaQuiz(a)}
                      className={cn("flex items-center gap-1.5 rounded-md px-3 py-1", abaQuiz === a ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}><Icone className="h-3.5 w-3.5" />{rotulo}</button>
                  ))}
                </div>
                <span className="rounded-full bg-sky-500/15 px-2.5 py-1 text-xs font-medium text-sky-700 dark:text-sky-300">{ROTULO_STATUS[quiz.status]}</span>
                <button type="button" onClick={() => setAbaQuiz("andamento")} title="O que ainda falta e o que o agente está fazendo"
                  className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", faltasQuiz.length ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", verEsboco && "ring-1 ring-current")}>
                  {andamento?.esperando && <Loader2 className="h-3 w-3 animate-spin" />}{faltasQuiz.length ? `Pendências: ${faltasQuiz.length}` : "Sem pendências"}
                </button>
                <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                  {telasProntas} de {laminas.length} telas prontas
                  <span className="h-1.5 w-28 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${laminas.length ? (telasProntas / laminas.length) * 100 : 0}%` }} /></span>
                </span>
              </div>
            )}
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto md:flex-row md:overflow-hidden">
              <div className={cn("min-h-[40vh] flex-1 overflow-y-auto rounded-lg border bg-background p-4 md:min-h-0", quiz?.estrutura && !verEsboco && abaQuiz !== "metricas" && vista !== "computador" && "flex flex-col", quiz?.estrutura && abaQuiz === "editar" && "!flex-row gap-4 overflow-hidden p-3")}>
                {quiz?.estrutura && abaQuiz === "testar" && (
                  <div className="mb-3 flex shrink-0 justify-center gap-1">
                    {(["celular", "computador"] as const).map((c) => {
                      const Icone = c === "celular" ? Smartphone : Monitor;
                      return (
                        <button key={c} type="button" onClick={() => mudarVista(c)}
                          className={cn("flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs", (c === "celular") === noCelular ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted")}><Icone className="h-3.5 w-3.5" />{c === "celular" ? "Celular" : "Computador"}</button>
                      );
                    })}
                  </div>
                )}
                {quiz?.estrutura && abaQuiz === "editar" && tela ? (
                  <>
                    <div className="flex w-[280px] shrink-0 flex-col"><EstruturaDoQuiz laminas={laminas} estrutura={quiz.estrutura} faltas={faltasQuiz} selecionada={tela.chave} onEscolher={setTelaSel} /></div>
                    <PreviaDaTela titulo={quiz.titulo} estrutura={quiz.estrutura} lamina={tela} numero={iTela + 1} total={laminas.length}
                      onAnterior={() => setTelaSel(laminas[iTela - 1]?.chave ?? tela.chave)} onProxima={() => setTelaSel(laminas[iTela + 1]?.chave ?? tela.chave)}
                      onMudar={(e) => void salvarQuiz(e)} onImagem={enviarImagemQuiz} />
                  </>
                ) : quiz?.estrutura && abaQuiz === "geral" ? (
                  <FileiraQuiz quizId={quiz.id} titulo={quiz.titulo} estrutura={quiz.estrutura} editarTudo={false}
                    agente={andamento?.quem ?? info?.responsavel ?? "o agente"}
                    onMudar={(e) => void salvarQuiz(e)} onImagem={enviarImagemQuiz} onPedir={pedirAoAgente} />
                ) : quiz?.estrutura && abaQuiz === "metricas" ? (
                  <div className="mx-auto max-w-3xl">
                    {quiz.status !== "publicado" && <p className="mb-4 rounded-lg bg-muted p-3 text-xs text-muted-foreground">O quiz ainda não está publicado: os números começam a contar quando as pessoas abrirem o link. Seus testes aqui não entram.</p>}
                    <MetricasDoQuiz quiz={quiz} respostas={respostasQuiz} />
                  </div>
                ) : quiz?.estrutura && abaQuiz === "testar" ? (
                  noCelular ? (
                    <MolduraCelular escuro={quiz.estrutura.tema === "escuro"}>
                      <QuizPlayer key={chaveQuiz} titulo={quiz.titulo} estrutura={quiz.estrutura} teste telaCheia />
                    </MolduraCelular>
                  ) : (
                    <QuizPlayer key={chaveQuiz} titulo={quiz.titulo} estrutura={quiz.estrutura} teste />
                  )
                ) : quiz?.estrutura && abaQuiz === "andamento" ? (
                  <AndamentoEntrega andamento={andamento} faltas={faltasQuiz} onTestar={() => setAbaQuiz("editar")} onVerEsboco={() => setAbaQuiz("esboco")} />
                ) : carregando ? (
                  <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : docs.length === 0 ? (
                  <EntregaSemDocumento tarefaId={tarefaId!} observacao={info?.observacao ?? null} />
                ) : docs.map((d) => (
                  <div key={d.id} className="mb-6 last:mb-0">
                    <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <FileText className="h-3.5 w-3.5" /><span className="min-w-0 flex-1 truncate">{d.titulo} · {format(new Date(d.updated_at), "d MMM, HH:mm", { locale: ptBR })}</span>
                      {/* 22/10 (Davi: "sou bem visual"): a entrega abre em slides; o texto corrido fica em "Documento". */}
                      <span className="flex shrink-0 rounded-md bg-muted p-0.5 text-[11px] font-medium">
                        {(["slides", "documento"] as const).map((m) => (
                          <button key={m} type="button" onClick={() => mudarModoDoc(m)}
                            className={modoDoc === m ? "rounded bg-background px-2 py-0.5 text-foreground shadow-sm" : "px-2 py-0.5 text-muted-foreground hover:text-foreground"}>
                            {m === "slides" ? "Slides" : "Documento"}
                          </button>
                        ))}
                      </span>
                    </p>
                    {modoDoc === "slides" ? (
                      <SlidesDoDocumento html={d.conteudo ?? ""}
                        mudou={(mudancas[d.id] ?? []).filter((b) => b.tipo === "novo").map((b) => b.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 50))} />
                    ) : mudancas[d.id] ? (
                      <article className="prose prose-sm max-w-none break-words dark:prose-invert prose-headings:mt-5 prose-a:text-primary">
                        {mudancas[d.id].map((b, k, todos) => {
                          const primeira = b.tipo !== "igual" && !marcouPrimeira;
                          if (primeira) marcouPrimeira = true;
                          const ordemNovo = todos.slice(0, k).filter((x) => x.tipo === "novo").length;
                          return (
                            <div key={b.chave} ref={primeira ? primeiraMudanca : undefined}
                              className={b.tipo === "novo" ? "rev-novo" : b.tipo === "removido" ? "rev-removido" : undefined}
                              style={b.tipo === "novo" ? ({ "--atraso": `${ordemNovo * 0.35}s` } as React.CSSProperties) : undefined}
                              dangerouslySetInnerHTML={{ __html: b.html }} />
                          );
                        })}
                      </article>
                    ) : (
                      <article className="prose prose-sm max-w-none break-words dark:prose-invert prose-headings:mt-5 prose-a:text-primary"
                        dangerouslySetInnerHTML={{ __html: htmlLimpo(d.conteudo ?? "") }} />
                    )}
                  </div>
                ))}
              </div>
              {(info?.responsavelId || (quiz?.estrutura && abaQuiz === "editar")) && (
                <div className="flex h-[420px] shrink-0 flex-col gap-2 md:h-auto md:w-[360px]">
                  {quiz?.estrutura && abaQuiz === "editar" && tela && (
                    <>
                      <div className="flex shrink-0 gap-1 rounded-lg bg-muted p-1 text-sm">
                        <button type="button" onClick={() => setLateralQuiz("ajustes")} className={cn("flex-1 rounded-md px-3 py-1", lateralQuiz === "ajustes" ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}>Ajustes</button>
                        <button type="button" onClick={() => setLateralQuiz("conversa")} className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1", lateralQuiz === "conversa" ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}>
                          {andamento?.esperando && <Loader2 className="h-3 w-3 animate-spin" />}Conversa
                        </button>
                      </div>
                      {lateralQuiz === "ajustes" && (
                        <div className="min-h-0 flex-1">
                          <AjustesDaTela estrutura={quiz.estrutura} lamina={tela} numero={iTela + 1} chavePedido={`quiz-tela:${quiz.id}:${tela.chave}`}
                            agente={andamento?.quem ?? info?.responsavel ?? "o agente"} faltas={faltasQuiz} onMudar={(e) => void salvarQuiz(e)} onPedir={pedirAoAgente} />
                        </div>
                      )}
                    </>
                  )}
                  {/* Fica montada mesmo escondida: o chat não perde o andamento nem o rascunho. */}
                  {info?.responsavelId && <div className={cn("min-h-0 flex-1", quiz?.estrutura && abaQuiz === "editar" && lateralQuiz !== "conversa" && "hidden")}><ConversaEntrega key={tarefaId} clienteId={clienteId} tarefaId={tarefa.id} membroId={info.responsavelId}
                    nome={info.responsavel ?? "Funcionário"} onDocumentoMudou={recarregarDoc} onEsperando={setEscrevendo} onAndamento={setAndamento} pedidoExterno={pedidoTela} /></div>}
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <p className="mr-auto text-xs text-muted-foreground">
                {escrevendo ? `${info?.responsavel ?? "Ele"} está trabalhando: o documento muda aqui na hora.`
                  : noAr ? "Quiz publicado: o que você ou o Roy mudarem aqui vale direto no link."
                  : quiz?.status === "esboco" ? "Aprovar o esboço: o Roy começa a criar o quiz no Infopro."
                  : quiz?.status === "revisar" ? "Teste o quiz. Aprovar publica e libera o link."
                  : "Converse com ele: elogio, ajuste ou refazer, ele entende pela conversa."}
              </p>
              {noAr && <Button variant="outline" onClick={onFechar}>Fechar</Button>}
              {esbocoParaRoy && !noAr && (
                <Button variant="outline" className="gap-1.5" disabled={salvando || escrevendo} onClick={() => void passarParaRoy()}
                  title="Aprova o esboço e o Roy cria o quiz no Infopro (aba Quiz)">
                  <CheckCircle2 className="h-4 w-4" />Aprovar e passar pro Roy criar o quiz
                </Button>
              )}
              {!noAr && <Button className="gap-1.5" disabled={salvando || escrevendo} title={escrevendo ? "Espere ele terminar a resposta" : undefined} onClick={() => void aprovar()}>
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{quiz?.status === "esboco" ? "Aprovar esboço" : quiz?.status === "revisar" ? "Aprovar e publicar" : "Aprovar"}
              </Button>}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
