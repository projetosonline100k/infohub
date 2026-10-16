import { useCallback, useEffect, useRef, useState } from "react";
import { buscarAvisos, conversaLidaEm, type Aviso } from "@/lib/empresa/notificacoes";

// "Sempre que alguém da equipe aprontar algo que eu tenha que revisar, quero
// que chegue uma notificação, pode vir até pelo Atlas" (Davi, 16/10/2026).
// A orbe olha a cada 30 s o que ficou esperando o Davi (entrega pra aprovar,
// versão do Danilo, carrossel do Roy, reel pra escolher data, briefing ou
// pendência do Pedro) e mostra um de cada vez, com "Revisar agora".
// Também as respostas da equipe no chat ("quando retornar a mensagem no chat,
// também me avisar pelo Atlas") — menos a da conversa que o Davi já está lendo.
const CHAVE_DESDE = "atlas-revisar-desde";
// "Depois": o aviso sai do balão mas continua girando em volta da orbe (OrbitaAtlas) por 12 h.
const CHAVE_ADIADOS = "atlas-revisar-adiados";
const ADIADO_POR_MS = 12 * 3600_000;
const lerAdiados = (): Aviso[] => {
  try { return (JSON.parse(localStorage.getItem(CHAVE_ADIADOS) || "[]") as Aviso[]).filter((a) => Date.now() - new Date(a.quando).getTime() < ADIADO_POR_MS); } catch { return []; }
};
const gravarAdiados = (v: Aviso[]) => { try { localStorage.setItem(CHAVE_ADIADOS, JSON.stringify(v)); } catch { /* sem storage */ } };
/** Quem da equipe é o aviso ("Ítalo entregou…" → Ítalo; "Reel pronto… (Dalila)" → Dalila). */
export const quemDoAviso = (a: Aviso) => a.titulo.match(/\(([^)]+)\)\s*$/)?.[1] ?? a.titulo.replace(/^[^\p{L}]+/u, "").split(/\s+/)[0] ?? "Equipe";
const INTERVALO = 30_000;

const ler = (): string => {
  try { return localStorage.getItem(CHAVE_DESDE) || new Date().toISOString(); } catch { return new Date().toISOString(); }
};
const gravar = (v: string) => { try { localStorage.setItem(CHAVE_DESDE, v); } catch { /* sem storage */ } };

export function useParaRevisar(meuId: string | undefined, ativo: boolean) {
  const [fila, setFila] = useState<Aviso[]>([]);
  const desde = useRef<string>(ler());

  const buscar = useCallback(async () => {
    if (!meuId) return;
    try {
      const novos = await buscarAvisos(desde.current, meuId);
      if (!novos.length) return;
      desde.current = novos[novos.length - 1].quando;
      gravar(desde.current);
      // A janela principal marca a conversa como lida quando ela está na tela (mesmo localStorage).
      const lida = (a: Aviso) => !!a.briefingId && conversaLidaEm(a.briefingId) >= a.quando;
      const revisar = novos.filter((a) => a.revisar || (a.tipo === "resposta" && !lida(a)));
      if (revisar.length) {
        setFila((xs) => {
          const ja = new Set(xs.map((x) => x.id));
          return [...xs, ...revisar.filter((a) => !ja.has(a.id))].slice(-20);
        });
      }
    } catch { /* sem rede: tenta no próximo ciclo */ }
  }, [meuId]);

  useEffect(() => {
    if (!ativo) return;
    void buscar();
    const t = window.setInterval(() => void buscar(), INTERVALO);
    return () => window.clearInterval(t);
  }, [ativo, buscar]);

  const [adiados, setAdiados] = useState<Aviso[]>(lerAdiados);
  // "Depois": guarda na órbita; "Revisar agora" (concluir): some de vez.
  const dispensar = useCallback(() => {
    setFila((xs) => {
      const [primeiro, ...resto] = xs;
      if (primeiro) setAdiados((as) => { const n = [primeiro, ...as.filter((a) => a.id !== primeiro.id)].slice(0, 12); gravarAdiados(n); return n; });
      return resto;
    });
  }, []);
  const concluir = useCallback((id?: string) => {
    setFila((xs) => (id ? xs.filter((x) => x.id !== id) : xs.slice(1)));
    if (id) setAdiados((as) => { const n = as.filter((a) => a.id !== id); gravarAdiados(n); return n; });
  }, []);
  const dispensarTodos = useCallback(() => setFila([]), []);

  return { atual: fila[0] ?? null, restantes: Math.max(0, fila.length - 1), dispensar, concluir, dispensarTodos, adiados };
}
