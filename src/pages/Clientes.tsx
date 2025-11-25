import { Card } from "@/components/ui/card";

const Clientes = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2">Clientes</h1>
        <p className="text-muted-foreground">
          Gerencie sua base de clientes
        </p>
      </div>

      <Card className="p-8 shadow-md">
        <div className="text-center py-12">
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Aqui ficará a lista de clientes, com nome, e-mail, status e links para detalhes.
          </p>
        </div>
      </Card>
    </div>
  );
};

export default Clientes;
