import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Download, Copy, Lock, Settings, BarChart3, LogOut, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { MarkdownRenderer } from "@/components/core-logic/MarkdownRenderer";
import {
  getCoreLogicDocument,
  getCoreLogicFilename,
  getVersionMetadata,
  AVAILABLE_VERSIONS,
  ACTIVE_CORE_LOGIC_VERSION,
  type CoreLogicVersion,
} from "@/lib/core-logic-document";

export default function CoreLogic() {
  const navigate = useNavigate();
  const [selectedVersion, setSelectedVersion] = useState<CoreLogicVersion>(ACTIVE_CORE_LOGIC_VERSION as CoreLogicVersion);
  
  const documentContent = getCoreLogicDocument(selectedVersion);
  const filename = getCoreLogicFilename(selectedVersion);
  const metadata = getVersionMetadata(selectedVersion);

  const handleDownload = () => {
    const blob = new Blob([documentContent], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);

    const a = window.document.createElement("a");
    a.href = url;
    a.download = filename;
    window.document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
    toast.success("Downloaded", {
      description: filename,
    });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(documentContent);
      toast.success("Copied to clipboard", {
        description: `${selectedVersion} document content copied`,
      });
    } catch (err) {
      toast.error("Failed to copy", {
        description: "Please try again",
      });
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/")}
              title="Back to Terminal"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <span className="font-semibold text-lg tracking-tight">CORE LOGIC</span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="gap-2"
            >
              <Copy className="h-4 w-4" />
              <span className="hidden sm:inline">Copy</span>
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleDownload}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Download</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/stats")}
              title="Stats"
            >
              <BarChart3 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/settings")}
              title="Settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container px-4 py-6">
        {/* Version Selector Tabs */}
        <Tabs 
          value={selectedVersion} 
          onValueChange={(v) => setSelectedVersion(v as CoreLogicVersion)}
          className="mb-6"
        >
          <TabsList className="grid w-full max-w-lg grid-cols-3">
            {AVAILABLE_VERSIONS.map((version) => {
              const meta = getVersionMetadata(version);
              const isActive = version === ACTIVE_CORE_LOGIC_VERSION;
              return (
                <TabsTrigger 
                  key={version} 
                  value={version}
                  className="gap-2"
                >
                  {meta.status === 'frozen' ? (
                    <Lock className="h-3 w-3" />
                  ) : (
                    <FlaskConical className="h-3 w-3" />
                  )}
                  {version}
                  {isActive && (
                    <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
                      ACTIVE
                    </Badge>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>

        {/* Status Bar */}
        <Card className="mb-6 bg-card/50">
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                {metadata.status === 'frozen' ? (
                  <Badge
                    variant="outline"
                    className="gap-1.5 border-amber-500/50 text-amber-500 bg-amber-500/10"
                  >
                    <Lock className="h-3 w-3" />
                    FROZEN
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="gap-1.5 border-green-500/50 text-green-500 bg-green-500/10"
                  >
                    <FlaskConical className="h-3 w-3" />
                    EXPERIMENTAL
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  {metadata.description}
                </span>
              </div>
              <Badge variant="secondary" className="font-mono">
                {metadata.label}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Document Content */}
        <Card className="bg-card/30 border-border">
          <ScrollArea className="h-[calc(100vh-280px)]">
            <CardContent className="p-6 md:p-8">
              <MarkdownRenderer markdown={documentContent} />
            </CardContent>
          </ScrollArea>
        </Card>
      </main>
    </div>
  );
}
