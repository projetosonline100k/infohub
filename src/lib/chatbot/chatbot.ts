// Chatbot (10/11/2026, Davi): diagnóstico em conversa, montado na aba Chatbot do projeto e publicado em
// /chatbot/<slug>. Aqui fica a parte pura (tipos, modelo pronto, validação, pontuação), sem React.

export type TipoEtapa = "nenhum" | "texto" | "whatsapp" | "email" | "escolha" | "lista";
export interface OpcaoChatbot { texto: string; pontos?: number }
export interface EtapaChatbot {
  id: string;
  /** nome da resposta nos dados do lead e nas variáveis {chave} (nome, whatsapp, email…) */
  chave: string;
  /** falas do bot antes de pedir a resposta; {primeiro} = primeiro nome, {chave} = qualquer resposta, **negrito** */
  mensagens: string[];
  tipo: TipoEtapa;
  /** rótulo pequeno em cima do campo ("Nome completo") */
  rotulo?: string;
  placeholder?: string;
  opcoes?: OpcaoChatbot[];
}
export interface DesfechoChatbot { mensagens: string[]; botao_texto?: string; botao_url?: string }
export interface ConfigChatbot {
  marca: { titulo: string; subtitulo?: string; avatar_url?: string; logo_url?: string; cor?: string };
  etapas: EtapaChatbot[];
  pontuacao: { minimo: number };
  desfechos: { qualificado: DesfechoChatbot; nao_qualificado: DesfechoChatbot };
  lgpd?: string;
}
export interface ChatbotResumo { id: string; nome: string; slug: string; status: "rascunho" | "publicado" | "pausado"; config: ConfigChatbot; criado_em: string; modo_vivo?: boolean }
export interface LeadChatbot { id: string; chatbot_id: string; dados: Record<string, string>; etapa: number; score: number; desfecho: string | null; nome: string | null; email: string | null; whatsapp: string | null; utm: Record<string, string>; criada_em: string; atualizada_em: string }

export const linkDoChatbot = (slug: string) => `https://infopro-hub.vercel.app/chatbot/${slug}`;
export const ROTULO_TIPO: Record<TipoEtapa, string> = {
  nenhum: "Só mensagem", texto: "Texto livre", whatsapp: "WhatsApp", email: "E-mail", escolha: "Botões de escolha", lista: "Lista (select)",
};
export const novoId = () => Math.random().toString(36).slice(2, 10);

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const primeiroNome = (nome: string | undefined) => (nome ?? "").trim().split(/\s+/)[0] ?? "";

/** Fala do bot pronta para o HTML: variáveis trocadas (já escapadas), **negrito** e quebras de linha. */
export function falaDoBot(texto: string, dados: Record<string, string>): string {
  const vars: Record<string, string> = { ...dados, primeiro: primeiroNome(dados.nome) };
  return esc(texto)
    .replace(/\{(\w+)\}/g, (_, k: string) => esc(vars[k] ?? ""))
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/\n/g, "<br>");
}

const CORRECOES: Record<string, string> = {
  "gmail.con": "gmail.com", "gmail.co": "gmail.com", "gmal.com": "gmail.com", "gamil.com": "gmail.com", "gmai.com": "gmail.com", "gmail.cm": "gmail.com",
  "hotmal.com": "hotmail.com", "hotmai.com": "hotmail.com", "hotmail.con": "hotmail.com", "hotmial.com": "hotmail.com",
  "outlok.com": "outlook.com", "outlook.con": "outlook.com", "yaho.com": "yahoo.com", "yahoo.con": "yahoo.com", "icloud.con": "icloud.com", "iclod.com": "icloud.com",
};
export function sugerirEmail(email: string): string | null {
  const [u, dominio] = email.toLowerCase().split("@");
  return dominio && CORRECOES[dominio] ? `${u}@${CORRECOES[dominio]}` : null;
}

export const soDigitos = (s: string) => s.replace(/\D/g, "");
export function formatarWhatsapp(s: string): string {
  const d = soDigitos(s).replace(/^55(?=\d{10,11}$)/, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** null = válido; senão a mensagem para mostrar embaixo do campo. */
export function validarResposta(tipo: TipoEtapa, valor: string, chave = ""): string | null {
  const v = valor.trim();
  if (!v) return "Preencha para continuar.";
  if (tipo === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? null : "Esse e-mail parece incompleto.";
  if (tipo === "whatsapp") { const n = soDigitos(v).replace(/^55(?=\d{10,11}$)/, ""); return n.length === 10 || n.length === 11 ? null : "Digite com DDD, ex.: (11) 99999-9999."; }
  if (tipo === "texto" && chave === "nome") return v.split(/\s+/).length >= 2 && v.length >= 5 ? null : "Digite nome e sobrenome.";
  if (tipo === "texto" && chave === "instagram") return /^@?[A-Za-z0-9._]{2,30}$/.test(v) ? null : "Use só o @ do perfil, sem espaços.";
  return null;
}

export function pontosDaResposta(etapa: EtapaChatbot, resposta: string | undefined): number {
  if (!resposta || !etapa.opcoes) return 0;
  return etapa.opcoes.find((o) => o.texto === resposta)?.pontos ?? 0;
}
export function pontuar(config: ConfigChatbot, dados: Record<string, string>): number {
  return config.etapas.reduce((s, e) => s + pontosDaResposta(e, dados[e.chave]), 0);
}
export const desfechoDe = (config: ConfigChatbot, score: number): "qualificado" | "nao_qualificado" =>
  score >= (config.pontuacao.minimo || 0) ? "qualificado" : "nao_qualificado";

/** Pontuação máxima possível (para mostrar no editor). */
export const pontuacaoMaxima = (config: ConfigChatbot) => config.etapas.reduce((s, e) => s + Math.max(0, ...(e.opcoes ?? []).map((o) => o.pontos ?? 0)), 0);

/** Origem do clique, guardada com o lead. */
export function utmDaUrl(busca: string): Record<string, string> {
  const p = new URLSearchParams(busca);
  const r: Record<string, string> = {};
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) { const v = p.get(k); if (v) r[k] = v.slice(0, 200); }
  return r;
}

const op = (...t: [string, number][]): OpcaoChatbot[] => t.map(([texto, pontos]) => ({ texto, pontos }));

/** Modelo pronto: o diagnóstico em conversa da Core Audience (sem a busca do Instagram e a análise por IA). */
export function modeloDiagnostico(): ConfigChatbot {
  return {
    marca: { titulo: "Diagnóstico de Crescimento Orgânico", cor: "#7c3aed" },
    pontuacao: { minimo: 6 },
    lgpd: "Ao continuar, você concorda que seus dados sejam usados para entrarmos em contato sobre o seu diagnóstico. Seus dados estão protegidos (LGPD).",
    etapas: [
      { id: novoId(), chave: "nome", tipo: "texto", rotulo: "Nome completo", placeholder: "Digite seu nome e sobrenome...",
        mensagens: ["Perfis que aplicam o conteúdo certo estão multiplicando o alcance em até **10x** e transformando seguidores em **vendas** — sem investir 1 real em anúncio. Quer descobrir o que está travando o crescimento do seu perfil?", "Bora começar: qual seu nome?"] },
      { id: novoId(), chave: "whatsapp", tipo: "whatsapp", rotulo: "WhatsApp", placeholder: "(11) 99999-9999",
        mensagens: ["Prazer, **{primeiro}**! 👊 Pra eu te enviar o resultado completo do diagnóstico, qual seu WhatsApp?"] },
      { id: novoId(), chave: "email", tipo: "email", rotulo: "E-mail", placeholder: "seuemail@exemplo.com", mensagens: ["E qual seu melhor e-mail?"] },
      { id: novoId(), chave: "instagram", tipo: "texto", rotulo: "Seu @ do Instagram", placeholder: "@seuperfil",
        mensagens: ["Agora a parte boa: qual o **@** do seu perfil no Instagram?"] },
      { id: novoId(), chave: "seguidores", tipo: "escolha", mensagens: ["Quantos seguidores o perfil tem hoje?"],
        opcoes: op(["Menos de 1 mil", 1], ["1 a 5 mil", 2], ["5 a 20 mil", 3], ["20 a 50 mil", 4], ["50 a 100 mil", 5], ["Mais de 100 mil", 6]) },
      { id: novoId(), chave: "nicho", tipo: "lista", rotulo: "Seu nicho", mensagens: ["Em qual nicho o **@{instagram}** atua?"],
        opcoes: op(["Saúde & Bem-estar", 0], ["Estética & Beleza", 0], ["Fitness", 0], ["Direito", 0], ["Finanças & Investimentos", 0], ["Educação & Concursos", 0], ["Moda", 0],
          ["Gastronomia & Food", 0], ["Imobiliário", 0], ["Marketing & Negócios", 0], ["Serviços locais", 0], ["Outro", 0]) },
      { id: novoId(), chave: "desafio", tipo: "escolha", mensagens: ["Me confirma uma coisa: qual é o **maior desafio** do seu perfil hoje?"],
        opcoes: op(["Alcance baixo (views travadas)", 0], ["Falta de constância", 0], ["Não sei o que postar", 0], ["Seguidores não engajam", 1], ["Não converto em vendas", 1], ["Estou começando do zero", 0]) },
      { id: novoId(), chave: "faturamento", tipo: "escolha", mensagens: ["Última pergunta: qual a sua **renda mensal** atualmente?"],
        opcoes: op(["Até R$5 mil/mês", 1], ["R$5 a 10 mil/mês", 2], ["R$10 a 20 mil/mês", 4], ["R$20 a 50 mil/mês", 6], ["Acima de R$50 mil/mês", 8]) },
      { id: novoId(), chave: "analise", tipo: "nenhum",
        mensagens: ["Fechamos, **{primeiro}**. Seu maior gargalo — **{desafio}** — bate exatamente com o que vi no **@{instagram}**. E a boa notícia: é o tipo de coisa que se destrava rápido com o método certo.", "Cruzando suas respostas com os padrões que a gente mapeou em centenas de perfis... 🔍"] },
    ],
    desfechos: {
      qualificado: { mensagens: ["⚡ **{primeiro}**, seu perfil foi aprovado como **alto potencial**!", "Um especialista vai te chamar no WhatsApp com o seu diagnóstico completo. Fica de olho 👀"], botao_texto: "Falar agora no WhatsApp", botao_url: "" },
      nao_qualificado: { mensagens: ["Valeu por fazer o diagnóstico, **{primeiro}**! 🙏", "Preparamos um conteúdo para o seu momento. Entra no grupo para receber:"], botao_texto: "Entrar no grupo", botao_url: "" },
    },
  };
}

export function modeloEmBranco(): ConfigChatbot {
  return {
    marca: { titulo: "Novo chatbot" }, pontuacao: { minimo: 0 },
    etapas: [{ id: novoId(), chave: "nome", tipo: "texto", rotulo: "Nome completo", placeholder: "Digite seu nome e sobrenome...", mensagens: ["Oi! Qual seu nome?"] }],
    desfechos: { qualificado: { mensagens: ["Obrigado, **{primeiro}**! Recebi tudo."] }, nao_qualificado: { mensagens: ["Obrigado, **{primeiro}**! Recebi tudo."] } },
  };
}

const TIPOS: TipoEtapa[] = ["nenhum", "texto", "whatsapp", "email", "escolha", "lista"];
const texto = (v: unknown, max = 600) => (typeof v === "string" ? v.slice(0, max) : "");
const lista = (v: unknown, max = 20) => (Array.isArray(v) ? v.slice(0, max).map((x) => texto(x)).filter((x) => x.trim()) : []);

/** Aceita o que a IA devolveu (ou qualquer JSON) e entrega um chatbot válido; o que faltar vem do atual. */
export function sanitizarConfig(bruto: unknown, atual: ConfigChatbot): ConfigChatbot {
  const b = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const marca = (b.marca && typeof b.marca === "object" ? b.marca : {}) as Record<string, unknown>;
  const usados = new Set<string>();
  const etapas: EtapaChatbot[] = (Array.isArray(b.etapas) ? b.etapas : []).slice(0, 40).map((x, i) => {
    const e = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const tipo = TIPOS.includes(e.tipo as TipoEtapa) ? (e.tipo as TipoEtapa) : "texto";
    let id = texto(e.id, 20).replace(/\W/g, "") || novoId();
    while (usados.has(id)) id = novoId();
    usados.add(id);
    const opcoes = Array.isArray(e.opcoes) ? e.opcoes.slice(0, 30).map((o) => {
      const r = (o && typeof o === "object" ? o : { texto: o }) as Record<string, unknown>;
      return { texto: texto(r.texto, 120), pontos: Number.isFinite(Number(r.pontos)) ? Math.round(Number(r.pontos)) : 0 };
    }).filter((o) => o.texto.trim()) : [];
    const etapa: EtapaChatbot = {
      id, chave: texto(e.chave, 30).replace(/[^a-z0-9_]/gi, "").toLowerCase() || `etapa${i + 1}`, tipo,
      mensagens: lista(e.mensagens),
    };
    if (e.rotulo) etapa.rotulo = texto(e.rotulo, 80);
    if (e.placeholder) etapa.placeholder = texto(e.placeholder, 120);
    if (tipo === "escolha" || tipo === "lista") etapa.opcoes = opcoes.length >= 2 ? opcoes : [{ texto: "Opção 1", pontos: 0 }, { texto: "Opção 2", pontos: 0 }];
    return etapa;
  });
  const fim = (k: "qualificado" | "nao_qualificado"): DesfechoChatbot => {
    const d = ((b.desfechos as Record<string, unknown> | undefined)?.[k] ?? {}) as Record<string, unknown>;
    const antes = atual.desfechos[k];
    const mensagens = lista(d.mensagens);
    return { mensagens: mensagens.length ? mensagens : antes.mensagens, botao_texto: texto(d.botao_texto, 80) || antes.botao_texto, botao_url: /^https?:\/\//i.test(texto(d.botao_url, 500)) ? texto(d.botao_url, 500) : (d.botao_url === "" ? "" : antes.botao_url) };
  };
  const min = Number((b.pontuacao as Record<string, unknown> | undefined)?.minimo);
  return {
    marca: { ...atual.marca, titulo: texto(marca.titulo, 100) || atual.marca.titulo, subtitulo: texto(marca.subtitulo, 100) || atual.marca.subtitulo, cor: /^#[0-9a-f]{6}$/i.test(texto(marca.cor)) ? texto(marca.cor) : atual.marca.cor, avatar_url: atual.marca.avatar_url, logo_url: atual.marca.logo_url },
    pontuacao: { minimo: Number.isFinite(min) && min >= 0 ? Math.round(min) : atual.pontuacao.minimo },
    lgpd: texto(b.lgpd, 500) || atual.lgpd,
    etapas: etapas.length ? etapas : atual.etapas,
    desfechos: { qualificado: fim("qualificado"), nao_qualificado: fim("nao_qualificado") },
  };
}

/** Resposta de exemplo para a prévia estática (o que "alguém" teria respondido nesta etapa). */
export function respostaDeExemplo(e: EtapaChatbot): string {
  if (e.tipo === "nenhum") return "";
  if (e.opcoes?.length) return e.opcoes[0].texto;
  if (e.tipo === "whatsapp") return "(11) 99999-8888";
  if (e.tipo === "email") return "maria@gmail.com";
  if (e.chave === "nome") return "Maria Souza";
  if (e.chave === "instagram") return "mariasouza";
  return e.placeholder?.replace(/\.\.\.$/, "") || "Resposta";
}
