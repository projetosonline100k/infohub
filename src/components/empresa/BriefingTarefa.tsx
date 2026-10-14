import { useCallback, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle2, Loader2, MessageSquare, Send, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ROTULO_CONSIGO, descricaoDaTarefa, esperandoResposta, prazoValido, segundosEsperando, trabalhaSozinho,
  type MensagemBriefing, type Proposta,
} from "@/lib/empresa/briefing";
import type { MembroResumo } from "@/lib/empresa/visaoGeral";
import { cn } from "@/lib/utils";

// Nova tarefa = conversa com o funcionário (pedido do Davi, 14/10/2026). Ele
// diz o que entendeu, pergunta o que falta e se consegue fazer; quando o
// Davi confirma, a tarefa sobe com o combinado na descrição.

export type TarefaDoBriefing = { titulo: string; tipo: string | null; prazo: string | null; descricao: string };

const AVISO_SEM_OUVINTE = 120; // segundos

export function BriefingTarefa({ clienteId, membro, onCriarTarefa }: {
  clienteId: string;
  membro: MembroResumo;
  onCriarTarefa: (t: TarefaDoBriefing) => Promise<string>;
}) {
  const [briefingId, setBriefingId] = useState<string | null>(null);
  const [proposta, setProposta] = useState<Proposta | null>(null);
  const [mensagens, setMensagens] = useState<MensagemBriefing[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [agora, setAgora] = useState(Date.now());
  const fimRef = useRef<HTMLDivElement>(null);

  const carregar = useCallback(async (id: string) => {
    const [{ data: b }, { data: m }] = await Promise.all([
      supabase.from("briefings").select("proposta, status").eq("id", id).maybeSingle(),
      supabase.from("briefing_mensagens").select("id, papel, texto, status, criada_em").eq("briefing_id", id).order("criada_em"),
    ]);
    if (b?.status !== "conversando") { setBriefingId(null); setMensagens([]); setProposta(null); return; }
    setProposta((b?.proposta as Proposta | null) ?? null);
    setMensagens((m || []) as MensagemBriefing[]);
  }, []);

  // Retoma a conversa aberta com esse funcionário, se houver.
  useEffect(() => {
    let vivo = true;
    setBriefingId(null); setMensagens([]); setProposta(null); setTexto("");
    void supabase.from("briefings").select("id").eq("membro_id", membro.id).eq("status", "conversando")
      .order("atualizado_em", { ascending: false }).limit(1).then(({ data }) => {
        if (vivo && data?.[0]) { setBriefingId(data[0].id); void carregar(data[0].id); }
      });
    return () => { vivo = false; };
  }, [membro.id, carregar]);

  const esperando = esperandoResposta(mensagens);
  useEffect(() => {
    if (!briefingId || !esperando) return;
    const t = window.setInterval(() => { setAgora(Date.now()); void carregar(briefingId); }, 3000);
    return () => window.clearInterval(t);
  }, [briefingId, esperando, carregar]);

  useEffect(() => { fimRef.current?.scrollIntoView({ block: "nearest" }); }, [mensagens.length, proposta]);

  const enviar = async () => {
    const valor = texto.trim();
    if (!valor || enviando) return;
    setEnviando(true);
    try {
      let id = briefingId;
      if (!id) {
        id = crypto.randomUUID();
        const { error } = await supabase.from("briefings").insert({ id, cliente_id: clienteId, membro_id: membro.id });
        if (error) throw error;
        setBriefingId(id);
      }
      const { error } = await supabase.from("briefing_mensagens").insert({ briefing_id: id, cliente_id: clienteId, papel: "davi", texto: valor });
      if (error) throw error;
      setTexto("");
      setAgora(Date.now());
      await carregar(id);
    } catch {
      toast.error("Não consegui mandar a mensagem");
    } finally {
      setEnviando(false);
    }
  };

  const confirmar = async () => {
    if (!briefingId || !proposta) return;
    setConfirmando(true);
    try {
      const atividadeId = await onCriarTarefa({
        titulo: proposta.titulo,
        tipo: proposta.tipo || null,
        prazo: prazoValido(proposta.prazo_sugerido) ? proposta.prazo_sugerido! : null,
        descricao: descricaoDaTarefa(proposta, mensagens, membro.nome),
      });
      const { error } = await supabase.from("briefings").update({ status: "confirmado", atividade_id: atividadeId }).eq("id", briefingId);
      if (error) throw error;
      toast.success(trabalhaSozinho(membro.nome)
        ? `Tarefa subiu: ${membro.nome} já começa e te entrega para aprovar`
        : `Tarefa subiu para ${membro.nome}`);
      setBriefingId(null); setMensagens([]); setProposta(null);
    } catch {
      toast.error("Não consegui subir a tarefa");
    } finally {
      setConfirmando(false);
    }
  };

  const cancelar = async () => {
    if (!briefingId || !window.confirm("Descartar esta conversa? Nenhuma tarefa é criada.")) return;
    await supabase.from("briefings").update({ status: "cancelado" }).eq("id", briefingId);
    setBriefingId(null); setMensagens([]); setProposta(null);
  };

  const esperou = segundosEsperando(mensagens, agora);

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-sky-500" />
        <p className="text-sm font-semibold">Nova tarefa: converse com {membro.nome}</p>
        {briefingId && (
          <button type="button" onClick={() => void cancelar()} className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <X className="h-3 w-3" />Descartar
          </button>
        )}
      </div>

      {mensagens.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Explique o que precisa como se falasse com {membro.eh_ia ? "ele" : "a pessoa"}. {membro.nome} diz o que entendeu, pergunta o que falta e se consegue fazer.
          A tarefa só sobe quando você confirmar.
        </p>
      ) : (
        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {mensagens.map((m) => (
            <div key={m.id} className={cn("flex", m.papel === "davi" ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm",
                m.papel === "davi" ? "bg-primary text-primary-foreground" : "bg-muted")}>
                {m.texto}
                <span className="mt-0.5 block text-right text-[10px] opacity-60">{format(new Date(m.criada_em), "HH:mm", { locale: ptBR })}</span>
              </div>
            </div>
          ))}
          {esperando && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {esperou > AVISO_SEM_OUVINTE
                ? "Ninguém respondeu ainda. O ouvinte do Jarvis está ligado neste Mac?"
                : `${membro.nome} está lendo…`}
            </p>
          )}
          <div ref={fimRef} />
        </div>
      )}

      {proposta && !esperando && (
        <div className="space-y-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-2.5 text-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">O que {membro.nome} entendeu</p>
          <p className="font-medium">{proposta.titulo}</p>
          <p className="whitespace-pre-wrap text-xs">{proposta.entendimento}</p>
          {!!proposta.entregas?.length && (
            <ul className="list-disc pl-4 text-xs">{proposta.entregas.map((e) => <li key={e}>{e}</li>)}</ul>
          )}
          <p className={cn("text-xs font-medium", proposta.consigo === "sim" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
            {ROTULO_CONSIGO[proposta.consigo] ?? proposta.consigo}{proposta.limites ? ` — ${proposta.limites}` : ""}
          </p>
          {!!proposta.precisa_de?.length && (
            <p className="text-xs"><b>Precisa de você:</b> {proposta.precisa_de.join(" · ")}</p>
          )}
          {prazoValido(proposta.prazo_sugerido) && (
            <p className="text-xs text-muted-foreground">Prazo sugerido: {format(new Date(`${proposta.prazo_sugerido}T12:00:00`), "EEE, d MMM", { locale: ptBR })}</p>
          )}
          <Button size="sm" className="h-8 gap-1.5" disabled={confirmando} onClick={() => void confirmar()}>
            {confirmando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Confirmar e subir a tarefa
          </Button>
          <p className="text-[11px] text-muted-foreground">Não ficou certo? Responda abaixo que {membro.nome} ajusta.</p>
        </div>
      )}

      <form className="flex items-end gap-1.5" onSubmit={(e) => { e.preventDefault(); void enviar(); }}>
        <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={mensagens.length ? 2 : 3}
          placeholder={mensagens.length ? "Responder…" : `O que ${membro.nome} precisa fazer? Objetivo, produto, prazo, referências…`}
          className="min-h-0 text-sm"
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void enviar(); } }} />
        <Button type="submit" size="icon" className="h-9 w-9 shrink-0" disabled={!texto.trim() || enviando} title="Enviar (⌘ Enter)">
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
}
