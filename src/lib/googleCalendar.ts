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
  extendedProperties?: { private?: Record<string, string>; shared?: Record<string, string> };
  reminders?: { useDefault?: boolean; overrides?: { method: string; minutes: number }[] };
  attendees?: Record<string, unknown>[];
  transparency?: string;
  visibility?: string;
}

export interface GoogleEventInput {
  summary: string;
  description?: string;
  location?: string;
  // `null` remove a cor personalizada e volta para a cor do calendário.
  colorId?: string | null;
  start: { date?: string; dateTime?: string; timeZone?: string };
  end: { date?: string; dateTime?: string; timeZone?: string };
  extendedProperties?: GoogleCalendarEvent["extendedProperties"];
  reminders?: GoogleCalendarEvent["reminders"];
  attendees?: GoogleCalendarEvent["attendees"];
  transparency?: string;
  visibility?: string;
}

// Dados do Infopro guardados no próprio evento do Google (propriedades
// privadas, invisíveis no Google Agenda): a atividade que virou o evento e
// o alarme local. Assim não precisa de tabela nova nem mudança no backend.
const PROP_ATIVIDADE = "infoproAtividadeId";
const PROP_ALARME = "infoproAlarme";

// Convites: o Google diz, na lista de convidados, qual é a SUA resposta
// (o convidado com `self: true`). Eventos que você mesmo organizou não são
// convite. null = evento normal ou convite já aceito.
export type StatusConvite = "pendente" | "talvez" | "recusado";
export function statusConvite(event: GoogleCalendarEvent): StatusConvite | null {
  const eu = event.attendees?.find((a) => a.self === true);
  if (!eu || eu.organizer === true) return null;
  if (eu.responseStatus === "needsAction") return "pendente";
  if (eu.responseStatus === "tentative") return "talvez";
  if (eu.responseStatus === "declined") return "recusado";
  return null;
}

// Sua resposta atual a um convite (inclui "aceito"), ou null se o evento não
// é convite (você organizou ou não está na lista).
export function minhaRespostaConvite(event: GoogleCalendarEvent): RespostaConvite | "pendente" | null {
  const eu = event.attendees?.find((a) => a.self === true);
  if (!eu || eu.organizer === true) return null;
  return ({ accepted: "aceitar", tentative: "talvez", declined: "recusar" } as Record<string, RespostaConvite>)[String(eu.responseStatus)] ?? "pendente";
}

export const atividadeDoEvento = (event: GoogleCalendarEvent): string | null =>
  event.extendedProperties?.private?.[PROP_ATIVIDADE] || null;

// Minutos antes do início em que o alarme toca (0 = na hora), ou null.
export function alarmeDoEvento(event: GoogleCalendarEvent): number | null {
  const valor = event.extendedProperties?.private?.[PROP_ALARME];
  if (valor === undefined || valor === "") return null;
  const minutos = Number(valor);
  return Number.isFinite(minutos) && minutos >= 0 ? minutos : null;
}

export function propriedadesInfopro(atual: GoogleCalendarEvent["extendedProperties"], mudancas: { atividadeId?: string | null; alarme?: number | null }) {
  const privado = { ...(atual?.private || {}) };
  if (mudancas.atividadeId !== undefined) {
    if (mudancas.atividadeId) privado[PROP_ATIVIDADE] = mudancas.atividadeId; else delete privado[PROP_ATIVIDADE];
  }
  if (mudancas.alarme !== undefined) {
    if (mudancas.alarme === null) delete privado[PROP_ALARME]; else privado[PROP_ALARME] = String(mudancas.alarme);
  }
  return { ...(atual || {}), private: privado };
}

// O "update" do Google substitui o evento inteiro (PUT): o que não for
// reenviado se perde (convidados, lembretes, a atividade vinculada…). Esta
// função monta a entrada a partir do evento atual + as mudanças.
export function entradaDoEvento(event: GoogleCalendarEvent, mudancas: Partial<GoogleEventInput>): GoogleEventInput {
  return {
    summary: event.summary || "Sem titulo",
    description: event.description,
    location: event.location,
    colorId: event.colorId,
    start: event.start,
    end: event.end,
    extendedProperties: event.extendedProperties,
    reminders: event.reminders,
    attendees: event.attendees,
    transparency: event.transparency,
    visibility: event.visibility,
    ...mudancas,
  };
}

// Paleta atual do Google Calendar (Lavanda, Sálvia, Uva, Flamingo, Banana,
// Tangerina, Pavão, Grafite, Mirtilo, Manjericão, Tomate) — a API ainda
// devolve a antiga, mais clara, que fica difícil de ler com texto branco.
export const GOOGLE_EVENT_COLORS: Record<string, string> = {
  "1": "#7986cb", "2": "#33b679", "3": "#8e24aa", "4": "#e67c73",
  "5": "#f6bf26", "6": "#f4511e", "7": "#039be5", "8": "#616161",
  "9": "#3f51b5", "10": "#0b8043", "11": "#d50000",
};

// Texto escuro em fundos claros (ex.: Banana, cores pastel de calendário), branco nos demais.
export function corDoTexto(fundo: string): string {
  const hex = fundo.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (!hex) return "#ffffff";
  const cheio = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(cheio.slice(i, i + 2), 16) / 255)
    .map((c) => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminancia = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminancia > 0.45 ? "#1f1f1f" : "#ffffff";
}

type CalendarAction =
  | { action: "status" | "disconnect" | "calendars" }
  | { action: "connect"; returnUrl: string }
  | { action: "events"; calendarIds: string[]; timeMin: string; timeMax: string; timeZone: string }
  | { action: "create"; calendarId: string; event: GoogleEventInput }
  | { action: "update"; calendarId: string; eventId: string; event: GoogleEventInput }
  | { action: "delete"; calendarId: string; eventId: string }
  | { action: "respond"; calendarId: string; eventId: string; resposta: RespostaConvite };

export type RespostaConvite = "aceitar" | "talvez" | "recusar";

// A autorização do Google venceu ou foi revogada (ex.: app OAuth em modo
// "Teste" no Google Cloud, onde a autorização dura só 7 dias). Aí não tem o
// que tentar de novo: é preciso conectar a conta outra vez.
export class GoogleCalendarExpirado extends Error {}
const AUTORIZACAO_VENCIDA = /invalid_grant|expired or revoked|token has been expired/i;

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
    if (AUTORIZACAO_VENCIDA.test(message)) throw new GoogleCalendarExpirado("A conexão com o Google Agenda expirou. Clique em “Conectar Google Calendar” para ligar de novo.");
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}
