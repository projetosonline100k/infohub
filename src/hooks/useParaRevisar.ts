import { useCallback, useEffect, useRef, useState } from "react";
import { buscarAvisos, type Aviso } from "@/lib/empresa/notificacoes";

// "Sempre que alguém da equipe aprontar algo que eu tenha que revisar, quero
// que chegue uma notificação, pode vir até pelo Atlas" (Davi, 16/10/2026).
// A orbe olha a cada 30 s o que ficou esperando o Davi (entrega pra aprovar,
// versão do Danilo, carrossel do Roy, reel pra escolher data, briefing ou
// pendência do Pedro) e mostra um de cada vez, com "Revisar agora".
const CHAVE_DESDE = "atlas-revisar-desde";
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
      const revisar = novos.filter((a) => a.revisar);
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

  const dispensar = useCallback(() => setFila((xs) => xs.slice(1)), []);
  const dispensarTodos = useCallback(() => setFila([]), []);

  return { atual: fila[0] ?? null, restantes: Math.max(0, fila.length - 1), dispensar, dispensarTodos };
}
