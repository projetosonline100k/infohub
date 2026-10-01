import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDays, addMonths, addWeeks, eachDayOfInterval, endOfDay, endOfMonth, endOfWeek,
  format, isSameDay, isSameMonth, isToday, startOfDay, startOfMonth, startOfWeek,
  subDays, subMonths, subWeeks,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, LogOut, PanelLeftClose, PanelLeftOpen, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GOOGLE_EVENT_COLORS, GoogleCalendarEvent } from "@/lib/googleCalendar";
import { useGoogleCalendar } from "@/hooks/useGoogleCalendar";
import { EventoDialog } from "@/components/agenda/EventoDialog";
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
  const calendar = useGoogleCalendar(anchor);

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

  const resizeEvent = async (event: GoogleCalendarEvent, start: Date, end: Date) => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      await calendar.saveEvent(event.calendarId, { summary: event.summary || "Sem titulo", description: event.description, location: event.location, colorId: event.colorId, start: { dateTime: start.toISOString(), timeZone }, end: { dateTime: end.toISOString(), timeZone } }, event);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel alterar o horario do evento");
    }
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
          <Button onClick={() => openNew()}><Plus className="mr-2 h-4 w-4" />Novo evento</Button>
        </div>
      </header>

      <div className="flex flex-1 gap-4 overflow-hidden">
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

        <section className="min-w-0 flex-1 overflow-hidden rounded-xl border bg-card">
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
            <MonthView anchor={anchor} events={calendar.events} colorFor={colorFor} onNew={openNew} onEvent={openEvent} />
          ) : (
            <TimeGrid anchor={anchor} view={view} events={calendar.events} colorFor={colorFor} onNew={openNew} onEvent={openEvent} onResize={resizeEvent} />
          )}
        </section>
      </div>

      <EventoDialog open={dialogOpen} onOpenChange={setDialogOpen} initialDate={dialogDate} initialEnd={dialogEnd} event={selectedEvent} calendars={calendar.calendars} onSave={calendar.saveEvent} onDelete={calendar.deleteEvent} />
    </div>
  );
}

function MonthView({ anchor, events, colorFor, onNew, onEvent }: {
  anchor: Date; events: GoogleCalendarEvent[]; colorFor: (event: GoogleCalendarEvent) => string;
  onNew: (date: Date, end?: Date) => void; onEvent: (event: GoogleCalendarEvent) => void;
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
            <div key={day.toISOString()} onDoubleClick={() => onNew(day)} className={cn("min-h-24 border-b border-r p-1.5", !isSameMonth(day, anchor) && "bg-muted/20 text-muted-foreground")}>
              <button onClick={() => onNew(day)} className={cn("mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs", isToday(day) && "bg-primary font-semibold text-primary-foreground")}>{format(day, "d")}</button>
              <div className="space-y-1">
                {dayEvents.slice(0, 4).map((event) => <EventChip key={`${event.calendarId}-${event.id}`} event={event} color={colorFor(event)} onClick={() => onEvent(event)} />)}
                {dayEvents.length > 4 && <p className="px-1 text-xs text-muted-foreground">+{dayEvents.length - 4} eventos</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimeGrid({ anchor, view, events, colorFor, onNew, onEvent, onResize }: {
  anchor: Date; view: "week" | "day"; events: GoogleCalendarEvent[]; colorFor: (event: GoogleCalendarEvent) => string;
  onNew: (date: Date) => void; onEvent: (event: GoogleCalendarEvent) => void;
  onResize: (event: GoogleCalendarEvent, start: Date, end: Date) => Promise<void>;
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

  return (
    <div ref={scrollArea} className="h-[calc(100vh-15.5rem)] min-h-[560px] overflow-auto">
      <div className="sticky top-0 z-10 grid border-b bg-card" style={{ gridTemplateColumns: `4rem repeat(${days.length}, minmax(110px, 1fr))` }}>
        <div />
        {days.map((day) => <div key={day.toISOString()} className="border-l p-2 text-center"><p className="text-xs uppercase text-muted-foreground">{format(day, "EEE", { locale: ptBR })}</p><p className={cn("mx-auto mt-1 flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold", isToday(day) && "bg-primary text-primary-foreground")}>{format(day, "d")}</p></div>)}
        {allDay.length > 0 && <><div className="border-t p-1 text-right text-[10px] text-muted-foreground">dia todo</div>{days.map((day) => <div key={`all-${day.toISOString()}`} className="min-h-7 border-l border-t p-1">{allDay.filter((event) => isSameDay(eventStart(event), day)).map((event) => <EventChip key={event.id} event={event} color={colorFor(event)} onClick={() => onEvent(event)} />)}</div>)}</>}
      </div>
      <div className="relative grid" style={{ gridTemplateColumns: `4rem repeat(${days.length}, minmax(110px, 1fr))` }}>
        <div>{HOURS.map((hour) => <div key={hour} className="h-16 border-b pr-2 text-right text-[10px] text-muted-foreground">{String(hour).padStart(2, "0")}:00</div>)}</div>
        {days.map((day) => (
          <GridDay key={day.toISOString()} day={day} onNew={onNew}>
            {events.filter((event) => !event.start.date && isSameDay(eventStart(event), day)).map((event) => <TimedEvent key={`${event.calendarId}-${event.id}`} event={event} color={colorFor(event)} onOpen={onEvent} onResize={onResize} />)}
          </GridDay>
        ))}
        {todayIndex >= 0 && <div className="pointer-events-none absolute z-[3] border-t-2 border-red-500" style={{ top: nowTop, left: `calc(4rem + ${todayIndex} * (100% - 4rem) / ${days.length})`, width: `calc((100% - 4rem) / ${days.length})` }}><span className="absolute -left-2 -top-1.5 h-3 w-3 rounded-full bg-red-500" /></div>}
      </div>
    </div>
  );
}

function GridDay({ day, onNew, children }: { day: Date; onNew: (date: Date, end?: Date) => void; children: React.ReactNode }) {
  const [selection, setSelection] = useState<{ start: Date; end: Date } | null>(null);
  const dateAt = (clientY: number, element: HTMLDivElement) => {
    const bounds = element.getBoundingClientRect();
    const minutes = Math.max(0, Math.min(23 * 60 + 45, Math.floor(((clientY - bounds.top) / 64) * 4) * 15));
    const date = new Date(day); date.setHours(0, minutes, 0, 0); return date;
  };
  const startSelection = (pointer: React.PointerEvent<HTMLDivElement>) => {
    if (pointer.button !== 0) return;
    const origin = dateAt(pointer.clientY, pointer.currentTarget); const element = pointer.currentTarget;
    let current = origin; let moved = false;
    const move = (moveEvent: PointerEvent) => {
      current = dateAt(moveEvent.clientY, element); moved ||= Math.abs(moveEvent.clientY - pointer.clientY) > 4;
      const first = current < origin ? current : origin; const last = current < origin ? origin : current;
      setSelection({ start: first, end: new Date(last.getTime() + 15 * 60_000) });
    };
    const finish = () => {
      window.removeEventListener("pointermove", move); setSelection(null);
      if (!moved) onNew(origin);
      else { const first = current < origin ? current : origin; const last = current < origin ? origin : current; onNew(first, new Date(last.getTime() + 15 * 60_000)); }
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", finish, { once: true });
  };
  const top = selection ? selection.start.getHours() * 64 + selection.start.getMinutes() / 60 * 64 : 0;
  const height = selection ? Math.max(16, (selection.end.getTime() - selection.start.getTime()) / 3_600_000 * 64) : 0;
  return <div onPointerDown={startSelection} className="relative border-l select-none">
    {HOURS.map((hour) => <div key={hour} className="h-16 border-b hover:bg-primary/5" />)}
    {selection && <div className="pointer-events-none absolute inset-x-1 z-[1] rounded bg-primary/30 ring-1 ring-primary" style={{ top, height }} />}
    {children}
  </div>;
}

function TimedEvent({ event, color, onOpen, onResize }: { event: GoogleCalendarEvent; color: string; onOpen: (event: GoogleCalendarEvent) => void; onResize: (event: GoogleCalendarEvent, start: Date, end: Date) => Promise<void>; }) {
  const [draft, setDraft] = useState<{ start: Date; end: Date } | null>(null);
  const [saving, setSaving] = useState(false);
  const ignoreClick = useRef(false);
  const start = draft?.start || eventStart(event); const end = draft?.end || eventEnd(event);
  const top = start.getHours() * 64 + start.getMinutes() / 60 * 64;
  const height = Math.max(24, (end.getTime() - start.getTime()) / 3_600_000 * 64);
  const beginResize = (edge: "start" | "end", pointer: React.PointerEvent<HTMLDivElement>) => {
    pointer.preventDefault(); pointer.stopPropagation();
    const originalStart = eventStart(event); const originalEnd = eventEnd(event); const originY = pointer.clientY;
    let nextStart = originalStart; let nextEnd = originalEnd;
    const move = (moveEvent: PointerEvent) => {
      const minutes = Math.round(((moveEvent.clientY - originY) / 64) * 4) * 15;
      if (edge === "start") nextStart = new Date(Math.min(originalStart.getTime() + minutes * 60_000, originalEnd.getTime() - 15 * 60_000));
      else nextEnd = new Date(Math.max(originalEnd.getTime() + minutes * 60_000, originalStart.getTime() + 15 * 60_000));
      setDraft({ start: nextStart, end: nextEnd });
    };
    const finish = () => {
      window.removeEventListener("pointermove", move); ignoreClick.current = true; window.setTimeout(() => { ignoreClick.current = false; }, 0);
      const changed = nextStart.getTime() !== originalStart.getTime() || nextEnd.getTime() !== originalEnd.getTime(); setDraft(null);
      if (changed) { setSaving(true); void onResize(event, nextStart, nextEnd).finally(() => setSaving(false)); }
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", finish, { once: true });
  };
  return <div role="button" tabIndex={0} onPointerDown={(pointer) => pointer.stopPropagation()} onClick={() => { if (!ignoreClick.current) onOpen(event); }} onKeyDown={(key) => { if (key.key === "Enter" || key.key === " ") onOpen(event); }} className="absolute left-1 right-1 z-[1] overflow-hidden rounded px-2 py-1 text-left text-xs text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1" style={{ top, height, background: color }}>
    <div onPointerDown={(pointer) => beginResize("start", pointer)} className="absolute inset-x-0 top-0 h-2 cursor-ns-resize" aria-label="Arraste para alterar o início" />
    <span className="font-semibold">{event.summary || "Sem titulo"}</span><br /><span className="opacity-90">{saving ? "Salvando..." : `${format(start, "HH:mm")} – ${format(end, "HH:mm")}`}</span>
    <div onPointerDown={(pointer) => beginResize("end", pointer)} className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize" aria-label="Arraste para alterar o fim" />
  </div>;
}

function EventChip({ event, color, onClick }: { event: GoogleCalendarEvent; color: string; onClick: () => void }) {
  return <button onClick={(e) => { e.stopPropagation(); onClick(); }} className="flex w-full items-center gap-1.5 overflow-hidden rounded px-1.5 py-1 text-left text-[11px] font-medium text-white" style={{ background: color }}><span className="truncate">{event.start.dateTime && `${format(eventStart(event), "HH:mm")} `}{event.summary || "Sem titulo"}</span></button>;
}
