import { useNavigate } from "react-router-dom";
import { ArrowLeft, Download, Copy, Lock, Settings, BarChart3, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { MarkdownRenderer } from "@/components/core-logic/MarkdownRenderer";
import {
  CORE_LOGIC_DOCUMENT,
  CORE_LOGIC_VERSION,
  CORE_LOGIC_FILENAME,
} from "@/lib/core-logic-document";

export default function CoreLogic() {
  const navigate = useNavigate();

  const handleDownload = () => {
    const blob = new Blob([CORE_LOGIC_DOCUMENT], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = CORE_LOGIC_FILENAME;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
    toast.success("Downloaded", {
      description: CORE_LOGIC_FILENAME,
    });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(CORE_LOGIC_DOCUMENT);
      toast.success("Copied to clipboard", {
        description: "Full document content copied",
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
        {/* Status Bar */}
        <Card className="mb-6 bg-card/50">
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <Badge
                  variant="outline"
                  className="gap-1.5 border-amber-500/50 text-amber-500 bg-amber-500/10"
                >
                  <Lock className="h-3 w-3" />
                  LOCKED
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Read-only • Single source of truth
                </span>
              </div>
              <Badge variant="secondary" className="font-mono">
                {CORE_LOGIC_VERSION} (canonical)
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Document Content */}
        <Card className="bg-card/30 border-border">
          <ScrollArea className="h-[calc(100vh-220px)]">
            <CardContent className="p-6 md:p-8">
              <MarkdownRenderer markdown={CORE_LOGIC_DOCUMENT} />
            </CardContent>
          </ScrollArea>
        </Card>
      </main>
    </div>
  );
}
