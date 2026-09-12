import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatTileProps {
  icon: LucideIcon;
  label: string;
  value: string;
  tone: "critical" | "warning" | "good" | "neutral";
}

const TONE_CLASSES: Record<StatTileProps["tone"], string> = {
  critical: "bg-red-500/10 text-red-500",
  warning: "bg-orange-500/10 text-orange-400",
  good: "bg-green-500/10 text-green-500",
  neutral: "bg-muted text-muted-foreground",
};

export const StatTile = ({ icon: Icon, label, value, tone }: StatTileProps) => {
  return (
    <Card className="p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={cn("h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0", TONE_CLASSES[tone])}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-3xl font-semibold text-foreground leading-tight">{value}</p>
        </div>
      </div>
    </Card>
  );
};
