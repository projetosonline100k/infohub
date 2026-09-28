import { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";

export function useIdentidadeResponsavel() {
  const { user } = useAuth();
  const [nomes, setNomes] = useState<string[]>([]);

  useEffect(() => {
    let ativo = true;
    if (!user) { setNomes([]); return; }
    const metadata = user.user_metadata || {};
    const nomesMetadata = [metadata.nome, metadata.full_name, metadata.name]
      .filter((nome): nome is string => typeof nome === "string" && !!nome.trim());
    supabase.from("equipe_cliente").select("nome_pessoa, email").then(({ data }) => {
      if (!ativo) return;
      const nomesEquipe = (data || [])
        .filter((p) => p.email?.trim().toLowerCase() === user.email?.trim().toLowerCase())
        .map((p) => p.nome_pessoa);
      setNomes(Array.from(new Set([...nomesMetadata, ...nomesEquipe])));
    });
    return () => { ativo = false; };
  }, [user]);

  return nomes;
}
