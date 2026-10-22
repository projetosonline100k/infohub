import { isDesktop } from "@/lib/platform";

// Soltar print no chat dentro do app do Mac (22/10). A página não consegue ler o print arrastado (vem de
// uma pasta temporária do macOS e chegava vazio, "No content provided"), então quem recebe o arrasto é
// a janela do app: ela diz onde o arquivo foi solto e o app lê os bytes (ler_imagem_solta). O chat que
// estiver embaixo do mouse recebe as imagens.
interface Recebedor { el: HTMLElement; sobre: (s: boolean) => void; soltar: (arquivos: File[]) => void }
const recebedores = new Set<Recebedor>();
let ligado = false;

const IMAGEM = /\.(png|jpe?g|webp|gif|tiff?|heic|bmp)$/i;
const tipoDe = (nome: string) => {
  const ext = nome.split(".").pop()?.toLowerCase() ?? "";
  return ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", tif: "image/tiff", tiff: "image/tiff", heic: "image/heic", bmp: "image/bmp" } as Record<string, string>)[ext] ?? "";
};

async function ligar() {
  if (ligado || !isDesktop()) return;
  ligado = true;
  const [{ getCurrentWebview }, { invoke }] = await Promise.all([import("@tauri-apps/api/webview"), import("@tauri-apps/api/core")]);
  const sob = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y);
    return el ? [...recebedores].find((r) => r.el.contains(el)) : undefined;
  };
  await getCurrentWebview().onDragDropEvent(async ({ payload: p }) => {
    if (p.type === "leave") { recebedores.forEach((r) => r.sobre(false)); return; }
    const k = window.devicePixelRatio || 1;
    const alvo = sob(p.position.x / k, p.position.y / k);
    recebedores.forEach((r) => r.sobre(r === alvo && p.type !== "drop"));
    if (p.type !== "drop" || !alvo) return;
    const caminhos = p.paths.filter((c) => IMAGEM.test(c));
    if (!caminhos.length) return;
    const arquivos = await Promise.all(caminhos.map(async (caminho) => {
      const bytes = await invoke<ArrayBuffer>("ler_imagem_solta", { caminho });
      const nome = caminho.split("/").pop() ?? "imagem.png";
      return new File([bytes], nome, { type: tipoDe(nome) });
    }));
    alvo.soltar(arquivos);
  });
}

/** Faz `el` receber prints soltos no app do Mac. Devolve a função que desliga. */
export function receberImagensSoltas(el: HTMLElement, sobre: (s: boolean) => void, soltar: (arquivos: File[]) => void): () => void {
  if (!isDesktop()) return () => {};
  const r = { el, sobre, soltar };
  recebedores.add(r);
  void ligar();
  return () => { recebedores.delete(r); };
}
