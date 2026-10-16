import { useCallback, useEffect, useState } from "react";
import { Eye, RefreshCw, TrendingUp, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { resumoInstagram, type MetricaDiaria, type Periodo } from "@/lib/instagramMetricas";

// Crescimento do Instagram do projeto: histórico diário gravado pela edge
// instagram-metricas (pg_cron todo dia às 03:10 e o botão "Atualizar").

const formatNumber = (value: number) => value.toLocaleString("pt-BR");
const formatDia = (dia: string) => dia.split("-").reverse().slice(0, 2).join("/");

function LinhaPeriodo({ titulo, periodo }: { titulo: string; periodo: Periodo }) {
  return (
    <div className="rounded-md bg-muted/40 p-2.5">
      <p className="text-xs font-medium text-muted-foreground">{titulo}</p>
      {periodo.ganho == null
        ? <p className="text-sm text-muted-foreground">Juntando histórico…</p>
        : <p className={`text-sm font-semibold ${periodo.ganho >= 0 ? "text-emerald-500" : "text-destructive"}`}>
            {periodo.ganho >= 0 ? "+" : ""}{formatNumber(periodo.ganho)} seguidores
            {periodo.desde && <span className="font-normal text-muted-foreground"> desde {formatDia(periodo.desde)}</span>}
          </p>}
      {(periodo.alcance != null || periodo.visualizacoes != null) && (
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Eye className="h-3 w-3" />
          {periodo.alcance != null && `${formatNumber(periodo.alcance)} alcance`}
          {periodo.alcance != null && periodo.visualizacoes != null && " · "}
          {periodo.visualizacoes != null && `${formatNumber(periodo.visualizacoes)} visualizações`}
        </p>
      )}
    </div>
  );
}

export function InstagramInsightsPanel({ clienteId }: { clienteId: string }) {
  const [linhas, setLinhas] = useState<MetricaDiaria[]>([]);
  const [loading, setLoading] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [error, setError] = useState("");

  const carregar = useCallback(async () => {
    const desde = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data, error: requestError } = await supabase.from("instagram_metricas_diarias")
      .select("dia, username, seguidores, alcance, visualizacoes, erro")
      .eq("cliente_id", clienteId).gte("dia", desde).order("dia");
    if (requestError) setError("Não foi possível carregar as métricas do Instagram.");
    else setLinhas(data ?? []);
    setLoading(false);
  }, [clienteId]);

  const atualizar = useCallback(async () => {
    setAtualizando(true);
    setError("");
    const { error: requestError } = await supabase.functions.invoke("instagram-metricas");
    if (requestError) setError("Não foi possível falar com o Instagram agora.");
    await carregar();
    setAtualizando(false);
  }, [carregar]);

  useEffect(() => { setLoading(true); void carregar(); }, [carregar]);

  const resumo = resumoInstagram(linhas);

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-semibold"><TrendingUp className="h-4 w-4" />Instagram</div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void atualizar()} disabled={atualizando} aria-label="Atualizar métricas">
          <RefreshCw className={`h-4 w-4 ${atualizando ? "animate-spin" : ""}`} />
        </Button>
      </div>
      {loading ? <p className="text-sm text-muted-foreground">Carregando…</p>
        : resumo.seguidores == null ? (
          <p className="text-sm text-muted-foreground">
            {error || "Sem métricas ainda. O Instagram deste projeto precisa estar conectado em Automações; a leitura é diária."}
          </p>
        ) : <>
          <p className="text-2xl font-bold">{formatNumber(resumo.seguidores)}</p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3 w-3" />seguidores{resumo.conta ? ` · @${resumo.conta}` : ""}
            {resumo.atualizadoDia && ` · ${formatDia(resumo.atualizadoDia)}`}
          </p>
          <div className="mt-3 space-y-2">
            <LinhaPeriodo titulo="Últimos 7 dias" periodo={resumo.semana} />
            <LinhaPeriodo titulo="Últimos 30 dias" periodo={resumo.mes} />
          </div>
          {resumo.semInsights && (
            <p className="mt-3 text-xs text-amber-600">Alcance e visualizações pedem a permissão de insights: reconecte esta conta em Automações.</p>
          )}
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </>}
    </div>
  );
}
