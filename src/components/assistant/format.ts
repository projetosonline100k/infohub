import { differenceInCalendarDays, parseISO, startOfDay } from "date-fns";

export const formatarCronometro = (segundos: number) => {
  const s = Math.max(0, Math.round(segundos));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

// Rótulo (minúsculo, tipo "atrasada há 6 dias" / "vence hoje" / "vence em 3
// dias") a partir de uma data "yyyy-MM-dd". Quem chama decide a frase em
// volta e a capitalização.
export function rotuloPrazo(dataVencimento: string | null): { texto: string; atrasada: boolean } | null {
  if (!dataVencimento) return null;
  const dias = differenceInCalendarDays(startOfDay(parseISO(dataVencimento)), startOfDay(new Date()));
  if (dias < 0) return { texto: `atrasada há ${Math.abs(dias)} dia${Math.abs(dias) > 1 ? "s" : ""}`, atrasada: true };
  if (dias === 0) return { texto: "vence hoje", atrasada: false };
  if (dias === 1) return { texto: "vence amanhã", atrasada: false };
  return { texto: `vence em ${dias} dias`, atrasada: false };
}

export const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
