import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Loader2, Pencil, Plus, Trash2, Workflow } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { confirmar } from "@/components/DialogosGlobais";
import { FluxoEditor } from "@/components/automacoes/FluxoEditor";
import type { FluxoInstagram } from "@/hooks/useInstagramFluxos";
import type { GrafoFluxo } from "../../../supabase/functions/_shared/fluxo";

const db = supabase as unknown as SupabaseClient;
interface FluxoWa { id: string; nome: string; ativo: boolean; grafo: GrafoFluxo; disparos: number; atualizado_em: string }

// Fluxos de mensagem do WhatsApp (15/11/2026, Davi: "criar fluxos de mensagens também no WhatsApp, tipo o Many Hub"): a mesma tela de blocos do Many Hub,
// guardada em whatsapp_fluxos. Quem anda pelos blocos é o robô do Mac (scripts/fluxo_whatsapp.py) quando você clica em "Iniciar fluxo" no chat de um lead.
export function FluxosWhatsapp({ quizId }: { quizId: string }) {
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [fluxos, setFluxos] = useState<FluxoWa[] | null>(null);
  const [editando, setEditando] = useState<FluxoWa | "novo" | null>(null);

  const carregar = useCallback(async () => {
    const { data: q } = await db.from("quizzes").select("cliente_id").eq("id", quizId).maybeSingle();
    const cid = (q as { cliente_id: string } | null)?.cliente_id ?? null;
    setClienteId(cid);
    if (!cid) return;
    const { data } = await db.from("whatsapp_fluxos").select("id, nome, ativo, grafo, disparos, atualizado_em").eq("cliente_id", cid).order("criado_em", { ascending: false });
    setFluxos((data ?? []) as FluxoWa[]);
  }, [quizId]);
  useEffect(() => { void carregar(); }, [carregar]);

  const comoFluxoEditor = (f: FluxoWa): FluxoInstagram => ({ id: f.id, user_id: "", ig_user_id: "", nome: f.nome, ativo: f.ativo, gatilhos: ["comentario"], palavras_chave: [], correspondencia: "contem", media_ids: null, respostas_comentario: [], grafo: f.grafo, disparos: f.disparos });
  const salvar = async (form: Pick<FluxoInstagram, "nome" | "ativo" | "grafo">, id?: string) => {
    if (!clienteId) throw new Error("Projeto não encontrado");
    const { error } = id
      ? await db.from("whatsapp_fluxos").update({ nome: form.nome, ativo: form.ativo, grafo: form.grafo, atualizado_em: new Date().toISOString() }).eq("id", id)
      : await db.from("whatsapp_fluxos").insert({ cliente_id: clienteId, nome: form.nome, ativo: form.ativo, grafo: form.grafo });
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
                  <div className="min-w-0 flex-1"><p className="truncate font-semibold">{f.nome}</p><p className="text-xs text-white/50">{blocos} mensagem{blocos === 1 ? "" : "ns"} · iniciado {f.disparos} {f.disparos === 1 ? "vez" : "vezes"}</p></div>
                  <button type="button" onClick={() => setEditando(f)} title="Editar" className="rounded-lg border border-white/15 p-1.5 text-white/70 hover:bg-white/10"><Pencil className="h-4 w-4" /></button>
                  <button type="button" onClick={() => void apagar(f)} title="Apagar" className="rounded-lg p-1.5 text-white/40 hover:bg-rose-500/15 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button>
                </div>);
            })}
          </div>)}
      <FluxoEditor whatsapp aberto={editando !== null} fluxo={editando && editando !== "novo" ? comoFluxoEditor(editando) : null} inicial={editando === "novo" ? { nome: "Novo fluxo" } : null}
        contaNome="WhatsApp do projeto" numeros={{}} onFechar={() => setEditando(null)}
        onSalvar={(form, id) => salvar({ nome: form.nome, ativo: form.ativo, grafo: form.grafo }, id)} />
    </div>
  );
}
