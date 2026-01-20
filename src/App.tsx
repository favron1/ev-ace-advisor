import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { BetSlipProvider } from "@/contexts/BetSlipContext";
import { SportProvider } from "@/contexts/SportContext";
import { BetSlipDrawer } from "@/components/dashboard/BetSlipDrawer";
import Auth from "./pages/Auth";
import FindBets from "./pages/FindBets";
import BetLog from "./pages/BetLog";
import ScrapeHistory from "./pages/ScrapeHistory";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<FindBets />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/find-bets" element={<FindBets />} />
      <Route path="/bet-log" element={<BetLog />} />
      <Route path="/scrape-history" element={<ScrapeHistory />} />
      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <SportProvider>
        <BetSlipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <BetSlipDrawer />
            <AppRoutes />
          </BrowserRouter>
        </BetSlipProvider>
      </SportProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
