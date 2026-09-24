import { useEffect } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Assistant } from "@/components/assistant/Assistant";

// O body/html do app usa bg-background globalmente (ver src/index.css) —
// isso escondia o desktop atrás de um retângulo opaco na janela `jarvis`.
// Aplicado de forma SÍNCRONA aqui (fora de useEffect, direto na avaliação
// do módulo) pra já estar presente antes do primeiro paint — um
// useEffect rodaria só depois do commit, deixando um frame de flash opaco
// (rodada 4, item 1). Só afeta esta rota (JarvisWindow é a única coisa que
// a janela `jarvis` carrega); a classe nunca chega na janela principal/web.
document.documentElement.classList.add("jarvis-window");

// Página carregada pela janela nativa `jarvis` (ver
// src-tauri/tauri.conf.json — transparente/sem bordas/always-on-top). Só a
// orbe/painel do Assistant, nada de DashboardLayout. Mesma sessão Supabase
// da janela principal (mesma origem → mesmo localStorage — ver o listener
// de "storage" em src/auth/AuthProvider.tsx que resincroniza quando o
// login acontece na outra janela). Sem sessão ainda, fica vazia em vez de
// redirecionar pra /login dentro de uma janela de 80x80.
export default function JarvisWindow() {
  const { session, loading } = useAuth();

  useEffect(() => {
    return () => {
      document.documentElement.classList.remove("jarvis-window");
    };
  }, []);

  if (loading || !session) return null;

  return <Assistant variant="window" />;
}
