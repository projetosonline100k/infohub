import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Loader2, Mic, Plus, RotateCcw, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { confirmar } from "@/components/DialogosGlobais";
import { isDesktop } from "@/lib/platform";
import { useGravarAudio } from "@/hooks/useGravarAudio";
import { aplicarEstilo, completudeEstilo, estiloVazio, sanitizarEstilo, type EstiloDark } from "@/lib/empresa/dashDark";
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
  const [esperando, setEsperando] = useState(false);
  const [detalhes, setDetalhes] = useState(false);
  const [vivo, setVivo] = useState(false);   // modo vivo: o Lauro roda no Mac do Davi, com o Chrome dele
  const vivoRef = useRef(false);
  vivoRef.current = vivo;
  const audio = useGravarAudio((falado) => setTexto((t) => [t.trim(), falado].filter(Boolean).join(" ")));
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const pendente = useRef<{ id: string; dados: Record<string, unknown> } | null>(null);
  const estiloRef = useRef(estilo);
  estiloRef.current = estilo;
  const fim = useRef<HTMLDivElement>(null);
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

  const aguardar = useCallback(async (id: string, idPerfil: string) => {
    setEsperando(true);
    for (let i = 0; i < (vivoRef.current ? 800 : 330); i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const { data: p } = await db.from("esteira_dark_pedidos").select("status, resposta, estilo, erro").eq("id", id).maybeSingle();
      const r = p as { status: string; resposta: string | null; estilo: unknown; erro: string | null } | null;
      if (r?.status === "respondido") {
        setMsgs((m) => [...m, { papel: "assistant", texto: r.resposta ?? "" }]);
        if (r.estilo) {
          const novo = aplicarEstilo(estiloRef.current, r.estilo);
          setEstilo(novo);
          pendente.current = { id: idPerfil, dados: { ...(pendente.current?.dados ?? {}), estilo: novo } };
          void gravar();
        }
        setEsperando(false);
        return;
      }
      if (r?.status === "erro") { setEsperando(false); toast.error(r.erro || "O Lauro não conseguiu responder agora"); return; }
    }
    setEsperando(false);
    toast.error(vivoRef.current ? "O Lauro ao vivo não respondeu. O Mac está ligado e o app aberto?" : "Demorou demais. Tente de novo.");
  }, [gravar]);

  useEffect(() => {
    if (!perfil) return;
    setNome(perfil.nome); setArroba(perfil.arroba ?? ""); setClienteId(perfil.cliente_id ?? ""); setEstilo(sanitizarEstilo(perfil.estilo));
    setTexto(""); setEsperando(false); setDetalhes(false); setVivo(!!perfil.modo_vivo);
    void db.from("clientes").select("id, nome_especialista").eq("arquivado", false).order("nome_especialista").then(({ data }: { data: { id: string; nome_especialista: string }[] | null }) => setProjetos(data ?? []));
    // A conversa fica guardada: volta do jeito que estava (e retoma uma resposta que ainda estava sendo preparada).
    void (async () => {
      const { data: ps } = await db.from("esteira_dark_pedidos").select("id, mensagem, status, resposta, criado_em").eq("perfil_id", perfil.id).order("criado_em", { ascending: false }).limit(60);
      const lista = ((ps ?? []) as { id: string; mensagem: string; status: string; resposta: string | null; criado_em: string }[]).reverse().filter((p) => !perfil.conversa_zerada_em || p.criado_em > perfil.conversa_zerada_em);
      const m: Msg[] = [intro(perfil.nome)];
      for (const p of lista) { m.push({ papel: "user", texto: p.mensagem }); if (p.status === "respondido" && p.resposta) m.push({ papel: "assistant", texto: p.resposta }); }
      setMsgs(m);
      const ultimo = lista[lista.length - 1];
      if (ultimo && (ultimo.status === "pendente" || ultimo.status === "processando") && Date.now() - new Date(ultimo.criado_em).getTime() < 12 * 60_000) void aguardar(ultimo.id, perfil.id);
    })();
  }, [perfilId]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fim.current?.scrollIntoView({ block: "end" }); }, [msgs, esperando]);

  const enviar = async () => {
    const t = texto.trim();
    if (!t || !perfil || esperando) return;
    const hist = msgs.slice(1);
    setMsgs((m) => [...m, { papel: "user", texto: t }]);
    setTexto("");
    setEsperando(true);
    const { data, error } = await db.from("esteira_dark_pedidos").insert({
      perfil_id: perfil.id, mensagem: t, estilo_atual: estilo, contexto: { perfil: nome || perfil.nome, arroba: arroba || null, cliente_id: clienteId || null },
      historico: hist.map((h) => ({ papel: h.papel, texto: h.texto })),
    }).select("id").single();
    if (error || !data) { setEsperando(false); toast.error("Não consegui enviar"); return; }
    await aguardar((data as { id: string }).id, perfil.id);
  };
  const zerar = async () => {
    if (!perfil) return;
    const agora = new Date().toISOString();
    setMsgs([intro(nome || perfil.nome)]);
    const { error } = await db.from("esteira_dark_perfis").update({ conversa_zerada_em: agora }).eq("id", perfil.id);
    if (error) toast.error("Não consegui zerar"); else onMudou();
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
            <section className="flex min-h-0 flex-col border-b border-white/10 lg:border-b-0 lg:border-r">
              <div className="flex items-center gap-2 border-b border-white/10 bg-[#111b21] px-3 py-2 text-sm">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-500/20 text-xs font-bold text-cyan-200">L</span><span className="font-semibold">Lauro</span><span className="text-xs text-white/45">{vivo ? "ao vivo no seu Mac" : "editor de vídeos dark"}</span>
                <button type="button" onClick={() => void alternarVivo()} title="Modo vivo: o Lauro usa o Chrome do seu Mac (Instagram logado) para abrir e assistir as referências"
                  className={cn("ml-auto flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold", vivo ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-200" : "border-white/10 text-white/60 hover:text-white")}>
                  <span className={cn("h-2 w-2 rounded-full", vivo ? "animate-pulse bg-emerald-400" : "bg-white/30")} />Modo vivo
                </button>
                <button type="button" onClick={() => void zerar()} title="Zerar a conversa (o estilo ao lado não muda)" className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-white/55 hover:bg-white/5 hover:text-white"><RotateCcw className="h-3.5 w-3.5" />Zerar</button>
              </div>
              {vivo && <p className="border-b border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200">Modo vivo: o Lauro abre o Chrome do seu Mac, assiste os vídeos que você mandar e olha as páginas. Pode demorar alguns minutos por resposta. O Mac precisa estar ligado com o app aberto.</p>}
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-[#0b141a] p-3">
                {msgs.map((m, i) => (
                  <div key={i} className={cn("max-w-[88%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm", m.papel === "user" ? "ml-auto bg-[#005c4b]" : "bg-[#202c33]")}>
                    {m.papel === "assistant" && <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-cyan-300">Lauro</span>}{m.texto}
                  </div>
                ))}
                {esperando && <div className="flex items-center gap-2 text-xs text-white/50"><Loader2 className="h-3.5 w-3.5 animate-spin" />{vivo ? "Lauro está trabalhando no seu Mac…" : "Lauro está pensando…"}</div>}
                <div ref={fim} />
              </div>
              <div className="flex gap-2 border-t border-white/10 bg-[#111b21] p-2">
                <textarea rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void enviar(); } }}
                  placeholder="Conte como imagina o vídeo, cole links de referência, peça ideias…" className="min-h-0 flex-1 resize-none rounded-xl border border-white/10 bg-[#2a3942] px-3 py-2 text-sm outline-none" />
                {isDesktop() && (
                  <button type="button" onClick={() => void audio.alternar()} disabled={audio.transcrevendo} title={audio.gravando ? "Parar e transcrever" : "Gravar áudio"}
                    className={cn("self-end rounded-full p-2.5", audio.gravando ? "animate-pulse bg-rose-500 text-white" : "bg-white/10 text-white/80 hover:bg-white/15")}>
                    {audio.transcrevendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
                  </button>
                )}
                <button type="button" disabled={!texto.trim() || esperando} onClick={() => void enviar()} className="self-end rounded-full bg-emerald-500 p-2.5 text-black disabled:opacity-40"><Send className="h-4 w-4" /></button>
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
