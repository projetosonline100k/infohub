import { FormEvent, useEffect, useMemo, useState } from "react";
import { addHours, addDays, format } from "date-fns";
import { AlertTriangle, BellRing, ExternalLink, ListTodo, Loader2, Trash2 } from "lucide-react";
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
import {
  alarmeDoEvento, entradaDoEvento, GOOGLE_EVENT_COLORS, GoogleCalendar, GoogleCalendarEvent, GoogleEventInput, propriedadesInfopro,
} from "@/lib/googleCalendar";
import { OPCOES_ALARME } from "@/lib/agendaAlarmes";
import { avisarAlarmesAlterados } from "@/hooks/useAlarmesAgenda";
import { confirmar } from "@/components/DialogosGlobais";
import { abrirLinkExterno } from "@/lib/abrirLink";

// Resumo do card da atividade que virou este evento (arrastada pra agenda).
export interface AtividadeDoEvento {
  titulo: string;
  projeto: string;
  status: string;
  prioridade: string;
  vencimento: string | null;
  atrasada: boolean;
  concluida: boolean;
  tempoEstimado: number | null;
  descricao: string | null;
}

interface EventoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDate: Date;
  initialEnd?: Date;
  event: GoogleCalendarEvent | null;
  calendars: GoogleCalendar[];
  onSave: (calendarId: string, event: GoogleEventInput, existing?: GoogleCalendarEvent) => Promise<void>;
  onDelete: (event: GoogleCalendarEvent) => Promise<void>;
  atividade?: AtividadeDoEvento | null;
  onAbrirAtividade?: () => void;
}

const localDateTime = (date: Date) => format(date, "yyyy-MM-dd'T'HH:mm");

export function EventoDialog({
  open, onOpenChange, initialDate, initialEnd, event, calendars, onSave, onDelete, atividade, onAbrirAtividade,
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
  const [alarme, setAlarme] = useState<number | null>(null);
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
    setAlarme(event ? alarmeDoEvento(event) : null);
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
      // Evento existente: parte do evento atual, pra não perder o que este
      // formulário não mostra (convidados, atividade vinculada…). O alarme
      // fica nas propriedades privadas do evento.
      const extendedProperties = propriedadesInfopro(event?.extendedProperties, { alarme: allDay ? null : alarme });
      const completo = event ? entradaDoEvento(event, { ...payload, extendedProperties }) : { ...payload, extendedProperties };
      await onSave(calendarId, completo, event || undefined);
      avisarAlarmesAlterados();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!event || !(await confirmar(`Excluir “${event.summary || "Sem titulo"}”?`))) return;
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
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{event ? "Editar evento" : "Novo evento"}</DialogTitle>
          <DialogDescription>As alteracoes sao sincronizadas diretamente com o Google Calendar.</DialogDescription>
        </DialogHeader>
        {atividade && (
          // Evento criado a partir de uma atividade: mostra o card dela.
          <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
            <div className="flex items-start gap-2">
              <ListTodo className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="font-medium leading-snug">{atividade.titulo}</p>
                <p className="text-xs text-muted-foreground">{atividade.projeto}</p>
              </div>
              {onAbrirAtividade && <Button type="button" variant="outline" size="sm" className="h-7 shrink-0 text-xs" onClick={onAbrirAtividade}>Abrir card</Button>}
            </div>
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              <span className="rounded bg-background px-1.5 py-0.5">{atividade.concluida ? "Concluída" : atividade.status}</span>
              <span className="rounded bg-background px-1.5 py-0.5">Prioridade: {atividade.prioridade}</span>
              {atividade.tempoEstimado ? <span className="rounded bg-background px-1.5 py-0.5">{atividade.tempoEstimado} min</span> : null}
              {atividade.vencimento && (
                <span className={`flex items-center gap-1 rounded px-1.5 py-0.5 ${atividade.atrasada ? "bg-destructive/15 font-medium text-destructive" : "bg-background"}`}>
                  {atividade.atrasada && <AlertTriangle className="h-3 w-3" />}
                  {atividade.atrasada ? "Atrasada · venceu " : "Vence "}{format(new Date(`${atividade.vencimento.slice(0, 10)}T12:00:00`), "dd/MM")}
                </span>
              )}
            </div>
            {atividade.descricao && <p className="line-clamp-3 text-xs text-muted-foreground">{atividade.descricao}</p>}
          </div>
        )}
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="event-title">Titulo</Label>
            <Input id="event-title" autoFocus required value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Nome do evento" />
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
          {!allDay && (
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><BellRing className="h-3.5 w-3.5" />Alarme</Label>
              <Select value={alarme === null ? "nenhum" : String(alarme)} onValueChange={(valor) => setAlarme(valor === "nenhum" ? null : Number(valor))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OPCOES_ALARME.map((opcao) => <SelectItem key={opcao.nome} value={opcao.valor === null ? "nenhum" : String(opcao.valor)}>{opcao.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Toca no computador com o Infopro Hub aberto.</p>
            </div>
          )}
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
              {event?.htmlLink && <Button type="button" variant="ghost" size="sm" onClick={() => void abrirLinkExterno(event.htmlLink)}><ExternalLink className="mr-2 h-4 w-4" />Google</Button>}
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
