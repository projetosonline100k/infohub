// Many Hub: números por pessoa e por fluxo (14/11/2026, Davi: "ver os leads, quem avançou, quem não avançou"). Sem React: testável.
import { destinoDe, respostasDoNo, type GrafoFluxo, type NoFluxo } from "../../../supabase/functions/_shared/fluxo";

export interface ExecucaoMH { id: string; fluxo_id: string; contato_id: string; contato_username: string | null; estado: string; no_atual: string | null; historico: { no: string; tipo: string; em?: string }[] | null; erro: string | null; criado_em: string; respondeu?: boolean }
export interface DisparoMH { id: string; automacao_id: string | null; autor_id: string | null; autor_username: string | null; criado_em: string; respondeu_em: string | null; cliques: number; dm_status: string }
export interface FluxoMH { id: string; nome: string; grafo: GrafoFluxo }

export type SituacaoPessoa = "concluiu" | "avancou" | "parou" | "esperando" | "erro";
export interface PessoaMH {
  contatoId: string; username: string | null; ultimaEm: string; situacao: SituacaoPessoa;
  origem: { tipo: "fluxo" | "automacao"; nome: string };
  resumo: string;           // "Parou em: Mensagem 2 (esperando resposta)"
  respondeu: boolean; clicou: boolean;
}

const nomeDoNo = (g: GrafoFluxo, id: string | null): string => {
  const no = g.nos.find((n) => n.id === id);
  if (!no) return "o fim";
  const ordem = g.nos.filter((n) => n.tipo === "mensagem").findIndex((n) => n.id === id);
  if (no.tipo === "mensagem") return `Mensagem ${ordem + 1}${no.dados.texto ? ` (“${no.dados.texto.slice(0, 28)}${no.dados.texto.length > 28 ? "…" : ""}”)` : ""}`;
  if (no.tipo === "esperar") return "uma espera";
  if (no.tipo === "condicao") return "uma condição";
  return "o fim";
};

/** A pessoa é a mais recente execução dela em algum fluxo; senão, o disparo mais recente de uma automação simples. */
export function montarPessoas(execs: ExecucaoMH[], disparos: DisparoMH[], fluxos: FluxoMH[], nomesAutomacao: Map<string, string>): PessoaMH[] {
  const porId = new Map(fluxos.map((f) => [f.id, f]));
  const mapa = new Map<string, PessoaMH>();
  const ver = (p: PessoaMH) => { const a = mapa.get(p.contatoId); if (!a || Date.parse(p.ultimaEm) > Date.parse(a.ultimaEm)) mapa.set(p.contatoId, p); };
  for (const e of execs) {
    const f = porId.get(e.fluxo_id);
    const h = e.historico ?? [];
    const respondeu = !!e.respondeu || h.some((x) => x.tipo.startsWith("resposta:"));
    let situacao: SituacaoPessoa, resumo: string;
    if (e.estado === "erro") { situacao = "erro"; resumo = e.erro ? `Erro: ${e.erro.slice(0, 90)}` : "Erro ao mandar"; }
    else if (e.estado === "fim") { situacao = respondeu ? "concluiu" : "parou"; resumo = e.erro?.includes("assumiu") ? "Você assumiu a conversa" : respondeu ? "Concluiu o fluxo" : `Não respondeu${e.erro ? ` (${e.erro.slice(0, 60)})` : ""}`; }
    else if (e.estado === "aguardando_resposta") { situacao = "esperando"; resumo = `Esperando resposta em ${f ? nomeDoNo(f.grafo, e.no_atual) : "uma mensagem"}`; }
    else if (e.estado === "aguardando_tempo") { situacao = respondeu ? "avancou" : "esperando"; resumo = "Esperando o tempo do fluxo"; }
    else { situacao = "avancou"; resumo = "Em andamento"; }
    if (situacao === "esperando" && respondeu) situacao = "avancou";
    const ultima = [e.criado_em, ...h.map((x) => x.em ?? "")].filter(Boolean).sort().at(-1) ?? e.criado_em;
    ver({ contatoId: e.contato_id, username: e.contato_username, ultimaEm: ultima, situacao, origem: { tipo: "fluxo", nome: f?.nome ?? "Fluxo" }, resumo, respondeu, clicou: false });
  }
  for (const d of disparos) {
    if (!d.autor_id) continue;
    const respondeu = !!d.respondeu_em, clicou = d.cliques > 0;
    ver({ contatoId: d.autor_id, username: d.autor_username, ultimaEm: d.respondeu_em ?? d.criado_em, situacao: d.dm_status === "erro" ? "erro" : clicou || respondeu ? "avancou" : "parou",
      origem: { tipo: "automacao", nome: (d.automacao_id && nomesAutomacao.get(d.automacao_id)) || "Automação" },
      resumo: d.dm_status === "erro" ? "A DM não foi enviada" : clicou ? "Clicou no link" : respondeu ? "Respondeu a DM" : "Recebeu a DM, não respondeu", respondeu, clicou });
  }
  return [...mapa.values()].sort((a, b) => Date.parse(b.ultimaEm) - Date.parse(a.ultimaEm));
}

export interface LinhaFunil { no: NoFluxo; rotulo: string; chegaram: number; responderam: number; ramos: { titulo: string; n: number }[] }
/** Funil de um fluxo: os blocos de mensagem na ordem do caminho, com quantas pessoas chegaram em cada um e quantas responderam. */
export function funilDoFluxo(g: GrafoFluxo, execs: Pick<ExecucaoMH, "historico">[]): LinhaFunil[] {
  const chegou = new Map<string, number>(), resp = new Map<string, Map<string, number>>();
  for (const e of execs) {
    const vistos = new Set<string>();
    for (const h of e.historico ?? []) {
      if (h.tipo === "mensagem" && !vistos.has(h.no)) { vistos.add(h.no); chegou.set(h.no, (chegou.get(h.no) ?? 0) + 1); }
      if (h.tipo.startsWith("resposta:")) { const m = resp.get(h.no) ?? new Map<string, number>(); const k = h.tipo.slice(9); m.set(k, (m.get(k) ?? 0) + 1); resp.set(h.no, m); }
    }
  }
  const ordem: NoFluxo[] = [], visto = new Set<string>(), fila: string[] = ["inicio"];
  while (fila.length) {
    const id = fila.shift()!;
    if (visto.has(id)) continue;
    visto.add(id);
    const no = g.nos.find((n) => n.id === id);
    if (no && no.tipo === "mensagem") ordem.push(no);
    for (const l of g.ligacoes.filter((x) => x.de === id)) fila.push(l.para);
  }
  return ordem.map((no, i) => {
    const r = resp.get(no.id) ?? new Map<string, number>();
    const botoes = respostasDoNo(no);
    return { no, rotulo: `Mensagem ${i + 1}`, chegaram: chegou.get(no.id) ?? 0, responderam: [...r.values()].reduce((a, b) => a + b, 0),
      ramos: botoes.map((b) => ({ titulo: b.titulo, n: r.get(b.id) ?? 0 })) };
  });
}

/** Dá para responder pelo Many Hub? A Meta só deixa até 24 h depois da última mensagem da pessoa (comentário não conta). */
export function podeResponder(msgs: { de_mim: boolean; tipo: string; enviada_em: string }[], agora = Date.now()): { pode: boolean; ate: number | null } {
  const ultima = msgs.filter((m) => !m.de_mim && m.tipo !== "comentario").map((m) => Date.parse(m.enviada_em)).sort((a, b) => b - a)[0];
  if (!ultima) return { pode: false, ate: null };
  const ate = ultima + 24 * 3600_000;
  return { pode: agora <= ate, ate };
}
void destinoDe;
