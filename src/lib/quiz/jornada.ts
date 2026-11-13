// Jornada de um lead no quiz (13/11/2026, Davi: "quando eu clicar na pessoa, queria ver o fluxo dela, onde parou, avançou").
// Junta os eventos da sessão dela (visita, passo, fim, cta) com os passos do quiz e as respostas guardadas. Sem React: testável.
import type { EventoQuiz, LeadQuiz, PassoInfo } from "./painel";

export interface PassoJornada {
  indice: number; rotulo: string; tipo: PassoInfo["tipo"];
  alcancou: boolean;
  em: string | null;          // quando abriu essa tela
  segundos: number | null;    // quanto ficou até ir para a seguinte (null: ainda não saiu, ou sem registro)
  resposta: string | null;    // o que respondeu (só nas perguntas)
  pergunta: string | null;
}
export interface Jornada {
  passos: PassoJornada[];
  temEventos: boolean;
  entrouEm: string | null;
  ultimoPasso: number;        // índice da última tela que viu (-1: nenhuma)
  terminou: boolean;          // chegou ao fim das perguntas
  clicouOferta: boolean;
  duracaoSeg: number | null;  // da entrada até o último evento
  maisLenta: number | null;   // índice do passo em que mais demorou
}

export function jornadaDoLead(lead: Pick<LeadQuiz, "respostas" | "sessao" | "criada_em">, eventos: Pick<EventoQuiz, "sessao" | "tipo" | "passo" | "criado_em">[], passos: PassoInfo[]): Jornada {
  const meus = lead.sessao ? eventos.filter((e) => e.sessao === lead.sessao).sort((a, b) => Date.parse(a.criado_em) - Date.parse(b.criado_em)) : [];
  const abriu = new Map<number, string>();
  let entrouEm: string | null = null, terminou = false, clicouOferta = false, ultimoEvento = 0;
  for (const e of meus) {
    ultimoEvento = Math.max(ultimoEvento, Date.parse(e.criado_em));
    if (e.tipo === "visita" && !entrouEm) entrouEm = e.criado_em;
    if (e.tipo === "passo" && !abriu.has(e.passo)) abriu.set(e.passo, e.criado_em);
    if (e.tipo === "fim") terminou = true;
    if (e.tipo === "cta") clicouOferta = true;
  }
  const temEventos = meus.length > 0;
  const perguntasIdx = passos.map((p, i) => (p.tipo === "pergunta" ? i : -1)).filter((i) => i >= 0);
  const respostaDe = new Map<number, { pergunta: string; resposta: string | null }>();
  perguntasIdx.forEach((idx, k) => { const r = lead.respostas?.[k]; if (r) respostaDe.set(idx, r); });
  // Sem eventos (lead antigo): só dá para saber até qual pergunta respondeu.
  let ultimoPasso = temEventos ? Math.max(-1, ...abriu.keys()) : -1;
  if (!temEventos && respostaDe.size) ultimoPasso = Math.max(...respostaDe.keys());
  if (!temEventos && !terminou) terminou = (lead.respostas?.length ?? 0) >= perguntasIdx.length && perguntasIdx.length > 0;

  const lista: PassoJornada[] = passos.map((p, i) => {
    const em = abriu.get(i) ?? null;
    const proximo = [...abriu.entries()].filter(([k]) => k > i).sort((a, b) => a[0] - b[0])[0];
    const segundos = em && proximo ? Math.max(0, Math.round((Date.parse(proximo[1]) - Date.parse(em)) / 1000)) : null;
    const r = respostaDe.get(i);
    return { indice: i, rotulo: p.rotulo, tipo: p.tipo, alcancou: temEventos ? i <= ultimoPasso : i <= ultimoPasso, em, segundos, resposta: r ? r.resposta ?? "—" : null, pergunta: r?.pergunta ?? null };
  });
  const comTempo = lista.filter((p) => p.segundos != null);
  const maisLenta = comTempo.length ? comTempo.reduce((a, b) => ((b.segundos ?? 0) > (a.segundos ?? 0) ? b : a)).indice : null;
  const duracaoSeg = entrouEm && ultimoEvento ? Math.max(0, Math.round((ultimoEvento - Date.parse(entrouEm)) / 1000)) : null;
  return { passos: lista, temEventos, entrouEm, ultimoPasso, terminou, clicouOferta, duracaoSeg, maisLenta };
}

export const duracaoCurta = (seg: number | null): string => {
  if (seg == null) return "—";
  if (seg < 60) return `${seg}s`;
  const m = Math.floor(seg / 60), s = seg % 60;
  return s ? `${m}min ${s}s` : `${m}min`;
};
