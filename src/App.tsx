import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { BetSlipProvider } from "@/contexts/BetSlipContext";
import { BetSlipDrawer } from "@/components/dashboard/BetSlipDrawer";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import DailyBets from "./pages/DailyBets";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BetSlipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <BetSlipDrawer />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/daily-bets" element={<DailyBets />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </BetSlipProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
