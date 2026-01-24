import { useState, useEffect } from "react";
import { Activity, Settings, Bell, LogOut, User, Receipt, Clock, Database, BarChart3, Menu, X, Search, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useBetSlip } from "@/contexts/BetSlipContext";
import { useSport } from "@/contexts/SportContext";
import { SportToggle } from "@/components/layout/SportToggle";
import type { User as SupabaseUser } from "@supabase/supabase-js";

export function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const { slipBets, setIsOpen } = useBetSlip();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const validateAndSetUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setUser(null);
        return;
      }

      const { data, error } = await supabase.auth.getUser();
      if (error) {
        await supabase.auth.signOut();
        setUser(null);
        return;
      }

      setUser(data.user ?? null);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      void validateAndSetUser();
    });

    void validateAndSetUser();

    return () => subscription.unsubscribe();
  }, [toast]);

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

  const navLinks = [
    { to: '/', label: 'Find Bets', icon: Search },
    { to: '/bet-log', label: 'Bet Log', icon: TrendingUp },
    { to: '/analytics', label: 'Analytics', icon: BarChart3 },
    { to: '/scrape-history', label: 'Scrape History', icon: Database },
  ];

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/' || location.pathname === '/find-bets';
    return location.pathname === path;
  };

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary shadow-lg shadow-primary/20">
              <Activity className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">FAVYBET PRO</h1>
              <SportToggle />
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

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6">
            {navLinks.map(({ to, label, icon: Icon }) => (
              <Link 
                key={to}
                to={to} 
                className={`text-sm font-medium transition-colors flex items-center gap-1 ${
                  isActive(to) ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-3 w-3" />
                {label}
              </Link>
            ))}
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

            {/* Mobile menu toggle */}
            <Button 
              variant="ghost" 
              size="icon" 
              className="md:hidden text-muted-foreground hover:text-foreground"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>

            {user ? (
              <>
                <Button variant="ghost" size="icon" className="hidden md:flex text-muted-foreground hover:text-foreground">
                  <Bell className="h-5 w-5" />
                </Button>
                <Button variant="ghost" size="icon" className="hidden md:flex text-muted-foreground hover:text-foreground">
                  <Settings className="h-5 w-5" />
                </Button>
                <Button variant="ghost" size="icon" onClick={handleLogout} className="hidden md:flex text-muted-foreground hover:text-foreground">
                  <LogOut className="h-5 w-5" />
                </Button>
              </>
            ) : (
              <Button variant="glow" size="sm" onClick={() => navigate("/auth")} className="hidden md:flex">
                <User className="h-4 w-4" />
                Sign In
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <nav className="fixed top-16 left-0 right-0 z-50 bg-card border-b border-border shadow-lg">
            <div className="container py-4 space-y-1">
              {navLinks.map(({ to, label, icon: Icon }) => (
                <Link 
                  key={to}
                  to={to} 
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive(to) 
                      ? 'bg-primary/10 text-primary' 
                      : 'text-foreground hover:bg-muted'
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Icon className="h-5 w-5" />
                  <span className="font-medium">{label}</span>
                </Link>
              ))}
              
              <div className="border-t border-border my-2" />
              
              {user ? (
                <>
                  <button 
                    onClick={() => { setIsOpen(true); setMobileMenuOpen(false); }}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg text-foreground hover:bg-muted w-full"
                  >
                    <Receipt className="h-5 w-5" />
                    <span className="font-medium">My Bet Slips</span>
                    {slipBets.length > 0 && (
                      <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                        {slipBets.length}
                      </span>
                    )}
                  </button>
                  <button 
                    onClick={() => { handleLogout(); setMobileMenuOpen(false); }}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg text-loss hover:bg-muted w-full"
                  >
                    <LogOut className="h-5 w-5" />
                    <span className="font-medium">Sign Out</span>
                  </button>
                </>
              ) : (
                <Link 
                  to="/auth"
                  className="flex items-center gap-3 px-4 py-3 rounded-lg bg-primary text-primary-foreground"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <User className="h-5 w-5" />
                  <span className="font-medium">Sign In</span>
                </Link>
              )}
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
