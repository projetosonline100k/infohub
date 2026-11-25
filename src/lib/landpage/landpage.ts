// Land page (25/11/2026): página comprida em blocos, com VSL. `ConfigLandpage` é o que fica em landpages.config (rascunho) e landpages.publicada.
import { PUBLIC_SITE_URL } from "@/lib/shareUrl";

export type TipoBloco = "vsl" | "titulo" | "texto" | "imagem" | "lista" | "depoimentos" | "apresentacao" | "preco" | "faq" | "botao";
export interface Bloco {
  id: string; tipo: TipoBloco;
  aparecer_apos?: number;                    // qualquer bloco: segundos depois de abrir a página até ele aparecer (0 ou vazio = já aparece)
  titulo?: string; subtitulo?: string; texto?: string;
  url?: string;                              // imagem
  video?: string; poster?: string;           // vsl: mp4/Backblaze, YouTube ou Vimeo
  botao_texto?: string; botao_url?: string;  // vsl, preco, botao
  botao_apos?: number;                       // vsl: segundos de vídeo até o botão aparecer (0 = já aparece)
  de?: string; por?: string; detalhe?: string; garantia?: string;   // preco
  nome?: string; foto?: string;              // apresentacao
  itens?: string[];                          // lista
  depoimentos?: { nome: string; texto: string; foto?: string }[];
  faq?: { p: string; r: string }[];
}
export interface ConfigLandpage { cor?: string; escuro?: boolean; blocos: Bloco[] }
export interface LandpageResumo { id: string; nome: string; slug: string; status: "rascunho" | "publicado" | "pausado"; config: ConfigLandpage; publicada: ConfigLandpage | null; publicado_em: string | null; criado_em: string }

export const linkDaLandpage = (slug: string) => `${PUBLIC_SITE_URL}/p/${slug}`;
export const novoId = () => Math.random().toString(36).slice(2, 10);

export const ROTULO_BLOCO: Record<TipoBloco, string> = {
  vsl: "Vídeo (VSL)", titulo: "Título", texto: "Texto", imagem: "Imagem", lista: "Lista de benefícios", depoimentos: "Depoimentos",
  apresentacao: "Quem é (foto + texto)", preco: "Preço e compra", faq: "Perguntas frequentes", botao: "Botão",
};

export function blocoNovo(tipo: TipoBloco): Bloco {
  const b: Bloco = { id: novoId(), tipo };
  switch (tipo) {
    case "vsl": return { ...b, titulo: "Assista até o final", video: "", botao_texto: "Quero começar agora", botao_url: "", botao_apos: 0 };
    case "titulo": return { ...b, titulo: "Seu título aqui", subtitulo: "Uma frase que explica a promessa." };
    case "texto": return { ...b, texto: "Escreva aqui. Uma linha em branco separa os parágrafos." };
    case "imagem": return { ...b, url: "" };
    case "lista": return { ...b, titulo: "O que você recebe", itens: ["Primeiro benefício", "Segundo benefício", "Terceiro benefício"] };
    case "depoimentos": return { ...b, titulo: "Quem já usou", depoimentos: [{ nome: "Nome", texto: "O que a pessoa disse." }] };
    case "apresentacao": return { ...b, titulo: "Quem é", nome: "", foto: "", texto: "" };
    case "preco": return { ...b, titulo: "Comece hoje", de: "", por: "R$ 97,00", detalhe: "à vista ou no cartão", botao_texto: "Quero o meu", botao_url: "", garantia: "7 dias de garantia: se não gostar, devolvemos o seu dinheiro." };
    case "faq": return { ...b, titulo: "Perguntas frequentes", faq: [{ p: "Como funciona?", r: "Resposta." }] };
    case "botao": return { ...b, botao_texto: "Quero começar", botao_url: "" };
  }
}

export const modeloLandpage = (): ConfigLandpage => ({ escuro: true, cor: "#16a34a", blocos: (["titulo", "vsl", "lista", "apresentacao", "depoimentos", "preco", "faq"] as TipoBloco[]).map(blocoNovo) });

/** Vídeo que dá para embutir: YouTube e Vimeo viram iframe; o resto (mp4, Backblaze) toca no player da página. */
export function videoEmbutido(url: string): { tipo: "iframe" | "arquivo"; src: string } {
  const u = url.trim();
  const yt = u.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,15})/);
  if (yt) return { tipo: "iframe", src: `https://www.youtube.com/embed/${yt[1]}?rel=0&modestbranding=1` };
  const vm = u.match(/vimeo\.com\/(?:video\/)?(\d{5,12})/);
  if (vm) return { tipo: "iframe", src: `https://player.vimeo.com/video/${vm[1]}` };
  return { tipo: "arquivo", src: u };
}

/** Um link só vale se for http(s): o campo é livre e vira href na página pública. */
export const linkSeguro = (u?: string) => (u && /^https?:\/\//i.test(u.trim()) ? u.trim() : "#");
