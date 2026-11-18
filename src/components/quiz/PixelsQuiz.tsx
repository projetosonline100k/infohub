import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { erroDoId, limparPixels, type PixelsQuiz as Pixels } from "@/lib/quiz/pixels";

const db = supabase as unknown as SupabaseClient;

// Pixels do quiz (18/11): ids da Meta, do TikTok e do Google. Valem para o link do quiz e para as versões (V2…) que não tiverem os próprios.
const CAMPOS: { k: keyof Pixels; nome: string; dica: string; exemplo: string }[] = [
  { k: "meta", nome: "Pixel da Meta (Facebook/Instagram)", dica: "Gerenciador de Eventos → seu pixel → ID (só números)", exemplo: "123456789012345" },
  { k: "tiktok", nome: "Pixel do TikTok", dica: "TikTok Ads → Eventos → Web → ID do pixel", exemplo: "CABC1234DEFG5678" },
  { k: "ga4", nome: "Google Analytics 4", dica: "GA4 → Admin → Fluxos de dados → ID da métrica", exemplo: "G-ABCD123456" },
  { k: "google_ads", nome: "Google Ads (tag de conversão)", dica: "Google Ads → Metas → Tag → ID da conversão", exemplo: "AW-123456789" },
  { k: "gtm", nome: "Google Tag Manager", dica: "Só se você prefere montar tudo no GTM (recebe os mesmos eventos)", exemplo: "GTM-ABC1234" },
];

const EVENTOS: [string, string][] = [
  ["Entrou no quiz", "PageView"],
  ["Avançou de tela", "QuizPasso (Meta) · ViewContent (TikTok) · quiz_passo (Google)"],
  ["Deixou o contato", "Lead · SubmitForm · generate_lead"],
  ["Terminou o quiz", "CompleteRegistration · CompleteRegistration · quiz_concluido"],
  ["Clicou no botão de compra", "InitiateCheckout · InitiateCheckout · begin_checkout"],
];

export function PixelsQuiz({ quizId }: { quizId: string }) {
  const [v, setV] = useState<Record<string, string>>({});
  const [carregou, setCarregou] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const campo = "w-full rounded-lg border border-white/10 bg-[#0a1520] px-3 py-1.5 font-mono text-sm text-white outline-none focus:border-cyan-400/50";
  useEffect(() => {
    void db.from("quizzes").select("pixels").eq("id", quizId).maybeSingle().then(({ data }) => {
      setV(limparPixels((data as { pixels: unknown } | null)?.pixels) as Record<string, string>);
      setCarregou(true);
    });
  }, [quizId]);
  const invalidos = CAMPOS.filter((c) => erroDoId(c.k, v[c.k] ?? ""));
  const salvar = async () => {
    if (invalidos.length) { toast.error(`Confira o id: ${invalidos.map((c) => c.nome).join(", ")}`); return; }
    setSalvando(true);
    const limpo = limparPixels(v);
    const { error } = await db.from("quizzes").update({ pixels: Object.keys(limpo).length ? limpo : null }).eq("id", quizId);
    setSalvando(false);
    if (error) { toast.error("Não consegui salvar os pixels"); return; }
    setV(limpo as Record<string, string>);
    toast.success("Pixels salvos. Já valem no link do quiz (não precisa publicar de novo).");
  };
  return (
    <section className={cn("space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4")}>
      <div><h3 className="text-lg font-bold text-white">Pixels e rastreamento</h3>
        <p className="text-xs text-white/55">Cole só o ID de cada pixel (não o código inteiro). Eles disparam sozinhos no link público do quiz, nunca na prévia nem nos seus testes. Vale também para as versões V2… sem pixel próprio.</p></div>
      <div className="grid gap-3 md:grid-cols-2">
        {CAMPOS.map((c) => {
          const erro = erroDoId(c.k, v[c.k] ?? "");
          return (
            <label key={c.k} className="space-y-1">
              <span className="text-xs font-medium text-white/70">{c.nome}</span>
              <input value={v[c.k] ?? ""} onChange={(e) => setV({ ...v, [c.k]: e.target.value })} placeholder={c.exemplo} disabled={!carregou} className={cn(campo, erro && "border-rose-400/60")} />
              <span className={cn("block text-[11px]", erro ? "text-rose-300" : "text-white/40")}>{erro ?? c.dica}</span>
            </label>
          );
        })}
      </div>
      <div className="rounded-xl bg-black/30 p-3 text-xs text-white/70">
        <p className="mb-1 font-semibold text-white/85">O que é marcado (Meta · TikTok · Google)</p>
        <ul className="space-y-0.5">{EVENTOS.map(([a, b]) => <li key={a}><b className="text-white/85">{a}:</b> {b}</li>)}</ul>
        <p className="mt-2 text-white/50">Para conferir, abra o link do quiz com a extensão Meta Pixel Helper (ou TikTok Pixel Helper) e passe pelas telas. O número da tela vai junto em cada avanço.</p>
      </div>
      <button type="button" disabled={salvando || !carregou} onClick={() => void salvar()} className="rounded-lg bg-cyan-500 px-4 py-1.5 text-sm font-semibold text-black disabled:opacity-40">{salvando ? "Salvando…" : "Salvar pixels"}</button>
    </section>
  );
}
