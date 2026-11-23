import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Loader2, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { estadoDosLeads, type EventoQuiz, type LeadQuiz, type VendaPlataforma } from "@/lib/quiz/painel";
import { paginar } from "@/lib/quiz/paginar";

const db = supabase as unknown as SupabaseClient;
export interface VersaoQuiz { id: string; versao: number; slug: string; status: string; ab_ativo: boolean }

// Comparação das versões do quiz (15/11/2026, Davi: "teste A/B"): visitas, leads, conversão, quem foi ao checkout e quem comprou, lado a lado.
export function ComparativoVersoes({ aberto, onFechar, clienteId, versoes }: { aberto: boolean; onFechar: () => void; clienteId: string; versoes: VersaoQuiz[] }) {
  const [dados, setDados] = useState<Record<string, { eventos: EventoQuiz[]; leads: LeadQuiz[] }> | null>(null);
  const [vendas, setVendas] = useState<VendaPlataforma[]>([]);
  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    setDados(null);
    void (async () => {
      const ids = versoes.map((v) => v.id);
      const [e, l] = await Promise.all([
        paginar<EventoQuiz & { quiz_id: string }>((de, ate) => db.from("quiz_eventos").select("quiz_id, sessao, tipo, passo, criado_em").in("quiz_id", ids).order("criado_em").order("id").range(de, ate)),
        paginar<any>((de, ate) => db.from("quiz_respostas").select("quiz_id, id, email, whatsapp, criada_em, sessao").in("quiz_id", ids).order("criada_em").order("id").range(de, ate)),
      ]);
      const por: Record<string, { eventos: EventoQuiz[]; leads: LeadQuiz[] }> = Object.fromEntries(ids.map((i) => [i, { eventos: [], leads: [] }]));
      for (const x of (e.data ?? []) as (EventoQuiz & { quiz_id: string })[]) por[x.quiz_id]?.eventos.push(x);
      for (const x of (l.data ?? []) as (LeadQuiz & { quiz_id: string })[]) por[x.quiz_id]?.leads.push(x);
      const { data: ps } = await db.from("produtos_cliente").select("id").eq("cliente_id", clienteId);
      const pids = ((ps ?? []) as { id: string }[]).map((x) => x.id);
      if (pids.length) {
        const { data: v } = await db.from("vendas_plataforma_eventos").select("transacao_id, tipo, comprador_email, comprador_telefone, valor, data").in("produto_id", pids).in("tipo", ["venda", "reembolso"]).limit(20000);
        if (vivo) setVendas((v ?? []) as VendaPlataforma[]);
      }
      if (vivo) setDados(por);
    })();
    return () => { vivo = false; };
  }, [aberto, clienteId, versoes]);

  const linhas = useMemo(() => versoes.map((v) => {
    const d = dados?.[v.id];
    const visitas = new Set((d?.eventos ?? []).filter((x) => x.tipo === "visita").map((x) => x.sessao)).size;
    const leads = d?.leads.length ?? 0;
    const estados = estadoDosLeads(d?.leads ?? [], d?.eventos ?? [], vendas);
    let checkout = 0, compraram = 0, receita = 0;
    for (const s of estados.values()) { if (s.clicouCheckout) checkout++; if (s.compra) { compraram++; receita += s.compra.valor; } }
    return { v, visitas, leads, conv: visitas ? leads / visitas : 0, checkout, compraram, receita };
  }), [versoes, dados, vendas]);
  const melhor = linhas.length > 1 && linhas.some((l) => l.visitas >= 30) ? linhas.reduce((a, b) => (b.conv > a.conv ? b : a)).v.id : null;
  const pct = (x: number) => `${(x * 100).toFixed(1).replace(".", ",")}%`;
  return (
    <Dialog open={aberto} onOpenChange={(a) => { if (!a) onFechar(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Comparar versões do quiz</DialogTitle>
          <DialogDescription>Cada versão conta as próprias visitas e leads. A compra é ligada ao lead pelo e-mail, só se foi feita depois de ele virar lead.</DialogDescription>
        </DialogHeader>
        {!dados ? <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Versão</th><th className="px-2 text-right font-medium">Visitas</th><th className="px-2 text-right font-medium">Leads</th>
                <th className="px-2 text-right font-medium">Conversão</th><th className="px-2 text-right font-medium">Foram ao checkout</th><th className="px-2 text-right font-medium">Compraram</th><th className="pl-2 text-right font-medium">Receita</th>
              </tr></thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.v.id} className={cn("border-b last:border-0", melhor === l.v.id && "bg-emerald-500/10")}>
                    <td className="py-2.5 pr-3 font-semibold">V{l.v.versao}{melhor === l.v.id && <Trophy className="ml-1.5 inline h-3.5 w-3.5 text-emerald-500" />}
                      <span className="ml-2 text-[11px] font-normal text-muted-foreground">{l.v.status === "publicado" ? (l.v.versao === 1 || l.v.ab_ativo ? "no teste" : "publicada, fora do teste") : "ainda não publicada"}</span></td>
                    <td className="px-2 text-right tabular-nums">{l.visitas}</td><td className="px-2 text-right tabular-nums">{l.leads}</td>
                    <td className="px-2 text-right font-semibold tabular-nums">{pct(l.conv)}</td><td className="px-2 text-right tabular-nums">{l.checkout}</td>
                    <td className="px-2 text-right tabular-nums">{l.compraram}</td><td className="pl-2 text-right tabular-nums">R$ {l.receita.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                  </tr>))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-muted-foreground">{melhor ? "O troféu marca a maior conversão, mas só vale quando cada versão tem bastante visita (a partir de umas 100). Com poucos números, a diferença pode ser acaso." : "Com menos de 30 visitas ainda não dá para apontar uma melhor."}</p>
          </div>)}
      </DialogContent>
    </Dialog>
  );
}
