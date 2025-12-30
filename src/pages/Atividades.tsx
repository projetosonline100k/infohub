import { Card } from "@/components/ui/card";
import { AtividadesView } from "@/components/atividades/AtividadesView";

const Atividades = () => {
  return (
    <div className="space-y-6 h-full">
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2">Atividades</h1>
        <p className="text-muted-foreground">
          Acompanhe suas tarefas e compromissos gerais
        </p>
      </div>

      <Card className="p-6 shadow-md w-full">
        <AtividadesView />
      </Card>
    </div>
  );
};

export default Atividades;
