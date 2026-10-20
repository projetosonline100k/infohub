import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Flag, Pencil, Target } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { corridaMeta, numeroCurto, type PontoSeguidores } from "@/lib/metaSeguidores";

// Corrida até a meta de seguidores no Cronograma (20/10, Davi: "colocar a minha meta, tipo bater
// 100k de seguidores, e ter uma corrida até chegar, para ser visual"). Meta em clientes.meta_seguidores;
// seguidores de instagram_metricas_diarias (lidos todo dia às 03:10).
const db = supabase as unknown as SupabaseClient;   // colunas novas, fora dos tipos gerados
const dataBonita = (d: string) => format(new Date(`${d}T12:00:00`), "d 'de' MMM 'de' yyyy", { locale: ptBR });

type Meta = { meta_seguidores: number | null; meta_seguidores_prazo: string | null; meta_seguidores_desde: string | null };

export function CorridaMeta({ clienteId }: { clienteId: string }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [serie, setSerie] = useState<PontoSeguidores[]>([]);
  const [conta, setConta] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState("");
  const [prazo, setPrazo] = useState("");

  const carregar = useCallback(async () => {
    const [m, s] = await Promise.all([
      db.from("clientes").select("meta_seguidores, meta_seguidores_prazo, meta_seguidores_desde").eq("id", clienteId).maybeSingle(),
      db.from("instagram_metricas_diarias").select("dia, username, seguidores").eq("cliente_id", clienteId)
        .not("seguidores", "is", null).gte("dia", new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10)).order("dia"),
    ]);
    setMeta((m.data as Meta | null) ?? { meta_seguidores: null, meta_seguidores_prazo: null, meta_seguidores_desde: null });
    // Projeto com mais de uma conta: a corrida é da que tem o dado mais recente.
    const linhas = (s.data || []) as { dia: string; username: string | null; seguidores: number }[];
    const principal = linhas.at(-1)?.username ?? null;
    setConta(principal);
    setSerie(linhas.filter((l) => l.username === principal));
  }, [clienteId]);

  useEffect(() => { void carregar(); }, [carregar]);

  const abrirEdicao = (aberto: boolean) => {
    setEditando(aberto);
    if (aberto) { setValor(meta?.meta_seguidores ? String(meta.meta_seguidores) : "100000"); setPrazo(meta?.meta_seguidores_prazo ?? ""); }
  };

  const salvar = async () => {
    const n = Number(valor.replace(/\D/g, ""));
    if (!n) { toast.error("Coloque a meta de seguidores (ex.: 100000)."); return; }
    const nova = n !== meta?.meta_seguidores;
    const { error } = await db.from("clientes").update({
      meta_seguidores: n, meta_seguidores_prazo: prazo || null,
      // Meta nova: a largada é hoje. Só mudou o prazo: mantém a largada.
      meta_seguidores_desde: nova || !meta?.meta_seguidores_desde ? new Date().toISOString().slice(0, 10) : meta.meta_seguidores_desde,
    }).eq("id", clienteId);
    if (error) { toast.error("Não consegui salvar a meta."); return; }
    setEditando(false);
    void carregar();
  };

  if (!meta) return null;
  const c = meta.meta_seguidores ? corridaMeta(serie, meta.meta_seguidores, { desde: meta.meta_seguidores_desde, prazo: meta.meta_seguidores_prazo }) : null;

  const editor = (
    <Popover open={editando} onOpenChange={abrirEdicao}>
      <PopoverTrigger asChild>
        {meta.meta_seguidores
          ? <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs"><Pencil className="h-3 w-3" /> Mudar meta</Button>
          : <Button size="sm" className="gap-1"><Target className="h-4 w-4" /> Definir meta</Button>}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3">
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Meta de seguidores</span>
          <Input inputMode="numeric" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="100000" autoFocus />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Prazo <span className="font-normal text-muted-foreground">(opcional)</span></span>
          <Input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
        </label>
        <Button className="w-full" onClick={() => void salvar()}>Salvar</Button>
      </PopoverContent>
    </Popover>
  );

  if (!meta.meta_seguidores) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed bg-card p-4">
        <span className="text-2xl">🏁</span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Corrida até a meta</p>
          <p className="text-sm text-muted-foreground">Coloque sua meta de seguidores (ex.: 100 mil) e acompanhe a corrida até lá.</p>
        </div>
        {editor}
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Flag className="h-4 w-4 text-primary" />
        <h4 className="font-semibold">Corrida até {numeroCurto(meta.meta_seguidores)} de seguidores</h4>
        {conta && <span className="text-xs text-muted-foreground">@{conta}</span>}
        <span className="ml-auto">{editor}</span>
      </div>

      {!c ? (
        <p className="text-sm text-muted-foreground">Sem números de seguidores ainda: o Instagram deste projeto precisa estar conectado em Automações (a leitura é diária).</p>
      ) : (
        <>
          {/* A pista: do zero até a meta, com as placas no caminho e o corredor onde está hoje. */}
          <div className="relative mx-3 mb-7 mt-9 h-4">
            <div className="absolute inset-0 rounded-full bg-muted" style={{ backgroundImage: "repeating-linear-gradient(90deg, transparent 0 18px, hsl(var(--background) / 0.55) 18px 22px)" }} />
            <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-lime-400 transition-[width] duration-700"
              style={{ width: `${c.pct}%` }} />
            {c.pctLargada > 1 && c.pctLargada < 99 && (
              <span className="absolute top-full mt-1 -translate-x-1/2 whitespace-nowrap text-[10px] text-muted-foreground" style={{ left: `${c.pctLargada}%` }}>
                largada {numeroCurto(c.largada)}
              </span>
            )}
            {c.marcos.map((m) => (
              <span key={m} className="absolute top-0 h-full w-px bg-foreground/25" style={{ left: `${(m / c.meta) * 100}%` }}>
                <span className={cn("absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium", c.atual >= m ? "text-emerald-600" : "text-muted-foreground")}>
                  {numeroCurto(m)}
                </span>
              </span>
            ))}
            <span className="absolute -top-8 -translate-x-1/2 text-2xl drop-shadow transition-[left] duration-700" style={{ left: `${Math.max(2, Math.min(98, c.pct))}%` }} title={`${c.atual.toLocaleString("pt-BR")} seguidores`}>
              {c.chegou ? "🏆" : "🏃"}
            </span>
            <span className="absolute -right-3 -top-8 text-2xl">🏁</span>
            <span className="absolute -right-3 top-full mt-1 whitespace-nowrap text-[10px] font-semibold">{numeroCurto(c.meta)}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Numero rotulo="Agora" valor={c.atual.toLocaleString("pt-BR")} extra={`${c.pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% da meta`} />
            <Numero rotulo={c.chegou ? "Meta batida!" : "Faltam"} valor={c.chegou ? "🎉" : c.faltam.toLocaleString("pt-BR")}
              extra={c.largada < c.atual ? `+${(c.atual - c.largada).toLocaleString("pt-BR")} desde a largada` : undefined} />
            <Numero rotulo="Ritmo" valor={c.ritmoDia == null ? "—" : `${c.ritmoDia >= 0 ? "+" : ""}${Math.round(c.ritmoDia).toLocaleString("pt-BR")}/dia`} extra="média dos últimos 7 dias" />
            {meta.meta_seguidores_prazo && !c.chegou ? (
              <Numero rotulo={`Prazo · ${dataBonita(meta.meta_seguidores_prazo)}`}
                valor={`+${(c.precisaPorDia ?? 0).toLocaleString("pt-BR")}/dia`}
                extra={c.noRitmo == null ? "precisa por dia" : c.noRitmo ? "✅ no ritmo para bater" : "⚠️ acima do ritmo de hoje"}
                tom={c.noRitmo == null ? undefined : c.noRitmo ? "ok" : "alerta"} />
            ) : (
              <Numero rotulo="Nesse ritmo, chega em" valor={c.chegou ? "já chegou" : c.previsao ? dataBonita(c.previsao) : "—"}
                extra={!c.chegou && !c.previsao ? "precisa voltar a crescer" : undefined} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Numero({ rotulo, valor, extra, tom }: { rotulo: string; valor: string; extra?: string; tom?: "ok" | "alerta" }) {
  return (
    <div className={cn("rounded-md p-2.5", tom === "ok" ? "bg-emerald-500/10" : tom === "alerta" ? "bg-amber-500/10" : "bg-muted/40")}>
      <p className="truncate text-xs font-medium text-muted-foreground">{rotulo}</p>
      <p className="truncate text-base font-bold">{valor}</p>
      {extra && <p className={cn("truncate text-[11px]", tom === "alerta" ? "text-amber-600" : tom === "ok" ? "text-emerald-600" : "text-muted-foreground")}>{extra}</p>}
    </div>
  );
}
