// Séries dos gráficos dos embaixadores (19/11/2026): agrupa dias em semanas (começam na segunda) ou meses. Sem importações: testável em Node.
export type Modo = "dia" | "semana" | "mes";

const paraData = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00Z`);
const paraTexto = (d: Date) => d.toISOString().slice(0, 10);
const somarDias = (d: string, n: number) => { const x = paraData(d); x.setUTCDate(x.getUTCDate() + n); return paraTexto(x); };

/** Chave do trecho a que o dia pertence: o próprio dia, a segunda-feira da semana ou o dia 1 do mês. */
export function chaveDe(dia: string, modo: Modo): string {
  if (modo === "dia") return dia.slice(0, 10);
  if (modo === "mes") return `${dia.slice(0, 7)}-01`;
  const sem = paraData(dia).getUTCDay();          // 0 = domingo
  return somarDias(dia.slice(0, 10), -((sem + 6) % 7));
}

/** Todas as chaves entre dois dias (inclusive), sem buracos: trecho sem dado aparece como zero no gráfico. */
export function intervalo(de: string, ate: string, modo: Modo): string[] {
  const out: string[] = [];
  let k = chaveDe(de, modo);
  const fim = chaveDe(ate, modo);
  for (let i = 0; k <= fim && i < 4000; i++) {
    out.push(k);
    if (modo === "dia") k = somarDias(k, 1);
    else if (modo === "semana") k = somarDias(k, 7);
    else { const d = paraData(k); d.setUTCMonth(d.getUTCMonth() + 1); k = paraTexto(d); }
  }
  return out;
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export function rotulo(chave: string, modo: Modo): string {
  const [a, m, d] = chave.split("-");
  if (modo === "mes") return `${MESES[Number(m) - 1]}/${a.slice(2)}`;
  return `${d}/${m}`;
}

/** Soma `campos` por trecho. `linhas` tem um `dia` (yyyy-MM-dd) e números; devolve um ponto por trecho entre `de` e `ate`. */
export function agrupar(linhas: ({ dia: string } & Record<string, number | string>)[], modo: Modo, campos: string[], de: string, ate: string) {
  const mapa = new Map<string, Record<string, number>>();
  for (const l of linhas) {
    const k = chaveDe(l.dia, modo);
    const alvo = mapa.get(k) ?? Object.fromEntries(campos.map((c) => [c, 0]));
    for (const c of campos) alvo[c] += Number(l[c] ?? 0);
    mapa.set(k, alvo);
  }
  return intervalo(de, ate, modo).map((k) => ({ chave: k, rotulo: rotulo(k, modo), ...(mapa.get(k) ?? Object.fromEntries(campos.map((c) => [c, 0]))) }));
}

export const hojeLocal = () => new Date().toLocaleDateString("sv-SE");
export const diasAtras = (n: number) => somarDias(hojeLocal(), -n);
