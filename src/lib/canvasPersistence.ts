export const CANVAS_PREFIX = "__CANVASMENTAL_V1__";
export interface CanvasElement {
  id: string;
  version: number;
  versionNonce: number;
  isDeleted?: boolean;
  index?: string | null;
  [key: string]: unknown;
}
interface CanvasDocument {
  kind: string;
  version: number;
  elements: CanvasElement[];
  files: Record<string, unknown>;
  appState: Record<string, unknown>;
}
export function parseCanvas(content: string): CanvasDocument {
  if (!content.startsWith(CANVAS_PREFIX)) throw new Error("Formato de lousa inválido");
  const doc = JSON.parse(content.slice(CANVAS_PREFIX.length));
  if (!Array.isArray(doc.elements) || !doc.files || !doc.appState) throw new Error("Lousa incompleta");
  return doc;
}

// Mesma regra determinística do Excalidraw: maior versão; no empate,
// menor versionNonce. Ausência não significa exclusão: preservamos tombstones.
export function mergeCanvas(local: string, remote: string | null): string {
  const a = parseCanvas(local);
  if (remote === null) return local;
  const b = parseCanvas(remote);
  const elements = new Map(b.elements.map(element => [element.id, element]));
  for (const element of a.elements) {
    const other = elements.get(element.id);
    if (!other || element.version > other.version ||
      (element.version === other.version && element.versionNonce < other.versionNonce)) elements.set(element.id, element);
  }
  const merged = [...elements.values()].sort((x, y) => {
    const left = x.index || x.id;
    const right = y.index || y.id;
    return left < right ? -1 : left > right ? 1 : x.id.localeCompare(y.id);
  });
  return CANVAS_PREFIX + JSON.stringify({ ...a, elements: merged, files: { ...b.files, ...a.files } });
}

interface Store {
  read: () => Promise<{ conteudo: string | null; updated_at: string }>;
  compareAndSwap: (version: string, content: string) => Promise<boolean>;
}
export async function saveCanvasSafely(local: string, store: Store): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const current = await store.read();
    const merged = mergeCanvas(local, current.conteudo);
    if (merged === current.conteudo || await store.compareAndSwap(current.updated_at, merged)) return merged;
  }
  throw new Error("A lousa está recebendo muitas alterações. Tentaremos salvar novamente.");
}
