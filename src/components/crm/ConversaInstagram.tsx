import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Bot, Loader2, Send, UserRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { comoResponder } from "@/lib/automacoes/manyhub";
import { useConversaMH } from "@/hooks/useManyHubDados";

const ORIGEM: Record<string, string> = { contato: "Pessoa", fluxo: "Fluxo", automacao: "Automação", davi: "Você", instagram: "Você (app)" };

/** Conversa de Instagram dentro da ficha do CRM (18/11/2026, Davi: "clicar nela e abrir o chat mesmo e conversar"). Mesma conversa e mesmo envio do Many Hub. */
export function ConversaInstagram({ igUserId, contatoId }: { igUserId: string; contatoId: string }) {
  const { msgs, carregando, recarregar } = useConversaMH(igUserId, contatoId);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const janela = comoResponder(msgs);
  useEffect(() => { fim.current?.scrollIntoView({ block: "end" }); }, [msgs.length, contatoId]);
  useEffect(() => setTexto(""), [contatoId]);

  const enviar = async () => {
    const t = texto.trim();
    if (!t || enviando || !janela.pode) return;
    setEnviando(true);
    const { error } = await supabase.functions.invoke("instagram-automacoes/enviar", { body: { ig_user_id: igUserId, contato_id: contatoId, texto: t } });
    setEnviando(false);
    if (error) {
      let msg = "Não consegui enviar";
      try { const j = await (error as unknown as { context: Response }).context.json(); msg = j.error ?? msg; } catch { /* sem detalhe */ }
      toast.error(msg); return;
    }
    setTexto(""); await recarregar();
  };

  return (
    <div className="flex h-[calc(100vh-170px)] min-h-[360px] flex-col overflow-hidden rounded-xl border border-white/10 text-white">
      <div className="min-h-0 flex-1 overflow-y-auto bg-[#0b141a] px-3 py-3">
        <div className="flex flex-col gap-1.5">
          {carregando && msgs.length === 0 ? <Loader2 className="mx-auto my-6 h-5 w-5 animate-spin text-white/40" /> : msgs.length === 0 ? (
            <p className="mx-auto max-w-xs rounded-lg bg-[#182229] px-3 py-2 text-center text-xs text-white/55">Nenhuma mensagem guardada dessa pessoa ainda. As próximas entram sozinhas.</p>
          ) : msgs.map((m) => (
            <div key={m.id} className={cn("max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3 py-1.5 text-[14px] shadow", m.de_mim ? "ml-auto rounded-tr-none bg-[#005c4b]" : "mr-auto rounded-tl-none bg-[#202c33]")}>
              {(m.de_mim || m.tipo === "comentario") && (
                <span className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-200/70">
                  {m.origem === "fluxo" || m.origem === "automacao" ? <Bot className="h-3 w-3" /> : m.de_mim ? <UserRound className="h-3 w-3" /> : null}
                  {m.tipo === "comentario" ? "Comentou" : ORIGEM[m.origem] ?? m.origem}
                </span>
              )}
              {m.texto}
              <span className="ml-3 inline-block translate-y-1 text-[10.5px] text-white/55">{format(new Date(m.enviada_em), "dd/MM HH:mm", { locale: ptBR })}</span>
            </div>
          ))}
          <div ref={fim} />
        </div>
      </div>
      <div className="space-y-1.5 bg-[#202c33] p-2.5">
        {!janela.pode && <p className="rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200">Sem como responder agora: a Meta só deixa uma resposta privada por comentário (até 7 dias) e uma conversa de 24 h depois que a pessoa escreve ou toca num botão. Quando ela responder, a caixa abre.</p>}
        {janela.via === "comentario" && <p className="rounded-lg bg-sky-500/10 px-3 py-1.5 text-xs text-sky-200">Ela só comentou: sua mensagem vai como resposta privada ao comentário. A Meta deixa mandar só uma; depois, a pessoa precisa responder para a conversa continuar.</p>}
        <div className="flex items-end gap-2">
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} disabled={!janela.pode} placeholder={janela.pode ? "Escreva a resposta (Enter envia)" : "Resposta indisponível"}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void enviar(); } }}
            className="min-h-0 flex-1 resize-none rounded-xl bg-[#2a3942] px-3 py-2 text-[14px] text-white outline-none placeholder:text-white/40 disabled:opacity-50" />
          <button type="button" disabled={!texto.trim() || enviando || !janela.pode} onClick={() => void enviar()} className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[#00a884] px-3 text-sm font-semibold text-white hover:bg-[#019c7a] disabled:opacity-40">
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Enviar</button>
        </div>
        {janela.via === "janela" && janela.ate && <p className="text-[11px] text-white/40">Dá para responder até {format(new Date(janela.ate), "dd/MM 'às' HH:mm")}.</p>}
      </div>
    </div>
  );
}
