import { Card } from "@/components/ui/card";

const Atividades = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2">Atividades</h1>
        <p className="text-muted-foreground">
          Acompanhe suas tarefas e compromissos
        </p>
      </div>

      <Card className="p-6 shadow-md max-w-2xl">
        <h2 className="text-xl font-semibold text-foreground mb-4">Atividades</h2>
        <div className="py-8">
          <p className="text-muted-foreground">
            Aqui serão listadas as atividades do dia, tarefas pendentes e compromissos do infoprodutor.
          </p>
        </div>
      </Card>
    </div>
  );
};

export default Atividades;
