import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { confirmar } from "@/components/DialogosGlobais";
import { cn } from "@/lib/utils";

// Cópia do Atalho "Jarvis" sem a chave do Davi (p_token = COLE_SUA_CHAVE_AQUI),
// compartilhada pelo iCloud. Serve pra qualquer cliente: só muda a chave.
const LINK_ATALHO_ICLOUD = "https://www.icloud.com/shortcuts/ceb4aec402d44c2b81c3eef2c5b20c32";

// Mensagem pronta pra mandar pro cliente (WhatsApp, e-mail…).
function instrucoes(nome: string, token: string) {
  return `Oi${nome ? `, ${nome.split(" ")[0]}` : ""}! Configura esse atalho no iPhone (30 segundos). Depois, é só abrir um reel no Instagram e tocar em Compartilhar → Compartilhar no… → Jarvis (cliente), que o vídeo cai direto nas suas Ideias em destaque no Infopro, já transcrito.

1. Abra este link no iPhone e toque em "Adicionar Atalho":
${LINK_ATALHO_ICLOUD}

2. No app Atalhos, toque nos 3 pontinhos do "Jarvis (cliente)". Em p_token, apague "COLE_SUA_CHAVE_AQUI" e cole esta chave:
${token}

3. Pronto! Na primeira vez o iPhone pergunta se pode se conectar: toque em Permitir.

Essa chave é só sua e só serve pra mandar vídeos pras suas ideias, não compartilha com ninguém.`;
}

// Creator → "Atalho para clientes": gera a chave do Atalho de um cliente
// (ex.: o Matheus). O que ele compartilhar cai na fila deste Jarvis, que
// transcreve no Mac e cria a ideia nas "Ideias em destaque" do projeto dele.
export function CreatorAtalhoClientes({ userId }: { userId: string }) {
  const [clientes, setClientes] = useState<{ id: string; nome: string }[]>([]);
  const [comAtalho, setComAtalho] = useState<Record<string, string>>({});
  const [clienteId, setClienteId] = useState("");
  const [gerado, setGerado] = useState<{ clienteId: string; token: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  const carregar = useCallback(async () => {
    const [{ data: cli }, { data: atalhos }] = await Promise.all([
      supabase.from("clientes").select("id, nome_especialista").eq("user_id", userId).eq("arquivado", false).order("nome_especialista"),
      supabase.from("creator_atalho_clientes").select("cliente_id, criado_em").eq("user_id", userId),
    ]);
    setClientes((cli || []).map((c) => ({ id: c.id, nome: c.nome_especialista.trim() })));
    setComAtalho(Object.fromEntries((atalhos || []).map((a) => [a.cliente_id, a.criado_em])));
  }, [userId]);

  useEffect(() => { void carregar(); }, [carregar]);

  const nomeDe = (id: string) => clientes.find((c) => c.id === id)?.nome ?? "cliente";

  const gerar = async () => {
    if (!clienteId) return;
    if (comAtalho[clienteId] && !(await confirmar(`Gerar uma chave nova para ${nomeDe(clienteId)}? O atalho que ele já tem para de funcionar até trocar a chave.`, { botao: "Gerar nova" }))) return;
    const { data, error } = await supabase.rpc("gerar_token_atalho_cliente", { p_cliente: clienteId });
    if (error || !data) { toast.error("Não consegui gerar a chave"); return; }
    setGerado({ clienteId, token: data });
    void carregar();
  };

  const remover = async (id: string) => {
    if (!(await confirmar(`Desligar o atalho de ${nomeDe(id)}? Os vídeos que ele mandar deixam de chegar.`, { botao: "Desligar", destrutivo: true }))) return;
    await supabase.from("creator_atalho_clientes").delete().eq("user_id", userId).eq("cliente_id", id);
    if (gerado?.clienteId === id) setGerado(null);
    void carregar();
  };

  const copiarInstrucoes = async () => {
    if (!gerado) return;
    try {
      await navigator.clipboard.writeText(instrucoes(nomeDe(gerado.clienteId), gerado.token));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch { toast.error("Não consegui copiar"); }
  };

  return (
    <div className="space-y-2 rounded-lg border border-border px-2.5 py-2 text-[11.5px]">
      <div className="flex items-center gap-1.5 text-[12px] font-medium"><Users className="h-3.5 w-3.5 text-violet-500" /> Atalho para clientes</div>
      <p className="text-muted-foreground">
        O cliente compartilha um reel no iPhone dele e o vídeo cai nas <b>Ideias em destaque</b> do projeto, já transcrito (com views e criador). A transcrição roda aqui no seu Mac.
      </p>

      {Object.keys(comAtalho).length > 0 && (
        <div className="space-y-1">
          {Object.keys(comAtalho).map((id) => (
            <div key={id} className="flex items-center gap-2 rounded bg-muted/50 px-2 py-1">
              <span className="flex-1 truncate">✅ {nomeDe(id)}</span>
              <button type="button" onClick={() => void remover(id)} className="rounded p-0.5 text-muted-foreground hover:text-foreground" aria-label={`Desligar atalho de ${nomeDe(id)}`}>
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-1.5">
        <select value={clienteId} onChange={(e) => { setClienteId(e.target.value); setGerado(null); }} className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-[12px]">
          <option value="">Escolher cliente…</option>
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}{comAtalho[c.id] ? " (já tem atalho)" : ""}</option>)}
        </select>
        <button type="button" onClick={() => void gerar()} disabled={!clienteId} className="shrink-0 rounded-md bg-violet-600 px-2.5 text-[11.5px] font-semibold text-white disabled:opacity-50">
          {clienteId && comAtalho[clienteId] ? "Gerar nova chave" : "Gerar atalho"}
        </button>
      </div>

      {gerado && (
        <div className="space-y-1.5 rounded-md bg-violet-500/10 p-2">
          <p className="font-semibold text-violet-700 dark:text-violet-300">Chave de {nomeDe(gerado.clienteId)} gerada — ela não aparece de novo.</p>
          <p className="text-muted-foreground">Copie o passo a passo (já com a chave) e mande pra ele no WhatsApp:</p>
          <button
            type="button"
            onClick={() => void copiarInstrucoes()}
            className={cn("inline-flex w-full items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 font-medium",
              copiado ? "border-green-600 text-green-700 dark:text-green-400" : "border-violet-500/50 hover:bg-violet-500/10")}
          >
            {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copiado ? "Passo a passo copiado" : "Copiar passo a passo para o cliente"}
          </button>
        </div>
      )}
    </div>
  );
}
