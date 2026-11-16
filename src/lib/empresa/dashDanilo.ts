// Esteira de edição de vídeo do Danilo (clique no Danilo; 16/11/2026, Davi: "bora criar um dash para o Danilo, bem parecido com o do Lauro").
// Lógica pura, testada em tests/empresaDashDanilo.test.mjs. Reaproveita as etapas do dash dark (src/lib/empresa/dashDark.ts).
import { etapaEsteira, type EdicaoDark, type EtapaEsteira } from "./dashDark";

export type EtapaDanilo = Exclude<EtapaEsteira, "cancelado">;
export const ORDEM_DANILO: EtapaDanilo[] = ["fila", "criando", "edicao", "revisao", "pronto", "programado", "postado"];
export const ROTULO_DANILO: Record<EtapaDanilo, string> = { fila: "Na fila", criando: "Editando", edicao: "Renderizando", revisao: "Em revisão", pronto: "Pronto", programado: "Programado", postado: "Postado" };
const FRASE: Record<EtapaDanilo, string> = {
  fila: "entrou na fila", criando: "começou a ser editado", edicao: "está renderizando", revisao: "foi para revisão", pronto: "foi aprovado (pronto)", programado: "foi programado", postado: "foi postado",
};

export interface EdicaoVideo extends Omit<EdicaoDark, "perfil"> { formato: string | null }
export const nomeFormato = (f: string | null) => (f === "classico" ? "Clássico" : f === "papel" ? "Papel (tela dividida)" : "Sem formato");
const chaveFormato = (f: string | null) => (f === "classico" || f === "papel" ? f : "outro");

export interface LinhaFormato { id: string; nome: string; videos: (EdicaoVideo & { etapa: EtapaDanilo })[]; ativos: number; postados: number; ultimo: string }

export function resumirDanilo(edicoes: EdicaoVideo[], hoje: string) {
  const geral: Record<EtapaDanilo, number> & { total: number } = { fila: 0, criando: 0, edicao: 0, revisao: 0, pronto: 0, programado: 0, postado: 0, total: 0 };
  const linhas = new Map<string, LinhaFormato>();
  for (const e of edicoes) {
    const etapa = etapaEsteira({ ...e }, hoje);
    if (etapa === "cancelado") continue;
    geral[etapa]++; geral.total++;
    const k = chaveFormato(e.formato);
    const l = linhas.get(k) ?? { id: k, nome: nomeFormato(k === "outro" ? null : k), videos: [], ativos: 0, postados: 0, ultimo: "" };
    l.videos.push({ ...e, etapa });
    if (etapa === "postado") l.postados++; else l.ativos++;
    if (!l.ultimo || e.atualizado_em > l.ultimo) l.ultimo = e.atualizado_em;
    linhas.set(k, l);
  }
  const rank = (e: { etapa: EtapaDanilo }) => ORDEM_DANILO.indexOf(e.etapa);
  for (const l of linhas.values()) l.videos.sort((a, b) => rank(a) - rank(b) || b.atualizado_em.localeCompare(a.atualizado_em));
  return { geral, linhas: [...linhas.values()].sort((a, b) => b.ultimo.localeCompare(a.ultimo)) };
}

export interface AtividadeDanilo { id: string; titulo: string; etapa: EtapaDanilo; frase: string; quando: string }
export function atividadeDanilo(edicoes: EdicaoVideo[], hoje: string, n = 6): AtividadeDanilo[] {
  return edicoes.filter((e) => etapaEsteira({ ...e }, hoje) !== "cancelado").sort((a, b) => b.atualizado_em.localeCompare(a.atualizado_em)).slice(0, n)
    .map((e) => { const etapa = etapaEsteira({ ...e }, hoje) as EtapaDanilo; return { id: e.id, titulo: e.titulo.replace(/^Versão dark:\s*/i, ""), etapa, frase: FRASE[etapa], quando: e.atualizado_em }; });
}

/** Tempo médio, em horas, da criação até a última mudança das edições já aprovadas dos últimos `dias` dias (null se não houver). */
export function horasMediaDeEdicao(edicoes: EdicaoVideo[], agora: Date, dias = 30): number | null {
  const limite = agora.getTime() - dias * 86400000;
  const ok = edicoes.filter((e) => e.status === "aprovado" && Date.parse(e.atualizado_em) >= limite);
  if (!ok.length) return null;
  const soma = ok.reduce((s, e) => s + Math.max(0, Date.parse(e.atualizado_em) - Date.parse(e.criado_em)), 0);
  return Math.round((soma / ok.length / 3600000) * 10) / 10;
}
