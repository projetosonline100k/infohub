import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowUp, Loader2, Sparkles, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { cn } from "@/lib/utils";
import { confirmar } from "@/components/DialogosGlobais";
import { falar } from "@/lib/desktop/voz";

interface Mensagem {
  id: string;
  papel: "davi" | "claude";
  texto: string;
  status: "enviada" | "lida" | "respondida" | null;
  criada_em: string;
}

// "Me cobra agora" (botão ou ⌘1): manda este comando pra Inteligência do
// Infopro, que analisa o momento e publica uma cobrança na hora (o mesmo
// que a tarefa agendada faz a cada 30 min).
export const COMANDO_COBRAR = "/cobrar";

// Rascunho do campo de mensagem: sobrevive a fechar/abrir o Jarvis.
const CHAVE_RASCUNHO = "jarvis:conversa-rascunho";
const lerRascunho = () => { try { return localStorage.getItem(CHAVE_RASCUNHO) || ""; } catch { return ""; } };
const gravarRascunho = (texto: string) => {
  try { if (texto) localStorage.setItem(CHAVE_RASCUNHO, texto); else localStorage.removeItem(CHAVE_RASCUNHO); } catch { /* sem storage */ }
};

// Se ninguém pegar a mensagem nesse tempo, o chat do Claude não está ouvindo.
const ESPERA_MAXIMA_MS = 60_000;

// Markdown simples das respostas (negrito, `código`, listas e parágrafos),
// montado como elementos React — nada de HTML vindo do banco.
function trechos(linha: string) {
  return linha.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) return <b key={i}>{p.slice(2, -2)}</b>;
    if (p.startsWith("`") && p.endsWith("`")) return <code key={i} className="rounded bg-muted px-1 text-[12px]">{p.slice(1, -1)}</code>;
    return <Fragment key={i}>{p}</Fragment>;
  });
}
function TextoMarkdown({ texto }: { texto: string }) {
  const blocos = texto.trim().split(/\n{2,}/);
  return (
    <>
      {blocos.map((bloco, i) => {
        const linhas = bloco.split("\n");
        if (linhas.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l))) {
          const numerada = /^\s*\d/.test(linhas[0]);
          const Lista = numerada ? "ol" : "ul";
          return (
            <Lista key={i} className={cn("my-1 space-y-0.5 pl-5", numerada ? "list-decimal" : "list-disc")}>
              {linhas.map((l, j) => <li key={j}>{trechos(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ""))}</li>)}
            </Lista>
          );
        }
        if (/^#{1,4}\s/.test(linhas[0])) {
          return <p key={i} className="mt-1 font-semibold">{trechos(linhas.join(" ").replace(/^#{1,4}\s/, ""))}</p>;
        }
        return <p key={i} className="my-1 whitespace-pre-wrap">{linhas.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{trechos(l)}</Fragment>)}</p>;
      })}
    </>
  );
}

const rotuloDia = (iso: string) => {
  const d = new Date(iso);
  if (isToday(d)) return "Hoje";
  if (isYesterday(d)) return "Ontem";
  return format(d, "EEE, dd 'de' MMM", { locale: ptBR });
};

// Aba "Conversa" do Jarvis: chat com a sessão "Inteligência do Infopro" do
// Claude. A mensagem vai pro banco (jarvis_conversa); a sessão do Claude que
// está ouvindo (scripts/jarvis-conversa.py) responde e a resposta chega
// aqui em tempo real. ⌘+J abre direto aqui.
export function AssistantConversaTab({ foco, rascunho }: { foco: number; rascunho?: string }) {
  const { user } = useAuth();
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [texto, setTextoState] = useState(lerRascunho);
  const setTexto = useCallback((valor: string) => { setTextoState(valor); gravarRascunho(valor); }, []);
  const [enviando, setEnviando] = useState(false);
  const [agora, setAgora] = useState(() => Date.now());
  const fimRef = useRef<HTMLDivElement>(null);
  const campoRef = useRef<HTMLTextAreaElement>(null);

  const carregar = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await supabase
      .from("jarvis_conversa")
      .select("id, papel, texto, status, criada_em")
      .eq("user_id", user.id)
      .order("criada_em", { ascending: false })
      .limit(200);
    if (!error) setMensagens(((data || []) as Mensagem[]).reverse());
    setCarregando(false);
  }, [user?.id]);

  useEffect(() => { void carregar(); }, [carregar]);

  // Voz: lê em voz alta cada resposta nova do Claude (as que já estavam na
  // tela ao abrir a aba não).
  const respostasVistas = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (carregando) return;
    const respostas = mensagens.filter((m) => m.papel === "claude");
    if (!respostasVistas.current) { respostasVistas.current = new Set(respostas.map((m) => m.id)); return; }
    for (const m of respostas) {
      if (respostasVistas.current.has(m.id)) continue;
      respostasVistas.current.add(m.id);
      void falar(m.texto);
    }
  }, [mensagens, carregando]);

  // Tempo real + reconexão quando a rede cai (mesmo cuidado da guia WhatsApp).
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    if (!user?.id) return;
    let religar: ReturnType<typeof setTimeout> | undefined;
    const canal = supabase
      .channel(`jarvis-conversa-${user.id}-${tentativa}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "jarvis_conversa", filter: `user_id=eq.${user.id}` }, () => { void carregar(); })
      .subscribe((status) => {
        if (status === "SUBSCRIBED" && tentativa > 0) void carregar();
        if ((status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") && !religar) {
          religar = setTimeout(() => setTentativa((n) => n + 1), 5000);
        }
      });
    return () => { if (religar) clearTimeout(religar); void supabase.removeChannel(canal); };
  }, [user?.id, carregar, tentativa]);

  // Esperando resposta: consulta a cada 3s também (não depende só do realtime).
  const aguardando = mensagens.some((m) => m.papel === "davi" && (m.status === "enviada" || m.status === "lida"));
  useEffect(() => {
    if (!aguardando) return;
    const t = setInterval(() => { setAgora(Date.now()); void carregar(); }, 3000);
    return () => clearInterval(t);
  }, [aguardando, carregar]);

  useLayoutEffect(() => { fimRef.current?.scrollIntoView({ block: "end" }); }, [mensagens.length, aguardando]);
  useEffect(() => {
    if (rascunho) setTexto(rascunho);
    const campo = campoRef.current;
    campo?.focus();
    // Cursor no fim do rascunho, pronto pra continuar a frase.
    if (campo && rascunho) requestAnimationFrame(() => campo.setSelectionRange(campo.value.length, campo.value.length));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só a cada pedido de foco
  }, [foco]);

  const enviar = async (comando?: string) => {
    const conteudo = (comando ?? texto).trim();
    if (!conteudo || !user?.id || enviando) return;
    setEnviando(true);
    const { error } = await supabase.from("jarvis_conversa").insert({ papel: "davi", texto: conteudo, status: "enviada" });
    setEnviando(false);
    if (error) { toast.error("Não consegui enviar"); return; }
    if (!comando) setTexto("");
    setAgora(Date.now());
    void carregar();
  };

  // Ref pra o atalho sempre chamar a versão atual de `enviar`.
  const enviarRef = useRef(enviar);
  enviarRef.current = enviar;
  const pedirCobranca = useCallback(() => { void enviarRef.current(COMANDO_COBRAR); }, []);
  // ⌘1 com o Jarvis em foco (⌘J abre aqui, então ⌘J → ⌘1).
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "1") { e.preventDefault(); pedirCobranca(); }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [pedirCobranca]);

  const limpar = async () => {
    if (!user?.id || !(await confirmar("Apagar o histórico da conversa?", { botao: "Apagar", destrutivo: true }))) return;
    const { error } = await supabase.from("jarvis_conversa").delete().eq("user_id", user.id);
    if (error) toast.error("Não consegui apagar");
    else setMensagens([]);
  };

  const pendente = [...mensagens].reverse().find((m) => m.papel === "davi" && (m.status === "enviada" || m.status === "lida"));
  const semResposta = pendente?.status === "enviada" && agora - new Date(pendente.criada_em).getTime() > ESPERA_MAXIMA_MS;

  return (
    <div className="-mx-4 -my-4 flex h-[calc(100%+2rem)] flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" /> Inteligência do Infopro</span>
        <span className="ml-auto" />
        <button
          type="button"
          onClick={pedirCobranca}
          disabled={enviando}
          title="Analisa o seu momento e publica uma cobrança agora (⌘1)"
          className="mr-1 inline-flex items-center gap-1 rounded-md border border-orange-400/60 px-2 py-0.5 font-medium text-orange-600 hover:bg-orange-500/10 disabled:opacity-50 dark:text-orange-400"
        >
          <Zap className="h-3 w-3" /> Me cobra agora <kbd className="text-[10px] opacity-70">⌘1</kbd>
        </button>
        {mensagens.length > 0 && (
          <button type="button" onClick={() => void limpar()} title="Apagar conversa" className="rounded p-1 hover:bg-accent hover:text-foreground">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="scrollbar-thin flex-1 space-y-2 overflow-y-auto px-3 py-3 text-[13px]">
        {carregando && <p className="text-xs text-muted-foreground">Carregando…</p>}
        {!carregando && mensagens.length === 0 && (
          <div className="mt-6 text-center text-xs text-muted-foreground">
            <Sparkles className="mx-auto mb-2 h-6 w-6" />
            <p>Pergunte qualquer coisa sobre o Infopro:</p>
            <p className="mt-1">“quais atividades estão atrasadas?”, “como está o cliente X?”</p>
          </div>
        )}
        {mensagens.map((m, i) => {
          const novoDia = i === 0 || rotuloDia(mensagens[i - 1].criada_em) !== rotuloDia(m.criada_em);
          const minha = m.papel === "davi";
          return (
            <Fragment key={m.id}>
              {novoDia && <div className="py-1 text-center text-[10px] uppercase tracking-wide text-muted-foreground">{rotuloDia(m.criada_em)}</div>}
              <div className={cn("flex", minha ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[85%] rounded-2xl px-3 py-2", minha ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted")}>
                  {minha
                    ? <p className="whitespace-pre-wrap">{m.texto === COMANDO_COBRAR ? "⚡ Me cobra agora" : m.texto.startsWith("/analisar ") ? "🎬 Analisar reels para cliente (Creator)" : m.texto.startsWith("/ideia ") ? "💡 Separar ideia de headline (Creator)" : m.texto}</p>
                    : <TextoMarkdown texto={m.texto} />}
                  <div className={cn("mt-0.5 text-right text-[10px]", minha ? "text-primary-foreground/70" : "text-muted-foreground")}>{format(new Date(m.criada_em), "HH:mm")}</div>
                </div>
              </div>
            </Fragment>
          );
        })}
        {pendente && !semResposta && (
          <div className="flex justify-start">
            <div className="inline-flex items-center gap-1.5 rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {pendente.status === "lida" ? "Pensando…" : "Enviando pro Claude…"}
            </div>
          </div>
        )}
        {semResposta && (
          <div className="rounded-lg bg-amber-100 px-3 py-2 text-[11px] text-amber-800 dark:bg-yellow-950/50 dark:text-yellow-300">
            O chat “Inteligência do Infopro” não está ouvindo. Abra ele no Claude e peça: “fica ouvindo o Jarvis”. A mensagem será respondida assim que ele começar.
          </div>
        )}
        <div ref={fimRef} />
      </div>

      <form
        className="flex items-end gap-2 border-t border-border p-2"
        onSubmit={(e) => { e.preventDefault(); void enviar(); }}
      >
        <textarea
          ref={campoRef}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void enviar(); }
          }}
          rows={1}
          placeholder="Mensagem para a Inteligência do Infopro…"
          className="max-h-32 min-h-[36px] flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-[13px] outline-none focus:ring-1 focus:ring-ring"
          style={{ height: Math.min(128, 36 + Math.max(0, texto.split("\n").length - 1) * 18) }}
        />
        <button
          type="submit"
          disabled={!texto.trim() || enviando}
          aria-label="Enviar"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
        >
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
        </button>
      </form>
    </div>
  );
}
