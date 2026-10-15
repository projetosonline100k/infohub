import { useCallback, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle2, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { htmlLimpo } from "@/lib/conteudo/htmlLimpo";
import { aprovarEntrega } from "@/lib/empresa/entregas";
import { diffBlocos, type Bloco } from "@/lib/conteudo/diffBlocos";
import { ConversaEntrega } from "./ConversaEntrega";

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

export function RevisaoEntrega({ clienteId, tarefas, aberto, onFechar, onMudou }: {
  clienteId: string; tarefas: TarefaParaRevisar[]; aberto: boolean; onFechar: () => void; onMudou: () => void;
}) {
  const [indice, setIndice] = useState(0);
  const [docs, setDocs] = useState<Doc[]>([]);
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

  useEffect(() => { if (aberto) setIndice(0); }, [aberto]);
  useEffect(() => {
    if (!aberto || !tarefaId) return;
    let vivo = true;
    if (versao === 0) setCarregando(true);
    void (async () => {
      const [{ data: d }, { data: a }] = await Promise.all([
        supabase.from("documentos").select("id, titulo, conteudo, updated_at").eq("atividade_id", tarefaId).is("deleted_at", null).order("updated_at", { ascending: false }),
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
  useEffect(() => { setVersao(0); setMudancas({}); conhecidos.current = {}; }, [tarefaId]);
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
    try { await aprovarEntrega(tarefa.id, clienteId); depois("Aprovado: a tarefa foi concluída"); }
    catch { toast.error("Não consegui aprovar"); } finally { setSalvando(false); }
  };
  let marcouPrimeira = false;

  return (
    <Dialog open={aberto && !!tarefa} onOpenChange={(a) => { if (!a) onFechar(); }}>
      <DialogContent className="flex h-[92vh] max-w-6xl flex-col gap-3 overflow-hidden">
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
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto md:flex-row md:overflow-hidden">
              <div className="min-h-[40vh] flex-1 overflow-y-auto rounded-lg border bg-background p-4 md:min-h-0">
                {carregando ? (
                  <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : docs.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Não achei documento ligado a esta tarefa. Veja a observação acima ou abra em Atividades.</p>
                ) : docs.map((d) => (
                  <div key={d.id} className="mb-6 last:mb-0">
                    <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <FileText className="h-3.5 w-3.5" />{d.titulo} · {format(new Date(d.updated_at), "d MMM, HH:mm", { locale: ptBR })}
                    </p>
                    {mudancas[d.id] ? (
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
              {info?.responsavelId && (
                <div className="h-[420px] shrink-0 md:h-auto md:w-[340px]">
                  <ConversaEntrega key={tarefaId} clienteId={clienteId} tarefaId={tarefa.id} membroId={info.responsavelId}
                    nome={info.responsavel ?? "Funcionário"} onDocumentoMudou={recarregarDoc} onEsperando={setEscrevendo} />
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <p className="mr-auto text-xs text-muted-foreground">
                {escrevendo ? `${info?.responsavel ?? "Ele"} está trabalhando: o documento muda aqui na hora.` : "Converse com ele: elogio, ajuste ou refazer, ele entende pela conversa."}
              </p>
              <Button className="gap-1.5" disabled={salvando || escrevendo} title={escrevendo ? "Espere ele terminar a resposta" : undefined} onClick={() => void aprovar()}>
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Aprovar
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
