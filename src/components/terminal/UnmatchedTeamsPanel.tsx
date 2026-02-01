// ============================================================================
// V1.3 UNMATCHED TEAMS PANEL
// ============================================================================
// UI for resolving team mapping failures. Shows pending match failures
// and allows manual resolution by mapping source names to canonical names.
// ============================================================================

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronDown, ChevronUp, AlertTriangle, Check, X, RefreshCw } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface MatchFailure {
  id: string;
  poly_event_title: string;
  poly_team_a: string;
  poly_team_b: string;
  poly_condition_id: string | null;
  sport_code: string | null;
  failure_reason: string;
  occurrence_count: number;
  last_seen_at: string;
  resolution_status: string;
}

interface TeamMapping {
  sourceName: string;
  sportCode: string;
  canonicalName: string;
}

export function UnmatchedTeamsPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [failures, setFailures] = useState<MatchFailure[]>([]);
  const [loading, setLoading] = useState(false);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  // Fetch pending failures
  const fetchFailures = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('match_failures')
        .select('*')
        .eq('resolution_status', 'pending')
        .order('occurrence_count', { ascending: false })
        .limit(20);

      if (error) throw error;
      setFailures(data || []);
    } catch (err) {
      console.error('Failed to fetch match failures:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchFailures();
    }
  }, [isOpen]);

  // Handle mapping input change
  const handleMappingChange = (failureId: string, value: string) => {
    setMappings(prev => ({
      ...prev,
      [failureId]: value,
    }));
  };

  // Save a team mapping
  const handleSaveMapping = async (failure: MatchFailure, teamField: 'a' | 'b') => {
    const canonicalName = mappings[`${failure.id}_${teamField}`];
    if (!canonicalName?.trim()) {
      toast({
        title: 'Missing canonical name',
        description: 'Please enter a canonical team name',
        variant: 'destructive',
      });
      return;
    }

    const sourceName = teamField === 'a' ? failure.poly_team_a : failure.poly_team_b;
    const sportCode = failure.sport_code || 'unknown';
    
    setSaving(`${failure.id}_${teamField}`);
    try {
      // Insert into team_mappings
      const { error: mappingError } = await supabase
        .from('team_mappings')
        .insert({
          source_name: sourceName,
          canonical_name: canonicalName.trim(),
          sport_code: sportCode,
          source: 'manual',
          confidence: 1.0,
        });

      if (mappingError) throw mappingError;

      // Mark failure as resolved
      const { error: updateError } = await supabase
        .from('match_failures')
        .update({
          resolution_status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolved_mapping: `${sourceName} → ${canonicalName.trim()}`,
        })
        .eq('id', failure.id);

      if (updateError) throw updateError;

      toast({
        title: 'Mapping saved',
        description: `"${sourceName}" → "${canonicalName.trim()}"`,
      });

      // Refresh the list
      await fetchFailures();
    } catch (err) {
      console.error('Failed to save mapping:', err);
      toast({
        title: 'Save failed',
        description: String(err),
        variant: 'destructive',
      });
    } finally {
      setSaving(null);
    }
  };

  // Dismiss/ignore a failure
  const handleDismiss = async (failure: MatchFailure) => {
    try {
      const { error } = await supabase
        .from('match_failures')
        .update({
          resolution_status: 'ignored',
          resolved_at: new Date().toISOString(),
        })
        .eq('id', failure.id);

      if (error) throw error;

      toast({
        title: 'Failure dismissed',
        description: 'This failure will no longer appear in the queue',
      });

      await fetchFailures();
    } catch (err) {
      console.error('Failed to dismiss:', err);
    }
  };

  // Get badge color based on failure reason
  const getFailureReasonBadge = (reason: string) => {
    switch (reason) {
      case 'TEAM_ALIAS_MISSING':
        return <Badge variant="destructive" className="text-xs">Team Alias Missing</Badge>;
      case 'NO_BOOK_GAME_FOUND':
        return <Badge variant="secondary" className="text-xs">No Book Data</Badge>;
      case 'START_TIME_MISMATCH':
        return <Badge variant="outline" className="text-xs">Time Mismatch</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{reason}</Badge>;
    }
  };

  const pendingCount = failures.length;

  return (
    <Card className="border-dashed border-amber-500/30">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <CardTitle className="text-sm font-medium">
                  Unmatched Teams Queue
                </CardTitle>
                {pendingCount > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {pendingCount} pending
                  </Badge>
                )}
              </div>
              {isOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Map unrecognized team names to their canonical forms
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchFailures}
                disabled={loading}
              >
                <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>

            {loading && failures.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground text-sm">
                Loading...
              </div>
            ) : failures.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground text-sm">
                No unmatched teams! 🎉
              </div>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {failures.map((failure) => (
                  <div
                    key={failure.id}
                    className="border rounded-lg p-3 space-y-2 bg-card"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" title={failure.poly_event_title}>
                          {failure.poly_event_title}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            {failure.sport_code || 'Unknown'}
                          </Badge>
                          {getFailureReasonBadge(failure.failure_reason)}
                          <span className="text-xs text-muted-foreground">
                            seen {failure.occurrence_count}x
                          </span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => handleDismiss(failure)}
                        title="Dismiss this failure"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>

                    {/* Team A mapping (only for TEAM_ALIAS_MISSING) */}
                    {failure.failure_reason === 'TEAM_ALIAS_MISSING' && (
                      <div className="space-y-2">
                        {/* Team A */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-16 shrink-0">Team A:</span>
                          <span className="text-xs font-mono bg-muted px-2 py-1 rounded truncate flex-1">
                            {failure.poly_team_a}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-16 shrink-0">Map to:</span>
                          <Input
                            className="h-7 text-xs flex-1"
                            placeholder="Enter canonical name..."
                            value={mappings[`${failure.id}_a`] || ''}
                            onChange={(e) => handleMappingChange(`${failure.id}_a`, e.target.value)}
                          />
                          <Button
                            size="sm"
                            className="h-7 px-2"
                            onClick={() => handleSaveMapping(failure, 'a')}
                            disabled={saving === `${failure.id}_a`}
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                        </div>

                        {/* Team B */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-16 shrink-0">Team B:</span>
                          <span className="text-xs font-mono bg-muted px-2 py-1 rounded truncate flex-1">
                            {failure.poly_team_b}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-16 shrink-0">Map to:</span>
                          <Input
                            className="h-7 text-xs flex-1"
                            placeholder="Enter canonical name..."
                            value={mappings[`${failure.id}_b`] || ''}
                            onChange={(e) => handleMappingChange(`${failure.id}_b`, e.target.value)}
                          />
                          <Button
                            size="sm"
                            className="h-7 px-2"
                            onClick={() => handleSaveMapping(failure, 'b')}
                            disabled={saving === `${failure.id}_b`}
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Non-alias failures just show info */}
                    {failure.failure_reason !== 'TEAM_ALIAS_MISSING' && (
                      <p className="text-xs text-muted-foreground">
                        {failure.failure_reason === 'NO_BOOK_GAME_FOUND' 
                          ? 'Awaiting bookmaker coverage - no action needed'
                          : failure.failure_reason === 'START_TIME_MISMATCH'
                            ? 'Time window mismatch - verify event dates'
                            : 'Review manually'}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
