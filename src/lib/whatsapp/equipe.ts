import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/** Quem é da equipe pelo WhatsApp: fala em 3 ou mais grupos de clientes nas últimas 3 semanas.
 *  Guardado por 10 min (a lista de conversas e o número na guia usam a mesma). */
let cache: { quando: number; nomes: Promise<string[]> } | null = null;
export function carregarEquipeWhatsapp(): Promise<string[]> {
  if (cache && Date.now() - cache.quando < 10 * 60_000) return cache.nomes;
  const desde = new Date(Date.now() - 21 * 86_400_000).toISOString();
  const nomes = Promise.resolve((supabase as unknown as SupabaseClient).from("whatsapp_mensagens").select("chat_id, autor_nome")
    .eq("conta", "principal").eq("eh_grupo", true).eq("de_mim", false)
    .gte("enviada_em", desde).not("autor_nome", "is", null).limit(4000))
    .then(({ data }) => {
      const grupos = new Map<string, Set<string>>();
      for (const r of (data ?? []) as { chat_id: string; autor_nome: string | null }[]) {
        if (!r.autor_nome?.trim()) continue;
        if (!grupos.has(r.autor_nome)) grupos.set(r.autor_nome, new Set());
        grupos.get(r.autor_nome)!.add(r.chat_id);
      }
      return [...grupos].filter(([, g]) => g.size >= 3).map(([n]) => n);
    }, () => [] as string[]);
  cache = { quando: Date.now(), nomes };
  return nomes;
}
