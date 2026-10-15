import { PUBLIC_SITE_URL } from "@/lib/shareUrl";

// Quiz do Infopro (docs/QUIZ.md). O Roy monta a estrutura; a página pública
// /quiz/<slug> roda o quiz e o resultado é o perfil com mais pontos.
// Desde 15/10/2026 (pedido do Davi: quiz "dopaminérgico") aceita imagens,
// telas entre as perguntas (respiro, especialista, carregando, resultado) e a
// oferta no fim. Imagem com URL vazia é um lugar reservado: aparece no teste
// (pra lembrar que falta) e some no link público.
export type StatusQuiz = "esboco" | "criando" | "revisar" | "publicado" | "pausado" | "cancelado";
export interface OpcaoQuiz { texto: string; perfil?: string | null; pontos?: number; imagem?: string; emoji?: string; resumo?: string }
export interface PerguntaQuiz {
  id: string; texto: string; subtitulo?: string; opcoes: OpcaoQuiz[];
  imagem?: string; imagem_nota?: string; estilo?: "lista" | "cartoes";
}
export interface PerfilQuiz {
  id: string; nome: string; descricao?: string; cta_texto?: string; cta_url?: string;
  resumo?: string; imagem?: string; imagem_nota?: string; virada?: string;
}
export interface Depoimento { nome?: string; texto?: string; imagem?: string }
export interface BarraFixa { rotulo: string; valor: number; legenda?: string; destaque?: boolean }
export interface TelaQuiz {
  id: string;
  depois_de: string;   // "intro" ou o id da pergunta
  tipo: "respiro" | "especialista" | "carregando" | "resultado";
  titulo?: string; texto?: string; botao?: string;
  imagem?: string; imagem_nota?: string;
  citacao?: { texto: string; autor?: string };
  grafico?: { titulo?: string; barras: BarraFixa[] };
  depoimentos?: Depoimento[]; depoimentos_nota?: string;
  audio?: string; audio_nota?: string;
  credenciais?: string[];
  itens?: string[];    // carregando: as etapas que vão sendo marcadas
  fonte?: string;
}
export interface OfertaQuiz {
  titulo?: string; subtitulo?: string; texto?: string; produto?: string;
  dias?: string[]; itens?: string[];
  depoimentos?: Depoimento[]; depoimentos_nota?: string;
  garantia?: string; preco?: string; fechamento?: string;
  imagem?: string; imagem_nota?: string;
  cta_texto?: string; cta_url?: string;
}
export type CampoCaptura = "nome" | "email" | "whatsapp";
export interface EstruturaQuiz {
  intro?: { titulo?: string; subtitulo?: string; botao?: string; rodape?: string; imagem?: string; imagem_nota?: string; credenciais?: string[] };
  perguntas: PerguntaQuiz[];
  perfis: PerfilQuiz[];
  telas?: TelaQuiz[];
  resultado?: { grafico?: { titulo?: string; barras: { rotulo: string; perfis: string[] }[] } };
  oferta?: OfertaQuiz;
  captura?: { ativa?: boolean; titulo?: string; pedir?: CampoCaptura[] };
  cor?: string;
  tema?: "claro" | "escuro";
}
export interface QuizResumo {
  id: string; titulo: string; slug: string; status: StatusQuiz; pedido: string | null;
  atividade_id: string | null; estrutura: EstruturaQuiz | null; criado_em: string; publicado_em: string | null;
}

export const ROTULO_STATUS: Record<StatusQuiz, string> = {
  esboco: "Roy fazendo o esboço", criando: "Roy criando o quiz", revisar: "Pronto para você testar",
  publicado: "Publicado", pausado: "Pausado", cancelado: "Cancelado",
};

export const linkDoQuiz = (slug: string) => `${PUBLIC_SITE_URL}/quiz/${slug}`;

export function pontosPorPerfil(e: EstruturaQuiz, escolhas: Record<string, number>): Map<string, number> {
  const pontos = new Map<string, number>();
  for (const q of e.perguntas) {
    const o = q.opcoes[escolhas[q.id]];
    if (o?.perfil) pontos.set(o.perfil, (pontos.get(o.perfil) ?? 0) + (o.pontos ?? 1));
  }
  return pontos;
}

// Escolhas: índice da opção por pergunta. Resultado: o perfil com mais pontos
// (empate: o que aparece primeiro na lista de perfis).
export function calcularPerfil(e: EstruturaQuiz, escolhas: Record<string, number>): PerfilQuiz | null {
  const pontos = pontosPorPerfil(e, escolhas);
  let melhor: PerfilQuiz | null = null, max = -1;
  for (const p of e.perfis) {
    const n = pontos.get(p.id) ?? 0;
    if (n > max) { melhor = p; max = n; }
  }
  return melhor;
}

// Gráfico do resultado: cada barra soma os pontos dos perfis dela, em % do total.
export function barrasDoResultado(e: EstruturaQuiz, escolhas: Record<string, number>): { rotulo: string; pct: number }[] {
  const pontos = pontosPorPerfil(e, escolhas);
  const def = e.resultado?.grafico?.barras ?? e.perfis.map((p) => ({ rotulo: p.nome, perfis: [p.id] }));
  const somas = def.map((b) => b.perfis.reduce((s, id) => s + (pontos.get(id) ?? 0), 0));
  const total = somas.reduce((s, n) => s + n, 0) || 1;
  return def.map((b, i) => ({ rotulo: b.rotulo, pct: Math.round((somas[i] / total) * 100) }));
}

// A ordem das telas: abertura, cada pergunta seguida das telas "depois_de" dela,
// captura (se pedir algo) e o fim (resultado e/ou oferta).
export type Passo =
  | { tipo: "intro" }
  | { tipo: "pergunta"; indice: number }
  | { tipo: "tela"; indice: number }
  | { tipo: "captura" }
  | { tipo: "fim" };

export function montarPassos(e: EstruturaQuiz, temCaptura: boolean): Passo[] {
  const telas = e.telas ?? [];
  const passos: Passo[] = [{ tipo: "intro" }];
  const depois = (id: string) => telas.forEach((t, i) => { if (t.depois_de === id) passos.push({ tipo: "tela", indice: i }); });
  depois("intro");
  e.perguntas.forEach((q, i) => { passos.push({ tipo: "pergunta", indice: i }); depois(q.id); });
  if (temCaptura) passos.push({ tipo: "captura" });
  passos.push({ tipo: "fim" });
  return passos;
}

// {perfil} → nome do perfil · {resposta:q2} → a resposta da pergunta q2
// (o "resumo" da opção, se tiver, senão o texto com a 1ª letra minúscula).
export function preencher(texto: string | undefined, e: EstruturaQuiz, escolhas: Record<string, number>, perfil: PerfilQuiz | null): string {
  if (!texto) return "";
  return texto
    .replace(/\{perfil\}/g, perfil?.nome ?? "")
    .replace(/\{resposta:([\w-]+)\}/g, (_, id: string) => {
      const q = e.perguntas.find((p) => p.id === id);
      const o = q?.opcoes[escolhas[id]];
      if (!o) return "";
      return o.resumo ?? o.texto.charAt(0).toLowerCase() + o.texto.slice(1);
    });
}

// Edição na tela de revisão: troca um valor pelo caminho ("perguntas.3.opcoes.1.texto").
export function comValor<T>(obj: T, caminho: string, valor: unknown): T {
  const copia = structuredClone(obj) as Record<string, unknown>;
  const partes = caminho.split(".");
  let atual: Record<string, unknown> = copia;
  partes.slice(0, -1).forEach((p, i) => {
    if (atual[p] == null || typeof atual[p] !== "object") atual[p] = /^\d+$/.test(partes[i + 1]) ? [] : {};
    atual = atual[p] as Record<string, unknown>;
  });
  atual[partes[partes.length - 1]] = valor;
  return copia as T;
}

export const corDoQuiz = (e?: EstruturaQuiz | null) => (e?.cor && /^#[0-9a-f]{3,8}$/i.test(e.cor) ? e.cor : "#0ea5e9");
