import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { X, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";

const clienteSchema = z.object({
  nomeEspecialista: z.string().min(1, "Nome do especialista é obrigatório"),
  idade: z.number().min(18, "Idade mínima é 18 anos"),
  nicho: z.string().min(1, "Nicho é obrigatório"),
});

type ClienteFormData = z.infer<typeof clienteSchema>;

interface EquipeMembro {
  nomePessoa: string;
  papel: string;
}

interface ClienteFormProps {
  cliente?: {
    id: string;
    nome_especialista: string;
    idade: number;
    nicho: string;
  };
  equipe?: Array<{
    id: string;
    nome_pessoa: string;
    papel: string;
  }>;
  onClose: () => void;
  onSave: (data: ClienteFormData, equipe: EquipeMembro[], clienteId?: string) => Promise<void>;
}

const ClienteForm = ({ cliente, equipe = [], onClose, onSave }: ClienteFormProps) => {
  const [equipeMembros, setEquipeMembros] = useState<EquipeMembro[]>(
    equipe.map(e => ({ nomePessoa: e.nome_pessoa, papel: e.papel }))
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ClienteFormData>({
    resolver: zodResolver(clienteSchema),
    defaultValues: {
      nomeEspecialista: cliente?.nome_especialista || "",
      idade: cliente?.idade || 18,
      nicho: cliente?.nicho || "",
    },
  });

  const adicionarMembro = () => {
    setEquipeMembros([...equipeMembros, { nomePessoa: "", papel: "" }]);
  };

  const removerMembro = (index: number) => {
    setEquipeMembros(equipeMembros.filter((_, i) => i !== index));
  };

  const atualizarMembro = (index: number, field: keyof EquipeMembro, value: string) => {
    const novosEquipe = [...equipeMembros];
    novosEquipe[index][field] = value;
    setEquipeMembros(novosEquipe);
  };

  const onSubmit = async (data: ClienteFormData) => {
    setIsSubmitting(true);
    try {
      await onSave(data, equipeMembros, cliente?.id);
      toast({
        title: "Sucesso",
        description: cliente ? "Cliente atualizado com sucesso!" : "Cliente cadastrado com sucesso!",
      });
      onClose();
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao salvar cliente. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 shadow-elegant">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-foreground">
            {cliente ? "Editar Cliente" : "Novo Cliente"}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="nomeEspecialista">Nome do Especialista *</Label>
            <Input
              id="nomeEspecialista"
              {...register("nomeEspecialista")}
              placeholder="Ex: Dra. Mikelini"
            />
            {errors.nomeEspecialista && (
              <p className="text-sm text-destructive">{errors.nomeEspecialista.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="idade">Idade *</Label>
            <Input
              id="idade"
              type="number"
              {...register("idade", { valueAsNumber: true })}
              placeholder="Ex: 35"
            />
            {errors.idade && (
              <p className="text-sm text-destructive">{errors.idade.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="nicho">Nicho *</Label>
            <Input
              id="nicho"
              {...register("nicho")}
              placeholder="Ex: Fisioterapia"
            />
            {errors.nicho && (
              <p className="text-sm text-destructive">{errors.nicho.message}</p>
            )}
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <Label>Equipe</Label>
              <Button type="button" variant="outline" size="sm" onClick={adicionarMembro}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar pessoa
              </Button>
            </div>

            {equipeMembros.map((membro, index) => (
              <Card key={index} className="p-4">
                <div className="flex gap-4 items-start">
                  <div className="flex-1 space-y-2">
                    <Input
                      placeholder="Nome da pessoa"
                      value={membro.nomePessoa}
                      onChange={(e) => atualizarMembro(index, "nomePessoa", e.target.value)}
                    />
                    <Input
                      placeholder="Papel/Função (ex: Copywriter)"
                      value={membro.papel}
                      onChange={(e) => atualizarMembro(index, "papel", e.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removerMembro(index)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>

          <div className="flex gap-4 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting} className="flex-1">
              {isSubmitting ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

export default ClienteForm;
