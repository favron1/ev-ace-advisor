import { Activity, Settings, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary shadow-lg shadow-primary/20">
            <Activity className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">EdgeBet Pro</h1>
            <p className="text-xs text-muted-foreground">Positive EV Betting</p>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-6">
          <a href="#" className="text-sm font-medium text-foreground hover:text-primary transition-colors">Dashboard</a>
          <a href="#" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Analytics</a>
          <a href="#" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">History</a>
          <a href="#" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Settings</a>
        </nav>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
            <Bell className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
            <Settings className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </header>
  );
}
