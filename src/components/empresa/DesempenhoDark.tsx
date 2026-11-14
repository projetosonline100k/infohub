import { useMemo } from "react";
import { Eye, Heart, Loader2, MessageCircle, RefreshCw, TrendingDown, TrendingUp, Users, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { compacto, resumirVideos, seguidoresAtuais, type DiaMetrica, type PostMetrica } from "@/lib/empresa/desempenhoDark";

// Números do perfil dark (13/11/2026, Davi: "quero ver o número atual de seguidores, o número de views que cada vídeo trouxe, leads").
export function DesempenhoDark({ username, dias, posts, leads, atualizando, carregou, onAtualizar, hoje }: {
  username: string | null; dias: DiaMetrica[]; posts: Record<string, PostMetrica>; leads: Record<string, number>; atualizando: boolean; carregou: boolean; onAtualizar: () => void; hoje: string;
}) {
  const seg = useMemo(() => seguidoresAtuais(dias, hoje), [dias, hoje]);
  const r = useMemo(() => resumirVideos(Object.values(posts), leads), [posts, leads]);
  const atualizadoEm = useMemo(() => Math.max(0, ...dias.map((d) => (d.atualizado_em ? Date.parse(d.atualizado_em) : 0))), [dias]);
  const quando = atualizadoEm ? new Date(atualizadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : null;
  const Cartao = ({ Icone, rotulo, valor, sub, cor }: { Icone: typeof Users; rotulo: string; valor: string; sub?: React.ReactNode; cor: string }) => (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#0c1b27] to-[#08121c] p-4">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/50"><Icone className={cn("h-4 w-4", cor)} />{rotulo}</p>
      <p className="mt-1.5 text-3xl font-extrabold tabular-nums">{valor}</p>
      <div className="mt-0.5 min-h-4 text-xs text-white/50">{sub}</div>
    </div>
  );
  return (
    <div className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Cartao Icone={Users} rotulo="Seguidores" cor="text-cyan-300" valor={seg.atual != null ? compacto(seg.atual) : carregou ? "—" : "…"}
          sub={seg.variacao != null ? <span className={cn("flex items-center gap-1 font-semibold", seg.variacao >= 0 ? "text-emerald-300" : "text-rose-300")}>{seg.variacao >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}{seg.variacao >= 0 ? "+" : ""}{seg.variacao.toLocaleString("pt-BR")} em 7 dias</span> : seg.atual != null ? "variação aparece depois de alguns dias" : username ? `@${username}` : "Conecte o Instagram"} />
        <Cartao Icone={Eye} rotulo="Views dos vídeos" cor="text-violet-300" valor={r.videos ? compacto(r.views) : carregou ? "—" : "…"} sub={r.videos ? `${r.videos} vídeo${r.videos === 1 ? "" : "s"} publicado${r.videos === 1 ? "" : "s"}` : "nenhum publicado ainda"} />
        <Cartao Icone={Heart} rotulo="Curtidas e comentários" cor="text-pink-300" valor={r.videos ? `${compacto(r.curtidas)} · ${compacto(r.comentarios)}` : carregou ? "—" : "…"} sub={r.videos ? `${compacto(r.salvamentos)} salvamentos · ${compacto(r.compartilhamentos)} envios` : undefined} />
        <Cartao Icone={UserPlus} rotulo="Leads" cor="text-emerald-300" valor={r.videos ? compacto(r.leads) : carregou ? "—" : "…"} sub={r.leads ? "pessoas que comentaram a palavra e receberam a DM" : "conta quem comenta a palavra de uma automação do vídeo"} />
      </div>
      <div className="flex items-center justify-end gap-2 text-[11px] text-white/40">
        {quando && <span>números de {quando}</span>}
        <button type="button" onClick={onAtualizar} disabled={atualizando} className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-white/60 hover:bg-white/5 disabled:opacity-50">{atualizando ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}Atualizar números</button>
      </div>
    </div>
  );
}

/** Linha curta com os números de um vídeo (lista de roteiros e estúdio). */
export function NumerosDoVideo({ post, leads, pequeno }: { post?: PostMetrica; leads?: number; pequeno?: boolean }) {
  if (!post) return null;
  return (
    <span className={cn("flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-white/60", pequeno ? "text-[11px]" : "text-sm")}>
      <span className="flex items-center gap-1" title="Visualizações"><Eye className="h-3 w-3 text-violet-300" />{compacto(post.visualizacoes)}</span>
      <span className="flex items-center gap-1" title="Curtidas"><Heart className="h-3 w-3 text-pink-300" />{compacto(post.curtidas)}</span>
      <span className="flex items-center gap-1" title="Comentários"><MessageCircle className="h-3 w-3 text-sky-300" />{compacto(post.comentarios)}</span>
      <span className="flex items-center gap-1" title="Leads (comentaram a palavra)"><UserPlus className="h-3 w-3 text-emerald-300" />{compacto(leads ?? 0)}</span>
    </span>
  );
}
