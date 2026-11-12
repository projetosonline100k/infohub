// Inteligência do agente do WhatsApp (12/11/2026, Davi: "vou conversando e a gente monta a inteligência: produto, ofertas, o que pode e não pode, objetivo…").
// Tipos, o que falta preencher e a limpeza do que o Claude devolve. Sem React nem importações: testável.

export interface OfertaAgente { nome: string; preco: string; link: string; condicoes: string; bonus: string; garantia: string }
export interface ObjecaoAgente { objecao: string; resposta: string }
export interface PerfilAgente { perfil: string; abordagem: string }
/** Como o agente "se comporta" ao mandar: a Gabriela ajusta isto quando o Davi pede ("mais devagar", "tudo numa mensagem só"). */
export interface ComportamentoAgente { separar: boolean; pausa: boolean; pausa_min_s: number; pausa_max_s: number; ms_por_letra: number }
export const comportamentoPadrao = (): ComportamentoAgente => ({ separar: true, pausa: true, pausa_min_s: 1.5, pausa_max_s: 7, ms_por_letra: 40 });
export interface ConfigAgente {
  comportamento: ComportamentoAgente;
  produto: { nome: string; descricao: string; para_quem: string; resultado: string };
  ofertas: OfertaAgente[];
  objetivo: string;
  tom: string;
  apresentacao: string;      // como abre a conversa
  etapas: string[];          // o caminho da conversa, passo a passo
  pode: string[];
  nao_pode: string[];
  objecoes: ObjecaoAgente[];
  perfis: PerfilAgente[];    // como tratar cada perfil do quiz
  chamar_humano: string[];   // quando passar para o Davi
  extras: string;
}

export const configVazia = (): ConfigAgente => ({
  comportamento: comportamentoPadrao(),
  produto: { nome: "", descricao: "", para_quem: "", resultado: "" }, ofertas: [], objetivo: "", tom: "", apresentacao: "",
  etapas: [], pode: [], nao_pode: [], objecoes: [], perfis: [], chamar_humano: [], extras: "",
});

const t = (v: unknown, max = 3000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const lista = (v: unknown, max = 40) => (Array.isArray(v) ? v.map((x) => t(x, 600)).filter(Boolean).slice(0, max) : []);

/** O que o Claude devolveu (ou qualquer JSON) vira uma inteligência válida; o que faltar vem da atual. */
export function sanitizarAgente(bruto: unknown, atual: ConfigAgente): ConfigAgente {
  const b = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const p = (b.produto && typeof b.produto === "object" ? b.produto : {}) as Record<string, unknown>;
  const lst = <T>(v: unknown, f: (x: Record<string, unknown>) => T | null, max = 30): T[] =>
    (Array.isArray(v) ? v : []).slice(0, max).map((x) => (x && typeof x === "object" ? f(x as Record<string, unknown>) : null)).filter((x): x is T => x !== null);
  const tem = (k: string) => k in b;
  const cp = (b.comportamento && typeof b.comportamento === "object" ? b.comportamento : {}) as Record<string, unknown>;
  const num = (v: unknown, min: number, max: number, padrao: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : padrao);
  const at = atual.comportamento ?? comportamentoPadrao();
  const pmin = num(cp.pausa_min_s, 0, 30, at.pausa_min_s);
  return {
    comportamento: { separar: typeof cp.separar === "boolean" ? cp.separar : at.separar, pausa: typeof cp.pausa === "boolean" ? cp.pausa : at.pausa, pausa_min_s: pmin, pausa_max_s: Math.max(pmin, num(cp.pausa_max_s, 0, 60, at.pausa_max_s)), ms_por_letra: num(cp.ms_por_letra, 0, 400, at.ms_por_letra) },
    produto: { nome: t(p.nome, 200) || atual.produto.nome, descricao: t(p.descricao) || atual.produto.descricao, para_quem: t(p.para_quem) || atual.produto.para_quem, resultado: t(p.resultado) || atual.produto.resultado },
    ofertas: tem("ofertas") ? lst(b.ofertas, (o) => (t(o.nome, 200) ? { nome: t(o.nome, 200), preco: t(o.preco, 100), link: /^https?:\/\//i.test(t(o.link, 600)) ? t(o.link, 600) : "", condicoes: t(o.condicoes), bonus: t(o.bonus), garantia: t(o.garantia) } : null)) : atual.ofertas,
    objetivo: t(b.objetivo) || atual.objetivo, tom: t(b.tom) || atual.tom, apresentacao: t(b.apresentacao) || atual.apresentacao,
    etapas: tem("etapas") ? lista(b.etapas) : atual.etapas, pode: tem("pode") ? lista(b.pode) : atual.pode, nao_pode: tem("nao_pode") ? lista(b.nao_pode) : atual.nao_pode,
    objecoes: tem("objecoes") ? lst(b.objecoes, (o) => (t(o.objecao, 400) ? { objecao: t(o.objecao, 400), resposta: t(o.resposta) } : null)) : atual.objecoes,
    perfis: tem("perfis") ? lst(b.perfis, (o) => (t(o.perfil, 120) ? { perfil: t(o.perfil, 120), abordagem: t(o.abordagem) } : null), 12) : atual.perfis,
    chamar_humano: tem("chamar_humano") ? lista(b.chamar_humano) : atual.chamar_humano, extras: tem("extras") ? t(b.extras, 6000) : atual.extras,
  };
}

/** O que ainda falta para o agente poder conversar com segurança, e quanto já está pronto (0–100). */
export function completude(c: ConfigAgente): { pct: number; faltando: string[] } {
  const itens: [string, boolean][] = [
    ["o que é o produto", !!c.produto.nome && !!c.produto.descricao], ["para quem é", !!c.produto.para_quem],
    ["a oferta (preço e link de compra)", c.ofertas.some((o) => !!o.preco && !!o.link)], ["o objetivo do agente", !!c.objetivo],
    ["o tom de voz", !!c.tom], ["o caminho da conversa", c.etapas.length > 0], ["o que ele PODE fazer", c.pode.length > 0],
    ["o que ele NÃO pode fazer", c.nao_pode.length > 0], ["respostas para objeções", c.objecoes.length > 0], ["quando chamar você", c.chamar_humano.length > 0],
  ];
  const feitos = itens.filter(([, ok]) => ok).length;
  return { pct: Math.round((feitos / itens.length) * 100), faltando: itens.filter(([, ok]) => !ok).map(([n]) => n) };
}

/** Pode simular/usar com segurança? Sem produto, oferta com link e as regras do que não pode, melhor não soltar o agente. */
export const prontoParaUsar = (c: ConfigAgente) => !!c.produto.nome && c.ofertas.some((o) => !!o.preco && !!o.link) && c.nao_pode.length > 0 && !!c.objetivo;

/** Pausa (ms) "digitando…" antes de cada mensagem do agente, como numa conversa de verdade: ~1,2 s + ms_por_letra por caractere, entre o mínimo e o máximo (padrão 1,5 a 7 s). */
export const pausaDigitando = (texto: string, c: ComportamentoAgente = comportamentoPadrao()) =>
  !c.pausa ? 0 : Math.min(c.pausa_max_s * 1000, Math.max(c.pausa_min_s * 1000, 1200 + texto.length * c.ms_por_letra));
