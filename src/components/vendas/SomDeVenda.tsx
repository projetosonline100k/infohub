import { useEffect } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { playVendaSound } from "@/lib/assistant/sound";

// Som de venda (20/11/2026, Davi: "como fez essa venda, preciso que saia um som no sistema também" e "de vendas, inclusive essa").
// Em qualquer tela do app: venda nova (Eduzz, Kiwify, Hotmart) toca a "caixa registradora" e mostra o aviso com o valor.
// Chega na hora pelo realtime; ao abrir o app, as vendas de hoje que ainda não tocaram neste aparelho tocam uma vez (por isso a de hoje também).
const db = supabase as unknown as SupabaseClient;
const CHAVE = "infopro:venda-ouvida-ate";
interface Venda { id: string; tipo: string; valor: number | null; produto_plataforma: string | null; plataforma: string; recebido_em: string }

const reais = (v: number | null) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const inicioDoDiaBrasilia = () => `${new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)}T03:00:00Z`;

function lerMarca(): string {
  try { return localStorage.getItem(CHAVE) || inicioDoDiaBrasilia(); } catch { return inicioDoDiaBrasilia(); }
}
function gravarMarca(iso: string) {
  try { if (iso > (localStorage.getItem(CHAVE) ?? "")) localStorage.setItem(CHAVE, iso); } catch { /* sem armazenamento: só não lembra */ }
}

function avisar(v: Venda) {
  playVendaSound();
  toast.success(`Venda! ${reais(v.valor)}`, { description: `${v.produto_plataforma ?? "Produto"} · ${v.plataforma}`, duration: 10_000 });
  gravarMarca(v.recebido_em);
}

export function SomDeVenda() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return;
    let vivo = true;
    const tocadas = new Set<string>();
    const tocar = (v: Venda) => { if (v.tipo !== "venda" || tocadas.has(v.id)) return; tocadas.add(v.id); avisar(v); };
    // As que chegaram com o app fechado (desde a última ouvida; na primeira vez, desde o começo do dia): uma de cada vez, sem atropelar o som.
    void db.from("vendas_plataforma_eventos").select("id, tipo, valor, produto_plataforma, plataforma, recebido_em")
      .eq("tipo", "venda").gt("recebido_em", lerMarca()).order("recebido_em").limit(5)
      .then(({ data }) => { ((data ?? []) as Venda[]).forEach((v, i) => window.setTimeout(() => { if (vivo) tocar(v); }, 1500 + i * 1800)); });
    const canal = supabase.channel(`som-de-venda-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "vendas_plataforma_eventos" }, (ev) => tocar(ev.new as Venda))
      .subscribe();
    return () => { vivo = false; void supabase.removeChannel(canal); };
  }, [user]);
  return null;
}
