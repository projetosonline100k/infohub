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
  // `null` remove a cor personalizada e volta para a cor do calendário.
  colorId?: string | null;
  start: { date?: string; dateTime?: string; timeZone?: string };
  end: { date?: string; dateTime?: string; timeZone?: string };
}

export const GOOGLE_EVENT_COLORS: Record<string, string> = {
  "1": "#a4bdfc", "2": "#7ae7bf", "3": "#dbadff", "4": "#ff887c",
  "5": "#fbd75b", "6": "#ffb878", "7": "#46d6db", "8": "#e1e1e1",
  "9": "#5484ed", "10": "#51b749", "11": "#dc2127",
};

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
