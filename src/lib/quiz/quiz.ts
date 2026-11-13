import { PUBLIC_SITE_URL } from "@/lib/shareUrl";
import type { ConfigPlano } from "./plano";

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
  imagem?: string; imagem_nota?: string; estilo?: "lista" | "cartoes" | "livro" | "fotos" | "avatares" | "icones" | "lado" | "escala";
  botao?: boolean;      // marca a resposta e só segue no botão Continuar (sem avançar sozinho)
  multipla?: boolean;   // "escolha quantas quiser": marca várias e segue no botão Continuar (conta a 1ª escolhida no perfil)
  /** estilo "lado" (13/11): a pessoa marca exatamente `meta` itens (padrão 3) e a barra de baixo enche até liberar o Continuar. estilo "escala": uma opção numa trilha com emoji (as opções precisam de `emoji`). */
  meta?: number;
}
export interface PerfilQuiz {
  id: string; nome: string; descricao?: string; cta_texto?: string; cta_url?: string;
  resumo?: string; imagem?: string; imagem_nota?: string; virada?: string;
  /** Tela "perfil" (13/11): emoji do perfil e a frase curta embaixo do nome ("Quando você pega ritmo, vai longe"). */
  emoji?: string; frase?: string;
}
export interface Depoimento { nome?: string; texto?: string; imagem?: string }
export interface BarraFixa { rotulo: string; valor: number; legenda?: string; destaque?: boolean }
export interface TelaQuiz {
  id: string;
  depois_de: string;   // "intro" ou o id da pergunta
  tipo: "respiro" | "especialista" | "carregando" | "resultado" | "perfil" | "plano_livros";
  /** Tela "plano_livros" (13/11): como escolher os livros do plano (ver src/lib/quiz/plano.ts). */
  plano?: ConfigPlano;
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
  // Visual da 1ª tela (Davi, 13/11): fundo em degradê (qualquer `background` CSS), enfeites em volta do mascote e selos embaixo.
  fundo?: string; balao_grande?: boolean;
  enfeites?: EnfeiteTela[]; selos?: SeloTela[];
}
// Enfeite solto na tela: `imagem` (url) ou `icone` (livro, livros, estrela, trofeu, brilho); x/y em % da tela; `tam` em px.
export interface EnfeiteTela { icone?: "livro" | "livros" | "estrela" | "trofeu" | "brilho"; imagem?: string; x: number; y: number; tam?: number; rot?: number; cor?: string }
export interface SeloTela { icone?: "raio" | "alvo" | "controle" | "relogio"; texto: string; cor?: string; fundo?: string }
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
  depoimentos_titulo?: string; recebe_titulo?: string; bonus_titulo?: string; bonus?: { titulo: string; texto: string; preco_de?: string; preco_por?: string }[]; cupom?: { codigo: string; desconto?: string }; preco_de?: string; preco_por?: string; repetir?: boolean;
  headline?: string;   // headline no topo da oferta; ==trecho== vira grifo
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
  /** Criar a conta em etapas (13/11): 1) nome → 2) e-mail e WhatsApp → 3) "Conta criada!" com confete e o botão do plano; cada etapa sai para o lado com animação. */
  etapas?: boolean;
  /** Etapa final: título ("Conta criada!"), texto e botão ("Ver meu plano personalizado"). */
  conta_criada?: { titulo?: string; texto?: string; botao?: string };
  selos?: SeloQuiz[]; louro?: string;   // quadro de selos embaixo do botão (só com fatos reais da oferta); `louro` = imagem do ramo de louro
}
// Pergunta do nome (12/11, Davi: "captar o nome no começo pra me referir à pessoa"): uma tela com um campo
// só, logo depois de `depois_de` (id de tela ou pergunta). O nome vai para o lead junto com a captura e
// preenche o {nome} nos textos dali em diante.
export interface PerguntaNome { depois_de: string; titulo?: string; texto?: string; fala?: string; botao?: string; exemplo?: string;
  /** "letras" (padrão): monta o nome tocando em botões de letra, sem abrir o teclado do celular (Davi, 13/11); "campo": campo de texto. */
  modo?: "letras" | "campo";
  /** Texto do link discreto que segue sem nome (ex.: "Prefiro não dizer"). Sem ele, não há como pular. */
  pular?: string }
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
  nome?: PerguntaNome;
  cor?: string;
  tema?: "claro" | "escuro";
  /** Barra de progresso por fases (como a do 12min): cada fase começa na pergunta/tela de id `de` (a 1ª fase começa na primeira tela). */
  fases?: { nome: string; de: string }[];
  /** Estrela + confete + som ao concluir cada fase (padrão: liga; `false` desliga). */
  fases_comemorar?: boolean;
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
// Link secreto que mostra o RASCUNHO (13/11): abre sem login, não conta visita nem lead.
export const linkDaPreviaDoQuiz = (token: string) => `${PUBLIC_SITE_URL}/quiz-previa/${token}`;

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
  | { tipo: "nome" }
  | { tipo: "fim" };

// Nome curto de cada tela (métricas e a vista em fileira da revisão).
export function rotuloDoPasso(e: EstruturaQuiz, p: Passo): string {
  if (p.tipo === "intro") return "Abertura";
  if (p.tipo === "pergunta") return `P${p.indice + 1}. ${e.perguntas[p.indice]?.texto ?? ""}`;
  if (p.tipo === "tela") return e.telas?.[p.indice]?.titulo || "Tela de respiro";
  if (p.tipo === "captura") return "Contato (nome/WhatsApp)";
  if (p.tipo === "nome") return "Nome";
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
  let pediuNome = !e.nome?.depois_de;
  const nome = (id: string) => { if (!pediuNome && id === e.nome?.depois_de) { passos.push({ tipo: "nome" }); pediuNome = true; } };
  const depois = (id: string) => telas.forEach((t, i) => {
    if (t.depois_de !== id) return;
    passos.push({ tipo: "tela", indice: i });
    nome(t.id);
    captura(t.id);
  });
  nome("intro");
  depois("intro");
  e.perguntas.forEach((q, i) => { passos.push({ tipo: "pergunta", indice: i }); nome(q.id); captura(q.id); depois(q.id); });
  if (!capturou) passos.push({ tipo: "captura" });
  passos.push({ tipo: "fim" });
  return passos;
}

// {perfil} → nome do perfil · {nome} → o primeiro nome (pergunta do nome ou captura) ·
// {resposta:q2} → a resposta da pergunta q2 (o "resumo" da opção, se tiver,
// senão o texto com a 1ª letra minúscula).
// Sem nome, o {nome} some com a vírgula: "{nome}, seu plano" → "Seu plano"; "Anotado, {nome}!" → "Anotado!".
export const primeiroNome = (nome?: string) => (nome ?? "").trim().split(/\s+/)[0] ?? "";
const capitalizar = (s: string) => s.charAt(0).toLocaleUpperCase("pt-BR") + s.slice(1).toLocaleLowerCase("pt-BR");
function comNome(texto: string, nome?: string): string {
  const n = capitalizar(primeiroNome(nome));
  if (n) return texto.replace(/\{nome\}/g, n);
  return texto
    .replace(/(^|[.!?…]\s*)\{nome\}\s*,?\s*(\S)/gu, (_t, antes: string, letra: string) => antes + letra.toLocaleUpperCase("pt-BR"))
    .replace(/\s*,?\s*\{nome\}/g, "");
}
export function preencher(texto: string | undefined, e: EstruturaQuiz, escolhas: Record<string, number>, perfil: PerfilQuiz | null, nome?: string): string {
  if (!texto) return "";
  return comNome(texto, nome)
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

