import { useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { PipelineCounts } from '@/hooks/usePipelineData';
import { Search, BarChart3, Eye, Zap, History } from 'lucide-react';

interface PipelineStepperProps {
  counts: PipelineCounts;
}

const steps = [
  { key: 'discover', label: 'Discovery', path: '/pipeline/discover', icon: Search, countKeys: ['discovered', 'matched'] as const },
  { key: 'analyze', label: 'Analysis', path: '/pipeline/analyze', icon: BarChart3, countKeys: ['analyzing'] as const },
  { key: 'watch', label: 'Watching', path: '/pipeline/watch', icon: Eye, countKeys: ['watching'] as const },
  { key: 'execute', label: 'Execute', path: '/pipeline/execute', icon: Zap, countKeys: ['executing'] as const },
  { key: 'history', label: 'History', path: '/pipeline/history', icon: History, countKeys: ['settled'] as const },
];

export function PipelineStepper({ counts }: PipelineStepperProps) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {steps.map((step, i) => {
        const isActive = location.pathname === step.path;
        const count = step.countKeys.reduce((sum, k) => sum + (counts[k] || 0), 0);
        const Icon = step.icon;

        return (
          <div key={step.key} className="flex items-center">
            {i > 0 && (
              <div className="w-4 md:w-8 h-px bg-border mx-0.5" />
            )}
            <button
              onClick={() => navigate(step.path)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap",
                isActive
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{step.label}</span>
              <span className={cn(
                "px-1.5 py-0.5 rounded text-[10px] font-bold",
                isActive ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
              )}>
                {count}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
