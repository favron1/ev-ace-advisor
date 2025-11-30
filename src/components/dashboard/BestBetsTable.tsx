import { useState, useEffect } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, XCircle, Filter, Info, RefreshCw, Loader2, Plus, Check, Clock, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useBetSlip } from "@/contexts/BetSlipContext";
import type { ConfidenceLevel } from "@/types/betting";

interface LiveBet {
  id: string;
  event: string;
  selection: string;
  odds: number;
  fairOdds: number;
  edge: number;
  ev: number;
  confidence: "high" | "medium" | "low";
  sport?: string;
  commenceTime?: string;
  bookmaker?: string;
}

interface DisplayBet {
  id: string;
  match: string;
  league: string;
  market: string;
  selection: string;
  offered_odds: number;
  fair_odds: number;
  expected_value: number;
  edge: number;
  confidence: ConfidenceLevel;
  suggested_stake_percent: number;
  reasoning: string;
  meets_criteria: boolean;
  bookmaker: string;
  commenceTime: string;
  status: "upcoming" | "live" | "resulted";
}

const getConfidenceBadge = (confidence: ConfidenceLevel) => {
  switch (confidence) {
    case "high":
      return <Badge className="bg-profit/20 text-profit border-profit/30 hover:bg-profit/30">High</Badge>;
    case "moderate":
      return <Badge className="bg-warning/20 text-warning border-warning/30 hover:bg-warning/30">Moderate</Badge>;
    case "low":
      return <Badge className="bg-muted text-muted-foreground border-border hover:bg-muted/80">Low</Badge>;
  }
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case "live":
      return <Badge className="bg-loss/20 text-loss border-loss/30 animate-pulse">LIVE</Badge>;
    case "resulted":
      return <Badge className="bg-muted text-muted-foreground border-border">Ended</Badge>;
    default:
      return null;
  }
};

const mapConfidence = (conf: "high" | "medium" | "low"): ConfidenceLevel => {
  if (conf === "medium") return "moderate";
  return conf as ConfidenceLevel;
};

const calculateStake = (edge: number, confidence: string): number => {
  const baseStake = edge / 100;
  const confMultiplier = confidence === "high" ? 1.5 : confidence === "medium" ? 1 : 0.5;
  return Math.min(Math.max(baseStake * confMultiplier * 10, 0.5), 5);
};

const getMatchStatus = (commenceTime: string): "upcoming" | "live" | "resulted" => {
  const now = new Date();
  const matchTime = new Date(commenceTime);
  const matchEndEstimate = new Date(matchTime.getTime() + 2 * 60 * 60 * 1000); // +2 hours
  
  if (now < matchTime) return "upcoming";
  if (now >= matchTime && now <= matchEndEstimate) return "live";
  return "resulted";
};

const formatDateTime = (isoString?: string) => {
  if (!isoString) return { date: '', time: '' };
  const date = new Date(isoString);
  return {
    date: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    time: date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  };
};

export function BestBetsTable() {
  const [filter, setFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [bets, setBets] = useState<DisplayBet[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const { toast } = useToast();
  const { addToSlip, isInSlip } = useBetSlip();

  const fetchLiveOdds = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-odds');

      if (error) {
        console.error('Error fetching odds:', error);
        toast({
          title: "Error fetching odds",
          description: error.message || "Failed to fetch live odds",
          variant: "destructive",
        });
        return;
      }

      if (data?.bets) {
        const transformedBets: DisplayBet[] = data.bets.map((bet: LiveBet) => {
          const status = getMatchStatus(bet.commenceTime || '');
          return {
            id: bet.id,
            match: bet.event,
            league: bet.sport || 'Football',
            market: '1x2',
            selection: bet.selection,
            offered_odds: bet.odds,
            fair_odds: bet.fairOdds,
            expected_value: bet.ev / 100,
            edge: bet.edge,
            confidence: mapConfidence(bet.confidence),
            suggested_stake_percent: calculateStake(bet.edge, bet.confidence),
            reasoning: `Best odds at ${bet.bookmaker}.`,
            meets_criteria: bet.edge > 2,
            bookmaker: bet.bookmaker || 'Unknown',
            commenceTime: bet.commenceTime || '',
            status: status,
          };
        });

        setBets(transformedBets);
        setLastUpdated(new Date());
        toast({
          title: "Odds updated",
          description: `Found ${transformedBets.length} value betting opportunities`,
        });
      }
    } catch (err) {
      console.error('Error:', err);
      toast({
        title: "Error",
        description: "Failed to connect to odds service",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveOdds();
  }, []);

  const filteredBets = bets
    .filter(bet => {
      // Confidence filter
      let passesConfidence = true;
      if (filter === "high") passesConfidence = bet.confidence === "high" && bet.meets_criteria;
      else if (filter === "value") passesConfidence = bet.expected_value > 0.1 && bet.meets_criteria;
      else passesConfidence = bet.meets_criteria;

      // Status filter
      let passesStatus = true;
      if (statusFilter === "live") passesStatus = bet.status === "live";
      else if (statusFilter === "upcoming") passesStatus = bet.status === "upcoming";
      else if (statusFilter === "resulted") passesStatus = bet.status === "resulted";

      return passesConfidence && passesStatus;
    })
    // Sort by commence time (soonest first)
    .sort((a, b) => {
      if (!a.commenceTime && !b.commenceTime) return 0;
      if (!a.commenceTime) return 1;
      if (!b.commenceTime) return -1;
      return new Date(a.commenceTime).getTime() - new Date(b.commenceTime).getTime();
    });

  const handleAddToSlip = (bet: DisplayBet) => {
    addToSlip({
      id: bet.id,
      match: bet.match,
      selection: bet.selection,
      odds: bet.offered_odds,
      league: bet.league,
      commenceTime: bet.commenceTime,
      bookmaker: bet.bookmaker,
    });
  };

  return (
    <div className="stat-card space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-foreground">Daily Best Bets</h3>
          <p className="text-sm text-muted-foreground">
            {lastUpdated 
              ? `Live odds • Updated ${lastUpdated.toLocaleTimeString()}`
              : 'AI-analyzed value betting opportunities'
            }
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchLiveOdds}
            disabled={loading}
            className="gap-2"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {loading ? 'Loading...' : 'Refresh'}
          </Button>
          
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] bg-muted border-border">
              <Clock className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Games</SelectItem>
              <SelectItem value="upcoming">Upcoming</SelectItem>
              <SelectItem value="live">In Progress</SelectItem>
              <SelectItem value="resulted">Resulted</SelectItem>
            </SelectContent>
          </Select>

          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[160px] bg-muted border-border">
              <SelectValue placeholder="Filter bets" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Value Bets</SelectItem>
              <SelectItem value="high">High Confidence</SelectItem>
              <SelectItem value="value">High EV (&gt;10%)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading && bets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-10 w-10 animate-spin mb-4" />
          <p className="font-medium">Scanning live markets...</p>
          <p className="text-sm">Fetching odds from multiple bookmakers</p>
        </div>
      ) : (
        <div className="overflow-x-auto -mx-6 px-6">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground w-[100px]">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Time
                  </div>
                </TableHead>
                <TableHead className="text-muted-foreground">Match</TableHead>
                <TableHead className="text-muted-foreground">Selection</TableHead>
                <TableHead className="text-muted-foreground text-center">Edge</TableHead>
                <TableHead className="text-muted-foreground text-center">
                  <div className="flex items-center justify-center gap-1">
                    Criteria
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="h-3 w-3" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Edge &gt; 2%, Best odds vs fair odds</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </TableHead>
                <TableHead className="text-muted-foreground text-center">Fair Odds</TableHead>
                <TableHead className="text-muted-foreground text-center">Best Odds</TableHead>
                <TableHead className="text-muted-foreground text-center">Bookmaker</TableHead>
                <TableHead className="text-muted-foreground text-center">Confidence</TableHead>
                <TableHead className="text-muted-foreground text-center">Stake %</TableHead>
                <TableHead className="text-muted-foreground text-center">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredBets.map((bet) => {
                const { date, time } = formatDateTime(bet.commenceTime);
                const inSlip = isInSlip(bet.id);
                
                return (
                  <TableRow key={bet.id} className="border-border hover:bg-muted/30 transition-colors">
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <span className="text-xs font-medium text-foreground">{date}</span>
                        <span className="text-xs text-muted-foreground">{time}</span>
                        {getStatusBadge(bet.status)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-foreground">{bet.match}</p>
                        <p className="text-xs text-muted-foreground">{bet.league}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium text-primary">{bet.selection}</p>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={cn(
                        "font-mono font-bold",
                        bet.edge >= 15 ? "text-profit" : bet.edge >= 8 ? "text-warning" : "text-foreground"
                      )}>
                        +{bet.edge.toFixed(1)}%
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {bet.meets_criteria ? (
                        <CheckCircle2 className="h-5 w-5 text-profit mx-auto" />
                      ) : (
                        <XCircle className="h-5 w-5 text-loss mx-auto" />
                      )}
                    </TableCell>
                    <TableCell className="text-center font-mono text-muted-foreground">{bet.fair_odds.toFixed(2)}</TableCell>
                    <TableCell className="text-center">
                      <span className="font-mono font-bold text-profit">{bet.offered_odds.toFixed(2)}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-xs text-muted-foreground">{bet.bookmaker}</span>
                    </TableCell>
                    <TableCell className="text-center">{getConfidenceBadge(bet.confidence)}</TableCell>
                    <TableCell className="text-center">
                      <span className={cn(
                        "font-mono font-medium",
                        bet.suggested_stake_percent >= 3 ? "text-profit" : "text-foreground"
                      )}>
                        {bet.suggested_stake_percent.toFixed(1)}%
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant={inSlip ? "secondary" : "outline"}
                        size="sm"
                        onClick={() => handleAddToSlip(bet)}
                        disabled={inSlip || bet.status === "resulted"}
                        className={cn(
                          "gap-1",
                          inSlip && "bg-profit/20 text-profit border-profit/30"
                        )}
                      >
                        {inSlip ? (
                          <>
                            <Check className="h-3 w-3" />
                            Added
                          </>
                        ) : (
                          <>
                            <Plus className="h-3 w-3" />
                            Add
                          </>
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {!loading && filteredBets.length === 0 && (
        <div className="text-center py-8">
          <p className="text-muted-foreground">No value bets found matching your criteria.</p>
          <p className="text-sm text-muted-foreground mt-1">Try refreshing or adjusting filters</p>
        </div>
      )}
    </div>
  );
}
