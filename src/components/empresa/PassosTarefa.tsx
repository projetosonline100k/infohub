import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { format } from "date-fns";
import { ChevronDown, FilePen, Globe, MessageSquareText, Play, Terminal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

// O que o funcionário (IA) já fez na tarefa, passo a passo (19/10/2026, Davi: "ele já fez tudo isso e
// eu nem sabia; quando eu clicar na atividade dele, quero ver o que já foi feito"). O ouvinte anota
// sozinho em atividades.passos (scripts/empresa/passos.py); aqui aparece ao vivo enquanto ele trabalha.
const db = supabase as unknown as SupabaseClient;

interface Passo { em: string; texto: string; tipo: string }

const ICONE: Record<string, typeof Terminal> = { comando: Terminal, arquivo: FilePen, pesquisa: Globe, nota: MessageSquareText, inicio: Play };

export function PassosTarefa({ atividadeId, aoVivo }: { atividadeId: string; aoVivo?: boolean }) {
  const [passos, setPassos] = useState<Passo[]>([]);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    let vivo = true;
    const carregar = async () => {
      const { data } = await db.from("atividades").select("passos").eq("id", atividadeId).maybeSingle();
      if (vivo && Array.isArray(data?.passos)) setPassos(data.passos as Passo[]);
    };
    void carregar();
    const t = aoVivo ? window.setInterval(() => void carregar(), 8000) : undefined;
    return () => { vivo = false; if (t) window.clearInterval(t); };
  }, [atividadeId, aoVivo]);

  if (!passos.length) return null;
  const mostrados = aberto ? passos : passos.slice(-3);
  return (
    <div className="mt-2 rounded-lg border border-border/70 bg-background/60 px-2.5 py-2">
      <button type="button" onClick={() => setAberto((a) => !a)}
        className="flex w-full items-center gap-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground">
        O que já foi feito ({passos.length})
        {aoVivo && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" aria-label="ao vivo" />}
        <ChevronDown className={cn("ml-auto h-3.5 w-3.5 transition-transform", aberto && "rotate-180")} />
      </button>
      {!aberto && passos.length > 3 && <p className="mt-1 text-[11px] text-muted-foreground">… {passos.length - 3} passos antes (clique para ver tudo)</p>}
      <ol className={cn("mt-1 space-y-1", aberto && "max-h-72 overflow-y-auto pr-1")}>
        {mostrados.map((p, i) => {
          const Icone = ICONE[p.tipo] ?? Terminal;
          return (
            <li key={`${p.em}-${i}`} className="flex items-start gap-2 text-xs">
              <span className="w-10 shrink-0 tabular-nums text-muted-foreground">{format(new Date(p.em), "HH:mm")}</span>
              <Icone className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
              <span className={cn("min-w-0 flex-1 break-words", p.tipo === "nota" ? "text-foreground" : "text-muted-foreground")}>{p.texto}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
