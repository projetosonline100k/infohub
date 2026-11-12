import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Bot, Loader2, Mic, Plus, RotateCcw, Send, Trash2, FlaskConical, Hammer } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { isDesktop } from "@/lib/platform";
import { useGravarAudio } from "@/hooks/useGravarAudio";
import { completude, configVazia, pausaDigitando, prontoParaUsar, sanitizarAgente, type ConfigAgente } from "@/lib/agenteWhatsapp";

// Inteligência do agente do WhatsApp (12/11/2026, Davi: "vou conversando e a gente monta a inteligência: produto, ofertas, o que pode e não pode…").
// Esquerda: conversa com o Claude (que entrevista) ou teste (você faz o lead). Direita: a inteligência, editável à mão, salva sozinha.
// Nada aqui envia mensagem a lead: o agente ainda só é montado e testado.
const db = supabase as unknown as SupabaseClient;
type Msg = { papel: "user" | "assistant" | "lead" | "agente"; texto: string };
// O agente pode mandar várias mensagens seguidas: ele as separa com uma linha "---" e cada uma vira um balão (como seriam enviadas).
const partirMensagens = (t: string) => t.split(/\n\s*-{3,}\s*\n/).map((x) => x.trim()).filter(Boolean);
const ehAjuste = (t: string) => /^\s*\[ajuste\]/i.test(t);
const AJUDA = "Oi, aqui é a Gabriela, a agente que cuida da inteligência do seu agente de vendas. Fico aqui o tempo todo e lembro de tudo que você pedir: ordens, ajustes, regras. Conta do jeito que quiser: qual é o produto, para quem é, quanto custa e onde se compra. Pode colar a página de vendas também. Eu organizo ao lado e te pergunto o que faltar.";

export function AgenteX1({ quizId, titulo, perfis }: { quizId: string; titulo: string; perfis: string[] }) {
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [config, setConfig] = useState<ConfigAgente | null>(null);
  const [modo, setModo] = useState<"construir" | "simular">("construir");
  const [msgs, setMsgs] = useState<Record<"construir" | "simular", Msg[]>>({ construir: [{ papel: "assistant", texto: AJUDA }], simular: [] });
  const [texto, setTexto] = useState("");
  const [esperando, setEsperando] = useState(false);
  const [digitando, setDigitando] = useState(false);
  const [zerados, setZerados] = useState<Record<"construir" | "simular", string | null>>({ construir: null, simular: null });
  const [perfilSim, setPerfilSim] = useState(perfis[0] ?? "");
  const audio = useGravarAudio((falado) => setTexto((t) => [t.trim(), falado].filter(Boolean).join(" ")));
  const fim = useRef<HTMLDivElement>(null);
  const salvar = useRef<ReturnType<typeof setTimeout>>();
  const configRef = useRef<ConfigAgente | null>(null);
  configRef.current = config;

  useEffect(() => {
    void (async () => {
      const { data: q } = await db.from("quizzes").select("cliente_id").eq("id", quizId).maybeSingle();
      const cid = (q as { cliente_id: string } | null)?.cliente_id ?? null;
      setClienteId(cid);
      if (!cid) return;
      const { data } = await db.from("agentes_whatsapp").select("config, zerado_construir_em, zerado_simular_em").eq("cliente_id", cid).maybeSingle();
      const linha = data as { config: unknown; zerado_construir_em: string | null; zerado_simular_em: string | null } | null;
      setConfig(sanitizarAgente(linha?.config ?? {}, configVazia()));
      setZerados({ construir: linha?.zerado_construir_em ?? null, simular: linha?.zerado_simular_em ?? null });
      // A conversa fica guardada: volta do jeito que estava (e retoma uma resposta que ainda estava sendo preparada).
      const { data: ps } = await db.from("agente_whatsapp_pedidos").select("id, tipo, mensagem, status, resposta, criado_em, contexto").eq("cliente_id", cid).order("criado_em", { ascending: false }).limit(60);
      const lista = ((ps ?? []) as { id: string; tipo: "construir" | "simular"; mensagem: string; status: string; resposta: string | null; criado_em: string; contexto: { origem?: string; iniciar?: boolean } | null }[]).reverse();
      const m: Record<"construir" | "simular", Msg[]> = { construir: [{ papel: "assistant", texto: AJUDA }], simular: [] };
      for (const p of lista) {
        const onde: "construir" | "simular" = p.contexto?.origem === "teste" ? "simular" : p.tipo;
        if (linha?.[onde === "construir" ? "zerado_construir_em" : "zerado_simular_em"] && p.criado_em <= (linha[onde === "construir" ? "zerado_construir_em" : "zerado_simular_em"] as string)) continue;
        if (!p.contexto?.iniciar) m[onde].push({ papel: p.tipo === "construir" ? "user" : "lead", texto: p.mensagem });
        if (p.status === "respondido" && p.resposta) for (const parte of p.tipo === "construir" ? [p.resposta] : partirMensagens(p.resposta)) m[onde].push({ papel: p.tipo === "construir" ? "assistant" : "agente", texto: parte });
      }
      setMsgs(m);
      const ultimo = lista[lista.length - 1];
      if (ultimo && (ultimo.status === "pendente" || ultimo.status === "processando") && Date.now() - new Date(ultimo.criado_em).getTime() < 12 * 60_000) {
        const onde = ultimo.contexto?.origem === "teste" ? "simular" : ultimo.tipo;
        setModo(onde);
        void aguardar(ultimo.id, onde, ultimo.tipo, cid);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId]);
  useEffect(() => { fim.current?.scrollIntoView({ block: "end" }); }, [msgs, esperando, modo]);

  const gravar = useCallback((c: ConfigAgente, cid: string) => {
    clearTimeout(salvar.current);
    salvar.current = setTimeout(() => {
      void db.from("agentes_whatsapp").upsert({ cliente_id: cid, config: c, atualizado_em: new Date().toISOString() }).then(({ error }: { error: unknown }) => { if (error) toast.error("Não consegui salvar a inteligência"); });
    }, 700);
  }, []);
  const editar = (f: (c: ConfigAgente) => ConfigAgente) => {
    if (!config || !clienteId) return;
    const novo = f(config);
    setConfig(novo);
    gravar(novo, clienteId);
  };

  const enviar = async (abertura = false) => {
    const t = abertura ? "(início da conversa)" : texto.trim();
    if (!t || !clienteId || !config || esperando) return;
    const papelEu = modo === "construir" ? "user" : "lead";
    const hist = abertura ? [] : msgs[modo];
    if (!abertura) setMsgs((m) => ({ ...m, [modo]: [...hist, { papel: papelEu, texto: t }] }));
    setTexto("");
    setEsperando(true);
    // [ajuste] no teste vai para a montagem: o agente aprende e a inteligência muda na hora.
    const tipo = modo === "simular" && ehAjuste(t) ? "construir" : modo;
    const contexto = tipo === "construir"
      ? { quiz: titulo, quiz_id: quizId, perfis, ...(modo === "simular" ? { origem: "teste", conversa_de_teste: hist.map((h) => `${h.papel === "lead" ? "Lead" : "Agente"}: ${h.texto}`).slice(-14) } : {}) }
      : { quiz: titulo, lead: { perfil: perfilSim, nome: "Lead de teste" }, ...(abertura ? { iniciar: true } : {}) };
    const { data, error } = await db.from("agente_whatsapp_pedidos").insert({
      cliente_id: clienteId, tipo, mensagem: t, contexto, config_atual: config,
      historico: (tipo === "construir" && modo === "simular" ? msgs.construir : hist).filter((h, i) => i > 0 || tipo !== "construir").map((h) => ({ papel: h.papel, texto: h.texto })),
    }).select("id").single();
    if (error || !data) { setEsperando(false); toast.error("Não consegui enviar"); return; }
    await aguardar((data as { id: string }).id, modo, tipo, clienteId, ehAjuste(t));
  };

  async function aguardar(id: string, modo: "construir" | "simular", tipo: "construir" | "simular", clienteId: string, ajuste = false) {
    setEsperando(true);
    for (let i = 0; i < 330; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const { data: p } = await db.from("agente_whatsapp_pedidos").select("status, resposta, config, erro").eq("id", id).maybeSingle();
      const r = p as { status: string; resposta: string | null; config: unknown; erro: string | null } | null;
      if (r?.status === "respondido") {
        // O agente de teste manda uma mensagem de cada vez, com a pausa de "digitando…" entre elas (como no WhatsApp de verdade).
        const partes = tipo === "construir" ? [r.resposta ?? ""] : partirMensagens(r.resposta ?? "");
        for (let k = 0; k < partes.length; k++) {
          if (k > 0) { setDigitando(true); await new Promise((ok) => setTimeout(ok, pausaDigitando(partes[k]))); setDigitando(false); }
          setMsgs((m) => ({ ...m, [modo]: [...m[modo], { papel: (tipo === "construir" ? "assistant" : "agente") as Msg["papel"], texto: partes[k] }] }));
        }
        if (tipo === "construir" && r.config && configRef.current) {
          const novo = sanitizarAgente(r.config, configRef.current);
          setConfig(novo);
          gravar(novo, clienteId);
          if (ajuste) toast.success("Aprendi e gravei na inteligência");
        }
        setEsperando(false);
        return;
      }
      if (r?.status === "erro") { setEsperando(false); toast.error(r.erro || "O Claude não conseguiu responder agora"); return; }
    }
    setEsperando(false);
    toast.error("Demorou demais. Tente de novo.");
  }

  const zerar = async () => {
    if (!clienteId) return;   // sem confirmação: o histórico fica guardado e a inteligência ao lado não muda
    const agora = new Date().toISOString();
    setZerados((z) => ({ ...z, [modo]: agora }));
    setMsgs((m) => ({ ...m, [modo]: modo === "construir" ? [{ papel: "assistant", texto: AJUDA }] : [] }));
    const { error } = await db.from("agentes_whatsapp").upsert({ cliente_id: clienteId, [modo === "construir" ? "zerado_construir_em" : "zerado_simular_em"]: agora });
    if (error) { toast.error("Não consegui zerar"); return; }
  };

  if (!config) return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  const { pct, faltando } = completude(config);
  const lista = msgs[modo];
  const campo = "w-full rounded-lg border border-white/10 bg-[#0b141a] px-2.5 py-1.5 text-sm text-white outline-none focus:border-cyan-400/50";
  const rot = "text-[11px] font-semibold uppercase tracking-wider text-white/45";
  const Lista = ({ rotulo, itens, aoMudar, ph }: { rotulo: string; itens: string[]; aoMudar: (l: string[]) => void; ph: string }) => (
    <div className="space-y-1.5"><p className={rot}>{rotulo}</p>
      {itens.map((it, i) => (
        <div key={i} className="flex gap-1.5"><input className={campo} value={it} onChange={(e) => aoMudar(itens.map((x, j) => (j === i ? e.target.value : x)))} />
          <button type="button" onClick={() => aoMudar(itens.filter((_, j) => j !== i))} className="text-white/40 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button></div>
      ))}
      <button type="button" onClick={() => aoMudar([...itens, ""])} className="flex items-center gap-1 text-xs text-cyan-300 hover:underline"><Plus className="h-3 w-3" />{ph}</button>
    </div>
  );
  const P = config.produto;

  return (
    <div className="grid h-[calc(100svh-560px)] min-h-[440px] overflow-hidden rounded-2xl border border-white/10 bg-[#0b141a] text-white lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="flex min-h-0 flex-col border-b border-white/10 lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-1 border-b border-white/10 bg-[#111b21] p-2">
          {([["construir", "Gabriela · montar a inteligência", Hammer], ["simular", "Testar o agente", FlaskConical]] as const).map(([m, r, I]) => (
            <button key={m} type="button" onClick={() => setModo(m)} className={cn("flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm", modo === m ? "bg-white/10 font-semibold" : "text-white/60 hover:text-white")}><I className="h-4 w-4" />{r}</button>
          ))}
          <button type="button" onClick={() => void zerar()} title="Zerar esta conversa" className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-white/55 hover:bg-white/5 hover:text-white"><RotateCcw className="h-3.5 w-3.5" />Zerar</button>
          {modo === "simular" && perfis.length > 0 && (
            <select value={perfilSim} onChange={(e) => setPerfilSim(e.target.value)} className="rounded-lg border border-white/10 bg-[#0b141a] px-2 py-1 text-xs"><option value="">Lead sem perfil</option>{perfis.map((p) => <option key={p}>{p}</option>)}</select>
          )}
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {modo === "simular" && lista.length === 0 && !esperando && (
            <div className="space-y-3 rounded-xl bg-white/5 p-4 text-sm text-white/65">
              <p>Faça o papel do lead: escreva como ele escreveria (&quot;oi, vi o quiz, quanto custa?&quot;) e veja como o agente responde. {!prontoParaUsar(config) && "A inteligência ainda está incompleta: as respostas podem ficar vagas."}</p>
              <button type="button" onClick={() => void enviar(true)} className="rounded-lg bg-emerald-500 px-3 py-1.5 font-semibold text-black hover:bg-emerald-400">Fazer o agente me abordar</button>
            </div>
          )}
          {lista.map((m, i) => {
            const meu = m.papel === "user" || m.papel === "lead";
            return <div key={i} className={cn("max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm", meu ? "ml-auto bg-[#005c4b]" : "bg-[#202c33]")}>{m.texto}</div>;
          })}
          {(esperando || digitando) && <div className="flex items-center gap-2 text-xs text-white/50"><Loader2 className="h-3.5 w-3.5 animate-spin" />{digitando ? "digitando…" : "Pensando…"}</div>}
          <div ref={fim} />
        </div>
        {ehAjuste(texto) && <p className="border-t border-amber-400/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200">Modo ajuste: o agente vai aprender isso e gravar na inteligência ao lado.</p>}
        <div className="flex gap-2 border-t border-white/10 bg-[#111b21] p-2">
          <textarea rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void enviar(); } }}
            placeholder={modo === "construir" ? "Conte sobre o produto, as ofertas, o que o agente pode e não pode…" : "Escreva como o lead… (ou [ajuste] … para ensinar o agente)"} className="min-h-0 flex-1 resize-none rounded-xl border border-white/10 bg-[#2a3942] px-3 py-2 text-sm outline-none" />
          {isDesktop() && (
            <button type="button" onClick={() => void audio.alternar()} disabled={audio.transcrevendo} title={audio.gravando ? "Parar e transcrever" : "Gravar áudio"}
              className={cn("self-end rounded-full p-2.5", audio.gravando ? "animate-pulse bg-rose-500 text-white" : "bg-white/10 text-white/80 hover:bg-white/15")}>
              {audio.transcrevendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
            </button>
          )}
          <button type="button" disabled={!texto.trim() || esperando} onClick={() => void enviar()} className="self-end rounded-full bg-emerald-500 p-2.5 text-black disabled:opacity-40"><Send className="h-4 w-4" /></button>
        </div>
      </section>

      <section className="min-h-0 space-y-4 overflow-y-auto p-4">
        <div>
          <div className="flex items-center gap-2"><Bot className="h-4 w-4 text-cyan-300" /><p className="font-semibold">Inteligência do agente</p><span className="ml-auto text-sm tabular-nums text-white/70">{pct}%</span></div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-cyan-400" style={{ width: `${pct}%` }} /></div>
          {faltando.length > 0 && <p className="mt-1.5 text-xs text-white/50">Falta: {faltando.join(", ")}.</p>}
          <p className="mt-1 text-[11px] text-white/35">Este agente ainda não envia nada para os leads: por enquanto ele só é montado e testado aqui.</p>
        </div>

        <div className="space-y-2"><p className={rot}>Produto</p>
          <input className={campo} placeholder="Nome" value={P.nome} onChange={(e) => editar((c) => ({ ...c, produto: { ...c.produto, nome: e.target.value } }))} />
          <textarea className={campo} rows={2} placeholder="O que é" value={P.descricao} onChange={(e) => editar((c) => ({ ...c, produto: { ...c.produto, descricao: e.target.value } }))} />
          <input className={campo} placeholder="Para quem é" value={P.para_quem} onChange={(e) => editar((c) => ({ ...c, produto: { ...c.produto, para_quem: e.target.value } }))} />
          <input className={campo} placeholder="Resultado que entrega" value={P.resultado} onChange={(e) => editar((c) => ({ ...c, produto: { ...c.produto, resultado: e.target.value } }))} />
        </div>

        <div className="space-y-2"><p className={rot}>Ofertas</p>
          {config.ofertas.map((o, i) => {
            const ed = (k: keyof typeof o, v: string) => editar((c) => ({ ...c, ofertas: c.ofertas.map((x, j) => (j === i ? { ...x, [k]: v } : x)) }));
            return (
              <div key={i} className="space-y-1.5 rounded-xl border border-white/10 p-2.5">
                <div className="flex gap-1.5"><input className={campo} placeholder="Nome da oferta" value={o.nome} onChange={(e) => ed("nome", e.target.value)} />
                  <button type="button" onClick={() => editar((c) => ({ ...c, ofertas: c.ofertas.filter((_, j) => j !== i) }))} className="text-white/40 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button></div>
                <div className="grid grid-cols-2 gap-1.5"><input className={campo} placeholder="Preço" value={o.preco} onChange={(e) => ed("preco", e.target.value)} /><input className={campo} placeholder="Garantia" value={o.garantia} onChange={(e) => ed("garantia", e.target.value)} /></div>
                <input className={campo} placeholder="Link de compra (https://…)" value={o.link} onChange={(e) => ed("link", e.target.value)} />
                <input className={campo} placeholder="Condições (parcelas, prazo, cupom)" value={o.condicoes} onChange={(e) => ed("condicoes", e.target.value)} />
                <input className={campo} placeholder="Bônus" value={o.bonus} onChange={(e) => ed("bonus", e.target.value)} />
              </div>
            );
          })}
          <button type="button" onClick={() => editar((c) => ({ ...c, ofertas: [...c.ofertas, { nome: "", preco: "", link: "", condicoes: "", bonus: "", garantia: "" }] }))} className="flex items-center gap-1 text-xs text-cyan-300 hover:underline"><Plus className="h-3 w-3" />Adicionar oferta</button>
        </div>

        <div className="space-y-2"><p className={rot}>Objetivo</p><textarea className={campo} rows={2} placeholder="Ex.: levar o lead a comprar o X; se não quiser, agendar conversa" value={config.objetivo} onChange={(e) => editar((c) => ({ ...c, objetivo: e.target.value }))} /></div>
        <div className="space-y-2"><p className={rot}>Tom de voz</p><input className={campo} placeholder="Ex.: informal, direto, sem pressão" value={config.tom} onChange={(e) => editar((c) => ({ ...c, tom: e.target.value }))} /></div>
        <div className="space-y-2"><p className={rot}>Como abre a conversa</p><textarea className={campo} rows={2} value={config.apresentacao} onChange={(e) => editar((c) => ({ ...c, apresentacao: e.target.value }))} /></div>
        <Lista rotulo="Caminho da conversa" itens={config.etapas} aoMudar={(l) => editar((c) => ({ ...c, etapas: l }))} ph="Adicionar passo" />
        <Lista rotulo="Pode fazer" itens={config.pode} aoMudar={(l) => editar((c) => ({ ...c, pode: l }))} ph="Adicionar" />
        <Lista rotulo="NÃO pode fazer" itens={config.nao_pode} aoMudar={(l) => editar((c) => ({ ...c, nao_pode: l }))} ph="Adicionar" />

        <div className="space-y-2"><p className={rot}>Objeções e respostas</p>
          {config.objecoes.map((o, i) => (
            <div key={i} className="space-y-1.5 rounded-xl border border-white/10 p-2.5">
              <div className="flex gap-1.5"><input className={campo} placeholder="Objeção (ex.: tá caro)" value={o.objecao} onChange={(e) => editar((c) => ({ ...c, objecoes: c.objecoes.map((x, j) => (j === i ? { ...x, objecao: e.target.value } : x)) }))} />
                <button type="button" onClick={() => editar((c) => ({ ...c, objecoes: c.objecoes.filter((_, j) => j !== i) }))} className="text-white/40 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button></div>
              <textarea className={campo} rows={2} placeholder="Como responder" value={o.resposta} onChange={(e) => editar((c) => ({ ...c, objecoes: c.objecoes.map((x, j) => (j === i ? { ...x, resposta: e.target.value } : x)) }))} />
            </div>
          ))}
          <button type="button" onClick={() => editar((c) => ({ ...c, objecoes: [...c.objecoes, { objecao: "", resposta: "" }] }))} className="flex items-center gap-1 text-xs text-cyan-300 hover:underline"><Plus className="h-3 w-3" />Adicionar objeção</button>
        </div>

        {perfis.length > 0 && (
          <div className="space-y-2"><p className={rot}>Abordagem por perfil do quiz</p>
            {perfis.map((nome) => {
              const atual = config.perfis.find((p) => p.perfil === nome)?.abordagem ?? "";
              return <div key={nome}><p className="mb-0.5 text-xs text-white/60">{nome}</p>
                <textarea className={campo} rows={2} value={atual} onChange={(e) => editar((c) => ({ ...c, perfis: [...c.perfis.filter((p) => p.perfil !== nome), ...(e.target.value ? [{ perfil: nome, abordagem: e.target.value }] : [])] }))} /></div>;
            })}
          </div>
        )}
        <Lista rotulo="Chamar você quando…" itens={config.chamar_humano} aoMudar={(l) => editar((c) => ({ ...c, chamar_humano: l }))} ph="Adicionar situação" />
        <div className="space-y-2"><p className={rot}>Outras informações</p><textarea className={campo} rows={3} value={config.extras} onChange={(e) => editar((c) => ({ ...c, extras: e.target.value }))} /></div>
      </section>
    </div>
  );
}
