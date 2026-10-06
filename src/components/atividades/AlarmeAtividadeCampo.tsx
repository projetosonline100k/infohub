import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { BellRing } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { isDesktop } from "@/lib/platform";
import { definirAlarmeAtividade, EVENTO_ALARMES_ATIVIDADE, horarioSugerido } from "@/lib/atividades/alarmeAtividade";

const paraInput = (data: Date) => format(data, "yyyy-MM-dd'T'HH:mm");
const mesmoHorario = (a: Date | null, b: Date | null) => (a?.getTime() ?? null) === (b?.getTime() ?? null);

// Campo "Alarme" do card da atividade. Ligar/desligar e escolher o horário
// só mexem num rascunho; ele é salvo quando a pessoa clica FORA do campo
// (ou fecha o card) — assim dá pra ajustar com calma, sem salvar a cada
// mudança. O salvamento não trava a tela (ver definirAlarmeAtividade).
export function AlarmeAtividadeCampo({ atividadeId, titulo, vencimento }: { atividadeId: string; titulo: string; vencimento: string | null }) {
  const [salvo, setSalvo] = useState<Date | null>(null);
  const [rascunho, setRascunho] = useState<Date | null>(null);
  const caixaRef = useRef<HTMLDivElement>(null);

  // Valores atuais pra quem roda fora do render (clique fora, desmontar).
  const atual = useRef({ salvo, rascunho, lembreteId: null as string | null, titulo });
  atual.current = { ...atual.current, salvo, rascunho, titulo };

  const salvar = () => {
    const { salvo: noBanco, rascunho: novo, lembreteId, titulo: nome } = atual.current;
    if (mesmoHorario(noBanco, novo)) return;
    atual.current.salvo = novo;
    setSalvo(novo);
    definirAlarmeAtividade({ id: atividadeId, titulo: nome, alarme_lembrete_id: lembreteId }, novo).catch(() => {
      toast.error("Não foi possível salvar o alarme");
      setSalvo(noBanco);
      setRascunho(noBanco);
    });
  };
  const salvarRef = useRef(salvar);
  salvarRef.current = salvar;

  useEffect(() => {
    let cancelado = false;
    const carregar = async () => {
      const { data } = await supabase.from("atividades").select("alarme_em, alarme_lembrete_id").eq("id", atividadeId).maybeSingle();
      if (cancelado) return;
      const doBanco = data?.alarme_em ? new Date(data.alarme_em) : null;
      atual.current.lembreteId = data?.alarme_lembrete_id ?? null;
      // Não atropela um rascunho que ainda não foi salvo.
      if (!mesmoHorario(atual.current.salvo, atual.current.rascunho)) return;
      setSalvo(doBanco);
      setRascunho(doBanco);
    };
    void carregar();
    window.addEventListener(EVENTO_ALARMES_ATIVIDADE, carregar);
    return () => {
      cancelado = true;
      window.removeEventListener(EVENTO_ALARMES_ATIVIDADE, carregar);
      // Fechou o card (ou trocou de atividade) com rascunho pendente: salva.
      salvarRef.current();
    };
  }, [atividadeId]);

  // Clique fora do campo salva o rascunho. (No WebKit, clicar num botão não
  // dá foco a ele, então não dá pra confiar em blur/focusout.)
  useEffect(() => {
    const aoClicar = (event: PointerEvent) => {
      if (caixaRef.current && !caixaRef.current.contains(event.target as Node)) salvarRef.current();
    };
    document.addEventListener("pointerdown", aoClicar, true);
    return () => document.removeEventListener("pointerdown", aoClicar, true);
  }, []);

  const ligado = rascunho !== null;
  const pendente = !mesmoHorario(salvo, rascunho);
  return (
    <div ref={caixaRef} className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground"><BellRing className="h-3.5 w-3.5" />Alarme</label>
      <div className="flex items-center gap-2">
        <Switch checked={ligado} onCheckedChange={(v) => setRascunho(v ? (salvo ?? horarioSugerido(vencimento)) : null)} aria-label="Ligar alarme" />
        {ligado ? (
          <Input
            type="datetime-local"
            className="h-9"
            value={paraInput(rascunho)}
            onChange={(e) => { if (e.target.value) setRascunho(new Date(e.target.value)); }}
            onKeyDown={(e) => { if (e.key === "Enter") salvar(); }}
          />
        ) : (
          <span className="text-sm text-muted-foreground">Desligado</span>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {pendente
          ? "Clique fora para salvar"
          : ligado ? `Toca no app (repete a cada 5 min)${isDesktop() ? " e no app Lembretes do Mac" : ""}.` : null}
      </p>
    </div>
  );
}
