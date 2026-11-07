import { useEffect, useState } from "react";
import { format, subDays } from "date-fns";
import { CalendarDays, Target, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Meta atual com medidor (07/11/2026, Davi: "deixar essa área parecida com a imagem que gerei").
// A meta do projeto é um texto livre ("100k", "R$ 50.000", "1,5M"): lemos como valor em reais e comparamos com o
// que entrou nos últimos 30 dias (faturamento diário dos produtos do projeto: lançado à mão + automático).
// Se o texto não for um valor, mostra só o texto, como antes.

/** "100k" → 100000; "R$ 50.000" → 50000; "1,5M" → 1500000; texto sem número → null. */
export function lerMeta(texto: string | null | undefined): number | null {
  if (!texto) return null;
  const m = texto.toLowerCase().replace(/r\$\s*/g, "").match(/(\d[\d.,]*)\s*(mil|k|mi|milh[õo]es|milh[ãa]o|m)?/);
  if (!m) return null;
  let n = m[1];
  // "50.000" (milhar) × "1,5" (decimal) × "1.5" (decimal em inglês)
  if (n.includes(",")) n = n.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(n)) n = n.replace(/\./g, "");   // 50.000 / 1.250.000: milhar
  // senão fica como está: "1.5" é decimal
  const base = Number(n);
  if (!Number.isFinite(base) || base <= 0) return null;
  const sufixo = m[2];
  const mult = !sufixo ? 1 : /^(mil|k)$/.test(sufixo) ? 1000 : 1_000_000;
  return base * mult;
}

const moeda = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
const numero = (v: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(v);

export function MetaAtual({ clienteId, meta }: { clienteId: string; meta: string | null | undefined }) {
  const alvo = lerMeta(meta);
  const [atual, setAtual] = useState<number | null>(null);

  useEffect(() => {
    if (!alvo) return;
    let vivo = true;
    void (async () => {
      const { data: ps } = await supabase.from("produtos_cliente").select("id").eq("cliente_id", clienteId);
      const ids = (ps ?? []).map((p) => p.id);
      if (!ids.length) { if (vivo) setAtual(0); return; }
      const desde = format(subDays(new Date(), 29), "yyyy-MM-dd");
      const { data } = await supabase.from("produto_financeiro_diario").select("receita").in("produto_id", ids).gte("data", desde);
      if (vivo) setAtual((data ?? []).reduce((s, d) => s + Number(d.receita ?? 0), 0));
    })();
    return () => { vivo = false; };
  }, [clienteId, alvo]);

  const pct = alvo && atual != null ? Math.min(100, (atual / alvo) * 100) : 0;
  // Medidor em meia-lua: raio 90, de 180° a 0°.
  const R = 90, C = Math.PI * R;
  return (
    <div className="painel-suave">
      <div className="rounded-2xl border bg-card p-5">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary"><Target className="h-4 w-4" /></span>
          <h2 className="text-lg font-bold">Meta atual</h2>
          {meta && <span className="ml-auto rounded-lg bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">{meta}</span>}
        </div>
        {!alvo ? (
          <p className="mt-4 text-muted-foreground">{meta || "Nenhuma meta definida"}</p>
        ) : (
          <div className="mt-3 grid items-center gap-4 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <div className="relative mx-auto w-full max-w-[260px]">
              <svg viewBox="0 0 220 125" className="w-full">
                <defs>
                  <linearGradient id="meta-grad" x1="0" x2="1"><stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity=".55" /><stop offset="100%" stopColor="hsl(var(--primary))" /></linearGradient>
                </defs>
                <path d={`M20 110 A${R} ${R} 0 0 1 200 110`} fill="none" stroke="hsl(var(--muted))" strokeWidth="16" strokeLinecap="round" />
                <path d={`M20 110 A${R} ${R} 0 0 1 200 110`} fill="none" stroke="url(#meta-grad)" strokeWidth="16" strokeLinecap="round"
                  strokeDasharray={`${(pct / 100) * C} ${C}`} style={{ transition: "stroke-dasharray .8s ease" }} />
              </svg>
              <div className="absolute inset-x-0 bottom-1 text-center">
                <p className="text-4xl font-bold leading-none tabular-nums">{Math.round(pct)}%</p>
                <p className="mt-1 text-xs text-muted-foreground">{numero(atual ?? 0)} / {numero(alvo)}</p>
              </div>
              <span className="absolute -bottom-1 left-2 text-[10px] text-muted-foreground">0</span>
              <span className="absolute -bottom-1 right-2 text-[10px] text-muted-foreground">{alvo >= 1000 ? `${numero(alvo / 1000)}k` : numero(alvo)}</span>
            </div>
            <div className="space-y-3 sm:border-l sm:pl-5">
              <div className="flex items-start gap-2">
                <TrendingUp className="mt-0.5 h-4 w-4 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">{pct >= 100 ? "Meta batida" : "Faltam"}</p>
                  <p className="text-2xl font-bold tabular-nums">{pct >= 100 ? "🎉" : moeda(Math.max(0, alvo - (atual ?? 0)))}</p>
                  {pct < 100 && <p className="text-xs text-muted-foreground">para atingir a meta</p>}
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-xl border bg-background/60 px-3 py-2 text-xs font-medium">
                <CalendarDays className="h-3.5 w-3.5 text-primary" />{Math.round(pct)}% da meta em 30 dias
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
