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
  const deItens = [...dados.items].filter((i) => i.kind === "file" && i.type.startsWith("image/")).map((i) => i.getAsFile()).filter((f): f is File => !!f);
  if (deItens.length) return deItens;
  // Arquivo arrastado sem tipo (acontece no app do Mac): vale pela extensão.
  return [...dados.files].filter((f) => !f.type && /\.(png|jpe?g|webp|gif|tiff?|heic|bmp)$/i.test(f.name));
}

// O print do Mac às vezes vem como TIFF (ou sem tipo) e o Storage só aceita png/jpg/webp/gif (22/10:
// "Não consegui subir a imagem"). Converte para PNG no navegador; imagem enorme é reduzida.
const ACEITOS = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_LADO = 2400;
async function paraPng(arquivo: Blob): Promise<Blob> {
  const url = URL.createObjectURL(arquivo);
  try {
    const img = new Image();
    await new Promise<void>((ok, erro) => { img.onload = () => ok(); img.onerror = () => erro(new Error("formato de imagem não reconhecido")); img.src = url; });
    const k = Math.min(1, MAX_LADO / Math.max(img.naturalWidth, img.naturalHeight));
    const tela = document.createElement("canvas");
    tela.width = Math.round(img.naturalWidth * k); tela.height = Math.round(img.naturalHeight * k);
    tela.getContext("2d")!.drawImage(img, 0, 0, tela.width, tela.height);
    return await new Promise<Blob>((ok, erro) => tela.toBlob((b) => (b ? ok(b) : erro(new Error("não deu para converter a imagem"))), "image/png"));
  } finally { URL.revokeObjectURL(url); }
}

export async function subirImagemChat(original: File): Promise<string> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("sem login");
  const precisaConverter = !ACEITOS.includes(original.type) || original.size > 8 * 1024 * 1024;
  const arquivo: Blob = precisaConverter ? await paraPng(original) : original;
  const tipo = precisaConverter ? "image/png" : original.type;
  const ext = tipo.split("/")[1].replace("jpeg", "jpg");
  const caminho = `chat/${u.user.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("entregas").upload(caminho, arquivo, { contentType: tipo, upsert: false });
  if (error) throw error;
  return supabase.storage.from("entregas").getPublicUrl(caminho).data.publicUrl;
}
