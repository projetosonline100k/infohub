import { useCallback, useEffect, useState } from "react";
import { carregarSemana, type Semana } from "@/lib/empresa/semana";

// Dados da TV do escritório (semana + resultado), recarregados a cada minuto.
export function useSemanaEquipe(clienteId: string) {
  const [semana, setSemana] = useState<Semana | null>(null);
  const recarregar = useCallback(async () => {
    try { setSemana(await carregarSemana(clienteId)); } catch { /* tenta de novo no próximo ciclo */ }
  }, [clienteId]);
  useEffect(() => {
    void recarregar();
    const t = window.setInterval(() => void recarregar(), 60_000);
    return () => window.clearInterval(t);
  }, [recarregar]);
  return { semana, recarregar };
}
