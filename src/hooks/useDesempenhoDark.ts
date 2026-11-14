import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { leadsPorPost, type DiaMetrica, type PostMetrica } from "@/lib/empresa/desempenhoDark";

const db = supabase as unknown as SupabaseClient;

/** Números do Instagram do perfil dark: seguidores por dia, métricas de cada vídeo publicado e os leads (pessoas que comentaram a palavra de uma automação nesse post). */
export function useDesempenhoDark(igUserId: string | undefined, mediaIds: string[]) {
  const [dias, setDias] = useState<DiaMetrica[]>([]);
  const [posts, setPosts] = useState<Record<string, PostMetrica>>({});
  const [leads, setLeads] = useState<Record<string, number>>({});
  const [atualizando, setAtualizando] = useState(false);
  const [carregou, setCarregou] = useState(false);
  const chave = mediaIds.join(",");
  const jaAtualizou = useRef<string | null>(null);

  const carregar = useCallback(async () => {
    if (!igUserId) { setDias([]); setPosts({}); setLeads({}); setCarregou(true); return; }
    const ids = chave ? chave.split(",") : [];
    const [d, p, l] = await Promise.all([
      db.from("instagram_metricas_diarias").select("dia, seguidores, atualizado_em").eq("ig_user_id", igUserId).order("dia", { ascending: false }).limit(30),
      ids.length ? db.from("instagram_posts").select("ig_media_id, visualizacoes, alcance, curtidas, comentarios, salvamentos, compartilhamentos, permalink, atualizado_em").eq("ig_user_id", igUserId).in("ig_media_id", ids) : Promise.resolve({ data: [] }),
      ids.length ? db.from("instagram_automacao_disparos").select("media_id, autor_id").eq("ig_user_id", igUserId).in("media_id", ids).limit(5000) : Promise.resolve({ data: [] }),
    ]);
    setDias((d.data ?? []) as DiaMetrica[]);
    setPosts(Object.fromEntries(((p.data ?? []) as PostMetrica[]).map((x) => [x.ig_media_id, x])));
    setLeads(leadsPorPost((l.data ?? []) as { media_id: string | null; autor_id: string | null }[]));
    setCarregou(true);
  }, [igUserId, chave]);
  useEffect(() => { setCarregou(false); void carregar(); }, [carregar]);

  // A Meta só entrega os números quando alguém pergunta: a edge `instagram-metricas` busca (seguidores de hoje e cada post) e grava.
  const atualizar = useCallback(async () => {
    setAtualizando(true);
    try { await db.functions.invoke("instagram-metricas"); await carregar(); } finally { setAtualizando(false); }
  }, [carregar]);
  // Sem número nenhum, ou número velho (mais de 3 h): busca sozinho uma vez por perfil/vídeos.
  useEffect(() => {
    if (!carregou || !igUserId || jaAtualizou.current === `${igUserId}|${chave}`) return;
    const ultimo = Math.max(0, ...dias.map((x) => (x.atualizado_em ? Date.parse(x.atualizado_em) : 0)), ...Object.values(posts).map((x) => Date.parse(x.atualizado_em)));
    const faltaPost = chave.split(",").filter(Boolean).some((id) => !posts[id]);
    if (!ultimo || Date.now() - ultimo > 3 * 3600_000 || faltaPost) { jaAtualizou.current = `${igUserId}|${chave}`; void atualizar(); }
  }, [carregou, igUserId, chave, dias, posts, atualizar]);

  return { dias, posts, leads, atualizando, carregou, atualizar };
}
