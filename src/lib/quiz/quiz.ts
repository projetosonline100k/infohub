import { PUBLIC_SITE_URL } from "@/lib/shareUrl";
import type { ConfigPlano } from "./plano";
import { preencherNumeros, type ConfigNumero } from "./numeros";
import { calcularNotaIndice, perfilDoIndice, type ConfigIndice } from "./indice";

// Quiz do Infopro (docs/QUIZ.md). O Roy monta a estrutura; a página pública
// /quiz/<slug> roda o quiz e o resultado é o perfil com mais pontos.
// Desde 15/10/2026 (pedido do Davi: quiz "dopaminérgico") aceita imagens,
// telas entre as perguntas (respiro, especialista, carregando, resultado) e a
// oferta no fim. Imagem com URL vazia é um lugar reservado: aparece no teste
// (pra lembrar que falta) e some no link público.
export type StatusQuiz = "esboco" | "criando" | "revisar" | "publicado" | "pausado" | "cancelado";
export interface OpcaoQuiz {
  texto: string; perfil?: string | null; pontos?: number; imagem?: string; emoji?: string; resumo?: string;
  /** Ícone de linha (nome do lucide, ex.: "Lightbulb"; lista em ICONES_OPCAO no QuizPlayer) no lugar do emoji, na cor de destaque do visual. */
  icone?: string;
  /** Imagem que depende de uma resposta anterior: chave "<id da pergunta>=<nº da opção>" (ex.: "genero=1" → foto de mulher). Sem resposta, vale `imagem`. */
  imagens?: Record<string, string>;
  /** Igual a `imagens`, mas com emoji (ex.: "genero=2" → "🧑‍🎓"): aparece no lugar do desenho. */
  emojis?: Record<string, string>;
  /** Perguntas numéricas (estilo "roleta"/"regua"): a opção vale para números até `ate` (a última pega o resto). O texto da opção é o selo da roleta. */
  ate?: number;
  /** Tela "perfil" com `plano_numeros`: o nome do momento no resumo ("Ritual da manhã"). Sem ele, vale o texto da opção. */
  ritual?: string;
  /** Quiz com `indice` (V3): pontos desta resposta na nota do Índice de Leitor. */
  nota?: number;
  /** Quiz com `indice` (V3): cartão que aparece no resultado quando esta resposta é escolhida. */
  beneficio?: { titulo?: string; texto?: string };
}
export interface PerguntaQuiz {
  id: string; texto: string; subtitulo?: string; opcoes: OpcaoQuiz[];
  /** Texto de cima da pergunta no visual "skin" (padrão "Pergunta N"): ex. "Etapa 1 de 3". */
  kicker?: string;
  /** Cabeçalho em cima da pergunta (21/11): imagem e título da abertura na mesma tela da 1ª pergunta, sem tela de "Começar" no meio. */
  cabecalho?: { imagem?: string; selo?: string; titulo?: string; subtitulo?: string };
  /** Sem o mascote falando a pergunta (21/11): a pergunta vira título simples, como na abertura do 12min. */
  sem_mascote?: boolean;
  imagem?: string; imagem_nota?: string;
  /** Foto da pergunta que depende de uma resposta anterior (16/11): chave "<id da pergunta>=<nº da opção>" (ex.: "genero=1" → foto de mulher). Sem resposta, vale `imagem`. */
  imagens?: Record<string, string>;
  /** Sim ou não como conversa (19/11): o "Instalivros" pergunta num chat, tipo typebot; perguntas seguidas com `chat` formam uma conversa só. */
  chat?: boolean;
  estilo?: "lista" | "cartoes" | "livro" | "fotos" | "avatares" | "icones" | "lado" | "orbita" | "escala" | "roleta" | "regua";
  /** estilo "roleta" (roleta vertical) e "regua" (régua arrastável) — 15/11: a resposta é um número, guardado para os textos ({numero:id}). */
  numero?: ConfigNumero;
  botao?: boolean;      // marca a resposta e só segue no botão Continuar (sem avançar sozinho)
  multipla?: boolean;   // "escolha quantas quiser": marca várias e segue no botão Continuar (conta a 1ª escolhida no perfil)
  /** estilo "lado" (13/11) e "orbita" (15/11): a pessoa marca exatamente `meta` itens (padrão 3) e a barra de baixo enche até liberar o Continuar. estilo "escala": uma opção numa trilha com emoji (as opções precisam de `emoji`). */
  meta?: number;
}
export interface PerfilQuiz {
  id: string; nome: string; descricao?: string; cta_texto?: string; cta_url?: string;
  resumo?: string; imagem?: string; imagem_nota?: string; virada?: string;
  /** Tela "perfil" (13/11): emoji do perfil e a frase curta embaixo do nome ("Quando você pega ritmo, vai longe"). */
  emoji?: string; frase?: string;
}
export interface ConfigMentores {
  /** Pergunta de escolha (múltipla) dos mentores. */
  pergunta: string;
  /** Livros por ano de cada mentor (pelo texto da opção). Só números com fonte pública. */
  dados: Record<string, { livros_ano?: number; fato?: string; fonte?: string }>;
  /** Barra "Você" com o número de uma pergunta de roleta (ex.: livros_ano). */
  voce?: { pergunta: string; rotulo?: string };
  /** Título quando nenhum mentor escolhido tem número: mostra os que têm. */
  titulo_geral?: string;
}
export interface ConfigDepoimentoAnimado {
  texto: string; autor?: string;
  /** Trechos do texto: o riscado ("odiava ler") e o grifado. */
  riscado?: string; grifado?: string;
  numeros?: { rotulo: string; antes: number; agora: number }[];
}
/** Trecho grátis de um livro (tela "amostra"). Tudo opcional: título, autor, capa e minutos caem para os do livro do plano. */
export interface AmostraLivro { titulo?: string; autor?: string; capa?: string; audio_url?: string; texto_amostra?: string; minutos?: number }
export interface ConfigAmostra {
  /** id da tela plano_livros de onde vem o livro nº 1 (padrão: a primeira tela plano_livros). */
  plano_de?: string;
  /** Trechos por id do livro do plano (LivroPlano.id). Vazio = a tela é pulada. */
  amostras?: Record<string, AmostraLivro>;
  /** Tamanho máximo do trecho ouvido, em segundos (padrão 75). */
  segundos?: number;
  aviso?: string; fim_texto?: string; texto_bloqueado?: string;
}
export interface ConfigPlanoNumeros {
  titulo?: string;
  /** Ids das perguntas: régua de minutos, momento do dia, objetivo e (opcional) a roleta de livros. */
  minutos: string; momento: string; objetivo: string;
}
export interface Depoimento { nome?: string; texto?: string; imagem?: string }
export interface BarraFixa { rotulo: string; valor: number; legenda?: string; destaque?: boolean }
export interface TelaQuiz {
  id: string;
  depois_de: string;   // "intro" ou o id da pergunta
  tipo: "respiro" | "especialista" | "carregando" | "resultado" | "perfil" | "plano_livros" | "barras_mentores" | "depoimento_animado" | "projecao" | "compromisso" | "amostra" | "previa_perfil" | "depoimento" | "curtir_livros";
  /** Tela "amostra" (18/11): "Seu primeiro livro chegou" — toca no livro, abre com Ouvir/Ler e um trecho grátis. */
  amostra?: ConfigAmostra;
  /** Tela "barras_mentores" (15/11): barras de livros por ano dos mentores que a pessoa escolheu. */
  mentores?: ConfigMentores;
  /** Tela "depoimento_animado" (15/11): o depoimento se escreve sozinho, com trecho riscado e grifado, e os números "antes → agora" contam. */
  depoimento_animado?: ConfigDepoimentoAnimado;
  /** Tela "projecao" (15/11): "lendo X min por dia você termina N livros em 12 meses", com livros caindo e empilhando. */
  projecao?: { pergunta: string; /** Pergunta (roleta) de livros lidos no ano; sem ela, a primeira número com "livro" na unidade. */ antes?: string };
  /** Tela "compromisso": a pessoa segura o botão até a barra encher (18/11; antes desenhava um ✓). `limpar` não é mais usado; `segurar` = texto do botão; `pergunta` = régua de minutos (padrão: a da projeção). */
  compromisso?: { limpar?: string; segurar?: string; pergunta?: string };
  /** Tela "perfil" (15/11): resumo do plano em números (minutos/dia, momento, resumos/semana, livros em 12 meses, objetivo). */
  plano_numeros?: ConfigPlanoNumeros;
  /** Tela "plano_livros" (13/11): como escolher os livros do plano (ver src/lib/quiz/plano.ts). */
  plano?: ConfigPlano;
  /** Tela "curtir_livros" (V3, 22/11): pilha de livros do catálogo do Instalivros para curtir ou não (👍/👎), como no Blinkist. `pergunta` = id da pergunta (de áreas) que filtra os livros pelo tema escolhido; `quantidade` = quantos cartões (padrão 5). */
  curtir?: { pergunta?: string; quantidade?: number; etapa?: string };
  titulo?: string; texto?: string; botao?: string;
  /** Tela "previa_perfil" (19/11): o Instalivros comenta no chat o que já deu para notar da pessoa; `perfis` tem as mensagens de cada perfil (id → lista), `padrao` vale quando não há perfil. {nome} e {perfil} funcionam. */
  previa?: { perfis?: Record<string, string[]>; padrao?: string[] };
  /** Tela "carregando": quanto dura, em segundos (padrão 9,5; a de "salvando" é curta). */
  duracao?: number;
  imagem?: string; imagem_nota?: string;
  animada?: boolean; fala?: string; quadros?: string[];
  pose?: number;   // mostra só este quadro (ex.: 12 = comemorando), sem o ciclo de aceno e fala
  abertura?: { paraquedas: string };   // cena de entrada: o mascote desce de paraquedas e pousa
  falas?: string[]; botao_inicial?: string;   // várias falas em sequência no mesmo balão (sem clicar); o botão começa como botao_inicial e vira `botao` na última   // quadros: parado, piscando, aceno A, aceno B, falando, pulo   // mascote animado (estilo Duolingo) com balão de fala
  citacao?: { texto: string; autor?: string };
  grafico?: { titulo?: string; barras: BarraFixa[]; tipo?: "curva"; aqui?: string };   // curva: linha subindo mês a mês, com "você está aqui" no 1º ponto
  loop?: string[];            // quadros que se alternam em sequência (ex.: o mascote de fone fazendo várias coisas)
  imagem_cheia?: boolean;     // `imagem` inteira (sem recorte, sem animação), na largura da coluna; vale mesmo com `animada` (os quadros seguem servindo ao mascote das outras telas)
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
  depoimentos_titulo?: string; recebe_titulo?: string; bonus_titulo?: string; bonus?: { id?: string; titulo: string; texto: string; preco_de?: string; preco_por?: string }[]; cupom?: { codigo: string; desconto?: string }; preco_de?: string; preco_por?: string; repetir?: boolean;
  headline?: string;   // headline no topo da oferta; ==trecho== vira grifo
  faq?: { pergunta: string; resposta: string }[];   // perguntas frequentes antes do preço e do botão
  /** Planos para escolher (15/11, Davi: anual em destaque com bônus, semestral e trimestral sem bônus). Sem `planos`, vale o plano único acima. */
  planos?: PlanoOferta[];
  /** "direto" (18/11, V2): o fim vira 3 lâminas (escolher 1 bônus → o que vai receber → plano anual na cara do gol com "Ver outros planos"). Sem isso, a página completa. */
  modo?: "direto";
  /** V3 (22/11): no modo "direto" a 2ª lâmina vira "7 dias": um livro por dia (os que a pessoa curtiu e os dos temas de `pergunta`) com o benefício. */
  /** V3 + modo "direto": texto do botão que sai do resultado (Índice de Leitor) para as lâminas da oferta. */
  continuar_resultado?: string;
  /** Modo "direto": linha pequena embaixo do preço (ex.: "Cancele quando quiser"). */
  cancele_texto?: string;
  /** Modo "direto": mostra o nome do bônus escolhido no cartão do plano (padrão: "Bônus escolhido"). */
  bonus_mostrar_nome?: boolean;
  /** Modo "direto": linha miúda no fim da lâmina (ex.: "CNPJ 00.000.000/0001-00"). */
  rodape_legal?: string;
  app_demo?: { titulo?: string; texto?: string; url?: string; poster?: string };   // vídeo do app antes do preço (sempre com Continuar liberado)
  /** Depois do bônus mostra "O que você recebe" (itens + bônus escolhido) em vez da lâmina de 7 dias. */
  mostrar_recebe?: boolean;
  sete_dias?: { titulo?: string; texto?: string; pergunta?: string };
  bonus_escolha_titulo?: string; bonus_escolhido_rotulo?: string; preco_descricao?: string; outros_planos_texto?: string;
  /** Oferta mensal única (V3, 22/11): sem `planos` e sem `modo`, com estes textos. `aviso` e `fechamento_titulo` aceitam **negrito**; `selos` = 4 textos (cadeado, escudo, livro, fone). */
  /** Linha de prova social abaixo do título da oferta (ex.: "Mais de 36 mil leitores já baixaram o Instalivros."). */
  prova_social?: string;
  aviso?: string; preco_rotulo?: string; preco_sub?: string; fechamento_titulo?: string; selos?: string[];
  planos_acesso?: string;   // linha "✓ …" embaixo do nome em todos os cartões de plano (ex.: "Acesso completo ao Instalivros")
}
export interface PlanoOferta {
  id: string; nome: string; preco?: string; preco_de?: string; parcelas?: { n: number; valor: string }; cta_url?: string;
  destaque?: boolean;   // vem selecionado ao abrir
  selo?: string;        // ex.: "Mais escolhido"
  com_bonus?: boolean;  // só estes planos levam os bônus
  bonus_regra?: "todos" | "escolhido" | "nenhum";   // 18/11 (V2 direta): anual leva os 2 bônus, semestral só o escolhido, trimestral nenhum. Sem isso vale `com_bonus`
  oculto?: boolean;     // some do público (fica no editor) até o link estar certo
  equivalente?: string; // ex.: "≈ R$12,25/mês"
}
export type CampoCaptura = "nome" | "email" | "whatsapp";
// Captura (16/10, pedido do Davi: nome e WhatsApp para contato). Com `depois_de`
// (id de tela ou de pergunta) ela entra no meio do quiz, ex.: logo depois do
// "analisando", e a resposta já é gravada ali, sem esperar o fim.
export interface CapturaQuiz {
  ativa?: boolean; titulo?: string; texto?: string; nota?: string; botao?: string;
  /** Link sublinhado embaixo do botão que segue para o resultado sem enviar nada (V3). */
  pular?: string;
  /** Selo pequeno em cima do título (padrão "QUIZ COMPLETO" quando o quiz tem `indice`). */
  selo?: string;
  pedir?: CampoCaptura[]; rotulos?: Partial<Record<CampoCaptura, string>>; depois_de?: string;
  /** Texto de exemplo dentro de cada campo (padrão: "Como você se chama?", "voce@email.com"…). */
  exemplos?: Partial<Record<CampoCaptura, string>>;
  fala?: string;            // o Instalivros fala no topo do formulário (balão)
  /** Criar a conta em etapas (13/11): 1) nome → 2) e-mail e WhatsApp → 3) "Conta criada!" com confete e o botão do plano; cada etapa sai para o lado com animação. */
  etapas?: boolean;
  /** Etapa final: título ("Conta criada!"), texto e botão ("Ver meu plano personalizado"). */
  conta_criada?: { titulo?: string; texto?: string; botao?: string };
  /** Carrossel de depoimentos (App Store/Google Play) que passa sozinho no lugar do quadro de selos. `fonte` ex.: "Google Play ★★★★★". */
  depoimentos?: { nome: string; fonte?: string; texto: string }[]; depoimentos_titulo?: string;
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
/** Identidade visual do quiz (Davi, 15/11): um fundo único em todas as telas, textos, cards e botão. Sem isso o quiz usa só `tema` + `cor`. */
export interface VisualQuiz {
  /** Qualquer `background` CSS (gradiente). Vale para a página inteira e para todas as telas. */
  fundo_css: string;
  /** Cor da página e da barra do navegador (fica atrás do gradiente). */
  base: string; barra?: string;
  texto?: string; texto_2?: string;
  /** Fundo e borda dos cards, opções, balões e campos. */
  card?: string; borda_card?: string;
  /** Botões principais e o texto escuro em cima deles. */
  botao?: string; botao_texto?: string;
  /** Fontes (Google Fonts): `fontes_url` é o link do css2 (ex.: https://fonts.googleapis.com/css2?family=Inter&display=swap); `fonte_titulo`/`fonte_texto` são o `font-family` CSS de títulos e do resto. */
  fontes_url?: string; fonte_titulo?: string; fonte_texto?: string;
  /** Cor de destaque (anel, ícones, números, selos); sem ela vale a cor do botão. */
  destaque?: string;
  /** Quiz dentro de um cartão central (fundo `card_solido`, raio e sombra), com o fundo da página aparecendo em volta. */
  cartao?: { fundo: string; borda?: string; raio?: number; sombra?: string };
  /** Cor de "ok" (selo "Resultado pronto", ✓ da lista, selos de compra) e fundo (CSS) do bloco da oferta. */
  ok?: string; oferta_fundo?: string;
  /** Marca em cima do cartão ("Insta" + "livros" em destaque), frase embaixo dela (só na abertura) e rodapé da página. */
  marca?: { antes: string; destaque?: string; subtitulo?: string; rodape?: string; /** Logo (imagem) no lugar do nome em texto. */ imagem?: string };
}
export interface EstruturaQuiz {
  visual?: VisualQuiz;
  /** Perguntas de estilo "escala" (15/11): "velocimetro" = meio-círculo com ponteiro arrastável; sem isso, a trilha reta. */
  escala_visual?: "velocimetro";
  intro?: { titulo?: string; subtitulo?: string; botao?: string; rodape?: string; imagem?: string; imagem_nota?: string; credenciais?: string[]; pular?: boolean };
  perguntas: PerguntaQuiz[];
  perfis: PerfilQuiz[];
  /** Resultado "Índice de Leitor" (V3, 22/11): nota de 0 a 10 no anel + perfil pela faixa da nota + cartões de benefício. Quando existe, manda no perfil (ignora os pontos). Textos aceitam {resposta:id}, {falta} e **negrito**. */
  indice?: ConfigIndice;
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
  /** Link pequeno "← Voltar" embaixo do botão principal (padrão: liga; `false` desliga, como na V2; o Voltar do topo continua). */
  voltar_embaixo?: boolean;
  /** Curva da barra dentro de cada fase: "vturb" corre rápido no começo e desacelera no fim; "linear" (padrão) avança igual. */
  progresso?: "vturb" | "linear";
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
  if (e.indice?.faixas?.length) {
    const id = perfilDoIndice(e.indice, calcularNotaIndice(e.indice, e.perguntas, escolhas));
    return e.perfis.find((p) => p.id === id) ?? null;
  }
  const pontos = pontosPorPerfil(e, escolhas);
  let melhor: PerfilQuiz | null = null, max = -1;
  for (const p of e.perfis) {
    const n = pontos.get(p.id) ?? 0;
    if (n > max) { melhor = p; max = n; }
  }
  return melhor;
}

/** Nota do Índice de Leitor (null se o quiz não tem `indice`). */
export const notaDoIndice = (e: EstruturaQuiz, escolhas: Record<string, number>): number | null => (e.indice ? calcularNotaIndice(e.indice, e.perguntas, escolhas) : null);
/** Oferta mensal única da V3 (sem planos, sem modo, com os textos novos). */
export const ofertaMensalUnica = (e: EstruturaQuiz): boolean => !!e.oferta && !e.oferta.planos?.length && !e.oferta.modo && !!(e.oferta.aviso || e.oferta.preco_rotulo);

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
    if (t.tipo === "amostra" && !Object.keys(t.amostra?.amostras ?? {}).length) return;   // sem trecho cadastrado, a tela não existe
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
/** Nome e sobrenome (19/11, Davi): pelo menos duas palavras com 2+ letras. */
export const nomeCompleto = (nome?: string) => (nome ?? "").trim().split(/\s+/).filter((w) => w.replace(/[^\p{L}]/gu, "").length >= 2).length >= 2;
export const primeiroNome = (nome?: string) => (nome ?? "").trim().split(/\s+/)[0] ?? "";
const capitalizar = (s: string) => s.charAt(0).toLocaleUpperCase("pt-BR") + s.slice(1).toLocaleLowerCase("pt-BR");
function comNome(texto: string, nome?: string): string {
  const n = capitalizar(primeiroNome(nome));
  if (n) return texto.replace(/\{nome\}/g, n);
  return texto
    .replace(/(^|[.!?…]\s*)\{nome\}\s*,?\s*(\S)/gu, (_t, antes: string, letra: string) => antes + letra.toLocaleUpperCase("pt-BR"))
    .replace(/\s*,?\s*\{nome\}/g, "");
}
export function preencher(texto: string | undefined, e: EstruturaQuiz, escolhas: Record<string, number>, perfil: PerfilQuiz | null, nome?: string, numeros: Record<string, number> = {}): string {
  if (!texto) return "";
  return preencherNumeros(comNome(texto, nome), e.perguntas, numeros)
    .replace(/\{perfil\}/g, perfil?.nome ?? "")
    .replace(/\{falta\}/g, () => { const n = notaDoIndice(e, escolhas); return n == null ? "" : String(Math.max(0, (e.indice?.max ?? 10) - n)); })
    .replace(/\b1 pontos\b/g, "1 ponto")   // "Faltam só 1 ponto" (singular, como no HTML)
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

