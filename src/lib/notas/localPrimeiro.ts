// Notas "como o Notas do iPhone" (20/10, Davi): abrem na hora com a cópia guardada no Mac e o que
// ele escreve fica salvo aqui na mesma hora; a nuvem (Supabase) recebe por trás. Sem internet nada
// se perde: a fila de pendentes sobe sozinha quando a conexão volta.
import { supabase } from "@/integrations/supabase/client";

export interface LinhaNota {
  id: string; titulo: string; conteudo: string | null; created_at: string; updated_at: string;
  cliente_id: string | null; fixado: boolean | null; pasta_id: string | null; deleted_at: string | null;
}

const CHAVE_CACHE = (clienteId: string) => `notas:cache:${clienteId}`;
const CHAVE_FILA = "notas:pendentes";

function ler<T>(chave: string, padrao: T): T {
  try { const v = localStorage.getItem(chave); return v ? (JSON.parse(v) as T) : padrao; } catch { return padrao; }
}
function gravar(chave: string, valor: unknown) {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* cheio ou sem storage: segue só com a nuvem */ }
}

/** Cópia do Mac das notas do projeto (só notas, não documentos grandes). */
export function notasDoCache(clienteId: string): LinhaNota[] {
  return aplicarPendentes(ler<LinhaNota[]>(CHAVE_CACHE(clienteId), []), clienteId);
}
export function guardarNoCache(clienteId: string, notas: LinhaNota[]) {
  gravar(CHAVE_CACHE(clienteId), notas);
}

type Pendente = { linha: LinhaNota; tentativas: number };
const fila = () => ler<Record<string, Pendente>>(CHAVE_FILA, {});

/** O que ainda não subiu vence o que veio da nuvem (é mais novo, foi escrito aqui). */
export function aplicarPendentes(linhas: LinhaNota[], clienteId: string): LinhaNota[] {
  const p = Object.values(fila()).map((x) => x.linha).filter((l) => l.cliente_id === clienteId);
  if (!p.length) return linhas;
  const porId = new Map(linhas.map((l) => [l.id, l]));
  for (const l of p) {
    const atual = porId.get(l.id);
    if (!atual || atual.updated_at <= l.updated_at) porId.set(l.id, l);
  }
  return [...porId.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export function temPendentes(): boolean {
  return Object.keys(fila()).length > 0;
}

/** Guarda no Mac já (cache + fila) e tenta subir. Devolve true se já está na nuvem. */
export async function salvarNota(linha: LinhaNota): Promise<boolean> {
  const f = fila();
  f[linha.id] = { linha, tentativas: (f[linha.id]?.tentativas ?? 0) };
  gravar(CHAVE_FILA, f);
  if (linha.cliente_id) {
    const cache = ler<LinhaNota[]>(CHAVE_CACHE(linha.cliente_id), []);
    gravar(CHAVE_CACHE(linha.cliente_id), [linha, ...cache.filter((n) => n.id !== linha.id)]);
  }
  return subirUma(linha.id);
}

async function subirUma(id: string): Promise<boolean> {
  const p = fila()[id];
  if (!p) return true;
  const { linha } = p;
  const { error } = await supabase.from("documentos").upsert({
    id: linha.id, cliente_id: linha.cliente_id, titulo: linha.titulo, conteudo: linha.conteudo,
    pasta_id: linha.pasta_id, fixado: linha.fixado ?? false, deleted_at: linha.deleted_at, updated_at: linha.updated_at,
  });
  const f = fila();
  if (!error) {
    // Só tira da fila se ninguém escreveu de novo enquanto subia.
    if (f[id] && f[id].linha.updated_at === linha.updated_at) { delete f[id]; gravar(CHAVE_FILA, f); }
    return true;
  }
  if (f[id]) { f[id].tentativas += 1; gravar(CHAVE_FILA, f); }
  return false;
}

let sincronizando = false;
/** Sobe tudo que ficou pendente (chamado ao abrir, quando a internet volta e a cada 20 s). */
export async function sincronizarPendentes(): Promise<number> {
  if (sincronizando) return 0;
  sincronizando = true;
  let subiram = 0;
  try {
    for (const id of Object.keys(fila())) if (await subirUma(id)) subiram++;
  } finally {
    sincronizando = false;
  }
  return subiram;
}

let ligado = false;
export function ligarSincronizacao() {
  if (ligado || typeof window === "undefined") return;
  ligado = true;
  window.addEventListener("online", () => void sincronizarPendentes());
  setInterval(() => { if (temPendentes()) void sincronizarPendentes(); }, 20_000);
  void sincronizarPendentes();
}

export function novoId(): string {
  return crypto.randomUUID();
}
