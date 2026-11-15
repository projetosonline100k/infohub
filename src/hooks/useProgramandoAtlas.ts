import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { duracaoTexto, pedidoEmAndamento, type PontePedido } from "@/lib/ponte/painel";

const db = supabase as unknown as SupabaseClient;

export interface ProgramandoAtlas { emAndamento: { titulo: string; origem: string; ha: string } | null; naFila: number; aguardando: number; carregado: boolean }

/** O que o Atlas está programando (fila de desenvolvimento, ponte_painel): 15/11, Davi: "passando o mouse no Atlas, ver se tem algo sendo programado". */
export function useProgramandoAtlas(ativo: boolean) {
  const [pedidos, setPedidos] = useState<PontePedido[] | null>(null);
  const [agora, setAgora] = useState(Date.now());
  const emCurso = useRef(false);
  const recarregar = useCallback(async () => {
    if (emCurso.current) return;
    emCurso.current = true;
    try {
      const { data, error } = await db.rpc("ponte_painel");
      if (!error) { setPedidos((data ?? []) as PontePedido[]); setAgora(Date.now()); }
    } finally { emCurso.current = false; }
  }, []);
  useEffect(() => {
    if (!ativo) return;
    void recarregar();
    const t = window.setInterval(() => { if (!document.hidden) void recarregar(); }, 20_000);
    return () => window.clearInterval(t);
  }, [ativo, recarregar]);
  const lista = pedidos ?? [];
  const atual = pedidoEmAndamento(lista);
  const resumo: ProgramandoAtlas = {
    emAndamento: atual ? { titulo: atual.titulo, origem: atual.origem, ha: duracaoTexto(Math.max(0, agora - Date.parse(atual.iniciado_em ?? atual.criado_em))) } : null,
    naFila: lista.filter((p) => p.status === "pendente").length,
    aguardando: lista.filter((p) => p.status === "aguardando_aprovacao").length,
    carregado: pedidos !== null,
  };
  return { ...resumo, recarregar };
}
