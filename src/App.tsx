import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { RequireBusinessAuth } from "@/components/business/RequireBusinessAuth";
import { RequireSuperAdmin } from "@/components/admin/RequireSuperAdmin";
import LandingPage from "./pages/LandingPage";
import AdminLogin from "./pages/Placeholder";
import SuperAdminDashboard from "./pages/Placeholder";
import CreateCompany from "./pages/Placeholder";
import SignUp from "./pages/SignUp";
import SignupPending from "./pages/SignupPending";
import BusinessLogin from "./pages/Placeholder";
import CompanyLandingPage from "./pages/Placeholder";
import BusinessDashboard from "./pages/Placeholder";
import BusinessBookings from "./pages/Placeholder";
import BusinessServices from "./pages/Placeholder";
import BusinessEmployees from "./pages/Placeholder";
import BusinessSettings from "./pages/Placeholder";
import BillingManagement from "./pages/Placeholder";
import BusinessProfile from "./pages/Placeholder";
import ChatbotIntegracao from "./pages/Placeholder";
import ChatbotTalkMap from "./pages/Placeholder";
import BusinessSchedule from "./pages/Placeholder";
import ClientBooking from "./pages/Placeholder";
import ClientLogin from "./pages/Placeholder";
import ClientSignup from "./pages/Placeholder";
import ClientBookings from "./pages/Placeholder";
import ClientProfile from "./pages/Placeholder";
import ClientDashboard from "./pages/Placeholder";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/signup/aguardando/:companyId" element={<SignupPending />} />
            <Route path="/login" element={<BusinessLogin />} />
            <Route path="/:slug/admin/login" element={<BusinessLogin />} />
            <Route path="/super-admin/login" element={<AdminLogin />} />
            <Route path="/super-admin/painel" element={<RequireSuperAdmin><SuperAdminDashboard /></RequireSuperAdmin>} />
            <Route path="/super-admin/add-company" element={<RequireSuperAdmin><CreateCompany /></RequireSuperAdmin>} />
            <Route path="/:slug/admin/dashboard" element={<RequireBusinessAuth><BusinessDashboard /></RequireBusinessAuth>} />
            <Route path="/:slug/admin/agendamentos" element={<RequireBusinessAuth><BusinessBookings /></RequireBusinessAuth>} />
            <Route path="/:slug/admin/servicos" element={<RequireBusinessAuth><BusinessServices /></RequireBusinessAuth>} />
            <Route path="/:slug/admin/colaboradores" element={<RequireBusinessAuth><BusinessEmployees /></RequireBusinessAuth>} />
            <Route path="/:slug/admin/configuracoes" element={<RequireBusinessAuth><BusinessSettings /></RequireBusinessAuth>} />
            <Route path="/:slug/admin/billing" element={<RequireBusinessAuth><BillingManagement /></RequireBusinessAuth>} />
            <Route path="/:slug/admin/perfil" element={<RequireBusinessAuth><BusinessProfile /></RequireBusinessAuth>} />
            <Route path="/:slug/admin/chatbot" element={<RequireBusinessAuth><ChatbotIntegracao /></RequireBusinessAuth>} />
            <Route path="/:slug/admin/chatbot/integracao" element={<RequireBusinessAuth><ChatbotIntegracao /></RequireBusinessAuth>} />
            <Route path="/:slug/admin/chatbot/talkmap" element={<RequireBusinessAuth><ChatbotTalkMap /></RequireBusinessAuth>} />
            <Route path="/:slug/admin/chatbot/talkmap/*" element={<RequireBusinessAuth><ChatbotTalkMap /></RequireBusinessAuth>} />
            <Route path="/:slug/admin/horarios" element={<RequireBusinessAuth><BusinessSchedule /></RequireBusinessAuth>} />
            <Route path="/:slug" element={<CompanyLandingPage />} />
            <Route path="/:slug/agendar" element={<ClientBooking />} />
            <Route path="/:slug/entrar" element={<ClientLogin />} />
            <Route path="/:slug/cadastro" element={<ClientSignup />} />
            <Route path="/:slug/agendamentos" element={<ClientBookings />} />
            <Route path="/:slug/client/dashboard" element={<ClientDashboard />} />
            <Route path="/:slug/client/perfil" element={<ClientProfile />} />
            <Route path="/:slug/client/agendamentos" element={<ClientBookings />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
