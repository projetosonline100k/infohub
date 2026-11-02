import { useEffect, useState } from "react";

// Prévia rápida no editor (01/11, Davi: "o preview do Instalivros está bem lento"): o Danilo roda no servidor e cada
// salto do player pedia um pedaço do vídeo pela internet (120 ms de ida e volta). O arquivo leve (540p) vem inteiro
// para a memória logo ao abrir, em poucos segundos; aí tocar e pular é instantâneo. Até chegar, toca pelo servidor
// (a troca volta ao mesmo ponto: onLoadedMetadata do player).
const MAX = 4;   // uns 100 MB no máximo
const prontos = new Map<string, string>();
const baixando = new Map<string, Promise<string | null>>();

function baixar(src: string): Promise<string | null> {
  const ja = prontos.get(src);
  if (ja) return Promise.resolve(ja);
  const emCurso = baixando.get(src);
  if (emCurso) return emCurso;
  const p = fetch(src)
    .then((r) => (r.ok ? r.blob() : null))
    .then((blob) => {
      if (!blob) return null;
      const url = URL.createObjectURL(blob);
      prontos.set(src, url);
      while (prontos.size > MAX) {
        const [velho, urlVelha] = prontos.entries().next().value as [string, string];
        prontos.delete(velho);
        URL.revokeObjectURL(urlVelha);
      }
      return url;
    })
    .catch(() => null)
    .finally(() => { baixando.delete(src); });
  baixando.set(src, p);
  return p;
}

/** Devolve a cópia local de `src` quando ela chegar; até lá, o próprio `src`. `ligado`: só para os arquivos leves. */
export function useVideoNoMac(src: string, ligado: boolean): string {
  const [local, setLocal] = useState<{ src: string; url: string } | null>(null);
  useEffect(() => {
    if (!ligado || !src) return;
    let vivo = true;
    void baixar(src).then((url) => { if (vivo && url) setLocal({ src, url }); });
    return () => { vivo = false; };
  }, [src, ligado]);
  if (!ligado) return src;
  return (local?.src === src ? local.url : prontos.get(src)) ?? src;
}
