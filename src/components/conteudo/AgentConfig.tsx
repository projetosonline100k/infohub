import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Bot } from "lucide-react";

interface AgentConfig {
  id?: string;
  nome: string;
  persona: string;
  instrucoes: string;
  tom_voz: string;
}

interface AgentConfigModalProps {
  clienteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: (config: AgentConfig) => void;
}

const TOM_VOZ_OPTIONS = [
  { value: "informal", label: "Informal e descontraído" },
  { value: "profissional", label: "Profissional e sério" },
  { value: "tecnico", label: "Técnico e detalhado" },
  { value: "divertido", label: "Divertido e animado" },
  { value: "inspirador", label: "Inspirador e motivacional" },
];

export function AgentConfigModal({ clienteId, open, onOpenChange, onSave }: AgentConfigModalProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<AgentConfig>({
    nome: "Assistente de Roteiros",
    persona: "",
    instrucoes: "",
    tom_voz: "informal",
  });

  useEffect(() => {
    if (open && clienteId) {
      fetchAgentConfig();
    }
  }, [open, clienteId]);

  const fetchAgentConfig = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("agentes_ia")
      .select("*")
      .eq("cliente_id", clienteId)
      .maybeSingle();

    if (data) {
      setConfig({
        id: data.id,
        nome: data.nome,
        persona: data.persona || "",
        instrucoes: data.instrucoes || "",
        tom_voz: data.tom_voz || "informal",
      });
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    
    try {
      if (config.id) {
        // Update existing
        const { error } = await supabase
          .from("agentes_ia")
          .update({
            nome: config.nome,
            persona: config.persona,
            instrucoes: config.instrucoes,
            tom_voz: config.tom_voz,
          })
          .eq("id", config.id);
        
        if (error) throw error;
      } else {
        // Create new
        const { data, error } = await supabase
          .from("agentes_ia")
          .insert({
            cliente_id: clienteId,
            nome: config.nome,
            persona: config.persona,
            instrucoes: config.instrucoes,
            tom_voz: config.tom_voz,
          })
          .select()
          .single();
        
        if (error) throw error;
        setConfig(prev => ({ ...prev, id: data.id }));
      }
      
      toast.success("Agente salvo com sucesso!");
      onSave?.(config);
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving agent:", error);
      toast.error("Erro ao salvar agente");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Configurar Agente I.A
          </DialogTitle>
        </DialogHeader>
        
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome do Agente</Label>
              <Input
                id="nome"
                value={config.nome}
                onChange={(e) => setConfig(prev => ({ ...prev, nome: e.target.value }))}
                placeholder="Ex: Assistente de Roteiros"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tom_voz">Tom de Voz</Label>
              <Select 
                value={config.tom_voz} 
                onValueChange={(value) => setConfig(prev => ({ ...prev, tom_voz: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tom de voz" />
                </SelectTrigger>
                <SelectContent>
                  {TOM_VOZ_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="persona">Persona / Personalidade</Label>
              <Textarea
                id="persona"
                value={config.persona}
                onChange={(e) => setConfig(prev => ({ ...prev, persona: e.target.value }))}
                placeholder="Ex: Você é um roteirista especializado em finanças, focado em criar conteúdo que converte..."
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Descreva quem é o agente e qual sua especialidade
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="instrucoes">Instruções Adicionais</Label>
              <Textarea
                id="instrucoes"
                value={config.instrucoes}
                onChange={(e) => setConfig(prev => ({ ...prev, instrucoes: e.target.value }))}
                placeholder="Ex: Sempre use ganchos fortes nos primeiros 3 segundos. Evite palavras como 'grátis'. Inclua sempre uma pergunta no final..."
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                Regras e diretrizes específicas que o agente deve seguir
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar Agente
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
