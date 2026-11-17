import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CheckCircle2, Clapperboard, Loader2, Plus, RotateCcw, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// Roteiros → vídeo no Core Clone → bruto do Danilo (17/11/2026, Davi: "dentro do editor do instalivros, eu preciso conseguir subir somente o roteiro,
// tanto sozinho quanto vários, e você já começar a gerar os vídeos, aguardar, baixar e aí sim começar a editar").
// O Mac (scripts/clone_roteiros.py) manda ao clone.corestudio.ai pelo Chrome do Davi, espera ficar pronto, baixa e o Danilo edita.
const db = supabase as unknown as SupabaseClient;
interface Linha { id: string; titulo: string; status: string; mensagem: string | null; criado_em: string; lote_id: string }
const PERFIL = "BookMan-1-Dia";
const ETAPA: Record<string, { rotulo: string; cor: string; ativo?: boolean }> = {
  fila: { rotulo: "Na fila", cor: "bg-white/10 text-white/70" },
  enviando: { rotulo: "Enviando ao Core Clone", cor: "bg-sky-500/20 text-sky-200", ativo: true },
  gerando: { rotulo: "Gerando o vídeo", cor: "bg-amber-500/20 text-amber-200", ativo: true },
  baixando: { rotulo: "Baixando", cor: "bg-sky-500/20 text-sky-200", ativo: true },
  baixado: { rotulo: "Baixado · Danilo vai editar", cor: "bg-emerald-500/20 text-emerald-200" },
  erro: { rotulo: "Deu erro", cor: "bg-rose-500/20 text-rose-200" },
  cancelado: { rotulo: "Cancelado", cor: "bg-white/10 text-white/40" },
};

const tituloDe = (t: string) => { const l = t.replace(/\s+/g, " ").trim(); return (l.length > 80 ? `${l.slice(0, 80)}…` : l) || "Roteiro"; };
/** Texto colado com vários roteiros separados por uma linha "---" (ou "===") vira um campo por roteiro. */
const dividirRoteiros = (t: string) => t.split(/\n\s*(?:-{3,}|={3,})\s*\n/).map((x) => x.trim()).filter(Boolean);

export function RoteirosClone({ clienteId }: { clienteId: string }) {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [aberto, setAberto] = useState(false);
  const [campos, setCampos] = useState<string[]>([""]);
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    const desde = new Date(Date.now() - 3 * 86400_000).toISOString();
    const { data } = await db.from("clone_roteiros").select("id, titulo, status, mensagem, criado_em, lote_id").eq("cliente_id", clienteId).gte("criado_em", desde).neq("status", "cancelado").order("criado_em", { ascending: false }).limit(60);
    setLinhas((data ?? []) as Linha[]);
  }, [clienteId]);
  useEffect(() => {
    void carregar();
    const t = window.setInterval(() => void carregar(), 8000);
    return () => window.clearInterval(t);
  }, [carregar]);

  const mudarCampo = (i: number, v: string) => {
    const partes = dividirRoteiros(v);
    setCampos((c) => (partes.length > 1 && /\n\s*(?:-{3,}|={3,})\s*\n/.test(v) ? [...c.slice(0, i), ...partes, ...c.slice(i + 1)] : c.map((x, j) => (j === i ? v : x))));
  };
  const validos = campos.map((c) => c.trim()).filter((c) => c.length >= 20);
  const enviar = async () => {
    if (!validos.length || enviando) return;
    setEnviando(true);
    const lote = crypto.randomUUID();
    const { error } = await db.from("clone_roteiros").insert(validos.map((r) => ({ cliente_id: clienteId, lote_id: lote, titulo: tituloDe(r), roteiro: r.slice(0, 12000), perfil: PERFIL })));
    setEnviando(false);
    if (error) { toast.error("Não consegui guardar os roteiros"); return; }
    toast.success(validos.length === 1 ? "Roteiro na fila: já vou gerar o vídeo" : `${validos.length} roteiros na fila: já vou gerar os vídeos`);
    setCampos([""]); setAberto(false); void carregar();
  };
  const tentarDeNovo = async (id: string) => { const { error } = await db.from("clone_roteiros").update({ status: "fila", mensagem: null }).eq("id", id); if (error) toast.error("Não consegui"); else void carregar(); };
  const cancelar = async (id: string) => { const { error } = await db.from("clone_roteiros").update({ status: "cancelado" }).eq("id", id); if (error) toast.error("Só dá para cancelar o que ainda está na fila"); else void carregar(); };
  const apagar = async (id: string) => { await db.from("clone_roteiros").delete().eq("id", id); void carregar(); };

  const emAndamento = linhas.filter((l) => ["fila", "enviando", "gerando", "baixando"].includes(l.status)).length;
  return (
    <>
      <button type="button" onClick={() => setAberto(true)} className="inline-flex items-center gap-2 rounded-full border border-fuchsia-300/40 bg-fuchsia-500/15 px-5 py-2.5 text-sm font-semibold text-fuchsia-100 hover:bg-fuchsia-500/25"><Sparkles className="h-4 w-4" />Enviar roteiros{emAndamento > 0 && <span className="rounded-full bg-fuchsia-400 px-1.5 text-[11px] font-bold text-black">{emAndamento}</span>}</button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="dark max-h-[90vh] max-w-2xl overflow-y-auto border-white/10 bg-[#0c1320] text-white">
          <DialogTitle className="flex items-center gap-2 text-lg"><Clapperboard className="h-5 w-5 text-fuchsia-300" />Gerar vídeos a partir de roteiros</DialogTitle>
          <DialogDescription className="text-sm text-white/60">Cole o roteiro pronto (um, ou vários: um campo por roteiro, ou separe com uma linha <b>---</b>). Eu mando para o Core Clone, espero ficar pronto, baixo e o Danilo começa a editar. O Chrome do Mac precisa estar aberto e logado em clone.corestudio.ai.</DialogDescription>
          <div className="space-y-2.5">
            {campos.map((c, i) => (
              <div key={i} className="relative">
                <textarea value={c} onChange={(e) => mudarCampo(i, e.target.value)} rows={5} placeholder={`Roteiro ${i + 1}…`}
                  className="w-full resize-y rounded-xl border border-white/10 bg-[#0a1520] p-3 pr-8 text-sm outline-none focus:border-fuchsia-300/60" />
                {campos.length > 1 && <button type="button" onClick={() => setCampos((x) => x.filter((_, j) => j !== i))} title="Tirar este roteiro" className="absolute right-2 top-2 text-white/40 hover:text-rose-300"><X className="h-4 w-4" /></button>}
                {c.trim() && c.trim().length < 20 && <p className="mt-0.5 text-[11px] text-amber-300">Muito curto para ser um roteiro.</p>}
              </div>
            ))}
            <button type="button" onClick={() => setCampos((c) => [...c, ""])} className="flex items-center gap-1 text-xs text-fuchsia-200 hover:underline"><Plus className="h-3.5 w-3.5" />Adicionar roteiro</button>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={() => setAberto(false)} className="rounded-full px-4 py-2 text-sm text-white/70 hover:bg-white/10">Cancelar</button>
            <button type="button" disabled={!validos.length || enviando} onClick={() => void enviar()} className="inline-flex items-center gap-2 rounded-full bg-fuchsia-500 px-5 py-2 text-sm font-semibold text-white hover:bg-fuchsia-400 disabled:opacity-40">{enviando && <Loader2 className="h-4 w-4 animate-spin" />}Gerar {validos.length > 1 ? `${validos.length} vídeos` : "vídeo"}</button>
          </div>
        </DialogContent>
      </Dialog>

      {linhas.length > 0 && (
        <div className="basis-full space-y-1.5 rounded-2xl border border-white/10 bg-black/25 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Roteiros → vídeos (Core Clone)</p>
          {linhas.map((l) => {
            const e = ETAPA[l.status] ?? ETAPA.fila;
            return (
              <div key={l.id} className="flex items-center gap-2 text-sm">
                {e.ativo ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-white/60" /> : l.status === "baixado" ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-300" /> : <span className="h-3.5 w-3.5 shrink-0" />}
                <span className="min-w-0 flex-1 truncate" title={l.titulo}>{l.titulo}</span>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px]", e.cor)} title={l.mensagem ?? undefined}>{e.rotulo}</span>
                {l.status === "erro" && <button type="button" onClick={() => void tentarDeNovo(l.id)} title={l.mensagem ?? "Tentar de novo"} className="text-white/60 hover:text-white"><RotateCcw className="h-3.5 w-3.5" /></button>}
                {l.status === "fila" && <button type="button" onClick={() => void cancelar(l.id)} title="Cancelar" className="text-white/40 hover:text-rose-300"><X className="h-3.5 w-3.5" /></button>}
                {(l.status === "erro" || l.status === "baixado") && <button type="button" onClick={() => void apagar(l.id)} title="Tirar da lista" className="text-white/30 hover:text-rose-300"><Trash2 className="h-3.5 w-3.5" /></button>}
              </div>
            );
          })}
          {linhas.some((l) => l.status === "erro") && <p className="text-[11px] text-rose-200/80">{linhas.find((l) => l.status === "erro")?.mensagem}</p>}
        </div>
      )}
    </>
  );
}
