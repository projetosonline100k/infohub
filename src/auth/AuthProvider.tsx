import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session);
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) setSession(nextSession);
    });

    // Duas janelas do app desktop (principal + Jarvis, ver
    // src/pages/JarvisWindow.tsx) são dois runtimes JS separados que só
    // compartilham a mesma origem/localStorage — o evento nativo "storage"
    // dispara nas OUTRAS janelas quando uma delas loga/desloga, então a
    // gente reconsulta a sessão em vez de esperar um evento que nunca
    // chega sozinho. Também é grátis pra multi-aba na web.
    const onStorage = (e: StorageEvent) => {
      if (e.key && !e.key.includes("supabase") && !e.key.startsWith("sb-")) return;
      supabase.auth.getSession().then(({ data }) => {
        if (mounted) setSession(data.session);
      });
    };
    window.addEventListener("storage", onStorage);

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const value = useMemo(
    () => ({ session, user: session?.user ?? null, loading, signOut: () => supabase.auth.signOut() }),
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return context;
}
