import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useJarvisMensagens, type JarvisMensagem, type JarvisMensagemTipo } from "@/hooks/useJarvisMensagens";
import { confirmar } from "@/components/DialogosGlobais";

const TIPO_LABEL: Record<JarvisMensagemTipo, string> = {
  motivacao: "Motivação",
  alerta: "Alerta",
  retorno_foco: "Retorno ao foco",
  pausa: "Pausa",
  conclusao: "Conclusão",
};

const TIPOS: JarvisMensagemTipo[] = ["motivacao", "alerta", "retorno_foco", "pausa", "conclusao"];

// Item 2 do refinamento: CRUD de mensagens espontâneas — o Jarvis sorteia
// entre as ativas de cada tipo (ver useAssistantCobranca.ts), respeitando o
// intervalo mínimo de cada uma. Mesmo padrão visual (Card-list + Dialog) do
// resto de Admin.tsx.
export function AdminJarvisMensagens() {
  const { mensagens, loading, criar, atualizar, alternarAtivo, excluir } = useJarvisMensagens();
  const [editando, setEditando] = useState<JarvisMensagem | null>(null);
  const [criando, setCriando] = useState(false);

  const [mensagem, setMensagem] = useState("");
  const [tipo, setTipo] = useState<JarvisMensagemTipo>("motivacao");
  const [ativo, setAtivo] = useState(true);
  const [intervalo, setIntervalo] = useState("30");
  const [contexto, setContexto] = useState("");
  const [salvando, setSalvando] = useState(false);

  const abrirNova = () => {
    setMensagem("");
    setTipo("motivacao");
    setAtivo(true);
    setIntervalo("30");
    setContexto("");
    setCriando(true);
  };

  const abrirEdicao = (m: JarvisMensagem) => {
    setMensagem(m.mensagem);
    setTipo(m.tipo as JarvisMensagemTipo);
    setAtivo(m.ativo);
    setIntervalo(String(m.intervalo_minimo_minutos));
    setContexto(m.contexto || "");
    setEditando(m);
  };

  const fechar = () => {
    setCriando(false);
    setEditando(null);
  };

  const salvar = async () => {
    if (!mensagem.trim() || salvando) return;
    setSalvando(true);
    try {
      const input = {
        mensagem: mensagem.trim(),
        tipo,
        ativo,
        intervaloMinimoMinutos: Number(intervalo) || 30,
        contexto: contexto.trim() || null,
      };
      if (editando) await atualizar(editando.id, input);
      else await criar(input);
      toast.success(editando ? "Mensagem atualizada" : "Mensagem criada");
      fechar();
    } catch {
      toast.error("Não foi possível salvar a mensagem");
    } finally {
      setSalvando(false);
    }
  };

  const remover = async (m: JarvisMensagem) => {
    if (!(await confirmar("Excluir esta mensagem?"))) return;
    try {
      await excluir(m.id);
      toast.success("Mensagem excluída");
    } catch {
      toast.error("Não foi possível excluir a mensagem");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Mensagens do Jarvis</h2>
          <p className="text-sm text-muted-foreground">
            O Jarvis sorteia entre as mensagens ativas de cada tipo, nos momentos certos — sem incomodar (cada
            mensagem tem seu próprio intervalo mínimo entre repetições).
          </p>
        </div>
        <Button onClick={abrirNova}>
          <Plus className="mr-2 h-4 w-4" />
          Nova mensagem
        </Button>
      </div>

      {loading ? (
        <Card className="p-6">
          <p className="text-center text-sm text-muted-foreground">Carregando...</p>
        </Card>
      ) : mensagens.length === 0 ? (
        <Card className="p-6">
          <p className="text-center text-sm text-muted-foreground">Nenhuma mensagem cadastrada ainda.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {mensagens.map((m) => (
            <Card key={m.id} className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent">
                    {TIPO_LABEL[m.tipo as JarvisMensagemTipo] ?? m.tipo}
                  </span>
                  <p className="truncate text-sm text-foreground">{m.mensagem}</p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Intervalo mínimo: {m.intervalo_minimo_minutos} min{m.contexto ? ` · ${m.contexto}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Switch checked={m.ativo} onCheckedChange={(v) => alternarAtivo(m.id, v)} aria-label="Mensagem ativa" />
                <Button variant="ghost" size="sm" onClick={() => abrirEdicao(m)}>
                  Editar
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive"
                  onClick={() => remover(m)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={criando || !!editando} onOpenChange={(o) => !o && fechar()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editando ? "Editar mensagem" : "Nova mensagem"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Mensagem</Label>
              <Textarea
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                placeholder="Bora voltar? Você já começou."
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={tipo} onValueChange={(v) => setTipo(v as JarvisMensagemTipo)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPOS.map((t) => <SelectItem key={t} value={t}>{TIPO_LABEL[t]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Intervalo mínimo (min)</Label>
                <Input type="number" min={1} value={intervalo} onChange={(e) => setIntervalo(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Contexto (opcional)</Label>
              <Input value={contexto} onChange={(e) => setContexto(e.target.value)} placeholder="Ex.: só em sessões longas" />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={ativo} onCheckedChange={setAtivo} />
              <Label className="!mt-0">Ativa</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={fechar}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={salvando || !mensagem.trim()}>
              {editando ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
