import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { reconcileElements, CaptureUpdateAction } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI, BinaryFiles } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { supabase } from "@/integrations/supabase/client";

export interface PessoaOnlineCanvas {
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

// Throttle simples "leading + trailing": manda na hora se já faz tempo do
// último envio; senão agenda um único envio pro fim da janela com o dado
// mais recente (não acumula uma fila). Perder um quadro intermediário não
// tem problema aqui — o estado final sempre converge.
function criarThrottle<T>(delayMs: number, enviar: (valor: T) => void) {
  let ultimoEnvio = 0;
  let pendente: ReturnType<typeof setTimeout> | null = null;
  let valorPendente: T | null = null;

  const disparar = (valor: T) => {
    const agora = Date.now();
    if (agora - ultimoEnvio >= delayMs) {
      ultimoEnvio = agora;
      enviar(valor);
      return;
    }
    valorPendente = valor;
    if (!pendente) {
      pendente = setTimeout(() => {
        pendente = null;
        ultimoEnvio = Date.now();
        if (valorPendente !== null) enviar(valorPendente);
        valorPendente = null;
      }, delayMs - (agora - ultimoEnvio));
    }
  };

  const cancelar = () => {
    if (pendente) clearTimeout(pendente);
    pendente = null;
  };

  return { disparar, cancelar };
}

interface Options {
  documentoId: string | null;
  excalidrawApiRef: React.MutableRefObject<ExcalidrawImperativeAPI | null>;
  /** true assim que o mapa terminou de carregar — evita reconciliar contra uma cena ainda vazia. */
  isReadyRef: React.MutableRefObject<boolean>;
}

// Sincroniza o mapa mental entre quem está com o documento aberto ao mesmo
// tempo, elemento a elemento (não documento inteiro) — é isso que evita o
// bug de uma pessoa sobrescrever o que a outra acabou de escrever: cada
// bloco/seta/texto tem sua própria versão, e o Excalidraw já sabe resolver
// esse merge sozinho (reconcileElements, a mesma lógica do multiplayer
// oficial dele). Também liga presença (quem está vendo) e cursores ao vivo
// via appState.collaborators, que o próprio Excalidraw já sabe desenhar.
export function useMapaMentalColaboracao({ documentoId, excalidrawApiRef, isReadyRef }: Options) {
  const [pessoasOnline, setPessoasOnline] = useState<PessoaOnlineCanvas[]>([]);
  const minhaChaveRef = useRef(Math.random().toString(36).slice(2));
  const channelRef = useRef<RealtimeChannel | null>(null);
  const collaboratorsRef = useRef<Map<string, Record<string, unknown>>>(new Map());
  // Fica "true" entre uma reconciliação de dado remoto e o próximo onChange
  // local — consumido (lido e zerado) pelo chamador pra não reenviar de
  // volta pra rede o que acabou de chegar de outra pessoa.
  const applyingRemoteRef = useRef(false);

  const aplicarColaboradores = useCallback(() => {
    const api = excalidrawApiRef.current;
    if (!api) return;
    // Isto sozinho não é uma mudança de conteúdo (só presença/cursor), mas
    // ainda dispara onChange — marca como "de fora" pra quem estiver
    // ouvindo não reenviar os elementos pra rede a cada cursor que se move.
    applyingRemoteRef.current = true;
    api.updateScene({
      appState: { collaborators: new Map(collaboratorsRef.current) as never },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }, [excalidrawApiRef]);

  const reconciliarRemoto = useCallback((remoteElements: ExcalidrawElement[], files?: BinaryFiles) => {
    const api = excalidrawApiRef.current;
    if (!api || !isReadyRef.current) return;
    if (files) {
      const existing = api.getFiles();
      const missing = Object.values(files).filter(file => !existing[file.id]);
      if (missing.length) api.addFiles(missing);
    }
    const localElements = api.getSceneElementsIncludingDeleted();
    const merged = reconcileElements(localElements, remoteElements as never, api.getAppState());
    if (JSON.stringify(localElements) === JSON.stringify(merged)) return;
    applyingRemoteRef.current = true;
    api.updateScene({ elements: merged, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  }, [excalidrawApiRef, isReadyRef]);

  // Throttles vivem fora do efeito de conexão (que pode reconectar) pra que
  // as funções de broadcast, estáveis, sempre encontrem o mesmo estado.
  const elementosThrottleRef = useRef<ReturnType<typeof criarThrottle<{ elements: readonly ExcalidrawElement[]; files: BinaryFiles }>> | null>(null);
  const cursorThrottleRef = useRef<ReturnType<typeof criarThrottle<{ x: number; y: number }>> | null>(null);

  useEffect(() => {
    if (!documentoId) {
      setPessoasOnline([]);
      return;
    }
    let cancelado = false;
    let channel: RealtimeChannel | null = null;

    elementosThrottleRef.current = criarThrottle(120, ({ elements, files }: { elements: readonly ExcalidrawElement[]; files: BinaryFiles }) => {
      channelRef.current?.send({ type: "broadcast", event: "elements", payload: { chave: minhaChaveRef.current, elements, files } });
    });
    cursorThrottleRef.current = criarThrottle(60, ({ x, y }: { x: number; y: number }) => {
      channelRef.current?.send({ type: "broadcast", event: "cursor", payload: { chave: minhaChaveRef.current, x, y } });
    });

    const sincronizarBanco = async () => {
      if (!isReadyRef.current || cancelado) return;
      const { data, error } = await supabase.from("documentos").select("conteudo").eq("id", documentoId).maybeSingle();
      if (cancelado || error || !data?.conteudo?.startsWith("__CANVASMENTAL_V1__")) return;
      try {
        const parsed = JSON.parse(data.conteudo.slice("__CANVASMENTAL_V1__".length));
        if (Array.isArray(parsed.elements)) reconciliarRemoto(parsed.elements, parsed.files);
      } catch { /* Invalid remote content never replaces the canvas. */ }
    };
    const poll = setInterval(() => void sincronizarBanco(), 15000);
    const onOnline = () => void sincronizarBanco();
    window.addEventListener("online", onOnline);

    (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelado) return;
      const email = data.user?.email || "";
      const nomeMeta = (data.user?.user_metadata as Record<string, unknown> | null)?.nome as string | undefined;
      const apelido = nomeMeta || email.split("@")[0] || "Alguém";
      const minhaCor = corPara(email || minhaChaveRef.current);

      channel = supabase.channel(`mapa-mental-${documentoId}`, {
        config: { presence: { key: minhaChaveRef.current } },
      });
      channelRef.current = channel;

      channel.on("presence", { event: "sync" }, () => {
        const estado = channel!.presenceState<{ email: string; nome: string; cor: string }>();
        const chavesPresentes = new Set(Object.keys(estado));
        for (const chave of [...collaboratorsRef.current.keys()]) {
          if (!chavesPresentes.has(chave)) collaboratorsRef.current.delete(chave);
        }
        const lista: PessoaOnlineCanvas[] = Object.entries(estado)
          .filter(([chave]) => chave !== minhaChaveRef.current)
          .map(([chave, entradas]) => {
            const info = entradas[0];
            return { chave, email: info.email, nome: info.nome, cor: info.cor };
          });
        setPessoasOnline(lista);
        lista.forEach((p) => {
          const existente = collaboratorsRef.current.get(p.chave) || {};
          collaboratorsRef.current.set(p.chave, {
            ...existente,
            id: p.chave,
            username: p.nome,
            color: { background: p.cor, stroke: p.cor },
          });
        });
        aplicarColaboradores();
      });

      channel.on("broadcast", { event: "cursor" }, ({ payload }) => {
        const dados = payload as { chave: string; x: number; y: number };
        if (dados.chave === minhaChaveRef.current) return;
        const existente = collaboratorsRef.current.get(dados.chave) || {};
        collaboratorsRef.current.set(dados.chave, {
          ...existente,
          id: dados.chave,
          pointer: { x: dados.x, y: dados.y, tool: "pointer" },
        });
        aplicarColaboradores();
      });

      channel.on("broadcast", { event: "elements" }, ({ payload }) => {
        const dados = payload as { chave: string; elements: ExcalidrawElement[]; files?: BinaryFiles };
        if (dados.chave === minhaChaveRef.current) return;
        reconciliarRemoto(dados.elements, dados.files);
      });

      // Rede de segurança: além do broadcast ao vivo, também reconcilia
      // contra o que foi de fato salvo no banco por qualquer pessoa — cobre
      // o caso de alguém editar durante uma reconexão do canal.
      channel.on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "documentos", filter: `id=eq.${documentoId}` },
        (payload) => {
          const novo = payload.new as { conteudo: string | null };
          if (!novo.conteudo?.startsWith("__CANVASMENTAL_V1__")) return;
          try {
            const parsed = JSON.parse(novo.conteudo.slice("__CANVASMENTAL_V1__".length));
            if (Array.isArray(parsed.elements)) reconciliarRemoto(parsed.elements, parsed.files);
          } catch {
            // conteúdo inválido — ignora, o autosave local não é afetado.
          }
        }
      );

      channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED" && !cancelado) {
          await channel!.track({ email, nome: apelido, cor: minhaCor });
          void sincronizarBanco();
        }
      });
    })();

    return () => {
      cancelado = true;
      clearInterval(poll);
      window.removeEventListener("online", onOnline);
      elementosThrottleRef.current?.cancelar();
      cursorThrottleRef.current?.cancelar();
      elementosThrottleRef.current = null;
      cursorThrottleRef.current = null;
      if (channel) supabase.removeChannel(channel);
      channelRef.current = null;
      collaboratorsRef.current.clear();
      setPessoasOnline([]);
    };
  }, [documentoId, reconciliarRemoto, aplicarColaboradores, isReadyRef]);

  const broadcastElements = useCallback((elements: readonly ExcalidrawElement[], files: BinaryFiles) => {
    elementosThrottleRef.current?.disparar({ elements, files });
  }, []);

  const broadcastCursor = useCallback((x: number, y: number) => {
    cursorThrottleRef.current?.disparar({ x, y });
  }, []);

  return { pessoasOnline, broadcastElements, broadcastCursor, applyingRemoteRef };
}
