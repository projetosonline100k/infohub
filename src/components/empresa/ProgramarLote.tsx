import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CalendarClock, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { HORA_PADRAO, instante, sugerirData } from "@/lib/empresa/programacao";
import { CalendarioPosts, carregarAgenda, type ItemAgenda } from "./ProgramarCarrossel";

// "Dalila preenche os próximos dias": com vários carrosséis esperando data, a
// Dalila propõe um por dia, às 10h, nos dias livres; o Davi vê a lista no
// calendário e confirma. Confirmar é o ok dele para cada post da lista
// (memória dalila-publica-na-nuvem: ela nunca programa sozinha).
const db = supabase as unknown as SupabaseClient;

interface Proposta { carrosselId: string; titulo: string; capa: string | null; dia: string }

export function ProgramarLote({ clienteId, tarefaIds, aberto, onFechar }: {
  clienteId: string; tarefaIds: string[]; aberto: boolean; onFechar: () => void;
}) {
  const [propostas, setPropostas] = useState<Proposta[]>([]);
  const [agenda, setAgenda] = useState<ItemAgenda[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(0);

  const chave = tarefaIds.join(",");   // a lista nova a cada render do pai não refaz a proposta
  useEffect(() => {
    const ids = chave ? chave.split(",") : [];
    if (!aberto || !ids.length) return;
    setCarregando(true);
    void (async () => {
      const { data } = await db.from("carrosseis").select("id, numero, tema, paginas, tarefa_data_id")
        .in("tarefa_data_id", ids).order("numero");
      const atual = await carregarAgenda(clienteId);
      const ocupados = atual.filter((a) => a.tipo === "carrossel").map((a) => a.dia);
      const lista: Proposta[] = [];
      for (const c of (data || []) as { id: string; numero: number | null; tema: string; paginas: string[] | null }[]) {
        const dia = sugerirData(new Date(), ocupados);
        ocupados.push(dia);
        lista.push({ carrosselId: c.id, titulo: `${c.numero ? `${String(c.numero).padStart(3, "0")} · ` : ""}${c.tema}`, capa: c.paginas?.[0] ?? null, dia });
      }
      setPropostas(lista);
      setAgenda([...atual, ...lista.map((p) => ({ dia: p.dia, tipo: "carrossel" as const, titulo: `${p.titulo} (proposto)`, capa: p.capa, publicado: false, hora: HORA_PADRAO }))]);
      setCarregando(false);
    })();
  }, [aberto, chave, clienteId]);

  const confirmar = async () => {
    let feitos = 0;
    for (const p of propostas) {
      setSalvando(feitos + 1);
      const quando = instante(p.dia, HORA_PADRAO);
      const { error } = await db.rpc("programar_carrossel", { p_carrossel: p.carrosselId, p_quando: quando!.toISOString() });
      if (error) { toast.error(`${p.titulo}: ${error.message}`); break; }
      feitos++;
    }
    setSalvando(0);
    if (feitos) toast.success(`${feitos} ${feitos === 1 ? "carrossel programado" : "carrosséis programados"}: a Dalila publica um por dia, às ${HORA_PADRAO}.`);
    onFechar();
  };

  return (
    <Dialog open={aberto} onOpenChange={(a) => { if (!a) onFechar(); }}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" />A Dalila preenche os próximos dias</DialogTitle>
          <DialogDescription>Um carrossel por dia, às {HORA_PADRAO}, nos dias livres. Confira e confirme: confirmar é o seu ok para cada post.</DialogDescription>
        </DialogHeader>
        {carregando ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-4">
            <CalendarioPosts agenda={agenda} />
            <div className="space-y-1.5">
              {propostas.map((p) => (
                <div key={p.carrosselId} className="flex items-center gap-2.5 rounded-md border p-2">
                  {p.capa && <img src={p.capa} alt="" className="h-10 w-8 shrink-0 rounded-sm object-cover" />}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.titulo}</span>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                    <CalendarClock className="h-3.5 w-3.5" />{format(new Date(`${p.dia}T12:00:00`), "EEE, d MMM", { locale: ptBR })} · {HORA_PADRAO}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Quer outro dia para algum? Feche e escolha a data dele sozinho em “Escolher data”.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onFechar}>Agora não</Button>
              <Button onClick={() => void confirmar()} disabled={!propostas.length || salvando > 0}>
                {salvando > 0 && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {salvando > 0 ? `Programando ${salvando}/${propostas.length}…` : `Programar ${propostas.length} ${propostas.length === 1 ? "carrossel" : "carrosséis"}`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
