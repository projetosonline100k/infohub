import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CalendarClock, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { HORA_PADRAO, diaLocal, instante, problemaNoHorario, sugerirData } from "@/lib/empresa/programacao";

// "Escolher data do carrossel" (tarefa do Davi, tipo 'agendar'): ele escolhe
// dia e hora e a Dalila publica sozinha na nuvem (edge dalila-publicar).
// Escolher a data é o ok do Davi para aquele post.

// `carrosseis` ainda não está nos tipos gerados deste worktree.
const db = supabase as unknown as SupabaseClient;

interface CarrosselParaProgramar {
  id: string;
  numero: number | null;
  tema: string;
  status: string;
  mensagem: string | null;
  legenda: string | null;
  paginas: string[];
  programado_para: string | null;
}

export function ProgramarCarrossel({ tarefaId, onFechar }: { tarefaId: string | null; onFechar: () => void }) {
  const [carrossel, setCarrossel] = useState<CarrosselParaProgramar | null>(null);
  const [ocupados, setOcupados] = useState<string[]>([]);
  const [data, setData] = useState("");
  const [hora, setHora] = useState(HORA_PADRAO);
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!tarefaId) return;
    setCarregando(true);
    void (async () => {
      const { data: c } = await db.from("carrosseis")
        .select("id, numero, tema, status, mensagem, legenda, paginas, programado_para")
        .eq("tarefa_data_id", tarefaId).maybeSingle();
      const { data: outros } = await db.from("carrosseis").select("id, programado_para")
        .in("status", ["programado", "publicando"]).not("programado_para", "is", null);
      const dias = (outros || []).filter((o) => o.id !== c?.id).map((o) => diaLocal(new Date(o.programado_para)));
      setOcupados(dias);
      setCarrossel((c as CarrosselParaProgramar) ?? null);
      if (c?.programado_para) {
        const d = new Date(c.programado_para);
        setData(diaLocal(d));
        setHora(format(d, "HH:mm"));
      } else {
        setData(sugerirData(new Date(), dias));
        setHora(HORA_PADRAO);
      }
      setCarregando(false);
    })();
  }, [tarefaId]);

  const quando = useMemo(() => instante(data, hora), [data, hora]);
  const problema = problemaNoHorario(quando, new Date());
  const diaOcupado = data && ocupados.includes(data);
  const naoPublicou = carrossel?.mensagem?.startsWith("Não publicou") ? carrossel.mensagem : null;

  const programar = async () => {
    if (!carrossel || !quando || problema) return;
    setSalvando(true);
    const { error } = await db.rpc("programar_carrossel", { p_carrossel: carrossel.id, p_quando: quando.toISOString() });
    setSalvando(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Programado: a Dalila publica ${format(quando, "EEEE, d 'de' MMMM 'às' HH:mm", { locale: ptBR })}.`);
    onFechar();
  };

  const nome = carrossel ? `${carrossel.numero ? `${String(carrossel.numero).padStart(3, "0")} · ` : ""}${carrossel.tema}` : "";

  return (
    <Dialog open={!!tarefaId} onOpenChange={(aberto) => { if (!aberto) onFechar(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5" /> Quando publicar?</DialogTitle>
          <DialogDescription>{nome || "Carrossel"}</DialogDescription>
        </DialogHeader>
        {carregando ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : !carrossel ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Não achei o carrossel desta tarefa.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {carrossel.paginas.map((u, i) => (
                <img key={u} src={u} alt={`Página ${i + 1}`} className="h-28 w-auto shrink-0 rounded border object-cover" />
              ))}
            </div>
            {carrossel.legenda && <p className="line-clamp-3 whitespace-pre-line text-xs text-muted-foreground">{carrossel.legenda}</p>}
            {naoPublicou && <p className="rounded-md border border-rose-500/30 bg-rose-500/5 p-2 text-sm text-rose-600 dark:text-rose-400">{naoPublicou}</p>}
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Dia</span>
                <Input type="date" value={data} min={diaLocal(new Date())} onChange={(e) => setData(e.target.value)} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Hora (Brasília)</span>
                <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
              </label>
            </div>
            {diaOcupado && <p className="text-xs text-amber-600 dark:text-amber-400">Já tem um post programado neste dia (o padrão é 1 por dia).</p>}
            {problema && data && <p className="text-xs text-rose-600 dark:text-rose-400">{problema}</p>}
            <p className="text-xs text-muted-foreground">
              A Dalila publica sozinha no @eu.davioficial neste dia e hora, mesmo com o Mac desligado. Escolher a data é o seu ok.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onFechar}>Agora não</Button>
              <Button onClick={() => void programar()} disabled={!!problema || salvando}>
                {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {quando && !problema ? `Programar para ${format(quando, "EEE, d MMM 'às' HH:mm", { locale: ptBR })}` : "Programar"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
