import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_MAX = 25;

function chaveArmazenamento(chave: string) {
  return `infopro:historico:${chave}`;
}

function lerHistorico<T>(chave: string): { undo: T[]; redo: T[] } {
  try {
    const raw = window.localStorage.getItem(chaveArmazenamento(chave));
    if (!raw) return { undo: [], redo: [] };
    const parsed = JSON.parse(raw) as { undo?: T[]; redo?: T[] };
    return { undo: Array.isArray(parsed.undo) ? parsed.undo : [], redo: Array.isArray(parsed.redo) ? parsed.redo : [] };
  } catch {
    return { undo: [], redo: [] };
  }
}

function gravarHistorico<T>(chave: string, undo: T[], redo: T[]) {
  try {
    window.localStorage.setItem(chaveArmazenamento(chave), JSON.stringify({ undo, redo }));
  } catch {
    // Provavelmente estourou a cota do navegador (ex.: cadernos com muitas
    // imagens em base64) — nesse caso o histórico persistido simplesmente
    // não atualiza, mas desfazer/refazer na aba atual continua funcionando.
  }
}

// Pilha de desfazer/refazer guardada no localStorage, então sobrevive a sair
// da página e voltar (mesmo navegador/computador). "chave" identifica o
// documento — troque-a quando o documento mudar pra não misturar históricos
// de dois documentos diferentes.
export function usePersistentHistory<T>(chave: string | null, max: number = DEFAULT_MAX) {
  const undoRef = useRef<T[]>([]);
  const redoRef = useRef<T[]>([]);
  const chaveRef = useRef(chave);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    chaveRef.current = chave;
    if (!chave) {
      undoRef.current = [];
      redoRef.current = [];
    } else {
      const { undo, redo } = lerHistorico<T>(chave);
      undoRef.current = undo;
      redoRef.current = redo;
    }
    setVersao((v) => v + 1);
  }, [chave]);

  const persistir = useCallback(() => {
    if (chaveRef.current) gravarHistorico(chaveRef.current, undoRef.current, redoRef.current);
    setVersao((v) => v + 1);
  }, []);

  // Chame antes de aplicar uma mudança nova de verdade (nunca dentro de um
  // desfazer/refazer) — guarda o estado anterior pra dar pra voltar depois.
  const registrar = useCallback((estadoAnterior: T) => {
    undoRef.current = [...undoRef.current.slice(-(max - 1)), estadoAnterior];
    redoRef.current = [];
    persistir();
  }, [max, persistir]);

  const desfazer = useCallback((estadoAtual: T): T | undefined => {
    if (undoRef.current.length === 0) return undefined;
    const anterior = undoRef.current[undoRef.current.length - 1];
    undoRef.current = undoRef.current.slice(0, -1);
    redoRef.current = [...redoRef.current, estadoAtual].slice(-max);
    persistir();
    return anterior;
  }, [max, persistir]);

  const refazer = useCallback((estadoAtual: T): T | undefined => {
    if (redoRef.current.length === 0) return undefined;
    const proximo = redoRef.current[redoRef.current.length - 1];
    redoRef.current = redoRef.current.slice(0, -1);
    undoRef.current = [...undoRef.current, estadoAtual].slice(-max);
    persistir();
    return proximo;
  }, [max, persistir]);

  return useMemo(() => ({
    registrar,
    desfazer,
    refazer,
    podeDesfazer: undoRef.current.length > 0,
    podeRefazer: redoRef.current.length > 0,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [registrar, desfazer, refazer, versao]);
}
