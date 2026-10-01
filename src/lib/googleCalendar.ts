import { supabase } from "@/integrations/supabase/client";

export interface GoogleCalendar {
  id: string;
  summary: string;
  description?: string;
  primary?: boolean;
  backgroundColor?: string;
  foregroundColor?: string;
  accessRole: "freeBusyReader" | "reader" | "writer" | "owner";
  selected?: boolean;
}

export interface GoogleCalendarEvent {
  id: string;
  calendarId: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  status?: string;
  colorId?: string;
  start: { date?: string; dateTime?: string; timeZone?: string };
  end: { date?: string; dateTime?: string; timeZone?: string };
}

export interface GoogleEventInput {
  summary: string;
  description?: string;
  location?: string;
  start: { date?: string; dateTime?: string; timeZone?: string };
  end: { date?: string; dateTime?: string; timeZone?: string };
}

type CalendarAction =
  | { action: "status" | "disconnect" | "calendars" }
  | { action: "connect"; returnUrl: string }
  | { action: "events"; calendarIds: string[]; timeMin: string; timeMax: string; timeZone: string }
  | { action: "create"; calendarId: string; event: GoogleEventInput }
  | { action: "update"; calendarId: string; eventId: string; event: GoogleEventInput }
  | { action: "delete"; calendarId: string; eventId: string };

export async function chamarGoogleCalendar<T>(body: CalendarAction): Promise<T> {
  const { data, error } = await supabase.functions.invoke("google-calendar", { body });
  if (error) {
    let message = error.message;
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const payload = await context.json();
        if (payload?.error) message = payload.error;
      } catch {
        // Mantem a mensagem original quando a resposta nao e JSON.
      }
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

