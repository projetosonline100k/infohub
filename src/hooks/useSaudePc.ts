import { useEffect, useRef, useState } from "react";
import { avaliarSaude, suavizarNivel, type Aviso, type Nivel } from "@/lib/saudePc";
import type { SaudePc } from "@/lib/saudePc";

// Saúde do Mac para a orbe do Atlas (12/11/2026): a cada 20 s lê memória, processador, disco, bateria e temperatura (comando `saude_pc` do
// app, só no Mac) e devolve o nível mostrado (ok / atenção / crítico) com os avisos. O nível só muda depois de duas leituras seguidas iguais,
// para a cor não piscar com um pico passageiro.
export function useSaudePc(ativo: boolean) {
  const [estado, setEstado] = useState<{ nivel: Nivel; avisos: Aviso[] }>({ nivel: "ok", avisos: [] });
  const mostrado = useRef<Nivel>("ok");
  const pendente = useRef<Nivel | null>(null);
  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    const ler = async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const amostra = await invoke<SaudePc>("saude_pc");
        const a = avaliarSaude(amostra);
        const r = suavizarNivel(mostrado.current, a.nivel, pendente.current);
        mostrado.current = r.mostrar;
        pendente.current = r.pendente;
        if (vivo) setEstado({ nivel: r.mostrar, avisos: r.mostrar === "ok" ? [] : a.avisos });
      } catch { /* sem o comando (web ou outro sistema): fica em "ok" */ }
    };
    void ler();
    const t = window.setInterval(() => void ler(), 20_000);
    return () => { vivo = false; window.clearInterval(t); };
  }, [ativo]);
  return estado;
}
