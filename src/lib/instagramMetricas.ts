// Crescimento do Instagram a partir das linhas diárias de
// instagram_metricas_diarias (uma por conta e dia; edge instagram-metricas).

export type MetricaDiaria = {
  dia: string; // AAAA-MM-DD
  username: string | null;
  seguidores: number | null;
  alcance: number | null;
  visualizacoes: number | null;
  erro: string | null;
};

export type Periodo = {
  dias: number;
  ganho: number | null; // seguidores ganhos (null = ainda sem histórico)
  desde: string | null; // dia usado como base do ganho
  alcance: number | null; // soma do alcance diário
  visualizacoes: number | null;
};

export type ResumoInstagram = {
  conta: string | null;
  seguidores: number | null;
  atualizadoDia: string | null;
  semana: Periodo;
  mes: Periodo;
  semInsights: boolean; // falta a permissão de insights: reconectar a conta
};

const somarDias = (dia: string, dias: number) => {
  const data = new Date(`${dia}T12:00:00Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
};

const soma = (valores: (number | null)[]) => {
  const numeros = valores.filter((v): v is number => typeof v === "number");
  return numeros.length ? numeros.reduce((a, b) => a + b, 0) : null;
};

function periodo(linhas: MetricaDiaria[], ultimo: MetricaDiaria | undefined, dias: number): Periodo {
  if (!ultimo || ultimo.seguidores == null) return { dias, ganho: null, desde: null, alcance: null, visualizacoes: null };
  const corte = somarDias(ultimo.dia, -dias);
  const comSeguidores = linhas.filter((l) => l.seguidores != null && l.dia < ultimo.dia);
  // Base: o último dia até o corte; sem histórico tão antigo, o dia mais antigo que houver.
  const base = [...comSeguidores].reverse().find((l) => l.dia <= corte) ?? comSeguidores[0];
  const janela = linhas.filter((l) => l.dia > corte && l.dia <= ultimo.dia);
  return {
    dias,
    ganho: base ? ultimo.seguidores - (base.seguidores as number) : null,
    desde: base?.dia ?? null,
    alcance: soma(janela.map((l) => l.alcance)),
    visualizacoes: soma(janela.map((l) => l.visualizacoes)),
  };
}

export function resumoInstagram(linhas: MetricaDiaria[]): ResumoInstagram {
  const ordenadas = [...linhas].sort((a, b) => a.dia.localeCompare(b.dia));
  const ultimo = [...ordenadas].reverse().find((l) => l.seguidores != null);
  const maisRecente = ordenadas[ordenadas.length - 1];
  return {
    conta: maisRecente?.username ?? null,
    seguidores: ultimo?.seguidores ?? null,
    atualizadoDia: ultimo?.dia ?? null,
    semana: periodo(ordenadas, ultimo, 7),
    mes: periodo(ordenadas, ultimo, 30),
    semInsights: Boolean(maisRecente?.erro?.includes("insights")),
  };
}
