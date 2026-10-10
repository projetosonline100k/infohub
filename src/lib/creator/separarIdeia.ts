import { supabase } from "@/integrations/supabase/client";
import { ehPortugues, traduzirParaPortugues } from "@/lib/conteudo/traducao";
import { headlineDaTranscricao } from "./transcricaoStore";

// "Separar ideias" do modo Creator, rodando no próprio Jarvis: headline = a
// primeira frase falada (o gancho), tradução pelo Google quando o reel é de
// outra língua, e a ideia vai pro fim do doc "Ideias de headline — <nome>"
// na pasta do mentorado. Antes isso dependia da sessão "Inteligência do
// Infopro" (comando /ideia) e travava quando ela parava de ouvir.

const ESTILO = "font-family: Poppins, sans-serif; font-size: 16px;";

const escapar = (texto: string) =>
  texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const paragrafo = (texto: string, negrito = false) => {
  const t = escapar(texto);
  return `<p><span style="${ESTILO}">${negrito ? `<strong>${t}</strong>` : t}</span></p>`;
};

// Reel só com música/agradecimento: não tem gancho falado pra separar.
export function semFala(texto: string): boolean {
  const limpo = texto.replace(/[^\p{L}\s]/gu, " ").trim().toLowerCase();
  const palavras = limpo.split(/\s+/).filter(Boolean);
  return palavras.length < 6 || /^(thank you\s*)+$/.test(limpo);
}

export function blocoDaIdeia(i: {
  numero: number; link: string; headlinePt: string; headlineOriginal: string | null;
  idioma: string | null; transcricao: string; traducao: string | null;
}): string {
  const traduzido = !!i.traducao;
  const partes = [
    `<p><span style="${ESTILO}">&#8203;</span></p>`,
    `<h3><strong>IDEIA ${String(i.numero).padStart(2, "0")}</strong></h3>`,
    paragrafo(`Headline: ${i.headlinePt}`, true),
  ];
  if (traduzido && i.headlineOriginal) partes.push(paragrafo(`Original (${i.idioma}): ${i.headlineOriginal}`));
  partes.push(`<p><span style="${ESTILO}"><a href="${escapar(i.link)}">Link do vídeo</a></span></p>`);
  // Título (h4) que fecha e abre: a transcrição fica "dentro" dele.
  partes.push(`<h4>${traduzido ? "Transcrição traduzida" : "Transcrição"}</h4>`);
  partes.push(paragrafo(traduzido ? i.traducao! : i.transcricao));
  return partes.join("");
}

export async function separarIdeia(ideiaId: string): Promise<void> {
  const { data: ideia } = await supabase.from("creator_ideias")
    .select("id, user_id, numero, link, pasta_id, idioma, transcricao_id").eq("id", ideiaId).maybeSingle();
  if (!ideia) return;
  const marcarErro = (erro: string) => supabase.from("creator_ideias").update({ status: "erro", erro }).eq("id", ideiaId);

  const [{ data: pasta }, { data: transcricao }] = await Promise.all([
    supabase.from("pastas_atividade").select("nome, cliente_id").eq("id", ideia.pasta_id).maybeSingle(),
    ideia.transcricao_id
      ? supabase.from("creator_transcricoes").select("texto, idioma").eq("id", ideia.transcricao_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const texto = transcricao?.texto?.trim() ?? "";
  if (!pasta) { await marcarErro("Pasta do mentorado não encontrada"); return; }
  if (!texto || semFala(texto)) { await marcarErro("O reel não tem fala (só música ou texto na tela): sem gancho falado pra separar."); return; }

  let idioma = ideia.idioma ?? transcricao?.idioma ?? null;
  const headlineOriginal = headlineDaTranscricao(texto);
  let headlinePt = headlineOriginal;
  let traducao: string | null = null;
  if (!ehPortugues(idioma)) {
    try {
      const completa = await traduzirParaPortugues(texto);
      idioma = completa.idioma ?? idioma;
      if (!ehPortugues(idioma)) {
        traducao = completa.texto;
        headlinePt = (await traduzirParaPortugues(headlineOriginal)).texto || headlineOriginal;
      }
    } catch (e) {
      // Tradutor fora do ar: fica pendente e tenta de novo no próximo minuto
      // (o motivo fica anotado em `erro`).
      await supabase.from("creator_ideias").update({ erro: `tradutor: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300) }).eq("id", ideiaId);
      return;
    }
  }

  const titulo = `Ideias de headline — ${pasta.nome}`;
  const { data: existente } = await supabase.from("documentos").select("id, conteudo")
    .eq("pasta_id", ideia.pasta_id).eq("titulo", titulo).is("deleted_at", null)
    .order("created_at").limit(1).maybeSingle();
  const bloco = blocoDaIdeia({ numero: ideia.numero, link: ideia.link, headlinePt, headlineOriginal, idioma, transcricao: texto, traducao });
  let documentoId = existente?.id ?? null;
  if (existente) {
    const { error } = await supabase.from("documentos")
      .update({ conteudo: `${existente.conteudo ?? ""}${bloco}`, updated_at: new Date().toISOString() }).eq("id", existente.id);
    if (error) { await marcarErro("Não consegui escrever no documento"); return; }
  } else {
    const { data: novo, error } = await supabase.from("documentos").insert({
      titulo, user_id: ideia.user_id, cliente_id: pasta.cliente_id, pasta_id: ideia.pasta_id,
      conteudo: paragrafo(`Ideias separadas pelo Jarvis (modo Creator) para ${pasta.nome}.`) + bloco,
    }).select("id").single();
    if (error || !novo) { await marcarErro("Não consegui criar o documento"); return; }
    documentoId = novo.id;
  }

  await supabase.from("creator_ideias").update({
    status: "pronta", headline_original: traducao ? headlineOriginal : null, headline_pt: headlinePt,
    traducao_pt: traducao, documento_id: documentoId, erro: null,
  }).eq("id", ideiaId);
}

// Ideias que ficaram paradas (ex.: da época em que dependia da sessão do Claude).
let rodando = false;
export async function separarIdeiasPendentes(userId: string) {
  if (rodando) return;
  rodando = true;
  try {
    const { data } = await supabase.from("creator_ideias").select("id")
      .eq("user_id", userId).eq("status", "pendente").order("criada_em").limit(30);
    for (const { id } of data || []) {
      try { await separarIdeia(id); } catch { /* segue pra próxima */ }
    }
  } finally {
    rodando = false;
  }
}
