import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import type { GrafoFluxo } from "../../supabase/functions/_shared/fluxo";

const db = supabase as unknown as SupabaseClient;

export interface FluxoInstagram {
  id: string; user_id: string; ig_user_id: string; nome: string; ativo: boolean; gatilhos: string[]; palavras_chave: string[];
  correspondencia: "contem" | "exata" | "trecho"; media_ids: string[] | null; respostas_comentario: string[]; grafo: GrafoFluxo; disparos: number;
  criado_em?: string;
}
export type NumerosDoNo = { enviadas: number; respostas: number; rastreadas: number; abertas: number };   // rastreadas/abertas: só mensagens enviadas depois de 15/11 (guardam o bloco e o "visto")
type Execucao = { fluxo_id: string; estado: string; historico: { no: string; tipo: string; em?: string }[] | null };

/** Fluxos de mensagem (migração 20261113170000): lista da conta, salvar, ligar/desligar, apagar, e os números de cada bloco. */
export function useInstagramFluxos(igUserId: string | undefined) {
  const { user } = useAuth();
  const [fluxos, setFluxos] = useState<FluxoInstagram[]>([]);
  const [execucoes, setExecucoes] = useState<Execucao[]>([]);
  const [aberturas, setAberturas] = useState<{ fluxo_id: string; no_id: string; lida_em: string | null; enviada_em: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    if (!user || !igUserId) { setFluxos([]); setExecucoes([]); setLoading(false); return; }
    const [f, e, ab] = await Promise.all([
      db.from("instagram_fluxos").select("*").eq("ig_user_id", igUserId).order("criado_em", { ascending: false }),
      db.from("instagram_fluxo_execucoes").select("fluxo_id, estado, historico").eq("ig_user_id", igUserId).order("criado_em", { ascending: false }).limit(2000),
      db.from("instagram_mensagens").select("fluxo_id, no_id, lida_em, enviada_em").eq("ig_user_id", igUserId).eq("de_mim", true).not("no_id", "is", null).limit(20000),
    ]);
    if (f.error) throw f.error;
    setFluxos((f.data ?? []) as FluxoInstagram[]);
    setExecucoes((e.data ?? []) as Execucao[]);
    setAberturas((ab.data ?? []) as { fluxo_id: string; no_id: string; lida_em: string | null; enviada_em: string }[]);
    setLoading(false);
  }, [user, igUserId]);
  useEffect(() => { setLoading(true); carregar().catch((er) => { console.error("fluxos:", er); setLoading(false); }); }, [carregar]);

  const numeros = useMemo(() => {
    const por: Record<string, Record<string, NumerosDoNo>> = {};
    const pessoas: Record<string, { total: number; fim: number; erro: number }> = {};
    for (const x of execucoes) {
      const p = (pessoas[x.fluxo_id] ??= { total: 0, fim: 0, erro: 0 });
      p.total++; if (x.estado === "fim") p.fim++; if (x.estado === "erro") p.erro++;
      const nos = (por[x.fluxo_id] ??= {});
      for (const h of x.historico ?? []) {
        const n = (nos[h.no] ??= { enviadas: 0, respostas: 0, rastreadas: 0, abertas: 0 });
        if (h.tipo === "mensagem") n.enviadas++;
        if (h.tipo.startsWith("resposta:")) n.respostas++;
      }
    }
    for (const a of aberturas) {
      const n = ((por[a.fluxo_id] ??= {})[a.no_id] ??= { enviadas: 0, respostas: 0, rastreadas: 0, abertas: 0 });
      n.rastreadas++; if (a.lida_em) n.abertas++;
    }
    return { porNo: por, pessoas };
  }, [execucoes, aberturas]);

  /** Os números de cada bloco de UM fluxo numa janela de dias (desde/ate em ms; null = sem limite): enviadas, respostas e aberturas contadas pelo dia em que aconteceram. */
  const numerosDoFluxo = useCallback((fluxoId: string, desde: number | null, ate: number | null): Record<string, NumerosDoNo> => {
    const dentro = (iso?: string | null) => { if (desde === null && ate === null) return true; if (!iso) return false; const t = Date.parse(iso); return (desde === null || t >= desde) && (ate === null || t < ate); };
    const nos: Record<string, NumerosDoNo> = {};
    const no = (id: string) => (nos[id] ??= { enviadas: 0, respostas: 0, rastreadas: 0, abertas: 0 });
    for (const x of execucoes) {
      if (x.fluxo_id !== fluxoId) continue;
      for (const h of x.historico ?? []) {
        if (!dentro(h.em)) continue;
        if (h.tipo === "mensagem") no(h.no).enviadas++;
        if (h.tipo.startsWith("resposta:")) no(h.no).respostas++;
      }
    }
    for (const a of aberturas) {
      if (a.fluxo_id !== fluxoId || !dentro(a.enviada_em)) continue;
      const n = no(a.no_id); n.rastreadas++; if (a.lida_em) n.abertas++;
    }
    return nos;
  }, [execucoes, aberturas]);

  const salvar = async (form: Omit<FluxoInstagram, "id" | "ig_user_id" | "disparos" | "user_id">, id?: string) => {
    if (!user || !igUserId) throw new Error("Conecte uma conta do Instagram primeiro.");
    const { error } = id
      ? await db.from("instagram_fluxos").update({ ...form, atualizado_em: new Date().toISOString() }).eq("id", id)
      : await db.from("instagram_fluxos").insert({ ...form, user_id: user.id, ig_user_id: igUserId });
    if (error) throw error;
    await carregar();
  };
  const alternar = async (f: FluxoInstagram) => {
    setFluxos((l) => l.map((x) => (x.id === f.id ? { ...x, ativo: !f.ativo } : x)));
    const { error } = await db.from("instagram_fluxos").update({ ativo: !f.ativo, atualizado_em: new Date().toISOString() }).eq("id", f.id);
    if (error) { await carregar(); throw error; }
  };
  const apagar = async (id: string) => {
    const { error } = await db.from("instagram_fluxos").delete().eq("id", id);
    if (error) throw error;
    setFluxos((l) => l.filter((x) => x.id !== id));
  };
  return { fluxos, loading, numeros, numerosDoFluxo, recarregar: carregar, salvar, alternar, apagar };
}
