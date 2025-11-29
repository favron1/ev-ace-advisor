import { useState, useEffect } from "react";
import { Activity, Settings, Bell, LogOut, User, Receipt, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, Link } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useBetSlip } from "@/contexts/BetSlipContext";
import type { User as SupabaseUser } from "@supabase/supabase-js";

export function Header() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const { slipBets, setIsOpen } = useBetSlip();
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({ title: "Logged out", description: "See you next time!" });
    navigate("/auth");
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-GB', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      hour12: false 
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-GB', { 
      weekday: 'short',
      day: 'numeric', 
      month: 'short'
    });
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary shadow-lg shadow-primary/20">
            <Activity className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">EdgeBet Pro</h1>
            <p className="text-xs text-muted-foreground">Positive EV Betting</p>
          </div>
        </Link>

        {/* 24-Hour Clock */}
        <div className="hidden lg:flex items-center gap-2 px-4 py-2 rounded-lg bg-muted/50 border border-border">
          <Clock className="h-4 w-4 text-primary" />
          <div className="flex flex-col items-center">
            <span className="font-mono text-lg font-bold text-foreground tracking-wider">
              {formatTime(currentTime)}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatDate(currentTime)}
            </span>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-6">
          <Link to="/" className="text-sm font-medium text-foreground hover:text-primary transition-colors">Dashboard</Link>
          <Link to="/daily-bets" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Daily Best Bets</Link>
          <a href="#analyzer" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Analyzer</a>
          <button 
            onClick={() => setIsOpen(true)}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <Receipt className="h-4 w-4" />
            My Bet Slips
            {slipBets.length > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                {slipBets.length}
              </span>
            )}
          </button>
        </nav>

        <div className="flex items-center gap-2">
          {/* Mobile bet slip button */}
          <Button 
            variant="ghost" 
            size="icon" 
            className="md:hidden text-muted-foreground hover:text-foreground relative"
            onClick={() => setIsOpen(true)}
          >
            <Receipt className="h-5 w-5" />
            {slipBets.length > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                {slipBets.length}
              </span>
            )}
          </Button>

          {user ? (
            <>
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
                <Bell className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
                <Settings className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleLogout} className="text-muted-foreground hover:text-foreground">
                <LogOut className="h-5 w-5" />
              </Button>
            </>
          ) : (
            <Button variant="glow" size="sm" onClick={() => navigate("/auth")}>
              <User className="h-4 w-4" />
              Sign In
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
