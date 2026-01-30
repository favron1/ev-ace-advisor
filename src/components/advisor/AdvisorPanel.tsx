import { useState } from 'react';
import { Brain, RefreshCw, ChevronDown, ChevronUp, Check, X, AlertCircle, AlertTriangle, Info, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdvisor, AdvisorRecommendation } from '@/hooks/useAdvisor';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

const priorityConfig = {
  critical: {
    icon: AlertCircle,
    color: 'text-red-500',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    badge: 'bg-red-500/20 text-red-500 border-red-500/30',
  },
  high: {
    icon: AlertTriangle,
    color: 'text-orange-500',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
    badge: 'bg-orange-500/20 text-orange-500 border-orange-500/30',
  },
  medium: {
    icon: Lightbulb,
    color: 'text-yellow-500',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/30',
    badge: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30',
  },
  low: {
    icon: Info,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    badge: 'bg-blue-500/20 text-blue-500 border-blue-500/30',
  },
};

const categoryLabels: Record<string, string> = {
  market_type: 'Market Type',
  liquidity: 'Liquidity',
  edge_threshold: 'Edge Threshold',
  league_focus: 'League Focus',
  timing: 'Timing',
  risk_management: 'Risk Management',
};

interface RecommendationCardProps {
  recommendation: AdvisorRecommendation;
  onApply: (id: string) => void;
  onDismiss: (id: string) => void;
}

function RecommendationCard({ recommendation, onApply, onDismiss }: RecommendationCardProps) {
  const [expanded, setExpanded] = useState(false);
  const config = priorityConfig[recommendation.priority as keyof typeof priorityConfig] || priorityConfig.medium;
  const Icon = config.icon;

  const supportingData = recommendation.supporting_data;
  const reasoning = supportingData?.reasoning;
  const expectedImpact = supportingData?.expected_impact;

  return (
    <div className={cn(
      'rounded-lg border p-3 space-y-2 transition-all',
      config.bg,
      config.border
    )}>
      <div className="flex items-start gap-2">
        <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', config.color)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <Badge variant="outline" className={cn('text-[10px] uppercase', config.badge)}>
              {recommendation.priority}
            </Badge>
            {recommendation.insight_category && (
              <Badge variant="outline" className="text-[10px]">
                {categoryLabels[recommendation.insight_category] || recommendation.insight_category}
              </Badge>
            )}
            <span className="text-[10px] text-muted-foreground">
              {format(new Date(recommendation.created_at), 'MMM d, HH:mm')}
            </span>
          </div>
          <p className="text-sm font-medium leading-snug">
            {recommendation.recommendation}
          </p>
        </div>
      </div>

      {(reasoning || expectedImpact) && (
        <Collapsible open={expanded} onOpenChange={setExpanded}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs w-full justify-start gap-1">
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {expanded ? 'Hide details' : 'Show details'}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 pt-2">
            {reasoning && (
              <div className="text-xs text-muted-foreground bg-background/50 rounded p-2">
                <span className="font-medium text-foreground">Why: </span>
                {reasoning}
              </div>
            )}
            {expectedImpact && (
              <div className="text-xs text-muted-foreground bg-background/50 rounded p-2">
                <span className="font-medium text-foreground">Expected Impact: </span>
                {expectedImpact}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      )}

      <div className="flex items-center gap-2 pt-1">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1 flex-1 bg-green-500/10 border-green-500/30 text-green-500 hover:bg-green-500/20"
          onClick={() => onApply(recommendation.id)}
        >
          <Check className="h-3 w-3" />
          Applied
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1 flex-1"
          onClick={() => onDismiss(recommendation.id)}
        >
          <X className="h-3 w-3" />
          Dismiss
        </Button>
      </div>
    </div>
  );
}

interface AdvisorPanelProps {
  defaultOpen?: boolean;
}

export function AdvisorPanel({ defaultOpen = true }: AdvisorPanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const { 
    recommendations, 
    loading, 
    analyzing, 
    activeCount,
    criticalCount,
    runAnalysis, 
    applyRecommendation, 
    dismissRecommendation 
  } = useAdvisor();

  return (
    <Card className="bg-card/50">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="p-3 md:p-4">
          <div className="flex items-center justify-between gap-2">
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                <Brain className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                <CardTitle className="text-base md:text-lg">AI Advisor</CardTitle>
                {activeCount > 0 && (
                  <Badge 
                    variant="default" 
                    className={cn(
                      'text-xs',
                      criticalCount > 0 && 'bg-red-500 hover:bg-red-600'
                    )}
                  >
                    {activeCount}
                  </Badge>
                )}
                {isOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
            </CollapsibleTrigger>
            <Button
              variant="outline"
              size="sm"
              onClick={runAnalysis}
              disabled={analyzing}
              className="h-8 gap-1 text-xs"
            >
              <RefreshCw className={cn('h-3 w-3', analyzing && 'animate-spin')} />
              {analyzing ? 'Analyzing...' : 'Refresh Analysis'}
            </Button>
          </div>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="p-3 md:p-4 pt-0 md:pt-0">
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : recommendations.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <Brain className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No active recommendations</p>
                <p className="text-xs mt-1">Click "Refresh Analysis" to generate insights from your bet history</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recommendations.map((rec) => (
                  <RecommendationCard
                    key={rec.id}
                    recommendation={rec}
                    onApply={applyRecommendation}
                    onDismiss={dismissRecommendation}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
