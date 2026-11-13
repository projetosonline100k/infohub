import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import type { GrafoFluxo } from "../../supabase/functions/_shared/fluxo";

const db = supabase as unknown as SupabaseClient;

export interface FluxoInstagram {
  id: string; user_id: string; ig_user_id: string; nome: string; ativo: boolean; gatilhos: string[]; palavras_chave: string[];
  correspondencia: "contem" | "exata"; media_ids: string[] | null; respostas_comentario: string[]; grafo: GrafoFluxo; disparos: number;
  criado_em?: string;
}
export type NumerosDoNo = { enviadas: number; respostas: number };
type Execucao = { fluxo_id: string; estado: string; historico: { no: string; tipo: string }[] | null };

/** Fluxos de mensagem (migração 20261113170000): lista da conta, salvar, ligar/desligar, apagar, e os números de cada bloco. */
export function useInstagramFluxos(igUserId: string | undefined) {
  const { user } = useAuth();
  const [fluxos, setFluxos] = useState<FluxoInstagram[]>([]);
  const [execucoes, setExecucoes] = useState<Execucao[]>([]);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    if (!user || !igUserId) { setFluxos([]); setExecucoes([]); setLoading(false); return; }
    const [f, e] = await Promise.all([
      db.from("instagram_fluxos").select("*").eq("ig_user_id", igUserId).order("criado_em", { ascending: false }),
      db.from("instagram_fluxo_execucoes").select("fluxo_id, estado, historico").eq("ig_user_id", igUserId).order("criado_em", { ascending: false }).limit(2000),
    ]);
    if (f.error) throw f.error;
    setFluxos((f.data ?? []) as FluxoInstagram[]);
    setExecucoes((e.data ?? []) as Execucao[]);
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
        const n = (nos[h.no] ??= { enviadas: 0, respostas: 0 });
        if (h.tipo === "mensagem") n.enviadas++;
        if (h.tipo.startsWith("resposta:")) n.respostas++;
      }
    }
    return { porNo: por, pessoas };
  }, [execucoes]);

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
  return { fluxos, loading, numeros, recarregar: carregar, salvar, alternar, apagar };
}
