import { useMemo, useState } from "react";
import { Loader2, Play, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { telefoneWa } from "@/lib/quiz/x1";
import type { ExecucaoWa, LeadFluxoWa } from "./FluxosWhatsapp";

const ATIVAS = ["iniciar", "rodando", "aguardando_resposta", "aguardando_tempo", "pausado"];
const RESPONDEU = (x: ExecucaoWa) => (x.historico ?? []).some((h) => h.tipo.startsWith("resposta:"));
const ESTADO: Record<string, string> = { iniciar: "Vai começar", rodando: "Enviando", aguardando_resposta: "Esperando resposta", aguardando_tempo: "Esperando o tempo", pausado: "Pausado", fim: "Concluiu", parado: "Parado", erro: "Erro" };
const hora = (ms: number) => new Date(ms).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Painel à esquerda do editor do fluxo do WhatsApp: números gerais, quem vai receber (com "Disparar agora") e quem já está no fluxo. */
export function LeadsDoFluxoWa({ fluxoId, ativo, gatilho, esperaMin, quizId, ativadoEm, leads, execs, disparar }: {
  fluxoId: string; ativo: boolean; gatilho: string; esperaMin: number; quizId: string | null; ativadoEm: string | null;
  leads: LeadFluxoWa[]; execs: ExecucaoWa[]; disparar: (leadIds: string[]) => Promise<void>;
}) {
  const [aba, setAba] = useState<"receber" | "fluxo" | "fim">("receber");
  const [busca, setBusca] = useState("");
  const [enviando, setEnviando] = useState<string | null>(null);
  const minhas = useMemo(() => execs.filter((x) => x.fluxo_id === fluxoId), [execs, fluxoId]);
  const porLead = useMemo(() => new Map(minhas.map((x) => [x.resposta_id, x])), [minhas]);
  const nomeDe = (l: LeadFluxoWa) => l.nome?.trim() || l.whatsapp || l.email || "Sem nome";
  const resumo = useMemo(() => ({
    disparados: minhas.length,
    andamento: minhas.filter((x) => ATIVAS.includes(x.estado)).length,
    fim: minhas.filter((x) => x.estado === "fim").length,
    responderam: minhas.filter(RESPONDEU).length,
    erro: minhas.filter((x) => x.estado === "erro").length,
  }), [minhas]);

  const aReceber = useMemo(() => leads.filter((l) => {
    if (porLead.has(l.id) || !telefoneWa(l.whatsapp)) return false;
    if (quizId && l.quiz_id !== quizId) return false;
    if (gatilho !== "manual" && (!ativadoEm || Date.parse(l.criada_em) < Date.parse(ativadoEm))) return false;
    return true;
  }), [leads, porLead, quizId, gatilho, ativadoEm]);
  const previsao = (l: LeadFluxoWa) => {
    if (gatilho === "manual") return "Você dispara";
    if (!ativo) return "Fluxo desligado";
    if (gatilho === "virou_lead" || gatilho === "lead_sem_compra") {
      const t = Date.parse(l.criada_em) + esperaMin * 60000;
      return t > Date.now() ? `Entra ${hora(t)}` : "Entra na próxima rodada";
    }
    return "Quando cumprir o gatilho";
  };

  const lista = useMemo(() => {
    const b = busca.trim().toLowerCase();
    const casa = (l: LeadFluxoWa) => !b || [l.nome, l.email, l.whatsapp].some((v) => (v ?? "").toLowerCase().includes(b));
    if (aba === "receber") return aReceber.filter(casa).map((l) => ({ l, x: undefined as ExecucaoWa | undefined }));
    const pegos = minhas.filter((x) => (aba === "fim" ? !ATIVAS.includes(x.estado) : ATIVAS.includes(x.estado)));
    const mapa = new Map(leads.map((l) => [l.id, l]));
    return pegos.map((x) => ({ l: mapa.get(x.resposta_id), x })).filter((r): r is { l: LeadFluxoWa; x: ExecucaoWa } => !!r.l && casa(r.l));
  }, [aba, busca, aReceber, minhas, leads]);

  const rodar = async (ids: string[], chave: string) => { setEnviando(chave); try { await disparar(ids); } finally { setEnviando(null); } };
  const tile = (v: number, r: string, cor = "text-white") => (<div className="rounded-lg bg-white/5 px-2 py-1.5 text-center"><p className={cn("text-base font-bold", cor)}>{v}</p><p className="text-[10px] text-white/50">{r}</p></div>);

  return (
    <div className="flex min-h-0 flex-col border-r border-white/10 bg-[#0c1b27]">
      <div className="grid grid-cols-4 gap-1.5 p-3">
        {tile(resumo.disparados, "Disparados")}{tile(resumo.andamento, "No fluxo", "text-cyan-200")}{tile(resumo.responderam, "Responderam", "text-emerald-300")}{tile(resumo.fim, "Concluíram")}
      </div>
      {resumo.erro > 0 && <p className="mx-3 mb-2 rounded-md bg-rose-500/15 px-2 py-1 text-[11px] text-rose-200">{resumo.erro} com erro</p>}
      <div className="flex gap-1 px-3 text-xs">
        {([["receber", `A receber (${aReceber.length})`], ["fluxo", `No fluxo (${resumo.andamento})`], ["fim", "Terminaram"]] as const).map(([v, r]) => (
          <button key={v} type="button" onClick={() => setAba(v)} className={cn("flex-1 rounded-md px-1.5 py-1.5", aba === v ? "bg-cyan-400/20 font-semibold text-cyan-100" : "text-white/55 hover:bg-white/5")}>{r}</button>))}
      </div>
      <div className="relative mx-3 mt-2"><Search className="absolute left-2 top-2 h-3.5 w-3.5 text-white/35" /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar lead" className="w-full rounded-md border border-white/10 bg-black/20 py-1.5 pl-7 pr-2 text-xs outline-none" /></div>
      {aba === "receber" && aReceber.length > 0 && (
        <button type="button" disabled={!ativo || !!enviando} onClick={() => void rodar(aReceber.map((l) => l.id), "todos")} title={ativo ? "" : "Ligue o fluxo (Ativo) primeiro"}
          className="mx-3 mt-2 flex items-center justify-center gap-1.5 rounded-md bg-emerald-500 px-2 py-1.5 text-xs font-semibold text-black hover:bg-emerald-400 disabled:opacity-40">
          {enviando === "todos" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}Disparar agora para os {aReceber.length}</button>)}
      <div className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-3">
        {lista.length === 0 && <p className="py-6 text-center text-xs text-white/40">{aba === "receber" ? "Ninguém esperando." : "Ninguém aqui ainda."}</p>}
        {lista.slice(0, 200).map(({ l, x }) => (
          <div key={l.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 text-xs">
            <div className="min-w-0 flex-1"><p className="truncate font-medium">{nomeDe(l)}</p>
              <p className="truncate text-[10px] text-white/45">{x ? `${ESTADO[x.estado] ?? x.estado}${x.estado === "aguardando_tempo" && x.proximo_em ? ` · ${hora(Date.parse(x.proximo_em))}` : ""}${x && RESPONDEU(x) ? " · respondeu" : ""}` : previsao(l)}</p></div>
            {!x && <button type="button" disabled={!ativo || !!enviando} onClick={() => void rodar([l.id], l.id)} title={ativo ? "Entrar no fluxo agora" : "Ligue o fluxo primeiro"} className="flex items-center gap-1 rounded-md border border-emerald-400/40 px-2 py-1 text-emerald-200 hover:bg-emerald-400/10 disabled:opacity-40">
              {enviando === l.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}Disparar</button>}
          </div>))}
      </div>
    </div>);
}
