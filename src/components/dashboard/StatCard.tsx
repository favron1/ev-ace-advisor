import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string;
  change?: string;
  changeType?: "profit" | "loss" | "neutral";
  icon: LucideIcon;
  className?: string;
}

export function StatCard({ title, value, change, changeType = "neutral", icon: Icon, className }: StatCardProps) {
  return (
    <div className={cn("stat-card group", className)}>
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="data-display text-foreground">{value}</p>
          {change && (
            <p className={cn(
              "text-sm font-medium",
              changeType === "profit" && "text-profit",
              changeType === "loss" && "text-loss",
              changeType === "neutral" && "text-muted-foreground"
            )}>
              {change}
            </p>
          )}
        </div>
        <div className={cn(
          "rounded-lg p-3 transition-colors duration-200",
          changeType === "profit" && "bg-profit/10 text-profit",
          changeType === "loss" && "bg-loss/10 text-loss",
          changeType === "neutral" && "bg-muted text-muted-foreground"
        )}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
