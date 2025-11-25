import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";

const produtoSchema = z.object({
  nomeProduto: z.string().min(1, "Nome é obrigatório"),
  preco: z.string().optional(),
  status: z.string().default("Ativo"),
});

type ProdutoFormData = z.infer<typeof produtoSchema>;

interface ProdutoFormProps {
  clienteId: string;
  produto?: any;
  onClose: () => void;
  onSave: () => void;
}

export function ProdutoForm({ clienteId, produto, onClose, onSave }: ProdutoFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ProdutoFormData>({
    resolver: zodResolver(produtoSchema),
    defaultValues: {
      nomeProduto: produto?.nome_produto || "",
      preco: produto?.preco || "",
      status: produto?.status || "Ativo",
    },
  });

  const status = watch("status");

  const onSubmit = async (data: ProdutoFormData) => {
    setIsSubmitting(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");

      const produtoData = {
        cliente_id: clienteId,
        nome_produto: data.nomeProduto,
        preco: data.preco || null,
        status: data.status,
      };

      if (produto?.id) {
        const { error } = await supabase
          .from("produtos_cliente")
          .update(produtoData)
          .eq("id", produto.id);

        if (error) throw error;
        toast({ title: "Produto atualizado com sucesso!" });
      } else {
        const { error } = await supabase
          .from("produtos_cliente")
          .insert([produtoData]);

        if (error) throw error;
        toast({ title: "Produto adicionado com sucesso!" });
      }

      onSave();
      onClose();
    } catch (error) {
      console.error("Erro ao salvar produto:", error);
      toast({
        title: "Erro ao salvar produto",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background p-6 rounded-lg shadow-lg w-full max-w-md">
        <h2 className="text-xl font-semibold mb-4">
          {produto ? "Editar Produto" : "Adicionar Produto"}
        </h2>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="nomeProduto">Nome do Produto</Label>
            <Input
              id="nomeProduto"
              {...register("nomeProduto")}
              placeholder="Ex: Produto de entrada"
            />
            {errors.nomeProduto && (
              <p className="text-sm text-destructive mt-1">
                {errors.nomeProduto.message}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="preco">Preço</Label>
            <Input
              id="preco"
              {...register("preco")}
              placeholder="Ex: R$ 97"
            />
          </div>

          <div>
            <Label htmlFor="status">Status</Label>
            <Select
              value={status}
              onValueChange={(value) => setValue("status", value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Ativo">Ativo</SelectItem>
                <SelectItem value="Pausado">Pausado</SelectItem>
                <SelectItem value="Planejado">Planejado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
