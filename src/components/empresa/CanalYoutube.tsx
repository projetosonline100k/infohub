import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Loader2, Youtube } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { confirmar } from "@/components/DialogosGlobais";
import { retornoDoYoutube } from "@/lib/empresa/youtube";

// Canal do YouTube do projeto (edge `youtube`): o dono conecta pelo login
// Google, como na Agenda. Com o canal ligado, a Dalila publica os Shorts que o
// Davi programar em ProgramarReel. O app só vê o nome do canal.
const db = supabase as unknown as SupabaseClient;

export async function youtubeDoProjeto(clienteId: string): Promise<string | null> {
  const { data } = await db.rpc("youtube_do_projeto", { p_cliente: clienteId });
  return (data as string | null) ?? null;
}

async function chamarYoutube<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("youtube", { body });
  if (error) {
    let mensagem = error.message;
    const contexto = (error as { context?: Response }).context;
    if (contexto) {
      try {
        const payload = await contexto.json();
        if (payload?.error) mensagem = payload.error;
      } catch {
        // Mantém a mensagem original quando a resposta não é JSON.
      }
    }
    throw new Error(mensagem);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export async function conectarYoutube(clienteId: string) {
  const { authUrl } = await chamarYoutube<{ authUrl: string }>({
    action: "connect", clienteId, returnUrl: `${window.location.origin}${window.location.pathname}`,
  });
  window.location.assign(authUrl);
}

export function useCanalYoutube(clienteId: string | null | undefined) {
  const [canal, setCanal] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const recarregar = useCallback(async () => {
    if (!clienteId) return;
    setCarregando(true);
    setCanal(await youtubeDoProjeto(clienteId));
    setCarregando(false);
  }, [clienteId]);
  useEffect(() => { void recarregar(); }, [recarregar]);
  return { canal, carregando, recarregar };
}

// Botão do cabeçalho da Visão geral: conectar, ver e desligar o canal.
export function CanalYoutube({ clienteId }: { clienteId: string }) {
  const { canal, carregando, recarregar } = useCanalYoutube(clienteId);
  const [indo, setIndo] = useState(false);

  // Volta do Google: avisa e limpa a URL.
  useEffect(() => {
    const retorno = retornoDoYoutube(window.location.search);
    if (!retorno) return;
    if (retorno.ok) toast.success(retorno.mensagem); else toast.error(`YouTube: ${retorno.mensagem}`);
    const url = new URL(window.location.href);
    ["youtube", "mensagem"].forEach((k) => url.searchParams.delete(k));
    window.history.replaceState(null, "", url.toString());
  }, []);

  const conectar = async () => {
    setIndo(true);
    try { await conectarYoutube(clienteId); } catch (e) { toast.error((e as Error).message); setIndo(false); }
  };
  const desligar = async () => {
    if (!await confirmar(`Desconectar o YouTube? A Dalila para de publicar Shorts em "${canal}".`, { botao: "Desconectar", destrutivo: true })) return;
    try {
      await chamarYoutube({ action: "disconnect", clienteId });
      toast.success("YouTube desconectado.");
      void recarregar();
    } catch (e) { toast.error((e as Error).message); }
  };

  if (carregando) return null;
  return canal ? (
    <button type="button" onClick={() => void desligar()} title="Canal onde a Dalila publica os Shorts (clique para desconectar)"
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-muted">
      <Youtube className="h-3.5 w-3.5 text-red-600" /> {canal}
    </button>
  ) : (
    <button type="button" onClick={() => void conectar()} disabled={indo}
      className="inline-flex items-center gap-1.5 rounded-full border border-red-600/40 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-600/10 disabled:opacity-60">
      {indo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Youtube className="h-3.5 w-3.5" />} Conectar canal do YouTube
    </button>
  );
}
