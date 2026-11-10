import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Power, Send, X } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { ehAdmin } from "@/lib/admin";
import { cn } from "@/lib/utils";
import { CabecaBoneco } from "./BonecoMesa";
import { TextoMensagem } from "./BriefingTarefa";

// Boneco flutuante do modo vivo (10/11/2026, Davi: "quando eu ativar, quero o boneco do Roy flutuando"): enquanto a
// conversa de um funcionário está em modo vivo, a bolinha dele flutua no canto da tela, em qualquer página. Mostra
// quando ele está trabalhando, solta um balão com a última fala e, ao clicar, abre um chat curto para falar com ele
// sem sair de onde você está. O botão de energia desliga o modo vivo.
const db = supabase as unknown as SupabaseClient;
interface Vivo { id: string; clienteId: string; nome: string }
interface Msg { id: string; papel: string; texto: string; status: string | null; criada_em: string }

export function OrbeVivo() {
  const { user } = useAuth();
  const admin = ehAdmin(user?.email);
  const [vivos, setVivos] = useState<Vivo[]>([]);
  const [aberto, setAberto] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const { data } = await db.from("briefings").select("id, cliente_id, membro_id, membros:membro_id(nome)").eq("modo_vivo", true).limit(4);
    setVivos(((data ?? []) as { id: string; cliente_id: string; membros: { nome: string } | { nome: string }[] | null }[]).map((b) => ({
      id: b.id, clienteId: b.cliente_id, nome: (Array.isArray(b.membros) ? b.membros[0]?.nome : b.membros?.nome) ?? "Funcionário",
    })));
  }, []);
  useEffect(() => {
    if (!admin) return;
    void carregar();
    const t = window.setInterval(() => void carregar(), 8000);
    const ligou = () => void carregar();
    window.addEventListener("modo-vivo:mudou", ligou);
    return () => { window.clearInterval(t); window.removeEventListener("modo-vivo:mudou", ligou); };
  }, [admin, carregar]);

  if (!admin || !vivos.length) return null;
  return (
    <div className="pointer-events-none fixed bottom-28 right-5 z-[60] flex flex-col items-end gap-3">
      {vivos.map((v) => <Orbe key={v.id} vivo={v} aberto={aberto === v.id} onAbrir={(a) => setAberto(a ? v.id : null)} onDesligou={() => { setAberto(null); void carregar(); }} />)}
    </div>
  );
}

function Orbe({ vivo, aberto, onAbrir, onDesligou }: { vivo: Vivo; aberto: boolean; onAbrir: (a: boolean) => void; onDesligou: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [balao, setBalao] = useState<Msg | null>(null);
  const ultimoVisto = useRef<string | null>(null);
  const fim = useRef<HTMLDivElement>(null);

  const trabalhando = msgs.some((m) => m.papel === "davi" && (m.status === "enviada" || m.status === "lida")) ;

  const carregar = useCallback(async () => {
    const { data } = await db.from("briefing_mensagens").select("id, papel, texto, status, criada_em").eq("briefing_id", vivo.id).order("criada_em", { ascending: false }).limit(20);
    const lista = ((data ?? []) as Msg[]).reverse();
    setMsgs(lista);
    const ultima = [...lista].reverse().find((m) => m.papel === "funcionario");
    if (ultima && ultimoVisto.current !== null && ultima.id !== ultimoVisto.current) setBalao(ultima);   // fala nova: balão
    if (ultima) ultimoVisto.current = ultima.id; else if (ultimoVisto.current === null) ultimoVisto.current = "";
  }, [vivo.id]);
  useEffect(() => {
    void carregar();
    const t = window.setInterval(() => void carregar(), trabalhando ? 2000 : 4000);
    return () => window.clearInterval(t);
  }, [carregar, trabalhando]);
  useEffect(() => { if (!balao) return; const t = window.setTimeout(() => setBalao(null), 12000); return () => window.clearTimeout(t); }, [balao]);
  useEffect(() => { if (aberto) { setBalao(null); fim.current?.scrollIntoView({ block: "end" }); } }, [aberto, msgs.length]);

  const enviar = async () => {
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    const { error } = await supabase.from("briefing_mensagens").insert({ briefing_id: vivo.id, cliente_id: vivo.clienteId, papel: "davi", texto: t });
    setEnviando(false);
    if (error) { toast.error("Não consegui mandar"); return; }
    setTexto("");
    void carregar();
  };
  const desligar = async () => {
    const { error } = await db.from("briefings").update({ modo_vivo: false }).eq("id", vivo.id);
    if (error) { toast.error("Não consegui desligar"); return; }
    toast.success("Modo vivo desligado");
    window.dispatchEvent(new Event("modo-vivo:mudou"));
    onDesligou();
  };

  return (
    <div className="pointer-events-none flex flex-col items-end gap-2">
      {aberto && (
        <div className="pointer-events-auto flex h-[420px] w-[340px] flex-col overflow-hidden rounded-2xl border border-emerald-400/30 bg-[#0b1220] text-white shadow-2xl">
          <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
            <span className="h-7 w-7 overflow-hidden rounded-full"><CabecaBoneco nome={vivo.nome} ehIa className="h-full w-full" /></span>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{vivo.nome}</p><p className="flex items-center gap-1 text-[11px] text-emerald-300"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />ao vivo no seu Mac</p></div>
            <button type="button" onClick={() => void desligar()} title="Desligar o modo vivo" className="rounded-md p-1.5 text-white/60 hover:bg-rose-500/20 hover:text-rose-300"><Power className="h-4 w-4" /></button>
            <button type="button" onClick={() => onAbrir(false)} title="Fechar" className="rounded-md p-1.5 text-white/60 hover:bg-white/10"><X className="h-4 w-4" /></button>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {msgs.length === 0 && <p className="text-xs text-white/40">Fale com {vivo.nome}: ele responde ao vivo e pode usar o seu Chrome e o computador.</p>}
            {msgs.map((m) => (
              <div key={m.id} className={cn("flex", m.papel === "davi" ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[88%] whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-[13px]", m.papel === "davi" ? "rounded-br-md bg-cyan-500 text-black" : "rounded-bl-md bg-white/10")}><TextoMensagem texto={m.texto} /></div>
              </div>
            ))}
            {trabalhando && <p className="flex items-center gap-1.5 text-xs text-white/50"><Loader2 className="h-3.5 w-3.5 animate-spin" />{vivo.nome} está trabalhando…</p>}
            <div ref={fim} />
          </div>
          <form className="flex items-end gap-1.5 border-t border-white/10 p-2" onSubmit={(e) => { e.preventDefault(); void enviar(); }}>
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} placeholder={`Fale com ${vivo.nome}… (Enter envia)`} autoFocus
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void enviar(); } }}
              className="min-h-0 flex-1 resize-none rounded-lg border border-white/15 bg-black/30 px-2.5 py-1.5 text-sm outline-none placeholder:text-white/30 focus:border-cyan-400/60" />
            <button type="submit" disabled={!texto.trim() || enviando} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500 text-black disabled:opacity-40"><Send className="h-4 w-4" /></button>
          </form>
        </div>
      )}
      {!aberto && balao && (
        <button type="button" onClick={() => onAbrir(true)} className="pointer-events-auto max-w-[280px] rounded-2xl rounded-br-md border border-white/10 bg-[#0b1220] px-3 py-2 text-left text-[13px] text-white shadow-xl animate-in fade-in-0 slide-in-from-bottom-2">
          <span className="line-clamp-4"><TextoMensagem texto={balao.texto} /></span>
        </button>
      )}
      <button type="button" onClick={() => onAbrir(!aberto)} title={`${vivo.nome} · ao vivo (clique para conversar)`}
        className="pointer-events-auto relative h-14 w-14 rounded-full bg-[#0b1220] shadow-[0_0_0_2px_rgba(52,211,153,0.7),0_0_26px_rgba(52,211,153,0.45)] transition-transform hover:scale-110"
        style={{ animation: "orbe-vivo-flutua 4s ease-in-out infinite" }}>
        <span className="block h-full w-full overflow-hidden rounded-full"><CabecaBoneco nome={vivo.nome} ehIa className="h-full w-full" /></span>
        {trabalhando && <span className="absolute -inset-1 animate-spin rounded-full border-2 border-transparent border-t-emerald-300" />}
        <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#0b1220] bg-emerald-400" />
      </button>
    </div>
  );
}
