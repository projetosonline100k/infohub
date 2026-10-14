// Lógica pura das automações do Instagram (palavra-chave → DM). A mesma regra
// de comparação roda na edge function `instagram-automacoes`; aqui serve para
// a tela testar uma frase antes de publicar.

export type Gatilho = "comentario" | "dm" | "story";
export type Correspondencia = "contem" | "exata";

export const GATILHOS: { valor: Gatilho; rotulo: string; descricao: string }[] = [
  { valor: "comentario", rotulo: "Comentário", descricao: "Comentou a palavra num post ou reel" },
  { valor: "dm", rotulo: "Direct", descricao: "Mandou a palavra por DM" },
  { valor: "story", rotulo: "Story", descricao: "Respondeu um story com a palavra" },
];

export const normalizar = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export function bate(palavrasChave: string[], correspondencia: Correspondencia, texto: string) {
  const frase = normalizar(texto);
  if (!frase) return false;
  return palavrasChave.some((palavra) => {
    const chave = normalizar(palavra);
    if (!chave) return false;
    return correspondencia === "exata" ? frase === chave : ` ${frase} `.includes(` ${chave} `);
  });
}

/** "QUERO, eu quero ,, " → ["QUERO", "eu quero"] (sem repetidas, ignorando caixa/acento). */
export function separarPalavras(texto: string) {
  const vistas = new Set<string>();
  return texto
    .split(/[,\n]/)
    .map((p) => p.trim())
    .filter((p) => {
      const chave = normalizar(p);
      if (!chave || vistas.has(chave)) return false;
      vistas.add(chave);
      return true;
    });
}

/** Palavras usadas por mais de uma automação ativa no mesmo gatilho. */
export function conflitos(
  automacoes: { id: string; nome: string; ativo: boolean; palavras_chave: string[]; gatilhos: string[] }[],
  atual: { id?: string; palavras_chave: string[]; gatilhos: string[] },
) {
  const minhas = new Set(atual.palavras_chave.map(normalizar));
  return automacoes
    .filter((a) => a.ativo && a.id !== atual.id && a.gatilhos.some((g) => atual.gatilhos.includes(g)))
    .flatMap((a) => a.palavras_chave.filter((p) => minhas.has(normalizar(p))).map((p) => ({ automacao: a.nome, palavra: p })));
}

// ---------------------------------------------------------------------------
// Resultados (funil e gráficos da tela /automacoes)

export type DisparoResumo = {
  automacao_id: string | null;
  origem: string;
  dm_status: string;
  cliques: number;
  links: string[];
  respondeu_em: string | null;
  criado_em: string;
};

export type EtapaFunil = { chave: string; rotulo: string; valor: number; doAnterior: number | null; doTopo: number };

const pct = (parte: number, todo: number) => (todo > 0 ? parte / todo : 0);

/** Gatilho → DM enviada → clicou (só DMs com link) → respondeu. */
export function funil(disparos: DisparoResumo[]): EtapaFunil[] {
  const gatilhos = disparos.length;
  const enviadas = disparos.filter((d) => d.dm_status === "enviada");
  const comLink = enviadas.filter((d) => d.links.length > 0);
  const clicaram = comLink.filter((d) => d.cliques > 0).length;
  const responderam = enviadas.filter((d) => d.respondeu_em).length;
  const etapas = [
    { chave: "gatilhos", rotulo: "Gatilhos", valor: gatilhos },
    { chave: "enviadas", rotulo: "DMs enviadas", valor: enviadas.length },
    { chave: "clicaram", rotulo: "Clicaram no link", valor: clicaram },
    { chave: "responderam", rotulo: "Responderam a DM", valor: responderam },
  ];
  return etapas.map((e, i) => ({
    ...e,
    // Clique é medido só sobre DMs que tinham link; resposta, sobre as enviadas.
    doAnterior: i === 0 ? null : pct(e.valor, e.chave === "clicaram" ? comLink.length : enviadas.length),
    doTopo: pct(e.valor, gatilhos),
  }));
}

const diaLocal = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Um ponto por dia (inclusive os vazios), com DMs enviadas por origem. */
export function serieDiaria(disparos: DisparoResumo[], dias: number, hoje = new Date()) {
  const pontos: { dia: string; comentario: number; dm: number; story: number; falhas: number }[] = [];
  const indice = new Map<string, number>();
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - i);
    const chave = diaLocal(d.toISOString());
    indice.set(chave, pontos.length);
    pontos.push({ dia: chave, comentario: 0, dm: 0, story: 0, falhas: 0 });
  }
  for (const d of disparos) {
    const i = indice.get(diaLocal(d.criado_em));
    if (i === undefined) continue;
    if (d.dm_status === "enviada") {
      const origem = d.origem as "comentario" | "dm" | "story";
      if (origem in pontos[i]) pontos[i][origem] += 1;
    } else if (d.dm_status === "erro") pontos[i].falhas += 1;
  }
  return pontos;
}

/** Métricas por automação, da que mais enviou para a que menos. */
export function porAutomacao(disparos: DisparoResumo[], nomes: Map<string, string>) {
  const grupos = new Map<string, DisparoResumo[]>();
  for (const d of disparos) {
    const chave = d.automacao_id ?? "apagada";
    grupos.set(chave, [...(grupos.get(chave) ?? []), d]);
  }
  return [...grupos.entries()]
    .map(([id, lista]) => {
      const [g, e, c, r] = funil(lista);
      return {
        id,
        nome: nomes.get(id) ?? "Automação apagada",
        gatilhos: g.valor,
        enviadas: e.valor,
        clicaram: c.valor,
        taxaClique: c.doAnterior ?? 0,
        responderam: r.valor,
        taxaResposta: r.doAnterior ?? 0,
        falhas: lista.filter((d) => d.dm_status === "erro").length,
      };
    })
    .sort((a, b) => b.enviadas - a.enviadas);
}
