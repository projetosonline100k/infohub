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

// ---------------------------------------------------------------- "O que fazer para chegar mais perto"
// (20/10, Davi) Sugestões tiradas dos números do próprio perfil: quanto de alcance a meta pede,
// que formato rende mais, que posts repetir, quantos posts por semana e um prazo realista.
export interface PostIg {
  tipo: string | null; formato: string | null; legenda: string | null; permalink: string | null; publicado_em: string;
  visualizacoes: number | null; alcance: number | null; salvamentos: number | null; compartilhamentos: number | null;
}
export interface DiaIg { dia: string; seguidores: number | null; visualizacoes: number | null }
export interface Sugestao { id: string; titulo: string; texto: string; links?: { rotulo: string; url: string }[] }

const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const ehReel = (p: PostIg) => p.tipo === "REELS" || p.formato === "VIDEO";
const fmt = (n: number) => Math.round(n).toLocaleString("pt-BR");
const resumoLegenda = (l: string | null) => (l ?? "").split("\n")[0].replace(/\s+/g, " ").trim().slice(0, 60) || "post";

export function sugestoesMeta(c: Corrida, posts: PostIg[], dias: DiaIg[], hoje = new Date()): Sugestao[] {
  const out: Sugestao[] = [];
  if (c.chegou) return [{ id: "nova-meta", titulo: "Meta batida 🎉", texto: "Hora de colocar a próxima meta (e a largada começa hoje)." }];

  // 1) Quanto de visualização a meta pede: seguidores ganhos a cada 1.000 visualizações.
  const ds = dias.filter((d) => d.seguidores != null).sort((a, b) => a.dia.localeCompare(b.dia));
  const ganho = ds.length > 1 ? ds[ds.length - 1].seguidores! - ds[0].seguidores! : 0;
  const views = ds.slice(1).reduce((s, d) => s + (d.visualizacoes ?? 0), 0);
  const viewsDia = ds.length > 1 ? views / (ds.length - 1) : 0;
  if (ganho > 0 && views > 0) {
    const porMil = (ganho / views) * 1000;
    const alvoDia = c.precisaPorDia ?? (c.ritmoDia ? c.ritmoDia * 1.5 : null);
    if (alvoDia) {
      const viewsNecessarias = (alvoDia / porMil) * 1000;
      out.push({
        id: "alcance", titulo: `Chegar a ~${fmt(viewsNecessarias / 1000)} mil visualizações por dia`,
        texto: `Hoje cada 1.000 visualizações viram ~${porMil.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} seguidores e o perfil faz ~${fmt(viewsDia / 1000)} mil visualizações/dia. `
          + (c.precisaPorDia ? `Para +${fmt(alvoDia)}/dia (o que o prazo pede) seriam ~${fmt(viewsNecessarias / 1000)} mil/dia — ${fmt(viewsNecessarias / Math.max(viewsDia, 1))}× o de hoje.`
            : `Para andar 50% mais rápido seriam ~${fmt(viewsNecessarias / 1000)} mil/dia.`),
      });
    }
  }

  // 2) Formato que rende mais.
  const reels = posts.filter(ehReel), carros = posts.filter((p) => !ehReel(p));
  const vR = media(reels.map((p) => p.visualizacoes ?? 0)), vC = media(carros.map((p) => p.visualizacoes ?? 0));
  if (reels.length >= 3 && carros.length >= 3 && vR > 0 && vC > 0) {
    const [melhor, pior, vm, vp] = vR >= vC ? ["Reels", "carrosséis", vR, vC] : ["Carrosséis", "reels", vC, vR];
    out.push({
      id: "formato", titulo: `${melhor} rendem ${(vm / vp).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}× mais`,
      texto: `Média de ${fmt(vm)} visualizações contra ${fmt(vp)} dos ${pior} (últimos ${posts.length} posts). Dê prioridade a ${melhor.toLowerCase()} e use o outro formato para reforçar.`,
    });
  }

  // 3) Repetir o que mais espalhou (compartilhamento é o que mais traz gente nova).
  const top = [...posts].sort((a, b) => (b.compartilhamentos ?? 0) - (a.compartilhamentos ?? 0)).filter((p) => (p.compartilhamentos ?? 0) > 0).slice(0, 3);
  if (top.length) {
    out.push({
      id: "repetir", titulo: "Fazer mais do que mais foi compartilhado",
      texto: "Compartilhamento é o que mais traz gente nova. Faça novas versões destes temas (outro gancho, versão dark, carrossel do mesmo assunto):",
      links: top.map((p) => ({ rotulo: `${resumoLegenda(p.legenda)} · ${fmt(p.compartilhamentos ?? 0)} compart.`, url: p.permalink ?? "" })).filter((l) => l.url),
    });
  }

  // 4) Frequência: posts nos últimos 7 dias.
  const semana = posts.filter((p) => hoje.getTime() - new Date(p.publicado_em).getTime() <= 7 * 86_400_000).length;
  if (semana < 10) {
    out.push({
      id: "frequencia", titulo: `Postar mais: ${semana} posts nos últimos 7 dias`,
      texto: "Cada post é mais uma chance de cair no Explorar. Mire em 1 reel + 1 carrossel por dia: a Dalila já programa sozinha o que você aprovar.",
    });
  }

  // 5) Prazo realista.
  if (c.precisaPorDia && c.ritmoDia && c.ritmoDia > 0 && c.noRitmo === false && c.diasAtePrazo != null) {
    const realista = c.atual + c.ritmoDia * 1.5 * c.diasAtePrazo;
    out.push({
      id: "prazo", titulo: "Meta do meio do caminho",
      texto: `O prazo pede ${fmt(c.precisaPorDia / c.ritmoDia)}× o ritmo de hoje. Uma meta intermediária realista até lá: ${numeroCurto(Math.round(realista / 1000) * 1000)} (crescendo 50% mais rápido)`
        + (c.previsao ? `; no ritmo atual os ${numeroCurto(c.meta)} chegam em ${c.previsao.split("-").reverse().join("/")}.` : "."),
    });
  }
  return out;
}
