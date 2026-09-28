import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { isDesktop } from "@/lib/platform";
import { atalhoEncerrarDiaRegistrado } from "@/lib/desktop/shortcuts";

interface AtalhoInfo {
  acao: string;
  combinacao: string;
  disponivel: boolean;
}

const ATALHOS: AtalhoInfo[] = [
  { acao: "Abrir Jarvis", combinacao: "⌘ Shift J", disponivel: false },
  { acao: "Nova tarefa", combinacao: "⌘ Shift T", disponivel: false },
  { acao: "Nova nota", combinacao: "⌘ Shift N", disponivel: false },
  { acao: "Encerrar o dia", combinacao: "⌘ Shift E", disponivel: true },
];

// Administração → Jarvis → Atalhos (item 14). Só "Encerrar o dia" funciona
// nesta etapa — os outros 3 aparecem como "Em breve" (item 14 do pedido:
// "se os outros atalhos ainda não existirem, podem aparecer como 'Em
// breve'"). Estrutura já pronta pra ganhar edição de atalho no futuro
// (bastaria trocar a "combinacao" fixa por um valor editável).
export function AdminJarvisAtalhos() {
  const [registrado, setRegistrado] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isDesktop()) return;
    atalhoEncerrarDiaRegistrado().then(setRegistrado);
  }, []);

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Atalhos</h2>
        <p className="text-sm text-muted-foreground">
          Atalhos de teclado globais do app desktop — funcionam mesmo com o Infopro Hub em segundo plano.
        </p>
      </div>

      <Card className="divide-y divide-border p-0">
        {ATALHOS.map((atalho) => (
          <div key={atalho.acao} className="flex items-center justify-between gap-4 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">{atalho.acao}</p>
              {atalho.disponivel && !isDesktop() && (
                <p className="text-xs text-muted-foreground">Disponível só no app desktop.</p>
              )}
              {atalho.disponivel && isDesktop() && registrado === false && (
                <p className="text-xs text-destructive">O atalho ⌘+Shift+E não pôde ser registrado (talvez já esteja em uso por outro app).</p>
              )}
            </div>
            <span className="shrink-0 rounded-md border border-border bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
              {atalho.disponivel ? atalho.combinacao : "Em breve"}
            </span>
          </div>
        ))}
      </Card>
    </div>
  );
}
