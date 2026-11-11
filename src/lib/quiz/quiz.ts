import { PUBLIC_SITE_URL } from "@/lib/shareUrl";

// Quiz do Infopro (docs/QUIZ.md). O Roy monta a estrutura; a página pública
// /quiz/<slug> roda o quiz e o resultado é o perfil com mais pontos.
// Desde 15/10/2026 (pedido do Davi: quiz "dopaminérgico") aceita imagens,
// telas entre as perguntas (respiro, especialista, carregando, resultado) e a
// oferta no fim. Imagem com URL vazia é um lugar reservado: aparece no teste
// (pra lembrar que falta) e some no link público.
export type StatusQuiz = "esboco" | "criando" | "revisar" | "publicado" | "pausado" | "cancelado";
export interface OpcaoQuiz {
  texto: string; perfil?: string | null; pontos?: number; imagem?: string; emoji?: string; resumo?: string;
  /** Imagem que depende de uma resposta anterior: chave "<id da pergunta>=<nº da opção>" (ex.: "genero=1" → foto de mulher). Sem resposta, vale `imagem`. */
  imagens?: Record<string, string>;
  /** Igual a `imagens`, mas com emoji (ex.: "genero=2" → "🧑‍🎓"): aparece no lugar do desenho. */
  emojis?: Record<string, string>;
}
export interface PerguntaQuiz {
  id: string; texto: string; subtitulo?: string; opcoes: OpcaoQuiz[];
  imagem?: string; imagem_nota?: string; estilo?: "lista" | "cartoes" | "livro" | "fotos" | "avatares" | "icones";
  botao?: boolean;      // marca a resposta e só segue no botão Continuar (sem avançar sozinho)
  multipla?: boolean;   // "escolha quantas quiser": marca várias e segue no botão Continuar (conta a 1ª escolhida no perfil)
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
  animada?: boolean; fala?: string; quadros?: string[];
  pose?: number;   // mostra só este quadro (ex.: 12 = comemorando), sem o ciclo de aceno e fala
  abertura?: { paraquedas: string };   // cena de entrada: o mascote desce de paraquedas e pousa
  falas?: string[]; botao_inicial?: string;   // várias falas em sequência no mesmo balão (sem clicar); o botão começa como botao_inicial e vira `botao` na última   // quadros: parado, piscando, aceno A, aceno B, falando, pulo   // mascote animado (estilo Duolingo) com balão de fala
  citacao?: { texto: string; autor?: string };
  grafico?: { titulo?: string; barras: BarraFixa[]; tipo?: "curva"; aqui?: string };   // curva: linha subindo mês a mês, com "você está aqui" no 1º ponto
  loop?: string[];            // quadros que se alternam em sequência (ex.: o mascote de fone fazendo várias coisas)
  imagem_mascote?: boolean;   // imagem do mascote inteira (sem recorte), com pulinho de empolgado
  mapa?: { pontos: [number, number][] };   // mapa com setas ligando os pontos (% da imagem)
  pausas?: { pct: number; texto: string; opcoes: string[] }[];   // carregando: perguntas que param o carregamento
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
  garantia?: string; preco?: string; preco_detalhe?: string; fechamento?: string;
  imagem?: string; imagem_nota?: string;
  cta_texto?: string; cta_url?: string;
  // Oferta no visual do 12min (Davi, 10/11): lista do que recebe, cupom, preço De/Por, botão, garantia, depoimentos, perguntas e o bloco de compra repetido no fim.
  parcelas?: { n: number; valor: string };   // "12x de R$ …" no lugar do preço cheio (Davi, 11/11: o preço cheio a pessoa descobre no checkout)
  video?: { url: string; poster?: string; titulo?: string };   // vídeo no fim da oferta (arquivo leve, só carrega quando a pessoa aperta o play)
  depoimentos_titulo?: string; recebe_titulo?: string; cupom?: { codigo: string; desconto?: string }; preco_de?: string; preco_por?: string; repetir?: boolean;
  faq?: { pergunta: string; resposta: string }[];   // perguntas frequentes antes do preço e do botão
}
export type CampoCaptura = "nome" | "email" | "whatsapp";
// Captura (16/10, pedido do Davi: nome e WhatsApp para contato). Com `depois_de`
// (id de tela ou de pergunta) ela entra no meio do quiz, ex.: logo depois do
// "analisando", e a resposta já é gravada ali, sem esperar o fim.
export interface CapturaQuiz {
  ativa?: boolean; titulo?: string; texto?: string; nota?: string; botao?: string;
  pedir?: CampoCaptura[]; rotulos?: Partial<Record<CampoCaptura, string>>; depois_de?: string;
  fala?: string;            // o Instalivros fala no topo do formulário (balão)
  selos?: SeloQuiz[]; louro?: string;   // quadro de selos embaixo do botão (só com fatos reais da oferta); `louro` = imagem do ramo de louro
}
export interface SeloQuiz { texto: string; destaque?: string }
export interface EstruturaQuiz {
  intro?: { titulo?: string; subtitulo?: string; botao?: string; rodape?: string; imagem?: string; imagem_nota?: string; credenciais?: string[]; pular?: boolean };
  perguntas: PerguntaQuiz[];
  perfis: PerfilQuiz[];
  telas?: TelaQuiz[];
  // chamada: linha acima do nome do perfil quando a pessoa deu o nome ("{nome}, você é").
  resultado?: { chamada?: string; grafico?: { titulo?: string; subtitulo?: string; barras: { rotulo: string; perfis: string[] }[] } };
  oferta?: OfertaQuiz;
  captura?: CapturaQuiz;
  cor?: string;
  tema?: "claro" | "escuro";
  /** Barra de progresso por fases (como a do 12min): cada fase começa na pergunta/tela de id `de` (a 1ª fase começa na primeira tela). */
  fases?: { nome: string; de: string }[];
  /** Sem tela de perfil: depois do plano vem direto a oferta (Davi, 10/11: "não existe perfil na minha copy"). */
  sem_resultado?: boolean;
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
// captura (se pedir algo: no fim, ou logo depois da tela/pergunta do captura.depois_de)
// e o fim (resultado e/ou oferta).
export type Passo =
  | { tipo: "intro" }
  | { tipo: "pergunta"; indice: number }
  | { tipo: "tela"; indice: number }
  | { tipo: "captura" }
  | { tipo: "fim" };

// Nome curto de cada tela (métricas e a vista em fileira da revisão).
export function rotuloDoPasso(e: EstruturaQuiz, p: Passo): string {
  if (p.tipo === "intro") return "Abertura";
  if (p.tipo === "pergunta") return `P${p.indice + 1}. ${e.perguntas[p.indice]?.texto ?? ""}`;
  if (p.tipo === "tela") return e.telas?.[p.indice]?.titulo || "Tela de respiro";
  if (p.tipo === "captura") return "Contato (nome/WhatsApp)";
  return e.sem_resultado ? "Oferta" : "Resultado e oferta";
}

// Cada tela que o Davi vê na revisão: um passo do quiz; o resultado vira uma tela por perfil.
export interface Lamina { chave: string; passo: number; tipo: Passo["tipo"]; indice?: number; perfil?: string; rotulo: string }
export function laminasDoQuiz(e: EstruturaQuiz): Lamina[] {
  const pedir = e.captura?.ativa === false ? [] : (e.captura?.pedir ?? []);
  return montarPassos(e, pedir.length > 0).flatMap((p, i): Lamina[] => {
    if (p.tipo === "intro" && e.intro?.pular) return [];   // abertura pulada: não aparece como tela no editor/fluxo
    const indice = "indice" in p ? p.indice : undefined;
    if (p.tipo === "fim" && e.sem_resultado) return [{ chave: String(i), passo: i, tipo: p.tipo, rotulo: "Oferta" }];
    if (p.tipo === "fim" && e.perfis.length > 1) {
      return e.perfis.map((pf) => ({ chave: `${i}:${pf.id}`, passo: i, tipo: p.tipo, perfil: pf.id, rotulo: `Resultado: ${pf.nome}` }));
    }
    return [{ chave: String(i), passo: i, tipo: p.tipo, indice, rotulo: rotuloDoPasso(e, p) }];
  });
}

export function montarPassos(e: EstruturaQuiz, temCaptura: boolean): Passo[] {
  const telas = e.telas ?? [];
  const passos: Passo[] = [{ tipo: "intro" }];
  const ponto = e.captura?.depois_de;
  let capturou = !temCaptura;
  const captura = (id: string) => { if (!capturou && id === ponto) { passos.push({ tipo: "captura" }); capturou = true; } };
  const depois = (id: string) => telas.forEach((t, i) => {
    if (t.depois_de !== id) return;
    passos.push({ tipo: "tela", indice: i });
    captura(t.id);
  });
  depois("intro");
  e.perguntas.forEach((q, i) => { passos.push({ tipo: "pergunta", indice: i }); captura(q.id); depois(q.id); });
  if (!capturou) passos.push({ tipo: "captura" });
  passos.push({ tipo: "fim" });
  return passos;
}

// {perfil} → nome do perfil · {nome} → o primeiro nome da captura ·
// {resposta:q2} → a resposta da pergunta q2 (o "resumo" da opção, se tiver,
// senão o texto com a 1ª letra minúscula).
export const primeiroNome = (nome?: string) => (nome ?? "").trim().split(/\s+/)[0] ?? "";
export function preencher(texto: string | undefined, e: EstruturaQuiz, escolhas: Record<string, number>, perfil: PerfilQuiz | null, nome?: string): string {
  if (!texto) return "";
  return texto
    .replace(/\{perfil\}/g, perfil?.nome ?? "")
    .replace(/\{nome\}/g, primeiroNome(nome))
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
