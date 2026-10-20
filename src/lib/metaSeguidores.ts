// Corrida até a meta de seguidores (20/10, Davi: "colocar a minha meta, tipo bater 100k de
// seguidores, e ter uma corrida até chegar, para ser visual"). Conta pura, sem React.
export interface PontoSeguidores { dia: string; seguidores: number | null }

export interface Corrida {
  largada: number;            // seguidores no dia em que a corrida começou
  atual: number;
  meta: number;
  pct: number;                // 0–100, do zero até a meta (a pista começa no zero)
  pctLargada: number;
  faltam: number;
  ritmoDia: number | null;    // média de ganho por dia nos últimos 7 dias com dado
  previsao: string | null;    // "aaaa-mm-dd" em que chega nesse ritmo (null se não cresce)
  precisaPorDia: number | null; // para bater no prazo
  diasAtePrazo: number | null;
  noRitmo: boolean | null;    // ritmo atual dá conta do prazo?
  marcos: number[];           // placas no caminho (valores redondos entre a largada e a meta)
  chegou: boolean;
}

const DIA = 86_400_000;
const paraData = (s: string) => new Date(`${s}T12:00:00`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

export function marcosDaPista(largada: number, meta: number): number[] {
  const passos = [1_000, 2_000, 5_000, 10_000, 20_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000];
  const passo = passos.find((p) => (meta - 0) / p <= 6) ?? passos[passos.length - 1];
  const out: number[] = [];
  for (let v = passo; v < meta; v += passo) if (v > largada * 0.5) out.push(v);
  return out.slice(-6);
}

export function corridaMeta(serie: PontoSeguidores[], meta: number, opcoes: { desde?: string | null; prazo?: string | null; hoje?: Date } = {}): Corrida | null {
  const pontos = serie.filter((p): p is { dia: string; seguidores: number } => p.seguidores != null).sort((a, b) => a.dia.localeCompare(b.dia));
  if (!pontos.length || meta <= 0) return null;
  const hoje = opcoes.hoje ?? new Date();
  const atual = pontos[pontos.length - 1].seguidores;
  const daLargada = opcoes.desde ? pontos.find((p) => p.dia >= opcoes.desde!) ?? pontos[pontos.length - 1] : pontos[0];
  const largada = daLargada.seguidores;

  // Ritmo: ganho entre o ponto de ~7 dias atrás e o último, dividido pelos dias.
  const ultimo = pontos[pontos.length - 1];
  const limite = iso(new Date(paraData(ultimo.dia).getTime() - 7 * DIA));
  const base = pontos.find((p) => p.dia >= limite) ?? pontos[0];
  const dias = Math.round((paraData(ultimo.dia).getTime() - paraData(base.dia).getTime()) / DIA);
  const ritmoDia = dias > 0 ? (ultimo.seguidores - base.seguidores) / dias : null;

  const faltam = Math.max(0, meta - atual);
  const chegou = atual >= meta;
  const previsao = chegou ? ultimo.dia : ritmoDia && ritmoDia > 0 ? iso(new Date(paraData(ultimo.dia).getTime() + Math.ceil(faltam / ritmoDia) * DIA)) : null;

  let precisaPorDia: number | null = null, diasAtePrazo: number | null = null, noRitmo: boolean | null = null;
  if (opcoes.prazo && !chegou) {
    diasAtePrazo = Math.max(0, Math.ceil((paraData(opcoes.prazo).getTime() - hoje.getTime()) / DIA));
    precisaPorDia = diasAtePrazo > 0 ? Math.ceil(faltam / diasAtePrazo) : faltam;
    noRitmo = ritmoDia != null ? ritmoDia >= precisaPorDia : null;
  }
  const pct = Math.min(100, (atual / meta) * 100);
  return {
    largada, atual, meta, pct, pctLargada: Math.min(100, (largada / meta) * 100), faltam, ritmoDia, previsao,
    precisaPorDia, diasAtePrazo, noRitmo, marcos: marcosDaPista(largada, meta), chegou,
  };
}

export function numeroCurto(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (n >= 1_000) return `${(n / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: n >= 100_000 ? 0 : 1 })} mil`;
  return n.toLocaleString("pt-BR");
}
