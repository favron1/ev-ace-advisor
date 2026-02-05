 import { useState } from "react";
 import { Link } from "react-router-dom";
 import { ArrowLeft, Upload, Eye, AlertCircle, CheckCircle, XCircle, Loader2 } from "lucide-react";
 import { Button } from "@/components/ui/button";
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
 import { Textarea } from "@/components/ui/textarea";
 import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
 import { Badge } from "@/components/ui/badge";
 import { useToast } from "@/hooks/use-toast";
 import { supabase } from "@/integrations/supabase/client";
 import { parseBatchImport, ParsedMarket, ParseResult } from "@/lib/batch-parser";

// After successful import, trigger token repair for batch-imported markets
async function triggerTokenRepair(markets: Array<{ sport: string; homeTeam: string; awayTeam: string }>) {
  const repairPromises = markets.slice(0, 10).map(async (market) => {
    try {
      await supabase.functions.invoke('tokenize-market', {
        body: {
          teamHome: market.homeTeam,
          teamAway: market.awayTeam,
          sport: market.sport,
        },
      });
    } catch (err) {
      console.log(`[token-repair] Failed for ${market.homeTeam} vs ${market.awayTeam}:`, err);
    }
  });
  
  await Promise.allSettled(repairPromises);
}
 
 type ImportStatus = 'idle' | 'parsing' | 'previewing' | 'importing' | 'done';
 
 interface PreviewMarket extends ParsedMarket {
   status: 'new' | 'update' | 'error' | 'no_liquidity';
   matchResult?: string;
 }
 
 interface ImportResult {
   created: number;
   updated: number;
   failed: number;
   noLiquidity: number;
   bookieMatches: number;
   details: Array<{ market: string; status: string; error?: string }>;
 }
 
 export default function BatchImport() {
   const [rawText, setRawText] = useState("");
   const [status, setStatus] = useState<ImportStatus>('idle');
   const [parseResult, setParseResult] = useState<ParseResult | null>(null);
   const [previewMarkets, setPreviewMarkets] = useState<PreviewMarket[]>([]);
   const [importResult, setImportResult] = useState<ImportResult | null>(null);
   const { toast } = useToast();
 
   const handleParse = () => {
     if (!rawText.trim()) {
       toast({ title: "No data", description: "Please paste market data first", variant: "destructive" });
       return;
     }
 
     setStatus('parsing');
     const result = parseBatchImport(rawText);
     setParseResult(result);
 
     // Convert to preview markets with status
     const previews: PreviewMarket[] = result.markets.map(m => ({
       ...m,
       status: m.homePrice === 0 && m.awayPrice === 0 ? 'no_liquidity' : 'new',
     }));
 
     setPreviewMarkets(previews);
     setStatus('previewing');
 
     toast({
       title: "Parsed successfully",
       description: `Found ${result.summary.parsed} markets, ${result.summary.failed} errors`,
     });
   };
 
   const handleImport = async () => {
     if (previewMarkets.length === 0) return;
 
     setStatus('importing');
 
     try {
       const { data, error } = await supabase.functions.invoke('batch-market-import', {
         body: { markets: previewMarkets },
       });
 
       if (error) throw error;
 
       setImportResult(data as ImportResult);
       setStatus('done');
 
       toast({
         title: "Import complete",
         description: `Created: ${data.created}, Updated: ${data.updated}, Bookie matches: ${data.bookieMatches}`,
       });

        // Trigger token repair in background for the first 10 markets
        triggerTokenRepair(previewMarkets.slice(0, 10));
        toast({
          title: "Token repair started",
          description: "Attempting to resolve CLOB token IDs for imported markets...",
        });
     } catch (err) {
       console.error('Import failed:', err);
       toast({
         title: "Import failed",
         description: err instanceof Error ? err.message : "Unknown error",
         variant: "destructive",
       });
       setStatus('previewing');
     }
   };
 
   const getStatusBadge = (s: PreviewMarket['status']) => {
     switch (s) {
       case 'new':
         return <Badge className="bg-profit/20 text-profit">NEW</Badge>;
       case 'update':
         return <Badge className="bg-warning/20 text-warning">UPDATE</Badge>;
       case 'no_liquidity':
         return <Badge className="bg-muted text-muted-foreground">NO LIQ</Badge>;
       case 'error':
         return <Badge variant="destructive">ERROR</Badge>;
     }
   };
 
   const formatPrice = (price: number) => {
     if (price === 0) return "—";
     return `${(price * 100).toFixed(0)}¢`;
   };
 
   return (
     <div className="min-h-screen bg-background p-4 md:p-8">
       <div className="max-w-6xl mx-auto space-y-6">
         {/* Header */}
         <div className="flex items-center gap-4">
           <Link to="/">
             <Button variant="ghost" size="icon">
               <ArrowLeft className="h-5 w-5" />
             </Button>
           </Link>
           <div>
             <h1 className="text-2xl font-bold">Batch Import</h1>
             <p className="text-muted-foreground">Manual market data entry (last resort)</p>
           </div>
         </div>
 
         {/* Input Section */}
         <Card>
           <CardHeader>
             <CardTitle className="flex items-center gap-2">
               <Upload className="h-5 w-5" />
               Paste Market Data
             </CardTitle>
             <CardDescription>
               Copy text from Polymarket UI (sports markets page) and paste below
             </CardDescription>
           </CardHeader>
           <CardContent className="space-y-4">
             <Textarea
               placeholder={`🏒 NHL – Head-to-Head Markets\n\n10:00 AM\n\nPittsburgh Penguins vs Buffalo Sabres\n\nPittsburgh Penguins: 45¢\n\nBuffalo Sabres: 56¢`}
               value={rawText}
               onChange={(e) => setRawText(e.target.value)}
               className="min-h-[200px] font-mono text-sm"
               disabled={status === 'importing'}
             />
             <div className="flex gap-2">
               <Button onClick={handleParse} disabled={status === 'importing' || !rawText.trim()}>
                 <Eye className="h-4 w-4 mr-2" />
                 Parse & Preview
               </Button>
               {status === 'previewing' && previewMarkets.length > 0 && (
                 <Button onClick={handleImport} variant="profit">
                   <Upload className="h-4 w-4 mr-2" />
                   Import {previewMarkets.length} Markets
                 </Button>
               )}
               {status === 'importing' && (
                 <Button disabled>
                   <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                   Importing...
                 </Button>
               )}
             </div>
           </CardContent>
         </Card>
 
         {/* Parse Errors */}
         {parseResult && parseResult.errors.length > 0 && (
           <Card className="border-destructive/50">
             <CardHeader>
               <CardTitle className="flex items-center gap-2 text-destructive">
                 <AlertCircle className="h-5 w-5" />
                 Parse Errors ({parseResult.errors.length})
               </CardTitle>
             </CardHeader>
             <CardContent>
               <ul className="text-sm space-y-1 text-muted-foreground">
                 {parseResult.errors.map((err, i) => (
                   <li key={i}>• {err}</li>
                 ))}
               </ul>
             </CardContent>
           </Card>
         )}
 
         {/* Preview Table */}
         {previewMarkets.length > 0 && (
           <Card>
             <CardHeader>
               <CardTitle>Preview ({previewMarkets.length} markets)</CardTitle>
               <CardDescription>
                 Review parsed markets before importing
               </CardDescription>
             </CardHeader>
             <CardContent>
               <Table>
                 <TableHeader>
                   <TableRow>
                     <TableHead>Status</TableHead>
                     <TableHead>Sport</TableHead>
                     <TableHead>Time</TableHead>
                     <TableHead>Match</TableHead>
                     <TableHead className="text-right">Away</TableHead>
                     <TableHead className="text-right">Home</TableHead>
                   </TableRow>
                 </TableHeader>
                 <TableBody>
                   {previewMarkets.map((m, i) => (
                     <TableRow key={i}>
                       <TableCell>{getStatusBadge(m.status)}</TableCell>
                       <TableCell className="font-medium">{m.sport}</TableCell>
                       <TableCell className="text-muted-foreground">{m.gameTime}</TableCell>
                       <TableCell>
                         <span className="text-muted-foreground">{m.awayTeam}</span>
                         <span className="mx-1 text-muted-foreground/50">@</span>
                         <span>{m.homeTeam}</span>
                       </TableCell>
                       <TableCell className="text-right font-mono">{formatPrice(m.awayPrice)}</TableCell>
                       <TableCell className="text-right font-mono">{formatPrice(m.homePrice)}</TableCell>
                     </TableRow>
                   ))}
                 </TableBody>
               </Table>
             </CardContent>
           </Card>
         )}
 
         {/* Import Results */}
         {importResult && (
           <Card className="border-profit/50">
             <CardHeader>
               <CardTitle className="flex items-center gap-2 text-profit">
                 <CheckCircle className="h-5 w-5" />
                 Import Complete
               </CardTitle>
             </CardHeader>
             <CardContent>
               <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                 <div className="text-center">
                   <div className="text-2xl font-bold text-profit">{importResult.created}</div>
                   <div className="text-sm text-muted-foreground">Created</div>
                 </div>
                 <div className="text-center">
                   <div className="text-2xl font-bold text-warning">{importResult.updated}</div>
                   <div className="text-sm text-muted-foreground">Updated</div>
                 </div>
                 <div className="text-center">
                   <div className="text-2xl font-bold text-primary">{importResult.bookieMatches}</div>
                   <div className="text-sm text-muted-foreground">Bookie Matches</div>
                 </div>
                 <div className="text-center">
                   <div className="text-2xl font-bold text-muted-foreground">{importResult.noLiquidity}</div>
                   <div className="text-sm text-muted-foreground">No Liquidity</div>
                 </div>
                 <div className="text-center">
                   <div className="text-2xl font-bold text-destructive">{importResult.failed}</div>
                   <div className="text-sm text-muted-foreground">Failed</div>
                 </div>
               </div>
 
               {importResult.details && importResult.details.length > 0 && (
                 <div className="mt-4 max-h-48 overflow-y-auto">
                   <Table>
                     <TableHeader>
                       <TableRow>
                         <TableHead>Market</TableHead>
                         <TableHead>Status</TableHead>
                         <TableHead>Notes</TableHead>
                       </TableRow>
                     </TableHeader>
                     <TableBody>
                       {importResult.details.map((d, i) => (
                         <TableRow key={i}>
                           <TableCell className="font-medium">{d.market}</TableCell>
                           <TableCell>
                             {d.status === 'created' && <CheckCircle className="h-4 w-4 text-profit" />}
                             {d.status === 'updated' && <CheckCircle className="h-4 w-4 text-warning" />}
                             {d.status === 'failed' && <XCircle className="h-4 w-4 text-destructive" />}
                           </TableCell>
                           <TableCell className="text-sm text-muted-foreground">{d.error || '—'}</TableCell>
                         </TableRow>
                       ))}
                     </TableBody>
                   </Table>
                 </div>
               )}
             </CardContent>
           </Card>
         )}
       </div>
     </div>
   );
 }