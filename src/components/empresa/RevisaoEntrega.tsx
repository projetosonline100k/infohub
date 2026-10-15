import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle2, FileText, Loader2, PencilLine } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { htmlLimpo } from "@/lib/conteudo/htmlLimpo";
import { aprovarEntrega, pedirAjuste } from "@/lib/empresa/entregas";
import { ConversaEntrega } from "./ConversaEntrega";

// "Aprovar entrega" (pedido do Davi, 15/10): abre o documento que o
// funcionário entregou, pra ler ali mesmo e aprovar ou pedir ajuste. Ao lado,
// o chat com quem entregou (ConversaEntrega): elogio, reforço, mudança pontual.
export interface TarefaParaRevisar { id: string; titulo: string }
interface Doc { id: string; titulo: string; conteudo: string | null; updated_at: string }

export function RevisaoEntrega({ clienteId, tarefas, aberto, onFechar, onMudou }: {
  clienteId: string; tarefas: TarefaParaRevisar[]; aberto: boolean; onFechar: () => void; onMudou: () => void;
}) {
  const [indice, setIndice] = useState(0);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [info, setInfo] = useState<{ observacao: string | null; responsavel: string | null; responsavelId: string | null } | null>(null);
  const [versao, setVersao] = useState(0);
  const [refazer, setRefazer] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [ajuste, setAjuste] = useState("");
  const [salvando, setSalvando] = useState<"aprovar" | "ajuste" | null>(null);
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
      setDocs((d || []) as Doc[]);
      setInfo({ observacao: a?.observacao ?? null, responsavel: m?.nome ?? null, responsavelId: a?.responsavel_id ?? null });
      setCarregando(false);
    })();
    return () => { vivo = false; };
  }, [aberto, tarefaId, versao]);
  useEffect(() => { setAjuste(""); setRefazer(false); setVersao(0); }, [tarefaId]);

  const depois = (msg: string) => {
    toast.success(msg);
    onMudou();
    if (tarefas.length > 1) setIndice((i) => Math.min(i, tarefas.length - 2)); else onFechar();
  };

  const aprovar = async () => {
    setSalvando("aprovar");
    try { await aprovarEntrega(tarefa.id, clienteId); depois("Aprovado: a tarefa foi concluída"); }
    catch { toast.error("Não consegui aprovar"); } finally { setSalvando(null); }
  };
  const ajustar = async () => {
    if (!ajuste.trim()) return;
    setSalvando("ajuste");
    try { await pedirAjuste(tarefa.id, ajuste); depois(`${info?.responsavel ?? "O funcionário"} vai ajustar e te entrega de novo`); }
    catch { toast.error("Não consegui pedir o ajuste"); } finally { setSalvando(null); }
  };

  return (
    <Dialog open={aberto && !!tarefa} onOpenChange={(a) => { if (!a) onFechar(); }}>
      <DialogContent className="flex h-[92vh] max-w-6xl flex-col gap-3 overflow-hidden">
        {tarefa && (
          <>
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
                    <article className="prose prose-sm max-w-none break-words dark:prose-invert prose-headings:mt-5 prose-a:text-primary"
                      dangerouslySetInnerHTML={{ __html: htmlLimpo(d.conteudo ?? "") }} />
                  </div>
                ))}
              </div>
              {info?.responsavelId && (
                <div className="h-[420px] shrink-0 md:h-auto md:w-[340px]">
                  <ConversaEntrega key={tarefaId} clienteId={clienteId} tarefaId={tarefa.id} membroId={info.responsavelId}
                    nome={info.responsavel ?? "Funcionário"} onDocumentoMudou={recarregarDoc} />
                </div>
              )}
            </div>
            <div className="space-y-2">
              {refazer && (
                <Textarea value={ajuste} onChange={(e) => setAjuste(e.target.value)} rows={2} className="text-sm" autoFocus
                  placeholder={`O que ${info?.responsavel ?? "o funcionário"} deve refazer? A tarefa volta para a fila dele e ele refaz o documento.`} />
              )}
              <div className="flex flex-wrap items-center justify-end gap-2">
                <p className="mr-auto text-xs text-muted-foreground">Mudança pequena? Peça no chat. Refazer é para quando precisa trabalhar de novo.</p>
                {refazer ? (
                  <Button variant="outline" className="gap-1.5" disabled={!ajuste.trim() || !!salvando} onClick={() => void ajustar()}>
                    {salvando === "ajuste" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PencilLine className="h-4 w-4" />}Mandar refazer
                  </Button>
                ) : (
                  <Button variant="ghost" className="gap-1.5" onClick={() => setRefazer(true)}><PencilLine className="h-4 w-4" />Mandar refazer…</Button>
                )}
                <Button className="gap-1.5" disabled={!!salvando} onClick={() => void aprovar()}>
                  {salvando === "aprovar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Aprovar
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
