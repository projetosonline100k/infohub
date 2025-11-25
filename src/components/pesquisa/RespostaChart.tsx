interface RespostaChartProps {
  opcoes: string[];
  respostas: string[][];
}

export function RespostaChart({ opcoes, respostas }: RespostaChartProps) {
  const contagens = opcoes.map((opcao) => {
    const count = respostas.filter((resp) => resp.includes(opcao)).length;
    return { opcao, count };
  });

  const total = respostas.length;
  const maxCount = Math.max(...contagens.map((c) => c.count), 1);

  return (
    <div className="space-y-3">
      {contagens.map(({ opcao, count }) => {
        const percentage = total > 0 ? (count / total) * 100 : 0;
        const barWidth = (count / maxCount) * 100;

        return (
          <div key={opcao} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span>{opcao}</span>
              <span className="text-muted-foreground">
                {count} ({percentage.toFixed(1)}%)
              </span>
            </div>
            <div className="h-8 bg-muted rounded-md overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300 flex items-center px-3"
                style={{ width: `${barWidth}%` }}
              >
                {barWidth > 20 && (
                  <span className="text-primary-foreground text-sm font-medium">
                    {count}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
