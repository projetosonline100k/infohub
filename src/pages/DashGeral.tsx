import { Card } from "@/components/ui/card";

const DashGeral = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2">Dash geral</h1>
        <p className="text-muted-foreground">
          Visão geral dos resultados do seu negócio
        </p>
      </div>

      <Card className="p-8 shadow-md">
        <div className="text-center py-12">
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Aqui será exibido o resumo geral de resultados do infoprodutor (métricas, gráficos e indicadores).
          </p>
        </div>
      </Card>
    </div>
  );
};

export default DashGeral;
