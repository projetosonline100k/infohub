import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, CalendarCheck, GripVertical, Loader2, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { estaAtrasada } from "@/hooks/useAtividadesDaAgenda";

export interface AtividadeArrastavel {
  id: string;
  titulo: string;
  descricao: string | null;
  tempoEstimado: number | null;
  clienteId: string | null;
  clienteNome: string;
  vencimento: string | null;
}

// Alvo de soltura: qualquer elemento da agenda marcado com
// data-agenda-drop="time" (grade de horários, 64px por hora) ou
// "allday" (célula do mês / faixa "dia todo"), mais data-agenda-date.
export interface DestinoAgenda { inicio: Date; diaInteiro: boolean }

const HOUR_HEIGHT = 64;
const SNAP_MINUTES = 15;

function destinoNoPonto(x: number, y: number): DestinoAgenda | null {
  const alvo = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-agenda-drop]");
  const dia = alvo?.dataset.agendaDate;
  if (!alvo || !dia) return null;
  const inicio = new Date(`${dia}T00:00:00`);
  if (alvo.dataset.agendaDrop === "allday") return { inicio, diaInteiro: true };
  const minutos = Math.floor(((y - alvo.getBoundingClientRect().top) / HOUR_HEIGHT) * (60 / SNAP_MINUTES)) * SNAP_MINUTES;
  inicio.setMinutes(Math.max(0, Math.min(23 * 60 + 45, minutos)));
  return { inicio, diaInteiro: false };
}

export function AtividadesArrastaveis({ onSoltar, onFechar, agendadas, onPrevia }: {
  onSoltar: (atividade: AtividadeArrastavel, destino: DestinoAgenda) => Promise<void>;
  // Onde a atividade vai cair (pra agenda desenhar o bloco), ou null.
  onPrevia: (previa: { titulo: string; inicio: Date; fim: Date; diaInteiro: boolean } | null) => void;
  onFechar: () => void;
  // Atividades que já estão na agenda (e quando) — aparecem em marrom.
  agendadas: Map<string, Date>;
}) {
  const [atividades, setAtividades] = useState<AtividadeArrastavel[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [projeto, setProjeto] = useState("todos");
  const [arrasto, setArrasto] = useState<{ atividade: AtividadeArrastavel; x: number; y: number; destino: DestinoAgenda | null } | null>(null);
  const [agendando, setAgendando] = useState<string | null>(null);
  const cancelado = useRef(false);

  useEffect(() => {
    cancelado.current = false;
    (async () => {
      const { data, error } = await supabase
        .from("atividades")
        .select("id, titulo, descricao, tempo_estimado, cliente_id, data_vencimento")
        .is("deleted_at", null)
        .eq("concluida", false)
        .order("data_atividade", { ascending: false })
        .limit(300);
      if (cancelado.current) return;
      if (error) { console.error("Erro ao carregar atividades:", error); setCarregando(false); return; }
      const clienteIds = Array.from(new Set((data || []).map((a) => a.cliente_id).filter(Boolean))) as string[];
      let nomes: Record<string, string> = {};
      if (clienteIds.length > 0) {
        const { data: clientes } = await supabase.from("clientes").select("id, nome_especialista").in("id", clienteIds);
        nomes = Object.fromEntries((clientes || []).map((c) => [c.id, c.nome_especialista]));
      }
      if (cancelado.current) return;
      setAtividades((data || []).map((a) => ({
        id: a.id, titulo: a.titulo, descricao: a.descricao, tempoEstimado: a.tempo_estimado,
        clienteId: a.cliente_id, clienteNome: a.cliente_id ? nomes[a.cliente_id] || "Projeto" : "Pessoal",
        vencimento: a.data_vencimento,
      })));
      setCarregando(false);
    })();
    return () => { cancelado.current = true; };
  }, []);

  const projetos = useMemo(() => {
    const mapa = new Map<string, string>();
    atividades.forEach((a) => mapa.set(a.clienteId || "pessoal", a.clienteNome));
    return [...mapa.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [atividades]);

  const visiveis = atividades.filter((a) =>
    (projeto === "todos" || (a.clienteId || "pessoal") === projeto) &&
    (!busca.trim() || a.titulo.toLowerCase().includes(busca.trim().toLowerCase())));

  const iniciarArrasto = (pointer: React.PointerEvent, atividade: AtividadeArrastavel) => {
    if (pointer.button !== 0 || agendando) return;
    pointer.preventDefault();
    const origemX = pointer.clientX;
    const origemY = pointer.clientY;
    let ativo = false;
    let destino: DestinoAgenda | null = null;
    const mover = (evento: PointerEvent) => {
      if (!ativo && Math.hypot(evento.clientX - origemX, evento.clientY - origemY) < 4) return;
      ativo = true;
      destino = destinoNoPonto(evento.clientX, evento.clientY);
      onPrevia(destino ? {
        titulo: atividade.titulo,
        inicio: destino.inicio,
        fim: new Date(destino.inicio.getTime() + (atividade.tempoEstimado || 60) * 60_000),
        diaInteiro: destino.diaInteiro,
      } : null);
      setArrasto({ atividade, x: evento.clientX, y: evento.clientY, destino });
    };
    const soltar = () => {
      window.removeEventListener("pointermove", mover);
      setArrasto(null);
      onPrevia(null);
      if (!ativo || !destino) return;
      setAgendando(atividade.id);
      void onSoltar(atividade, destino).finally(() => setAgendando(null));
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar, { once: true });
  };

  // O wrapper estica até a altura do calendário ao lado e o painel fica
  // preso nela (absolute), rolando a lista por dentro em vez de esticar a página.
  return <div className="relative w-64 shrink-0 max-md:absolute max-md:inset-y-0 max-md:right-0 max-md:z-[70] max-md:shadow-xl"><aside className="absolute inset-0 flex flex-col overflow-hidden rounded-xl border bg-card">
    <div className="flex items-center justify-between border-b p-3">
      <div>
        <p className="text-sm font-semibold">Atividades</p>
        <p className="text-[11px] text-muted-foreground">Arraste para a agenda</p>
      </div>
      <button type="button" onClick={onFechar} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Fechar atividades"><X className="h-4 w-4" /></button>
    </div>
    <div className="space-y-2 border-b p-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar atividade..." className="h-8 pl-8 text-sm" />
      </div>
      <select value={projeto} onChange={(e) => setProjeto(e.target.value)} className="h-8 w-full rounded-md border bg-background px-2 text-sm" aria-label="Filtrar por projeto">
        <option value="todos">Todos os projetos</option>
        {projetos.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
      </select>
    </div>
    <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
      {carregando ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        : visiveis.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma atividade aberta</p>
        : visiveis.map((atividade) => {
          const agendadaEm = agendadas.get(atividade.id);
          const atrasada = estaAtrasada(atividade.vencimento, false);
          return (
          // Já agendada: marrom, pra sinalizar que essa atividade já foi usada.
          <div key={atividade.id} onPointerDown={(pointer) => iniciarArrasto(pointer, atividade)}
            className={cn("flex cursor-grab touch-none select-none items-start gap-1.5 rounded-md border p-2 text-sm",
              agendadaEm ? "border-[#8b5a2b]/60 bg-[#8b5a2b]/20 hover:border-[#8b5a2b]" : "bg-background hover:border-primary/50",
              arrasto?.atividade.id === atividade.id && "opacity-40", agendando === atividade.id && "opacity-60")}>
            <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 leading-snug">{atividade.titulo}</p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{agendando === atividade.id ? "Agendando..." : `${atividade.clienteNome}${atividade.tempoEstimado ? ` · ${atividade.tempoEstimado}min` : ""}`}</p>
              {(agendadaEm || atrasada) && <div className="mt-1 flex flex-wrap gap-1">
                {agendadaEm && <span className="flex items-center gap-1 rounded bg-[#8b5a2b] px-1.5 py-0.5 text-[10px] font-medium text-white"><CalendarCheck className="h-3 w-3" />{format(agendadaEm, "EEE d/MM · HH:mm", { locale: ptBR })}</span>}
                {atrasada && <span className="flex items-center gap-1 rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-medium text-destructive"><AlertTriangle className="h-3 w-3" />Atrasada · venceu {format(new Date(`${atividade.vencimento!.slice(0, 10)}T12:00:00`), "dd/MM")}</span>}
              </div>}
            </div>
          </div>
          );
        })}
    </div>
    {/* Portal pro body: dentro da guia (que "prende" camadas fixas, ver
        WorkspacePages) a prévia ficaria deslocada do mouse. */}
    {arrasto && createPortal(<div className="pointer-events-none fixed z-[300] w-56 rounded-md border bg-background px-3 py-2 text-sm shadow-lg" style={{ left: arrasto.x + 12, top: arrasto.y + 8 }}>
      <p className="truncate font-medium">{arrasto.atividade.titulo}</p>
      <p className="text-[11px] text-muted-foreground">{arrasto.destino
        ? arrasto.destino.diaInteiro ? `${format(arrasto.destino.inicio, "EEE, d MMM", { locale: ptBR })} · dia todo` : format(arrasto.destino.inicio, "EEE, d MMM · HH:mm", { locale: ptBR })
        : "Solte num dia ou horário"}</p>
    </div>, document.body)}
  </aside></div>;
}
