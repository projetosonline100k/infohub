import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { Check, ChevronDown, Copy, Loader2, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface ItemAnalise {
  transcricao_id: string;
  serve: boolean;
  motivo?: string;
  resumo?: string;
  headlines?: string[];
}

interface Analise {
  id: string;
  cliente_id: string | null;
  nicho_livre: string | null;
  transcricao_ids: string[];
  status: "pedida" | "rodando" | "pronta" | "erro";
  resultado: { resumo_geral?: string; itens?: ItemAnalise[] } | null;
  erro: string | null;
  criada_em: string;
}

function CopiarLinha({ texto }: { texto: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try { await navigator.clipboard.writeText(texto); setOk(true); setTimeout(() => setOk(false), 1400); }
        catch { toast.error("Não consegui copiar"); }
      }}
      className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
      aria-label="Copiar headline"
    >
      {ok ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

// Lista das análises "para cliente" do Creator e o resultado de cada uma:
// quais reels servem pro nicho (com o motivo) e 5 headlines adaptadas por reel.
// Quem analisa é a sessão "Inteligência do Infopro" (scripts/creator-analise.py).
export function CreatorAnalises({ userId, titulos, clientes }: {
  userId: string;
  titulos: Record<string, { titulo: string | null; link: string }>;
  clientes: Record<string, string>;
}) {
  const [analises, setAnalises] = useState<Analise[]>([]);
  const [aberta, setAberta] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const { data } = await supabase.from("creator_analises")
      .select("id, cliente_id, nicho_livre, transcricao_ids, status, resultado, erro, criada_em")
      .eq("user_id", userId).order("criada_em", { ascending: false }).limit(10);
    const lista = (data || []) as unknown as Analise[];
    setAnalises(lista);
    // Abre sozinha a que acabou de ficar pronta.
    setAberta((atual) => atual ?? lista.find((a) => a.status === "pronta")?.id ?? null);
  }, [userId]);

  useEffect(() => {
    void carregar();
    const canal = supabase
      .channel(`creator-analises-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "creator_analises", filter: `user_id=eq.${userId}` }, (p) => {
        const nova = p.new as Partial<Analise> | undefined;
        if (nova?.status === "pronta") { toast.success("Análise pronta no Creator"); setAberta(nova.id ?? null); }
        void carregar();
      })
      .subscribe();
    const t = setInterval(() => void carregar(), 15_000);
    return () => { void supabase.removeChannel(canal); clearInterval(t); };
  }, [userId, carregar]);

  if (!analises.length) return null;

  const apagar = async (id: string) => {
    await supabase.from("creator_analises").delete().eq("id", id);
    setAnalises((a) => a.filter((x) => x.id !== id));
  };

  return (
    <div>
      <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Sparkles className="h-3 w-3" /> Análises
      </div>
      <div className="space-y-1.5">
        {analises.map((a) => {
          const alvo = (a.cliente_id && clientes[a.cliente_id]) || a.nicho_livre || "nicho";
          const itens = a.resultado?.itens ?? [];
          const servem = itens.filter((i) => i.serve).length;
          return (
            <div key={a.id} className={cn("rounded-lg border bg-card", a.status === "pronta" ? "border-violet-500/40" : "border-border")}>
              <button type="button" onClick={() => setAberta(aberta === a.id ? null : a.id)} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-medium">Para {alvo}</div>
                  <div className="text-[10.5px] text-muted-foreground">
                    {a.transcricao_ids.length} reels · {format(new Date(a.criada_em), "dd/MM HH:mm")} ·{" "}
                    {a.status === "pronta" ? <span className="text-green-600">{servem} servem</span>
                      : a.status === "erro" ? <span className="text-red-500">erro</span>
                      : <span className="inline-flex items-center gap-1"><Loader2 className="h-2.5 w-2.5 animate-spin" />{a.status === "rodando" ? "analisando…" : "na fila do Claude"}</span>}
                  </div>
                </div>
                <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", aberta === a.id && "rotate-180")} />
              </button>

              {aberta === a.id && (
                <div className="space-y-2 border-t border-border px-2.5 py-2">
                  {a.status === "erro" && <p className="text-[11.5px] text-red-500">{a.erro}</p>}
                  {(a.status === "pedida" || a.status === "rodando") && (
                    <p className="text-[11.5px] text-muted-foreground">
                      A Inteligência do Infopro está analisando (uns 1–3 min). Se ficar parado, abra o chat dela no Claude e peça “fica ouvindo o Jarvis”.
                    </p>
                  )}
                  {a.resultado?.resumo_geral && <p className="text-[12px] text-muted-foreground">{a.resultado.resumo_geral}</p>}
                  {[...itens].sort((x, y) => Number(y.serve) - Number(x.serve)).map((item) => {
                    const t = titulos[item.transcricao_id];
                    return (
                      <div key={item.transcricao_id} className={cn("rounded-md border p-2", item.serve ? "border-green-600/30 bg-green-500/5" : "border-border opacity-70")}>
                        <div className="flex items-start gap-1.5 text-[12px]">
                          {item.serve ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" /> : <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                          <div className="min-w-0">
                            <div className="font-medium">{t?.titulo || item.resumo || "Reel"}</div>
                            {item.motivo && <div className="text-[11px] text-muted-foreground">{item.motivo}</div>}
                          </div>
                        </div>
                        {item.serve && (item.headlines?.length ?? 0) > 0 && (
                          <ol className="mt-1.5 space-y-0.5 pl-1">
                            {item.headlines!.map((h, i) => (
                              <li key={i} className="flex items-start gap-1 text-[12.5px]">
                                <span className="w-4 shrink-0 text-muted-foreground">{i + 1}.</span>
                                <span className="flex-1">{h}</span>
                                <CopiarLinha texto={h} />
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                    );
                  })}
                  <div className="flex justify-end">
                    <button type="button" onClick={() => void apagar(a.id)} className="inline-flex items-center gap-1 rounded p-1 text-[10.5px] text-muted-foreground hover:text-foreground">
                      <Trash2 className="h-3 w-3" /> apagar análise
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
