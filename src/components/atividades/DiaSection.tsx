import { ChevronDown, ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface DiaSectionProps {
  dia: string;
  contagem: number;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export const DiaSection = ({
  dia,
  contagem,
  isOpen,
  onToggle,
  children,
}: DiaSectionProps) => {
  return (
    <Collapsible open={isOpen} onOpenChange={onToggle}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full px-3 py-2 hover:bg-muted/50 rounded-md transition-colors">
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="text-sm font-medium text-foreground">{dia}</span>
        <span className={cn(
          "text-sm",
          contagem > 0 ? "text-primary font-medium" : "text-muted-foreground"
        )}>
          {contagem}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-4">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
};
