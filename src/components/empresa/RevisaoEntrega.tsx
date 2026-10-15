import { useEffect, useState } from "react";
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

// "Aprovar entrega" (pedido do Davi, 15/10): abre o documento que o
// funcionário entregou, pra ler ali mesmo e aprovar ou pedir ajuste.
export interface TarefaParaRevisar { id: string; titulo: string }
interface Doc { id: string; titulo: string; conteudo: string | null; updated_at: string }

export function RevisaoEntrega({ clienteId, tarefas, aberto, onFechar, onMudou }: {
  clienteId: string; tarefas: TarefaParaRevisar[]; aberto: boolean; onFechar: () => void; onMudou: () => void;
}) {
  const [indice, setIndice] = useState(0);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [info, setInfo] = useState<{ observacao: string | null; responsavel: string | null } | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [ajuste, setAjuste] = useState("");
  const [salvando, setSalvando] = useState<"aprovar" | "ajuste" | null>(null);
  const tarefa = tarefas[Math.min(indice, tarefas.length - 1)];

  useEffect(() => { if (aberto) setIndice(0); }, [aberto]);
  useEffect(() => {
    if (!aberto || !tarefa) return;
    let vivo = true;
    setCarregando(true); setAjuste("");
    void (async () => {
      const [{ data: d }, { data: a }] = await Promise.all([
        supabase.from("documentos").select("id, titulo, conteudo, updated_at").eq("atividade_id", tarefa.id).is("deleted_at", null).order("updated_at", { ascending: false }),
        supabase.from("atividades").select("observacao, responsavel_id").eq("id", tarefa.id).maybeSingle(),
      ]);
      const { data: m } = a?.responsavel_id ? await supabase.from("membros").select("nome").eq("id", a.responsavel_id).maybeSingle() : { data: null };
      if (!vivo) return;
      setDocs((d || []) as Doc[]);
      setInfo({ observacao: a?.observacao ?? null, responsavel: m?.nome ?? null });
      setCarregando(false);
    })();
    return () => { vivo = false; };
  }, [aberto, tarefa]);

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
      <DialogContent className="flex max-h-[92vh] max-w-3xl flex-col gap-3 overflow-hidden">
        {tarefa && (
          <>
            <DialogHeader>
              <DialogTitle className="break-words pr-6 text-lg leading-snug">{tarefa.titulo}</DialogTitle>
              <DialogDescription className="break-words">
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
            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border bg-background p-4">
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
            <div className="space-y-2">
              <Textarea value={ajuste} onChange={(e) => setAjuste(e.target.value)} rows={2} className="text-sm"
                placeholder={`Quer mudar algo? Escreva o ajuste para ${info?.responsavel ?? "o funcionário"}…`} />
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" className="gap-1.5" disabled={!ajuste.trim() || !!salvando} onClick={() => void ajustar()}>
                  {salvando === "ajuste" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PencilLine className="h-4 w-4" />}Pedir ajuste
                </Button>
                <Button className="gap-1.5" disabled={!!salvando || !!ajuste.trim()} title={ajuste.trim() ? "Você escreveu um ajuste: clique em Pedir ajuste" : undefined} onClick={() => void aprovar()}>
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
