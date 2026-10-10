import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_MAX = 25;
const PREFIXO = "infopro:historico:";

// O localStorage tem ~5 MB pro app inteiro. Um mapa mental com 15 passos de
// desfazer chegou a ocupar 4 MB e lotou tudo: aí nada mais salvava (voz do
// Jarvis, alfinete, tamanho do painel…). Limites: por documento e no total
// dos históricos; o que passa é descartado do mais antigo pro mais novo.
const MAX_POR_HISTORICO = 400_000;
const MAX_TOTAL_HISTORICOS = 1_500_000;

function chaveArmazenamento(chave: string) {
  return `${PREFIXO}${chave}`;
}

function historicosGuardados() {
  const lista: { chave: string; tamanho: number; em: number }[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const chave = window.localStorage.key(i);
    if (!chave?.startsWith(PREFIXO)) continue;
    const raw = window.localStorage.getItem(chave) || "";
    let em = 0;
    try { em = Number(JSON.parse(raw).em) || 0; } catch { /* corrompido: sai primeiro */ }
    lista.push({ chave, tamanho: raw.length, em });
  }
  return lista;
}

// Apaga históricos (do mais antigo pro mais novo) até caberem no limite.
// `preservar`: chave que não pode sair (a do documento aberto agora).
export function liberarEspacoHistoricos(limite = MAX_TOTAL_HISTORICOS, preservar?: string) {
  try {
    const lista = historicosGuardados().sort((a, b) => a.em - b.em);
    let total = lista.reduce((t, h) => t + h.tamanho, 0);
    for (const h of lista) {
      if (total <= limite) break;
      if (h.chave === preservar) continue;
      window.localStorage.removeItem(h.chave);
      total -= h.tamanho;
    }
  } catch { /* sem storage */ }
}

// Ao carregar o app: corta o que já passou dos limites (inclusive históricos
// gravados antes desta regra, que nem tinham data).
try {
  for (const h of historicosGuardados()) if (h.tamanho > MAX_POR_HISTORICO) window.localStorage.removeItem(h.chave);
  liberarEspacoHistoricos();
} catch { /* sem storage */ }

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
  const nome = chaveArmazenamento(chave);
  // Descarta os passos mais antigos até caber no limite por documento. Se
  // nem um passo cabe (documento enorme), não persiste: desfazer/refazer
  // continua funcionando na aba atual, só não sobrevive a sair da página.
  let u = undo;
  let r = redo;
  let json = JSON.stringify({ undo: u, redo: r, em: Date.now() });
  while (json.length > MAX_POR_HISTORICO && (u.length || r.length)) {
    if (u.length) u = u.slice(1); else r = r.slice(1);
    json = JSON.stringify({ undo: u, redo: r, em: Date.now() });
  }
  try {
    if (!u.length && !r.length) { window.localStorage.removeItem(nome); return; }
    window.localStorage.setItem(nome, json);
    liberarEspacoHistoricos(MAX_TOTAL_HISTORICOS, nome);
  } catch {
    // Cota estourada mesmo assim: libera os outros históricos e tenta uma vez.
    liberarEspacoHistoricos(0, nome);
    try { window.localStorage.setItem(nome, json); } catch { /* segue só em memória */ }
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
