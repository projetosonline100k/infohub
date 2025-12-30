import { ChevronDown, ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface DiaSectionProps {
  dia: string;
  contagem: number;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  isToday?: boolean;
}

export const DiaSection = ({
  dia,
  contagem,
  isOpen,
  onToggle,
  children,
  isToday,
}: DiaSectionProps) => {
  return (
    <Collapsible open={isOpen} onOpenChange={onToggle}>
      <CollapsibleTrigger className={cn(
        "flex items-center gap-2 w-full px-3 py-2 hover:bg-muted/50 rounded-md transition-colors",
        isToday && "bg-primary/5 border-l-2 border-primary"
      )}>
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <span className={cn(
          "text-sm font-medium",
          isToday ? "text-primary" : "text-foreground"
        )}>{dia}</span>
        <span className={cn(
          "text-sm",
          contagem > 0 ? "text-primary font-medium" : "text-muted-foreground"
        )}>
          {contagem}
        </span>
        {isToday && (
          <span className="ml-auto text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded">
            Hoje
          </span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-4">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
};
