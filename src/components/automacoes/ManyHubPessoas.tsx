import { useEffect, useMemo, useRef, useState } from "react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, Bot, CheckCircle2, Clock, Loader2, MessageCircle, MousePointerClick, Search, Send, UserRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { funilDoFluxo, montarPessoas, podeResponder, type DisparoMH, type PessoaMH, type SituacaoPessoa } from "@/lib/automacoes/manyhub";
import { useConversaMH, useManyHubDados } from "@/hooks/useManyHubDados";
import type { FluxoInstagram } from "@/hooks/useInstagramFluxos";

// Pessoas do Many Hub (14/11/2026, Davi: "ver os leads, quem avançou, quem não avançou… e um chat para conversar com a pessoa").
// Em cima, o funil do fluxo escolhido (quantos chegaram em cada mensagem e por qual botão seguiram). Embaixo, as pessoas e a conversa de cada uma.
const SIT: Record<SituacaoPessoa, { rotulo: string; cor: string }> = {
  esperando: { rotulo: "Esperando", cor: "bg-sky-500/15 text-sky-300" }, avancou: { rotulo: "Avançou", cor: "bg-emerald-500/15 text-emerald-300" },
  concluiu: { rotulo: "Concluiu", cor: "bg-emerald-500/25 text-emerald-200" }, parou: { rotulo: "Parou", cor: "bg-amber-500/15 text-amber-300" }, erro: { rotulo: "Erro", cor: "bg-rose-500/15 text-rose-300" },
};
const ORIGEM: Record<string, string> = { contato: "Pessoa", fluxo: "Fluxo", automacao: "Automação", davi: "Você", instagram: "Você (app)" };

export function ManyHubPessoas({ igUserId, fluxos, disparos, nomesAutomacao }: { igUserId: string | undefined; fluxos: FluxoInstagram[]; disparos: DisparoMH[]; nomesAutomacao: Map<string, string> }) {
  const dados = useManyHubDados(igUserId);
  const [fluxoSel, setFluxoSel] = useState<string>("");
  const [filtro, setFiltro] = useState<"todas" | SituacaoPessoa>("todas");
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<string | null>(null);

  const fluxoAtual = fluxos.find((f) => f.id === fluxoSel) ?? fluxos[0] ?? null;
  const pessoas = useMemo<PessoaMH[]>(() => montarPessoas(dados.execs, disparos, fluxos.map((f) => ({ id: f.id, nome: f.nome, grafo: f.grafo })), nomesAutomacao)
    .map((p) => ({ ...p, username: p.username ?? dados.contatos.get(p.contatoId)?.username ?? null })), [dados.execs, dados.contatos, disparos, fluxos, nomesAutomacao]);
  const contagem = useMemo(() => { const c: Record<string, number> = { todas: pessoas.length }; for (const p of pessoas) c[p.situacao] = (c[p.situacao] ?? 0) + 1; return c; }, [pessoas]);
  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase().replace(/^@/, "");
    return pessoas.filter((p) => (filtro === "todas" || p.situacao === filtro) && (!t || (p.username ?? "").toLowerCase().includes(t)));
  }, [pessoas, filtro, busca]);
  const pessoa = lista.find((p) => p.contatoId === sel) ?? lista[0] ?? null;
  const funil = useMemo(() => (fluxoAtual ? funilDoFluxo(fluxoAtual.grafo, dados.execs.filter((e) => e.fluxo_id === fluxoAtual.id)) : []), [fluxoAtual, dados.execs]);
  const totalFluxo = fluxoAtual ? dados.execs.filter((e) => e.fluxo_id === fluxoAtual.id).length : 0;

  if (!igUserId) return <Card className="p-8 text-center text-sm text-muted-foreground">Conecte uma conta do Instagram para ver as pessoas.</Card>;
  if (!dados.carregou) return <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      {fluxoAtual && (
        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-sm font-semibold">Funil do fluxo</h3>
            <select value={fluxoAtual.id} onChange={(e) => setFluxoSel(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2 text-sm">{fluxos.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select>
            <span className="text-xs text-muted-foreground">{totalFluxo} pessoa{totalFluxo === 1 ? "" : "s"} entraram</span>
          </div>
          {funil.length === 0 ? <p className="text-sm text-muted-foreground">Este fluxo ainda não tem mensagens ligadas.</p> : (
            <ol className="space-y-2">{funil.map((l, i) => {
              const max = Math.max(1, funil[0].chegaram);
              return (
                <li key={l.no.id} className="space-y-1">
                  <div className="flex items-baseline gap-2 text-sm"><span className="font-semibold">{l.rotulo}</span><span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{(l.no.dados.texto ?? "").slice(0, 70)}</span>
                    <span className="tabular-nums"><b>{l.chegaram}</b> <span className="text-xs text-muted-foreground">chegaram{i > 0 && funil[i - 1].chegaram > 0 ? ` · ${Math.round((l.chegaram / funil[i - 1].chegaram) * 100)}% da anterior` : ""}</span></span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${(l.chegaram / max) * 100}%` }} /></div>
                  {l.ramos.length > 0 && <div className="flex flex-wrap gap-1.5 pl-1 text-[11px]">{l.ramos.map((r) => <span key={r.titulo} className="rounded-full border border-border px-2 py-0.5">{r.titulo}: <b>{r.n}</b></span>)}<span className="text-muted-foreground">{l.responderam} responderam de {l.chegaram}</span></div>}
                </li>);
            })}</ol>)}
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {([["todas", "Todas"], ["esperando", "Esperando"], ["avancou", "Avançaram"], ["concluiu", "Concluíram"], ["parou", "Pararam"], ["erro", "Com erro"]] as const).map(([k, r]) => (
          <button key={k} type="button" onClick={() => setFiltro(k)} className={cn("rounded-full border px-3 py-1", filtro === k ? "border-primary bg-primary/10 font-semibold" : "text-muted-foreground hover:bg-muted")}>{r} <span className="tabular-nums">{contagem[k] ?? 0}</span></button>))}
      </div>

      <div className="grid min-h-[520px] overflow-hidden rounded-2xl border border-white/10 bg-[#0b141a] text-white lg:grid-cols-[340px_minmax(0,1fr)]">
        <section className="flex min-h-0 flex-col border-b border-white/10 bg-[#111b21] lg:border-b-0 lg:border-r">
          <div className="border-b border-white/10 p-2.5"><div className="relative"><Search className="absolute left-2.5 top-2 h-4 w-4 text-white/40" /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar @usuário" className="w-full rounded-lg bg-[#202c33] py-1.5 pl-8 pr-3 text-sm outline-none placeholder:text-white/40" /></div></div>
          <div className="max-h-[560px] min-h-0 flex-1 overflow-y-auto">
            {lista.length === 0 ? <p className="p-6 text-center text-sm text-white/40">Ninguém nesta lista ainda.</p> : lista.map((p) => {
              const u = dados.ultimas.get(p.contatoId);
              return (
                <button key={p.contatoId} type="button" onClick={() => setSel(p.contatoId)} className={cn("flex w-full items-center gap-3 border-b border-white/5 px-3 py-2.5 text-left hover:bg-white/5", pessoa?.contatoId === p.contatoId && "bg-[#2a3942]")}>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#6b7c85] font-bold">{(p.username ?? "?").slice(0, 1).toUpperCase()}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2"><span className="min-w-0 flex-1 truncate font-medium">{p.username ? `@${p.username}` : "Alguém"}</span><span className="shrink-0 text-[11px] text-white/45">{formatDistanceToNowStrict(new Date(p.ultimaEm), { locale: ptBR })}</span></span>
                    <span className="mt-0.5 flex items-center gap-1.5"><span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", SIT[p.situacao].cor)}>{SIT[p.situacao].rotulo}</span><span className="truncate text-xs text-white/50">{u ? `${u.de_mim ? "Você: " : ""}${u.texto ?? ""}` : p.resumo}</span></span>
                  </span>
                </button>);
            })}
          </div>
        </section>

        <section className="flex min-h-0 min-w-0 flex-col">
          {pessoa ? <Conversa igUserId={igUserId} pessoa={pessoa} onEnviou={() => void dados.recarregar()} /> : <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-[#222e35] p-6 text-center text-white/45"><MessageCircle className="h-10 w-10 opacity-40" /><p className="text-sm">Escolha uma pessoa para ver a conversa.</p></div>}
        </section>
      </div>
    </div>
  );
}

function Conversa({ igUserId, pessoa, onEnviou }: { igUserId: string; pessoa: PessoaMH; onEnviou: () => void }) {
  const { msgs, carregando, recarregar } = useConversaMH(igUserId, pessoa.contatoId);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const janela = podeResponder(msgs);
  useEffect(() => { fim.current?.scrollIntoView({ block: "end" }); }, [msgs.length, pessoa.contatoId]);
  useEffect(() => setTexto(""), [pessoa.contatoId]);

  const enviar = async () => {
    const t = texto.trim();
    if (!t || enviando || !janela.pode) return;
    setEnviando(true);
    const { error } = await supabase.functions.invoke("instagram-automacoes/enviar", { body: { ig_user_id: igUserId, contato_id: pessoa.contatoId, texto: t } });
    setEnviando(false);
    if (error) {
      let msg = "Não consegui enviar";
      try { const j = await (error as unknown as { context: Response }).context.json(); msg = j.error ?? msg; } catch { /* sem detalhe */ }
      toast.error(msg); return;
    }
    setTexto(""); await recarregar(); onEnviou();
    toast.success("Enviado. O fluxo parou de falar com essa pessoa: agora a conversa é sua.");
  };
  const dias = msgs.reduce<{ dia: string; m: typeof msgs }[]>((a, m) => { const d = format(new Date(m.enviada_em), "yyyy-MM-dd"); const u = a.at(-1); if (u?.dia === d) u.m.push(m); else a.push({ dia: d, m: [m] }); return a; }, []);

  return (
    <>
      <header className="flex flex-wrap items-center gap-3 bg-[#202c33] px-4 py-2.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#6b7c85] font-bold">{(pessoa.username ?? "?").slice(0, 1).toUpperCase()}</span>
        <div className="min-w-0 flex-1"><p className="truncate font-semibold">{pessoa.username ? `@${pessoa.username}` : "Alguém"}</p><p className="truncate text-xs text-white/55">{pessoa.origem.tipo === "fluxo" ? "Fluxo" : "Automação"}: {pessoa.origem.nome}</p></div>
        <span className={cn("flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", SIT[pessoa.situacao].cor)}>{pessoa.situacao === "concluiu" ? <CheckCircle2 className="h-3 w-3" /> : pessoa.situacao === "erro" ? <AlertTriangle className="h-3 w-3" /> : pessoa.situacao === "esperando" ? <Clock className="h-3 w-3" /> : null}{SIT[pessoa.situacao].rotulo}</span>
        {pessoa.clicou && <span className="flex items-center gap-1 rounded-full bg-fuchsia-500/20 px-2.5 py-1 text-xs font-semibold text-fuchsia-200"><MousePointerClick className="h-3 w-3" />Clicou no link</span>}
      </header>
      <p className="border-b border-white/10 bg-[#182229] px-4 py-1.5 text-xs text-white/65">{pessoa.resumo}</p>
      <div className="min-h-0 flex-1 overflow-y-auto bg-[#0b141a] px-4 py-3">
        <div className="mx-auto flex max-w-2xl flex-col gap-1.5">
          {carregando && msgs.length === 0 ? <Loader2 className="mx-auto my-6 h-5 w-5 animate-spin text-white/40" /> : msgs.length === 0 ? (
            <p className="mx-auto max-w-sm rounded-lg bg-[#182229] px-3 py-2 text-center text-xs text-white/55">As conversas passam a aparecer aqui a partir de 14/11 (o Many Hub ainda não guardava as mensagens). As próximas desta pessoa entram sozinhas.</p>
          ) : dias.map((d) => (
            <div key={d.dia} className="contents">
              <p className="mx-auto my-1 rounded-lg bg-[#182229] px-3 py-1 text-[11px] text-white/55">{format(new Date(`${d.dia}T12:00:00`), "d 'de' MMMM", { locale: ptBR })}</p>
              {d.m.map((m) => (
                <div key={m.id} className={cn("max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3 py-1.5 text-[14.5px] shadow", m.de_mim ? "ml-auto rounded-tr-none bg-[#005c4b]" : "mr-auto rounded-tl-none bg-[#202c33]")}>
                  {(m.de_mim || m.tipo === "comentario") && <span className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-200/70">{m.origem === "fluxo" || m.origem === "automacao" ? <Bot className="h-3 w-3" /> : m.de_mim ? <UserRound className="h-3 w-3" /> : null}{m.tipo === "comentario" ? "Comentou" : ORIGEM[m.origem] ?? m.origem}</span>}
                  {m.texto}
                  <span className="ml-3 inline-block translate-y-1 text-[10.5px] text-white/55">{format(new Date(m.enviada_em), "HH:mm")}</span>
                </div>))}
            </div>))}
          <div ref={fim} />
        </div>
      </div>
      <footer className="space-y-1.5 bg-[#202c33] p-3">
        {!janela.pode && <p className="rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200">{janela.ate ? "A janela de 24 h da Meta fechou: só dá para responder até 24 h depois da última mensagem da pessoa." : "Ainda não há mensagem dela guardada. Quando ela escrever, você poderá responder por aqui."}</p>}
        <div className="flex items-end gap-2">
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} disabled={!janela.pode} placeholder={janela.pode ? "Escreva a resposta (Enter envia, Shift+Enter quebra a linha)" : "Resposta indisponível"}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void enviar(); } }}
            className="min-h-0 flex-1 resize-none rounded-xl bg-[#2a3942] px-3.5 py-2 text-[14.5px] text-white outline-none placeholder:text-white/40 disabled:opacity-50" />
          <button type="button" disabled={!texto.trim() || enviando || !janela.pode} onClick={() => void enviar()} className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-[#00a884] px-4 text-sm font-semibold text-white hover:bg-[#019c7a] disabled:opacity-40">
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Enviar</button>
        </div>
        {janela.pode && janela.ate && <p className="text-[11px] text-white/40">Dá para responder até {format(new Date(janela.ate), "dd/MM 'às' HH:mm")}. Ao responder, o fluxo deixa de falar com essa pessoa.</p>}
      </footer>
    </>
  );
}
