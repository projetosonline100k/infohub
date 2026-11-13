// Fluxo de mensagens do Instagram (13/11/2026, Davi: "criar um fluxo de mensagem, igual o dash do ManyChat").
// Lógica pura (sem rede nem banco), usada pela edge `instagram-automacoes` (motor) e pelo app (editor + testes).
// O fluxo é um grafo: blocos (nós) ligados por saídas. Cada bloco tem saídas nomeadas:
//   mensagem → "proximo" (sem botões de resposta) ou o id de cada botão de resposta (+ "outro" para texto livre)
//   esperar  → "proximo" depois do tempo
//   condicao → "sim" | "nao"
//   fim      → nenhuma

export type TipoNo = "inicio" | "mensagem" | "esperar" | "condicao" | "fim";
export type Botao = { id: string; titulo: string; tipo: "resposta" | "link"; url?: string };
export type CondicaoTipo = "respondeu" | "texto_contem";
export type DadosNo = {
  texto?: string;               // mensagem
  botoes?: Botao[];             // mensagem: ou só respostas, ou só links (a Meta não mistura os dois)
  minutos?: number;             // esperar
  condicao?: CondicaoTipo;      // condicao
  palavra?: string;             // condicao texto_contem
};
export type NoFluxo = { id: string; tipo: TipoNo; x: number; y: number; dados: DadosNo };
export type Ligacao = { de: string; saida: string; para: string };
export type GrafoFluxo = { nos: NoFluxo[]; ligacoes: Ligacao[] };

export const LIMITE_TITULO_BOTAO = 20;     // Meta: título do botão/resposta rápida
export const LIMITE_TEXTO = 640;           // Meta: texto com botões (template "button")
export const LIMITE_TEXTO_SIMPLES = 1000;  // Meta: texto de DM com respostas rápidas
export const MAX_BOTOES_LINK = 3;
export const MAX_RESPOSTAS = 13;
export const MINUTOS_MAX_ESPERA = 24 * 60; // a janela de resposta da Meta é de 24 h

export const grafoVazio = (): GrafoFluxo => ({
  nos: [{ id: "inicio", tipo: "inicio", x: 0, y: 0, dados: {} }],
  ligacoes: [],
});

export const respostasDoNo = (no: NoFluxo) => (no.dados.botoes ?? []).filter((b) => b.tipo === "resposta");
export const linksDoNo = (no: NoFluxo) => (no.dados.botoes ?? []).filter((b) => b.tipo === "link");

/** Saídas que o bloco oferece (o editor desenha um ponto para cada). */
export function saidasDoNo(no: NoFluxo): { id: string; rotulo: string }[] {
  switch (no.tipo) {
    case "inicio": return [{ id: "proximo", rotulo: "" }];
    case "esperar": return [{ id: "proximo", rotulo: "" }];
    case "condicao": return [{ id: "sim", rotulo: "Sim" }, { id: "nao", rotulo: "Não" }];
    case "mensagem": {
      const r = respostasDoNo(no);
      return r.length ? [...r.map((b) => ({ id: b.id, rotulo: b.titulo || "Botão" })), { id: "outro", rotulo: "Outra resposta" }] : [{ id: "proximo", rotulo: "" }];
    }
    default: return [];
  }
}

export const destinoDe = (g: GrafoFluxo, de: string, saida: string): NoFluxo | null => {
  const l = g.ligacoes.find((x) => x.de === de && x.saida === saida);
  return l ? g.nos.find((n) => n.id === l.para) ?? null : null;
};

export const primeiroNo = (g: GrafoFluxo): NoFluxo | null => destinoDe(g, "inicio", "proximo");

/** O bloco fica esperando a pessoa responder? (mensagem com botões de resposta) */
export const aguardaResposta = (no: NoFluxo) => no.tipo === "mensagem" && respostasDoNo(no).length > 0;

export type ProblemaFluxo = { no?: string; texto: string };
/** Confere o fluxo antes de ativar: o que a Meta recusaria e o que deixaria o robô parado. */
export function problemasDoFluxo(g: GrafoFluxo): ProblemaFluxo[] {
  const p: ProblemaFluxo[] = [];
  if (!primeiroNo(g)) p.push({ no: "inicio", texto: "Ligue o início a uma primeira mensagem." });
  for (const n of g.nos) {
    if (n.tipo === "mensagem") {
      const texto = (n.dados.texto ?? "").trim();
      const r = respostasDoNo(n), l = linksDoNo(n);
      if (!texto) p.push({ no: n.id, texto: "Mensagem sem texto." });
      if (r.length && l.length) p.push({ no: n.id, texto: "Use só botões de resposta ou só botões de link na mesma mensagem (a Meta não mistura)." });
      if (l.length > MAX_BOTOES_LINK) p.push({ no: n.id, texto: `No máximo ${MAX_BOTOES_LINK} botões de link por mensagem.` });
      if (r.length > MAX_RESPOSTAS) p.push({ no: n.id, texto: `No máximo ${MAX_RESPOSTAS} botões de resposta.` });
      if (l.length && texto.length > LIMITE_TEXTO) p.push({ no: n.id, texto: `Com botão de link o texto vai até ${LIMITE_TEXTO} caracteres.` });
      if (texto.length > LIMITE_TEXTO_SIMPLES) p.push({ no: n.id, texto: `O texto passa de ${LIMITE_TEXTO_SIMPLES} caracteres.` });
      for (const b of n.dados.botoes ?? []) {
        if (!b.titulo.trim()) p.push({ no: n.id, texto: "Botão sem título." });
        if (b.titulo.length > LIMITE_TITULO_BOTAO) p.push({ no: n.id, texto: `O título do botão “${b.titulo}” passa de ${LIMITE_TITULO_BOTAO} caracteres.` });
        if (b.tipo === "link" && !/^https?:\/\/\S+$/.test(b.url ?? "")) p.push({ no: n.id, texto: `O botão “${b.titulo}” precisa de um link https://…` });
      }
    }
    if (n.tipo === "esperar") {
      const m = n.dados.minutos ?? 0;
      if (!(m >= 1 && m <= MINUTOS_MAX_ESPERA)) p.push({ no: n.id, texto: "A espera vai de 1 minuto a 24 horas (a janela de resposta da Meta fecha em 24 h)." });
    }
    if (n.tipo === "condicao" && n.dados.condicao === "texto_contem" && !(n.dados.palavra ?? "").trim()) p.push({ no: n.id, texto: "Escreva a palavra que a condição procura." });
    if (n.tipo === "condicao" && !destinoDe(g, n.id, "sim") && !destinoDe(g, n.id, "nao")) p.push({ no: n.id, texto: "A condição não leva a lugar nenhum." });
  }
  // blocos soltos (sem entrada) nunca rodam
  const comEntrada = new Set(g.ligacoes.map((l) => l.para));
  for (const n of g.nos) if (n.tipo !== "inicio" && !comEntrada.has(n.id)) p.push({ no: n.id, texto: "Bloco solto: nada leva até ele." });
  // laço sem espera pelo caminho: o robô mandaria mensagens sem parar
  const ciclo = temCicloSemPausa(g);
  if (ciclo) p.push({ no: ciclo, texto: "Esse caminho volta a si mesmo sem esperar a pessoa nem o tempo: viraria um laço." });
  return p;
}

function temCicloSemPausa(g: GrafoFluxo): string | null {
  // pausa = esperar ou mensagem que aguarda resposta; só os ciclos que não passam por pausa são perigosos
  const porId = new Map(g.nos.map((n) => [n.id, n]));
  const pausa = (n: NoFluxo) => n.tipo === "esperar" || aguardaResposta(n);
  const estado = new Map<string, 1 | 2>();
  const visita = (id: string): string | null => {
    const n = porId.get(id);
    if (!n || pausa(n)) return null;
    if (estado.get(id) === 1) return id;
    if (estado.get(id) === 2) return null;
    estado.set(id, 1);
    for (const l of g.ligacoes.filter((x) => x.de === id)) { const r = visita(l.para); if (r) return r; }
    estado.set(id, 2);
    return null;
  };
  for (const n of g.nos) { const r = visita(n.id); if (r) return r; }
  return null;
}

export type Contexto = { respondeu: boolean; ultimoTexto: string };
const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function avaliarCondicao(no: NoFluxo, ctx: Contexto): boolean {
  if (no.dados.condicao === "texto_contem") {
    const chave = normalizar(no.dados.palavra ?? "");
    return !!chave && ` ${normalizar(ctx.ultimoTexto)} `.includes(` ${chave} `);
  }
  return ctx.respondeu;
}

/** Qual saída a resposta da pessoa escolhe? payload do botão (quick reply/postback) ou o texto livre. */
export function saidaDaResposta(no: NoFluxo, payload: string | null, texto: string): string | null {
  const r = respostasDoNo(no);
  if (payload) { const b = r.find((x) => x.id === payload); if (b) return b.id; }
  const t = normalizar(texto);
  const porTitulo = r.find((x) => normalizar(x.titulo) === t);
  return porTitulo ? porTitulo.id : "outro";
}

/** Mesmo gatilho das automações: palavra no comentário/DM/story. */
export function fluxoBate(f: { palavras_chave: string[]; correspondencia: "contem" | "exata" }, texto: string): boolean {
  const t = normalizar(texto);
  if (!t) return false;
  return f.palavras_chave.some((p) => {
    const k = normalizar(p);
    return !!k && (f.correspondencia === "exata" ? t === k : ` ${t} `.includes(` ${k} `));
  });
}

export type PassoPlanejado =
  | { tipo: "enviar"; no: NoFluxo }
  | { tipo: "esperar_resposta"; no: NoFluxo }
  | { tipo: "esperar_tempo"; no: NoFluxo; minutos: number }
  | { tipo: "fim"; no?: NoFluxo; motivo: string };

/** Dado o bloco atual, devolve o que o motor faz a seguir (sem efeitos). `max` evita laços. */
export function proximoPasso(g: GrafoFluxo, atual: NoFluxo, ctx: Contexto, max = 25): PassoPlanejado {
  let n: NoFluxo | null = atual;
  for (let i = 0; i < max && n; i++) {
    if (n.tipo === "mensagem") return { tipo: "enviar", no: n };
    if (n.tipo === "esperar") return { tipo: "esperar_tempo", no: n, minutos: Math.max(1, Math.min(MINUTOS_MAX_ESPERA, n.dados.minutos ?? 1)) };
    if (n.tipo === "condicao") { n = destinoDe(g, n.id, avaliarCondicao(n, ctx) ? "sim" : "nao"); continue; }
    if (n.tipo === "fim") return { tipo: "fim", no: n, motivo: "fim do fluxo" };
    n = destinoDe(g, n.id, "proximo");
  }
  return { tipo: "fim", motivo: n ? "passos demais seguidos" : "o caminho acaba aqui" };
}
