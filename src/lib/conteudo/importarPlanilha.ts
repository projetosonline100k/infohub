import readXlsxFile from "read-excel-file";
import { supabase } from "@/integrations/supabase/client";
import { chaveDoLink, lerCsv, linhasDaPlanilha, type LinhaReferencia } from "./planilhaReferencias";

const NOMES_CAMPOS: Record<string, string> = { link: "Link", headline: "Headline" };

function plataformaDoLink(link: string): string {
  if (/instagram\.com/i.test(link)) return "instagram";
  if (/youtu\.?be/i.test(link)) return "youtube";
  if (/tiktok\.com/i.test(link)) return "tiktok";
  return "outro";
}

async function lerArquivo(arquivo: File): Promise<unknown[][]> {
  if (/\.csv$/i.test(arquivo.name) || arquivo.type === "text/csv") return lerCsv(await arquivo.text());
  return (await readXlsxFile(arquivo)) as unknown[][];
}

// Importa a planilha de vídeos de referência pro projeto: cada vídeo novo
// entra no Banco de referências (videos_referencia, com criador, data,
// visualizações e transcrição) E vira uma ideia no pipeline (videos_vertical
// com status "ideia", ligada à referência). Vídeo já importado (mesmo link)
// é pulado — dá pra reimportar a planilha atualizada sem duplicar.
export async function importarPlanilhaReferencias(clienteId: string, arquivo: File): Promise<{ importados: number; repetidos: number }> {
  const { linhas, faltando } = linhasDaPlanilha(await lerArquivo(arquivo));
  if (faltando.length) {
    throw new Error(`A planilha precisa das colunas: ${faltando.map((c) => NOMES_CAMPOS[c] ?? c).join(" e ")}`);
  }
  return salvarLinhas(clienteId, linhas);
}

export async function salvarLinhas(clienteId: string, linhas: LinhaReferencia[]): Promise<{ importados: number; repetidos: number }> {
  const [{ data: existentes }, { data: ideias }] = await Promise.all([
    supabase.from("videos_referencia").select("link_video, ordem").eq("cliente_id", clienteId),
    supabase.from("videos_vertical").select("ordem").eq("cliente_id", clienteId).eq("status", "ideia"),
  ]);
  const jaTem = new Set((existentes || []).map((r) => r.link_video && chaveDoLink(r.link_video)).filter(Boolean));
  const novas = linhas.filter((l) => !jaTem.has(chaveDoLink(l.link)));
  if (!novas.length) return { importados: 0, repetidos: linhas.length };

  const ordemRef = Math.max(0, ...(existentes || []).map((r) => r.ordem ?? 0));
  const { data: referencias, error } = await supabase
    .from("videos_referencia")
    .insert(novas.map((l, i) => ({
      cliente_id: clienteId,
      titulo: l.headline || l.link,
      link_video: l.link,
      plataforma: plataformaDoLink(l.link),
      criador: l.criador,
      data_publicacao: l.dataPublicacao,
      visualizacoes: l.visualizacoes,
      transcricao: l.transcricao,
      thumbnail_url: l.capa ?? null,
      ordem: ordemRef + i + 1,
    })))
    .select("id, link_video");
  if (error || !referencias) throw error ?? new Error("Não foi possível salvar as referências");

  const idPorLink = new Map(referencias.map((r) => [chaveDoLink(r.link_video ?? ""), r.id]));
  const ordemIdeia = Math.max(0, ...(ideias || []).map((v) => v.ordem ?? 0));
  const { error: erroIdeias } = await supabase.from("videos_vertical").insert(novas.map((l, i) => ({
    cliente_id: clienteId,
    titulo: l.headline || l.link,
    status: "ideia",
    referencia_id: idPorLink.get(chaveDoLink(l.link)) ?? null,
    origem_plataforma: plataformaDoLink(l.link),
    ordem: ordemIdeia + i + 1,
  })));
  if (erroIdeias) throw erroIdeias;
  return { importados: novas.length, repetidos: linhas.length - novas.length };
}
