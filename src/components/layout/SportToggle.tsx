import { useSport } from "@/contexts/SportContext";
import { cn } from "@/lib/utils";
import { CircleDot, Trophy } from "lucide-react";

export function SportToggle() {
  const { sport, setSport } = useSport();

  return (
    <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/50 border border-border">
      <button
        onClick={() => setSport('soccer')}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200",
          sport === 'soccer' 
            ? "bg-primary text-primary-foreground shadow-sm" 
            : "text-muted-foreground hover:text-foreground hover:bg-muted"
        )}
      >
        <CircleDot className="h-4 w-4" />
        Soccer
      </button>
      <button
        onClick={() => setSport('racing')}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200",
          sport === 'racing' 
            ? "bg-primary text-primary-foreground shadow-sm" 
            : "text-muted-foreground hover:text-foreground hover:bg-muted"
        )}
      >
        <Trophy className="h-4 w-4" />
        Racing
      </button>
    </div>
  );
}
