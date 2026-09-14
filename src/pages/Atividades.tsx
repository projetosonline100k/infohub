import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Bike, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { AtividadesView } from "@/components/atividades/AtividadesView";
import { AtividadesClientesView } from "@/components/atividades/AtividadesClientesView";

type Secao = "pessoal" | "clientes";

const CHAVE_SECAO = "atividades-secao";

const Atividades = () => {
  const [secao, setSecao] = useState<Secao>(() => {
    const salvo = localStorage.getItem(CHAVE_SECAO);
    return salvo === "clientes" ? "clientes" : "pessoal";
  });

  const selecionarSecao = (valor: Secao) => {
    setSecao(valor);
    localStorage.setItem(CHAVE_SECAO, valor);
  };

  return (
    <div className="space-y-6 h-full">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Atividades</h1>
          <p className="text-muted-foreground">
            Acompanhe suas tarefas e compromissos gerais
          </p>
        </div>

        <div className="flex items-center bg-muted rounded-lg p-0.5">
          <button
            onClick={() => selecionarSecao("pessoal")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              secao === "pessoal" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Bike className="h-4 w-4" />
            Minhas atividades
          </button>
          <button
            onClick={() => selecionarSecao("clientes")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              secao === "clientes" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Users className="h-4 w-4" />
            Clientes
          </button>
        </div>
      </div>

      <Card className="p-6 shadow-md w-full">
        {secao === "pessoal" ? <AtividadesView /> : <AtividadesClientesView />}
      </Card>
    </div>
  );
};

export default Atividades;
