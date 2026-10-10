import { ArrowRight, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RESPOSTA_VOU_FAZER, type CobrancaInteligente } from "@/hooks/useCobrancaInteligente";

interface Props {
  cobranca: CobrancaInteligente;
  onComecar: () => void;
  onFeita: () => void;
  onAdiar: () => void;
  onDescartar: () => void;
  onFalar: () => void;
  onOutraCoisa: () => void;
}

const COR = {
  3: { borda: "border-red-500/70", fundo: "bg-red-500", texto: "text-red-600 dark:text-red-400" },
  2: { borda: "border-orange-400/70", fundo: "bg-orange-500", texto: "text-orange-600 dark:text-orange-400" },
  1: { borda: "border-amber-300/70", fundo: "bg-amber-500", texto: "text-amber-600 dark:text-amber-400" },
} as const;

// Cartão da cobrança inteligente (ver useCobrancaInteligente), organizado
// pra bater o olho: o que fazer → por quê (até 3 tópicos) → primeiro passo
// com tempo → o que vem depois. Ação principal em destaque; o resto discreto.
export function AssistantCobrancaCard({ cobranca: c, onComecar, onFeita, onAdiar, onDescartar, onFalar, onOutraCoisa }: Props) {
  const cor = COR[(Math.min(3, Math.max(1, c.urgencia)) as 1 | 2 | 3)];
  const estruturada = c.fatos.length > 0 || !!c.primeiro_passo;
  // Voltou depois do "Bora, vou fazer": pergunta se fez.
  const cobrandoCompromisso = c.resposta === RESPOSTA_VOU_FAZER;
  return (
    <div
      role="alert"
      className={cn(
        "box-border flex max-h-[360px] w-[340px] flex-col overflow-hidden rounded-xl border-2 bg-popover text-popover-foreground shadow-lg",
        "animate-in fade-in-0 slide-in-from-bottom-1 zoom-in-95",
        cor.borda,
      )}
    >
      <div className="min-h-0 space-y-2 overflow-y-auto px-4 pb-2 pt-3">
        <div className="flex items-center gap-1.5">
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white", cor.fundo)}>
            <Flame className="h-3 w-3" /> {c.etiqueta || (c.urgencia >= 3 ? "Urgente" : "Agora")}
          </span>
          {c.vezes_adiada > 0 && <span className="text-[11px] font-semibold text-red-500">adiado {c.vezes_adiada}x</span>}
        </div>

        {cobrandoCompromisso && (
          <p className={cn("text-[12px] font-semibold", cor.texto)}>Você disse que ia fazer. Fez?</p>
        )}
        <p className="text-[15px] font-bold leading-snug">{c.titulo}</p>

        {estruturada ? (
          <>
            {/* Voltando do "vou fazer": o porquê ele já leu — só o essencial. */}
            {c.fatos.length > 0 && !cobrandoCompromisso && (
              <ul className="space-y-0.5 text-[12.5px] text-muted-foreground">
                {c.fatos.map((f, i) => (
                  <li key={i} className="flex gap-1.5"><span className={cor.texto}>•</span><span>{f}</span></li>
                ))}
              </ul>
            )}
            {c.primeiro_passo && (
              <div className="rounded-lg bg-muted px-2.5 py-2 text-[12.5px]">
                <div className="mb-0.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  <span>Primeiro passo</span>
                  {c.minutos && <span className={cor.texto}>~{c.minutos} min</span>}
                </div>
                <p className="font-medium">{c.primeiro_passo}</p>
              </div>
            )}
            {c.proximos.length > 0 && !cobrandoCompromisso && (
              <div className="text-[12px]">
                <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Depois disso</div>
                <ol className="space-y-0.5">
                  {c.proximos.map((p, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-muted-foreground"><ArrowRight className="mt-0.5 h-3 w-3 shrink-0" />{p}</li>
                  ))}
                </ol>
              </div>
            )}
          </>
        ) : (
          <p className="whitespace-pre-wrap text-[13px] text-muted-foreground">{c.texto}</p>
        )}
      </div>

      <div className="shrink-0 space-y-1 border-t border-border px-3 py-2">
        <div className="flex gap-1.5">
          {cobrandoCompromisso ? (
            <>
              <Button size="sm" className="h-8 flex-1 text-xs font-semibold" onClick={onFeita}>Fiz ✓</Button>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onComecar}>Ainda fazendo</Button>
            </>
          ) : (
            <>
              <Button size="sm" className="h-8 flex-1 text-xs font-semibold" onClick={onComecar}>Bora, vou fazer</Button>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onFeita}>Já fiz</Button>
            </>
          )}
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onAdiar}>+30 min</Button>
        </div>
        <div className="flex items-center justify-between gap-2 px-1 text-[11px] text-muted-foreground">
          <button type="button" className="hover:text-foreground hover:underline" onClick={onFalar} title="Conversar sobre o que está travando">Estou travado</button>
          <button type="button" className="hover:text-foreground hover:underline" onClick={onOutraCoisa} title="Preciso fazer outra coisa agora">Outra coisa agora</button>
          <button type="button" className="hover:text-foreground hover:underline" onClick={onDescartar}>Não é prioridade</button>
        </div>
      </div>
    </div>
  );
}
