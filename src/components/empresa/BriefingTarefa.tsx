import { useCallback, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AtSign, CheckCircle2, FileText, Loader2, MessageSquare, Mic, Send, Square, X } from "lucide-react";
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
import { isDesktop } from "@/lib/platform";

// Nova tarefa = conversa com o funcionário (pedido do Davi, 14/10/2026). Ele
// diz o que entendeu, pergunta o que falta e se consegue fazer; quando o
// Davi confirma, a tarefa sobe com o combinado na descrição.

export type TarefaDoBriefing = { titulo: string; tipo: string | null; prazo: string | null; descricao: string };

const AVISO_SEM_OUVINTE = 120; // segundos

// "@" na conversa: escolher um documento do projeto pro funcionário ler. Vai
// na mensagem como linha "📎 … (documento <id>)" (o ouvinte manda ler pelo id);
// na bolha aparece só o nome.
interface DocProjeto { id: string; titulo: string }
const LINHA_ANEXO = /^📎 Para ler: "(.+)" \(documento [0-9a-f-]{36}\)$/;
const PREFIXO_AUDIO = "🎙️ ";

const paraBase64 = (blob: Blob) => new Promise<string>((ok, erro) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(",")[1] ?? "");
  r.onerror = () => erro(r.error);
  r.readAsDataURL(blob);
});

function TextoMensagem({ texto }: { texto: string }) {
  const linhas = texto.split("\n");
  const anexos = linhas.map((l) => l.match(LINHA_ANEXO)?.[1]).filter((x): x is string => !!x);
  const corpo = linhas.filter((l) => !LINHA_ANEXO.test(l)).join("\n").trimEnd();
  return (
    <>
      {corpo}
      {anexos.length > 0 && (
        <span className="mt-1.5 flex flex-wrap gap-1">
          {anexos.map((a) => <span key={a} className="inline-flex items-center gap-1 rounded-md bg-black/10 px-1.5 py-0.5 text-xs dark:bg-white/10"><FileText className="h-3 w-3" />{a}</span>)}
        </span>
      )}
    </>
  );
}

export function BriefingTarefa({ clienteId, membro, onCriarTarefa, messenger }: {
  clienteId: string;
  membro: MembroResumo;
  onCriarTarefa: (t: TarefaDoBriefing) => Promise<string>;
  // Na gaveta da equipe (estilo Messenger): sem moldura, ocupa a altura e o Enter envia.
  messenger?: boolean;
}) {
  const [briefingId, setBriefingId] = useState<string | null>(null);
  const [proposta, setProposta] = useState<Proposta | null>(null);
  const [mensagens, setMensagens] = useState<MensagemBriefing[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [agora, setAgora] = useState(Date.now());
  const fimRef = useRef<HTMLDivElement>(null);
  const campoRef = useRef<HTMLTextAreaElement>(null);
  // @ → documentos do projeto
  const [docs, setDocs] = useState<DocProjeto[] | null>(null);
  const [mencao, setMencao] = useState<{ inicio: number; busca: string } | null>(null);
  const [mencaoIdx, setMencaoIdx] = useState(0);
  const [anexos, setAnexos] = useState<DocProjeto[]>([]);
  // Áudio (só no app do Mac: transcreve com o Whisper local, como a voz da orbe)
  const [gravando, setGravando] = useState<number | null>(null);
  const [transcrevendo, setTranscrevendo] = useState(false);
  const gravador = useRef<MediaRecorder | null>(null);

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

  const enviar = async (falado?: string) => {
    const digitado = falado ?? texto.trim();
    if (!digitado || enviando) return;
    const usados = falado ? [] : anexos.filter((a) => digitado.includes(`@${a.titulo}`));
    const valor = usados.length ? `${digitado}\n\n${usados.map((a) => `📎 Para ler: "${a.titulo}" (documento ${a.id})`).join("\n")}` : digitado;
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
      if (!falado) { setTexto(""); setAnexos([]); setMencao(null); }
      setAgora(Date.now());
      await carregar(id);
    } catch {
      toast.error("Não consegui mandar a mensagem");
    } finally {
      setEnviando(false);
    }
  };

  const sugestoes = mencao && docs
    ? docs.filter((d) => d.titulo.toLowerCase().includes(mencao.busca.toLowerCase())).slice(0, 8)
    : [];

  const aoDigitar = (valor: string, cursor: number) => {
    setTexto(valor);
    const antes = valor.slice(0, cursor);
    const m = antes.match(/(^|\s)@([^\n@]{0,40})$/);
    if (!m) { setMencao(null); return; }
    setMencao({ inicio: cursor - m[2].length - 1, busca: m[2] });
    setMencaoIdx(0);
    if (!docs) {
      setDocs([]);
      void supabase.from("documentos").select("id, titulo").eq("cliente_id", clienteId).is("deleted_at", null)
        .order("updated_at", { ascending: false }).limit(300)
        .then(({ data }) => setDocs(((data || []) as DocProjeto[]).filter((d) => d.titulo?.trim())));
    }
  };

  const escolherDoc = (d: DocProjeto) => {
    if (!mencao) return;
    const fim = mencao.inicio + 1 + mencao.busca.length;
    const inserido = `@${d.titulo} `;
    setTexto(texto.slice(0, mencao.inicio) + inserido + texto.slice(fim));
    setAnexos((a) => (a.some((x) => x.id === d.id) ? a : [...a, d]));
    setMencao(null);
    const pos = mencao.inicio + inserido.length;
    requestAnimationFrame(() => { campoRef.current?.focus(); campoRef.current?.setSelectionRange(pos, pos); });
  };

  const gravarOuParar = async () => {
    if (gravador.current) { gravador.current.stop(); return; }
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { toast.error("Sem acesso ao microfone"); return; }
    const rec = new MediaRecorder(stream);
    const partes: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) partes.push(e.data); };
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      gravador.current = null;
      setGravando(null);
      const audio = new Blob(partes, { type: rec.mimeType || "audio/mp4" });
      if (audio.size < 2000) return;
      setTranscrevendo(true);
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const extensao = audio.type.includes("webm") ? "webm" : "m4a";
        const falado = (await invoke<string>("voz_transcrever", { base64: await paraBase64(audio), extensao })).trim();
        if (falado.replace(/[^\p{L}\p{N}]/gu, "").length < 2) { toast("Não entendi o áudio. Pode repetir?"); return; }
        await enviar(PREFIXO_AUDIO + falado);
      } catch (e) {
        toast.error(`Não consegui transcrever o áudio: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setTranscrevendo(false);
      }
    };
    gravador.current = rec;
    rec.start();
    setGravando(Date.now());
  };
  useEffect(() => () => { gravador.current?.stop(); }, []);
  useEffect(() => {
    if (gravando == null) return;
    const t = window.setInterval(() => setAgora(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [gravando]);

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
    <div className={messenger ? "flex h-full min-h-0 flex-col gap-2 p-3" : "space-y-2 rounded-lg border p-3"}>
      <div className="flex items-center gap-2">
        {!messenger && <MessageSquare className="h-4 w-4 text-sky-500" />}
        {!messenger && <p className="text-sm font-semibold">Nova tarefa: converse com {membro.nome}</p>}
        {briefingId && (
          <button type="button" onClick={() => void cancelar()} className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <X className="h-3 w-3" />Descartar
          </button>
        )}
      </div>

      {mensagens.length === 0 ? (
        <p className={cn("text-xs text-muted-foreground", messenger && "mt-auto rounded-lg bg-muted/60 p-3")}>
          Explique o que precisa como se falasse com {membro.eh_ia ? "ele" : "a pessoa"}. {membro.nome} diz o que entendeu, pergunta o que falta e se consegue fazer.
          A tarefa só sobe quando você confirmar. Digite <b>@</b> para mandar um documento do projeto para {membro.nome} ler.
        </p>
      ) : (
        // A proposta fica dentro da rolagem: texto longo não corta mais (bug de 15/10).
        <div className={cn("space-y-2 overflow-y-auto pr-1", messenger ? "min-h-0 flex-1" : "max-h-[28rem]")}>
          {mensagens.map((m) => (
            <div key={m.id} className={cn("flex", m.papel === "davi" ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[85%] whitespace-pre-wrap break-words px-3 py-2 text-sm",
                messenger ? "rounded-2xl" : "rounded-lg",
                m.papel === "davi" ? cn("bg-primary text-primary-foreground", messenger && "rounded-br-md") : cn("bg-muted", messenger && "rounded-bl-md"))}>
                <TextoMensagem texto={m.texto} />
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
          <div ref={fimRef} />
        </div>
      )}

      <form className="relative flex items-end gap-1.5" onSubmit={(e) => { e.preventDefault(); void enviar(); }}>
        {mencao && (
          <div className="absolute bottom-full left-0 right-0 z-10 mb-1 max-h-64 overflow-y-auto rounded-lg border bg-popover p-1 shadow-lg">
            <p className="flex items-center gap-1 px-2 py-1 text-[11px] text-muted-foreground"><AtSign className="h-3 w-3" />Documento para {membro.nome} ler</p>
            {docs === null || (docs.length === 0 && !mencao.busca) ? (
              <p className="px-2 py-2 text-xs text-muted-foreground">{docs === null ? "Carregando…" : "Nenhum documento neste projeto."}</p>
            ) : sugestoes.length === 0 ? (
              <p className="px-2 py-2 text-xs text-muted-foreground">Nenhum documento com “{mencao.busca}”.</p>
            ) : sugestoes.map((d, i) => (
              <button key={d.id} type="button" onMouseDown={(e) => { e.preventDefault(); escolherDoc(d); }}
                className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm", i === mencaoIdx ? "bg-accent" : "hover:bg-muted")}>
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /><span className="truncate">{d.titulo}</span>
              </button>
            ))}
          </div>
        )}
        <Textarea ref={campoRef} value={texto} rows={messenger ? 2 : mensagens.length ? 2 : 3}
          onChange={(e) => aoDigitar(e.target.value, e.target.selectionStart ?? e.target.value.length)}
          placeholder={gravando != null ? "Gravando… clique no quadrado para enviar" : transcrevendo ? "Transcrevendo o áudio…"
            : mensagens.length ? "Responder… (@ para mandar um documento)" : `O que ${membro.nome} precisa fazer? Objetivo, produto, prazo, referências… (@ para um documento)`}
          className="min-h-0 text-sm" disabled={gravando != null || transcrevendo}
          onKeyDown={(e) => {
            if (mencao && sugestoes.length) {
              if (e.key === "ArrowDown") { e.preventDefault(); setMencaoIdx((i) => (i + 1) % sugestoes.length); return; }
              if (e.key === "ArrowUp") { e.preventDefault(); setMencaoIdx((i) => (i - 1 + sugestoes.length) % sugestoes.length); return; }
              if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); escolherDoc(sugestoes[mencaoIdx] ?? sugestoes[0]); return; }
            }
            if (mencao && e.key === "Escape") { e.preventDefault(); setMencao(null); return; }
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey || (messenger && !e.shiftKey))) { e.preventDefault(); void enviar(); }
          }} />
        {isDesktop() && !texto.trim() ? (
          <Button type="button" size="icon" variant={gravando != null ? "destructive" : "outline"} className="h-9 shrink-0 gap-1 px-2"
            style={{ width: gravando != null ? "auto" : undefined }}
            disabled={transcrevendo || enviando} onClick={() => void gravarOuParar()}
            title={gravando != null ? "Parar e enviar o áudio" : "Mandar um áudio"}>
            {transcrevendo ? <Loader2 className="h-4 w-4 animate-spin" />
              : gravando != null ? <><Square className="h-3.5 w-3.5 fill-current" /><span className="text-xs tabular-nums">{Math.floor((agora - gravando) / 1000)}s</span></>
              : <Mic className="h-4 w-4" />}
          </Button>
        ) : (
          <Button type="submit" size="icon" className="h-9 w-9 shrink-0" disabled={!texto.trim() || enviando} title="Enviar (⌘ Enter)">
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        )}
      </form>
    </div>
  );
}
