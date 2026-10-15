// Conexão oscilando (15/10: depois de reiniciar o Mac, as telas abriam vazias
// com "Erro ao carregar…"): leitura que falha por rede tenta de novo sozinha
// antes de dar erro. Só GET/HEAD — repetir uma escrita poderia gravar em dobro.
const ESPERAS_MS = [400, 1200, 3000];

export const fetchComRetentativa: typeof fetch = async (entrada, init) => {
  const metodo = (init?.method ?? (entrada instanceof Request ? entrada.method : "GET")).toUpperCase();
  const podeRepetir = metodo === "GET" || metodo === "HEAD";
  for (let tentativa = 0; ; tentativa++) {
    try {
      return await fetch(entrada, init);
    } catch (erro) {
      const abortado = erro instanceof DOMException && erro.name === "AbortError";
      if (!podeRepetir || abortado || tentativa >= ESPERAS_MS.length) throw erro;
      await new Promise((r) => setTimeout(r, ESPERAS_MS[tentativa]));
    }
  }
};
