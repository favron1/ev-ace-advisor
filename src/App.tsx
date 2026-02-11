import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Auth from "./pages/Auth";
import Terminal from "./pages/Terminal";
import Settings from "./pages/Settings";
import Stats from "./pages/Stats";
import CoreLogic from "./pages/CoreLogic";
import ManualEntry from "./pages/ManualEntry";
import Discover from "./pages/pipeline/Discover";
import Analyze from "./pages/pipeline/Analyze";
import Watch from "./pages/pipeline/Watch";
import Execute from "./pages/pipeline/Execute";
import History from "./pages/pipeline/History";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Terminal />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/stats" element={<Stats />} />
      <Route path="/core-logic" element={<CoreLogic />} />
      <Route path="/manual-entry" element={<ManualEntry />} />
      <Route path="/pipeline" element={<Navigate to="/pipeline/discover" replace />} />
      <Route path="/pipeline/discover" element={<Discover />} />
      <Route path="/pipeline/analyze" element={<Analyze />} />
      <Route path="/pipeline/watch" element={<Watch />} />
      <Route path="/pipeline/execute" element={<Execute />} />
      <Route path="/pipeline/history" element={<History />} />
      <Route path="/batch-import" element={<Navigate to="/pipeline/discover" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
