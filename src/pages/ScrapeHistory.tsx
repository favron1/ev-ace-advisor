import { useState, useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Copy, Check, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface ScrapeRecord {
  id: string;
  scraped_at: string;
  sports: string[];
  leagues: string[];
  window_hours: number;
  matches_count: number;
  summary: string;
  formatted_data: string;
  raw_data: any;
}

export default function ScrapeHistory() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [scrapes, setScrapes] = useState<ScrapeRecord[]>([]);
  const [selectedScrape, setSelectedScrape] = useState<ScrapeRecord | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const fetchScrapes = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('scrape_history')
        .select('*')
        .order('scraped_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setScrapes(data || []);
    } catch (error) {
      console.error('Error fetching scrape history:', error);
      toast({
        title: "Error",
        description: "Failed to load scrape history",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScrapes();
  }, []);

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleString('en-AU', {
      timeZone: 'Australia/Sydney',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
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

  const viewScrape = (scrape: ScrapeRecord) => {
    setSelectedScrape(scrape);
    setShowDialog(true);
  };

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const getQualityBadge = (summary: string) => {
    const match = summary.match(/^(\d+)\/(\d+)/);
    if (match) {
      const complete = parseInt(match[1]);
      const total = parseInt(match[2]);
      const pct = total > 0 ? (complete / total) * 100 : 0;
      
      if (pct >= 80) return <Badge className="bg-profit text-white">{complete}/{total}</Badge>;
      if (pct >= 50) return <Badge className="bg-warning text-black">{complete}/{total}</Badge>;
      return <Badge variant="destructive">{complete}/{total}</Badge>;
    }
    return <Badge variant="secondary">{summary.split(' ')[0]}</Badge>;
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Scrape History</h1>
            <p className="text-muted-foreground">View past data scrapes and exports</p>
          </div>
          <Button
            variant="outline"
            onClick={fetchScrapes}
            disabled={loading}
            className="gap-2"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recent Scrapes</CardTitle>
            <CardDescription>Last 50 data scrapes with quality metrics</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : scrapes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No scrapes yet. Run a scrape from the Find Bets page.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]"></TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Quality</TableHead>
                    <TableHead>Leagues</TableHead>
                    <TableHead>Window</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scrapes.map((scrape) => (
                    <Collapsible key={scrape.id} asChild open={expandedRows.has(scrape.id)}>
                      <>
                        <TableRow className="cursor-pointer hover:bg-muted/50">
                          <TableCell>
                            <CollapsibleTrigger asChild onClick={() => toggleRow(scrape.id)}>
                              <Button variant="ghost" size="sm" className="p-0 h-6 w-6">
                                {expandedRows.has(scrape.id) ? (
                                  <ChevronUp className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                              </Button>
                            </CollapsibleTrigger>
                          </TableCell>
                          <TableCell className="font-medium">
                            {formatDate(scrape.scraped_at)}
                          </TableCell>
                          <TableCell>
                            {getQualityBadge(scrape.summary)}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {scrape.leagues?.slice(0, 3).map((league, i) => (
                                <Badge key={i} variant="outline" className="text-xs">
                                  {league}
                                </Badge>
                              ))}
                              {scrape.leagues?.length > 3 && (
                                <Badge variant="outline" className="text-xs">
                                  +{scrape.leagues.length - 3}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{scrape.window_hours}h</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => viewScrape(scrape)}
                              >
                                View
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyToClipboard(scrape.formatted_data)}
                              >
                                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        <CollapsibleContent asChild>
                          <TableRow className="bg-muted/30">
                            <TableCell colSpan={6} className="p-4">
                              <div className="space-y-2">
                                <p className="text-sm font-medium">Summary</p>
                                <p className="text-sm text-muted-foreground">{scrape.summary}</p>
                                
                                {scrape.raw_data?.stats_quality && (
                                  <div className="flex gap-4 text-sm">
                                    <span>Total: {scrape.raw_data.stats_quality.total}</span>
                                    <span className="text-profit">Complete: {scrape.raw_data.stats_quality.complete}</span>
                                    <span className="text-destructive">Incomplete: {scrape.raw_data.stats_quality.incomplete}</span>
                                  </div>
                                )}
                                
                                {scrape.raw_data?.incomplete_events?.length > 0 && (
                                  <div className="mt-2">
                                    <p className="text-sm font-medium text-destructive">Data Quality Issues:</p>
                                    <ul className="text-xs text-muted-foreground mt-1 space-y-1">
                                      {scrape.raw_data.incomplete_events.slice(0, 5).map((e: any, i: number) => (
                                        <li key={i}>• {e.match}: {e.incomplete_reason}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        </CollapsibleContent>
                      </>
                    </Collapsible>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Full Data Dialog */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="max-w-4xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle>
                Scrape Data - {selectedScrape && formatDate(selectedScrape.scraped_at)}
              </DialogTitle>
              <DialogDescription>
                {selectedScrape?.summary}
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end mb-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => selectedScrape && copyToClipboard(selectedScrape.formatted_data)}
                className="gap-2"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                Copy to Clipboard
              </Button>
            </div>
            <Textarea
              value={selectedScrape?.formatted_data || ''}
              readOnly
              className="font-mono text-xs h-[50vh]"
            />
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
