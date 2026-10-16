import { Bookmark, Eye, Heart, Trophy } from "lucide-react";
import { numeroCurto, topPosts, tituloDoPost, type PostInstagram } from "@/lib/instagramMetricas";

// Top posts do mês: os posts do Instagram do projeto mais vistos nos últimos
// 30 dias (instagram_posts, lidos todo dia pela edge instagram-metricas).

export function NumerosDoPost({ post, className = "" }: { post: PostInstagram; className?: string }) {
  return (
    <span className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground ${className}`}>
      <span className="flex items-center gap-0.5" title="Visualizações"><Eye className="h-3 w-3" />{numeroCurto(post.visualizacoes)}</span>
      <span className="flex items-center gap-0.5" title="Curtidas"><Heart className="h-3 w-3" />{numeroCurto(post.curtidas)}</span>
      <span className="flex items-center gap-0.5" title="Salvamentos"><Bookmark className="h-3 w-3" />{numeroCurto(post.salvamentos)}</span>
    </span>
  );
}

export function TopPostsPanel({ posts, tituloDoCard }: { posts: PostInstagram[]; tituloDoCard: (post: PostInstagram) => string | null }) {
  const top = topPosts(posts);
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center gap-2 font-semibold"><Trophy className="h-4 w-4" />Top posts do mês</div>
      {top.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem posts com números nos últimos 30 dias. A leitura é diária.</p>
      ) : (
        <ol className="space-y-2">
          {top.map((post, i) => (
            <li key={post.ig_media_id}>
              <a href={post.permalink ?? undefined} target="_blank" rel="noreferrer"
                className="block rounded-md bg-muted/40 p-2 text-xs hover:bg-muted">
                <span className="line-clamp-2 font-medium">
                  {i + 1}. {tituloDoCard(post) ?? tituloDoPost(post)}
                </span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  {post.tipo === "REELS" ? "Reel" : "Post"} · {new Date(post.publicado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                </span>
                <NumerosDoPost post={post} className="mt-1 text-[11px]" />
              </a>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
