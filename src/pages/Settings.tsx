import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { arbitrageApi } from '@/lib/api/arbitrage';
import { useScanConfig } from '@/hooks/useScanConfig';
import { ScanSettingsPanel } from '@/components/terminal/ScanSettingsPanel';
import type { ArbitrageConfig } from '@/types/arbitrage';
import type { ScanConfig } from '@/types/scan-config';

export default function Settings() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  
  const [config, setConfig] = useState<Partial<ArbitrageConfig>>({
    min_edge_percent: 3.0,
    min_confidence: 60,
    min_liquidity: 1000,
    max_exposure_per_event: 500,
    time_to_resolution_hours: 168,
    notifications_enabled: true,
  });

  const { 
    config: scanConfig, 
    updateConfig: updateScanConfig,
    loading: scanLoading 
  } = useScanConfig();
  
  const [localScanConfig, setLocalScanConfig] = useState<Partial<ScanConfig>>({});

  useEffect(() => {
    const fetchConfig = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/auth');
        return;
      }
      setUserId(session.user.id);
      
      try {
        const existingConfig = await arbitrageApi.getConfig(session.user.id);
        if (existingConfig) {
          setConfig(existingConfig);
        }
      } catch (err) {
        console.error('Failed to fetch config:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchConfig();
  }, [navigate]);

  // Sync scan config when loaded
  useEffect(() => {
    if (scanConfig) {
      setLocalScanConfig(scanConfig);
    }
  }, [scanConfig]);

  const handleSave = async () => {
    if (!userId) return;
    
    setSaving(true);
    try {
      // Save signal thresholds
      await arbitrageApi.updateConfig(userId, config);
      
      // Save scan config
      if (Object.keys(localScanConfig).length > 0) {
        await updateScanConfig(localScanConfig);
      }
      
      toast({ title: 'Settings saved' });
    } catch (err) {
      toast({ 
        title: 'Error', 
        description: 'Failed to save settings',
        variant: 'destructive' 
      });
    } finally {
      setSaving(false);
    }
  };

  const handleScanConfigChange = (updates: Partial<ScanConfig>) => {
    setLocalScanConfig(prev => ({ ...prev, ...updates }));
  };

  if (loading || scanLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <span className="font-semibold">Settings</span>
          </div>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </header>

      <main className="container py-8 max-w-2xl">
        <Tabs defaultValue="scanning" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="scanning">Scanning</TabsTrigger>
            <TabsTrigger value="signals">Signals</TabsTrigger>
            <TabsTrigger value="risk">Risk</TabsTrigger>
          </TabsList>

          <TabsContent value="scanning" className="space-y-6">
            <ScanSettingsPanel 
              config={localScanConfig}
              onChange={handleScanConfigChange}
            />
          </TabsContent>

          <TabsContent value="signals" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Signal Thresholds</CardTitle>
                <CardDescription>
                  Configure minimum requirements for signals to appear in your feed.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Minimum Edge %</Label>
                    <span className="text-sm font-mono">{config.min_edge_percent}%</span>
                  </div>
                  <Slider
                    value={[config.min_edge_percent || 3]}
                    onValueChange={([v]) => setConfig(prev => ({ ...prev, min_edge_percent: v }))}
                    min={0}
                    max={20}
                    step={0.5}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Minimum Confidence Score</Label>
                    <span className="text-sm font-mono">{config.min_confidence}</span>
                  </div>
                  <Slider
                    value={[config.min_confidence || 60]}
                    onValueChange={([v]) => setConfig(prev => ({ ...prev, min_confidence: v }))}
                    min={0}
                    max={100}
                    step={5}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Minimum Liquidity ($)</Label>
                  <Input
                    type="number"
                    value={config.min_liquidity}
                    onChange={(e) => setConfig(prev => ({ ...prev, min_liquidity: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Notifications</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Enable Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Receive alerts for high-urgency signals
                    </p>
                  </div>
                  <Switch
                    checked={config.notifications_enabled}
                    onCheckedChange={(checked) => setConfig(prev => ({ ...prev, notifications_enabled: checked }))}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="risk" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Risk Controls</CardTitle>
                <CardDescription>
                  Set exposure limits and time constraints.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Max Exposure Per Event ($)</Label>
                  <Input
                    type="number"
                    value={config.max_exposure_per_event}
                    onChange={(e) => setConfig(prev => ({ ...prev, max_exposure_per_event: parseFloat(e.target.value) || 0 }))}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Time to Resolution (hours)</Label>
                    <span className="text-sm font-mono">{config.time_to_resolution_hours}h</span>
                  </div>
                  <Slider
                    value={[config.time_to_resolution_hours || 168]}
                    onValueChange={([v]) => setConfig(prev => ({ ...prev, time_to_resolution_hours: v }))}
                    min={1}
                    max={720}
                    step={1}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
