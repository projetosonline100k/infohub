import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, FileText, Loader2, Mic, Search, Send, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isDesktop } from "@/lib/platform";
import { cn } from "@/lib/utils";

// Guia WhatsApp → "Conversas": o WhatsApp ao vivo dentro do Jarvis. As
// mensagens chegam pelo WAHA no Mac (scripts/whatsapp-receptor.py) na tabela
// whatsapp_mensagens; áudios já vêm transcritos. Enviar só acontece quando o
// Davi clica em Enviar (comando whatsapp_enviar, só no app do Mac).

interface Conversa {
  chat_id: string; chat_nome: string | null; eh_grupo: boolean; ultima_em: string; ultima_de_mim: boolean;
  ultima_tipo: string; ultima_texto: string | null; ultima_autor: string | null; total: number;
}
interface Mensagem {
  id: string; chat_id: string; chat_nome: string | null; eh_grupo: boolean; de_mim: boolean; autor_nome: string | null;
  tipo: string; texto: string | null; transcricao: string | null; transcricao_status: string | null; enviada_em: string;
  midia_arquivo?: string | null;
}

// Fotos/vídeos/áudios ficam no Mac e o receptor do WhatsApp entrega pro
// Jarvis (só no app do Mac). Endereço + chave vêm do comando whatsapp_midia_base.
let midiaBase: Promise<{ base: string; chave: string } | null> | null = null;
function useMidiaUrl() {
  const [cfg, setCfg] = useState<{ base: string; chave: string } | null>(null);
  useEffect(() => {
    if (!isDesktop()) return;
    midiaBase ??= import("@tauri-apps/api/core").then(({ invoke }) => invoke<{ base: string; chave: string }>("whatsapp_midia_base")).catch(() => null);
    void midiaBase.then(setCfg);
  }, []);
  return useCallback((arquivo?: string | null) => (cfg && arquivo ? `${cfg.base}${encodeURIComponent(arquivo)}?k=${cfg.chave}` : null), [cfg]);
}

const paraBase64 = (blob: Blob) => new Promise<string>((ok, erro) => {
  const leitor = new FileReader();
  leitor.onload = () => ok(String(leitor.result).split(",")[1] ?? "");
  leitor.onerror = () => erro(leitor.error);
  leitor.readAsDataURL(blob);
});

const CHAVE_VISTAS = "jarvis:whatsapp-vistas";
const CHAVE_ABERTA = "jarvis:whatsapp-conversa-aberta";
const lerVistas = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(CHAVE_VISTAS) || "{}"); } catch { return {}; } };
const ROTULO_TIPO: Record<string, string> = { imagem: "📷 Foto", video: "🎥 Vídeo", documento: "📄 Documento", figurinha: "Figurinha", outro: "Mensagem" };

const horaCurta = (iso: string) => {
  const d = new Date(iso);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "ontem";
  return format(d, "dd/MM");
};
const resumo = (c: Conversa) => {
  const pre = c.ultima_de_mim ? "Você: " : c.eh_grupo && c.ultima_autor ? `${c.ultima_autor.split(" ")[0]}: ` : "";
  const corpo = c.ultima_tipo === "audio" ? `🎤 ${c.ultima_texto ?? "Áudio"}` : c.ultima_tipo !== "texto" ? (ROTULO_TIPO[c.ultima_tipo] ?? "Mensagem") : c.ultima_texto ?? "";
  return pre + corpo;
};

// Acha a conversa de um card do painel: pelo telefone (últimos 8 dígitos,
// que não mudam com o 9 extra) ou, se não tiver, pelo nome.
function acharConversa(conversas: Conversa[], nome: string, when: string): Conversa | null {
  const numeros = (when.match(/\+?\d[\d\s().-]{8,}\d/g) || []).map((d) => d.replace(/\D/g, "")).filter((d) => d.length >= 10);
  for (const n of numeros) {
    const c = conversas.find((x) => x.chat_id.split("@")[0].replace(/\D/g, "").endsWith(n.slice(-8)));
    if (c) return c;
  }
  const alvo = nome.trim().toLowerCase();
  if (!alvo) return null;
  return conversas.find((x) => (x.chat_nome ?? "").trim().toLowerCase() === alvo)
    ?? conversas.find((x) => { const n = (x.chat_nome ?? "").trim().toLowerCase(); return !!n && (n.includes(alvo) || alvo.includes(n)); })
    ?? null;
}

export function WhatsappConversas({ pedido }: { pedido?: { nome: string; when: string; n: number } | null } = {}) {
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  // A conversa aberta continua aberta ao sair e voltar (fechar o Jarvis,
  // trocar de guia ou de "Painel"/"Conversas").
  const [aberta, setAbertaEstado] = useState<Conversa | null>(() => {
    try { return JSON.parse(localStorage.getItem(CHAVE_ABERTA) || "null"); } catch { return null; }
  });
  const setAberta = (c: Conversa | null) => {
    setAbertaEstado(c);
    try { if (c) localStorage.setItem(CHAVE_ABERTA, JSON.stringify(c)); else localStorage.removeItem(CHAVE_ABERTA); } catch { /* sem storage */ }
  };
  const [vistas, setVistas] = useState(lerVistas);

  const carregarConversas = useCallback(async () => {
    const { data } = await supabase.rpc("whatsapp_conversas");
    setConversas(((data || []) as Conversa[]).sort((a, b) => b.ultima_em.localeCompare(a.ultima_em)));
    setCarregando(false);
  }, []);

  useEffect(() => { void carregarConversas(); }, [carregarConversas]);

  // Ao vivo: qualquer mensagem nova (ou transcrição pronta) atualiza a lista.
  const [novidade, setNovidade] = useState<Mensagem | null>(null);
  useEffect(() => {
    const canal = supabase.channel("jarvis-whatsapp-conversas")
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_mensagens" }, (ev) => {
        void carregarConversas();
        if (ev.new && (ev.new as Mensagem).id) setNovidade(ev.new as Mensagem);
      })
      .subscribe();
    return () => { void supabase.removeChannel(canal); };
  }, [carregarConversas]);

  const marcarVista = useCallback((chatId: string, quando: string) => {
    setVistas((v) => {
      if (v[chatId] && v[chatId] >= quando) return v;
      const novo = { ...v, [chatId]: quando };
      try { localStorage.setItem(CHAVE_VISTAS, JSON.stringify(novo)); } catch { /* sem storage */ }
      return novo;
    });
  }, []);

  // Pedido do painel (modo Dividido): abre a conversa daquele card.
  const pedidoAtendido = useRef(0);
  useEffect(() => {
    if (!pedido || pedido.n === pedidoAtendido.current || carregando) return;
    pedidoAtendido.current = pedido.n;
    const c = acharConversa(conversas, pedido.nome, pedido.when);
    if (c) { setAberta(c); marcarVista(c.chat_id, c.ultima_em); }
    else toast.error(`Não achei a conversa de ${pedido.nome} no WhatsApp do Mac`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido, conversas, carregando]);

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return t ? conversas.filter((c) => (c.chat_nome ?? c.chat_id).toLowerCase().includes(t)) : conversas;
  }, [conversas, busca]);

  if (aberta) {
    return <Conversa conversa={aberta} novidade={novidade} onVoltar={() => setAberta(null)} onVista={marcarVista} />;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="relative mx-3 mb-2">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar conversa…"
          className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-2 text-[12px] outline-none focus:border-primary/50" />
      </div>
      {carregando ? (
        <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : filtradas.length === 0 ? (
        <p className="px-4 py-8 text-center text-xs text-muted-foreground">
          {conversas.length ? "Nenhuma conversa com esse nome." : "Nenhuma mensagem ainda. Elas chegam pelo WhatsApp conectado no Mac."}
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {filtradas.map((c) => {
            const naoLida = !c.ultima_de_mim && (!vistas[c.chat_id] || vistas[c.chat_id] < c.ultima_em);
            return (
              <button key={c.chat_id} type="button" onClick={() => { setAberta(c); marcarVista(c.chat_id, c.ultima_em); }}
                className="flex w-full items-center gap-2.5 border-b border-border/60 px-3 py-2 text-left hover:bg-accent/60">
                <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white",
                  c.eh_grupo ? "bg-teal-600" : "bg-emerald-500")}>
                  {c.eh_grupo ? <Users className="h-4 w-4" /> : (c.chat_nome ?? "?").slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className={cn("min-w-0 flex-1 truncate text-[13px]", naoLida ? "font-semibold" : "font-medium")}>{c.chat_nome ?? c.chat_id.split("@")[0]}</span>
                    <span className={cn("shrink-0 text-[10.5px]", naoLida ? "font-semibold text-emerald-600" : "text-muted-foreground")}>{horaCurta(c.ultima_em)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground">{resumo(c)}</span>
                    {naoLida && <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-label="Não lida" />}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Conversa({ conversa, novidade, onVoltar, onVista }: {
  conversa: Conversa; novidade: Mensagem | null; onVoltar: () => void; onVista: (chatId: string, quando: string) => void;
}) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [carregando, setCarregando] = useState(true);
  // Rascunho por conversa (sobrevive a fechar o Jarvis) e erro visível aqui
  // mesmo (o aviso flutuante nem sempre aparece na janela do Jarvis).
  const chaveRascunho = `jarvis:whatsapp-rascunho:${conversa.chat_id}`;
  const [texto, setTextoEstado] = useState(() => { try { return localStorage.getItem(chaveRascunho) ?? ""; } catch { return ""; } });
  const setTexto = (valor: string) => {
    setTextoEstado(valor);
    try { if (valor) localStorage.setItem(chaveRascunho, valor); else localStorage.removeItem(chaveRascunho); } catch { /* sem storage */ }
  };
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const urlDe = useMidiaUrl();
  const [ampliada, setAmpliada] = useState<string | null>(null);

  // Gravar áudio (microfone): clica pra começar, depois Enviar ou lixeira.
  const [gravando, setGravando] = useState<{ inicio: number } | null>(null);
  const [segundos, setSegundos] = useState(0);
  const gravadorRef = useRef<MediaRecorder | null>(null);
  const pedacosRef = useRef<Blob[]>([]);
  useEffect(() => {
    if (!gravando) return;
    const t = setInterval(() => setSegundos(Math.floor((Date.now() - gravando.inicio) / 1000)), 250);
    return () => clearInterval(t);
  }, [gravando]);
  useEffect(() => () => { gravadorRef.current?.stream.getTracks().forEach((t) => t.stop()); }, []);

  const comecarGravacao = async () => {
    setErroEnvio(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const tipo = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t));
      const gravador = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined);
      pedacosRef.current = [];
      gravador.ondataavailable = (e) => { if (e.data.size) pedacosRef.current.push(e.data); };
      gravador.start(250);
      gravadorRef.current = gravador;
      setSegundos(0);
      setGravando({ inicio: Date.now() });
    } catch {
      setErroEnvio("Não consegui usar o microfone. Libere em Ajustes do Sistema → Privacidade → Microfone.");
    }
  };

  const pararGravacao = () => new Promise<Blob | null>((ok) => {
    const gravador = gravadorRef.current;
    gravadorRef.current = null;
    setGravando(null);
    if (!gravador) { ok(null); return; }
    gravador.onstop = () => {
      gravador.stream.getTracks().forEach((t) => t.stop());
      ok(new Blob(pedacosRef.current, { type: gravador.mimeType || "audio/mp4" }));
    };
    gravador.stop();
  });

  const enviarAudio = async () => {
    const audio = await pararGravacao();
    if (!audio || audio.size < 1000) return;
    setEnviando(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("whatsapp_enviar_audio", { chatId: conversa.chat_id, base64: await paraBase64(audio), mimetype: audio.type.split(";")[0] });
    } catch (e) {
      const msg = typeof e === "string" ? e : e instanceof Error ? e.message : "Não consegui enviar o áudio";
      setErroEnvio(msg);
    } finally {
      setEnviando(false);
    }
  };
  const fimRef = useRef<HTMLDivElement>(null);
  const podeEnviar = isDesktop();

  useEffect(() => {
    let cancelado = false;
    void supabase.from("whatsapp_mensagens")
      .select("id, chat_id, chat_nome, eh_grupo, de_mim, autor_nome, tipo, texto, transcricao, transcricao_status, enviada_em, midia_arquivo")
      .eq("chat_id", conversa.chat_id).order("enviada_em", { ascending: false }).limit(200)
      .then(({ data }) => {
        if (cancelado) return;
        setMensagens(((data || []) as Mensagem[]).reverse());
        setCarregando(false);
      });
    return () => { cancelado = true; };
  }, [conversa.chat_id]);

  // Mensagem nova (ou transcrição pronta) desta conversa, ao vivo.
  useEffect(() => {
    if (!novidade || novidade.chat_id !== conversa.chat_id) return;
    setMensagens((atual) => {
      const i = atual.findIndex((m) => m.id === novidade.id);
      if (i >= 0) { const copia = [...atual]; copia[i] = { ...copia[i], ...novidade }; return copia; }
      return [...atual, novidade].sort((a, b) => a.enviada_em.localeCompare(b.enviada_em));
    });
    onVista(conversa.chat_id, novidade.enviada_em);
  }, [novidade, conversa.chat_id, onVista]);

  useLayoutEffect(() => { fimRef.current?.scrollIntoView({ block: "end" }); }, [mensagens.length, carregando]);

  const enviar = async () => {
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    setErroEnvio(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("whatsapp_enviar", { chatId: conversa.chat_id, texto: t });
      setTexto("");
    } catch (e) {
      const msg = typeof e === "string" ? e : e instanceof Error ? e.message : "Não consegui enviar";
      setErroEnvio(msg);
      toast.error(msg);
    } finally {
      setEnviando(false);
    }
  };

  let diaAnterior = "";
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-2 pb-2">
        <button type="button" onClick={onVoltar} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Voltar às conversas">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">{conversa.chat_nome ?? conversa.chat_id.split("@")[0]}</p>
          <p className="text-[10.5px] text-muted-foreground">{conversa.eh_grupo ? "Grupo" : `+${conversa.chat_id.split("@")[0]}`}</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto bg-muted/30 px-2.5 py-2">
        {carregando ? (
          <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : mensagens.map((m) => {
          const dia = format(new Date(m.enviada_em), "EEEE, dd/MM", { locale: ptBR });
          const separador = dia !== diaAnterior;
          diaAnterior = dia;
          return (
            <div key={m.id}>
              {separador && <div className="my-2 text-center"><span className="rounded-full bg-background px-2 py-0.5 text-[10px] text-muted-foreground shadow-sm">{dia}</span></div>}
              <div className={cn("flex", m.de_mim ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[85%] rounded-lg px-2.5 py-1.5 text-[12.5px] leading-snug shadow-sm",
                  m.de_mim ? "bg-emerald-100 text-emerald-950 dark:bg-emerald-900/60 dark:text-emerald-50" : "bg-background")}>
                  {m.eh_grupo && !m.de_mim && <p className="mb-0.5 text-[10.5px] font-semibold text-teal-600">{m.autor_nome ?? "?"}</p>}
                  {m.tipo === "audio" ? (
                    <div className="space-y-1">
                      {urlDe(m.midia_arquivo) ? (
                        <audio controls preload="none" src={urlDe(m.midia_arquivo)!} className="h-8 w-56 max-w-full" />
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-[10.5px] font-medium text-muted-foreground"><Mic className="h-3 w-3" />Áudio{m.transcricao_status == null ? " (antigo, não guardado)" : ""}</span>
                      )}
                      {m.transcricao ? <p className="text-[12px]">{m.transcricao}</p>
                        : m.transcricao_status && <p className="text-[11.5px] italic text-muted-foreground">{m.transcricao_status === "erro" ? "não deu pra transcrever" : "transcrevendo…"}</p>}
                    </div>
                  ) : (m.tipo === "imagem" || m.tipo === "figurinha") && urlDe(m.midia_arquivo) ? (
                    <div className="space-y-1">
                      <button type="button" onClick={() => setAmpliada(urlDe(m.midia_arquivo))} className="block overflow-hidden rounded-md" aria-label="Ver foto">
                        <img src={urlDe(m.midia_arquivo)!} alt="" loading="lazy" className={cn("object-cover", m.tipo === "figurinha" ? "h-24 w-24" : "max-h-64 w-56 max-w-full")} />
                      </button>
                      {m.texto && <p className="whitespace-pre-wrap break-words">{m.texto}</p>}
                    </div>
                  ) : m.tipo === "video" && urlDe(m.midia_arquivo) ? (
                    <div className="space-y-1">
                      <video controls preload="metadata" src={urlDe(m.midia_arquivo)!} className="max-h-64 w-56 max-w-full rounded-md bg-black" />
                      {m.texto && <p className="whitespace-pre-wrap break-words">{m.texto}</p>}
                    </div>
                  ) : m.tipo === "documento" && urlDe(m.midia_arquivo) ? (
                    <a href={urlDe(m.midia_arquivo)!} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                      <FileText className="h-3.5 w-3.5" />{m.texto || "Documento"}
                    </a>
                  ) : m.tipo === "texto" ? (
                    <p className="whitespace-pre-wrap break-words">{m.texto}</p>
                  ) : (
                    <p><span className="text-muted-foreground">{ROTULO_TIPO[m.tipo] ?? "Mensagem"}{m.midia_arquivo === null && m.tipo !== "outro" ? " (abra no celular)" : ""}</span>{m.texto ? ` ${m.texto}` : ""}</p>
                  )}
                  <p className="mt-0.5 text-right text-[9.5px] text-muted-foreground">{format(new Date(m.enviada_em), "HH:mm")}</p>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={fimRef} />
      </div>

      {erroEnvio && <p className="border-t border-border bg-rose-500/10 px-3 py-1.5 text-[11px] text-rose-600 dark:text-rose-400">Não enviou: {erroEnvio}</p>}
      {ampliada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={() => setAmpliada(null)}>
          <button type="button" className="absolute right-3 top-3 rounded-full bg-white/10 p-1.5 text-white" aria-label="Fechar"><X className="h-4 w-4" /></button>
          <img src={ampliada} alt="" className="max-h-full max-w-full rounded-md object-contain" />
        </div>
      )}
      {podeEnviar && gravando ? (
        <div className="flex items-center gap-2 border-t border-border p-2">
          <button type="button" onClick={() => void pararGravacao()} aria-label="Descartar áudio"
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-rose-500">
            <Trash2 className="h-4 w-4" />
          </button>
          <span className="flex flex-1 items-center gap-2 text-[12.5px]">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500" />
            Gravando {Math.floor(segundos / 60)}:{String(segundos % 60).padStart(2, "0")}
          </span>
          <button type="button" onClick={() => void enviarAudio()} aria-label="Enviar áudio"
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
            <Send className="h-4 w-4" />
          </button>
        </div>
      ) : podeEnviar ? (
        <form className="flex items-end gap-1.5 border-t border-border p-2" onSubmit={(e) => { e.preventDefault(); void enviar(); }}>
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={1}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void enviar(); } }}
            placeholder={`Mensagem para ${conversa.chat_nome ?? "a conversa"}…`}
            className="max-h-28 min-h-[34px] flex-1 resize-none rounded-md border border-border bg-background px-2.5 py-1.5 text-[12.5px] outline-none focus:border-primary/50" />
          {/* Igual ao WhatsApp: sem texto, o botão grava áudio. */}
          {!texto.trim() && !enviando ? (
            <button type="button" onClick={() => void comecarGravacao()} aria-label="Gravar áudio"
              className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
              <Mic className="h-4 w-4" />
            </button>
          ) : (
            <button type="submit" disabled={!texto.trim() || enviando} aria-label="Enviar"
              className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white disabled:opacity-40">
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          )}
        </form>
      ) : (
        <p className="border-t border-border p-2 text-center text-[11px] text-muted-foreground">Para responder, use o app do Mac (o WhatsApp está conectado nele).</p>
      )}
    </div>
  );
}
