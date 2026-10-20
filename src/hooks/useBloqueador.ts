import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { isDesktop } from "@/lib/platform";
import { mostrarAviso } from "@/lib/desktop/notificacao";
import {
  CONFIG_PADRAO, MOTIVO_MINIMO, precisaMotivo, sessaoAtiva, textoAte, vencidas,
  type ConfigBloqueio, type SessaoBloqueio,
} from "@/lib/bloqueador/regras";

// Bloqueador (20/10). Dados: bloqueador_config + bloqueador_sessoes (migração 20261020040000).
// useBloqueador = dados e ações (tela). useMotorBloqueador = liga/desliga o bloqueio nativo
// (src-tauri/src/bloqueador.rs); roda só na janela do Atlas, que fica sempre aberta no Mac.
const db = supabase as unknown as SupabaseClient;   // tabelas novas, fora dos tipos gerados

export function useBloqueador() {
  const { user } = useAuth();
  const [config, setConfig] = useState<ConfigBloqueio>(CONFIG_PADRAO);
  const [sessoes, setSessoes] = useState<SessaoBloqueio[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [agora, setAgora] = useState(() => new Date());

  const carregar = useCallback(async () => {
    if (!user) return;
    const [c, s] = await Promise.all([
      db.from("bloqueador_config").select("apps, sites, no_foco").eq("user_id", user.id).maybeSingle(),
      db.from("bloqueador_sessoes").select("*").eq("user_id", user.id).order("inicio", { ascending: false }).limit(30),
    ]);
    if (c.data) setConfig({ apps: c.data.apps ?? [], sites: c.data.sites ?? [], no_foco: c.data.no_foco ?? true });
    if (s.data) setSessoes(s.data as SessaoBloqueio[]);
    setCarregado(true);
  }, [user]);

  useEffect(() => {
    void carregar();
    if (!user) return;
    const canal = db.channel(`bloqueador-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bloqueador_config", filter: `user_id=eq.${user.id}` }, () => void carregar())
      .on("postgres_changes", { event: "*", schema: "public", table: "bloqueador_sessoes", filter: `user_id=eq.${user.id}` }, () => void carregar())
      .subscribe();
    const relogio = setInterval(() => setAgora(new Date()), 15_000);
    return () => { void db.removeChannel(canal); clearInterval(relogio); };
  }, [user, carregar]);

  const salvarConfig = useCallback(async (nova: ConfigBloqueio) => {
    if (!user) return;
    setConfig(nova);
    await db.from("bloqueador_config").upsert({ user_id: user.id, ...nova, atualizado_em: new Date().toISOString() });
  }, [user]);

  const ativa = sessaoAtiva(sessoes, agora);

  const ligar = useCallback(async (minutos: number) => {
    if (!user || ativa) return;
    await db.from("bloqueador_sessoes").insert({ user_id: user.id, origem: "manual", fim_previsto: new Date(Date.now() + minutos * 60_000).toISOString() });
    await carregar();
  }, [user, ativa, carregar]);

  /** Desliga a sessão ativa. Antes da hora, sem motivo (5+ letras), recusa. */
  const desligar = useCallback(async (motivo?: string) => {
    if (!ativa) return { ok: true };
    const pede = precisaMotivo(ativa, new Date());
    if (pede && (motivo ?? "").trim().length < MOTIVO_MINIMO) return { ok: false, erro: "Escreva o motivo para desligar antes da hora." };
    const { error } = await db.from("bloqueador_sessoes")
      .update({ encerrado_em: new Date().toISOString(), motivo_saida: pede ? motivo!.trim() : null }).eq("id", ativa.id);
    await carregar();
    return error ? { ok: false, erro: error.message } : { ok: true };
  }, [ativa, carregar]);

  return { carregado, config, sessoes, ativa, agora, salvarConfig, ligar, desligar, recarregar: carregar };
}

export function useMotorBloqueador(ligadoAqui: boolean) {
  const { user } = useAuth();
  const b = useBloqueador();
  const [timer, setTimer] = useState<{ id: string; titulo: string } | null>(null);
  const ativaRef = useRef(b.ativa);
  ativaRef.current = b.ativa;

  // Cronômetro de alguma atividade rodando? (liga o bloqueio de foco quando no_foco)
  useEffect(() => {
    if (!ligadoAqui || !user) return;
    const ver = async () => {
      const { data } = await db.from("atividades").select("id, titulo").eq("user_id", user.id)
        .not("timer_iniciado_em", "is", null).is("deleted_at", null).limit(1);
      setTimer(data?.[0] ? { id: data[0].id, titulo: data[0].titulo } : null);
    };
    void ver();
    const canal = db.channel(`bloqueador-timer-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "atividades", filter: `user_id=eq.${user.id}` }, () => void ver())
      .subscribe();
    const t = setInterval(ver, 60_000);
    return () => { void db.removeChannel(canal); clearInterval(t); };
  }, [ligadoAqui, user]);

  // Sessões: vencidas fecham sozinhas; foco abre/fecha junto com o cronômetro.
  useEffect(() => {
    if (!ligadoAqui || !user || !b.carregado) return;
    void (async () => {
      for (const v of vencidas(b.sessoes, b.agora)) {
        await db.from("bloqueador_sessoes").update({ encerrado_em: v.fim_previsto }).eq("id", v.id).is("encerrado_em", null);
      }
      const foco = b.sessoes.find((s) => s.origem === "foco" && !s.encerrado_em);
      if (b.config.no_foco && timer && !b.ativa) {
        await db.from("bloqueador_sessoes").insert({ user_id: user.id, origem: "foco", atividade_id: timer.id });
      } else if (foco && (!timer || !b.config.no_foco)) {
        await db.from("bloqueador_sessoes").update({ encerrado_em: new Date().toISOString() }).eq("id", foco.id);
      } else return;
      await b.recarregar();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ligadoAqui, user, b.carregado, b.sessoes, b.agora, b.config.no_foco, timer?.id]);

  // Liga/desliga o bloqueio nativo conforme a sessão ativa e as listas.
  const chave = b.ativa ? `${b.ativa.id}|${b.config.apps.join(",")}|${b.config.sites.join(",")}` : "";
  useEffect(() => {
    if (!ligadoAqui || !isDesktop()) return;
    void (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        if (b.ativa && (b.config.apps.length || b.config.sites.length)) {
          await invoke("bloqueador_ligar", { apps: b.config.apps, sites: b.config.sites, ate: textoAte(b.ativa) });
        } else {
          await invoke("bloqueador_desligar");
        }
      } catch { /* app antigo sem o bloqueador */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ligadoAqui, chave]);

  // Cada vez que barra algo: aviso do Atlas e conta na sessão.
  useEffect(() => {
    if (!ligadoAqui || !isDesktop()) return;
    let desligar = () => {};
    void (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        desligar = await listen<{ alvo: string; tipo: string }>("bloqueio", (e) => {
          const s = ativaRef.current;
          void mostrarAviso({ id: `bloqueio-${Date.now()}`, tipo: "urgente", titulo: `${e.payload.alvo} está bloqueado`,
            quem: `Foco ${textoAte(s)}`, corpo: "Para liberar antes, desligue o bloqueador e diga o motivo." });
          if (s) void db.from("bloqueador_sessoes").update({ bloqueios: (s.bloqueios ?? 0) + 1 }).eq("id", s.id);
        });
      } catch { /* web */ }
    })();
    return () => desligar();
  }, [ligadoAqui]);
}
