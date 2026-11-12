import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Check, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { codigoCurto } from "@/lib/quiz/utm";

// Renomear o link curto (12/11/2026, Davi: "quero conseguir renomear o link"): troca o <código> de infopro-hub.vercel.app/r/<código>.
// Cliques, destino e o afiliado/UTM do link ficam; o código antigo deixa de funcionar (quem já recebeu o link antigo precisa do novo).
const db = supabase as unknown as SupabaseClient;

export function RenomearLink({ codigo, base, onRenomeado }: { codigo: string; base: string; onRenomeado: (novo: string) => void }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(codigo);
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    const novo = codigoCurto(valor);
    if (!novo) { toast.error("Use de 3 a 40 letras, números ou hífen."); return; }
    if (novo === codigo) { setEditando(false); return; }
    setSalvando(true);
    const { error } = await db.from("links_curtos").update({ codigo: novo }).eq("codigo", codigo);
    setSalvando(false);
    if (error) { toast.error(/duplicate|unique|23505/i.test(`${error.message} ${error.code}`) ? "Esse nome já está em uso. Escolha outro." : "Não consegui renomear"); return; }
    setEditando(false);
    toast.success("Link renomeado. O endereço antigo deixou de funcionar.");
    onRenomeado(novo);
  };

  if (!editando) return <button type="button" onClick={() => { setValor(codigo); setEditando(true); }} title="Renomear o link" className="rounded-lg border border-white/10 p-1.5 text-white/60 hover:bg-white/5 hover:text-white"><Pencil className="h-3.5 w-3.5" /></button>;
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-white/50">{base}/r/</span>
      <input autoFocus value={valor} onChange={(e) => setValor(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void salvar(); if (e.key === "Escape") setEditando(false); }}
        className="w-40 rounded-lg border border-cyan-400/50 bg-[#0a1520] px-2 py-1 text-sm text-white outline-none" />
      <button type="button" disabled={salvando} onClick={() => void salvar()} title="Salvar" className="rounded-lg bg-cyan-500 p-1.5 text-black"><Check className="h-3.5 w-3.5" /></button>
      <button type="button" onClick={() => setEditando(false)} title="Cancelar" className="rounded-lg border border-white/10 p-1.5 text-white/60"><X className="h-3.5 w-3.5" /></button>
      <span className="w-full text-[11px] text-white/40">O endereço antigo deixa de funcionar: quem já recebeu precisa do novo.</span>
    </span>
  );
}
