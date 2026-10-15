import { PUBLIC_SITE_URL } from "@/lib/shareUrl";

// Quiz do Infopro (docs/QUIZ.md). O Roy monta a estrutura; a página pública
// /quiz/<slug> roda o quiz e o resultado é o perfil com mais pontos.
export type StatusQuiz = "esboco" | "criando" | "revisar" | "publicado" | "pausado" | "cancelado";
export interface OpcaoQuiz { texto: string; perfil?: string | null; pontos?: number }
export interface PerguntaQuiz { id: string; texto: string; opcoes: OpcaoQuiz[] }
export interface PerfilQuiz { id: string; nome: string; descricao?: string; cta_texto?: string; cta_url?: string }
export type CampoCaptura = "nome" | "email" | "whatsapp";
export interface EstruturaQuiz {
  intro?: { titulo?: string; subtitulo?: string; botao?: string };
  perguntas: PerguntaQuiz[];
  perfis: PerfilQuiz[];
  captura?: { ativa?: boolean; titulo?: string; pedir?: CampoCaptura[] };
  cor?: string;
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

// Escolhas: índice da opção por pergunta. Resultado: o perfil com mais pontos
// (empate: o que aparece primeiro na lista de perfis).
export function calcularPerfil(e: EstruturaQuiz, escolhas: Record<string, number>): PerfilQuiz | null {
  const pontos = new Map<string, number>();
  for (const q of e.perguntas) {
    const o = q.opcoes[escolhas[q.id]];
    if (o?.perfil) pontos.set(o.perfil, (pontos.get(o.perfil) ?? 0) + (o.pontos ?? 1));
  }
  let melhor: PerfilQuiz | null = null, max = -1;
  for (const p of e.perfis) {
    const n = pontos.get(p.id) ?? 0;
    if (n > max) { melhor = p; max = n; }
  }
  return melhor;
}

export const corDoQuiz = (e?: EstruturaQuiz | null) => (e?.cor && /^#[0-9a-f]{3,8}$/i.test(e.cor) ? e.cor : "#0ea5e9");
