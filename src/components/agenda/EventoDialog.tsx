import { FormEvent, useEffect, useMemo, useState } from "react";
import { addHours, addDays, format } from "date-fns";
import { ExternalLink, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { GOOGLE_EVENT_COLORS, GoogleCalendar, GoogleCalendarEvent, GoogleEventInput } from "@/lib/googleCalendar";

interface EventoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDate: Date;
  initialEnd?: Date;
  event: GoogleCalendarEvent | null;
  calendars: GoogleCalendar[];
  onSave: (calendarId: string, event: GoogleEventInput, existing?: GoogleCalendarEvent) => Promise<void>;
  onDelete: (event: GoogleCalendarEvent) => Promise<void>;
}

const localDateTime = (date: Date) => format(date, "yyyy-MM-dd'T'HH:mm");

export function EventoDialog({
  open, onOpenChange, initialDate, initialEnd, event, calendars, onSave, onDelete,
}: EventoDialogProps) {
  const writable = useMemo(
    () => calendars.filter((calendar) => ["writer", "owner"].includes(calendar.accessRole)),
    [calendars],
  );
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [calendarId, setCalendarId] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [colorId, setColorId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const isAllDay = !!event?.start.date;
    const startDate = event ? new Date(event.start.dateTime || `${event.start.date}T00:00:00`) : initialDate;
    const endDate = event ? new Date(event.end.dateTime || `${event.end.date}T00:00:00`) : initialEnd || addHours(initialDate, 1);
    setSummary(event?.summary || "");
    setDescription(event?.description || "");
    setLocation(event?.location || "");
    setCalendarId(event?.calendarId || writable.find((calendar) => calendar.primary)?.id || writable[0]?.id || "");
    setAllDay(isAllDay);
    setStart(isAllDay ? format(startDate, "yyyy-MM-dd") : localDateTime(startDate));
    setEnd(isAllDay ? format(addDays(endDate, -1), "yyyy-MM-dd") : localDateTime(endDate));
    setColorId(event?.colorId || null);
  }, [event, initialDate, initialEnd, open, writable]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!summary.trim() || !calendarId || !start || !end) return;
    setSaving(true);
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const payload: GoogleEventInput = allDay ? {
        summary: summary.trim(), description: description.trim() || undefined, location: location.trim() || undefined,
        colorId: colorId || (event?.colorId ? null : undefined),
        start: { date: start },
        // Google usa fim exclusivo em eventos de dia inteiro.
        end: { date: format(addDays(new Date(`${end}T12:00:00`), 1), "yyyy-MM-dd") },
      } : {
        summary: summary.trim(), description: description.trim() || undefined, location: location.trim() || undefined,
        colorId: colorId || (event?.colorId ? null : undefined),
        start: { dateTime: new Date(start).toISOString(), timeZone },
        end: { dateTime: new Date(end).toISOString(), timeZone },
      };
      await onSave(calendarId, payload, event || undefined);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!event || !window.confirm(`Excluir “${event.summary || "Sem titulo"}”?`)) return;
    setSaving(true);
    try {
      await onDelete(event);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{event ? "Editar evento" : "Novo evento"}</DialogTitle>
          <DialogDescription>As alteracoes sao sincronizadas diretamente com o Google Calendar.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="event-title">Titulo</Label>
            <Input id="event-title" autoFocus required value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Nome do evento" />
          </div>
          <div className="space-y-2">
            <Label>Cor do evento</Label>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setColorId(null)} aria-label="Usar cor do calendário" title="Cor do calendário" className={`h-7 w-7 rounded-full border-2 bg-primary transition-transform hover:scale-110 ${colorId === null ? "border-foreground ring-2 ring-primary/30" : "border-transparent"}`} />
              {Object.entries(GOOGLE_EVENT_COLORS).map(([id, color]) => (
                <button key={id} type="button" onClick={() => setColorId(id)} aria-label={`Selecionar cor ${id}`} className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 ${colorId === id ? "border-foreground ring-2 ring-primary/30" : "border-transparent"}`} style={{ backgroundColor: color }} />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Escolha uma cor ou mantenha a cor do calendário.</p>
          </div>
          <div className="space-y-2">
            <Label>Calendario</Label>
            <Select value={calendarId} onValueChange={setCalendarId} disabled={!!event}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {writable.map((calendar) => <SelectItem key={calendar.id} value={calendar.id}>{calendar.summary}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="h-4 w-4 rounded border-input accent-primary" />
            Dia inteiro
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="event-start">Inicio</Label>
              <Input id="event-start" required type={allDay ? "date" : "datetime-local"} value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="event-end">Fim</Label>
              <Input id="event-end" required min={start} type={allDay ? "date" : "datetime-local"} value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="event-location">Local</Label>
            <Input id="event-location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Sala, endereco ou link" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="event-description">Descricao</Label>
            <Textarea id="event-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <DialogFooter className="items-center sm:justify-between">
            <div className="flex gap-2">
              {event && <Button type="button" variant="destructive" size="sm" onClick={remove} disabled={saving}><Trash2 className="mr-2 h-4 w-4" />Excluir</Button>}
              {event?.htmlLink && <Button type="button" variant="ghost" size="sm" onClick={() => window.open(event.htmlLink, "_blank", "noopener,noreferrer")}><ExternalLink className="mr-2 h-4 w-4" />Google</Button>}
            </div>
            <Button type="submit" disabled={saving || !writable.length}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{event ? "Salvar" : "Criar evento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
