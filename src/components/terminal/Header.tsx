import { Activity, Settings, LogOut, Zap, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface HeaderProps {
  onRunDetection?: () => void;
  detecting?: boolean;
  hasUnviewedAlerts?: boolean;
  unviewedCount?: number;
  onAlertClick?: () => void;
}

export function Header({ 
  onRunDetection, 
  detecting, 
  hasUnviewedAlerts = false,
  unviewedCount = 0,
  onAlertClick,
}: HeaderProps) {
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
            
            {/* Alert Indicator */}
            {hasUnviewedAlerts && (
              <button
                onClick={onAlertClick}
                className="relative flex items-center gap-1 ml-2"
                title={`${unviewedCount} new confirmed signal${unviewedCount > 1 ? 's' : ''}`}
              >
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-destructive"></span>
                </span>
                {unviewedCount > 0 && (
                  <span className="text-xs font-bold text-destructive">
                    {unviewedCount}
                  </span>
                )}
              </button>
            )}
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
          <Button variant="ghost" size="icon" onClick={() => navigate('/stats')} title="Stats">
            <BarChart3 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => navigate('/settings')} title="Settings">
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
