import { useEffect, useState } from "react";
import { format, isToday, isYesterday } from "date-fns";
import { Clock, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { CabecaBoneco } from "@/components/empresa/BonecoMesa";
import { FotoChat } from "./tabs/WhatsappConversas";

// Balão da Shirley com cara de WhatsApp (16/10, Davi: "as mensagens da Shirley
// parecem algo robótico, seria interessante algo como WhatsApp mesmo… que eu
// consiga ver as mensagens, tempo de atraso"): cabeçalho verde com a Shirley,
// as últimas mensagens da conversa em balões, a faixa de atraso (que fica
// vermelha quando ela perde a paciência) e os botões.
interface Msg { id: string; de_mim: boolean; autor_nome: string | null; tipo: string; texto: string | null; transcricao: string | null; enviada_em: string }
const ROTULO: Record<string, string> = { audio: "🎤 Áudio", imagem: "📷 Foto", video: "🎥 Vídeo", documento: "📄 Documento", figurinha: "Figurinha" };
const hora = (iso: string) => {
  const d = new Date(iso);
  return `${isToday(d) ? "Hoje" : isYesterday(d) ? "Ontem" : format(d, "dd/MM")}, ${format(d, "HH:mm")}`;
};

export interface BotaoCartao { label: string; onClick: () => void; principal?: boolean }

export function CartaoWhatsapp({ chatId, chatNome, nome, grupo, faixa, tomFaixa = "atraso", botoes, bravo }: {
  chatId: string; chatNome: string | null; nome: string; grupo: boolean;
  faixa: string; tomFaixa?: "nova" | "atraso" | "brava"; botoes: BotaoCartao[]; bravo?: boolean;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  useEffect(() => {
    let vivo = true;
    void supabase.from("whatsapp_mensagens").select("id, de_mim, autor_nome, tipo, texto, transcricao, enviada_em")
      .eq("chat_id", chatId).order("enviada_em", { ascending: false }).limit(3)
      .then(({ data }) => { if (vivo) setMsgs(((data || []) as Msg[]).reverse()); });
    return () => { vivo = false; };
  }, [chatId]);

  return (
    <div className="relative">
      <div role="status" className={cn("w-[330px] overflow-hidden rounded-2xl border bg-[#efeae2] shadow-lg animate-in fade-in-0 slide-in-from-bottom-1 zoom-in-95 dark:bg-slate-900",
        bravo && "border-2 border-rose-500 shadow-[0_0_18px_rgba(244,63,94,0.45)] animate-shake")}>
        {/* Cabeçalho do WhatsApp: a Shirley avisando */}
        <div className="flex items-center gap-2.5 bg-[#075e54] px-3 py-2 text-white">
          <span className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-white/90"><CabecaBoneco nome="Shirley" ehIa className="h-full w-full" /></span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[13px] font-semibold">Shirley (CS)</p>
            <p className="truncate text-[11px] text-white/80">WhatsApp · {nome}{grupo ? " (grupo)" : ""}</p>
          </div>
          <FotoChat chatId={chatId} nome={chatNome ?? nome} grupo={grupo} tamanho="h-8 w-8" />
        </div>
        {/* As últimas mensagens, em balões */}
        <div className="max-h-[150px] space-y-1.5 overflow-y-auto px-2.5 py-2">
          {msgs.length === 0 && <p className="py-2 text-center text-[11px] text-muted-foreground"><MessageCircle className="mr-1 inline h-3 w-3" />carregando…</p>}
          {msgs.map((m) => (
            <div key={m.id} className={cn("max-w-[88%] rounded-lg px-2.5 py-1.5 text-[12.5px] leading-snug shadow-sm",
              m.de_mim ? "ml-auto bg-[#d9fdd3] dark:bg-emerald-900/60" : "bg-white dark:bg-slate-800")}>
              {!m.de_mim && grupo && m.autor_nome && <p className="text-[11px] font-semibold text-[#128c7e]">{m.autor_nome.split(" ")[0]}</p>}
              <p className="line-clamp-4 whitespace-pre-line break-words text-slate-900 dark:text-slate-100">{m.texto || m.transcricao || ROTULO[m.tipo] || "Mensagem"}</p>
              <p className="mt-0.5 text-right text-[10px] text-slate-500">{hora(m.enviada_em)}</p>
            </div>
          ))}
        </div>
        {/* Atraso / a fala da Shirley */}
        <div className={cn("mx-2.5 mb-2 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium",
          tomFaixa === "nova" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200"
            : tomFaixa === "brava" ? "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-200"
            : "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200")}>
          <Clock className="h-3.5 w-3.5 shrink-0" /><span className="min-w-0">{faixa}</span>
        </div>
        <div className="flex gap-2 px-2.5 pb-2.5">
          {botoes.map((b) => (
            <button key={b.label} type="button" onClick={b.onClick}
              className={cn("h-9 flex-1 rounded-full text-[13px] font-medium transition-colors",
                b.principal ? "bg-[#128c7e] text-white hover:bg-[#0e7469]" : "border border-[#128c7e] bg-transparent text-[#128c7e] hover:bg-[#128c7e]/10")}>
              {b.label}
            </button>
          ))}
        </div>
      </div>
      {/* Rabinho apontando para a lua da Shirley, no topo da órbita */}
      <span aria-hidden="true" className="absolute -bottom-1.5 right-[26px] h-3 w-3 rotate-45 border-b border-r bg-[#efeae2] dark:bg-slate-900" />
    </div>
  );
}
