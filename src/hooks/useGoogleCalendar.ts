import { useCallback, useEffect, useMemo, useState } from "react";
import { endOfMonth, endOfWeek, startOfMonth, startOfWeek, subMonths, addMonths } from "date-fns";
import { toast } from "sonner";
import {
  chamarGoogleCalendar,
  GoogleCalendarExpirado,
  GoogleCalendar,
  GoogleCalendarEvent,
  GoogleEventInput,
  RespostaConvite,
} from "@/lib/googleCalendar";

export const STORAGE_KEY = "infopro.google-calendar.selected";

export function useGoogleCalendar(anchorDate: Date) {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [events, setEvents] = useState<GoogleCalendarEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  const range = useMemo(() => ({
    start: startOfWeek(startOfMonth(subMonths(anchorDate, 1)), { weekStartsOn: 0 }),
    end: endOfWeek(endOfMonth(addMonths(anchorDate, 1)), { weekStartsOn: 0 }),
  }), [anchorDate]);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const status = await chamarGoogleCalendar<{ connected: boolean; email: string | null }>({ action: "status" });
      setConnected(status.connected);
      setEmail(status.email);
      if (status.connected) {
        const response = await chamarGoogleCalendar<{ calendars: GoogleCalendar[] }>({ action: "calendars" });
        setCalendars(response.calendars);
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as string[];
        const valid = saved.filter((id) => response.calendars.some((calendar) => calendar.id === id));
        const defaults = response.calendars.filter((calendar) => calendar.selected || calendar.primary).map((calendar) => calendar.id);
        setSelectedIds(valid.length ? valid : defaults.length ? defaults : response.calendars.slice(0, 1).map((calendar) => calendar.id));
      }
    } catch (error) {
      if (error instanceof GoogleCalendarExpirado) setConnected(false);
      toast.error(error instanceof Error ? error.message : "Nao foi possivel carregar a agenda");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadEvents = useCallback(async () => {
    if (!connected || !selectedIds.length) {
      setEvents([]);
      return;
    }
    setLoadingEvents(true);
    try {
      const response = await chamarGoogleCalendar<{ events: GoogleCalendarEvent[] }>({
        action: "events",
        calendarIds: selectedIds,
        timeMin: range.start.toISOString(),
        timeMax: range.end.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      setEvents(response.events.filter((event) => event.status !== "cancelled"));
    } catch (error) {
      if (error instanceof GoogleCalendarExpirado) setConnected(false);
      toast.error(error instanceof Error ? error.message : "Nao foi possivel carregar os eventos");
    } finally {
      setLoadingEvents(false);
    }
  }, [connected, range, selectedIds]);

  useEffect(() => { void loadStatus(); }, [loadStatus]);
  useEffect(() => { void loadEvents(); }, [loadEvents]);

  const toggleCalendar = (id: string) => {
    setSelectedIds((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const connect = async () => {
    const response = await chamarGoogleCalendar<{ authUrl: string }>({ action: "connect", returnUrl: window.location.origin });
    window.location.assign(response.authUrl);
  };

  const disconnect = async () => {
    await chamarGoogleCalendar({ action: "disconnect" });
    setConnected(false);
    setCalendars([]);
    setEvents([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  const saveEvent = async (calendarId: string, event: GoogleEventInput, existing?: GoogleCalendarEvent) => {
    if (existing) {
      await chamarGoogleCalendar({ action: "update", calendarId, eventId: existing.id, event });
    } else {
      await chamarGoogleCalendar({ action: "create", calendarId, event });
    }
    await loadEvents();
  };

  const deleteEvent = async (event: GoogleCalendarEvent) => {
    await chamarGoogleCalendar({ action: "delete", calendarId: event.calendarId, eventId: event.id });
    await loadEvents();
  };

  const responderConvite = async (event: GoogleCalendarEvent, resposta: RespostaConvite) => {
    await chamarGoogleCalendar({ action: "respond", calendarId: event.calendarId, eventId: event.id, resposta });
    await loadEvents();
  };

  return {
    loading, connected, email, calendars, selectedIds, events, loadingEvents,
    connect, disconnect, toggleCalendar, reload: loadEvents, saveEvent, deleteEvent, responderConvite,
  };
}

