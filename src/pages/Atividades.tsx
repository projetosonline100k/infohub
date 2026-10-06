import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Bike, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { AtividadesView } from "@/components/atividades/AtividadesView";
import { AtividadesClientesView } from "@/components/atividades/AtividadesClientesView";
import { FiltroResponsavel } from "@/components/atividades/FiltroResponsavel";
import type { FiltroResponsavel as Filtro } from "@/lib/atividades/filtroResponsavel";

type Secao = "pessoal" | "clientes";

const CHAVE_SECAO = "atividades-secao";
const CHAVE_RESPONSAVEL = "atividades-filtro-responsavel";

const Atividades = () => {
  const [secao, setSecao] = useState<Secao>(() => {
    const salvo = localStorage.getItem(CHAVE_SECAO);
    return salvo === "clientes" ? "clientes" : "pessoal";
  });
  const [filtroResponsavel, setFiltroResponsavel] = useState<Filtro>(() => {
    const salvo = localStorage.getItem(CHAVE_RESPONSAVEL);
    return salvo === "minhas" || salvo === "outras" || salvo === "sem_responsavel" ? salvo : "todas";
  });

  const selecionarResponsavel = (valor: Filtro) => {
    setFiltroResponsavel(valor);
    localStorage.setItem(CHAVE_RESPONSAVEL, valor);
  };

  const selecionarSecao = (valor: Secao) => {
    setSecao(valor);
    localStorage.setItem(CHAVE_SECAO, valor);
  };

  return (
    <div className="space-y-3 h-full">
      {/* Cabeçalho enxuto (uma linha só) pra sobrar espaço pras atividades. */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-foreground">Atividades</h1>

        <div className="flex items-center gap-2">
          <FiltroResponsavel value={filtroResponsavel} onChange={selecionarResponsavel} />
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
      </div>

      <Card className="p-4 shadow-md w-full">
        {secao === "pessoal" ? <AtividadesView filtroResponsavel={filtroResponsavel} /> : <AtividadesClientesView filtroResponsavel={filtroResponsavel} />}
      </Card>
    </div>
  );
};

export default Atividades;
