import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export interface PessoaOnlineProjeto {
  chave: string;
  email: string;
  nome: string;
  cor: string;
}

const CORES = ["#f97316", "#22c55e", "#3b82f6", "#a855f7", "#ec4899", "#14b8a6", "#eab308"];

function corPara(chave: string) {
  let hash = 0;
  for (let i = 0; i < chave.length; i++) hash = (hash * 31 + chave.charCodeAt(i)) >>> 0;
  return CORES[hash % CORES.length];
}

// Só presença (quem está com este projeto/cliente aberto agora), num canal
// por cliente — sem broadcast de cursor nem postgres_changes, que são coisa
// de editor de texto (ver useDocumentoColaboracao).
export function usePresencaProjeto(clienteId: string | null | undefined) {
  const [pessoasOnline, setPessoasOnline] = useState<PessoaOnlineProjeto[]>([]);
  const minhaChaveRef = useRef(Math.random().toString(36).slice(2));

  useEffect(() => {
    if (!clienteId) {
      setPessoasOnline([]);
      return;
    }
    let cancelado = false;
    let channel: RealtimeChannel | null = null;

    (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelado) return;
      const email = data.user?.email || "";
      const nome = (data.user?.user_metadata as Record<string, unknown> | null)?.nome as string | undefined;
      const apelido = nome || email.split("@")[0] || "Alguém";

      channel = supabase.channel(`presenca-cliente-${clienteId}`, {
        config: { presence: { key: minhaChaveRef.current } },
      });

      channel.on("presence", { event: "sync" }, () => {
        const estado = channel!.presenceState<{ email: string; nome: string }>();
        const lista: PessoaOnlineProjeto[] = Object.entries(estado)
          .filter(([chave]) => chave !== minhaChaveRef.current)
          .map(([chave, entradas]) => {
            const info = entradas[0];
            return { chave, email: info.email, nome: info.nome, cor: corPara(info.email || chave) };
          });
        setPessoasOnline(lista);
      });

      channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED" && !cancelado) {
          await channel!.track({ email, nome: apelido });
        }
      });
    })();

    return () => {
      cancelado = true;
      if (channel) supabase.removeChannel(channel);
      setPessoasOnline([]);
    };
  }, [clienteId]);

  return { pessoasOnline };
}
