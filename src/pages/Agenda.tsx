import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDays, addMonths, addWeeks, eachDayOfInterval, endOfDay, endOfMonth, endOfWeek,
  format, isSameDay, isSameMonth, isToday, startOfDay, startOfMonth, startOfWeek,
  subDays, subMonths, subWeeks,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, CalendarDays, ChevronLeft, ListTodo, ChevronRight, Loader2, LogOut, MailQuestion, PanelLeftClose, PanelLeftOpen, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { atividadeDoEvento, corDoTexto, entradaDoEvento, GOOGLE_EVENT_COLORS, GoogleCalendarEvent, propriedadesInfopro, statusConvite, type StatusConvite } from "@/lib/googleCalendar";
import { estaAtrasada, useAtividadesDaAgenda, type AtividadeVinculada } from "@/hooks/useAtividadesDaAgenda";
import { AtividadeDetailPanel } from "@/components/atividades/AtividadeDetailPanel";
import { supabase } from "@/integrations/supabase/client";
import { distribuirSobrepostos, PosicaoEvento } from "@/lib/agendaLayout";
import { useGoogleCalendar } from "@/hooks/useGoogleCalendar";
import { EventoDialog, type AtividadeDoEvento } from "@/components/agenda/EventoDialog";
import { AtividadeArrastavel, AtividadesArrastaveis, DestinoAgenda } from "@/components/agenda/AtividadesArrastaveis";
import { toast } from "sonner";

type View = "month" | "week" | "day";
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

const eventStart = (event: GoogleCalendarEvent) => new Date(event.start.dateTime || `${event.start.date}T00:00:00`);
const eventEnd = (event: GoogleCalendarEvent) => new Date(event.end.dateTime || `${event.end.date}T00:00:00`);

export default function Agenda() {
  const [anchor, setAnchor] = useState(new Date());
  const [view, setView] = useState<View>("month");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogDate, setDialogDate] = useState(new Date());
  const [dialogEnd, setDialogEnd] = useState<Date | undefined>();
  const [selectedEvent, setSelectedEvent] = useState<GoogleCalendarEvent | null>(null);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [atividadesVisiveis, setAtividadesVisiveis] = useState(false);
  const [cardAtividadeId, setCardAtividadeId] = useState<string | null>(null);
  // Bloco tracejado de "onde a atividade vai cair" enquanto arrasta do painel.
  const [previaDrop, setPreviaDrop] = useState<PreviaDrop | null>(null);
  const [colunasCard, setColunasCard] = useState<{ status_key: string; nome: string; eh_conclusao: boolean }[]>([]);
  const calendar = useGoogleCalendar(anchor);
  const vinculadas = useAtividadesDaAgenda(calendar.events, atividadesVisiveis);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("google_calendar") === "connected") toast.success("Google Calendar conectado");
    if (params.get("google_calendar") === "error") toast.error(params.get("message") || "Nao foi possivel conectar");
    if (params.has("google_calendar")) window.history.replaceState({}, "", "/agenda");
  }, []);

  const calendarById = useMemo(() => new Map(calendar.calendars.map((item) => [item.id, item])), [calendar.calendars]);
  const colorFor = (event: GoogleCalendarEvent) => GOOGLE_EVENT_COLORS[event.colorId || ""] || calendarById.get(event.calendarId)?.backgroundColor || "hsl(var(--primary))";

  const openNew = (date = new Date(), end?: Date) => {
    const next = new Date(date);
    if (next.getHours() === 0) next.setHours(9, 0, 0, 0);
    setDialogDate(next);
    setDialogEnd(end);
    setSelectedEvent(null);
    setDialogOpen(true);
  };
  const openEvent = (event: GoogleCalendarEvent) => {
    setSelectedEvent(event);
    setDialogDate(eventStart(event));
    setDialogEnd(undefined);
    setDialogOpen(true);
  };

  // Usado tanto ao redimensionar quanto ao arrastar o evento pra outro horário/dia.
  const rescheduleEvent = async (event: GoogleCalendarEvent, start: Date, end: Date) => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      // Parte do evento atual: o update do Google substitui tudo, e sem isso
      // mover o evento apagava convidados, alarme e a atividade vinculada.
      await calendar.saveEvent(event.calendarId, entradaDoEvento(event, {
        start: { dateTime: start.toISOString(), timeZone },
        end: { dateTime: end.toISOString(), timeZone },
      }), event);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel alterar o horario do evento");
    }
  };

  // Atividade solta na agenda vira evento no calendário principal: na grade
  // de horários usa o tempo estimado (ou 1h); no mês/faixa "dia todo" vira
  // evento de dia inteiro.
  const agendarAtividade = async (atividade: AtividadeArrastavel, destino: DestinoAgenda) => {
    const writable = calendar.calendars.filter((item) => ["writer", "owner"].includes(item.accessRole));
    const calendarId = (writable.find((item) => item.primary) || writable[0])?.id;
    if (!calendarId) { toast.error("Nenhum calendario com permissao de escrita"); return; }
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const descricao = [`Projeto: ${atividade.clienteNome}`, atividade.descricao].filter(Boolean).join("\n\n");
    const fim = new Date(destino.inicio.getTime() + (atividade.tempoEstimado || 60) * 60_000);
    try {
      await calendar.saveEvent(calendarId, destino.diaInteiro ? {
        summary: atividade.titulo, description: descricao,
        extendedProperties: propriedadesInfopro(undefined, { atividadeId: atividade.id }),
        start: { date: format(destino.inicio, "yyyy-MM-dd") },
        end: { date: format(addDays(destino.inicio, 1), "yyyy-MM-dd") },
      } : {
        summary: atividade.titulo, description: descricao,
        extendedProperties: propriedadesInfopro(undefined, { atividadeId: atividade.id }),
        start: { dateTime: destino.inicio.toISOString(), timeZone },
        end: { dateTime: fim.toISOString(), timeZone },
      });
      toast.success(`"${atividade.titulo}" agendada`);
      vinculadas.recarregar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel agendar a atividade");
    }
  };

  // Evento que veio de uma atividade: dados do card pra mostrar no evento.
  const atividadeSelecionada = selectedEvent ? vinculadas.porId[atividadeDoEvento(selectedEvent) || ""] : undefined;
  const nomeColuna = (statusKey: string) => colunasCard.find((coluna) => coluna.status_key === statusKey)?.nome
    || statusKey.replace(/_/g, " ").replace(/^./, (letra) => letra.toUpperCase());
  const resumoAtividade: AtividadeDoEvento | null = atividadeSelecionada ? {
    titulo: atividadeSelecionada.titulo,
    projeto: atividadeSelecionada.clienteNome,
    status: nomeColuna(atividadeSelecionada.status),
    prioridade: atividadeSelecionada.prioridade,
    vencimento: atividadeSelecionada.data_vencimento,
    atrasada: estaAtrasada(atividadeSelecionada.data_vencimento, atividadeSelecionada.concluida),
    concluida: atividadeSelecionada.concluida,
    tempoEstimado: atividadeSelecionada.tempo_estimado,
    descricao: atividadeSelecionada.descricao,
  } : null;

  // Colunas (status) do quadro do projeto da atividade — nomes dos status e
  // o painel completo do card precisam delas.
  useEffect(() => {
    if (!atividadeSelecionada && !cardAtividadeId) return;
    const clienteId = (atividadeSelecionada || vinculadas.porId[cardAtividadeId || ""])?.cliente_id ?? null;
    let cancelado = false;
    let query = supabase.from("colunas_atividade").select("nome, status_key, eh_conclusao, ordem").order("ordem", { ascending: true });
    query = clienteId ? query.eq("cliente_id", clienteId) : query.is("cliente_id", null);
    void query.then(({ data }) => { if (!cancelado) setColunasCard(data || []); });
    return () => { cancelado = true; };
  }, [atividadeSelecionada, cardAtividadeId, vinculadas.porId]);

  const excluirAtividadeDoCard = async (id: string) => {
    const { error } = await supabase.from("atividades").delete().eq("id", id);
    if (error) { toast.error("Nao foi possivel excluir a atividade"); return; }
    setCardAtividadeId(null);
    vinculadas.recarregar();
  };

  const navigate = (direction: -1 | 1) => {
    if (view === "month") setAnchor(direction > 0 ? addMonths(anchor, 1) : subMonths(anchor, 1));
    if (view === "week") setAnchor(direction > 0 ? addWeeks(anchor, 1) : subWeeks(anchor, 1));
    if (view === "day") setAnchor(direction > 0 ? addDays(anchor, 1) : subDays(anchor, 1));
  };

  if (calendar.loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;

  if (!calendar.connected) {
    return (
      <div className="mx-auto flex min-h-[65vh] max-w-xl items-center justify-center">
        <div className="w-full rounded-2xl border bg-card p-10 text-center shadow-sm">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10"><CalendarDays className="h-8 w-8 text-primary" /></div>
          <h1 className="text-2xl font-bold">Sua agenda no Infopro Hub</h1>
          <p className="mt-3 text-muted-foreground">Conecte sua conta Google para visualizar todos os calendarios e criar, editar ou excluir eventos sem sair do sistema.</p>
          <Button className="mt-7" size="lg" onClick={() => calendar.connect().catch((error) => toast.error(error.message))}>Conectar Google Calendar</Button>
          <p className="mt-4 text-xs text-muted-foreground">O Infopro Hub nunca recebe sua senha do Google.</p>
        </div>
      </div>
    );
  }

  const title = view === "day"
    ? format(anchor, "d 'de' MMMM 'de' yyyy", { locale: ptBR })
    : view === "week"
      ? `${format(startOfWeek(anchor), "d MMM", { locale: ptBR })} – ${format(endOfWeek(anchor), "d MMM yyyy", { locale: ptBR })}`
      : format(anchor, "MMMM 'de' yyyy", { locale: ptBR });

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold capitalize">Agenda</h1>
          <p className="text-sm text-muted-foreground">Sincronizada com {calendar.email}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" title="Atualizar" onClick={() => calendar.reload()} disabled={calendar.loadingEvents}><RefreshCw className={cn("h-4 w-4", calendar.loadingEvents && "animate-spin")} /></Button>
          <Button variant="outline" size="icon" title={sidebarVisible ? "Ocultar calendários" : "Mostrar calendários"} onClick={() => setSidebarVisible((visible) => !visible)}><span className="sr-only">{sidebarVisible ? "Ocultar calendários" : "Mostrar calendários"}</span>{sidebarVisible ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}</Button>
          <Button variant={atividadesVisiveis ? "secondary" : "outline"} onClick={() => setAtividadesVisiveis((visible) => !visible)}><ListTodo className="mr-2 h-4 w-4" />Atividades</Button>
          <Button onClick={() => openNew()}><Plus className="mr-2 h-4 w-4" />Novo evento</Button>
        </div>
      </header>

      <div className="relative flex flex-1 gap-4 overflow-hidden">
        <aside className={cn("hidden w-56 shrink-0 rounded-xl border bg-card p-4 lg:block", !sidebarVisible && "lg:hidden")}>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Meus calendarios</p>
          <div className="space-y-2">
            {calendar.calendars.map((item) => (
              <label key={item.id} className="flex cursor-pointer items-center gap-2 rounded-md p-1.5 text-sm hover:bg-muted">
                <input type="checkbox" checked={calendar.selectedIds.includes(item.id)} onChange={() => calendar.toggleCalendar(item.id)} className="h-4 w-4 rounded" style={{ accentColor: item.backgroundColor }} />
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: item.backgroundColor }} />
                <span className="truncate">{item.summary}</span>
              </label>
            ))}
          </div>
          <Button variant="ghost" size="sm" className="mt-6 w-full justify-start text-muted-foreground" onClick={() => calendar.disconnect().catch((error) => toast.error(error.message))}><LogOut className="mr-2 h-4 w-4" />Desconectar</Button>
        </aside>

        {/* Semana: 7 colunas de no mínimo 110px + coluna das horas. Essa largura
            mínima "sobe" até a página, que rola pro lado em janela estreita,
            em vez de o calendário rolar escondido por dentro. */}
        <section className="min-w-0 flex-1 overflow-hidden rounded-xl border bg-card" style={{ minWidth: view === "week" ? 64 + 7 * 110 : undefined }}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-3">
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())}>Hoje</Button>
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => navigate(1)}><ChevronRight className="h-4 w-4" /></Button>
              <h2 className="ml-2 text-base font-semibold capitalize sm:text-lg">{title}</h2>
            </div>
            <div className="flex rounded-lg border p-0.5">
              {(["month", "week", "day"] as View[]).map((item) => (
                <button key={item} onClick={() => setView(item)} className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-colors", view === item ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>{item === "month" ? "Mes" : item === "week" ? "Semana" : "Dia"}</button>
              ))}
            </div>
          </div>
          {view === "month" ? (
            <MonthView anchor={anchor} events={calendar.events} colorFor={colorFor} onNew={openNew} onEvent={openEvent} atividades={vinculadas.porId} previa={previaDrop} />
          ) : (
            <TimeGrid anchor={anchor} view={view} events={calendar.events} colorFor={colorFor} onNew={openNew} onEvent={openEvent} onReschedule={rescheduleEvent} atividades={vinculadas.porId} previa={previaDrop} />
          )}
        </section>

        {atividadesVisiveis && <AtividadesArrastaveis onSoltar={agendarAtividade} onFechar={() => setAtividadesVisiveis(false)} agendadas={vinculadas.agendadas} onPrevia={setPreviaDrop} />}
      </div>

      <EventoDialog open={dialogOpen} onOpenChange={setDialogOpen} initialDate={dialogDate} initialEnd={dialogEnd} event={selectedEvent} calendars={calendar.calendars} onSave={calendar.saveEvent} onDelete={calendar.deleteEvent} onResponder={calendar.responderConvite}
        atividade={resumoAtividade} onAbrirAtividade={atividadeSelecionada ? () => { setCardAtividadeId(atividadeSelecionada.id); setDialogOpen(false); } : undefined} />

      {/* Card completo da atividade (o mesmo painel da tela de Atividades). */}
      <AtividadeDetailPanel
        open={cardAtividadeId !== null}
        onClose={() => setCardAtividadeId(null)}
        atividade={cardAtividadeId ? vinculadas.porId[cardAtividadeId] ?? null : null}
        colunas={colunasCard}
        onUpdate={vinculadas.recarregar}
        onDelete={(id) => void excluirAtividadeDoCard(id)}
      />
    </div>
  );
}

type AtividadesPorId = Record<string, AtividadeVinculada>;
type PreviaDrop = { titulo: string; inicio: Date; fim: Date; diaInteiro: boolean };

// "45min", "2h", "2h 30min".
function duracaoTexto(minutos: number): string {
  const total = Math.max(0, Math.round(minutos));
  if (total < 60) return `${total}min`;
  const horas = Math.floor(total / 60);
  const resto = total % 60;
  return resto ? `${horas}h ${resto}min` : `${horas}h`;
}

// Marca de evento que veio de uma atividade: é atividade? está atrasada?
function marcaAtividade(event: GoogleCalendarEvent, atividades: AtividadesPorId) {
  const id = atividadeDoEvento(event);
  if (!id) return null;
  const atividade = atividades[id];
  return { atrasada: !!atividade && estaAtrasada(atividade.data_vencimento, atividade.concluida) };
}

function MonthView({ anchor, events, colorFor, onNew, onEvent, atividades, previa }: {
  anchor: Date; events: GoogleCalendarEvent[]; colorFor: (event: GoogleCalendarEvent) => string;
  onNew: (date: Date) => void; onEvent: (event: GoogleCalendarEvent) => void; atividades: AtividadesPorId;
  previa: PreviaDrop | null;
}) {
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(anchor), { weekStartsOn: 0 }),
    end: endOfWeek(endOfMonth(anchor), { weekStartsOn: 0 }),
  });
  return (
    <div className="flex h-[calc(100vh-15.5rem)] min-h-[560px] flex-col overflow-auto">
      <div className="grid grid-cols-7 border-b bg-muted/30">
        {eachDayOfInterval({ start: startOfWeek(new Date()), end: endOfWeek(new Date()) }).map((day) => <div key={day.toISOString()} className="p-2 text-center text-xs font-semibold uppercase text-muted-foreground">{format(day, "EEE", { locale: ptBR })}</div>)}
      </div>
      <div className="grid flex-1 grid-cols-7 auto-rows-fr">
        {days.map((day) => {
          const dayEvents = events.filter((event) => {
            const start = startOfDay(eventStart(event));
            const end = event.start.date ? subDays(startOfDay(eventEnd(event)), 1) : eventEnd(event);
            return day >= start && day <= end;
          });
          return (
            <div key={day.toISOString()} data-agenda-drop="allday" data-agenda-date={format(day, "yyyy-MM-dd")} onDoubleClick={() => onNew(day)} className={cn("min-h-24 border-b border-r p-1.5", !isSameMonth(day, anchor) && "bg-muted/20 text-muted-foreground", previa && isSameDay(previa.inicio, day) && "bg-primary/15 ring-2 ring-inset ring-primary")}>
              <button onClick={() => onNew(day)} className={cn("mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs", isToday(day) && "bg-primary font-semibold text-primary-foreground")}>{format(day, "d")}</button>
              <div className="space-y-1">
                {dayEvents.slice(0, 4).map((event) => <EventChip key={`${event.calendarId}-${event.id}`} event={event} color={colorFor(event)} marca={marcaAtividade(event, atividades)} onClick={() => onEvent(event)} />)}
                {dayEvents.length > 4 && <p className="px-1 text-xs text-muted-foreground">+{dayEvents.length - 4} eventos</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const eventKey = (event: GoogleCalendarEvent) => `${event.calendarId}-${event.id}`;
const minutesOfDay = (date: Date, day: Date) => (date.getTime() - startOfDay(day).getTime()) / 60_000;

function TimeGrid({ anchor, view, events, colorFor, onNew, onEvent, onReschedule, atividades, previa }: {
  anchor: Date; view: "week" | "day"; events: GoogleCalendarEvent[]; colorFor: (event: GoogleCalendarEvent) => string;
  onNew: (date: Date, end?: Date) => void; onEvent: (event: GoogleCalendarEvent) => void;
  onReschedule: (event: GoogleCalendarEvent, start: Date, end: Date) => Promise<void>;
  atividades: AtividadesPorId;
  previa: PreviaDrop | null;
}) {
  const days = view === "day" ? [anchor] : eachDayOfInterval({ start: startOfWeek(anchor), end: endOfWeek(anchor) });
  const allDay = events.filter((event) => event.start.date && days.some((day) => isSameDay(day, eventStart(event))));
  const scrollArea = useRef<HTMLDivElement>(null);
  const scrolledToToday = useRef<string | null>(null);
  const [now, setNow] = useState(new Date());
  const todayIndex = days.findIndex((day) => isSameDay(day, now));
  const nowTop = now.getHours() * 64 + now.getMinutes() / 60 * 64;
  const todayKey = todayIndex >= 0 ? format(days[todayIndex], "yyyy-MM-dd") : null;

  useEffect(() => {
    const refresh = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(refresh);
  }, []);

  useEffect(() => {
    if (!todayKey) {
      scrolledToToday.current = null;
      return;
    }
    if (scrolledToToday.current === todayKey) return;
    const frame = window.requestAnimationFrame(() => {
      scrollArea.current?.scrollTo({ top: Math.max(0, nowTop - 260) });
      scrolledToToday.current = todayKey;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [nowTop, todayKey]);

  // isolate: as camadas internas (cabeçalho fixo, eventos, linha de agora)
  // ficam presas dentro do calendário — sem isso o cabeçalho aparecia por
  // cima das janelas (ex.: "Novo evento").
  return (
    <div ref={scrollArea} className="isolate h-[calc(100vh-15.5rem)] min-h-[560px] overflow-auto">
      <div className="sticky top-0 z-[60] grid border-b bg-card" style={{ gridTemplateColumns: `4rem repeat(${days.length}, minmax(110px, 1fr))` }}>
        <div />
        {days.map((day) => <div key={day.toISOString()} className="border-l p-2 text-center"><p className="text-xs uppercase text-muted-foreground">{format(day, "EEE", { locale: ptBR })}</p><p className={cn("mx-auto mt-1 flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold", isToday(day) && "bg-primary text-primary-foreground")}>{format(day, "d")}</p></div>)}
        {allDay.length > 0 && <><div className="border-t p-1 text-right text-[10px] text-muted-foreground">dia todo</div>{days.map((day) => <div key={`all-${day.toISOString()}`} data-agenda-drop="allday" data-agenda-date={format(day, "yyyy-MM-dd")} className="min-h-7 border-l border-t p-1">{allDay.filter((event) => isSameDay(eventStart(event), day)).map((event) => <EventChip key={event.id} event={event} color={colorFor(event)} marca={marcaAtividade(event, atividades)} onClick={() => onEvent(event)} />)}</div>)}</>}
      </div>
      <div className="relative grid" style={{ gridTemplateColumns: `4rem repeat(${days.length}, minmax(110px, 1fr))` }}>
        <div>{HOURS.map((hour) => <div key={hour} className="h-16 border-b pr-2 text-right text-[10px] text-muted-foreground">{String(hour).padStart(2, "0")}:00</div>)}</div>
        {days.map((day, dayIndex) => {
          const dayEvents = events.filter((event) => !event.start.date && isSameDay(eventStart(event), day));
          const layout = distribuirSobrepostos(dayEvents.map((event) => ({ key: eventKey(event), inicio: minutesOfDay(eventStart(event), day), fim: minutesOfDay(eventEnd(event), day) })));
          return <GridDay key={day.toISOString()} day={day} onNew={onNew} previa={previa && !previa.diaInteiro && isSameDay(previa.inicio, day) ? previa : null}>
            {dayEvents.map((event) => <TimedEvent key={eventKey(event)} event={event} color={colorFor(event)} position={layout.get(eventKey(event)) || { left: 0, width: 100, z: 1 }} dayIndex={dayIndex} dayCount={days.length} marca={marcaAtividade(event, atividades)} onOpen={onEvent} onReschedule={onReschedule} />)}
          </GridDay>;
        })}
        {todayIndex >= 0 && <div className="pointer-events-none absolute z-[45] border-t-2 border-red-500" style={{ top: nowTop, left: `calc(4rem + ${todayIndex} * (100% - 4rem) / ${days.length})`, width: `calc((100% - 4rem) / ${days.length})` }}><span className="absolute -left-2 -top-1.5 h-3 w-3 rounded-full bg-red-500" /></div>}
      </div>
    </div>
  );
}

function GridDay({ day, onNew, previa, children }: { day: Date; onNew: (date: Date, end?: Date) => void; previa: PreviaDrop | null; children: React.ReactNode }) {
  const [selection, setSelection] = useState<{ start: Date; end: Date } | null>(null);

  const dateAt = (clientY: number, element: HTMLDivElement) => {
    const bounds = element.getBoundingClientRect();
    const minutes = Math.max(0, Math.min(23 * 60 + 45, Math.floor(((clientY - bounds.top) / 64) * 4) * 15));
    const date = new Date(day);
    date.setHours(0, minutes, 0, 0);
    return date;
  };

  const startSelection = (pointer: React.PointerEvent<HTMLDivElement>) => {
    if (pointer.button !== 0) return;
    const origin = dateAt(pointer.clientY, pointer.currentTarget);
    const element = pointer.currentTarget;
    let current = origin;
    let moved = false;
    const move = (moveEvent: PointerEvent) => {
      current = dateAt(moveEvent.clientY, element);
      moved ||= Math.abs(moveEvent.clientY - pointer.clientY) > 4;
      const first = current < origin ? current : origin;
      const last = current < origin ? origin : current;
      setSelection({ start: first, end: new Date(last.getTime() + 15 * 60_000) });
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      setSelection(null);
      if (!moved) onNew(origin);
      else {
        const first = current < origin ? current : origin;
        const last = current < origin ? origin : current;
        onNew(first, new Date(last.getTime() + 15 * 60_000));
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
  };

  const top = selection ? selection.start.getHours() * 64 + selection.start.getMinutes() / 60 * 64 : 0;
  const height = selection ? Math.max(16, (selection.end.getTime() - selection.start.getTime()) / 3_600_000 * 64) : 0;
  return <div onPointerDown={startSelection} data-agenda-drop="time" data-agenda-date={format(day, "yyyy-MM-dd")} className="relative border-l select-none">
    {HOURS.map((hour) => <div key={hour} className="h-16 border-b hover:bg-primary/5" />)}
    {selection && (
      // Mostra, enquanto arrasta, quanto tempo o evento vai ocupar.
      <div className="pointer-events-none absolute inset-x-1 z-[1] overflow-hidden rounded bg-primary/30 px-1.5 py-0.5 text-xs leading-tight ring-1 ring-primary" style={{ top, height }}>
        <p className="font-bold">{duracaoTexto((selection.end.getTime() - selection.start.getTime()) / 60_000)}</p>
        {height >= 30 && <p className="whitespace-nowrap text-[11px] tabular-nums opacity-80">{format(selection.start, "HH:mm")}–{format(selection.end, "HH:mm")}</p>}
      </div>
    )}
    {previa && (
      // Onde a atividade arrastada do painel vai cair (já no tamanho certo).
      <div className="pointer-events-none absolute inset-x-1 z-[48] overflow-hidden rounded-md border-2 border-dashed border-primary bg-primary/25 px-1.5 py-1 text-xs shadow-lg"
        style={{ top: (previa.inicio.getHours() * 60 + previa.inicio.getMinutes()) / 60 * 64, height: Math.max(20, (previa.fim.getTime() - previa.inicio.getTime()) / 3_600_000 * 64) }}>
        <p className="truncate font-semibold">{previa.titulo}</p>
        <p className="truncate">{format(previa.inicio, "HH:mm")} – {format(previa.fim, "HH:mm")} · {duracaoTexto((previa.fim.getTime() - previa.inicio.getTime()) / 60_000)}</p>
      </div>
    )}
    {children}
  </div>;
}

const SNAP_MINUTES = 15;
const HOUR_HEIGHT = 64;

// Visual dos convites, como no Google Agenda: pendente = só contorno
// tracejado (falta responder); talvez = listrado; recusado = apagado e riscado.
function estiloConvite(color: string, status: StatusConvite | null): { style: React.CSSProperties; className?: string } {
  if (status === "pendente") return { style: { background: "hsl(var(--background))", color, border: `2px dashed ${color}` } };
  if (status === "talvez") return { style: { background: `repeating-linear-gradient(135deg, ${color} 0 6px, color-mix(in srgb, ${color} 55%, white) 6px 12px)`, color: corDoTexto(color) } };
  if (status === "recusado") return { style: { background: "hsl(var(--background))", color, border: `1px solid ${color}` }, className: "opacity-60 line-through" };
  return { style: { background: color, color: corDoTexto(color) } };
}
const ROTULO_CONVITE: Record<StatusConvite, string> = { pendente: "Convite: falta responder", talvez: "Convite: você respondeu talvez", recusado: "Convite recusado" };

function TimedEvent({ event, color, position, dayIndex, dayCount, marca, onOpen, onReschedule }: {
  event: GoogleCalendarEvent; color: string; position: PosicaoEvento; dayIndex: number; dayCount: number;
  marca: { atrasada: boolean } | null;
  onOpen: (event: GoogleCalendarEvent) => void;
  onReschedule: (event: GoogleCalendarEvent, start: Date, end: Date) => Promise<void>;
}) {
  // dayShift/columnWidth só existem enquanto o evento é arrastado pra outro dia.
  const [draft, setDraft] = useState<{ start: Date; end: Date; dayShift: number; columnWidth: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const ignoreClick = useRef(false);
  const start = draft?.start || eventStart(event);
  const end = draft?.end || eventEnd(event);
  // Ao mudar de dia, a posição vertical é relativa ao dia de destino.
  const top = start.getHours() * HOUR_HEIGHT + start.getMinutes() / 60 * HOUR_HEIGHT;
  const height = (end.getTime() - start.getTime()) / 3_600_000 * HOUR_HEIGHT;

  // Mantém o rascunho até o Google confirmar e a lista recarregar, pra não
  // "pular" de volta pro horário antigo enquanto salva.
  const commit = (nextStart: Date, nextEnd: Date, originalStart: Date, originalEnd: Date) => {
    // O clique que o navegador dispara ao soltar não deve abrir o evento;
    // a flag é zerada no próximo pointerdown.
    ignoreClick.current = true;
    const changed = nextStart.getTime() !== originalStart.getTime() || nextEnd.getTime() !== originalEnd.getTime();
    if (!changed) { setDraft(null); return; }
    setSaving(true);
    void onReschedule(event, nextStart, nextEnd).finally(() => { setSaving(false); setDraft(null); });
  };

  const beginResize = (edge: "start" | "end", pointer: React.PointerEvent<HTMLDivElement>) => {
    if (pointer.button !== 0 || saving) return;
    ignoreClick.current = false;
    pointer.preventDefault();
    pointer.stopPropagation();
    const originalStart = eventStart(event);
    const originalEnd = eventEnd(event);
    const originY = pointer.clientY;
    let nextStart = originalStart;
    let nextEnd = originalEnd;
    const move = (moveEvent: PointerEvent) => {
      const minutes = Math.round(((moveEvent.clientY - originY) / HOUR_HEIGHT) * (60 / SNAP_MINUTES)) * SNAP_MINUTES;
      if (edge === "start") nextStart = new Date(Math.min(originalStart.getTime() + minutes * 60_000, originalEnd.getTime() - SNAP_MINUTES * 60_000));
      else nextEnd = new Date(Math.max(originalEnd.getTime() + minutes * 60_000, originalStart.getTime() + SNAP_MINUTES * 60_000));
      setDraft({ start: nextStart, end: nextEnd, dayShift: 0, columnWidth: 0 });
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      commit(nextStart, nextEnd, originalStart, originalEnd);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
  };

  // Arrastar o corpo do evento move ele inteiro (mantendo a duração), em
  // passos de 15 min na vertical e de um dia por coluna na horizontal.
  const beginMove = (pointer: React.PointerEvent<HTMLDivElement>) => {
    pointer.stopPropagation();
    if (pointer.button !== 0 || saving) return;
    ignoreClick.current = false;
    const column = pointer.currentTarget.parentElement;
    const columnWidth = column?.getBoundingClientRect().width || 1;
    const originalStart = eventStart(event);
    const originalEnd = eventEnd(event);
    const duration = originalEnd.getTime() - originalStart.getTime();
    const startMinutes = originalStart.getHours() * 60 + originalStart.getMinutes();
    const maxStartMinutes = Math.max(0, 24 * 60 - Math.min(duration / 60_000, 24 * 60));
    const originX = pointer.clientX;
    const originY = pointer.clientY;
    let moved = false;
    let nextStart = originalStart;
    let nextEnd = originalEnd;
    const move = (moveEvent: PointerEvent) => {
      if (!moved && Math.hypot(moveEvent.clientX - originX, moveEvent.clientY - originY) < 4) return;
      if (!moved) { moved = true; setDragging(true); }
      const deltaMinutes = Math.round(((moveEvent.clientY - originY) / HOUR_HEIGHT) * (60 / SNAP_MINUTES)) * SNAP_MINUTES;
      const newStartMinutes = Math.max(0, Math.min(maxStartMinutes, startMinutes + deltaMinutes));
      const dayShift = Math.max(-dayIndex, Math.min(dayCount - 1 - dayIndex, Math.round((moveEvent.clientX - originX) / columnWidth)));
      nextStart = addDays(startOfDay(originalStart), dayShift);
      nextStart.setMinutes(newStartMinutes);
      nextEnd = new Date(nextStart.getTime() + duration);
      setDraft({ start: nextStart, end: nextEnd, dayShift, columnWidth });
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      setDragging(false);
      if (!moved) return;
      commit(nextStart, nextEnd, originalStart, originalEnd);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
  };

  // Posição calculada em distribuirSobrepostos (lado a lado ou encaixado por
  // cima, como no Google). Sobra uma faixa à direita pra clicar e criar
  // evento novo no mesmo horário. Ao arrastar, ocupa a coluna toda.
  const fullWidth = dragging || !!draft?.dayShift;
  const horizontal = fullWidth
    ? { left: 2, width: "calc(100% - 12px)" }
    : { left: `calc(${position.left} * (100% - 12px) / 100 + 2px)`, width: `calc(${position.width} * (100% - 12px) / 100 - 1px)` };
  const minutes = (end.getTime() - start.getTime()) / 60_000;
  const title = event.summary || "Sem titulo";
  const duracao = duracaoTexto(minutes);
  const horario = `${format(start, "HH:mm")}–${format(end, "HH:mm")}`;
  const convite = statusConvite(event);
  const visual = estiloConvite(color, convite);

  return <div role="button" tabIndex={0} title={`${title}\n${horario} · ${duracao}${convite ? `\n${ROTULO_CONVITE[convite]}` : ""}`} onPointerDown={beginMove} onClick={() => { if (!ignoreClick.current) onOpen(event); }} onKeyDown={(key) => { if (key.key === "Enter" || key.key === " ") onOpen(event); }}
    className={cn("absolute overflow-hidden rounded-md border border-card px-1.5 text-left text-xs leading-tight focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1", minutes < 50 ? "py-0.5" : "py-1", dragging ? "cursor-grabbing opacity-90 shadow-lg" : "cursor-grab", saving && "opacity-80", visual.className)}
    style={{ top, height: Math.max(20, height - 1), ...horizontal, zIndex: dragging ? 50 : Math.min(position.z, 40), ...visual.style, transform: draft?.dayShift ? `translateX(${draft.dayShift * draft.columnWidth}px)` : undefined }}>
    <div onPointerDown={(pointer) => beginResize("start", pointer)} className="absolute inset-x-0 top-0 h-1.5 cursor-ns-resize" aria-label="Arraste para alterar o início" />
    {/* A duração vem primeiro e em negrito: em coluna estreita, o que corta
        é o horário, nunca o "quanto tempo leva". */}
    {minutes < 50
      // Evento curto: uma linha, "Título ······ 45min".
      ? <p className="flex items-center gap-1">{convite === "pendente" && <MailQuestion className="h-3 w-3 shrink-0" aria-label="Convite pendente" />}{marca && <ListTodo className="h-3 w-3 shrink-0" />}<span className="min-w-0 flex-1 truncate font-medium">{title}</span>{marca?.atrasada && <AlertTriangle className="h-3 w-3 shrink-0 text-red-600" aria-label="Atrasada" />}<span className="shrink-0 font-bold">{saving ? "…" : duracao}</span></p>
      : <>
        {/* Bloco de até ~1h15: título numa linha só, pra caber duração e horário. */}
        <p className={cn("font-medium", minutes < 75 ? "truncate" : "line-clamp-2")}>{convite === "pendente" && <MailQuestion className="mr-1 inline h-3 w-3 align-[-2px]" aria-label="Convite pendente" />}{marca && <ListTodo className="mr-1 inline h-3 w-3 align-[-2px]" />}{title}</p>
        <p className="truncate font-bold">{saving ? "Salvando..." : duracao}</p>
        {/* Horário em linha própria e compacto, pra não ser cortado em coluna estreita. */}
        {!saving && <p className="whitespace-nowrap text-[11px] tabular-nums opacity-80">{horario}</p>}
      </>}
    {marca?.atrasada && minutes >= 50 && <span className="absolute right-1 top-1 flex items-center gap-0.5 rounded bg-red-600 px-1 text-[10px] font-semibold text-white" title="Atividade atrasada"><AlertTriangle className="h-2.5 w-2.5" />{minutes >= 50 && "Atrasada"}</span>}
    <div onPointerDown={(pointer) => beginResize("end", pointer)} className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize" aria-label="Arraste para alterar o fim" />
  </div>;
}

function EventChip({ event, color, marca, onClick }: { event: GoogleCalendarEvent; color: string; marca?: { atrasada: boolean } | null; onClick: () => void }) {
  const convite = statusConvite(event);
  const visual = estiloConvite(color, convite);
  return <button onClick={(e) => { e.stopPropagation(); onClick(); }} title={convite ? ROTULO_CONVITE[convite] : undefined} className={cn("flex w-full items-center gap-1.5 overflow-hidden rounded px-1.5 py-1 text-left text-[11px] font-medium", visual.className)} style={visual.style}>{convite === "pendente" && <MailQuestion className="h-3 w-3 shrink-0" aria-label="Convite pendente" />}{marca && <ListTodo className="h-3 w-3 shrink-0" />}<span className="truncate">{event.start.dateTime && `${format(eventStart(event), "HH:mm")} `}{event.summary || "Sem titulo"}</span>{marca?.atrasada && <AlertTriangle className="ml-auto h-3 w-3 shrink-0 text-red-200" aria-label="Atrasada" />}</button>;
}
