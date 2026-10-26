import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle2, FileText, ImagePlus, Loader2, MessageSquareQuote, Mic, Paperclip } from "lucide-react";
import { duracaoCurta } from "@/lib/empresa/briefing";
import type { FaltaQuiz } from "@/lib/quiz/faltas";
import type { Andamento } from "./ConversaEntrega";
import { cn } from "@/lib/utils";

// Aba "Em andamento" da revisão (25/10, Davi: "quando tiver algum ajuste sendo feito preciso que mostre o
// que está sendo feito"): quem está trabalhando agora e no quê, cada pedido dele (feito ou ainda em
// andamento, com a resposta) e o que ainda falta no quiz (os pontilhados).
const ICONE_FALTA = { imagem: ImagePlus, audio: Mic, depoimentos: MessageSquareQuote, outro: Paperclip };
const quandoCurto = (iso: string) => format(new Date(iso), "d MMM, HH:mm", { locale: ptBR });

export function AndamentoEntrega({ andamento, faltas, onTestar, onVerEsboco }: {
  andamento: Andamento | null; faltas: FaltaQuiz[]; onTestar: () => void; onVerEsboco: () => void;
}) {
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => { const t = window.setInterval(() => setAgora(Date.now()), 20000); return () => window.clearInterval(t); }, []);
  const pedidos = [...(andamento?.pedidos ?? [])].reverse();
  const abertos = pedidos.filter((p) => !p.feito).length;

  return (
    <div className="space-y-5 text-sm">
      <section className={cn("rounded-xl border p-3", andamento?.esperando ? "border-amber-500/40 bg-amber-500/10" : "bg-muted/40")}>
        {andamento?.esperando ? (
          <div className="flex items-start gap-2">
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-amber-600 dark:text-amber-300" />
            <div className="min-w-0">
              <p className="font-medium">{andamento.quem} {andamento.fazendo ? `· ${andamento.fazendo}` : "está lendo e trabalhando no seu pedido"}</p>
              {andamento.desde && <p className="text-xs text-muted-foreground">há {duracaoCurta(Math.max(0, Math.round((agora - new Date(andamento.desde).getTime()) / 1000)))} · o quiz muda aqui na hora</p>}
            </div>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            {pedidos.length ? "Ninguém trabalhando agora: tudo que você pediu já foi respondido." : "Nenhum ajuste pedido ainda. Peça no chat ao lado."}
          </p>
        )}
      </section>

      <section>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          Seus pedidos {pedidos.length > 0 && <span className="text-xs font-normal text-muted-foreground">{abertos ? `${abertos} em andamento · ` : ""}{pedidos.length - abertos} feitos</span>}
        </h3>
        {!pedidos.length ? <p className="text-xs text-muted-foreground">Quando você pedir um ajuste, ele aparece aqui.</p> : (
          <ol className="space-y-2">
            {pedidos.map((p) => (
              <li key={p.id} className={cn("rounded-lg border p-2.5", !p.feito && "border-amber-500/40")}>
                <div className="flex items-start gap-2">
                  {p.feito ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-amber-600 dark:text-amber-300" />}
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-3 whitespace-pre-line break-words">{p.texto}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{p.feito ? "Feito" : "Em andamento"} · pedido em {quandoCurto(p.quando)}</p>
                    {p.resposta && (
                      <p className="mt-1.5 line-clamp-2 border-l-2 pl-2 text-xs text-muted-foreground">
                        <b className="text-foreground">{p.resposta.quem}:</b> {p.resposta.texto}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold">Ainda falta no quiz {faltas.length > 0 && <span className="text-xs font-normal text-muted-foreground">{faltas.length}</span>}</h3>
        {!faltas.length ? <p className="flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-emerald-600" />Nada faltando: todas as imagens e áudios estão no lugar.</p> : (
          <>
            <ul className="space-y-1.5">
              {faltas.map((f) => {
                const Icone = ICONE_FALTA[f.tipo];
                return (
                  <li key={f.caminho} className="flex items-start gap-2 rounded-lg border border-dashed p-2">
                    <Icone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0"><b>{f.onde}</b> · {f.nota}</span>
                  </li>
                );
              })}
            </ul>
            <button type="button" onClick={onTestar} className="mt-2 text-xs text-primary underline-offset-2 hover:underline">
              Enviar pelo "Testar o quiz" (clique no pontilhado)
            </button>
          </>
        )}
      </section>

      <button type="button" onClick={onVerEsboco} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <FileText className="h-3.5 w-3.5" />Ver o esboço aprovado
      </button>
    </div>
  );
}
