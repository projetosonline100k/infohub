import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Check, CheckCheck, ChevronRight, Copy, Flame, Inbox, Loader2, MessageCircle, Plus, RefreshCw, Repeat2, Search, Send, Trash2, Trophy, UserX, Users, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { abrirLinkExterno } from "@/lib/abrirLink";
import { isDesktop } from "@/lib/platform";
import { etapaDoLead, type EstadoCompra, type LeadQuiz, type StatusLead } from "@/lib/quiz/painel";
import {
  MODELOS_PADRAO, agruparPorLead, categoriaDoLead, telefoneWa, contarCategorias, generalizarModelo, haQuanto, linkWhatsapp, preencherModelo,
  type Abordagem, type CategoriaX1, type Modelo,
} from "@/lib/quiz/x1";

// X1 do quiz (12/11/2026, Davi: "uma parte chamada X1, onde a gente aborda a pessoa com mensagens padrão ou feitas na hora, visual de
// WhatsApp, com categorias na lateral"). Esquerda: as filas (abordar agora, em conversa, retomar…). Meio: os leads da fila.
// Direita: a conversa no estilo WhatsApp, com modelos de mensagem e o campo para escrever na hora.
// No app do Mac, "Enviar pelo WhatsApp" manda direto pelo WhatsApp do projeto (WAHA) quando VOCÊ aperta o botão; na web abre o WhatsApp com a mensagem pronta. O Hub nunca envia sozinho.
const db = supabase as unknown as SupabaseClient;
type Fila = CategoriaX1 | "todos";
const FILAS: { id: Fila; rotulo: string; dica: string; Icone: typeof Inbox; cor: string }[] = [
  { id: "quentes", rotulo: "Quentes", dica: "Clicaram em comprar e ainda não compraram: abordar primeiro", Icone: Flame, cor: "text-orange-400" },
  { id: "abordar", rotulo: "Abordar agora", dica: "Leads novos, sem nenhuma mensagem sua", Icone: Inbox, cor: "text-amber-300" },
  { id: "conversa", rotulo: "Em conversa", dica: "Você mandou mensagem há menos de 24 h", Icone: MessageCircle, cor: "text-emerald-300" },
  { id: "retomar", rotulo: "Retomar", dica: "Mandou há mais de 24 h: vale um novo toque", Icone: Repeat2, cor: "text-sky-300" },
  { id: "convertidos", rotulo: "Convertidos", dica: "Marcados como convertido", Icone: Trophy, cor: "text-violet-300" },
  { id: "sem_whatsapp", rotulo: "Sem WhatsApp", dica: "Número ausente ou inválido", Icone: UserX, cor: "text-rose-300" },
  { id: "todos", rotulo: "Todos", dica: "Todos os leads", Icone: Users, cor: "text-white/70" },
];
const NOMES_STATUS: Record<StatusLead, string> = { novo: "Novo", em_contato: "Em contato", convertido: "Convertido" };

export function X1Quiz({ quizId, leads, estados, perguntas, onStatus, onApagar }: {
  quizId: string; leads: LeadQuiz[]; estados: Map<string, EstadoCompra>; perguntas: string[]; onStatus: (l: LeadQuiz, s: StatusLead) => void; onApagar: (ids: string[]) => Promise<void>;
}) {
  const [abordagens, setAbordagens] = useState<Abordagem[] | null>(null);
  const [proprios, setProprios] = useState<Modelo[]>([]);
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [contaWa, setContaWa] = useState("principal");
  const [wa, setWa] = useState<(Abordagem & { chat_id: string })[]>([]);   // o que está de fato no WhatsApp (enviado e recebido)
  const estadosX1 = useMemo(() => new Map([...estados].map(([id, e]) => [id, { clicouCheckout: e.clicouCheckout, comprou: !!e.compra }])), [estados]);
  const [fila, setFila] = useState<Fila>(() => ([...estados.values()].some((e) => e.clicouCheckout && !e.compra) ? "quentes" : "abordar"));
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [modeloUsado, setModeloUsado] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [salvandoModelo, setSalvandoModelo] = useState<string | null>(null);   // nome sendo digitado
  const fim = useRef<HTMLDivElement>(null);

  const carregar = useCallback(async () => {
    const { data: q } = await db.from("quizzes").select("cliente_id").eq("id", quizId).maybeSingle();
    const cid = (q as { cliente_id: string } | null)?.cliente_id ?? null;
    setClienteId(cid);
    if (cid) {
      const { data: c } = await db.from("clientes").select("whatsapp_conta").eq("id", cid).maybeSingle();
      setContaWa((c as { whatsapp_conta?: string | null } | null)?.whatsapp_conta || "principal");
    }
    const { data: a } = await db.from("quiz_abordagens").select("id, resposta_id, texto, modelo, enviada_em").eq("quiz_id", quizId).order("enviada_em").limit(5000);
    setAbordagens((a ?? []) as Abordagem[]);
    if (cid) {
      const { data: m } = await db.from("quiz_modelos_abordagem").select("id, nome, texto").eq("cliente_id", cid).order("criado_em");
      setProprios(((m ?? []) as { id: string; nome: string; texto: string }[]).map((x) => ({ ...x, proprio: true })));
    }
  }, [quizId]);
  useEffect(() => { void carregar(); }, [carregar]);

  // Conversa de verdade (12/11, Davi: "como se fosse o WhatsApp normal: eu mando, chega, recebo por ele"): as mensagens do WhatsApp do projeto,
  // enviadas e recebidas, a partir da data em que o lead entrou. As abordagens registradas aqui só entram se ainda não chegaram do WhatsApp.
  const chaveLeads = useMemo(() => leads.map((l) => `${l.id}:${telefoneWa(l.whatsapp) ?? ""}`).join(","), [leads]);
  const carregarWa = useCallback(async () => {
    const porChat = new Map<string, LeadQuiz[]>();
    for (const l of leads) { const t = telefoneWa(l.whatsapp); if (t) porChat.set(`${t}@c.us`, [...(porChat.get(`${t}@c.us`) ?? []), l]); }
    const ids = [...porChat.keys()];
    if (!ids.length) { setWa([]); return; }
    const out: (Abordagem & { chat_id: string })[] = [];
    for (let i = 0; i < ids.length; i += 80) {
      const { data } = await db.from("whatsapp_mensagens").select("id, chat_id, de_mim, tipo, texto, midia_tipo, transcricao, enviada_em").eq("conta", contaWa).in("chat_id", ids.slice(i, i + 80)).order("enviada_em", { ascending: false }).limit(3000);
      for (const m of (data ?? []) as { id: string; chat_id: string; de_mim: boolean; texto: string | null; midia_tipo: string | null; transcricao: string | null; tipo: string; enviada_em: string }[]) {
        const texto = m.texto?.trim() || (m.transcricao ? `🎤 ${m.transcricao}` : m.midia_tipo ? `[${m.midia_tipo === "audio" ? "áudio" : m.midia_tipo === "image" ? "foto" : m.midia_tipo === "video" ? "vídeo" : "arquivo"}]` : "");
        if (!texto) continue;
        for (const l of porChat.get(m.chat_id) ?? []) if (Date.parse(m.enviada_em) >= Date.parse(l.criada_em)) out.push({ id: `${m.id}:${l.id}`, resposta_id: l.id, chat_id: m.chat_id, texto, modelo: null, enviada_em: m.enviada_em, de_mim: m.de_mim });
      }
    }
    setWa(out);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveLeads, contaWa]);
  useEffect(() => { void carregarWa(); }, [carregarWa]);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const canal = supabase.channel(`x1-whatsapp-${quizId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_mensagens" }, () => { clearTimeout(t); t = setTimeout(() => void carregarWa(), 700); })
      .subscribe();
    const ciclo = window.setInterval(() => void carregarWa(), 20000);   // garantia, se o canal em tempo real cair
    return () => { clearTimeout(t); window.clearInterval(ciclo); void supabase.removeChannel(canal); };
  }, [quizId, carregarWa]);
  const porLead = useMemo(() => {
    const extra = (abordagens ?? []).filter((a) => !wa.some((w) => w.resposta_id === a.resposta_id && w.de_mim && w.texto.trim() === a.texto.trim() && Math.abs(Date.parse(w.enviada_em) - Date.parse(a.enviada_em)) < 15 * 60_000));
    return agruparPorLead([...extra.map((a) => ({ ...a, de_mim: true })), ...wa]);
  }, [abordagens, wa]);
  const agora = Date.now();
  const contagem = useMemo(() => contarCategorias(leads, porLead, Date.now(), estadosX1), [leads, porLead, estadosX1]);   // eslint-disable-line react-hooks/exhaustive-deps
  const ultima = (id: string) => porLead.get(id)?.at(-1);

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const filtrados = leads.filter((l) => {
      if (fila !== "todos" && categoriaDoLead(l, porLead.get(l.id) ?? [], Date.now(), estadosX1.get(l.id)) !== fila) return false;
      return !t || [l.nome, l.email, l.whatsapp].some((x) => (x ?? "").toLowerCase().includes(t));
    });
    const atividade = (l: LeadQuiz) => Date.parse(ultima(l.id)?.enviada_em ?? l.criada_em);
    return filtrados.sort((a, b) => (fila === "retomar" ? atividade(a) - atividade(b) : atividade(b) - atividade(a)));
  }, [leads, porLead, fila, busca, estadosX1]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Sempre há um lead aberto: o escolhido, se ainda está na fila; senão o primeiro dela.
  const lead = lista.find((l) => l.id === sel) ?? lista[0] ?? null;
  const mensagens = lead ? porLead.get(lead.id) ?? [] : [];
  useEffect(() => { fim.current?.scrollIntoView({ block: "end" }); }, [lead?.id, mensagens.length]);
  useEffect(() => { setTexto(""); setModeloUsado(null); setSalvandoModelo(null); }, [lead?.id]);

  const modelos = [...MODELOS_PADRAO, ...proprios];
  const escolherModelo = (m: Modelo) => { if (!lead) return; setTexto(preencherModelo(m.texto, { nome: lead.nome, perfil: lead.perfil })); setModeloUsado(m.nome); };
  const link = lead ? linkWhatsapp(lead.whatsapp, texto.trim() || "Oi!") : null;

  const proximo = () => {
    const i = lista.findIndex((l) => l.id === lead?.id);
    const prox = lista[i + 1] ?? lista[i - 1];
    if (prox && prox.id !== lead?.id) setSel(prox.id);
  };
  const enviar = async () => {
    if (!lead || !clienteId || !texto.trim() || enviando) return;
    const url = linkWhatsapp(lead.whatsapp, texto.trim());
    if (!url) { toast.error("Esse lead não tem um WhatsApp válido"); return; }
    setEnviando(true);
    // No app do Mac a mensagem vai direto pelo WhatsApp do projeto (WAHA), sem abrir outro sistema. Na web, abre o WhatsApp com o texto pronto.
    const direto = isDesktop();
    if (direto) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("whatsapp_enviar", { chatId: `${telefoneWa(lead.whatsapp)}@c.us`, texto: texto.trim(), conta: contaWa, responderA: null, mencoes: null });
      } catch (e) {
        setEnviando(false);
        toast.error(typeof e === "string" ? e : "Não consegui enviar pelo WhatsApp");
        return;
      }
    }
    const { error } = await db.from("quiz_abordagens").insert({ quiz_id: quizId, resposta_id: lead.id, cliente_id: clienteId, texto: texto.trim(), modelo: modeloUsado });
    if (error) { setEnviando(false); toast.error("Não consegui registrar a abordagem"); return; }
    if (lead.status === "novo") onStatus(lead, "em_contato");
    if (!direto) void abrirLinkExterno(url);
    setTexto(""); setModeloUsado(null);
    await carregar();
    setEnviando(false);
    toast.success(direto ? "Mensagem enviada" : "WhatsApp aberto com a mensagem pronta: é só apertar enviar");
    if (fila === "abordar") proximo();
  };
  const salvarModelo = async (nome: string) => {
    if (!lead || !clienteId || !nome.trim() || !texto.trim()) return;
    const { error } = await db.from("quiz_modelos_abordagem").insert({ cliente_id: clienteId, nome: nome.trim().slice(0, 60), texto: generalizarModelo(texto.trim(), { nome: lead.nome, perfil: lead.perfil }) });
    if (error) { toast.error("Não consegui salvar o modelo"); return; }
    setSalvandoModelo(null);
    toast.success("Modelo salvo: o nome e o perfil viram variáveis");
    void carregar();
  };
  const apagarModelo = async (m: Modelo) => {
    const { error } = await db.from("quiz_modelos_abordagem").delete().eq("id", m.id);
    if (error) { toast.error("Não consegui apagar o modelo"); return; }
    setProprios((p) => p.filter((x) => x.id !== m.id));
  };

  if (!abordagens) return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  const nomeDe = (l: LeadQuiz) => l.nome?.trim() || l.whatsapp || l.email || "Sem nome";
  const filaAtual = FILAS.find((f) => f.id === fila)!;

  return (
    <div className="grid h-[calc(100svh-230px)] min-h-[560px] overflow-hidden rounded-2xl border border-white/10 bg-[#0b141a] text-white lg:grid-cols-[200px_320px_minmax(0,1fr)]">
      {/* Filas */}
      <aside className="flex flex-col gap-1 border-b border-white/10 bg-[#111b21] p-2 lg:border-b-0 lg:border-r">
        <p className="px-2 pb-1 pt-1 text-xs font-bold uppercase tracking-wider text-white/45">X1 · filas</p>
        {FILAS.map((f) => (
          <button key={f.id} type="button" onClick={() => { setFila(f.id); setSel(null); }} title={f.dica}
            className={cn("flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition-colors", fila === f.id ? "bg-white/10 font-semibold" : "text-white/75 hover:bg-white/5")}>
            <f.Icone className={cn("h-4 w-4 shrink-0", f.cor)} />
            <span className="min-w-0 flex-1 truncate">{f.rotulo}</span>
            <span className={cn("rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums", (f.id === "abordar" && contagem.abordar) || (f.id === "quentes" && contagem.quentes) ? "bg-amber-400 text-black" : "bg-white/10 text-white/70")}>{contagem[f.id]}</span>
          </button>
        ))}
        <p className="mt-auto px-2 pt-2 text-[10px] leading-snug text-white/35">No app do Mac a mensagem vai direto pelo WhatsApp do projeto e as respostas chegam aqui. Na web, o WhatsApp abre com o texto pronto.</p>
      </aside>

      {/* Leads da fila */}
      <section className="flex min-h-0 flex-col border-b border-white/10 bg-[#111b21] lg:border-b-0 lg:border-r">
        <div className="space-y-2 border-b border-white/10 p-2.5">
          <div className="flex items-center gap-2"><h3 className="flex-1 truncate text-base font-bold">{filaAtual.rotulo}</h3>
            <button type="button" onClick={() => void carregar()} title="Atualizar" className="rounded-full p-1.5 text-white/55 hover:bg-white/10"><RefreshCw className="h-3.5 w-3.5" /></button></div>
          <div className="relative"><Search className="absolute left-2.5 top-2 h-4 w-4 text-white/40" /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar" className="w-full rounded-lg bg-[#202c33] py-1.5 pl-8 pr-3 text-sm text-white outline-none placeholder:text-white/40" /></div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {lista.length === 0 ? <p className="p-6 text-center text-sm text-white/40">{fila === "abordar" ? "Ninguém esperando abordagem. 🎉" : fila === "quentes" ? "Ninguém foi ao checkout sem comprar." : "Ninguém nesta fila."}</p> : lista.map((l) => {
            const u = ultima(l.id);
            return (
              <button key={l.id} type="button" onClick={() => setSel(l.id)} className={cn("flex w-full items-center gap-3 border-b border-white/5 px-3 py-2.5 text-left hover:bg-white/5", lead?.id === l.id && "bg-[#2a3942]")}>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#6b7c85] text-base font-bold">{(l.nome?.trim() || "?").slice(0, 1).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2"><span className="flex min-w-0 flex-1 items-center gap-1 truncate font-medium"><span className="truncate">{nomeDe(l)}</span>{estados.get(l.id)?.compra ? <Trophy className="h-3.5 w-3.5 shrink-0 text-emerald-300" /> : estados.get(l.id)?.clicouCheckout ? <Flame className="h-3.5 w-3.5 shrink-0 text-orange-400" /> : null}</span><span className="shrink-0 text-[11px] text-white/45">{haQuanto(u?.enviada_em ?? l.criada_em, agora)}</span></span>
                  <span className="flex items-center gap-1 truncate text-xs text-white/55">{u ? <>{u.de_mim !== false ? <CheckCheck className="h-3.5 w-3.5 shrink-0 text-sky-400" /> : null}<span className={cn("truncate", u.de_mim === false && "font-medium text-white/80")}>{u.texto}</span></> : <span className="truncate">Novo lead{l.perfil ? ` · ${l.perfil}` : ""}</span>}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Conversa */}
      <section className="flex min-h-0 min-w-0 flex-col">
        {!lead ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-[#222e35] p-6 text-center text-white/45"><MessageCircle className="h-10 w-10 opacity-40" /><p className="text-sm">Escolha um lead para abordar.</p></div>
        ) : (
          <>
            <header className="flex flex-wrap items-center gap-3 bg-[#202c33] px-4 py-2.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#6b7c85] font-bold">{(lead.nome?.trim() || "?").slice(0, 1).toUpperCase()}</span>
              <div className="min-w-0 flex-1"><p className="truncate font-semibold">{nomeDe(lead)}</p><p className="truncate text-xs text-white/55">{lead.whatsapp || "sem WhatsApp"}{lead.perfil ? ` · ${lead.perfil}` : ""}</p></div>
              {estados.get(lead.id)?.compra
                ? <span className="rounded-full border border-emerald-400/50 bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-200">Comprou · R$ {estados.get(lead.id)!.compra!.valor.toLocaleString("pt-BR")}</span>
                : estados.get(lead.id)?.clicouCheckout && <span className="flex items-center gap-1 rounded-full border border-orange-400/50 bg-orange-500/15 px-2.5 py-1 text-xs font-medium text-orange-200"><Flame className="h-3 w-3" />Foi ao checkout</span>}
              <select value={lead.status} onChange={(e) => onStatus(lead, e.target.value as StatusLead)} className="rounded-full border border-white/15 bg-[#111b21] px-3 py-1 text-xs outline-none">
                {(Object.keys(NOMES_STATUS) as StatusLead[]).map((s) => <option key={s} value={s}>{NOMES_STATUS[s]}</option>)}
              </select>
              <button type="button" onClick={() => void onApagar([lead.id])} title="Apagar este lead" className="rounded-full border border-white/15 p-1.5 text-white/60 hover:border-rose-400/50 hover:text-rose-300"><Trash2 className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={proximo} disabled={lista.length < 2} className="flex items-center gap-1 rounded-full border border-white/15 px-3 py-1 text-xs text-white/80 hover:bg-white/10 disabled:opacity-30">Próximo<ChevronRight className="h-3.5 w-3.5" /></button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto bg-[#0b141a] bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.025),transparent_40%),radial-gradient(circle_at_80%_70%,rgba(255,255,255,0.02),transparent_40%)] px-4 py-3">
              <div className="mx-auto flex max-w-2xl flex-col gap-1.5">
                <div className="mx-auto mb-2 max-w-md rounded-lg bg-[#182229] px-3 py-2 text-center text-xs text-white/65">
                  <b className="text-white/85">Lead do quiz</b> · {lead.perfil || "sem perfil"} · {etapaDoLead(lead, perguntas)} · {haQuanto(lead.criada_em, agora)}
                  {lead.respostas.length > 0 && (
                    <details className="mt-1 text-left"><summary className="cursor-pointer text-center text-cyan-300">Ver respostas</summary>
                      <ul className="mt-1 space-y-0.5">{lead.respostas.map((r, i) => <li key={i}><span className="text-white/45">{r.pergunta}</span> → <b className="text-white/85">{r.resposta ?? "—"}</b></li>)}</ul></details>
                  )}
                </div>
                {mensagens.length === 0 && <p className="mx-auto rounded-lg bg-[#182229] px-3 py-1.5 text-xs text-white/50">Nenhuma mensagem ainda. Escolha um modelo abaixo ou escreva do zero.</p>}
                {mensagens.map((m, i) => {
                  const d = new Date(m.enviada_em);
                  const novoDia = i === 0 || !isSameDay(d, new Date(mensagens[i - 1].enviada_em));
                  return (
                    <div key={m.id} className="contents">
                      {novoDia && <p className="mx-auto my-1 rounded-lg bg-[#182229] px-3 py-1 text-[11px] text-white/55">{format(d, "d 'de' MMMM", { locale: ptBR })}</p>}
                      <div className={cn("max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3 py-1.5 text-[14.5px] shadow", m.de_mim === false ? "mr-auto rounded-tl-none bg-[#202c33]" : "ml-auto rounded-tr-none bg-[#005c4b]")}>
                        {m.modelo && <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-emerald-200/70">{m.modelo}</span>}
                        {m.texto}
                        <span className="ml-3 inline-flex translate-y-1 items-center gap-0.5 text-[10.5px] text-white/55">{format(d, "HH:mm")}{m.de_mim !== false && <Check className="h-3 w-3" />}</span>
                      </div>
                    </div>
                  );
                })}
                <div ref={fim} />
              </div>
            </div>

            <footer className="space-y-2 bg-[#202c33] p-3">
              <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                {modelos.map((m) => (
                  <span key={m.id} className="group flex shrink-0 items-center">
                    <button type="button" onClick={() => escolherModelo(m)} title={preencherModelo(m.texto, { nome: lead.nome, perfil: lead.perfil })}
                      className={cn("rounded-full border px-3 py-1 text-xs hover:bg-white/10", modeloUsado === m.nome ? "border-emerald-400/70 bg-emerald-500/15 text-emerald-200" : "border-white/15 text-white/80")}>{m.nome}</button>
                    {m.proprio && <button type="button" onClick={() => void apagarModelo(m)} title="Apagar este modelo" className="ml-0.5 hidden rounded-full p-1 text-white/40 hover:text-rose-300 group-hover:block"><Trash2 className="h-3 w-3" /></button>}
                  </span>
                ))}
              </div>
              <div className="flex items-end gap-2">
                <textarea value={texto} onChange={(e) => { setTexto(e.target.value); if (modeloUsado && !e.target.value) setModeloUsado(null); }} rows={3} placeholder="Escreva a mensagem ou escolha um modelo acima…"
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void enviar(); } }}
                  className="min-h-0 flex-1 resize-none rounded-xl bg-[#2a3942] px-3.5 py-2 text-[14.5px] text-white outline-none placeholder:text-white/40" />
                <button type="button" disabled={!texto.trim() || !link || enviando} onClick={() => void enviar()} title={link ? "Abre o WhatsApp com a mensagem pronta (⌘ Enter)" : "Sem WhatsApp válido"}
                  className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-[#00a884] px-4 text-sm font-semibold text-white hover:bg-[#019c7a] disabled:opacity-40">
                  {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Enviar pelo WhatsApp
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <button type="button" disabled={!texto.trim()} onClick={() => { void navigator.clipboard.writeText(texto); toast.success("Mensagem copiada"); }} className="flex items-center gap-1 rounded-lg px-2 py-1 text-white/60 hover:bg-white/10 disabled:opacity-30"><Copy className="h-3.5 w-3.5" />Copiar</button>
                {salvandoModelo === null ? (
                  <button type="button" disabled={!texto.trim()} onClick={() => setSalvandoModelo("")} className="flex items-center gap-1 rounded-lg px-2 py-1 text-white/60 hover:bg-white/10 disabled:opacity-30"><Plus className="h-3.5 w-3.5" />Salvar como modelo</button>
                ) : (
                  <span className="flex items-center gap-1">
                    <input autoFocus value={salvandoModelo} onChange={(e) => setSalvandoModelo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void salvarModelo(salvandoModelo); if (e.key === "Escape") setSalvandoModelo(null); }} placeholder="Nome do modelo" className="w-40 rounded-lg bg-[#2a3942] px-2 py-1 text-xs outline-none" />
                    <button type="button" disabled={!salvandoModelo.trim()} onClick={() => void salvarModelo(salvandoModelo)} className="rounded-lg bg-white/10 px-2 py-1 hover:bg-white/20 disabled:opacity-30">Salvar</button>
                    <button type="button" onClick={() => setSalvandoModelo(null)} className="rounded p-1 text-white/50 hover:bg-white/10"><X className="h-3.5 w-3.5" /></button>
                  </span>
                )}
                <span className="ml-auto text-white/40">Variáveis nos modelos: {"{nome}"} e {"{perfil}"}</span>
              </div>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}

