import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface PessoaOnline {
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

interface Options {
  documentoId: string | null;
  editor: Editor | null;
  /** true enquanto o campo de título está com foco local — evita sobrescrever o que a pessoa está digitando. */
  tituloFocadoRef?: React.MutableRefObject<boolean>;
  onConteudoRemoto: (novoConteudo: string) => void;
  onTituloRemoto: (novoTitulo: string) => void;
}

// Presença (quem está vendo o documento agora) + Postgres Changes (aplica
// ao vivo o que outra pessoa salvou) num canal por documento. Se o editor
// local está com foco, não sobrescreve o texto no meio da digitação — só
// avisa por toast; a atualização entra assim que a pessoa clicar fora.
export function useDocumentoColaboracao({ documentoId, editor, tituloFocadoRef, onConteudoRemoto, onTituloRemoto }: Options) {
  const [pessoasOnline, setPessoasOnline] = useState<PessoaOnline[]>([]);
  const minhaChaveRef = useRef(Math.random().toString(36).slice(2));
  const callbacksRef = useRef({ onConteudoRemoto, onTituloRemoto });
  callbacksRef.current = { onConteudoRemoto, onTituloRemoto };

  useEffect(() => {
    if (!documentoId) {
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

      channel = supabase.channel(`documento-${documentoId}`, {
        config: { presence: { key: minhaChaveRef.current } },
      });

      channel.on("presence", { event: "sync" }, () => {
        const estado = channel!.presenceState<{ email: string; nome: string }>();
        const lista: PessoaOnline[] = Object.entries(estado)
          .filter(([chave]) => chave !== minhaChaveRef.current)
          .map(([chave, entradas]) => {
            const info = entradas[0];
            return { chave, email: info.email, nome: info.nome, cor: corPara(info.email || chave) };
          });
        setPessoasOnline(lista);
      });

      channel.on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "documentos", filter: `id=eq.${documentoId}` },
        (payload) => {
          const novo = payload.new as { conteudo: string | null; titulo: string | null };
          if (editor) {
            if (!editor.isFocused) {
              const atual = editor.getHTML();
              if (novo.conteudo != null && novo.conteudo !== atual) {
                callbacksRef.current.onConteudoRemoto(novo.conteudo);
              }
            } else if (novo.conteudo != null && novo.conteudo !== editor.getHTML()) {
              toast.info("Alguém atualizou este documento enquanto você editava — clique fora do texto pra ver a versão mais recente.");
            }
          }
          if (!tituloFocadoRef?.current && novo.titulo != null) {
            callbacksRef.current.onTituloRemoto(novo.titulo);
          }
        }
      );

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentoId, editor]);

  return { pessoasOnline };
}
