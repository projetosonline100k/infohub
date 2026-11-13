import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Loader2, Mic, Paperclip, Plus, RotateCcw, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { confirmar } from "@/components/DialogosGlobais";
import { isDesktop } from "@/lib/platform";
import { useGravarAudio } from "@/hooks/useGravarAudio";
import { aplicarEstilo, completudeEstilo, estiloVazio, sanitizarEstilo, type EstiloDark } from "@/lib/empresa/dashDark";
import { midiasDoTexto } from "@/lib/empresa/midiasChat";
import { MidiaLocal } from "./MidiaLocal";
import { cn } from "@/lib/utils";

const db = supabase as unknown as SupabaseClient;

// Perfil da esteira dark (12/11/2026, Davi: "precisa ser conversa estilo chat e a gente vai montando o estilo que vamos querer para o vídeo").
// Esquerda: conversa com o Lauro (sessão contínua, ele lembra de tudo; abre links de referência). Direita: o estilo, que a conversa vai preenchendo
// e que você também pode editar à mão (salva sozinho). O estilo fica em esteira_dark_perfis.estilo: é daqui que o Lauro e o Danilo leem como o vídeo deve ser.
export interface PerfilDark { id: string; nome: string; arroba: string | null; cliente_id: string | null; estilo: unknown; conversa_zerada_em: string | null; modo_vivo?: boolean }
type Msg = { papel: "user" | "assistant"; texto: string };

const CAMPOS: { chave: Exclude<keyof EstiloDark, "referencias">; rotulo: string; linhas?: number }[] = [
  { chave: "descricao", rotulo: "A ideia do vídeo", linhas: 3 }, { chave: "publico", rotulo: "Para quem", linhas: 2 }, { chave: "duracao", rotulo: "Duração" },
  { chave: "gancho", rotulo: "Gancho (como abre)", linhas: 2 }, { chave: "estrutura", rotulo: "Estrutura do roteiro", linhas: 4 }, { chave: "narracao", rotulo: "Narração (voz e tom)", linhas: 2 },
  { chave: "visual", rotulo: "Visual", linhas: 3 }, { chave: "musica", rotulo: "Música e efeitos", linhas: 2 }, { chave: "cta", rotulo: "Fechamento (chamada)", linhas: 2 },
  { chave: "regras", rotulo: "Regras (sempre / nunca)", linhas: 3 }, { chave: "observacoes", rotulo: "Outras observações", linhas: 3 },
];
const intro = (nome: string): Msg => ({ papel: "assistant", texto: `Oi! Aqui é o Lauro. Vamos montar juntos o estilo do vídeo do ${nome}. Me conta como você imagina esse vídeo: o clima, o tipo de assunto, o que você já viu por aí e gostou. Pode colar links de referência que eu abro e te digo o que dá para aproveitar. Eu vou preenchendo o estilo ao lado e te perguntando o que faltar.` });

export function EstiloPerfilDark({ perfil, onFechar, onMudou, onApagado }: { perfil: PerfilDark | null; onFechar: () => void; onMudou: () => void; onApagado: () => void }) {
  const [nome, setNome] = useState("");
  const [arroba, setArroba] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [estilo, setEstilo] = useState<EstiloDark>(estiloVazio());
  const [projetos, setProjetos] = useState<{ id: string; nome_especialista: string }[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [pendentes, setPendentes] = useState(0);   // respostas que ainda estou esperando (pode haver mais de uma: o Lauro responde sem parar o trabalho)
  const pendentesRef = useRef(0);
  const esperando = pendentes > 0;
  const [detalhes, setDetalhes] = useState(false);
  const [anexos, setAnexos] = useState<File[]>([]);   // imagens, vídeos e áudios para o Lauro ver (jogados no chat, colados ou escolhidos no clipe)
  const [arrastando, setArrastando] = useState(false);
  const [guiaMac, setGuiaMac] = useState<boolean>(() => { try { return localStorage.getItem("lauro:mac-liberado") !== "1"; } catch { return true; } });   // passo a passo da permissão do macOS (uma vez só)
  const [controlePausado, setControlePausado] = useState(false);   // botão "Parar controle": trava o Lauro de mexer no Mac (mouse/teclado)
  const seletor = useRef<HTMLInputElement>(null);
  const [vivo, setVivo] = useState(false);   // modo vivo: o Lauro roda no Mac do Davi, com o Chrome dele
  const vivoRef = useRef(false);
  vivoRef.current = vivo;
  const audio = useGravarAudio((falado) => setTexto((t) => [t.trim(), falado].filter(Boolean).join(" ")));
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const pendente = useRef<{ id: string; dados: Record<string, unknown> } | null>(null);
  const estiloRef = useRef(estilo);
  estiloRef.current = estilo;
  const fim = useRef<HTMLDivElement>(null);
  // Imagens e vídeos citados pelo Lauro (caminhos em ~/.infopro-hub): aparecem embaixo da mensagem dele.
  const midiasPorMsg = useMemo(() => {
    let pasta: string | null = null;
    return msgs.map((m) => { const r = midiasDoTexto(m.texto, pasta); pasta = r.pasta; return r.midias; });
  }, [msgs]);
  const perfilId = perfil?.id;

  const gravar = useCallback(async () => {
    const p = pendente.current;
    if (!p) return;
    pendente.current = null;
    setSalvando(true);
    const { error } = await db.from("esteira_dark_perfis").update({ ...p.dados, atualizado_em: new Date().toISOString() }).eq("id", p.id);
    setSalvando(false);
    if (error) toast.error(/duplicate|unique|23505/i.test(`${error.message} ${error.code}`) ? "Já existe um perfil com esse nome." : "Não consegui salvar");
    else onMudou();
  }, [onMudou]);
  const salvar = (dados: Record<string, unknown>) => {
    if (!perfilId) return;
    pendente.current = { id: perfilId, dados: { ...(pendente.current?.id === perfilId ? pendente.current.dados : {}), ...dados } };
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void gravar(), 700);
  };
  // Fecha/troca de perfil: não perde o que ainda não foi gravado.
  useEffect(() => () => { clearTimeout(timer.current); void gravar(); }, [perfilId]);   // eslint-disable-line react-hooks/exhaustive-deps

  const mudarPendentes = (d: number) => { pendentesRef.current = Math.max(0, pendentesRef.current + d); setPendentes(pendentesRef.current); };
  const aguardar = useCallback(async (id: string, idPerfil: string) => {
    mudarPendentes(1);
    try {
      for (let i = 0; i < (vivoRef.current ? 800 : 330); i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const { data: p } = await db.from("esteira_dark_pedidos").select("status, resposta, estilo, erro, encaminhado_id").eq("id", id).maybeSingle();
        const r = p as { status: string; resposta: string | null; estilo: unknown; erro: string | null; encaminhado_id: string | null } | null;
        if (r?.status === "respondido") {
          setMsgs((m) => [...m, { papel: "assistant", texto: r.resposta ?? "" }]);
          if (r.estilo) {
            const novo = aplicarEstilo(estiloRef.current, r.estilo);
            setEstilo(novo);
            pendente.current = { id: idPerfil, dados: { ...(pendente.current?.dados ?? {}), estilo: novo } };
            void gravar();
          }
          if (r.encaminhado_id) void aguardar(r.encaminhado_id, idPerfil);   // a mensagem virou pedido do Lauro: a resposta dele chega depois
          return;
        }
        if (r?.status === "erro") { toast.error(r.erro || "O Lauro não conseguiu responder agora"); return; }
      }
      toast.error(vivoRef.current ? "O Lauro ao vivo não respondeu. O Mac está ligado e o app aberto?" : "Demorou demais. Tente de novo.");
    } finally { mudarPendentes(-1); }
  }, [gravar]);

  useEffect(() => {
    if (!perfil) return;
    setNome(perfil.nome); setArroba(perfil.arroba ?? ""); setClienteId(perfil.cliente_id ?? ""); setEstilo(sanitizarEstilo(perfil.estilo));
    void import("@tauri-apps/api/core").then(({ invoke }) => invoke<boolean>("lauro_controle_estado")).then(setControlePausado).catch(() => undefined);
    setTexto(""); pendentesRef.current = 0; setPendentes(0); setDetalhes(false); setVivo(!!perfil.modo_vivo);
    void db.from("clientes").select("id, nome_especialista").eq("arquivado", false).order("nome_especialista").then(({ data }: { data: { id: string; nome_especialista: string }[] | null }) => setProjetos(data ?? []));
    // A conversa fica guardada: volta do jeito que estava (e retoma uma resposta que ainda estava sendo preparada).
    void (async () => {
      const { data: ps } = await db.from("esteira_dark_pedidos").select("id, mensagem, status, resposta, criado_em, rapido, encaminhado_id").eq("perfil_id", perfil.id).order("criado_em", { ascending: false }).limit(80);
      type P = { id: string; mensagem: string; status: string; resposta: string | null; criado_em: string; rapido: boolean; encaminhado_id: string | null };
      const lista = ((ps ?? []) as P[]).reverse().filter((p) => !perfil.conversa_zerada_em || p.criado_em > perfil.conversa_zerada_em);
      const encaminhados = new Set(lista.map((p) => p.encaminhado_id).filter((x): x is string => !!x));   // mensagens que o Lauro recebeu como pedido (o texto já aparece como você escreveu)
      const m: Msg[] = [intro(perfil.nome)];
      for (const p of lista) { if (!encaminhados.has(p.id)) m.push({ papel: "user", texto: p.mensagem.startsWith("NOVO ROTEIRO") ? `📄 ${p.mensagem.split("\n")[0]}` : p.mensagem }); if (p.status === "respondido" && p.resposta) m.push({ papel: "assistant", texto: p.resposta }); }
      setMsgs(m);
      for (const p of lista) if ((p.status === "pendente" || p.status === "processando") && Date.now() - new Date(p.criado_em).getTime() < 30 * 60_000) void aguardar(p.id, perfil.id);
    })();
  }, [perfilId]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fim.current?.scrollIntoView({ block: "end" }); }, [msgs, esperando]);

  const aceitar = (arquivos: FileList | File[]) => {
    const ok = [...arquivos].filter((f) => /^(image|video|audio)\//.test(f.type) || /\.(png|jpe?g|webp|gif|mp4|mov|webm|m4v|mp3|wav|m4a|aac|ogg|opus|pdf)$/i.test(f.name));
    if (ok.length < arquivos.length) toast("Só imagens, vídeos e áudios");
    if (!ok.length) return;
    if (!isDesktop()) { toast.error("Para o Lauro ver arquivos, abra o app do Mac"); return; }
    if (!vivo) { toast.error("Ligue o Modo vivo: o Lauro precisa do seu Mac para abrir o arquivo"); return; }
    setAnexos((a) => [...a, ...ok].slice(0, 8));
  };
  const enviar = async (forca?: string) => {
    let t = (forca ?? texto).trim();
    if ((!t && anexos.length === 0) || !perfil) return;
    // Anexos: vão para o Mac (~/.infopro-hub/exemplos/<perfil>/recebidos) e o Lauro recebe o caminho de cada um.
    if (anexos.length) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const pasta = (nome || perfil.nome).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
        const caminhos: string[] = [];
        for (const f of anexos) caminhos.push(await invoke<string>("salvar_anexo_lauro", new Uint8Array(await f.arrayBuffer()), { headers: { "x-nome": encodeURIComponent(f.name), "x-pasta": encodeURIComponent(pasta) } }));
        t = `${t || "Olha o que eu te mandei."}\n\n${caminhos.map((c) => `📎 Anexo: ${c}`).join("\n")}`;
        setAnexos([]);
      } catch (e) { toast.error(typeof e === "string" ? e : "Não consegui guardar o arquivo"); return; }
    }
    const hist = msgs.slice(1);
    setMsgs((m) => [...m, { papel: "user", texto: t }]);
    if (forca === undefined) setTexto("");
    const ocupado = pendentesRef.current > 0;   // o Lauro está trabalhando: a mensagem vira pergunta rápida, respondida sem parar o trabalho dele
    const { data, error } = await db.from("esteira_dark_pedidos").insert({
      perfil_id: perfil.id, mensagem: t, rapido: ocupado, estilo_atual: estilo, contexto: { perfil: nome || perfil.nome, arroba: arroba || null, cliente_id: clienteId || null },
      historico: hist.map((h) => ({ papel: h.papel, texto: h.texto })),
    }).select("id").single();
    if (error || !data) { toast.error("Não consegui enviar"); return; }
    await aguardar((data as { id: string }).id, perfil.id);
  };
  const zerar = async () => {
    if (!perfil) return;
    const agora = new Date().toISOString();
    setMsgs([intro(nome || perfil.nome)]);
    const { error } = await db.from("esteira_dark_perfis").update({ conversa_zerada_em: agora }).eq("id", perfil.id);
    if (error) toast.error("Não consegui zerar"); else onMudou();
  };
  const abrirAjuste = async (painel: "acessibilidade" | "tela") => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke<string>("lauro_liberar_mac", { painel });
      toast.success("Ajustes abertos. O caminho do programa já está copiado: clique no +, aperte ⇧⌘G, cole (⌘V) e confirme");
    } catch { toast.error("Só funciona no app do Mac"); }
  };
  const marcarLiberado = () => { setGuiaMac(false); try { localStorage.setItem("lauro:mac-liberado", "1"); } catch { /* sem storage */ } };
  const alternarControle = async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const parado = await invoke<boolean>("lauro_controle_parar", { ativo: !controlePausado });
      setControlePausado(parado);
      toast(parado ? "Controle parado: o Lauro não mexe mais no seu Mac" : "Controle liberado de novo");
    } catch { toast.error("Só funciona no app do Mac"); }
  };
  const alternarVivo = async () => {
    if (!perfil) return;
    const novo = !vivo;
    setVivo(novo);
    const { error } = await db.from("esteira_dark_perfis").update({ modo_vivo: novo }).eq("id", perfil.id);
    if (error) { setVivo(!novo); toast.error(/só o Davi/i.test(error.message) ? "Só o Davi liga o modo vivo." : "Não consegui mudar o modo vivo"); return; }
    toast.success(novo ? "Modo vivo ligado: o Lauro agora usa o Chrome do seu Mac" : "Modo vivo desligado");
    onMudou();
  };
  const mudarEstilo = (patch: Partial<EstiloDark>) => { const novo = { ...estilo, ...patch }; setEstilo(novo); salvar({ estilo: novo }); };
  const apagar = async () => {
    if (!perfil || !(await confirmar(`Apagar o perfil ${perfil.nome}?`, { descricao: "O perfil, o estilo cadastrado e a conversa serão apagados. Os vídeos e projetos não são afetados.", botao: "Apagar" }))) return;
    clearTimeout(timer.current); pendente.current = null;
    const { error } = await db.from("esteira_dark_perfis").delete().eq("id", perfil.id);
    if (error) { toast.error("Não consegui apagar"); return; }
    onApagado();
  };
  const { feitos, total, faltando } = completudeEstilo(estilo);
  const campo = "w-full rounded-lg border border-white/10 bg-[#0a1520] px-3 py-2 text-sm text-white outline-none focus:border-amber-200/60";

  return (
    <Dialog open={!!perfil} onOpenChange={(a) => { if (!a) onFechar(); }}>
      <DialogContent className="dark flex h-[88vh] max-h-[88vh] w-[96vw] max-w-6xl flex-col gap-0 overflow-hidden border-white/10 bg-[#0c1b27] p-0 text-white">
        <DialogDescription className="sr-only">Conversa para montar o estilo do vídeo do perfil</DialogDescription>
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-3">
          <DialogTitle className="flex items-center gap-2 text-lg">{nome || perfil?.nome} <span className="text-sm font-normal text-white/50">· estilo do vídeo</span>{salvando && <Loader2 className="h-4 w-4 animate-spin text-white/50" />}</DialogTitle>
        </div>
        {perfil && (
          <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
            <section className={cn("relative flex min-h-0 flex-col border-b border-white/10 lg:border-b-0 lg:border-r", arrastando && "ring-2 ring-inset ring-amber-300/70")}
              onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setArrastando(true); } }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setArrastando(false); }}
              onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); aceitar(e.dataTransfer.files); } setArrastando(false); }}>
              {arrastando && <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/60 text-sm font-semibold text-amber-200">Solte aqui para o Lauro ver</div>}
              <div className="flex items-center gap-2 border-b border-white/10 bg-[#111b21] px-3 py-2 text-sm">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-500/20 text-xs font-bold text-cyan-200">L</span><span className="font-semibold">Lauro</span><span className="text-xs text-white/45">{vivo ? "ao vivo no seu Mac" : "editor de vídeos dark"}</span>
                {vivo && isDesktop() && (
                  <button type="button" onClick={() => void alternarControle()} title="Trava o Lauro de mexer no mouse e no teclado do seu Mac (ele continua conversando)"
                    className={cn("ml-auto flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold", controlePausado ? "border-amber-400/60 bg-amber-500/20 text-amber-200" : "border-rose-400/50 text-rose-300 hover:bg-rose-500/10")}>
                    {controlePausado ? "Controle parado · liberar" : "Parar controle"}
                  </button>
                )}
                <button type="button" onClick={() => void alternarVivo()} title="Modo vivo: o Lauro usa o Chrome do seu Mac (Instagram logado) para abrir e assistir as referências"
                  className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold", !(vivo && isDesktop()) && "ml-auto", vivo ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-200" : "border-white/10 text-white/60 hover:text-white")}>
                  <span className={cn("h-2 w-2 rounded-full", vivo ? "animate-pulse bg-emerald-400" : "bg-white/30")} />Modo vivo
                </button>
                <button type="button" onClick={() => void zerar()} title="Zerar a conversa (o estilo ao lado não muda)" className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-white/55 hover:bg-white/5 hover:text-white"><RotateCcw className="h-3.5 w-3.5" />Zerar</button>
              </div>
              {vivo && <p className="border-b border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200">Modo vivo: o Lauro usa o Chrome e o seu Mac (vê a tela, clica, digita, abre apps), assiste os vídeos que você mandar e olha as páginas. Pode demorar alguns minutos por resposta. O botão "Parar controle" trava o mouse e o teclado dele na hora. O Mac precisa estar ligado com o app aberto.</p>}
              {vivo && isDesktop() && guiaMac && (
                <div className="space-y-2 border-b border-amber-300/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                  <p className="font-semibold">Liberar o Mac para o Lauro (só uma vez)</p>
                  <p className="text-amber-100/80">O macOS pede a sua permissão. Em cada botão abaixo, abre a tela certa e já copia o caminho do programa: clique no <b>+</b>, aperte <b>⇧⌘G</b>, cole com <b>⌘V</b>, Enter, e ligue a chavinha dele.</p>
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => void abrirAjuste("acessibilidade")} className="rounded-lg bg-amber-300 px-2.5 py-1 font-semibold text-black hover:bg-amber-200">1 · Acessibilidade</button>
                    <button type="button" onClick={() => void abrirAjuste("tela")} className="rounded-lg bg-amber-300 px-2.5 py-1 font-semibold text-black hover:bg-amber-200">2 · Gravação de tela</button>
                    <button type="button" onClick={() => void enviar("Rode o diagnóstico do controle do Mac e me diga se está tudo liberado.")} className="rounded-lg border border-amber-300/50 px-2.5 py-1 hover:bg-amber-300/10">3 · Testar (o Lauro confere)</button>
                    <button type="button" onClick={marcarLiberado} className="ml-auto rounded-lg px-2.5 py-1 text-amber-100/70 hover:text-amber-100">Já liberei, esconder</button>
                  </div>
                </div>
              )}
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-[#0b141a] p-3">
                {msgs.map((m, i) => (
                  <div key={i} className={cn("max-w-[88%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm", m.papel === "user" ? "ml-auto bg-[#005c4b]" : "bg-[#202c33]")}>
                    {m.papel === "assistant" && <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-cyan-300">Lauro</span>}{m.texto}
                    {midiasPorMsg[i]?.map((md) => <MidiaLocal key={md.caminho} midia={md} />)}
                  </div>
                ))}
                {esperando && <div className="flex items-center gap-2 text-xs text-white/50"><Loader2 className="h-3.5 w-3.5 animate-spin" />{vivo ? "Lauro está trabalhando no seu Mac…" : "Lauro está pensando…"}<span className="text-white/35">· pode escrever: ele responde sem parar o que está fazendo</span></div>}
                <div ref={fim} />
              </div>
              {anexos.length > 0 && (
                <div className="flex flex-wrap gap-1.5 border-t border-white/10 bg-[#111b21] px-2 pt-2">
                  {anexos.map((f, i) => <span key={i} className="flex max-w-[14rem] items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs"><Paperclip className="h-3 w-3 shrink-0" /><span className="truncate">{f.name}</span>
                    <button type="button" onClick={() => setAnexos((a) => a.filter((_, j) => j !== i))} className="text-white/50 hover:text-rose-300"><X className="h-3 w-3" /></button></span>)}
                </div>
              )}
              <div className="flex gap-2 border-t border-white/10 bg-[#111b21] p-2">
                <input ref={seletor} type="file" multiple accept="image/*,video/*,audio/*,.pdf" className="hidden" onChange={(e) => { if (e.target.files) aceitar(e.target.files); e.target.value = ""; }} />
                <button type="button" onClick={() => seletor.current?.click()} title="Anexar imagem, vídeo ou áudio para o Lauro ver (ou jogue o arquivo no chat)" className="self-end rounded-full bg-white/10 p-2.5 text-white/80 hover:bg-white/15"><Paperclip className="h-4 w-4" /></button>
                <textarea rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} onPaste={(e) => { const f = [...e.clipboardData.files]; if (f.length) { e.preventDefault(); aceitar(f); } }} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void enviar(); } }}
                  placeholder="Conte como imagina o vídeo, cole links de referência, peça ideias…" className="min-h-0 flex-1 resize-none rounded-xl border border-white/10 bg-[#2a3942] px-3 py-2 text-sm outline-none" />
                {isDesktop() && (
                  <button type="button" onClick={() => void audio.alternar()} disabled={audio.transcrevendo} title={audio.gravando ? "Parar e transcrever" : "Gravar áudio"}
                    className={cn("self-end rounded-full p-2.5", audio.gravando ? "animate-pulse bg-rose-500 text-white" : "bg-white/10 text-white/80 hover:bg-white/15")}>
                    {audio.transcrevendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
                  </button>
                )}
                <button type="button" disabled={!texto.trim() && anexos.length === 0} onClick={() => void enviar()} className="self-end rounded-full bg-emerald-500 p-2.5 text-black disabled:opacity-40"><Send className="h-4 w-4" /></button>
              </div>
            </section>

            <section className="min-h-0 space-y-3 overflow-y-auto p-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold">Estilo do vídeo<span className="ml-auto text-xs font-normal tabular-nums text-white/60">{feitos}/{total}</span></div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-[#f3c98b]" style={{ width: `${(feitos / total) * 100}%` }} /></div>
                {faltando.length > 0 && <p className="mt-1 text-[11px] text-white/40">Falta: {faltando.join(", ")}.</p>}
                <p className="mt-1 text-[11px] text-white/35">A conversa preenche aqui. Você também pode editar direto: salva sozinho.</p>
              </div>
              {CAMPOS.map((c) => (
                <label key={c.chave} className="block space-y-1 text-xs text-white/60">{c.rotulo}
                  {c.linhas ? <textarea rows={c.linhas} className={cn(campo, "resize-y")} value={estilo[c.chave]} onChange={(e) => mudarEstilo({ [c.chave]: e.target.value })} />
                    : <input className={campo} value={estilo[c.chave]} onChange={(e) => mudarEstilo({ [c.chave]: e.target.value })} />}
                </label>
              ))}
              <div className="space-y-1.5">
                <p className="text-xs text-white/60">Referências</p>
                {estilo.referencias.map((r, i) => (
                  <div key={i} className="flex gap-1.5"><input className={campo} placeholder="https://…" value={r} onChange={(e) => mudarEstilo({ referencias: estilo.referencias.map((x, j) => (j === i ? e.target.value : x)) })} />
                    <button type="button" onClick={() => mudarEstilo({ referencias: estilo.referencias.filter((_, j) => j !== i) })} className="text-white/40 hover:text-rose-300"><X className="h-4 w-4" /></button></div>
                ))}
                <button type="button" onClick={() => setEstilo((e) => ({ ...e, referencias: [...e.referencias, ""] }))} className="flex items-center gap-1 text-xs text-amber-200 hover:underline"><Plus className="h-3 w-3" />Adicionar referência</button>
              </div>
              <button type="button" onClick={() => setDetalhes((d) => !d)} className="text-xs text-white/50 hover:text-white">{detalhes ? "Esconder detalhes do perfil" : "Detalhes do perfil (nome, @, projeto)"}</button>
              {detalhes && (
                <div className="space-y-2 rounded-xl border border-white/10 p-3">
                  <label className="block space-y-1 text-xs text-white/60">Nome do perfil<input className={campo} value={nome} onChange={(e) => { setNome(e.target.value); if (e.target.value.trim()) salvar({ nome: e.target.value.trim().slice(0, 80) }); }} /></label>
                  <label className="block space-y-1 text-xs text-white/60">@ do perfil (opcional)<input className={campo} placeholder="@exemplo" value={arroba} onChange={(e) => { setArroba(e.target.value); salvar({ arroba: e.target.value.trim().slice(0, 60) || null }); }} /></label>
                  <label className="block space-y-1 text-xs text-white/60">Ligar a um projeto (opcional)
                    <select className={campo} value={clienteId} onChange={(e) => { setClienteId(e.target.value); salvar({ cliente_id: e.target.value || null }); }}>
                      <option value="" className="bg-[#0a1520]">Nenhum: perfil independente</option>{projetos.map((p) => <option key={p.id} value={p.id} className="bg-[#0a1520]">{p.nome_especialista}</option>)}
                    </select>
                    <span className="block text-[11px] text-white/40">Só serve para trazer para a esteira os vídeos dark de um projeto que já existe.</span></label>
                  <button type="button" onClick={() => void apagar()} className="flex items-center gap-1.5 text-xs text-rose-300/80 hover:text-rose-300"><Trash2 className="h-3.5 w-3.5" />Apagar este perfil</button>
                </div>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
