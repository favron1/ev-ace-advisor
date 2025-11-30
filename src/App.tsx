import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { BetSlipProvider } from "@/contexts/BetSlipContext";
import { SportProvider, useSport } from "@/contexts/SportContext";
import { BetSlipDrawer } from "@/components/dashboard/BetSlipDrawer";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import DailyBets from "./pages/DailyBets";
import RacingDashboard from "./pages/RacingDashboard";
import Simulation from "./pages/Simulation";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AppRoutes() {
  const { sport } = useSport();
  
  return (
    <Routes>
      <Route path="/" element={sport === 'racing' ? <RacingDashboard /> : <Index />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/daily-bets" element={sport === 'racing' ? <RacingDashboard /> : <DailyBets />} />
      <Route path="/racing" element={<RacingDashboard />} />
      <Route path="/simulation" element={<Simulation />} />
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
