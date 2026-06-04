import AdminLogin from "./pages/Placeholder";
import SuperAdminDashboard from "./pages/Placeholder";
import CreateCompany from "./pages/Placeholder";
import SignUp from "./pages/SignUp";
import SignupPending from "./pages/SignupPending";
import BusinessLogin from "./pages/business/Login";
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
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { RequireBusinessAuth } from "@/components/business/RequireBusinessAuth";
import { RequireSuperAdmin } from "@/components/admin/RequireSuperAdmin";
import LandingPage from "./pages/LandingPage";

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
            <Route path="/login" element={<BusinessLogin title="Login Empresarial" />} />
            <Route path="/:slug/admin/login" element={<BusinessLogin title="Login Admin" />} />
            <Route path="/super-admin/login" element={<AdminLogin title="Login Super Admin" />} />
            <Route path="/super-admin/painel" element={<RequireSuperAdmin><SuperAdminDashboard title="Painel Super Admin" /></RequireSuperAdmin>} />
            <Route path="/super-admin/add-company" element={<RequireSuperAdmin><CreateCompany title="Criar Empresa" /></RequireSuperAdmin>} />
            <Route path="/:slug/admin/dashboard" element={<RequireBusinessAuth><BusinessDashboard title="Dashboard Business" /></RequireBusinessAuth>} />
            <Route path="/:slug/admin/agendamentos" element={<RequireBusinessAuth><BusinessBookings title="Agendamentos Business" /></RequireBusinessAuth>} />
            <Route path="/:slug/admin/servicos" element={<RequireBusinessAuth><BusinessServices title="Serviços" /></RequireBusinessAuth>} />
            <Route path="/:slug/admin/colaboradores" element={<RequireBusinessAuth><BusinessEmployees title="Colaboradores" /></RequireBusinessAuth>} />
            <Route path="/:slug/admin/configuracoes" element={<RequireBusinessAuth><BusinessSettings title="Configurações" /></RequireBusinessAuth>} />
            <Route path="/:slug/admin/billing" element={<RequireBusinessAuth><BillingManagement title="Faturamento" /></RequireBusinessAuth>} />
            <Route path="/:slug/admin/perfil" element={<RequireBusinessAuth><BusinessProfile title="Perfil Business" /></RequireBusinessAuth>} />
            <Route path="/:slug/admin/chatbot" element={<RequireBusinessAuth><ChatbotIntegracao title="Chatbot" /></RequireBusinessAuth>} />
            <Route path="/:slug/admin/chatbot/integracao" element={<RequireBusinessAuth><ChatbotIntegracao title="Integração Chatbot" /></RequireBusinessAuth>} />
            <Route path="/:slug/admin/chatbot/talkmap" element={<RequireBusinessAuth><ChatbotTalkMap title="TalkMap" /></RequireBusinessAuth>} />
            <Route path="/:slug/admin/chatbot/talkmap/*" element={<RequireBusinessAuth><ChatbotTalkMap title="TalkMap" /></RequireBusinessAuth>} />
            <Route path="/:slug/admin/horarios" element={<RequireBusinessAuth><BusinessSchedule title="Horários" /></RequireBusinessAuth>} />
            <Route path="/:slug" element={<CompanyLandingPage title="Landing Page Empresa" />} />
            <Route path="/:slug/agendar" element={<ClientBooking title="Agendamento Cliente" />} />
            <Route path="/:slug/entrar" element={<ClientLogin title="Login Cliente" />} />
            <Route path="/:slug/cadastro" element={<ClientSignup title="Cadastro Cliente" />} />
            <Route path="/:slug/agendamentos" element={<ClientBookings title="Meus Agendamentos" />} />
            <Route path="/:slug/client/dashboard" element={<ClientDashboard title="Dashboard Cliente" />} />
            <Route path="/:slug/client/perfil" element={<ClientProfile title="Perfil Cliente" />} />
            <Route path="/:slug/client/agendamentos" element={<ClientBookings title="Agendamentos" />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
