import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAbaAtiva } from "@/lib/workspace/abaAtiva";
import type { PontePedido } from "@/lib/ponte/painel";

const db = supabase as unknown as SupabaseClient;
const INTERVALO_MS = 3000;

// A tabela ponte_pedidos é fechada (sem policy), então o Realtime não entrega mudanças ao app:
// a tela relê a fila pela função ponte_painel() a cada 3s, só com a guia e a janela visíveis.
export function usePontePainel() {
  const ativa = useAbaAtiva();
  const [pedidos, setPedidos] = useState<PontePedido[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [atualizadoEm, setAtualizadoEm] = useState<number | null>(null);
  const emCurso = useRef(false);

  const recarregar = useCallback(async () => {
    if (emCurso.current) return;
    emCurso.current = true;
    try {
      const { data, error } = await db.rpc("ponte_painel");
      if (error) setErro(error.message);
      else { setPedidos((data ?? []) as PontePedido[]); setErro(null); setAtualizadoEm(Date.now()); }
    } finally {
      emCurso.current = false;
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    if (!ativa) return;
    void recarregar();
    const t = window.setInterval(() => { if (!document.hidden) void recarregar(); }, INTERVALO_MS);
    const aoVoltar = () => { if (!document.hidden) void recarregar(); };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => { window.clearInterval(t); document.removeEventListener("visibilitychange", aoVoltar); };
  }, [ativa, recarregar]);

  const aprovar = useCallback(async (id: string) => {
    const { data, error } = await db.rpc("ponte_aprovar", { p_id: id });
    if (error) throw new Error(error.message);
    await recarregar();
    return data === true;
  }, [recarregar]);

  return { pedidos, carregando, erro, atualizadoEm, recarregar, aprovar };
}
