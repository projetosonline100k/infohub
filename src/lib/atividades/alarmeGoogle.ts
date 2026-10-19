import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { chamarGoogleCalendar, type GoogleEventInput } from "@/lib/googleCalendar";

// Alarme da atividade também no Google Agenda (18/10/2026, Davi: "daria até para somar isso ao
// calendário, no aviso do Google mesmo"). Cada alarme vira um evento curto no calendário
// principal com aviso na hora — toca no celular e no relógio. O id fica em
// atividades.alarme_google_evento_id. O evento leva a marca `infoproAlarme` para a Agenda do
// Infopro não tocar de novo o que o Atlas já toca (useAlarmesAgenda pula esses).
const db = supabase as unknown as SupabaseClient;
export const MARCA_ALARME = "infoproAlarme";

let conectado: { valor: boolean; ate: number } | null = null;
async function googleConectado(): Promise<boolean> {
  if (conectado && conectado.ate > Date.now()) return conectado.valor;
  try {
    const s = await chamarGoogleCalendar<{ connected: boolean }>({ action: "status" });
    conectado = { valor: !!s.connected, ate: Date.now() + 10 * 60_000 };
  } catch {
    conectado = { valor: false, ate: Date.now() + 60_000 };
  }
  return conectado.valor;
}

function evento(atividadeId: string, titulo: string, quando: Date): GoogleEventInput {
  return {
    summary: `⏰ ${titulo}`,
    description: "Alarme do Infopro Hub (some daqui quando você desliga o alarme ou conclui a atividade).",
    start: { dateTime: quando.toISOString() },
    end: { dateTime: new Date(quando.getTime() + 15 * 60_000).toISOString() },
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 0 }] },
    extendedProperties: { private: { [MARCA_ALARME]: atividadeId } },
    transparency: "transparent",   // não marca você como ocupado
  };
}

/** Deixa o Google igual ao alarme da atividade: cria, move ou apaga o evento. */
export async function sincronizarAlarmeGoogle(atividadeId: string): Promise<void> {
  if (!(await googleConectado())) return;
  const { data } = await db.from("atividades").select("titulo, alarme_em, concluida, deleted_at, alarme_google_evento_id").eq("id", atividadeId).maybeSingle();
  if (!data) return;
  const a = data as { titulo: string; alarme_em: string | null; concluida: boolean; deleted_at: string | null; alarme_google_evento_id: string | null };
  const vale = a.alarme_em && !a.concluida && !a.deleted_at && new Date(a.alarme_em).getTime() > Date.now() - 5 * 60_000;
  try {
    if (vale) {
      const corpo = evento(atividadeId, a.titulo, new Date(a.alarme_em!));
      let id = a.alarme_google_evento_id;
      if (id) {
        try { await chamarGoogleCalendar({ action: "update", calendarId: "primary", eventId: id, event: corpo }); }
        catch { id = null; }   // apagado no Google: cria de novo
      }
      if (!id) {
        const r = await chamarGoogleCalendar<{ event: { id: string } }>({ action: "create", calendarId: "primary", event: corpo });
        await db.from("atividades").update({ alarme_google_evento_id: r.event.id }).eq("id", atividadeId);
      }
    } else if (a.alarme_google_evento_id) {
      try { await chamarGoogleCalendar({ action: "delete", calendarId: "primary", eventId: a.alarme_google_evento_id }); } catch { /* já não existe */ }
      await db.from("atividades").update({ alarme_google_evento_id: null }).eq("id", atividadeId);
    }
  } catch (e) {
    console.error("Alarme no Google Agenda:", e);
  }
}

/** Conferência periódica (janela principal): alarmes futuros sem evento no Google, e eventos
 *  de alarmes que já não valem (desligado, concluída, apagada). Pega também os alarmes criados
 *  pelo Atlas ou pelos funcionários, que não passam pela tela. */
export async function conferirAlarmesGoogle(): Promise<void> {
  if (!(await googleConectado())) return;
  const agora = new Date().toISOString();
  const [{ data: faltam }, { data: sobram }] = await Promise.all([
    db.from("atividades").select("id").gt("alarme_em", agora).is("alarme_google_evento_id", null)
      .eq("concluida", false).is("deleted_at", null).limit(20),
    db.from("atividades").select("id").not("alarme_google_evento_id", "is", null)
      .or("alarme_em.is.null,concluida.eq.true,deleted_at.not.is.null").limit(20),
  ]);
  for (const { id } of [...((faltam ?? []) as { id: string }[]), ...((sobram ?? []) as { id: string }[])]) {
    await sincronizarAlarmeGoogle(id);
  }
}
