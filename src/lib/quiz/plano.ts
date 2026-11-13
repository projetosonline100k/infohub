// Plano de leitura do quiz (13/11/2026, Davi: "com base nas respostas, seu perfil é esse, por quê; escolher os livros que mais combinam e montar um plano:
// amanhã ela já escuta X, dia 2 Y… e o restante fica oculto"). Sem React nem importações: testável.
// Os livros vêm de scripts/quiz/livros_temas.py (books.csv do Instalivros classificado nos temas das áreas do quiz).

export interface LivroPlano { id: number; titulo: string; sub?: string | null; autor: string; capa: string; nota: number; audio: number; texto?: number; temas: string[] }
export type Tema = "foco" | "habitos" | "autoconfianca" | "comunicacao" | "financas" | "carreira" | "mentalidade" | "lideranca";
export const ROTULO_TEMA: Record<Tema, string> = { foco: "Foco", habitos: "Hábitos", autoconfianca: "Autoconfiança", comunicacao: "Comunicação", financas: "Finanças", carreira: "Carreira", mentalidade: "Mentalidade", lideranca: "Liderança" };

export interface ConfigPlano {
  /** id da pergunta em que a pessoa marca as áreas (padrão "areas"). */
  areas_pergunta?: string;
  /** Livros que a pessoa curtiu ("Sim") e os temas que isso indica: { livro1: ["financas"] }. */
  livros_temas?: Record<string, string[]>;
  /** Temas que combinam com cada perfil: { inseguro: ["autoconfianca", "mentalidade"] }. */
  perfil_temas?: Record<string, string[]>;
  dias_visiveis?: number;   // padrão 5
  total_dias?: number;      // padrão 30
}

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** "Finanças pessoais" → "financas", "Autoconfiança" → "autoconfianca"; null se não for um tema conhecido. */
export function temaDaOpcao(texto: string): Tema | null {
  const t = semAcento(texto);
  const achou = (Object.keys(ROTULO_TEMA) as Tema[]).find((k) => t.startsWith(k.slice(0, 5)) || (k === "financas" && t.includes("financ")));
  return achou ?? null;
}

export interface EntradaPlano {
  /** Áreas marcadas pela pessoa (temas), na ordem em que marcou. */
  areas: string[];
  /** Temas dos livros que ela disse gostar. */
  curtidos: string[];
  /** Temas que combinam com o perfil dela. */
  perfil: string[];
}

export interface LivroDoDia { dia: number; livro: LivroPlano; porque: string[]; pontos: number; /** o tema que ligou o livro a ela: a área que marcou, o livro que curtiu ou o perfil */ tema: string }
export interface PlanoMontado { dias: LivroDoDia[]; ocultos: number; total: number; temas: string[] }

const titulo = (t: string) => (t === t.toUpperCase() && /[A-ZÀ-Ý]{3}/.test(t) ? t.toLowerCase().replace(/(^|[\s(\-:])([a-zà-ÿ])/g, (_m, a: string, b: string) => a + b.toUpperCase()).replace(/\b(De|Da|Do|Das|Dos|E|A|O|Em|Para|Com|Um|Uma|Por)\b/g, (m) => m.toLowerCase()).replace(/^./, (c) => c.toUpperCase()) : t);
export const tituloBonito = titulo;

/** Pontos de um livro para esta pessoa: área marcada pesa mais, depois livro curtido, depois o perfil; a nota do livro desempata. */
export function pontosDoLivro(l: LivroPlano, ent: EntradaPlano): { pontos: number; porque: string[] } {
  let pontos = 0;
  const porque: string[] = [];
  for (const t of l.temas) {
    const i = ent.areas.indexOf(t);
    if (i >= 0) { pontos += 5 - Math.min(i, 2) * 0.5; porque.push(`Você escolheu ${ROTULO_TEMA[t as Tema] ?? t}`); }
    else if (ent.curtidos.includes(t)) { pontos += 2.5; porque.push(`Combina com os livros que você curtiu`); }
    else if (ent.perfil.includes(t)) { pontos += 1.5; porque.push(`Tem tudo a ver com o seu perfil`); }
  }
  pontos += Math.max(0, l.nota - 4) * 2;   // 0 a 2
  return { pontos, porque: [...new Set(porque)] };
}

/** Escolhe os livros do plano: os que mais combinam, um autor por vez, cobrindo as áreas marcadas, do áudio mais curto (para começar fácil) ao mais longo. */
export function montarPlano(livros: LivroPlano[], ent: EntradaPlano, cfg: Pick<ConfigPlano, "dias_visiveis" | "total_dias"> = {}): PlanoMontado {
  const visiveis = cfg.dias_visiveis ?? 5, total = cfg.total_dias ?? 30;
  const pont = livros.filter((l) => l.audio > 0 && l.audio <= 40).map((l) => ({ l, ...pontosDoLivro(l, ent) })).filter((x) => x.porque.length > 0).sort((a, b) => b.pontos - a.pontos || b.l.nota - a.l.nota || a.l.id - b.l.id);
  const escolhidos: typeof pont = [];
  const cobre = new Map<(typeof pont)[number], string>();   // para qual área cada livro foi escolhido
  const autores = new Set<string>();
  const chave = (x: (typeof pont)[number]) => semAcento(x.l.autor).split(/[,&]/)[0].trim();
  const pegar = (x: (typeof pont)[number], area?: string) => { escolhidos.push(x); autores.add(chave(x)); if (area) cobre.set(x, area); };
  const livre = (x: (typeof pont)[number]) => !escolhidos.includes(x) && !autores.has(chave(x));
  // 1º: um livro de cada área marcada, de preferência dos que são DAQUELA área (tema principal), para o plano cobrir tudo o que ela pediu
  for (const a of ent.areas) {
    if (escolhidos.length >= visiveis) break;
    const x = pont.filter((p) => p.l.temas.includes(a) && livre(p) && !escolhidos.some((e) => cobre.get(e) === a)).sort((p, q) => Number(q.l.temas[0] === a) - Number(p.l.temas[0] === a) || q.pontos - p.pontos)[0];
    if (x) pegar(x, a);
  }
  // depois: os que mais combinam
  for (const x of pont) { if (escolhidos.length >= visiveis) break; if (livre(x)) pegar(x); }
  // ordem: começa leve (áudio mais curto), do mesmo tamanho vale o que mais combina
  const ordem = [...escolhidos].sort((a, b) => Math.round(a.l.audio / 5) - Math.round(b.l.audio / 5) || b.pontos - a.pontos);
  const temaDe = (l: LivroPlano) => l.temas.find((t) => ent.areas.includes(t)) ?? l.temas.find((t) => ent.curtidos.includes(t)) ?? l.temas.find((t) => ent.perfil.includes(t)) ?? l.temas[0];
  const dias = ordem.map((x, i) => ({ dia: i + 1, livro: x.l, porque: x.porque, pontos: x.pontos, tema: cobre.get(x) ?? temaDe(x.l) }));
  return { dias, ocultos: Math.max(0, total - dias.length), total, temas: [...new Set(escolhidos.flatMap((x) => x.l.temas))] };
}

/** "Amanhã", "Depois de amanhã", "Dia 3"… */
export const rotuloDoDia = (dia: number) => (dia === 1 ? "Amanhã" : dia === 2 ? "Depois de amanhã" : `Dia ${dia}`);

// ---------------------------------------------------------------- Por que este perfil

export interface PerguntaDoPerfil { id: string; texto: string; opcoes: { texto: string; emoji?: string; perfil?: string | null; pontos?: number }[] }
export interface RazaoDoPerfil { pergunta: string; resposta: string; emoji?: string; pontos: number }

/** As respostas que mais pesaram para o perfil (até `max`), para dizer "seu perfil é este porque você respondeu…". */
export function razoesDoPerfil(perguntas: PerguntaDoPerfil[], escolhas: Record<string, number>, perfilId: string, max = 3): RazaoDoPerfil[] {
  const lista: RazaoDoPerfil[] = [];
  for (const q of perguntas) {
    const k = escolhas[q.id];
    const o = k === undefined ? undefined : q.opcoes[k];
    if (o && o.perfil === perfilId && (o.pontos ?? 1) > 0) lista.push({ pergunta: q.texto.replace(/\s+/g, " ").trim(), resposta: o.texto, emoji: o.emoji, pontos: o.pontos ?? 1 });
  }
  return lista.sort((a, b) => b.pontos - a.pontos).slice(0, max);
}
