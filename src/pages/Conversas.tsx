import { useEffect, useState } from "react";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MessagesSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ChatNoDocumento } from "@/components/documentos/ChatNoDocumento";

const db = supabase as unknown as SupabaseClient;
const CHAVE_PROJETO = "conversas:projeto";

// Conversas (15/11/2026, Davi: "um chat solto, igual o do Claude: lista de conversas ao lado, uma nova conversa, e o chat vai guardando no cérebro"):
// o mesmo chat dos documentos (funcionários, skills, cérebro, @ para citar documentos), mas numa página própria, sem documento aberto.
// O projeto escolhido define a esteira e os cérebros disponíveis; as conversas ficam na lista de qualquer lugar.
export default function Conversas() {
  const [projetos, setProjetos] = useState<{ id: string; nome: string }[]>([]);
  const [projeto, setProjeto] = useState<string | null>(() => { try { return localStorage.getItem(CHAVE_PROJETO); } catch { return null; } });
  const editor = useEditor({ extensions: [StarterKit], content: "" });   // rascunho invisível: o chat precisa de um editor, mas aqui não há documento

  useEffect(() => {
    void db.from("clientes").select("id, nome_especialista").eq("arquivado", false).order("nome_especialista").then(({ data }) => {
      const lista = ((data ?? []) as { id: string; nome_especialista: string }[]).map((c) => ({ id: c.id, nome: c.nome_especialista }));
      setProjetos(lista);
      setProjeto((atual) => (atual && lista.some((p) => p.id === atual) ? atual : lista[0]?.id ?? null));
    });
  }, []);
  useEffect(() => { try { if (projeto) localStorage.setItem(CHAVE_PROJETO, projeto); } catch { /* sem storage */ } }, [projeto]);

  return (
    <div className="flex h-[calc(100vh-5rem)] min-h-[480px] flex-col overflow-hidden rounded-xl border bg-background">
      <div className="flex shrink-0 items-center gap-3 border-b px-4 py-2">
        <MessagesSquare className="h-4 w-4 text-primary" />
        <h1 className="text-sm font-semibold">Conversas</h1>
        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">Projeto
          <select value={projeto ?? ""} onChange={(e) => setProjeto(e.target.value || null)} className="rounded-md border bg-transparent px-2 py-1 text-xs text-foreground">
            {projetos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </label>
      </div>
      <div className="min-h-0 flex-1">
        {editor && projeto ? <ChatNoDocumento key={projeto} editor={editor} clienteId={projeto} chave="livre" pagina /> : <p className="p-6 text-sm text-muted-foreground">Carregando…</p>}
      </div>
    </div>
  );
}
