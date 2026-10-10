import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// Estado da ferramenta "Transcrever" do modo Creator, FORA dos componentes:
// sair do Creator (ou fechar o painel do Jarvis) não cancela nada — a
// transcrição continua rodando e o resultado está lá quando voltar. O link
// colado também fica salvo (localStorage) até transcrever.

export type ModoTranscricao = "preciso" | "rapido";

export interface Transcricao {
  id: string;
  link: string;
  titulo: string | null;
  autor: string | null;
  texto: string;
  idioma: string | null;
  duracao_segundos: number | null;
  levou_segundos: number | null;
  criada_em: string;
}

interface Estado {
  link: string;
  rodando: boolean;
  iniciadoEm: number | null;
  linkRodando: string | null;
  atual: Transcricao | null;
  // Muda a cada transcrição salva — a tela recarrega o histórico.
  versaoHistorico: number;
}

interface Resultado {
  texto: string; idioma?: string; titulo?: string; autor?: string; duracao?: number; segundos?: number;
  visualizacoes?: number | null; data_publicacao?: string | null;
  capa?: { base64: string; tipo: string } | null;
}

// Guarda a capa no Storage (o link do Instagram expira) e devolve a URL pública.
async function salvarCapa(userId: string, capa: Resultado["capa"]): Promise<string | null> {
  if (!capa?.base64) return null;
  try {
    const bytes = Uint8Array.from(atob(capa.base64), (c) => c.charCodeAt(0));
    const ext = capa.tipo.includes("png") ? "png" : capa.tipo.includes("webp") ? "webp" : "jpg";
    const caminho = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("capas-referencia").upload(caminho, bytes, { contentType: capa.tipo });
    if (error) return null;
    return supabase.storage.from("capas-referencia").getPublicUrl(caminho).data.publicUrl;
  } catch { return null; }
}

// Headline de um vídeo pela transcrição: a primeira frase (o gancho), curta.
export function headlineDaTranscricao(texto: string): string {
  const primeira = texto.trim().split(/(?<=[.!?…])\s+/)[0] ?? texto;
  return primeira.length > 140 ? `${primeira.slice(0, 137).trimEnd()}…` : primeira;
}

const CHAVE_LINK = "jarvis:creator-link";
const lerLink = () => { try { return localStorage.getItem(CHAVE_LINK) || ""; } catch { return ""; } };

let estado: Estado = { link: lerLink(), rodando: false, iniciadoEm: null, linkRodando: null, atual: null, versaoHistorico: 0 };
const ouvintes = new Set<() => void>();

function mudar(parcial: Partial<Estado>) {
  estado = { ...estado, ...parcial };
  ouvintes.forEach((o) => o());
}

export function useTranscricao(): Estado {
  return useSyncExternalStore(
    (o) => { ouvintes.add(o); return () => ouvintes.delete(o); },
    () => estado,
  );
}

export function definirLink(link: string) {
  try { if (link) localStorage.setItem(CHAVE_LINK, link); else localStorage.removeItem(CHAVE_LINK); } catch { /* sem storage */ }
  mudar({ link });
}

export function limparAtual(id?: string) {
  if (!id || estado.atual?.id === id) mudar({ atual: null });
}

export async function transcrever(modo: ModoTranscricao) {
  const url = estado.link.trim();
  if (!url || estado.rodando) return;
  if (!/^https?:\/\//i.test(url)) { toast.error("Cole um link de vídeo (começando com http)"); return; }
  mudar({ rodando: true, iniciadoEm: Date.now(), linkRodando: url, atual: null });
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const r = await invoke<Resultado>("creator_transcrever", { url, modo });
    if (!r.texto) { toast.error("Não encontrei fala nesse vídeo"); return; }
    const novo = {
      link: url, titulo: r.titulo ?? null, autor: r.autor ?? null, texto: r.texto, idioma: r.idioma ?? null,
      duracao_segundos: r.duracao != null ? Math.round(r.duracao) : null, levou_segundos: r.segundos ?? null,
    };
    const { data, error } = await supabase.from("creator_transcricoes").insert(novo).select("id, criada_em").single();
    if (error) toast.error("Transcrevi, mas não consegui salvar no histórico");
    // Só limpa o campo se ele ainda tem o link que foi transcrito.
    if (estado.link.trim() === url) definirLink("");
    mudar({
      atual: { ...novo, id: data?.id ?? crypto.randomUUID(), criada_em: data?.criada_em ?? new Date().toISOString() },
      versaoHistorico: estado.versaoHistorico + 1,
    });
    toast.success("Transcrição pronta", { description: novo.titulo ?? undefined });
  } catch (erro) {
    toast.error(typeof erro === "string" ? erro : erro instanceof Error ? erro.message : "Não consegui transcrever");
  } finally {
    mudar({ rodando: false, iniciadoEm: null, linkRodando: null });
  }
}

// ---------------------------------------------------------------------------
// Fila do iPhone: links mandados pelo Atalho "Jarvis" (menu Compartilhar)
// chegam em creator_links e são transcritos aqui, um por um, em segundo
// plano — mesmo com o Creator fechado. Só roda no Jarvis do Mac.

let processandoFila = false;
const CHAVE_MODO = "jarvis:creator-modo";
const modoAtual = (): ModoTranscricao => {
  try { return (localStorage.getItem(CHAVE_MODO) as ModoTranscricao) || "preciso"; } catch { return "preciso"; }
};

export async function processarFila(userId: string) {
  if (processandoFila) return;
  processandoFila = true;
  try {
    // Ficou "transcrevendo" de uma vez que o app fechou no meio: volta pra fila.
    await supabase.from("creator_links").update({ status: "nova" })
      .eq("user_id", userId).eq("status", "transcrevendo");
    for (;;) {
      const { data: item } = await supabase.from("creator_links").select("id, link, pasta_id, cliente_id")
        .eq("user_id", userId).eq("status", "nova").order("criada_em").limit(1).maybeSingle();
      if (!item) break;
      await supabase.from("creator_links").update({ status: "transcrevendo" }).eq("id", item.id);
      mudar({ versaoHistorico: estado.versaoHistorico + 1 });
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const r = await invoke<Resultado>("creator_transcrever", { url: item.link, modo: modoAtual() });
        if (!r.texto) throw new Error("Não encontrei fala nesse vídeo");
        const { data: salvo } = await supabase.from("creator_transcricoes").insert({
          link: item.link, titulo: r.titulo ?? null, autor: r.autor ?? null, texto: r.texto, idioma: r.idioma ?? null,
          duracao_segundos: r.duracao != null ? Math.round(r.duracao) : null, levou_segundos: r.segundos ?? null,
        }).select("id").single();
        await supabase.from("creator_links").update({ status: "transcrita", transcricao_id: salvo?.id ?? null, erro: null }).eq("id", item.id);
        if (item.cliente_id) {
          // Atalho de um cliente (ex.: o Matheus): vira ideia nas "Ideias em
          // destaque" do projeto dele, igual à importação da planilha.
          const { salvarLinhas } = await import("@/lib/conteudo/importarPlanilha");
          await salvarLinhas(item.cliente_id, [{
            link: item.link,
            headline: headlineDaTranscricao(r.texto),
            transcricao: r.texto,
            visualizacoes: r.visualizacoes ?? null,
            criador: r.autor ?? null,
            dataPublicacao: r.data_publicacao ?? null,
            capa: await salvarCapa(userId, r.capa),
          }]);
        }
        if (item.pasta_id) {
          // Modo "Separar ideias" ligado quando o link chegou: vira a próxima
          // ideia numerada do mentorado; a headline e a tradução saem aqui
          // mesmo (separarIdeia) e vão pro doc dele.
          const { data: ideia } = await supabase.from("creator_ideias")
            .insert({ pasta_id: item.pasta_id, link: item.link, transcricao_id: salvo?.id ?? null, idioma: r.idioma ?? null })
            .select("id").single();
          if (ideia) {
            const { separarIdeia } = await import("./separarIdeia");
            await separarIdeia(ideia.id);
          }
        }
        toast.success("Do iPhone: transcrição pronta", { description: r.titulo ?? undefined });
      } catch (erro) {
        const msg = typeof erro === "string" ? erro : erro instanceof Error ? erro.message : "Não consegui transcrever";
        await supabase.from("creator_links").update({ status: "erro", erro: msg.slice(0, 300) }).eq("id", item.id);
      }
      mudar({ versaoHistorico: estado.versaoHistorico + 1 });
    }
  } finally {
    processandoFila = false;
  }
}

// ---------------------------------------------------------------------------
// Referências do Instagram que chegaram sem capa (antes de existir a capa, ou
// pela planilha): uma vez por abertura do Jarvis, busca a imagem (e as views,
// se faltarem) e guarda. Devagar, um post a cada 2s, pra não forçar a conta.

let capasRodou = false;

export async function completarCapas(userId: string) {
  if (capasRodou) return;
  capasRodou = true;
  const { data: refs } = await supabase.from("videos_referencia")
    .select("id, link_video, visualizacoes")
    .is("thumbnail_url", null).ilike("link_video", "%instagram.com%").limit(60);
  if (!refs?.length) return;
  const { invoke } = await import("@tauri-apps/api/core");
  for (const ref of refs) {
    const m = decodeURIComponent(ref.link_video ?? "").match(/\/(reel|reels|p|tv)\/([^/?\]]+)/);
    if (!m) continue;
    try {
      const r = await invoke<Resultado>("creator_transcrever", { url: `https://www.instagram.com/${m[1] === "p" ? "p" : "reel"}/${m[2]}/`, modo: "capa" });
      const capa = await salvarCapa(userId, r.capa);
      const mudancas: { thumbnail_url?: string; visualizacoes?: number } = {};
      if (capa) mudancas.thumbnail_url = capa;
      if (ref.visualizacoes == null && r.visualizacoes) mudancas.visualizacoes = r.visualizacoes;
      if (Object.keys(mudancas).length) await supabase.from("videos_referencia").update(mudancas).eq("id", ref.id);
    } catch { /* post apagado/foto: segue pro próximo */ }
    await new Promise((ok) => setTimeout(ok, 2000));
  }
}
