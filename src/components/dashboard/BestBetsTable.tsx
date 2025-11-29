import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, XCircle, TrendingUp, Filter, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ValueBet, ConfidenceLevel } from "@/types/betting";

// Mock data for demonstration
const mockBets: ValueBet[] = [
  {
    id: "1",
    market: "1x2",
    selection: "Liverpool Win",
    offered_odds: 2.10,
    fair_odds: 1.85,
    implied_probability: 47.6,
    actual_probability: 54.1,
    expected_value: 0.136,
    edge: 13.5,
    confidence: "high",
    min_odds: 1.85,
    suggested_stake_percent: 4,
    reasoning: "Liverpool's home form (4W-1D) combined with Arsenal's poor away record suggests value. Expected goals model favors Liverpool 1.8-1.2.",
    meets_criteria: true,
    is_active: true,
    created_at: new Date().toISOString(),
    match: {
      id: "m1",
      home_team: "Liverpool",
      away_team: "Arsenal",
      league: "Premier League",
      match_date: new Date(Date.now() + 86400000).toISOString(),
      home_form: "WWDWW",
      away_form: "WLDWL"
    }
  },
  {
    id: "2",
    market: "over_under",
    selection: "Over 2.5 Goals",
    offered_odds: 1.90,
    fair_odds: 1.75,
    implied_probability: 52.6,
    actual_probability: 57.1,
    expected_value: 0.085,
    edge: 8.5,
    confidence: "moderate",
    min_odds: 1.75,
    suggested_stake_percent: 2.5,
    reasoning: "Both teams averaging 2.8 goals per game. Head-to-head shows 4/5 recent meetings over 2.5 goals.",
    meets_criteria: true,
    is_active: true,
    created_at: new Date().toISOString(),
    match: {
      id: "m2",
      home_team: "Man City",
      away_team: "Chelsea",
      league: "Premier League",
      match_date: new Date(Date.now() + 172800000).toISOString(),
      home_form: "WWWWL",
      away_form: "WDWLD"
    }
  },
  {
    id: "3",
    market: "btts",
    selection: "Both Teams to Score - Yes",
    offered_odds: 1.75,
    fair_odds: 1.65,
    implied_probability: 57.1,
    actual_probability: 60.6,
    expected_value: 0.061,
    edge: 6.1,
    confidence: "moderate",
    min_odds: 1.65,
    suggested_stake_percent: 2,
    reasoning: "Barcelona's defense has conceded in 8/10 home games. Real Madrid score in every away match.",
    meets_criteria: true,
    is_active: true,
    created_at: new Date().toISOString(),
    match: {
      id: "m3",
      home_team: "Barcelona",
      away_team: "Real Madrid",
      league: "La Liga",
      match_date: new Date(Date.now() + 259200000).toISOString(),
      home_form: "WDWWW",
      away_form: "WWWDW"
    }
  },
  {
    id: "4",
    market: "1x2",
    selection: "Juventus Draw",
    offered_odds: 3.40,
    fair_odds: 3.20,
    implied_probability: 29.4,
    actual_probability: 31.3,
    expected_value: 0.064,
    edge: 6.25,
    confidence: "low",
    min_odds: 3.20,
    suggested_stake_percent: 1.5,
    reasoning: "Juventus drawn 5/8 home games. AC Milan's away form (2D in last 4) supports draw potential.",
    meets_criteria: true,
    is_active: true,
    created_at: new Date().toISOString(),
    match: {
      id: "m4",
      home_team: "Juventus",
      away_team: "AC Milan",
      league: "Serie A",
      match_date: new Date(Date.now() + 345600000).toISOString(),
      home_form: "DDDWW",
      away_form: "WDDLD"
    }
  },
];

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

const getMarketLabel = (market: string) => {
  switch (market) {
    case "1x2": return "Win/Draw/Win";
    case "over_under": return "Over/Under";
    case "btts": return "Both Teams Score";
    case "handicap": return "Handicap";
    default: return market;
  }
};

export function BestBetsTable() {
  const [filter, setFilter] = useState<string>("all");
  const [bets] = useState<ValueBet[]>(mockBets);

  const filteredBets = bets.filter(bet => {
    if (filter === "all") return bet.meets_criteria;
    if (filter === "high") return bet.confidence === "high" && bet.meets_criteria;
    if (filter === "value") return bet.expected_value > 0.1 && bet.meets_criteria;
    return bet.meets_criteria;
  });

  return (
    <div className="stat-card space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-foreground">Daily Best Bets</h3>
          <p className="text-sm text-muted-foreground">AI-analyzed value betting opportunities</p>
        </div>
        <div className="flex items-center gap-3">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[180px] bg-muted border-border">
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

      <div className="overflow-x-auto -mx-6 px-6">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground">Match</TableHead>
              <TableHead className="text-muted-foreground">Market</TableHead>
              <TableHead className="text-muted-foreground text-center">EV</TableHead>
              <TableHead className="text-muted-foreground text-center">
                <div className="flex items-center justify-center gap-1">
                  Criteria
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-3 w-3" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>EV &gt; 5%, Edge &gt; 0%, Actual Prob &gt; Implied</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </TableHead>
              <TableHead className="text-muted-foreground text-center">Min Odds</TableHead>
              <TableHead className="text-muted-foreground text-center">Offered</TableHead>
              <TableHead className="text-muted-foreground text-center">Confidence</TableHead>
              <TableHead className="text-muted-foreground text-center">Stake %</TableHead>
              <TableHead className="text-muted-foreground">Reasoning</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredBets.map((bet) => (
              <TableRow key={bet.id} className="border-border hover:bg-muted/30 transition-colors">
                <TableCell>
                  <div>
                    <p className="font-medium text-foreground">
                      {bet.match?.home_team} vs {bet.match?.away_team}
                    </p>
                    <p className="text-xs text-muted-foreground">{bet.match?.league}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <div>
                    <p className="text-sm text-foreground">{getMarketLabel(bet.market)}</p>
                    <p className="text-xs text-primary font-medium">{bet.selection}</p>
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <span className={cn(
                    "font-mono font-bold",
                    bet.expected_value >= 0.1 ? "text-profit" : bet.expected_value >= 0.05 ? "text-warning" : "text-foreground"
                  )}>
                    +{(bet.expected_value * 100).toFixed(1)}%
                  </span>
                </TableCell>
                <TableCell className="text-center">
                  {bet.meets_criteria ? (
                    <CheckCircle2 className="h-5 w-5 text-profit mx-auto" />
                  ) : (
                    <XCircle className="h-5 w-5 text-loss mx-auto" />
                  )}
                </TableCell>
                <TableCell className="text-center font-mono text-foreground">{bet.min_odds.toFixed(2)}</TableCell>
                <TableCell className="text-center">
                  <span className="font-mono font-bold text-profit">{bet.offered_odds.toFixed(2)}</span>
                </TableCell>
                <TableCell className="text-center">{getConfidenceBadge(bet.confidence)}</TableCell>
                <TableCell className="text-center">
                  <span className={cn(
                    "font-mono font-medium",
                    bet.suggested_stake_percent >= 3 ? "text-profit" : "text-foreground"
                  )}>
                    {bet.suggested_stake_percent}%
                  </span>
                </TableCell>
                <TableCell className="max-w-xs">
                  <p className="text-xs text-muted-foreground line-clamp-2">{bet.reasoning}</p>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {filteredBets.length === 0 && (
        <div className="text-center py-8">
          <p className="text-muted-foreground">No value bets found matching your criteria.</p>
        </div>
      )}
    </div>
  );
}
