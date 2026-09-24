import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";

// Preferências do Jarvis — som (item 7) + privacidade do monitoramento de
// foco (item 3, rodada 3) — uma linha por usuário em jarvis_configuracoes,
// com Realtime pra refletir entre janelas (main/jarvis no desktop) sem F5.
// As 3 flags de privacidade nascem desligadas por padrão (opt-in, recurso
// sensível) — ver Administração → Jarvis → Privacidade.
export function useJarvisConfig() {
  const { user } = useAuth();
  const [somAtivado, setSomAtivadoState] = useState(true);
  const [monitorarAppAtivo, setMonitorarAppAtivoState] = useState(false);
  const [analisarTituloJanela, setAnalisarTituloJanelaState] = useState(false);
  const [detectarDistracoes, setDetectarDistracoesState] = useState(false);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("jarvis_configuracoes")
      .select("som_ativado, monitorar_app_ativo, analisar_titulo_janela, detectar_distracoes")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!error) {
      setSomAtivadoState(data?.som_ativado ?? true);
      setMonitorarAppAtivoState(data?.monitorar_app_ativo ?? false);
      setAnalisarTituloJanelaState(data?.analisar_titulo_janela ?? false);
      setDetectarDistracoesState(data?.detectar_distracoes ?? false);
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    if (!user?.id) return;
    const canal = supabase
      .channel(`jarvis-configuracoes-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "jarvis_configuracoes", filter: `user_id=eq.${user.id}` },
        () => carregar(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [user?.id, carregar]);

  const atualizarCampo = useCallback(async (patch: Record<string, boolean>) => {
    if (!user?.id) return;
    const { error } = await supabase
      .from("jarvis_configuracoes")
      .upsert({ user_id: user.id, ...patch, updated_at: new Date().toISOString() });
    if (error) await carregar();
  }, [user?.id, carregar]);

  const setSomAtivado = useCallback(async (valor: boolean) => {
    setSomAtivadoState(valor);
    await atualizarCampo({ som_ativado: valor });
  }, [atualizarCampo]);

  const setMonitorarAppAtivo = useCallback(async (valor: boolean) => {
    setMonitorarAppAtivoState(valor);
    await atualizarCampo({ monitorar_app_ativo: valor });
  }, [atualizarCampo]);

  const setAnalisarTituloJanela = useCallback(async (valor: boolean) => {
    setAnalisarTituloJanelaState(valor);
    await atualizarCampo({ analisar_titulo_janela: valor });
  }, [atualizarCampo]);

  const setDetectarDistracoes = useCallback(async (valor: boolean) => {
    setDetectarDistracoesState(valor);
    await atualizarCampo({ detectar_distracoes: valor });
  }, [atualizarCampo]);

  return {
    somAtivado,
    setSomAtivado,
    monitorarAppAtivo,
    setMonitorarAppAtivo,
    analisarTituloJanela,
    setAnalisarTituloJanela,
    detectarDistracoes,
    setDetectarDistracoes,
    loading,
  };
}
