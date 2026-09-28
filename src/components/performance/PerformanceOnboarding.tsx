import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { usePerformanceHabits } from "@/hooks/usePerformanceHabits";
import { PerformanceHabitForm } from "./PerformanceHabitForm";
import type { TipoRotina } from "@/lib/performance/PerformanceHabitService";

interface Sugestao {
  nome: string;
  tipo: TipoRotina;
  metaDiaria?: number;
}

const SUGESTOES: Sugestao[] = [
  { nome: "Academia", tipo: "boolean" },
  { nome: "Leitura", tipo: "paginas", metaDiaria: 20 },
  { nome: "Estudo", tipo: "minutos", metaDiaria: 30 },
];

interface PerformanceOnboardingProps {
  onCriada: () => void;
}

// "Construa sua rotina" (item 25) — os 4 pilares padrão e os exemplos
// sugeridos só nascem no banco quando a pessoa confirma ("Criar minha
// primeira rotina" ou uma das sugestões), nunca sozinho ao abrir a página.
export function PerformanceOnboarding({ onCriada }: PerformanceOnboardingProps) {
  const { pilares, garantirPadrao, criar, criarNovoPilar } = usePerformanceHabits();
  const [criando, setCriando] = useState(false);
  const [sugestaoInicial, setSugestaoInicial] = useState<Sugestao | null>(null);

  const comecar = async (sugestao: Sugestao | null) => {
    await garantirPadrao();
    setSugestaoInicial(sugestao);
    setCriando(true);
  };

  if (criando) {
    return (
      <Card className="mx-auto max-w-md space-y-4 p-6">
        <h2 className="text-lg font-semibold text-foreground">Sua primeira rotina</h2>
        <PerformanceHabitForm
          pilares={pilares}
          onCriarPilar={criarNovoPilar}
          valoresIniciais={sugestaoInicial ? { nome: sugestaoInicial.nome, tipo: sugestaoInicial.tipo, metaDiaria: sugestaoInicial.metaDiaria ?? null } : undefined}
          onSalvar={criar}
          onSalvo={onCriada}
          onCancelar={() => setCriando(false)}
        />
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-md space-y-4 p-8 text-center">
      <p className="text-4xl" aria-hidden="true">🎯</p>
      <h2 className="text-lg font-semibold text-foreground">Construa sua rotina</h2>
      <p className="text-sm text-muted-foreground">
        Acompanhe hábitos de alta performance — academia, leitura, estudo e mais — do seu jeito.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {SUGESTOES.map((s) => (
          <Button key={s.nome} type="button" variant="outline" size="sm" onClick={() => comecar(s)}>
            {s.nome}
          </Button>
        ))}
      </div>
      <Button type="button" className="w-full" onClick={() => comecar(null)}>
        Criar minha primeira rotina
      </Button>
    </Card>
  );
}
