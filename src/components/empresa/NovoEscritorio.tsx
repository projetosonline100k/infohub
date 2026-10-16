import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { SetorResumo } from "@/lib/empresa/visaoGeral";

// Criar (ou editar) um escritório = setor da empresa do projeto (pedido do
// Davi, 15/10: "antes de criar o funcionário, eu deveria criar o escritório").
// "Diretoria" fica na fileira de cima do mapa; os outros, embaixo.
const db = supabase as unknown as SupabaseClient;

const CORES_ESCRITORIO: { valor: string; cor: string }[] = [
  { valor: "amber", cor: "#f59e0b" }, { valor: "violet", cor: "#8b5cf6" }, { valor: "blue", cor: "#0ea5e9" },
  { valor: "emerald", cor: "#10b981" }, { valor: "rose", cor: "#f43f5e" },
];

export function NovoEscritorio({ clienteId, setores, aberto, editando, onFechar, onCriado }: {
  clienteId: string; setores: SetorResumo[]; aberto: boolean; editando?: SetorResumo | null;
  onFechar: () => void; onCriado: (id: string) => void;
}) {
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState("emerald");
  const [descricao, setDescricao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const preenchidoPara = useRef<string | null>(null);

  // Preenche só ao abrir (não apaga o que está sendo digitado quando a tela recarrega).
  useEffect(() => {
    if (!aberto) { preenchidoPara.current = null; return; }
    const chave = editando?.id ?? "novo";
    if (preenchidoPara.current === chave) return;
    preenchidoPara.current = chave;
    setNome(editando?.nome ?? (setores.length === 0 ? "Diretoria" : ""));
    setCor(editando?.cor ?? (setores.length === 0 ? "amber" : "emerald"));
    setDescricao(editando?.descricao ?? "");
  }, [aberto, editando, setores.length]);

  const salvar = async () => {
    if (!nome.trim()) return;
    setSalvando(true);
    try {
      const dados = { nome: nome.trim(), cor, descricao: descricao.trim() || null };
      let id = editando?.id ?? "";
      if (editando) {
        const { error } = await db.from("setores").update(dados).eq("id", editando.id);
        if (error) throw error;
      } else {
        id = crypto.randomUUID();
        const { error } = await db.from("setores").insert({ ...dados, id, cliente_id: clienteId, ordem: setores.length + 1 });
        if (error) throw error;
      }
      toast.success(editando ? "Escritório atualizado" : `Escritório "${dados.nome}" criado: agora coloque funcionários nele`);
      onCriado(id);
      onFechar();
    } catch (e) {
      toast.error(`Não consegui salvar: ${e instanceof Error ? e.message : "erro"}`);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(a) => { if (!a) onFechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editando ? `Editar ${editando.nome}` : "Novo escritório"}</DialogTitle>
          <DialogDescription>Um escritório é um setor da empresa (ex.: Diretoria, Marketing, Vendas). "Diretoria" fica na fileira de cima do mapa.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Nome</span>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Vendas" autoFocus />
          </label>
          <div className="space-y-1 text-sm">
            <span className="font-medium">Cor da placa</span>
            <div className="flex gap-2">
              {CORES_ESCRITORIO.map((c) => (
                <button key={c.valor} type="button" onClick={() => setCor(c.valor)} aria-label={c.valor}
                  className={cn("h-7 w-7 rounded-full border-2", cor === c.valor ? "border-primary ring-2 ring-primary/30" : "border-transparent")} style={{ background: c.cor }} />
              ))}
            </div>
          </div>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Para que serve <span className="font-normal text-muted-foreground">(opcional)</span></span>
            <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} className="text-sm" placeholder="O que esse time entrega" />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onFechar}>Cancelar</Button>
            <Button onClick={() => void salvar()} disabled={salvando || !nome.trim()}>
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editando ? "Salvar" : "Criar escritório"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
