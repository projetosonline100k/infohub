import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { cn } from "@/lib/utils";

interface Uso {
  plano: string | null;
  janela_5h_pct: number | null;
  janela_5h_renova_em: string | null;
  semanal_pct: number | null;
  semanal_renova_em: string | null;
  extra_ativo: boolean;
  atualizado_em: string;
}

const cor = (pct: number) => (pct >= 85 ? "bg-red-500" : pct >= 60 ? "bg-amber-500" : "bg-emerald-500");
const emQuanto = (iso: string | null) => (iso ? formatDistanceToNowStrict(new Date(iso), { locale: ptBR }) : "—");

function Barra({ rotulo, pct, renova }: { rotulo: string; pct: number | null; renova: string | null }) {
  if (pct == null) return null;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5" title={`${rotulo}: ${pct}% usado · renova em ${emQuanto(renova)}`}>
      <span className="shrink-0">{rotulo}</span>
      <span className="h-1.5 min-w-[28px] flex-1 overflow-hidden rounded-full bg-muted">
        <i className={cn("block h-full rounded-full", cor(pct))} style={{ width: `${Math.min(100, pct)}%` }} />
      </span>
      <b className={cn("shrink-0 tabular-nums", pct >= 85 && "text-red-500")}>{pct}%</b>
    </div>
  );
}

// Rodapé do Jarvis: quanto do plano do Claude já foi usado (limite de 5h e
// semanal). Publicado pela tarefa de cobrança a cada 30 min
// (scripts/uso-claude.py); aqui só lê, em tempo real.
export function JarvisUsoClaude() {
  const { user } = useAuth();
  const [uso, setUso] = useState<Uso | null>(null);

  const carregar = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase.from("claude_uso").select("plano, janela_5h_pct, janela_5h_renova_em, semanal_pct, semanal_renova_em, extra_ativo, atualizado_em").eq("user_id", user.id).maybeSingle();
    setUso((data as Uso | null) ?? null);
  }, [user?.id]);

  useEffect(() => {
    void carregar();
    if (!user?.id) return;
    const canal = supabase
      .channel(`claude-uso-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "claude_uso", filter: `user_id=eq.${user.id}` }, () => { void carregar(); })
      .subscribe();
    const t = setInterval(() => void carregar(), 5 * 60_000);
    return () => { void supabase.removeChannel(canal); clearInterval(t); };
  }, [user?.id, carregar]);

  if (!uso) return null;
  return (
    <div
      className="flex shrink-0 items-center gap-3 border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground"
      title={`Plano ${uso.plano ?? "—"}${uso.extra_ativo ? " · uso extra pago LIGADO" : " · sem gasto extra"} · atualizado há ${emQuanto(uso.atualizado_em)}`}
    >
      <span className="shrink-0 font-semibold">Claude</span>
      <Barra rotulo="5h" pct={uso.janela_5h_pct} renova={uso.janela_5h_renova_em} />
      <Barra rotulo="Semana" pct={uso.semanal_pct} renova={uso.semanal_renova_em} />
    </div>
  );
}
