import { useState } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Search, TrendingUp, Target, DollarSign, RefreshCw, FileText, Copy, Check, Star, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { RecommendedBet, BettingModelResponse } from "@/types/model-betting";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useMyBets } from "@/hooks/useMyBets";
import { MyBetsDrawer } from "@/components/my-bets/MyBetsDrawer";

const SPORTS = [
  { id: 'soccer', label: 'Soccer', icon: '⚽' },
  { id: 'basketball', label: 'Basketball', icon: '🏀' },
  { id: 'afl', label: 'AFL', icon: '🏈' },
  { id: 'nrl', label: 'NRL', icon: '🏉' },
  { id: 'tennis', label: 'Tennis', icon: '🎾' },
];

// Tier 1: Big 5 European Leagues (best data coverage)
const TIER_1_LEAGUES = [
  { id: 'epl', label: 'Premier League', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { id: 'laliga', label: 'La Liga', flag: '🇪🇸' },
  { id: 'bundesliga', label: 'Bundesliga', flag: '🇩🇪' },
  { id: 'seriea', label: 'Serie A', flag: '🇮🇹' },
  { id: 'ligue1', label: 'Ligue 1', flag: '🇫🇷' },
];

// Tier 2: Secondary leagues
const TIER_2_LEAGUES = [
  { id: 'ucl', label: 'Champions League', flag: '🏆' },
  { id: 'uel', label: 'Europa League', flag: '🏆' },
  { id: 'argentina', label: 'Argentina Primera', flag: '🇦🇷' },
  { id: 'aleague', label: 'A-League', flag: '🇦🇺' },
];

// Tennis tournaments (Odds API event leagues/tours are not yet mapped 1:1 in the model)
const TENNIS_LEAGUES = [
  { id: 'atp', label: 'ATP Tour', flag: '🎾' },
  { id: 'wta', label: 'WTA Tour', flag: '🎾' },
  { id: 'grand_slams', label: 'Grand Slams', flag: '🏆' },
];

export default function FindBets() {
  const { toast } = useToast();
  const myBets = useMyBets();
  const [loading, setLoading] = useState(false);
  const [refreshingOdds, setRefreshingOdds] = useState(false);
  const [selectedSports, setSelectedSports] = useState<string[]>(['soccer']);
  const [selectedLeagues, setSelectedLeagues] = useState<string[]>([
    'epl', 'laliga', 'bundesliga', 'seriea', 'ligue1', 'aleague', 'argentina'
  ]);
  const [selectedTennisLeagues, setSelectedTennisLeagues] = useState<string[]>(['grand_slams']);
  const [windowHours, setWindowHours] = useState(72);
  const [bankrollUnits, setBankrollUnits] = useState(100);
  const [maxBets, setMaxBets] = useState(10);
  const [maxDailyExposure, setMaxDailyExposure] = useState(10);
  const [maxEventExposure, setMaxEventExposure] = useState(3);
  const [maxMatches, setMaxMatches] = useState(15);
  const [results, setResults] = useState<BettingModelResponse | null>(null);
  const [selectedBets, setSelectedBets] = useState<Set<number>>(new Set());
  
  // Scrape data state
  const [scraping, setScraping] = useState(false);
  const [scrapedData, setScrapedData] = useState<string>("");
  const [showScrapeDialog, setShowScrapeDialog] = useState(false);
  const [copied, setCopied] = useState(false);

  const toggleSport = (sport: string) => {
    setSelectedSports(prev => 
      prev.includes(sport) 
        ? prev.filter(s => s !== sport)
        : [...prev, sport]
    );
  };

  const toggleLeague = (league: string) => {
    setSelectedLeagues(prev => 
      prev.includes(league) 
        ? prev.filter(l => l !== league)
        : [...prev, league]
    );
  };

  const toggleTennisLeague = (league: string) => {
    setSelectedTennisLeagues(prev =>
      prev.includes(league)
        ? prev.filter(l => l !== league)
        : [...prev, league]
    );
  };

  const refreshOdds = async () => {
    setRefreshingOdds(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-odds-v3', {
        body: { sports: selectedSports }
      });
      
      if (error) throw error;
      
      toast({
        title: "Odds Updated",
        description: `Processed ${data.events_processed} events with ${data.markets_processed} markets`,
      });
    } catch (error) {
      console.error('Error refreshing odds:', error);
      toast({
        title: "Error",
        description: "Failed to refresh odds data",
        variant: "destructive",
      });
    } finally {
      setRefreshingOdds(false);
    }
  };

  const findBets = async () => {
    if (selectedSports.length === 0) {
      toast({
        title: "Select Sports",
        description: "Please select at least one sport",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const { data, error } = await supabase.functions.invoke('run-betting-model', {
        body: {
          sports: selectedSports,
          engine: 'team_sports',
          window_hours: windowHours,
          bankroll_units: bankrollUnits,
          max_daily_exposure_pct: maxDailyExposure / 100,
          max_per_event_exposure_pct: maxEventExposure / 100,
          max_bets: maxBets
        },
        headers: session ? {
          Authorization: `Bearer ${session.access_token}`
        } : undefined
      });

      if (error) throw error;

      setResults(data);
      
      if (data.recommended_bets?.length > 0) {
        toast({
          title: "Bets Found",
          description: `Found ${data.recommended_bets.length} value bets from ${data.events_analyzed} events`,
        });
      } else {
        toast({
          title: "No Bets Found",
          description: data.reason || "No bets met the criteria",
        });
      }
    } catch (error) {
      console.error('Error finding bets:', error);
      toast({
        title: "Error",
        description: "Failed to run betting model",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const scrapeData = async () => {
    // Run API-Football (quantitative) and Firecrawl (qualitative) in PARALLEL
    setScraping(true);
    setCopied(false);
    try {
      // STEP 1: Start quantitative scrape (API-Football)
      const quantitativePromise = supabase.functions.invoke('scrape-match-data', {
        body: {
          sports: selectedSports,
          window_hours: windowHours,
          max_events: maxMatches,
        },
      });

      // Wait for quantitative to get events list first
      const { data: quantData, error: quantError } = await quantitativePromise;
      
      if (quantError) throw quantError;

      // STEP 2: If we have events, run qualitative scrape in parallel with showing results
      let qualitativeContext = null;
      if (quantData.raw_data?.length > 0) {
        // Fire off qualitative scrape but don't block on it
        const qualitativePromise = supabase.functions.invoke('scrape-qualitative-context', {
          body: {
            events: quantData.raw_data.map((e: any) => ({
              id: e.event_id || e.id,
              home_team: e.home_team,
              away_team: e.away_team,
              league: e.league,
            })),
          },
        });
        
        // Try to get qualitative data (with timeout fallback)
        try {
          const { data: qualData } = await Promise.race([
            qualitativePromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 30000))
          ]) as { data: any };
          
          qualitativeContext = qualData?.qualitative_context;
          console.log('Qualitative context loaded:', qualitativeContext?.length || 0, 'events');
        } catch (qualErr) {
          console.log('Qualitative scrape skipped or timed out:', qualErr);
        }
      }

      if (quantData.formatted_data) {
        // Append qualitative context to formatted data if available
        let enrichedData = quantData.formatted_data;
        
        if (qualitativeContext && qualitativeContext.length > 0) {
          enrichedData += '\n\n═══════════════════════════════════════════════════════════════════════════════\n';
          enrichedData += '🔍 QUALITATIVE CONTEXT (Firecrawl Web Intelligence)\n';
          enrichedData += '═══════════════════════════════════════════════════════════════════════════════\n\n';
          
          for (const ctx of qualitativeContext) {
            const homeFlags = ctx.home_context?.contextual_flags || [];
            const awayFlags = ctx.away_context?.contextual_flags || [];
            const matchFlags = ctx.match_context || [];
            
            if (homeFlags.length > 0 || awayFlags.length > 0 || matchFlags.length > 0) {
              enrichedData += `📰 ${ctx.home_team} vs ${ctx.away_team}\n`;
              
              if (homeFlags.length > 0) {
                enrichedData += `   ${ctx.home_team}: [${homeFlags.join(', ')}]\n`;
              }
              if (awayFlags.length > 0) {
                enrichedData += `   ${ctx.away_team}: [${awayFlags.join(', ')}]\n`;
              }
              if (matchFlags.length > 0) {
                enrichedData += `   Match: [${matchFlags.join(', ')}]\n`;
              }
              
              // Add injury updates if present
              const homeInjuries = ctx.home_context?.injury_updates || [];
              const awayInjuries = ctx.away_context?.injury_updates || [];
              if (homeInjuries.length > 0) {
                enrichedData += `   📋 ${ctx.home_team} injuries: ${homeInjuries.slice(0, 2).join('; ')}\n`;
              }
              if (awayInjuries.length > 0) {
                enrichedData += `   📋 ${ctx.away_team} injuries: ${awayInjuries.slice(0, 2).join('; ')}\n`;
              }
              
              enrichedData += '\n';
            }
          }
          
          const totalFlags = qualitativeContext.reduce((sum: number, ctx: any) => 
            sum + (ctx.home_context?.contextual_flags?.length || 0) + 
            (ctx.away_context?.contextual_flags?.length || 0) + 
            (ctx.match_context?.length || 0), 0
          );
          enrichedData += `📊 Total qualitative signals detected: ${totalFlags}\n`;
        }
        
        setScrapedData(enrichedData);
        setShowScrapeDialog(true);
        
        const qualMessage = qualitativeContext ? ` + ${qualitativeContext.length} qualitative profiles` : '';
        toast({
          title: "Data Scraped (Parallel)",
          description: `Scraped ${quantData.matches_scraped} matches${qualMessage}`,
        });
      } else {
        toast({
          title: "No Data",
          description: quantData.error || "No matches found to scrape",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error scraping data:', error);
      toast({
        title: "Error",
        description: "Failed to scrape match data",
        variant: "destructive",
      });
    } finally {
      setScraping(false);
    }
  };


  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(scrapedData);
      setCopied(true);
      toast({
        title: "Copied!",
        description: "Data copied to clipboard",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleString('en-AU', {
      timeZone: 'Australia/Sydney',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getKickoffDisplay = (startTime: string) => {
    if (!startTime) return { time: 'TBC', countdown: null };
    
    const kickoff = new Date(startTime);
    const now = new Date();
    const diffMs = kickoff.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    const formattedTime = kickoff.toLocaleString('en-AU', {
      timeZone: 'Australia/Sydney',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
    
    if (diffHours < 0) {
      return { time: formattedTime, countdown: 'LIVE' };
    } else if (diffHours < 2) {
      const hours = Math.floor(diffMins / 60);
      const mins = diffMins % 60;
      return { 
        time: formattedTime, 
        countdown: hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
      };
    }
    
    return { time: formattedTime, countdown: null };
  };

  const getBetScoreBadge = (score: number) => {
    if (score >= 85) return <Badge className="bg-profit text-white">{score}</Badge>;
    if (score >= 75) return <Badge className="bg-warning text-black">{score}</Badge>;
    return <Badge variant="secondary">{score}</Badge>;
  };

  const getConfidenceBadge = (confidence: 'high' | 'medium' | 'low') => {
    switch (confidence) {
      case 'high':
        return <Badge className="bg-profit/20 text-profit border-profit/30">High</Badge>;
      case 'medium':
        return <Badge className="bg-warning/20 text-warning border-warning/30">Medium</Badge>;
      case 'low':
        return <Badge variant="outline" className="text-muted-foreground">Low</Badge>;
    }
  };

  const getEdgeBadge = (edge: number) => {
    const edgePct = (edge * 100).toFixed(1);
    if (edge >= 0.05) return <Badge className="bg-profit text-white">+{edgePct}%</Badge>;
    if (edge >= 0.02) return <Badge className="bg-warning text-black">+{edgePct}%</Badge>;
    if (edge >= 0) return <Badge variant="secondary">+{edgePct}%</Badge>;
    return <Badge variant="outline" className="text-muted-foreground">{edgePct}%</Badge>;
  };

  const toggleBetSelection = (index: number) => {
    setSelectedBets(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const selectAllBets = () => {
    if (!results?.recommended_bets) return;
    const allIndexes = results.recommended_bets.map((_, i) => i);
    setSelectedBets(new Set(allIndexes));
  };

  const deselectAllBets = () => {
    setSelectedBets(new Set());
  };

  const addSelectedToMyBets = () => {
    if (!results?.recommended_bets) return;
    const betsToAdd = results.recommended_bets.filter((_, i) => selectedBets.has(i));
    myBets.addMultipleBets(betsToAdd);
    toast({
      title: "Bets Added",
      description: `Added ${betsToAdd.length} bet(s) to My Bets`,
    });
    setSelectedBets(new Set());
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Find Best Bets</h1>
            <p className="text-muted-foreground">AI-powered value bet detection</p>
          </div>
          <div className="flex items-center gap-2">
            <MyBetsDrawer
              bets={myBets.bets}
              onRemove={myBets.removeBet}
              onUpdateFromRecheck={myBets.updateBetFromRecheck}
              onSetStatus={myBets.setStatus}
              onClearAll={myBets.clearAll}
            />
            <Button
              variant="outline"
              onClick={refreshOdds}
              disabled={refreshingOdds}
              className="gap-2"
            >
              {refreshingOdds ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Refresh Odds
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Filters Panel */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>Parameters</CardTitle>
              <CardDescription>Configure your betting model</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Sports Selection */}
              <div className="space-y-3">
                <Label>Sports</Label>
                <div className="space-y-2">
                  {SPORTS.map(sport => (
                    <div key={sport.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={sport.id}
                        checked={selectedSports.includes(sport.id)}
                        onCheckedChange={() => toggleSport(sport.id)}
                      />
                      <label 
                        htmlFor={sport.id}
                        className="text-sm cursor-pointer flex items-center gap-2"
                      >
                        <span>{sport.icon}</span>
                        {sport.label}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              {/* League Selection */}
              {selectedSports.includes('soccer') && (
                <div className="space-y-3">
                  <Label>Leagues (Soccer Tier 1)</Label>
                  <div className="space-y-2">
                    {TIER_1_LEAGUES.map(league => (
                      <div key={league.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={league.id}
                          checked={selectedLeagues.includes(league.id)}
                          onCheckedChange={() => toggleLeague(league.id)}
                        />
                        <label 
                          htmlFor={league.id}
                          className="text-sm cursor-pointer flex items-center gap-2"
                        >
                          <span>{league.flag}</span>
                          {league.label}
                        </label>
                      </div>
                    ))}
                  </div>
                  <Label className="mt-2">Leagues (Soccer Tier 2)</Label>
                  <div className="space-y-2">
                    {TIER_2_LEAGUES.map(league => (
                      <div key={league.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={league.id}
                          checked={selectedLeagues.includes(league.id)}
                          onCheckedChange={() => toggleLeague(league.id)}
                        />
                        <label 
                          htmlFor={league.id}
                          className="text-sm cursor-pointer flex items-center gap-2"
                        >
                          <span>{league.flag}</span>
                          {league.label}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedSports.includes('tennis') && !selectedSports.includes('soccer') && (
                <div className="space-y-3">
                  <Label>Leagues (Tennis)</Label>
                  <div className="space-y-2">
                    {TENNIS_LEAGUES.map(league => (
                      <div key={league.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`tennis_${league.id}`}
                          checked={selectedTennisLeagues.includes(league.id)}
                          onCheckedChange={() => toggleTennisLeague(league.id)}
                        />
                        <label
                          htmlFor={`tennis_${league.id}`}
                          className="text-sm cursor-pointer flex items-center gap-2"
                        >
                          <span>{league.flag}</span>
                          {league.label}
                        </label>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Tennis league filtering is being wired into the model; odds refresh already pulls tennis events.
                  </p>
                </div>
              )}

              {/* Time Window */}
              <div className="space-y-2">
                <Label htmlFor="window">Time Window (hours)</Label>
                <Input
                  id="window"
                  type="number"
                  value={windowHours}
                  onChange={(e) => setWindowHours(parseInt(e.target.value) || 72)}
                  min={1}
                  max={168}
                />
              </div>

              {/* Bankroll */}
              <div className="space-y-2">
                <Label htmlFor="bankroll">Bankroll (units)</Label>
                <Input
                  id="bankroll"
                  type="number"
                  value={bankrollUnits}
                  onChange={(e) => setBankrollUnits(parseInt(e.target.value) || 100)}
                  min={10}
                />
              </div>

              {/* Max Bets */}
              <div className="space-y-2">
                <Label htmlFor="maxBets">Max Bets</Label>
                <Input
                  id="maxBets"
                  type="number"
                  value={maxBets}
                  onChange={(e) => setMaxBets(parseInt(e.target.value) || 10)}
                  min={1}
                  max={50}
                />
              </div>

              {/* Daily Exposure */}
              <div className="space-y-2">
                <Label htmlFor="dailyExp">Max Daily Exposure (%)</Label>
                <Input
                  id="dailyExp"
                  type="number"
                  value={maxDailyExposure}
                  onChange={(e) => setMaxDailyExposure(parseInt(e.target.value) || 10)}
                  min={1}
                  max={50}
                />
              </div>

              {/* Event Exposure */}
              <div className="space-y-2">
                <Label htmlFor="eventExp">Max Event Exposure (%)</Label>
                <Input
                  id="eventExp"
                  type="number"
                  value={maxEventExposure}
                  onChange={(e) => setMaxEventExposure(parseInt(e.target.value) || 3)}
                  min={1}
                  max={20}
                />
              </div>

              {/* Max Matches for Scraping */}
              <div className="space-y-2">
                <Label htmlFor="maxMatches">Max Matches to Analyze</Label>
                <Input
                  id="maxMatches"
                  type="number"
                  value={maxMatches}
                  onChange={(e) => setMaxMatches(parseInt(e.target.value) || 15)}
                  min={1}
                  max={30}
                />
                <p className="text-xs text-muted-foreground">~8 API calls per match</p>
              </div>

              <Button 
                onClick={findBets} 
                disabled={loading}
                className="w-full gap-2"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                Find Best Bets
              </Button>

              <Button 
                onClick={scrapeData} 
                disabled={scraping}
                variant="outline"
                className="w-full gap-2"
              >
                {scraping ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
                Scrape Data Only
              </Button>
            </CardContent>
          </Card>

          {/* Results Panel */}
          <div className="lg:col-span-3 space-y-6">
            {/* Summary Cards */}
            {results && results.portfolio_summary && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Target className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Bets Found</p>
                        <p className="text-2xl font-bold">{results.recommended_bets.length}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <DollarSign className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Total Stake</p>
                        <p className="text-2xl font-bold">{results.portfolio_summary.total_stake_units.toFixed(1)}u</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-profit/10">
                        <TrendingUp className="h-5 w-5 text-profit" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Expected Value</p>
                        <p className="text-2xl font-bold text-profit">
                          +{results.portfolio_summary.expected_value_units.toFixed(2)}u
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Bets Table */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Recommended Bets</CardTitle>
                    <CardDescription>
                      {results 
                        ? `${results.events_analyzed} events analyzed`
                        : 'Configure parameters and click "Find Best Bets"'
                      }
                    </CardDescription>
                  </div>
                  {results?.recommended_bets && results.recommended_bets.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={selectedBets.size === results.recommended_bets.length ? deselectAllBets : selectAllBets}
                      >
                        {selectedBets.size === results.recommended_bets.length ? 'Deselect All' : 'Select All'}
                      </Button>
                      {selectedBets.size > 0 && (
                        <Button
                          size="sm"
                          onClick={addSelectedToMyBets}
                          className="gap-2"
                        >
                          <Plus className="h-4 w-4" />
                          Add {selectedBets.size} to My Bets
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
                      <p className="text-muted-foreground">Running AI betting model...</p>
                    </div>
                  </div>
                ) : results?.recommended_bets && results.recommended_bets.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12"></TableHead>
                          <TableHead>Head to Head</TableHead>
                          <TableHead>Kickoff</TableHead>
                          <TableHead>Selection</TableHead>
                          <TableHead className="text-center">Odds</TableHead>
                          <TableHead className="text-center">Confidence</TableHead>
                          <TableHead className="text-center">Bet Score</TableHead>
                          <TableHead className="text-center">Edge</TableHead>
                          <TableHead className="text-center">Stake</TableHead>
                          <TableHead>Rationale</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {results.recommended_bets.map((bet, idx) => {
                          const kickoff = getKickoffDisplay(bet.start_time || '');
                          const isAlreadyAdded = myBets.isBetAdded(bet.event_id, bet.selection);
                          const isSelected = selectedBets.has(idx);
                          return (
                            <TableRow 
                              key={idx} 
                              className={`${bet.confidence === 'high' ? 'bg-profit/5' : ''} ${isSelected ? 'bg-primary/10' : ''} ${isAlreadyAdded ? 'opacity-50' : ''}`}
                            >
                              <TableCell>
                                {isAlreadyAdded ? (
                                  <Star className="h-4 w-4 text-primary fill-primary" />
                                ) : (
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={() => toggleBetSelection(idx)}
                                  />
                                )}
                              </TableCell>
                              <TableCell>
                                <div>
                                  <p className="font-medium text-sm">{bet.event_name || bet.selection_label.split(' to ')[0] || bet.selection}</p>
                                  <p className="text-xs text-muted-foreground">{bet.league}</p>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-col gap-1">
                                  <span className="text-sm">{kickoff.time}</span>
                                  {kickoff.countdown && (
                                    <Badge 
                                      variant={kickoff.countdown === 'LIVE' ? 'destructive' : 'secondary'}
                                      className={kickoff.countdown === 'LIVE' ? 'animate-pulse w-fit' : 'w-fit'}
                                    >
                                      {kickoff.countdown === 'LIVE' ? '🔴 LIVE' : `⏱️ ${kickoff.countdown}`}
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div>
                                  <p className="font-medium">{bet.selection_label}</p>
                                  <p className="text-xs text-muted-foreground">{bet.bookmaker}</p>
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                <span className="font-mono font-bold">{(bet.odds_decimal ?? 0).toFixed(2)}</span>
                              </TableCell>
                              <TableCell className="text-center">
                                {getConfidenceBadge(bet.confidence || 'low')}
                              </TableCell>
                              <TableCell className="text-center">
                                {getBetScoreBadge(bet.bet_score ?? 0)}
                              </TableCell>
                              <TableCell className="text-center">
                                {getEdgeBadge(bet.edge ?? 0)}
                              </TableCell>
                              <TableCell className="text-center">
                                <span className="font-mono font-bold">{(bet.recommended_stake_units ?? 0).toFixed(1)}u</span>
                              </TableCell>
                              <TableCell>
                                <p className="text-sm text-muted-foreground max-w-xs truncate" title={bet.rationale}>
                                  {bet.rationale}
                                </p>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : results ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Target className="h-12 w-12 mx-auto mb-4 opacity-20" />
                    <p>No value bets found</p>
                    <p className="text-sm">{results.reason || 'Try adjusting your parameters or wait for more events'}</p>
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <Search className="h-12 w-12 mx-auto mb-4 opacity-20" />
                    <p>Select your sports and click "Find Best Bets"</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Scrape Data Dialog */}
      <Dialog open={showScrapeDialog} onOpenChange={setShowScrapeDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Scraped Match Data
            </DialogTitle>
            <DialogDescription>
              Copy this data and paste it into Perplexity for manual analysis
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={copyToClipboard} variant="outline" className="gap-2">
                {copied ? (
                  <>
                    <Check className="h-4 w-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy to Clipboard
                  </>
                )}
              </Button>
            </div>
            <Textarea 
              value={scrapedData}
              readOnly
              className="h-[50vh] font-mono text-xs"
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
