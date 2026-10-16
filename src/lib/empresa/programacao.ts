// Programação dos posts (Dalila, docs/agentes/dalila-programacao.md):
// o Davi escolhe dia e hora. Ritmo (pedido do Davi, 16/10): 1 carrossel por dia
// às 10h e 1 reel por dia às 18h, cada tipo contado à parte; um segundo reel
// no mesmo dia vai às 12h. Lógica pura, testada em tests/programacao.test.mjs.

export const HORA_PADRAO = "10:00";        // carrossel
export const HORA_REEL = "18:00";
export const HORA_REEL_EXTRA = "12:00";    // quando o dia já tem reel

const doisDigitos = (n: number) => String(n).padStart(2, "0");
export const diaLocal = (d: Date) => `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;

// Primeiro dia sem post programado em que o horário padrão ainda não passou
// (com 10 min de folga). `ocupados` = dias (yyyy-MM-dd) que já têm post.
export function sugerirData(agora: Date, ocupados: string[], hora = HORA_PADRAO): string {
  const [h, m] = hora.split(":").map(Number);
  const dia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), h, m);
  if (dia.getTime() - agora.getTime() < 10 * 60 * 1000) dia.setDate(dia.getDate() + 1);
  while (ocupados.includes(diaLocal(dia))) dia.setDate(dia.getDate() + 1);
  return diaLocal(dia);
}

// "2026-10-16" + "10:00" no fuso do navegador → instante (ISO).
export function instante(data: string, hora: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^\d{2}:\d{2}$/.test(hora)) return null;
  const d = new Date(`${data}T${hora}:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Hora sugerida para um reel no dia escolhido: 18h, ou 12h se o dia já tem reel.
export const horaDoReel = (dia: string, diasComReel: string[]) => (diasComReel.includes(dia) ? HORA_REEL_EXTRA : HORA_REEL);

// Por que não dá para programar nesse horário (ou null se dá).
export function problemaNoHorario(quando: Date | null, agora: Date): string | null {
  if (!quando) return "Escolha o dia e a hora.";
  if (quando.getTime() - agora.getTime() < 5 * 60 * 1000) return "Escolha um horário pelo menos 5 minutos à frente.";
  return null;
}
