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
interface FluxoWa { id: string; nome: string; ativo: boolean; grafo: GrafoFluxo; disparos: number; atualizado_em: string; gatilho: GatilhoWa["tipo"]; gatilho_espera_min: number; gatilho_quiz_id: string | null; ativado_em: string | null }
export interface ExecucaoWa { id: string; fluxo_id: string; resposta_id: string; estado: string; proximo_em: string | null; criado_em: string; historico: { no: string; tipo: string; em: string }[] | null }
export interface LeadFluxoWa { id: string; quiz_id: string; nome: string | null; email: string | null; whatsapp: string | null; criada_em: string }

// Fluxos de mensagem do WhatsApp (15/11/2026, Davi: "criar fluxos de mensagens também no WhatsApp, tipo o Many Hub"): a mesma tela de blocos do Many Hub,
// guardada em whatsapp_fluxos. Quem anda pelos blocos é o robô do Mac (scripts/fluxo_whatsapp.py) quando você clica em "Iniciar fluxo" no chat de um lead.
export function FluxosWhatsapp({ quizId }: { quizId: string }) {
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [fluxos, setFluxos] = useState<FluxoWa[] | null>(null);
  const [quizzes, setQuizzes] = useState<{ id: string; titulo: string }[]>([]);
  const [editando, setEditando] = useState<FluxoWa | "novo" | null>(null);

  const carregar = useCallback(async () => {
    const { data: q } = await db.from("quizzes").select("cliente_id").eq("id", quizId).maybeSingle();
    const cid = (q as { cliente_id: string } | null)?.cliente_id ?? null;
    setClienteId(cid);
    if (!cid) return;
    const { data } = await db.from("whatsapp_fluxos").select("id, nome, ativo, grafo, disparos, atualizado_em, gatilho, gatilho_espera_min, gatilho_quiz_id, ativado_em").eq("cliente_id", cid).order("criado_em", { ascending: false });
    setFluxos((data ?? []) as FluxoWa[]);
    const { data: qs } = await db.from("quizzes").select("id, titulo").eq("cliente_id", cid).is("variante_de", null).neq("status", "cancelado").order("criado_em", { ascending: false });
    setQuizzes((qs ?? []) as { id: string; titulo: string }[]);
  }, [quizId]);
  useEffect(() => { void carregar(); }, [carregar]);

  // Execuções (quem está/esteve em cada fluxo) e leads do projeto: base dos números por bloco e do painel "A receber". Atualiza a cada 8 s com o editor aberto.
  const [execs, setExecs] = useState<ExecucaoWa[]>([]);
  const [leads, setLeads] = useState<LeadFluxoWa[]>([]);
  const lerMovimento = useCallback(async () => {
    if (!clienteId) return;
    const [{ data: e }, { data: l }] = await Promise.all([
      db.from("whatsapp_fluxo_execucoes").select("id, fluxo_id, resposta_id, estado, proximo_em, criado_em, historico").eq("cliente_id", clienteId).order("criado_em", { ascending: false }).limit(2000),
      db.from("quiz_respostas").select("id, quiz_id, nome, email, whatsapp, criada_em").eq("cliente_id", clienteId).not("whatsapp", "is", null).order("criada_em", { ascending: false }).limit(1500),
    ]);
    setExecs((e ?? []) as ExecucaoWa[]); setLeads((l ?? []) as LeadFluxoWa[]);
  }, [clienteId]);
  useEffect(() => {
    if (!clienteId) return;
    void lerMovimento();
    const t = window.setInterval(() => { if (!document.hidden) void lerMovimento(); }, 8000);
    return () => window.clearInterval(t);
  }, [clienteId, lerMovimento]);
  const numerosDoFluxo = useCallback((fluxoId: string, desde: number | null, ate: number | null): Record<string, NumerosDoNo> => {
    const dentro = (iso?: string | null) => { if (desde === null && ate === null) return true; if (!iso) return false; const t = Date.parse(iso); return (desde === null || t >= desde) && (ate === null || t < ate); };
    const nos: Record<string, NumerosDoNo> = {};
    for (const x of execs) {
      if (x.fluxo_id !== fluxoId) continue;
      for (const h of x.historico ?? []) {
        if (!dentro(h.em)) continue;
        const n = (nos[h.no] ??= { enviadas: 0, respostas: 0, rastreadas: 0, abertas: 0 });
        if (h.tipo === "mensagem" || h.tipo === "midia") n.enviadas++;
        if (h.tipo.startsWith("resposta:")) n.respostas++;
      }
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
  const editado = editando && editando !== "novo" ? (fluxos?.find((x) => x.id === editando.id) ?? editando) : null;
  const painel = useMemo(() => editado && (
    <LeadsDoFluxoWa fluxoId={editado.id} ativo={editado.ativo} gatilho={editado.gatilho} esperaMin={editado.gatilho_espera_min} quizId={editado.gatilho_quiz_id} ativadoEm={editado.ativado_em}
      leads={leads} execs={execs} disparar={(ids) => dispararLeads(editado.id, ids)} />
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [editado, leads, execs]);

  const comoFluxoEditor = (f: FluxoWa): FluxoInstagram => ({ id: f.id, user_id: "", ig_user_id: "", nome: f.nome, ativo: f.ativo, gatilhos: ["comentario"], palavras_chave: [], correspondencia: "contem", media_ids: null, respostas_comentario: [], grafo: f.grafo, disparos: f.disparos });
  const salvar = async (form: Pick<FluxoInstagram, "nome" | "ativo" | "grafo"> & { gatilho_wa?: GatilhoWa }, id?: string) => {
    if (!clienteId) throw new Error("Projeto não encontrado");
    const g = form.gatilho_wa ?? { tipo: "manual" as const, espera_min: 0, quiz_id: null };
    const { error } = id
      ? await db.from("whatsapp_fluxos").update({ nome: form.nome, ativo: form.ativo, grafo: form.grafo, gatilho: g.tipo, gatilho_espera_min: g.espera_min, gatilho_quiz_id: g.quiz_id, atualizado_em: new Date().toISOString() }).eq("id", id)
      : await db.from("whatsapp_fluxos").insert({ cliente_id: clienteId, nome: form.nome, ativo: form.ativo, grafo: form.grafo, gatilho: g.tipo, gatilho_espera_min: g.espera_min, gatilho_quiz_id: g.quiz_id });
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
      <FluxoEditor whatsapp quizzesWa={quizzes} gatilhoWaInicial={editando && editando !== "novo" ? { tipo: editando.gatilho, espera_min: editando.gatilho_espera_min, quiz_id: editando.gatilho_quiz_id } : undefined} aberto={editando !== null} fluxo={editando && editando !== "novo" ? comoFluxoEditor(editando) : null} inicial={editando === "novo" ? { nome: "Novo fluxo" } : null}
        contaNome="WhatsApp do projeto" numeros={{}} numerosDoPeriodo={editado ? (d, a) => numerosDoFluxo(editado.id, d, a) : undefined} painelEsquerda={painel} onFechar={() => setEditando(null)}
        onSalvar={(form, id) => salvar({ nome: form.nome, ativo: form.ativo, grafo: form.grafo, gatilho_wa: form.gatilho_wa }, id)} />
    </div>
  );
}
