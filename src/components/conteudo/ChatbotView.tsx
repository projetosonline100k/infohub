import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowDown, ArrowLeft, ArrowUp, Bot, Copy, ExternalLink, Loader2, ListChecks, Palette, Pause, Play, Plus, RotateCcw, Sparkles, Trash2, Trophy, Users, Workflow } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { confirmar } from "@/components/DialogosGlobais";
import { cn } from "@/lib/utils";
import { abrirLinkExterno } from "@/lib/abrirLink";
import { ChatbotPlayer } from "@/components/chatbot/ChatbotPlayer";
import { PreviaChatbot } from "@/components/chatbot/PreviaChatbot";
import { FluxoChatbot } from "@/components/chatbot/FluxoChatbot";
import { AssistenteChatbot } from "@/components/chatbot/AssistenteChatbot";
import { MolduraCelular } from "@/components/quiz/MolduraCelular";
import {
  ROTULO_TIPO, linkDoChatbot, modeloDiagnostico, modeloEmBranco, novoId, pontuacaoMaxima,
  type ChatbotResumo, type ConfigChatbot, type DesfechoChatbot, type EtapaChatbot, type LeadChatbot, type TipoEtapa,
} from "@/lib/chatbot/chatbot";

// Projeto → Chatbot (10/11/2026, Davi: "um sistema abaixo do WhatsApp, para criar um diagnóstico em conversa
// idêntico ao da Core Audience"). Monta a conversa (etapas, pontuação, desfechos), mostra a prévia ao lado,
// publica em /chatbot/<slug> e lista os leads (cada resposta já grava, mesmo se a pessoa sair no meio).
const db = supabase as unknown as SupabaseClient;   // chatbots ainda não está nos tipos gerados
const campo = "w-full rounded-lg border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary/50";

export function ChatbotView({ clienteId }: { clienteId: string }) {
  const [bots, setBots] = useState<ChatbotResumo[]>([]);
  const [contagem, setContagem] = useState<Record<string, number>>({});
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);

  const carregar = useCallback(async () => {
    const [{ data: b }, { data: l }] = await Promise.all([
      db.from("chatbots").select("id, nome, slug, status, config, criado_em").eq("cliente_id", clienteId).order("criado_em", { ascending: false }),
      db.from("chatbot_leads").select("chatbot_id").eq("cliente_id", clienteId).limit(5000),
    ]);
    setBots((b ?? []) as ChatbotResumo[]);
    const n: Record<string, number> = {};
    for (const x of (l ?? []) as { chatbot_id: string }[]) n[x.chatbot_id] = (n[x.chatbot_id] ?? 0) + 1;
    setContagem(n);
    setCarregando(false);
  }, [clienteId]);
  useEffect(() => { void carregar(); }, [carregar]);

  const criar = async (nome: string, modelo: "diagnostico" | "branco") => {
    const config = modelo === "diagnostico" ? modeloDiagnostico() : modeloEmBranco();
    const { data, error } = await db.from("chatbots").insert({ cliente_id: clienteId, nome, config }).select("id").single();
    if (error || !data) { toast.error("Não consegui criar o chatbot"); return; }
    setNovo(false);
    await carregar();
    setAberto((data as { id: string }).id);
  };
  const excluir = async (b: ChatbotResumo) => {
    if (!(await confirmar(`Excluir o chatbot "${b.nome}" e os ${contagem[b.id] ?? 0} leads dele? Não dá para desfazer.`, { botao: "Excluir", destrutivo: true }))) return;
    const { error } = await db.from("chatbots").delete().eq("id", b.id);
    if (error) { toast.error("Não consegui excluir"); return; }
    void carregar();
  };

  const atual = bots.find((b) => b.id === aberto);
  if (atual) return <EditorChatbot key={atual.id} bot={atual} onVoltar={() => { setAberto(null); void carregar(); }} />;

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Bot className="h-6 w-6 text-primary" />Chatbot</h1>
          <p className="text-sm text-muted-foreground">Monte uma conversa que qualifica quem chega pelo Instagram: pergunta, pontua e leva cada pessoa para o caminho certo. Cada resposta vira um lead aqui.</p>
        </div>
        <Button className="gap-1.5" onClick={() => setNovo(true)}><Plus className="h-4 w-4" />Criar novo chatbot</Button>
      </header>

      {carregando ? <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        : bots.length === 0 ? <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">Nenhum chatbot ainda. Clique em “Criar novo chatbot”.</div>
        : (
          <div className="space-y-2">
            {bots.map((b) => (
              <div key={b.id} className="group flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setAberto(b.id)}>
                  <p className="break-words font-semibold">{b.nome}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className={cn("rounded-full px-2 py-0.5 font-medium", b.status === "publicado" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-zinc-500/15")}>{b.status === "publicado" ? "No ar" : b.status === "pausado" ? "Pausado" : "Rascunho"}</span>
                    <span>{b.config.etapas?.length ?? 0} etapas</span>
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" />{contagem[b.id] ?? 0} leads</span>
                  </p>
                </button>
                <Button size="sm" variant="outline" className="h-8" onClick={() => setAberto(b.id)}>Editar</Button>
                <button type="button" title="Excluir" onClick={() => void excluir(b)} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground opacity-0 hover:bg-rose-500/10 hover:text-rose-600 group-hover:opacity-100"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        )}
      <NovoChatbot aberto={novo} onFechar={() => setNovo(false)} onCriar={criar} />
    </div>
  );
}

function NovoChatbot({ aberto, onFechar, onCriar }: { aberto: boolean; onFechar: () => void; onCriar: (nome: string, modelo: "diagnostico" | "branco") => Promise<void> }) {
  const [nome, setNome] = useState("");
  const [enviando, setEnviando] = useState(false);
  useEffect(() => { if (!aberto) setNome(""); }, [aberto]);
  const ir = async (modelo: "diagnostico" | "branco") => { setEnviando(true); try { await onCriar(nome.trim() || (modelo === "diagnostico" ? "Diagnóstico de crescimento" : "Novo chatbot"), modelo); } finally { setEnviando(false); } };
  return (
    <Dialog open={aberto} onOpenChange={(a) => { if (!a) onFechar(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Criar novo chatbot</DialogTitle><DialogDescription>Escolha por onde começar. Dá para mudar tudo depois.</DialogDescription></DialogHeader>
        <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do chatbot (ex.: Diagnóstico da bio)" />
        <button type="button" disabled={enviando} onClick={() => void ir("diagnostico")} className="rounded-xl border p-3 text-left hover:border-primary hover:bg-primary/5">
          <p className="font-semibold">Diagnóstico de crescimento (modelo Core Audience)</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Nome, WhatsApp, e-mail, @ do Instagram, seguidores, nicho, desafio e renda; pontua e separa quem é alto potencial. Pronto para editar.</p>
        </button>
        <button type="button" disabled={enviando} onClick={() => void ir("branco")} className="rounded-xl border p-3 text-left hover:border-primary hover:bg-primary/5">
          <p className="font-semibold">Em branco</p><p className="mt-0.5 text-xs text-muted-foreground">Só a primeira pergunta; você monta o resto.</p>
        </button>
      </DialogContent>
    </Dialog>
  );
}

function EditorChatbot({ bot, onVoltar }: { bot: ChatbotResumo; onVoltar: () => void }) {
  const [nome, setNome] = useState(bot.nome);
  const [config, setConfig] = useState<ConfigChatbot>(bot.config);
  const [status, setStatus] = useState(bot.status);
  const [aba, setAba] = useState<"montar" | "leads">("montar");
  const [painel, setPainel] = useState<"assistente" | "etapas" | "final" | "aparencia">(bot.config.etapas.length > 1 ? "etapas" : "assistente");
  const [modo, setModo] = useState<"vivo" | "testar">("vivo");
  const [foco, setFoco] = useState<string>(bot.config.etapas[0]?.id ?? "");
  const [reinicio, setReinicio] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const primeiro = useRef(true);
  const cartoes = useRef<Record<string, HTMLDivElement | null>>({});

  // Salva sozinho, meio segundo depois da última mudança (o link já mostra o que está salvo).
  useEffect(() => {
    if (primeiro.current) { primeiro.current = false; return; }
    setSalvando(true);
    const t = window.setTimeout(async () => {
      const { error } = await db.from("chatbots").update({ nome: nome.trim() || bot.nome, config }).eq("id", bot.id);
      if (error) toast.error("Não consegui salvar");
      setSalvando(false);
    }, 600);
    return () => window.clearTimeout(t);
  }, [nome, config, bot.id, bot.nome]);

  const mudar = (f: (c: ConfigChatbot) => void) => setConfig((atual) => { const n = structuredClone(atual); f(n); return n; });
  // O foco sempre aponta para uma etapa que existe (apagar ou trocar tudo pelo assistente não deixa a prévia vazia).
  const focoValido = foco.startsWith("final-") || config.etapas.some((e) => e.id === foco) ? foco : (config.etapas[0]?.id ?? "");
  const escolher = (id: string, doFluxo = false) => {
    setFoco(id);
    if (doFluxo) {
      setPainel(id.startsWith("final-") ? "final" : "etapas");
      requestAnimationFrame(() => cartoes.current[id]?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
    }
  };
  // Apagar pelo fluxo (clicar no bloco → lixeira ou Delete). Sempre sobra uma etapa; dá para desfazer pelo aviso.
  const apagarEtapa = useCallback((id: string) => {
    setConfig((atual) => {
      if (atual.etapas.length < 2 || !atual.etapas.some((e) => e.id === id)) return atual;
      const i = atual.etapas.findIndex((e) => e.id === id);
      const novo = structuredClone(atual);
      novo.etapas.splice(i, 1);
      setFoco(novo.etapas[Math.min(i, novo.etapas.length - 1)].id);
      toast("Etapa apagada", { action: { label: "Desfazer", onClick: () => setConfig(atual) }, duration: 6000 });
      return novo;
    });
  }, []);
  const mudarStatus = async (s: "publicado" | "pausado") => {
    const { error } = await db.from("chatbots").update({ status: s }).eq("id", bot.id);
    if (error) { toast.error(error.message); return; }
    setStatus(s);
    toast.success(s === "publicado" ? "No ar: quem responder vira lead" : "Pausado: o link para de funcionar");
  };
  const link = linkDoChatbot(bot.slug);

  return (
    <div className="flex h-[calc(100svh-110px)] min-h-[640px] flex-col gap-3 p-3 sm:p-4">
      <header className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" className="gap-1" onClick={onVoltar}><ArrowLeft className="h-4 w-4" />Chatbots</Button>
        <Input value={nome} onChange={(e) => setNome(e.target.value)} className="h-9 max-w-xs font-semibold" />
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", status === "publicado" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-zinc-500/15 text-muted-foreground")}>{status === "publicado" ? "No ar" : status === "pausado" ? "Pausado" : "Rascunho"}</span>
        {salvando && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />salvando</span>}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
            {([["montar", "Montar"], ["leads", "Leads"]] as const).map(([a, r]) => (
              <button key={a} type="button" onClick={() => setAba(a)} className={cn("rounded-md px-3 py-1", aba === a ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}>{r}</button>
            ))}
          </div>
          {status !== "pausado" && (
            <>
              <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={salvando} title="Abre exatamente o que a pessoa vai ver (o que está salvo agora)" onClick={() => void abrirLinkExterno(link)}><ExternalLink className="h-4 w-4" />Ver link</Button>
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Copiar link" onClick={() => { void navigator.clipboard.writeText(link); toast.success("Link copiado"); }}><Copy className="h-4 w-4" /></Button>
            </>
          )}
          {status === "publicado" && <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => void mudarStatus("pausado")}><Pause className="h-4 w-4" />Pausar</Button>}
          {status !== "publicado" && <Button size="sm" className="h-8 gap-1.5" onClick={() => void mudarStatus("publicado")}><Play className="h-4 w-4" />{status === "pausado" ? "Publicar de novo" : "Publicar"}</Button>}
        </div>
      </header>

      {aba === "leads" ? <LeadsChatbot bot={bot} /> : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
          <div className="flex h-[360px] shrink-0 flex-col gap-2 rounded-2xl border border-white/10 bg-[#0a1019] p-3 lg:h-auto lg:w-[300px] xl:w-[330px]">
            <p className="flex shrink-0 items-center gap-2 text-base font-semibold text-white"><Workflow className="h-4 w-4 text-cyan-300" />Fluxo do chatbot</p>
            <div className="min-h-0 flex-1"><FluxoChatbot config={config} selecionada={focoValido} onEscolher={(id) => escolher(id, true)} onApagar={apagarEtapa} /></div>
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
            <div className="flex shrink-0 flex-wrap gap-1 rounded-lg bg-muted p-1 text-sm">
              {([["assistente", "Assistente", Sparkles], ["etapas", "Etapas", ListChecks], ["final", "Final e pontos", Trophy], ["aparencia", "Aparência", Palette]] as const).map(([p, r, Icone]) => (
                <button key={p} type="button" onClick={() => setPainel(p)} className={cn("flex items-center gap-1.5 rounded-md px-3 py-1", painel === p ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}><Icone className="h-3.5 w-3.5" />{r}</button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {painel === "assistente" && <AssistenteChatbot config={config} onAplicar={setConfig} />}
              {painel === "etapas" && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">O bot fala as mensagens e espera a resposta. Use {"{primeiro}"} para o primeiro nome, {"{chave}"} para outra resposta e **negrito**. A prévia mostra o que você está escrevendo.</p>
                  {config.etapas.map((e, i) => (
                    <div key={e.id} ref={(el) => { cartoes.current[e.id] = el; }} onFocusCapture={() => setFoco(e.id)} onClick={() => setFoco(e.id)}
                      className={cn("rounded-xl", focoValido === e.id && "ring-2 ring-primary/60")}>
                      <CartaoEtapa etapa={e} indice={i} total={config.etapas.length}
                        onMudar={(f) => mudar((c) => f(c.etapas[i]))}
                        onMover={(d) => mudar((c) => { const j = i + d; if (j < 0 || j >= c.etapas.length) return; [c.etapas[i], c.etapas[j]] = [c.etapas[j], c.etapas[i]]; })}
                        onExcluir={() => mudar((c) => { c.etapas.splice(i, 1); })} />
                    </div>
                  ))}
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { const id = novoId(); mudar((c) => { c.etapas.push({ id, chave: `pergunta${c.etapas.length + 1}`, tipo: "texto", mensagens: ["Nova pergunta?"] }); }); setFoco(id); }}><Plus className="h-4 w-4" />Adicionar etapa</Button>
                </div>
              )}
              {painel === "final" && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Soma os pontos das respostas (máximo possível: {pontuacaoMaxima(config)}). Quem chega no mínimo é “alto potencial”; os outros veem o outro final.</p>
                  <Rotulo r="Pontuação mínima para qualificar"><input type="number" min={0} className={cn(campo, "w-28")} value={config.pontuacao.minimo} onChange={(e) => mudar((c) => { c.pontuacao.minimo = Number(e.target.value) || 0; })} /></Rotulo>
                  {(["qualificado", "nao_qualificado"] as const).map((k) => (
                    <div key={k} onFocusCapture={() => setFoco(`final-${k}`)} className={cn("rounded-xl", focoValido === `final-${k}` && "ring-2 ring-primary/60")}>
                      <FimEditor titulo={k === "qualificado" ? "Final de quem se qualificou" : "Final de quem não se qualificou"} d={config.desfechos[k]} onMudar={(f) => mudar((c) => f(c.desfechos[k]))} />
                    </div>
                  ))}
                </div>
              )}
              {painel === "aparencia" && (
                <div className="space-y-2">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Rotulo r="Título no topo"><input className={campo} value={config.marca.titulo} onChange={(e) => mudar((c) => { c.marca.titulo = e.target.value; })} /></Rotulo>
                    <Rotulo r="Cor"><input type="color" className="h-9 w-full rounded-lg border bg-background p-1" value={config.marca.cor || "#7c3aed"} onChange={(e) => mudar((c) => { c.marca.cor = e.target.value; })} /></Rotulo>
                    <Rotulo r="Foto do bot (link da imagem)"><input className={campo} placeholder="https://…" value={config.marca.avatar_url ?? ""} onChange={(e) => mudar((c) => { c.marca.avatar_url = e.target.value; })} /></Rotulo>
                    <Rotulo r="Logo (link da imagem)"><input className={campo} placeholder="https://…" value={config.marca.logo_url ?? ""} onChange={(e) => mudar((c) => { c.marca.logo_url = e.target.value; })} /></Rotulo>
                  </div>
                  <Rotulo r="Aviso de privacidade (embaixo do campo)"><Textarea rows={2} className="text-sm" value={config.lgpd ?? ""} onChange={(e) => mudar((c) => { c.lgpd = e.target.value; })} /></Rotulo>
                </div>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-center gap-2 lg:w-[380px]">
            <div className="flex w-full items-center justify-between gap-2 text-xs">
              <div className="flex gap-1 rounded-lg bg-muted p-0.5">
                {([["vivo", "Ao vivo"], ["testar", "Testar"]] as const).map(([m, r]) => (
                  <button key={m} type="button" onClick={() => setModo(m)} className={cn("rounded-md px-3 py-1", modo === m ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}>{r}</button>
                ))}
              </div>
              {modo === "testar" && <button type="button" onClick={() => setReinicio((n) => n + 1)} className="flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground hover:bg-muted"><RotateCcw className="h-3 w-3" />Recomeçar</button>}
              {modo === "vivo" && <span className="text-muted-foreground">segue a etapa escolhida</span>}
            </div>
            <div className="flex min-h-[560px] w-full flex-1 justify-center lg:min-h-0">
              <MolduraCelular escuro={false}>
                <PreviaIframe>{modo === "vivo" ? <PreviaChatbot config={config} foco={focoValido} /> : <ChatbotPlayer key={reinicio} config={config} rapido />}</PreviaIframe>
              </MolduraCelular>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// A prévia roda dentro do iframe do celular: ocupa a altura toda da tela.
function PreviaIframe({ children }: { children: React.ReactNode }) {
  return <div className="-mx-5 -mb-6 -mt-7 flex h-screen flex-1 flex-col">{children}</div>;
}

function Secao({ titulo, dica, children }: { titulo: string; dica?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 rounded-xl border bg-card p-3">
      <h2 className="font-semibold">{titulo}</h2>
      {dica && <p className="text-xs text-muted-foreground">{dica}</p>}
      {children}
    </section>
  );
}
function Rotulo({ r, children }: { r: string; children: React.ReactNode }) {
  return <label className="block space-y-1"><span className="text-xs font-medium text-muted-foreground">{r}</span>{children}</label>;
}

function CartaoEtapa({ etapa, indice, total, onMudar, onMover, onExcluir }: {
  etapa: EtapaChatbot; indice: number; total: number; onMudar: (f: (e: EtapaChatbot) => void) => void; onMover: (d: -1 | 1) => void; onExcluir: () => void;
}) {
  const temOpcoes = etapa.tipo === "escolha" || etapa.tipo === "lista";
  return (
    <div className="space-y-2 rounded-lg border bg-background p-2.5">
      <div className="flex items-center gap-1.5">
        <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-primary/10 px-1.5 text-xs font-bold text-primary">{indice + 1}</span>
        <select className={cn(campo, "w-auto")} value={etapa.tipo} onChange={(e) => onMudar((x) => { x.tipo = e.target.value as TipoEtapa; if ((x.tipo === "escolha" || x.tipo === "lista") && !x.opcoes?.length) x.opcoes = [{ texto: "Opção 1", pontos: 0 }, { texto: "Opção 2", pontos: 0 }]; })}>
          {(Object.keys(ROTULO_TIPO) as TipoEtapa[]).map((t) => <option key={t} value={t}>{ROTULO_TIPO[t]}</option>)}
        </select>
        {etapa.tipo !== "nenhum" && <input className={cn(campo, "w-32")} title="Nome da resposta (usada em {chave})" value={etapa.chave} onChange={(e) => onMudar((x) => { x.chave = e.target.value.replace(/[^a-z0-9_]/gi, "").toLowerCase(); })} />}
        <span className="ml-auto flex">
          <button type="button" disabled={indice === 0} onClick={() => onMover(-1)} className="rounded p-1 hover:bg-muted disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
          <button type="button" disabled={indice === total - 1} onClick={() => onMover(1)} className="rounded p-1 hover:bg-muted disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
          <button type="button" onClick={onExcluir} className="rounded p-1 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
        </span>
      </div>
      <Rotulo r="Mensagens do bot (uma por linha; cada linha vira um balão)">
        <Textarea rows={Math.min(6, Math.max(2, etapa.mensagens.length + 1))} className="text-sm" value={etapa.mensagens.join("\n")}
          onChange={(e) => onMudar((x) => { x.mensagens = e.target.value.split("\n"); })} onBlur={() => onMudar((x) => { x.mensagens = x.mensagens.filter((m) => m.trim()); })} />
      </Rotulo>
      {(etapa.tipo === "texto" || etapa.tipo === "whatsapp" || etapa.tipo === "email" || etapa.tipo === "lista") && (
        <div className="grid gap-2 sm:grid-cols-2">
          <Rotulo r="Rótulo do campo"><input className={campo} value={etapa.rotulo ?? ""} onChange={(e) => onMudar((x) => { x.rotulo = e.target.value; })} /></Rotulo>
          {etapa.tipo !== "lista" && <Rotulo r="Texto de exemplo"><input className={campo} value={etapa.placeholder ?? ""} onChange={(e) => onMudar((x) => { x.placeholder = e.target.value; })} /></Rotulo>}
        </div>
      )}
      {temOpcoes && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Opções (e os pontos que cada uma dá)</p>
          {(etapa.opcoes ?? []).map((o, k) => (
            <div key={k} className="flex items-center gap-1.5">
              <input className={campo} value={o.texto} onChange={(e) => onMudar((x) => { x.opcoes![k].texto = e.target.value; })} />
              <input type="number" title="Pontos" className={cn(campo, "w-16 shrink-0")} value={o.pontos ?? 0} onChange={(e) => onMudar((x) => { x.opcoes![k].pontos = Number(e.target.value) || 0; })} />
              <button type="button" disabled={(etapa.opcoes?.length ?? 0) <= 2} onClick={() => onMudar((x) => { x.opcoes!.splice(k, 1); })} className="rounded p-1 text-muted-foreground hover:text-rose-600 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => onMudar((x) => { x.opcoes!.push({ texto: `Opção ${(x.opcoes?.length ?? 0) + 1}`, pontos: 0 }); })}><Plus className="h-3.5 w-3.5" />Opção</Button>
        </div>
      )}
    </div>
  );
}

function FimEditor({ titulo, d, onMudar }: { titulo: string; d: DesfechoChatbot; onMudar: (f: (d: DesfechoChatbot) => void) => void }) {
  return (
    <div className="space-y-2 rounded-lg border bg-background p-2.5">
      <p className="text-sm font-medium">{titulo}</p>
      <Rotulo r="Mensagens (uma por linha)"><Textarea rows={3} className="text-sm" value={d.mensagens.join("\n")} onChange={(e) => onMudar((x) => { x.mensagens = e.target.value.split("\n"); })} onBlur={() => onMudar((x) => { x.mensagens = x.mensagens.filter((m) => m.trim()); })} /></Rotulo>
      <div className="grid gap-2 sm:grid-cols-2">
        <Rotulo r="Texto do botão"><input className={campo} value={d.botao_texto ?? ""} onChange={(e) => onMudar((x) => { x.botao_texto = e.target.value; })} /></Rotulo>
        <Rotulo r="Link do botão (WhatsApp, grupo, agenda…)"><input className={campo} placeholder="https://wa.me/55…" value={d.botao_url ?? ""} onChange={(e) => onMudar((x) => { x.botao_url = e.target.value; })} /></Rotulo>
      </div>
    </div>
  );
}

function LeadsChatbot({ bot }: { bot: ChatbotResumo }) {
  const [leads, setLeads] = useState<LeadChatbot[] | null>(null);
  useEffect(() => {
    void db.from("chatbot_leads").select("id, chatbot_id, dados, etapa, score, desfecho, nome, email, whatsapp, utm, criada_em, atualizada_em")
      .eq("chatbot_id", bot.id).order("criada_em", { ascending: false }).limit(1000).then(({ data }) => setLeads((data ?? []) as LeadChatbot[]));
  }, [bot.id]);
  const total = bot.config.etapas.length;
  const resumo = useMemo(() => {
    const l = leads ?? [];
    return { todos: l.length, qualificados: l.filter((x) => x.desfecho === "qualificado").length, completos: l.filter((x) => x.desfecho).length };
  }, [leads]);
  if (!leads) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (!leads.length) return <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">Nenhum lead ainda. Publique e divulgue o link.</div>;
  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
      <p className="text-sm text-muted-foreground">{resumo.todos} pessoas começaram · {resumo.completos} terminaram · <b className="text-foreground">{resumo.qualificados} alto potencial</b></p>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr>{["Quando", "Nome", "WhatsApp", "E-mail", "Instagram", "Pontos", "Resultado", "Origem"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{format(new Date(l.criada_em), "d MMM HH:mm", { locale: ptBR })}</td>
                <td className="px-3 py-2 font-medium">{l.nome || "—"}</td>
                <td className="px-3 py-2">{l.whatsapp ? <button type="button" className="text-primary hover:underline" onClick={() => void abrirLinkExterno(`https://wa.me/55${l.whatsapp!.replace(/\D/g, "")}`)}>{l.whatsapp}</button> : "—"}</td>
                <td className="px-3 py-2">{l.email || "—"}</td>
                <td className="px-3 py-2">{l.dados.instagram ? `@${l.dados.instagram}` : "—"}</td>
                <td className="px-3 py-2 tabular-nums">{l.score}</td>
                <td className="px-3 py-2"><span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", l.desfecho === "qualificado" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : l.desfecho ? "bg-zinc-500/15" : "bg-amber-500/15 text-amber-700 dark:text-amber-300")}>{l.desfecho === "qualificado" ? "Alto potencial" : l.desfecho ? "Não qualificado" : `Parou na etapa ${l.etapa}/${total}`}</span></td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{l.utm?.utm_source ? `${l.utm.utm_source}${l.utm.utm_campaign ? ` · ${l.utm.utm_campaign}` : ""}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
