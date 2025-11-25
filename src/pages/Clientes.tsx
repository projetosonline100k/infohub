import { useState, useEffect } from "react";
import { Plus, Edit } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import ClienteForm from "@/components/ClienteForm";

interface Cliente {
  id: string;
  nome_especialista: string;
  idade: number;
  nicho: string;
}

interface EquipeMembro {
  id: string;
  cliente_id: string;
  nome_pessoa: string;
  papel: string;
}

const Clientes = () => {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [clienteEditando, setClienteEditando] = useState<Cliente | undefined>();
  const [equipeEditando, setEquipeEditando] = useState<EquipeMembro[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregarClientes();
  }, []);

  const carregarClientes = async () => {
    try {
      const { data, error } = await supabase
        .from("clientes")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setClientes(data || []);
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao carregar clientes",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const abrirFormularioNovo = () => {
    setClienteEditando(undefined);
    setEquipeEditando([]);
    setShowForm(true);
  };

  const abrirFormularioEditar = async (cliente: Cliente) => {
    try {
      const { data: equipe, error } = await supabase
        .from("equipe_cliente")
        .select("*")
        .eq("cliente_id", cliente.id);

      if (error) throw error;
      
      setClienteEditando(cliente);
      setEquipeEditando(equipe || []);
      setShowForm(true);
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao carregar equipe do cliente",
        variant: "destructive",
      });
    }
  };

  const salvarCliente = async (
    data: { nomeEspecialista: string; idade: number; nicho: string },
    equipe: Array<{ nomePessoa: string; papel: string }>,
    clienteId?: string
  ) => {
    try {
      let clienteIdFinal = clienteId;

      if (clienteId) {
        // Atualizar cliente existente
        const { error } = await supabase
          .from("clientes")
          .update({
            nome_especialista: data.nomeEspecialista,
            idade: data.idade,
            nicho: data.nicho,
          })
          .eq("id", clienteId);

        if (error) throw error;

        // Remover equipe antiga
        await supabase.from("equipe_cliente").delete().eq("cliente_id", clienteId);
      } else {
        // Criar novo cliente
        const { data: novoCliente, error } = await supabase
          .from("clientes")
          .insert({
            nome_especialista: data.nomeEspecialista,
            idade: data.idade,
            nicho: data.nicho,
          })
          .select()
          .single();

        if (error) throw error;
        clienteIdFinal = novoCliente.id;
      }

      // Inserir nova equipe
      if (equipe.length > 0 && clienteIdFinal) {
        const equipeData = equipe
          .filter(m => m.nomePessoa && m.papel)
          .map(m => ({
            cliente_id: clienteIdFinal,
            nome_pessoa: m.nomePessoa,
            papel: m.papel,
          }));

        if (equipeData.length > 0) {
          const { error } = await supabase.from("equipe_cliente").insert(equipeData);
          if (error) throw error;
        }
      }

      await carregarClientes();
    } catch (error) {
      throw error;
    }
  };

  const getIniciais = (nome: string) => {
    const palavras = nome.split(" ");
    if (palavras.length >= 2) {
      return `${palavras[0][0]}${palavras[1][0]}`.toUpperCase();
    }
    return nome.substring(0, 2).toUpperCase();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Clientes</h1>
          <p className="text-muted-foreground">Gerencie sua base de clientes</p>
        </div>
        <Button onClick={abrirFormularioNovo}>
          <Plus className="h-4 w-4 mr-2" />
          Novo cliente
        </Button>
      </div>

      {loading ? (
        <Card className="p-8 shadow-md">
          <div className="text-center py-12">
            <p className="text-muted-foreground">Carregando clientes...</p>
          </div>
        </Card>
      ) : clientes.length === 0 ? (
        <Card className="p-8 shadow-md">
          <div className="text-center py-12">
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Nenhum cliente cadastrado. Clique em "Novo cliente" para começar.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {clientes.map((cliente) => (
            <Card key={cliente.id} className="p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-4">
                <Avatar className="h-12 w-12">
                  <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                    {getIniciais(cliente.nome_especialista)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground text-lg">
                    {cliente.nome_especialista}
                  </h3>
                  <p className="text-sm text-muted-foreground">{cliente.nicho}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => abrirFormularioEditar(cliente)}
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Editar
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showForm && (
        <ClienteForm
          cliente={clienteEditando}
          equipe={equipeEditando}
          onClose={() => setShowForm(false)}
          onSave={salvarCliente}
        />
      )}
    </div>
  );
};

export default Clientes;
