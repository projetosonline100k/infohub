import { useEffect, useRef, useState } from "react";
import { Loader2, Send, Sparkles, Undo2 } from "lucide-react";
import { toast } from "sonner";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { sanitizarConfig, type ConfigChatbot } from "@/lib/chatbot/chatbot";

// Chat do assistente (10/11/2026, Davi: "um chat onde eu jogo as mensagens e você já adapta para o chatbot").
// Cola um roteiro, uma lista de perguntas ou um pedido ("troca o tom", "adiciona pergunta de idade"): o Claude devolve
// o chatbot inteiro ajustado, que entra na hora (fluxo, editor e prévia mudam) e dá para desfazer.
interface Msg { id: number; papel: "user" | "assistant"; texto: string; antes?: ConfigChatbot; desfeito?: boolean }

const db = supabase as unknown as SupabaseClient;   // chatbot_pedidos ainda não está nos tipos gerados
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function AssistenteChatbot({ chatbotId, clienteId, config, onAplicar }: { chatbotId: string; clienteId: string; config: ConfigChatbot; onAplicar: (c: ConfigChatbot) => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const n = useRef(0);
  const vivo = useRef(true);
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);
  useEffect(() => { fim.current?.scrollIntoView({ block: "end" }); }, [msgs.length, enviando]);

  // O pedido vai para o Claude do Davi (ouvinte do Atlas, plano dele, sem chave de API): grava aqui, espera a resposta.
  const enviar = async () => {
    const t = texto.trim();
    if (!t || enviando) return;
    setTexto("");
    setMsgs((m) => [...m, { id: ++n.current, papel: "user", texto: t }]);
    setEnviando(true);
    try {
      const { data: criado, error } = await db.from("chatbot_pedidos").insert({
        chatbot_id: chatbotId, cliente_id: clienteId, mensagem: t, config_atual: config,
        historico: msgs.map((m) => ({ papel: m.papel, texto: m.texto.slice(0, 2000) })).slice(-6),
      }).select("id").single();
      if (error || !criado) throw new Error("Não consegui enviar o pedido.");
      const id = (criado as { id: string }).id;
      for (let i = 0; i < 100; i++) {   // até ~5 min
        await espera(3000);
        if (!vivo.current) return;
        const { data } = await db.from("chatbot_pedidos").select("status, resposta, config, erro").eq("id", id).maybeSingle();
        const r = data as { status: string; resposta: string | null; config: unknown; erro: string | null } | null;
        if (r?.status === "respondido" && r.config) {
          onAplicar(sanitizarConfig(r.config, config));
          setMsgs((m) => [...m, { id: ++n.current, papel: "assistant", texto: r.resposta || "Pronto, já ajustei.", antes: config }]);
          return;
        }
        if (r?.status === "erro") throw new Error(r.erro || "O Claude não conseguiu responder.");
      }
      throw new Error("Demorou demais. Confira se o ouvinte do Atlas está ligado e tente de novo.");
    } catch (e) {
      if (!vivo.current) return;
      toast.error(e instanceof Error ? e.message : "Não consegui adaptar agora.");
      setTexto(t);
      setMsgs((m) => m.slice(0, -1));
    } finally {
      if (vivo.current) setEnviando(false);
    }
  };
  const desfazer = (m: Msg) => {
    if (!m.antes) return;
    onAplicar(m.antes);
    setMsgs((l) => l.map((x) => (x.id === m.id ? { ...x, desfeito: true } : x)));
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-xl border bg-background p-3">
        {msgs.length === 0 && (
          <div className="space-y-2 text-sm text-muted-foreground">
            <p className="flex items-center gap-1.5 font-medium text-foreground"><Sparkles className="h-4 w-4 text-primary" />Cole aqui as mensagens e eu monto o chatbot.</p>
            <p>Pode ser o roteiro da conversa, uma lista de perguntas, o texto de outro diagnóstico ou um pedido solto:</p>
            <ul className="list-disc space-y-1 pl-5 text-xs">
              <li>“Monte um chatbot com estas perguntas: …” (e cole o texto)</li>
              <li>“Troque o tom para mais direto e adicione a pergunta da idade”</li>
              <li>“Quem tem renda acima de 10 mil é alto potencial; o botão final leva para este link: …”</li>
            </ul>
            <p className="text-xs">O que eu mudar aparece na hora no fluxo e na prévia, e dá para desfazer.</p>
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={cn("flex", m.papel === "user" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[92%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm", m.papel === "user" ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-muted")}>
              {m.papel === "user" && m.texto.length > 600 ? `${m.texto.slice(0, 600)}…` : m.texto}
              {m.papel === "assistant" && m.antes && (
                <button type="button" disabled={m.desfeito} onClick={() => desfazer(m)} className="mt-1.5 flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:text-muted-foreground disabled:no-underline">
                  <Undo2 className="h-3 w-3" />{m.desfeito ? "Desfeito" : "Desfazer"}
                </button>
              )}
            </div>
          </div>
        ))}
        {enviando && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />O Claude está adaptando o chatbot… (pode levar até 1 minuto)</p>}
        <div ref={fim} />
      </div>
      <form className="flex items-end gap-1.5" onSubmit={(e) => { e.preventDefault(); void enviar(); }}>
        <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} className="min-h-0 text-sm" placeholder="Cole as mensagens ou escreva o que mudar… (⌘ Enter envia)"
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void enviar(); } }} />
        <Button type="submit" size="icon" className="h-9 w-9 shrink-0" disabled={!texto.trim() || enviando}>{enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button>
      </form>
    </div>
  );
}
