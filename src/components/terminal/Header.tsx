import { Activity, Settings, LogOut, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';

interface HeaderProps {
  onRunDetection?: () => void;
  detecting?: boolean;
}

export function Header({ onRunDetection, detecting }: HeaderProps) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container flex items-center justify-between h-14 px-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <span className="font-semibold text-lg tracking-tight">SIGNAL TERMINAL</span>
          </div>
          <div className="hidden md:flex items-center gap-1 text-xs text-muted-foreground">
            <span className="px-2 py-0.5 rounded bg-primary/10 text-primary font-mono">PHASE 1</span>
            <span>Manual Execution</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onRunDetection && (
            <Button 
              size="sm" 
              onClick={onRunDetection}
              disabled={detecting}
              className="gap-2"
            >
              <Zap className="h-4 w-4" />
              {detecting ? 'Detecting...' : 'Run Detection'}
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={() => navigate('/settings')}>
            <Settings className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
