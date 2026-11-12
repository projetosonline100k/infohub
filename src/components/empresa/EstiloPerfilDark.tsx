import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { confirmar } from "@/components/DialogosGlobais";
import { completudeEstilo, estiloVazio, sanitizarEstilo, type EstiloDark } from "@/lib/empresa/dashDark";
import { cn } from "@/lib/utils";

const db = supabase as unknown as SupabaseClient;

// Ficha do perfil da esteira dark (12/11/2026, Davi: "ao criar o perfil, eu consigo clicar nele e cadastrar o estilo do vídeo que vai ser").
// Salva sozinha. O estilo fica em esteira_dark_perfis.estilo: é o que o Lauro/Danilo leem para saber como é o vídeo desse perfil.
export interface PerfilDark { id: string; nome: string; arroba: string | null; cliente_id: string | null; estilo: unknown }

const CAMPOS: { chave: Exclude<keyof EstiloDark, "referencias">; rotulo: string; dica: string; linhas?: number }[] = [
  { chave: "descricao", rotulo: "A ideia do vídeo", dica: "O que é esse tipo de vídeo, em poucas palavras. Ex.: curiosidades sombrias com narração e imagens escuras.", linhas: 3 },
  { chave: "publico", rotulo: "Para quem", dica: "Quem assiste: idade, interesse, o que busca.", linhas: 2 },
  { chave: "duracao", rotulo: "Duração", dica: "Ex.: 30 a 45 segundos." },
  { chave: "gancho", rotulo: "Gancho (como abre)", dica: "Os primeiros 3 segundos: pergunta, frase forte, imagem de impacto…", linhas: 2 },
  { chave: "estrutura", rotulo: "Estrutura do roteiro", dica: "As partes, na ordem: gancho → desenvolvimento → virada → fechamento.", linhas: 4 },
  { chave: "narracao", rotulo: "Narração (voz e tom)", dica: "Voz, ritmo, tom (misterioso, calmo, firme), ritmo das frases.", linhas: 2 },
  { chave: "visual", rotulo: "Visual", dica: "Cores, fontes, tipo de imagem ou vídeo, legendas (estilo, posição), movimento.", linhas: 3 },
  { chave: "musica", rotulo: "Música e efeitos", dica: "Trilha, volume, efeitos sonoros, silêncios.", linhas: 2 },
  { chave: "cta", rotulo: "Fechamento (chamada)", dica: "Como termina e o que pede (seguir, comentar, link…).", linhas: 2 },
  { chave: "regras", rotulo: "Regras (sempre / nunca)", dica: "O que nunca pode aparecer e o que sempre precisa ter.", linhas: 3 },
  { chave: "observacoes", rotulo: "Outras observações", dica: "Qualquer coisa que o editor precisa saber.", linhas: 3 },
];

export function EstiloPerfilDark({ perfil, onFechar, onMudou, onApagado }: { perfil: PerfilDark | null; onFechar: () => void; onMudou: () => void; onApagado: () => void }) {
  const [nome, setNome] = useState("");
  const [arroba, setArroba] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [estilo, setEstilo] = useState<EstiloDark>(estiloVazio());
  const [projetos, setProjetos] = useState<{ id: string; nome_especialista: string }[]>([]);
  const [salvando, setSalvando] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const pendente = useRef<{ id: string; dados: Record<string, unknown> } | null>(null);

  const gravar = async () => {
    const p = pendente.current;
    if (!p) return;
    pendente.current = null;
    setSalvando(true);
    const { error } = await db.from("esteira_dark_perfis").update({ ...p.dados, atualizado_em: new Date().toISOString() }).eq("id", p.id);
    setSalvando(false);
    if (error) toast.error(/duplicate|unique|23505/i.test(`${error.message} ${error.code}`) ? "Já existe um perfil com esse nome." : "Não consegui salvar");
    else onMudou();
  };
  const salvar = (dados: Record<string, unknown>) => {
    if (!perfil) return;
    pendente.current = { id: perfil.id, dados: { ...(pendente.current?.id === perfil.id ? pendente.current.dados : {}), ...dados } };
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void gravar(), 700);
  };
  // Fecha/troca de perfil: não perde o que ainda não foi gravado.
  useEffect(() => () => { clearTimeout(timer.current); void gravar(); }, [perfil?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!perfil) return;
    setNome(perfil.nome); setArroba(perfil.arroba ?? ""); setClienteId(perfil.cliente_id ?? ""); setEstilo(sanitizarEstilo(perfil.estilo));
    void db.from("clientes").select("id, nome_especialista").eq("arquivado", false).order("nome_especialista").then(({ data }: { data: { id: string; nome_especialista: string }[] | null }) => setProjetos(data ?? []));
  }, [perfil?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  const mudarEstilo = (patch: Partial<EstiloDark>) => { const novo = { ...estilo, ...patch }; setEstilo(novo); salvar({ estilo: novo }); };
  const apagar = async () => {
    if (!perfil || !(await confirmar(`Apagar o perfil ${perfil.nome}?`, { descricao: "O perfil e o estilo de vídeo cadastrado nele serão apagados. Os vídeos e projetos não são afetados.", botao: "Apagar" }))) return;
    clearTimeout(timer.current); pendente.current = null;
    const { error } = await db.from("esteira_dark_perfis").delete().eq("id", perfil.id);
    if (error) { toast.error("Não consegui apagar"); return; }
    onApagado();
  };
  const { feitos, total, faltando } = completudeEstilo(estilo);
  const campo = "w-full rounded-lg border border-white/10 bg-[#0a1520] px-3 py-2 text-sm text-white outline-none focus:border-amber-200/60";

  return (
    <Dialog open={!!perfil} onOpenChange={(a) => { if (!a) onFechar(); }}>
      <DialogContent className="dark max-h-[90vh] w-[94vw] max-w-2xl overflow-y-auto border-white/10 bg-[#0c1b27] text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">Perfil · {nome || perfil?.nome}{salvando && <Loader2 className="h-4 w-4 animate-spin text-white/50" />}</DialogTitle>
          <DialogDescription className="text-white/55">Cadastre o estilo do vídeo deste perfil. Salva sozinho. É daqui que o Lauro e o Danilo leem como o vídeo deve ser.</DialogDescription>
        </DialogHeader>
        {perfil && (
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="space-y-1 text-xs text-white/60">Nome do perfil<input className={campo} value={nome} onChange={(e) => { setNome(e.target.value); if (e.target.value.trim()) salvar({ nome: e.target.value.trim().slice(0, 80) }); }} /></label>
              <label className="space-y-1 text-xs text-white/60">@ do perfil (opcional)<input className={campo} placeholder="@exemplo" value={arroba} onChange={(e) => { setArroba(e.target.value); salvar({ arroba: e.target.value.trim().slice(0, 60) || null }); }} /></label>
            </div>
            <div>
              <div className="flex items-center gap-2 text-xs text-white/60"><span>Estilo cadastrado</span><span className="ml-auto tabular-nums">{feitos}/{total}</span></div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-[#f3c98b]" style={{ width: `${(feitos / total) * 100}%` }} /></div>
              {faltando.length > 0 && <p className="mt-1 text-[11px] text-white/40">Falta: {faltando.join(", ")}.</p>}
            </div>
            {CAMPOS.map((c) => (
              <label key={c.chave} className="block space-y-1 text-xs text-white/60">{c.rotulo}
                {c.linhas ? <textarea rows={c.linhas} className={cn(campo, "resize-y")} placeholder={c.dica} value={estilo[c.chave]} onChange={(e) => mudarEstilo({ [c.chave]: e.target.value })} />
                  : <input className={campo} placeholder={c.dica} value={estilo[c.chave]} onChange={(e) => mudarEstilo({ [c.chave]: e.target.value })} />}
              </label>
            ))}
            <div className="space-y-1.5">
              <p className="text-xs text-white/60">Referências (links de vídeos que têm esse estilo)</p>
              {estilo.referencias.map((r, i) => (
                <div key={i} className="flex gap-1.5"><input className={campo} placeholder="https://…" value={r} onChange={(e) => mudarEstilo({ referencias: estilo.referencias.map((x, j) => (j === i ? e.target.value : x)) })} />
                  <button type="button" onClick={() => mudarEstilo({ referencias: estilo.referencias.filter((_, j) => j !== i) })} className="text-white/40 hover:text-rose-300"><X className="h-4 w-4" /></button></div>
              ))}
              <button type="button" onClick={() => setEstilo((e) => ({ ...e, referencias: [...e.referencias, ""] }))} className="flex items-center gap-1 text-xs text-amber-200 hover:underline"><Plus className="h-3 w-3" />Adicionar referência</button>
            </div>
            <label className="block space-y-1 text-xs text-white/60">Ligar a um projeto (opcional)
              <select className={campo} value={clienteId} onChange={(e) => { setClienteId(e.target.value); salvar({ cliente_id: e.target.value || null }); }}>
                <option value="" className="bg-[#0a1520]">Nenhum: perfil independente</option>{projetos.map((p) => <option key={p.id} value={p.id} className="bg-[#0a1520]">{p.nome_especialista}</option>)}
              </select>
              <span className="block text-[11px] text-white/40">Só serve para trazer para a esteira os vídeos dark de um projeto que já existe.</span></label>
            <button type="button" onClick={() => void apagar()} className="flex items-center gap-1.5 text-xs text-rose-300/80 hover:text-rose-300"><Trash2 className="h-3.5 w-3.5" />Apagar este perfil</button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
