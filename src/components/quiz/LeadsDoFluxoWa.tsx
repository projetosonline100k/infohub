import { useMemo, useState } from "react";
import { Loader2, Play, RotateCcw, Search, Tag as TagIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { telefoneWa } from "@/lib/quiz/x1";
import type { GrafoFluxo, NoFluxo } from "../../../supabase/functions/_shared/fluxo";
import type { ExecucaoWa, LeadFluxoWa, QuizWa } from "./FluxosWhatsapp";

const ATIVAS = ["iniciar", "rodando", "aguardando_resposta", "aguardando_tempo", "pausado"];
const RESPONDEU = (x: ExecucaoWa) => (x.historico ?? []).some((h) => h.tipo.startsWith("resposta:"));
const ESTADO: Record<string, string> = { iniciar: "Vai começar", rodando: "Enviando", aguardando_resposta: "Esperando resposta", aguardando_tempo: "Esperando o tempo", pausado: "Pausado", fim: "Concluiu", parado: "Parado", erro: "Erro" };
const hora = (ms: number) => new Date(ms).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Painel à esquerda do editor do fluxo do WhatsApp: números gerais, quem vai receber (com "Disparar agora") e quem já está no fluxo. */
export function LeadsDoFluxoWa({ fluxoId, ativo, gatilho, gatilhoTag, esperaMin, quizId, ativadoEm, grafo, leads, execs, quizzes, tagsPorLead, todasTags, disparar, reenviar, mudarTag }: {
  fluxoId: string; ativo: boolean; gatilho: string; gatilhoTag: string | null; esperaMin: number; quizId: string | null; ativadoEm: string | null; grafo: GrafoFluxo;
  leads: LeadFluxoWa[]; execs: ExecucaoWa[]; quizzes: QuizWa[]; tagsPorLead: Map<string, string[]>; todasTags: string[];
  disparar: (leadIds: string[]) => Promise<void>; reenviar: (x: ExecucaoWa) => Promise<void>; mudarTag: (leadIds: string[], tag: string, remover: boolean) => Promise<void>;
}) {
  const [aba, setAba] = useState<"receber" | "base" | "fluxo" | "fim">("receber");
  const [fQuiz, setFQuiz] = useState("");   // "" = todos os quizzes e versões do projeto
  const [fPeriodo, setFPeriodo] = useState("tudo");
  const [fTag, setFTag] = useState("");     // "" = qualquer; "__sem" = sem nenhuma tag
  const [tagNova, setTagNova] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);
  const noDe = (id?: string | null) => grafo.nos.find((n) => n.id === id);
  const rotuloNo = (n?: NoFluxo) => {
    if (!n) return "—";
    const d = n.dados;
    if (n.tipo === "mensagem") return `Mensagem: ${(d.texto ?? "").replace(/\s+/g, " ").trim().slice(0, 60) || "(vazia)"}`;
    if (n.tipo === "midia") return `Mídia: ${d.midia_nome ?? d.midia_tipo ?? ""}`;
    if (n.tipo === "esperar") return `Esperar ${d.minutos ?? 0} min`;
    if (n.tipo === "tag") return `Tag ${d.tag_acao === "remover" ? "tirada" : "posta"}: ${d.tag_nome ?? ""}`;
    if (n.tipo === "condicao") return "Condição";
    if (n.tipo === "fim") return "Fim do fluxo";
    return n.tipo;
  };
  const passosDe = (x: ExecucaoWa) => (x.historico ?? []).map((h) => {
    const n = noDe(h.no);
    if (h.tipo.startsWith("resposta:")) {
      const sid = h.tipo.slice(9), b = (n?.dados.botoes ?? []).find((y) => y.id === sid);
      return { em: h.em, icone: "💬", texto: `Respondeu: ${b ? b.titulo : "outra resposta (texto livre)"}` };
    }
    if (h.tipo === "mensagem") return { em: h.em, icone: h.lida ? "👁" : "✉️", texto: `${rotuloNo(n)}${h.lida ? " · lida" : ""}` };
    if (h.tipo.startsWith("condicao:")) return { em: h.em, icone: "🔀", texto: `Condição: ${h.tipo.endsWith("sim") ? "sim" : "não"}` };
    if (h.tipo === "espera" || h.tipo === "esperou") return { em: h.em, icone: "⏳", texto: rotuloNo(n) };
    return { em: h.em, icone: h.tipo === "fim" ? "🏁" : "•", texto: rotuloNo(n) };
  });
  const ondeEsta = (x: ExecucaoWa) => {
    const ult = (x.historico ?? []).filter((h) => h.tipo !== "fim").slice(-1)[0];
    const id = ATIVAS.includes(x.estado) ? (x.no_atual ?? ult?.no) : ult?.no;
    return rotuloNo(noDe(id));
  };
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

  const quizIdsDe = useMemo(() => {   // um quiz escolhido vale também para as suas versões
    if (!fQuiz) return null;
    return new Set([fQuiz, ...quizzes.filter((q) => q.variante_de === fQuiz).map((q) => q.id)]);
  }, [fQuiz, quizzes]);
  const passaFiltros = (l: LeadFluxoWa) => {
    if (quizIdsDe && !quizIdsDe.has(l.quiz_id)) return false;
    if (fPeriodo !== "tudo") {
      const t = Date.parse(l.criada_em), dia = 86400000, hoje0 = new Date().setHours(0, 0, 0, 0);
      if (fPeriodo === "hoje" && t < hoje0) return false;
      if (fPeriodo === "7" && t < Date.now() - 7 * dia) return false;
      if (fPeriodo === "30" && t < Date.now() - 30 * dia) return false;
      if (fPeriodo === "antigos" && t >= Date.now() - 30 * dia) return false;
    }
    const tg = tagsPorLead.get(l.id) ?? [];
    if (fTag === "__sem" ? tg.length > 0 : fTag ? !tg.includes(fTag) : false) return false;
    return true;
  };
  const bloqueado = (l: LeadFluxoWa) => (tagsPorLead.get(l.id) ?? []).includes("nao-receber");
  const validos = useMemo(() => leads.filter((l) => !porLead.has(l.id) && !!telefoneWa(l.whatsapp)), [leads, porLead]);
  // "A receber": quem o fluxo vai pegar sozinho (pelo gatilho). "Base": qualquer lead que ainda não passou por este fluxo, de qualquer dia e quiz.
  const aReceber = useMemo(() => validos.filter((l) => {
    if (bloqueado(l)) return false;
    if (quizId && l.quiz_id !== quizId && !quizzes.some((q) => q.id === l.quiz_id && q.variante_de === quizId)) return false;
    if (gatilho === "tag") return !!gatilhoTag && (tagsPorLead.get(l.id) ?? []).includes(gatilhoTag.toLowerCase());
    if (gatilho !== "manual" && (!ativadoEm || Date.parse(l.criada_em) < Date.parse(ativadoEm))) return false;
    return gatilho !== "manual";
  }), [validos, quizId, quizzes, gatilho, gatilhoTag, ativadoEm, tagsPorLead]); // eslint-disable-line react-hooks/exhaustive-deps
  const previsao = (l: LeadFluxoWa) => {
    if (gatilho === "manual") return "Você dispara";
    if (gatilho === "tag") return ativo ? "Entra em instantes (tem a tag)" : "Fluxo desligado";
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
    if (aba === "receber") return aReceber.filter((l) => casa(l) && passaFiltros(l)).map((l) => ({ l, x: undefined as ExecucaoWa | undefined }));
    if (aba === "base") return validos.filter((l) => casa(l) && passaFiltros(l)).map((l) => ({ l, x: undefined as ExecucaoWa | undefined }));
    const pegos = minhas.filter((x) => (aba === "fim" ? !ATIVAS.includes(x.estado) : ATIVAS.includes(x.estado)));
    const mapa = new Map(leads.map((l) => [l.id, l]));
    return pegos.map((x) => ({ l: mapa.get(x.resposta_id), x })).filter((r): r is { l: LeadFluxoWa; x: ExecucaoWa } => !!r.l && casa(r.l));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba, busca, aReceber, validos, minhas, leads, fQuiz, fPeriodo, fTag, tagsPorLead, quizIdsDe]);
  const alvos = useMemo(() => lista.filter(({ l, x }) => !x && !bloqueado(l)).map(({ l }) => l.id), [lista]); // eslint-disable-line react-hooks/exhaustive-deps

  const rodar = async (ids: string[], chave: string, outra?: () => Promise<void>) => { setEnviando(chave); try { await (outra ? outra() : disparar(ids)); } finally { setEnviando(null); } };
  const tile = (v: number, r: string, cor = "text-white") => (<div className="rounded-lg bg-white/5 px-2 py-1.5 text-center"><p className={cn("text-base font-bold", cor)}>{v}</p><p className="text-[10px] text-white/50">{r}</p></div>);

  return (
    <div className="flex min-h-0 flex-col border-r border-white/10 bg-[#0c1b27]">
      <div className="grid grid-cols-4 gap-1.5 p-3">
        {tile(resumo.disparados, "Disparados")}{tile(resumo.andamento, "No fluxo", "text-cyan-200")}{tile(resumo.responderam, "Responderam", "text-emerald-300")}{tile(resumo.fim, "Concluíram")}
      </div>
      {resumo.erro > 0 && <p className="mx-3 mb-2 rounded-md bg-rose-500/15 px-2 py-1 text-[11px] text-rose-200">{resumo.erro} com erro</p>}
      <div className="flex gap-1 px-3 text-xs">
        {([["receber", `A receber (${aReceber.length})`], ["base", `Base (${validos.length})`], ["fluxo", `No fluxo (${resumo.andamento})`], ["fim", "Fim"]] as const).map(([v, r]) => (
          <button key={v} type="button" onClick={() => setAba(v)} className={cn("flex-1 rounded-md px-1 py-1.5", aba === v ? "bg-cyan-400/20 font-semibold text-cyan-100" : "text-white/55 hover:bg-white/5")}>{r}</button>))}
      </div>
      <div className="relative mx-3 mt-2"><Search className="absolute left-2 top-2 h-3.5 w-3.5 text-white/35" /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar lead" className="w-full rounded-md border border-white/10 bg-black/20 py-1.5 pl-7 pr-2 text-xs outline-none" /></div>
      {(aba === "receber" || aba === "base") && (
        <div className="mx-3 mt-2 grid grid-cols-2 gap-1.5 text-[11px]">
          <select value={fQuiz} onChange={(e) => setFQuiz(e.target.value)} className="col-span-2 rounded-md border border-white/10 bg-black/30 px-1.5 py-1.5"><option value="">Todos os quizzes e versões</option>{quizzes.filter((q) => !q.variante_de).map((q) => <option key={q.id} value={q.id}>{q.titulo} (e versões)</option>)}</select>
          <select value={fPeriodo} onChange={(e) => setFPeriodo(e.target.value)} className="rounded-md border border-white/10 bg-black/30 px-1.5 py-1.5"><option value="tudo">Qualquer dia</option><option value="hoje">Hoje</option><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="antigos">Mais de 30 dias</option></select>
          <select value={fTag} onChange={(e) => setFTag(e.target.value)} className="rounded-md border border-white/10 bg-black/30 px-1.5 py-1.5"><option value="">Qualquer tag</option><option value="__sem">Sem tag</option>{todasTags.map((t) => <option key={t} value={t}>{t}</option>)}</select>
        </div>)}
      {(aba === "receber" || aba === "base") && alvos.length > 0 && (
        <div className="mx-3 mt-2 space-y-1.5">
          <button type="button" disabled={!ativo || !!enviando} onClick={() => void rodar(alvos, "todos")} title={ativo ? "" : "Ligue o fluxo (Ativo) primeiro"}
            className="flex w-full items-center justify-center gap-1.5 rounded-md bg-emerald-500 px-2 py-1.5 text-xs font-semibold text-black hover:bg-emerald-400 disabled:opacity-40">
            {enviando === "todos" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}Disparar agora para os {alvos.length}</button>
          <div className="flex gap-1">
            <input list="tags-painel" value={tagNova} onChange={(e) => setTagNova(e.target.value.toLowerCase().slice(0, 40))} placeholder="tag para os filtrados" className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/20 px-2 py-1.5 text-xs outline-none" />
            <datalist id="tags-painel">{["nao-receber", ...todasTags.filter((t) => t !== "nao-receber")].map((t) => <option key={t} value={t} />)}</datalist>
            <button type="button" disabled={!tagNova.trim() || !!enviando} onClick={() => void rodar([], "tag", () => mudarTag(lista.map(({ l }) => l.id), tagNova.trim(), false))} className="rounded-md border border-pink-300/40 px-2 text-pink-200 hover:bg-pink-300/10 disabled:opacity-40" title="Pôr a tag em todos os filtrados">+ tag</button>
            <button type="button" disabled={!tagNova.trim() || !!enviando} onClick={() => void rodar([], "tag", () => mudarTag(lista.map(({ l }) => l.id), tagNova.trim(), true))} className="rounded-md border border-white/15 px-2 text-white/60 hover:bg-white/5 disabled:opacity-40" title="Tirar a tag de todos os filtrados">− tag</button>
          </div>
        </div>)}
      <div className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-3">
        {lista.length === 0 && <p className="py-6 text-center text-xs text-white/40">{aba === "receber" ? "Ninguém esperando. Em “Base” estão os leads de outros dias." : "Ninguém aqui."}</p>}
        {lista.slice(0, 200).map(({ l, x }) => (
          <div key={l.id + (x?.id ?? "")} className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 text-xs">
            <div className={cn("min-w-0 flex-1", x && "cursor-pointer")} onClick={() => x && setAberto(aberto === x.id ? null : x.id)}><p className="truncate font-medium">{nomeDe(l)}</p>
              <p className="truncate text-[10px] text-white/45">{x ? `${ESTADO[x.estado] ?? x.estado}${x.estado === "aguardando_tempo" && x.proximo_em ? ` · ${hora(Date.parse(x.proximo_em))}` : ""}${RESPONDEU(x) ? " · respondeu" : ""}` : bloqueado(l) ? "Não receber" : `${hora(Date.parse(l.criada_em))} · ${previsao(l)}`}</p>
              {x && <p className="mt-0.5 text-[10px] text-cyan-200/80">{ATIVAS.includes(x.estado) ? "Está em" : "Parou em"}: {ondeEsta(x)}</p>}
              {x && aberto === x.id && (
                <ol className="mt-1.5 space-y-1 border-l border-white/15 pl-2.5">
                  {passosDe(x).map((p, i) => (<li key={i} className="text-[10px] leading-snug text-white/70"><span className="mr-1">{p.icone}</span>{p.texto}<span className="ml-1 text-white/35">{p.em ? hora(Date.parse(p.em)) : ""}</span></li>))}
                  {x.motivo && <li className="text-[10px] text-rose-200">{x.motivo}</li>}
                </ol>)}
              {x && aberto !== x.id && <p className="text-[10px] text-white/30">Toque para ver o caminho e as respostas</p>}
              {(tagsPorLead.get(l.id) ?? []).length > 0 && <div className="mt-0.5 flex flex-wrap gap-1">{(tagsPorLead.get(l.id) ?? []).map((t) => (
                <span key={t} className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px]", t === "nao-receber" ? "bg-rose-500/20 text-rose-200" : "bg-pink-300/15 text-pink-100")}><TagIcon className="h-2.5 w-2.5" />{t}
                  <button type="button" title="Tirar esta tag" onClick={() => void mudarTag([l.id], t, true)}><X className="h-2.5 w-2.5 opacity-60 hover:opacity-100" /></button></span>))}</div>}</div>
            {!x && !bloqueado(l) && <button type="button" disabled={!ativo || !!enviando} onClick={() => void rodar([l.id], l.id)} title={ativo ? "Entrar no fluxo agora" : "Ligue o fluxo primeiro"} className="flex items-center gap-1 rounded-md border border-emerald-400/40 px-2 py-1 text-emerald-200 hover:bg-emerald-400/10 disabled:opacity-40">
              {enviando === l.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}Disparar</button>}
            {x && <button type="button" disabled={!!enviando} onClick={() => void rodar([], x.id, () => reenviar(x))} title="Começar o fluxo de novo para este lead" className="flex items-center gap-1 rounded-md border border-cyan-300/40 px-2 py-1 text-cyan-100 hover:bg-cyan-300/10 disabled:opacity-40">
              {enviando === x.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}Reenviar</button>}
          </div>))}
        {lista.length > 200 && <p className="py-2 text-center text-[10px] text-white/35">Mostrando 200 de {lista.length}. Use os filtros.</p>}
      </div>
    </div>);
}
