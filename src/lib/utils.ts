import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { parseISO, startOfDay, differenceInCalendarDays } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Rótulo relativo pra uma data "yyyy-MM-dd", tipo "Amanhã" ou "Em 3 dias" —
// bate o olho mais rápido do que só o dia/mês. `dataStr` inválida retorna null.
export function rotuloDataRelativa(dataStr: string): string | null {
  try {
    const alvo = startOfDay(parseISO(dataStr));
    const hoje = startOfDay(new Date());
    const diff = differenceInCalendarDays(alvo, hoje);
    if (diff === 0) return "Hoje";
    if (diff === 1) return "Amanhã";
    if (diff === -1) return "Ontem";
    if (diff > 1) return `Em ${diff} dias`;
    return `Há ${Math.abs(diff)} dias`;
  } catch {
    return null;
  }
}

// Iniciais para avatar a partir de um nome, ex: "Ana Paula" -> "AP".
export function iniciais(nome: string): string {
  return nome
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");
}

// Minutos em texto curto, ex: 90 -> "1h 30min".
export function formatarTempo(minutos: number): string {
  if (minutos >= 60) {
    const horas = Math.floor(minutos / 60);
    const mins = minutos % 60;
    return mins > 0 ? `${horas}h ${mins}min` : `${horas}h`;
  }
  return `${minutos}min`;
}
