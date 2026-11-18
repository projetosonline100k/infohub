import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Loader2, Pencil, Plus, Trash2, Workflow } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { confirmar } from "@/components/DialogosGlobais";
import { FluxoEditor, TIPOS_GATILHO_WA, type GatilhoWa } from "@/components/automacoes/FluxoEditor";
import { LeadsDoFluxoWa } from "./LeadsDoFluxoWa";
import type { FluxoInstagram, NumerosDoNo } from "@/hooks/useInstagramFluxos";
import type { GrafoFluxo } from "../../../supabase/functions/_shared/fluxo";

const db = supabase as unknown as SupabaseClient;
interface FluxoWa { id: string; nome: string; ativo: boolean; grafo: GrafoFluxo; disparos: number; atualizado_em: string; gatilho: GatilhoWa["tipo"]; gatilho_espera_min: number; gatilho_quiz_id: string | null; ativado_em: string | null; gatilho_tag: string | null }
export interface QuizWa { id: string; titulo: string; variante_de: string | null }
export interface ExecucaoWa { id: string; fluxo_id: string; resposta_id: string; estado: string; no_atual: string | null; proximo_em: string | null; motivo?: string | null; criado_em: string; historico: { no: string; tipo: string; em: string; lida?: boolean }[] | null }
export interface LeadFluxoWa { id: string; quiz_id: string; nome: string | null; email: string | null; whatsapp: string | null; criada_em: string }

// Fluxos de mensagem do WhatsApp (15/11/2026, Davi: "criar fluxos de mensagens também no WhatsApp, tipo o Many Hub"): a mesma tela de blocos do Many Hub,
// guardada em whatsapp_fluxos. Quem anda pelos blocos é o robô do Mac (scripts/fluxo_whatsapp.py) quando você clica em "Iniciar fluxo" no chat de um lead.
export function FluxosWhatsapp({ quizId }: { quizId: string }) {
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [fluxos, setFluxos] = useState<FluxoWa[] | null>(null);
  const [quizzes, setQuizzes] = useState<{ id: string; titulo: string }[]>([]);
  const [todosQuizzes, setTodosQuizzes] = useState<QuizWa[]>([]);
  const [editando, setEditando] = useState<FluxoWa | "novo" | null>(null);

  const carregar = useCallback(async () => {
    const { data: q } = await db.from("quizzes").select("cliente_id").eq("id", quizId).maybeSingle();
    const cid = (q as { cliente_id: string } | null)?.cliente_id ?? null;
    setClienteId(cid);
    if (!cid) return;
    const { data } = await db.from("whatsapp_fluxos").select("id, nome, ativo, grafo, disparos, atualizado_em, gatilho, gatilho_espera_min, gatilho_quiz_id, ativado_em, gatilho_tag").eq("cliente_id", cid).order("criado_em", { ascending: false });
    setFluxos((data ?? []) as FluxoWa[]);
    const { data: qs } = await db.from("quizzes").select("id, titulo").eq("cliente_id", cid).is("variante_de", null).neq("status", "cancelado").order("criado_em", { ascending: false });
    setQuizzes((qs ?? []) as { id: string; titulo: string }[]);
    const { data: tq } = await db.from("quizzes").select("id, titulo, variante_de").eq("cliente_id", cid).neq("status", "cancelado");
    setTodosQuizzes((tq ?? []) as QuizWa[]);
  }, [quizId]);
  useEffect(() => { void carregar(); }, [carregar]);

  // Execuções (quem está/esteve em cada fluxo) e leads do projeto: base dos números por bloco e do painel "A receber". Atualiza a cada 8 s com o editor aberto.
  const [execs, setExecs] = useState<ExecucaoWa[]>([]);
  const [leads, setLeads] = useState<LeadFluxoWa[]>([]);
  const [tags, setTags] = useState<{ resposta_id: string; tag: string }[]>([]);
  const tagsPorLead = useMemo(() => { const m = new Map<string, string[]>(); for (const t of tags) m.set(t.resposta_id, [...(m.get(t.resposta_id) ?? []), t.tag]); return m; }, [tags]);
  const todasTags = useMemo(() => [...new Set(tags.map((t) => t.tag))].sort(), [tags]);
  const lerMovimento = useCallback(async () => {
    if (!clienteId) return;
    // o servidor entrega no máximo 1000 linhas por pedido: busca em páginas
    const paginas = async <T,>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null }>, max: number): Promise<T[]> => {
      const tudo: T[] = [];
      for (let de = 0; de < max; de += 1000) { const { data } = await consulta(de, de + 999); tudo.push(...(data ?? [])); if ((data ?? []).length < 1000) break; }
      return tudo;
    };
    const [e, l, tg] = await Promise.all([
      db.from("whatsapp_fluxo_execucoes").select("id, fluxo_id, resposta_id, estado, no_atual, proximo_em, motivo, criado_em, historico").eq("cliente_id", clienteId).order("criado_em", { ascending: false }).limit(2000).then((r) => (r.data ?? []) as ExecucaoWa[]),
      paginas<LeadFluxoWa>((de, ate) => db.from("quiz_respostas").select("id, quiz_id, nome, email, whatsapp, criada_em").eq("cliente_id", clienteId).not("whatsapp", "is", null).order("criada_em", { ascending: false }).range(de, ate), 8000),
      paginas<{ resposta_id: string; tag: string }>((de, ate) => db.from("quiz_lead_tags").select("resposta_id, tag").eq("cliente_id", clienteId).order("criado_em").range(de, ate), 30000),
    ]);
    setExecs(e); setLeads(l); setTags(tg);
  }, [clienteId]);
  useEffect(() => {
    if (!clienteId) return;
    void lerMovimento();
    const t = window.setInterval(() => { if (!document.hidden) void lerMovimento(); }, 20000);
    return () => window.clearInterval(t);
  }, [clienteId, lerMovimento]);
  const numerosDoFluxo = useCallback((fluxoId: string, desde: number | null, ate: number | null): Record<string, NumerosDoNo> => {
    const dentro = (iso?: string | null) => { if (desde === null && ate === null) return true; if (!iso) return false; const t = Date.parse(iso); return (desde === null || t >= desde) && (ate === null || t < ate); };
    const nos: Record<string, NumerosDoNo> = {};
    const ATIVAS = ["iniciar", "rodando", "aguardando_resposta", "aguardando_tempo", "pausado"];
    const no = (id: string) => (nos[id] ??= { enviadas: 0, respostas: 0, rastreadas: 0, abertas: 0, chegaram: 0, aqui: 0, saiu: 0 });
    for (const x of execs) {
      if (x.fluxo_id !== fluxoId) continue;
      const hist = x.historico ?? [];
      const vistos = new Set<string>();
      hist.forEach((h, i) => {
        if (!dentro(h.em)) return;
        const n = no(h.no);
        if (!vistos.has(h.no)) { vistos.add(h.no); n.chegaram = (n.chegaram ?? 0) + 1; }
        if (h.tipo === "mensagem" || h.tipo === "midia") {
          n.enviadas++;
          const respondeu = hist.slice(i + 1).some((y) => y.no === h.no && y.tipo.startsWith("resposta:"));
          if (h.lida === true || respondeu) { n.rastreadas++; n.abertas++; } else if (h.lida === false) n.rastreadas++;
        }
        if (h.tipo.startsWith("resposta:")) n.respostas++;
      });
      // onde a pessoa está agora e onde parou: a última parada do histórico (ou o bloco atual)
      const ult = hist[hist.length - 1];
      if (ATIVAS.includes(x.estado)) { const id = x.no_atual ?? ult?.no; if (id && dentro(x.criado_em)) no(id).aqui = (no(id).aqui ?? 0) + 1; }
      else if ((x.estado === "parado" || x.estado === "erro") && ult && dentro(ult.em)) no(ult.no).saiu = (no(ult.no).saiu ?? 0) + 1;
    }
    return nos;
  }, [execs]);
  const dispararLeads = async (fluxoId: string, ids: string[]) => {
    if (!clienteId || ids.length === 0) return;
    const nome = fluxos?.find((x) => x.id === fluxoId)?.nome ?? "fluxo";
    if (!(await confirmar(`Disparar “${nome}” para ${ids.length} lead${ids.length === 1 ? "" : "s"} agora?`, { botao: "Disparar", destrutivo: false, descricao: "O robô manda a primeira mensagem pelo WhatsApp do projeto e segue o fluxo sozinho." }))) return;
    const { error } = await db.from("whatsapp_fluxo_execucoes").insert(ids.map((id) => ({ fluxo_id: fluxoId, cliente_id: clienteId, resposta_id: id, estado: "iniciar" })));
    if (error) { toast.error("Não consegui disparar: " + error.message); return; }
    toast.success(`${ids.length} lead${ids.length === 1 ? "" : "s"} entrando no fluxo`);
    await lerMovimento();
  };
  // Reenviar: para o que está andando para esse lead (se estiver) e começa o fluxo de novo do início, com a primeira mensagem saindo outra vez.
  const reenviarLead = async (fluxoId: string, x: ExecucaoWa) => {
    if (!clienteId) return;
    const nome = fluxos?.find((f) => f.id === fluxoId)?.nome ?? "fluxo";
    if (!(await confirmar(`Reenviar “${nome}” para este lead?`, { botao: "Reenviar", destrutivo: false, descricao: "O fluxo recomeça do início e a primeira mensagem sai de novo pelo WhatsApp. Se ele estava no meio, esse andamento é encerrado." }))) return;
    if (["iniciar", "rodando", "aguardando_resposta", "aguardando_tempo", "pausado"].includes(x.estado)) {
      const { error: e1 } = await db.from("whatsapp_fluxo_execucoes").update({ estado: "parado", motivo: "Reenviado por você" }).eq("id", x.id);
      if (e1) { toast.error("Não consegui parar o andamento atual: " + e1.message); return; }
    }
    const { error } = await db.from("whatsapp_fluxo_execucoes").insert({ fluxo_id: fluxoId, cliente_id: clienteId, resposta_id: x.resposta_id, estado: "iniciar" });
    if (error) { toast.error("Não consegui reenviar: " + error.message); return; }
    toast.success("Fluxo reenviado: a primeira mensagem sai em instantes");
    await lerMovimento();
  };
  const mudarTag = async (ids: string[], tag: string, remover: boolean) => {
    const t = tag.trim().toLowerCase().slice(0, 40);
    if (!clienteId || !t || ids.length === 0) return;
    if (ids.length > 1 && !(await confirmar(`${remover ? "Tirar" : "Pôr"} a tag “${t}” ${remover ? "de" : "em"} ${ids.length} leads?`, { botao: remover ? "Tirar" : "Pôr a tag", destrutivo: false, descricao: t === "nao-receber" ? "Quem tem “nao-receber” sai de todos os disparos automáticos." : undefined }))) return;
    for (let i = 0; i < ids.length; i += 400) {
      const parte = ids.slice(i, i + 400);
      const { error } = remover
        ? await db.from("quiz_lead_tags").delete().eq("cliente_id", clienteId).eq("tag", t).in("resposta_id", parte)
        : await db.from("quiz_lead_tags").upsert(parte.map((id) => ({ cliente_id: clienteId, resposta_id: id, tag: t })), { onConflict: "resposta_id,tag", ignoreDuplicates: true });
      if (error) { toast.error("Não consegui mexer na tag: " + error.message); return; }
    }
    toast.success(`${remover ? "Tag tirada" : "Tag posta"}: ${t} (${ids.length})`);
    await lerMovimento();
  };
  const editado = editando && editando !== "novo" ? (fluxos?.find((x) => x.id === editando.id) ?? editando) : null;
  const painel = useMemo(() => editado && (
    <LeadsDoFluxoWa fluxoId={editado.id} ativo={editado.ativo} gatilho={editado.gatilho} gatilhoTag={editado.gatilho_tag} quizzes={todosQuizzes} tagsPorLead={tagsPorLead} todasTags={todasTags} mudarTag={mudarTag} esperaMin={editado.gatilho_espera_min} quizId={editado.gatilho_quiz_id} ativadoEm={editado.ativado_em} grafo={editado.grafo}
      leads={leads} execs={execs} disparar={(ids) => dispararLeads(editado.id, ids)} reenviar={(x) => reenviarLead(editado.id, x)} />
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [editado, leads, execs, todosQuizzes, tagsPorLead]);

  const comoFluxoEditor = (f: FluxoWa): FluxoInstagram => ({ id: f.id, user_id: "", ig_user_id: "", nome: f.nome, ativo: f.ativo, gatilhos: ["comentario"], palavras_chave: [], correspondencia: "contem", media_ids: null, respostas_comentario: [], grafo: f.grafo, disparos: f.disparos });
  const salvar = async (form: Pick<FluxoInstagram, "nome" | "ativo" | "grafo"> & { gatilho_wa?: GatilhoWa }, id?: string) => {
    if (!clienteId) throw new Error("Projeto não encontrado");
    const g = form.gatilho_wa ?? { tipo: "manual" as const, espera_min: 0, quiz_id: null, tag: null };
    const gatilho_tag = g.tipo === "tag" ? (g.tag ?? "").trim().toLowerCase() || null : null;
    if (g.tipo === "tag" && !gatilho_tag) throw new Error("Escolha a tag do gatilho");
    const { error } = id
      ? await db.from("whatsapp_fluxos").update({ nome: form.nome, ativo: form.ativo, grafo: form.grafo, gatilho: g.tipo, gatilho_espera_min: g.espera_min, gatilho_quiz_id: g.quiz_id, gatilho_tag, atualizado_em: new Date().toISOString() }).eq("id", id)
      : await db.from("whatsapp_fluxos").insert({ cliente_id: clienteId, nome: form.nome, ativo: form.ativo, grafo: form.grafo, gatilho: g.tipo, gatilho_espera_min: g.espera_min, gatilho_quiz_id: g.quiz_id, gatilho_tag });
    if (error) throw error;
    await carregar();
  };
  const alternar = async (f: FluxoWa) => {
    setFluxos((l) => (l ?? []).map((x) => (x.id === f.id ? { ...x, ativo: !f.ativo } : x)));
    const { error } = await db.from("whatsapp_fluxos").update({ ativo: !f.ativo, atualizado_em: new Date().toISOString() }).eq("id", f.id);
    if (error) { toast.error("Não consegui mudar"); void carregar(); }
  };
  const apagar = async (f: FluxoWa) => {
    if (!(await confirmar(`Apagar o fluxo “${f.nome}”?`, { descricao: "Quem estiver no meio dele para de receber as mensagens." }))) return;
    const { error } = await db.from("whatsapp_fluxos").delete().eq("id", f.id);
    if (error) { toast.error("Não consegui apagar"); return; }
    setFluxos((l) => (l ?? []).filter((x) => x.id !== f.id));
  };

  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-[#0b141a] p-4 text-white">
      <div className="flex items-center gap-2">
        <Workflow className="h-5 w-5 text-emerald-300" />
        <div className="min-w-0 flex-1"><h3 className="text-lg font-bold">Fluxos do WhatsApp</h3><p className="text-xs text-white/55">Monte a sequência de mensagens (com esperas e respostas) e, no chat de um lead, clique em “Iniciar fluxo”. O robô do Mac manda cada mensagem pelo WhatsApp do projeto.</p></div>
        <button type="button" onClick={() => setEditando("novo")} disabled={!clienteId} className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-1.5 text-sm font-semibold text-black hover:bg-emerald-400 disabled:opacity-50"><Plus className="h-4 w-4" />Novo fluxo</button>
      </div>
      {fluxos === null ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-white/50" /></div>
        : fluxos.length === 0 ? <p className="rounded-xl border border-dashed border-white/15 p-6 text-center text-sm text-white/50">Nenhum fluxo ainda. Crie o primeiro: “Novo fluxo”.</p>
        : (
          <div className="grid gap-2 md:grid-cols-2">
            {fluxos.map((f) => {
              const blocos = f.grafo.nos.filter((n) => n.tipo === "mensagem").length;
              return (
                <div key={f.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
                  <button type="button" role="switch" aria-checked={f.ativo} onClick={() => void alternar(f)} title={f.ativo ? "Ativo: aparece em “Iniciar fluxo”" : "Desligado"}
                    className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", f.ativo ? "bg-emerald-500" : "bg-white/20")}><span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all", f.ativo ? "left-[18px]" : "left-0.5")} /></button>
                  <div className="min-w-0 flex-1"><p className="truncate font-semibold">{f.nome}</p><p className="text-xs text-white/50">{blocos} mensagem{blocos === 1 ? "" : "ns"} · {(() => { const m = execs.filter((x) => x.fluxo_id === f.id); const r = m.filter((x) => (x.historico ?? []).some((h) => h.tipo.startsWith("resposta:"))).length; return `${m.length} disparado${m.length === 1 ? "" : "s"} · ${r} respondeu${r === 1 ? "" : "ram"}`; })()}</p><p className="truncate text-[11px] text-emerald-300/80">{TIPOS_GATILHO_WA.find((x) => x.valor === f.gatilho)?.titulo ?? "Eu inicio pelo chat"}{f.gatilho !== "manual" && f.gatilho_espera_min > 0 ? ` · após ${f.gatilho_espera_min % 1440 === 0 ? `${f.gatilho_espera_min / 1440} d` : f.gatilho_espera_min % 60 === 0 ? `${f.gatilho_espera_min / 60} h` : `${f.gatilho_espera_min} min`}` : ""}</p></div>
                  <button type="button" onClick={() => setEditando(f)} title="Editar" className="rounded-lg border border-white/15 p-1.5 text-white/70 hover:bg-white/10"><Pencil className="h-4 w-4" /></button>
                  <button type="button" onClick={() => void apagar(f)} title="Apagar" className="rounded-lg p-1.5 text-white/40 hover:bg-rose-500/15 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button>
                </div>);
            })}
          </div>)}
      <FluxoEditor whatsapp quizzesWa={quizzes} tagsWa={todasTags} gatilhoWaInicial={editando && editando !== "novo" ? { tipo: editando.gatilho, espera_min: editando.gatilho_espera_min, quiz_id: editando.gatilho_quiz_id, tag: editando.gatilho_tag } : undefined} aberto={editando !== null} fluxo={editando && editando !== "novo" ? comoFluxoEditor(editando) : null} inicial={editando === "novo" ? { nome: "Novo fluxo" } : null}
        contaNome="WhatsApp do projeto" numeros={{}} numerosDoPeriodo={editado ? (d, a) => numerosDoFluxo(editado.id, d, a) : undefined} painelEsquerda={painel} onFechar={() => setEditando(null)}
        onSalvar={(form, id) => salvar({ nome: form.nome, ativo: form.ativo, grafo: form.grafo, gatilho_wa: form.gatilho_wa }, id)} />
    </div>
  );
}
