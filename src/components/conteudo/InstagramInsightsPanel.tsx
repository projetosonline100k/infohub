import { useCallback, useEffect, useState } from "react";
import { BarChart3, Clock3, RefreshCw, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type Video = { id: string; type: string; url: string; caption: string; timestamp: string; views: number; reach: number; engagement: number; likes: number; comments: number };
type Breakdown = { label: string; value: number };
type Insights = {
  accountName: string; followers: number; growth: number; videosOver3k: Video[]; topVideos: Video[]; fetchedAt: string;
  audience: { genderAge: Breakdown[]; cities: Breakdown[]; countries: Breakdown[]; activeHours: Breakdown[] };
};

const formatNumber = (value: number) => value.toLocaleString("pt-BR");
const videoName = (video: Video) => video.caption.trim() || "Vídeo sem legenda";

export function InstagramInsightsPanel() {
  const [insights, setInsights] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadInsights = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: requestError } = await supabase.functions.invoke<Insights>("instagram-insights");
    if (requestError) {
      let message = requestError.message;
      if (requestError.context instanceof Response) {
        const body = await requestError.context.json().catch(() => null) as { error?: unknown } | null;
        if (typeof body?.error === "string") message = body.error;
      }
      setError(message || "Não foi possível atualizar os dados do Instagram.");
    } else if (data) {
      setInsights(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void loadInsights(); }, [loadInsights]);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-semibold"><Users className="h-4 w-4" />Instagram</div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void loadInsights()} disabled={loading} aria-label="Atualizar insights">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        {loading ? <p className="text-sm text-muted-foreground">Atualizando dados...</p> : error ? <p className="text-sm text-destructive">{error}</p> : insights && <>
          <p className="text-2xl font-bold">{formatNumber(insights.followers)}</p>
          <p className="text-xs text-muted-foreground">seguidores atuais{insights.accountName ? ` · ${insights.accountName}` : ""}</p>
          <p className={`mt-3 text-sm font-medium ${insights.growth >= 0 ? "text-emerald-500" : "text-destructive"}`}>{insights.growth >= 0 ? "+" : ""}{formatNumber(insights.growth)} nos últimos 90 dias</p>
        </>}
      </div>

      {insights && <>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 font-semibold"><BarChart3 className="h-4 w-4" />Vídeos acima de 3k</div>
          <p className="mt-2 text-2xl font-bold">{insights.videosOver3k.length}</p>
          <p className="text-xs text-muted-foreground">publicações com 3 mil+ impressões</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="mb-3 flex items-center gap-2 font-semibold"><Clock3 className="h-4 w-4" />Top 5 vídeos</div>
          <div className="space-y-3">{insights.topVideos.length ? insights.topVideos.map((video, index) => (
            <a key={video.id} href={video.url || undefined} target="_blank" rel="noreferrer" className="block rounded-md hover:bg-muted/50">
              <p className="line-clamp-2 text-xs font-medium">{index + 1}. {videoName(video)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{formatNumber(video.views)} impressões · {formatNumber(video.engagement)} engajamentos</p>
            </a>
          )) : <p className="text-sm text-muted-foreground">Nenhum vídeo no período.</p>}</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="mb-3 flex items-center gap-2 font-semibold"><Clock3 className="h-4 w-4" />Horários do público</div>
          {insights.audience.activeHours.length ? <div className="space-y-1.5 text-sm">{insights.audience.activeHours.map((hour) => <p key={hour.label}><span className="font-medium">{hour.label}h</span> <span className="text-muted-foreground">· {formatNumber(hour.value)} ativos</span></p>)}</div> : <p className="text-xs text-muted-foreground">Indisponível para esta conta.</p>}
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="mb-3 flex items-center gap-2 font-semibold"><Users className="h-4 w-4" />Público</div>
          {insights.audience.genderAge.length ? <div className="space-y-1.5 text-xs">{insights.audience.genderAge.slice(0, 5).map((item) => <p key={item.label}><span className="font-medium">{item.label}</span> <span className="text-muted-foreground">· {formatNumber(item.value)}</span></p>)}</div> : <p className="text-xs text-muted-foreground">Faixa etária indisponível para esta conta.</p>}
          {(insights.audience.cities.length > 0 || insights.audience.countries.length > 0) && <p className="mt-3 text-xs text-muted-foreground">{[...insights.audience.cities, ...insights.audience.countries].slice(0, 5).map((item) => item.label).join(" · ")}</p>}
        </div>
      </>}
    </div>
  );
}
