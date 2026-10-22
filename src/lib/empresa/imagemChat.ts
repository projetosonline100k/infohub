// Imagem no chat dos funcionários (22/10, Davi: "tirar um print e arrastar para o chat, e ele identificar").
// Sobe no bucket público 'entregas', na pasta chat/<usuário>/ (migração 20261022020000), e volta o link.
// Na mensagem vai uma linha "🖼️ <link>": o app mostra a imagem e o funcionário baixa e olha.
import { supabase } from "@/integrations/supabase/client";

export const PREFIXO_IMAGEM = "🖼️ ";
export const LINHA_IMAGEM = /^🖼️\s+(https:\/\/\S+)$/u;

export function imagensDoEvento(dados: DataTransfer | null): File[] {
  if (!dados) return [];
  const arquivos = [...dados.files].filter((f) => f.type.startsWith("image/"));
  if (arquivos.length) return arquivos;
  // Print copiado (⌘⌃⇧4) às vezes só vem em items.
  return [...dados.items].filter((i) => i.kind === "file" && i.type.startsWith("image/")).map((i) => i.getAsFile()).filter((f): f is File => !!f);
}

export async function subirImagemChat(arquivo: File): Promise<string> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("sem login");
  const ext = (arquivo.type.split("/")[1] || "png").replace("jpeg", "jpg").replace(/[^a-z0-9]/g, "") || "png";
  const caminho = `chat/${u.user.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("entregas").upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });
  if (error) throw error;
  return supabase.storage.from("entregas").getPublicUrl(caminho).data.publicUrl;
}
