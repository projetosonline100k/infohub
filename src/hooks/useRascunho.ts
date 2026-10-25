import { useCallback, useEffect, useRef, useState } from "react";

// Rascunho de chat (25/10, Davi): o que ele começou a escrever continua lá mesmo fechando a conversa,
// trocando de guia ou reabrindo o app. Fica salvo neste Mac/navegador, por conversa (chave), e some ao enviar.
export function useRascunho(chave: string) {
  const ler = (c: string) => { try { return localStorage.getItem(`rascunho:${c}`) ?? ""; } catch { return ""; } };
  const [texto, setTextoEstado] = useState(() => ler(chave));
  const chaveRef = useRef(chave);
  // Trocou de conversa sem desmontar: mostra o rascunho da nova.
  useEffect(() => {
    if (chaveRef.current === chave) return;
    chaveRef.current = chave;
    setTextoEstado(ler(chave));
  }, [chave]);
  const setTexto = useCallback((valor: string) => {
    setTextoEstado(valor);
    try {
      if (valor.trim()) localStorage.setItem(`rascunho:${chaveRef.current}`, valor);
      else localStorage.removeItem(`rascunho:${chaveRef.current}`);
    } catch { /* sem armazenamento */ }
  }, []);
  return [texto, setTexto] as const;
}
