import { useState } from "react";
import { BrainstormView } from "./BrainstormView";
import { VerticalView } from "./VerticalView";

interface ConteudoSectionProps {
  clienteId: string;
}

const menuItems = [
  { id: "brainstorm", label: "Brainstorm" },
  { id: "vertical", label: "Vertical" },
  { id: "youtube", label: "Youtube" },
  { id: "cronograma", label: "Cronograma" },
];

export function ConteudoSection({ clienteId }: ConteudoSectionProps) {
  const [subAba, setSubAba] = useState("brainstorm");

  return (
    <div className="flex h-full">
      {/* Submenu lateral */}
      <div className="w-40 border-r border-border bg-muted/30 p-3">
        <div className="space-y-1">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setSubAba(item.id)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                subAba === item.id
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Área de conteúdo */}
      <div className="flex-1 overflow-y-auto p-6">
        {subAba === "brainstorm" && <BrainstormView clienteId={clienteId} />}
        
        {subAba === "vertical" && <VerticalView clienteId={clienteId} />}
        
        {subAba === "youtube" && (
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">
              Em breve: Planejamento de conteúdo YouTube
            </p>
          </div>
        )}
        
        {subAba === "cronograma" && (
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">
              Em breve: Cronograma de publicações
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
