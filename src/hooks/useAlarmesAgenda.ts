import { createElement, useEffect } from "react";
import { format } from "date-fns";
import { BellRing } from "lucide-react";
import { toast } from "sonner";
import { alarmeDoEvento, chamarGoogleCalendar, type GoogleCalendarEvent } from "@/lib/googleCalendar";
import { alarmesParaTocar, tocarAlarme, type EventoComAlarme } from "@/lib/agendaAlarmes";
import { isDesktop } from "@/lib/platform";
import { STORAGE_KEY } from "@/hooks/useGoogleCalendar";
import { supabase } from "@/integrations/supabase/client";
import {
  concluirAtividade, definirAlarmeAtividade, deveTocarAtividade, EVENTO_ALARMES_ATIVIDADE, sincronizarLembretes,
} from "@/lib/atividades/alarmeAtividade";
import { AlarmeAtividadeToast } from "@/components/atividades/AlarmeAtividadeToast";

// Avisado pela Agenda quando um alarme é ligado/desligado, pra recarregar já.
const EVENTO_ALARMES_ALTERADOS = "agenda:alarmes-alterados";
export const avisarAlarmesAlterados = () => window.dispatchEvent(new Event(EVENTO_ALARMES_ALTERADOS));

// Guardado no navegador (compartilhado entre janelas/abas do app): impede o
// mesmo alarme de tocar duas vezes, inclusive depois de recarregar.
const CHAVE_TOCADOS = "agenda:alarmes-tocados";
const lerTocados = (): string[] => {
  try { return JSON.parse(localStorage.getItem(CHAVE_TOCADOS) || "[]"); } catch { return []; }
};
const marcarTocado = (chave: string) => {
  try { localStorage.setItem(CHAVE_TOCADOS, JSON.stringify([...lerTocados(), chave].slice(-200))); } catch { /* sem storage */ }
};

async function chamarAtencaoDaJanela() {
  if (!isDesktop()) return;
  try {
    const { getCurrentWindow, UserAttentionType } = await import("@tauri-apps/api/window");
    const janela = getCurrentWindow();
    await janela.unminimize();
    await janela.show();
    await janela.setFocus();
    await janela.requestUserAttention(UserAttentionType.Critical);
  } catch {
    /* sem permissão/janela — o som e o aviso já cobrem */
  }
}

function disparar(evento: EventoComAlarme) {
  const parar = tocarAlarme();
  void chamarAtencaoDaJanela();
  const hora = format(evento.inicio, "HH:mm");
  const descricao = evento.minutosAntes === 0 ? `Começa agora (${hora})` : `Começa às ${hora} (em ${evento.minutosAntes} min)`;
  toast(evento.titulo, {
    description: descricao,
    icon: createElement(BellRing, { className: "h-4 w-4 text-primary" }),
    duration: Infinity,
    action: { label: "Parar", onClick: parar },
    cancel: {
      label: "Adiar 5 min",
      onClick: () => {
        parar();
        window.setTimeout(() => disparar({ ...evento, minutosAntes: 0 }), 5 * 60_000);
      },
    },
    onDismiss: parar,
  });
}

// ---- Alarmes de atividade (campo alarme_em da atividade) ----

interface AlarmeAtividade { id: string; titulo: string; alarmeEm: number; lembreteId: string | null; clienteId: string | null }

// Último toque de cada atividade (pra repetir a cada 5 min sem duplicar
// entre janelas/recarregamentos).
const CHAVE_ULTIMO_TOQUE = "atividades:alarmes-ultimo-toque";
const lerUltimosToques = (): Record<string, number> => {
  try { return JSON.parse(localStorage.getItem(CHAVE_ULTIMO_TOQUE) || "{}"); } catch { return {}; }
};
const marcarToque = (id: string, quando: number) => {
  try { localStorage.setItem(CHAVE_ULTIMO_TOQUE, JSON.stringify({ ...lerUltimosToques(), [id]: quando })); } catch { /* sem storage */ }
};

// "Concluir" no aviso: o lembrete do Mac é marcado como feito na próxima
// sincronização (sincronizarLembretes).
async function concluirAtividadeDoAlarme(alarme: AlarmeAtividade) {
  const resultado = await concluirAtividade(alarme.id, alarme.clienteId);
  if (resultado === "checklist") toast.error("Finalize todos os itens do checklist antes de concluir a tarefa");
  else if (resultado === "erro") toast.error("Não foi possível concluir a atividade");
  else {
    toast.success(`"${alarme.titulo}" concluída`);
    window.dispatchEvent(new Event(EVENTO_ALARMES_ATIVIDADE));
  }
}

function dispararAtividade(alarme: AlarmeAtividade) {
  const parar = tocarAlarme();
  void chamarAtencaoDaJanela();
  const acao = (fn: () => Promise<unknown> | void, id: string | number) => () => { parar(); toast.dismiss(id); void fn(); };
  toast.custom((id) => createElement(AlarmeAtividadeToast, {
    titulo: alarme.titulo,
    descricao: `Alarme da atividade · ${format(new Date(alarme.alarmeEm), "HH:mm")}`,
    onConcluir: acao(() => concluirAtividadeDoAlarme(alarme), id),
    onAdiar: acao(() => definirAlarmeAtividade({ id: alarme.id, titulo: alarme.titulo, alarme_lembrete_id: alarme.lembreteId }, new Date(Date.now() + 10 * 60_000)), id),
    onDesligar: acao(() => definirAlarmeAtividade({ id: alarme.id, titulo: alarme.titulo, alarme_lembrete_id: alarme.lembreteId }, null), id),
    onFechar: acao(() => undefined, id),
  }), { duration: Infinity, onDismiss: parar });
}

// Roda os alarmes da Agenda enquanto o app está aberto (em qualquer tela):
// busca os eventos das próximas horas com alarme ligado e toca o som + aviso
// + traz a janela pra frente na hora certa.
export function useAlarmesAgenda() {
  useEffect(() => {
    let cancelado = false;
    let eventos: EventoComAlarme[] = [];
    let alarmesAtividades: AlarmeAtividade[] = [];

    const carregarAtividades = async () => {
      const limite = new Date(Date.now() + 26 * 3_600_000).toISOString();
      const { data } = await supabase
        .from("atividades")
        .select("id, titulo, alarme_em, alarme_lembrete_id, cliente_id")
        .not("alarme_em", "is", null)
        .is("deleted_at", null)
        .eq("concluida", false)
        .lte("alarme_em", limite);
      if (cancelado) return;
      alarmesAtividades = (data || []).map((a) => ({
        id: a.id, titulo: a.titulo, alarmeEm: new Date(a.alarme_em as string).getTime(), lembreteId: a.alarme_lembrete_id, clienteId: a.cliente_id,
      }));
    };

    const carregar = async () => {
      try {
        const status = await chamarGoogleCalendar<{ connected: boolean }>({ action: "status" });
        if (!status.connected) { eventos = []; return; }
        let selecionados: string[] = [];
        try { selecionados = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { /* padrão */ }
        const agora = Date.now();
        const resposta = await chamarGoogleCalendar<{ events: GoogleCalendarEvent[] }>({
          action: "events",
          calendarIds: Array.from(new Set(["primary", ...selecionados])),
          timeMin: new Date(agora - 2 * 3_600_000).toISOString(),
          timeMax: new Date(agora + 26 * 3_600_000).toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
        if (cancelado) return;
        const porChave = new Map<string, EventoComAlarme>();
        for (const evento of resposta.events) {
          const minutos = alarmeDoEvento(evento);
          if (evento.status === "cancelled" || !evento.start.dateTime || minutos === null) continue;
          // "primary" e o id do calendário principal trazem o mesmo evento: a
          // chave usa só o id do evento + horário + alarme.
          const chave = `${evento.id}:${evento.start.dateTime}:${minutos}`;
          porChave.set(chave, { chave, titulo: evento.summary || "Sem titulo", inicio: new Date(evento.start.dateTime), minutosAntes: minutos });
        }
        eventos = [...porChave.values()];
      } catch {
        /* sem conexão: tenta de novo na próxima rodada */
      }
    };

    const verificar = () => {
      const agora = Date.now();
      alarmesAtividades.forEach((alarme) => {
        if (!deveTocarAtividade(alarme.alarmeEm, agora, lerUltimosToques()[alarme.id])) return;
        marcarToque(alarme.id, agora);
        dispararAtividade(alarme);
      });
      const tocar = alarmesParaTocar(eventos, Date.now(), new Set(lerTocados()));
      tocar.forEach((evento) => {
        if (lerTocados().includes(evento.chave)) return;
        marcarTocado(evento.chave);
        disparar(evento);
      });
    };

    let recarga = 0;
    let recargaAtividades = 0;
    let relogio = 0;
    let espera = 0;
    let canalRealtime: ReturnType<typeof supabase.channel> | null = null;
    let aoFocar: (() => void) | null = null;
    const aoAlterar = () => void carregar().then(verificar);
    const aoAlterarAtividades = () => void carregarAtividades().then(verificar);

    // No desktop só a janela principal toca (abas destacadas também usam
    // este layout); na web, o registro de "já tocou" evita duplicar.
    const ehJanelaPrincipal = async () => {
      if (!isDesktop()) return true;
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        return getCurrentWindow().label === "main";
      } catch {
        return true;
      }
    };

    void ehJanelaPrincipal().then((principal) => {
      if (!principal || cancelado) return;
      // Sincroniza com o app Lembretes do Mac (concluído, apagado, data
      // mudada, lembretes novos nas listas "Infopro") e recarrega os alarmes.
      // Uma rodada por vez: pedido que chega no meio de outra rodada vira UMA
      // rodada extra logo depois (antes elas se acumulavam e travavam tudo).
      let sincronizando = false;
      let pedidoPendente = false;
      let falhasSeguidas = 0;
      const rodadaAtividades = async (): Promise<void> => {
        if (sincronizando) { pedidoPendente = true; return; }
        {
          sincronizando = true;
          try {
            await sincronizarLembretes();
            falhasSeguidas = 0;
          } catch (erro) {
            console.error("Erro ao sincronizar Lembretes:", erro);
            falhasSeguidas++;
            // Avisa (uma vez só, sem spam) quando falha de forma persistente.
            if (falhasSeguidas === 3) {
              toast.error("Não consegui sincronizar com o app Lembretes", {
                id: "lembretes-falhando",
                description: `${String(erro).slice(0, 140)} — os alarmes continuam tocando no Infopro; vou seguir tentando.`,
                duration: 15_000,
              });
            }
          } finally {
            sincronizando = false;
          }
        }
        await carregarAtividades();
        verificar();
        if (pedidoPendente && !cancelado) { pedidoPendente = false; void rodadaAtividades(); }
      };
      // Mudança no Infopro → Lembretes quase na hora (~1,5 s, agrupando
      // várias mudanças seguidas numa rodada só).
      const pedirSincronizacao = () => {
        window.clearTimeout(espera);
        espera = window.setTimeout(() => void rodadaAtividades(), 1500);
      };
      void carregar();
      void rodadaAtividades();
      recarga = window.setInterval(() => void carregar(), 5 * 60_000);
      // Lembretes → Infopro: o macOS não avisa quando um lembrete muda, então
      // confere a cada 15 s (leitura leve: cada lista de uma vez) e ao voltar pro app.
      recargaAtividades = window.setInterval(() => void rodadaAtividades(), 15_000);
      canalRealtime = supabase
        .channel(`lembretes-espelho-${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "atividades" }, pedirSincronizacao)
        .on("postgres_changes", { event: "*", schema: "public", table: "clientes" }, pedirSincronizacao)
        .subscribe();
      aoFocar = pedirSincronizacao;
      window.addEventListener("focus", aoFocar);
      relogio = window.setInterval(verificar, 15_000);
      window.addEventListener(EVENTO_ALARMES_ALTERADOS, aoAlterar);
      window.addEventListener(EVENTO_ALARMES_ATIVIDADE, aoAlterarAtividades);
    });

    return () => {
      cancelado = true;
      window.clearInterval(recarga);
      window.clearInterval(recargaAtividades);
      window.clearInterval(relogio);
      window.clearTimeout(espera);
      if (canalRealtime) void supabase.removeChannel(canalRealtime);
      if (aoFocar) window.removeEventListener("focus", aoFocar);
      window.removeEventListener(EVENTO_ALARMES_ALTERADOS, aoAlterar);
      window.removeEventListener(EVENTO_ALARMES_ATIVIDADE, aoAlterarAtividades);
    };
  }, []);
}
