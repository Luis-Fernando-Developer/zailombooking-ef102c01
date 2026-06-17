import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { RequireBusinessAuth } from "@/components/business/RequireBusinessAuth";
import { RequireRole } from "@/components/business/RequireRole";
import { RequireSuperAdmin } from "@/components/admin/RequireSuperAdmin";
import LandingPage from "./pages/LandingPage";
import AdminLogin from "./pages/admin/Login";
import SuperAdminDashboard from "./pages/admin/SuperAdminDashboard";
import SuperAdminInstances from "./pages/super-admin/Instances";
import SuperAdminPlans from "./pages/super-admin/Plans";
import SuperAdminSettings from "./pages/super-admin/Settings";
import CreateCompany from "./pages/admin/CreateCompany";
import SignUp from "./pages/SignUp";
import SignupPending from "./pages/SignupPending";
import BusinessLogin from "./pages/business/Login";
import ResetPassword from "./pages/ResetPassword";
import CompanyLandingPage from "./pages/company/[slug]";
import BusinessDashboard from "./pages/business/Dashboard";
import BusinessBookings from "./pages/business/Bookings";
import BusinessServices from "./pages/business/Services";
import BusinessEmployees from "./pages/business/Employees";
import BusinessSettings from "./pages/business/Settings";
import BillingManagement from "./pages/business/BillingManagement";
import BusinessProfile from "./pages/business/Profile";
import ChatbotIntegracao from "./pages/business/chatbot/Integracao";
import ChatbotZailomFlow from "./pages/business/chatbot/ZailomFlow";
import BusinessSchedule from "./pages/business/Schedule";
import BusinessSolicitacoes from "./pages/business/Solicitacoes";
import ClientBooking from "./pages/client/Booking";
import ClientLogin from "./pages/client/Login";
import ClientSignup from "./pages/client/Signup";
import ClientBookings from "./pages/client/Bookings";
import ClientProfile from "./pages/client/Profile";
import ClientDashboard from "./pages/client/Dashboard";
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
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/:slug/admin/login" element={<BusinessLogin />} />
            <Route path="/super-admin/login" element={<AdminLogin />} />
            <Route path="/super-admin/painel" element={<RequireSuperAdmin><SuperAdminDashboard /></RequireSuperAdmin>} />
            <Route path="/super-admin/empresas" element={<RequireSuperAdmin><SuperAdminDashboard /></RequireSuperAdmin>} />
            <Route path="/super-admin/instancias" element={<RequireSuperAdmin><SuperAdminInstances /></RequireSuperAdmin>} />
            <Route path="/super-admin/planos" element={<RequireSuperAdmin><SuperAdminPlans /></RequireSuperAdmin>} />
            <Route path="/super-admin/configuracoes" element={<RequireSuperAdmin><SuperAdminSettings /></RequireSuperAdmin>} />
            <Route path="/super-admin/add-company" element={<RequireSuperAdmin><CreateCompany /></RequireSuperAdmin>} />
            <Route path="/:slug/admin/dashboard" element={<RequireBusinessAuth><BusinessDashboard /></RequireBusinessAuth>} />
            <Route path="/:slug/admin/agendamentos" element={<RequireBusinessAuth><BusinessBookings /></RequireBusinessAuth>} />
            <Route path="/:slug/admin/servicos" element={<RequireBusinessAuth><RequireRole allow={['owner','manager']}><BusinessServices /></RequireRole></RequireBusinessAuth>} />
            <Route path="/:slug/admin/colaboradores" element={<RequireBusinessAuth><RequireRole allow={['owner','manager','supervisor']}><BusinessEmployees /></RequireRole></RequireBusinessAuth>} />
            <Route path="/:slug/admin/configuracoes" element={<RequireBusinessAuth><RequireRole allow={['owner','manager']}><BusinessSettings /></RequireRole></RequireBusinessAuth>} />
            <Route path="/:slug/admin/billing" element={<RequireBusinessAuth><BillingManagement /></RequireBusinessAuth>} />
            <Route path="/:slug/admin/perfil" element={<RequireBusinessAuth><BusinessProfile /></RequireBusinessAuth>} />
            <Route path="/:slug/admin/chatbot" element={<RequireBusinessAuth><RequireRole allow={['owner','manager']}><ChatbotIntegracao /></RequireRole></RequireBusinessAuth>} />
            <Route path="/:slug/admin/chatbot/integracao" element={<RequireBusinessAuth><RequireRole allow={['owner','manager']}><ChatbotIntegracao /></RequireRole></RequireBusinessAuth>} />
            <Route path="/:slug/admin/chatbot/talkmap" element={<RequireBusinessAuth><RequireRole allow={['owner','manager']}><ChatbotZailomFlow /></RequireRole></RequireBusinessAuth>} />
            <Route path="/:slug/admin/chatbot/talkmap/*" element={<RequireBusinessAuth><RequireRole allow={['owner','manager']}><ChatbotZailomFlow /></RequireRole></RequireBusinessAuth>} />
            <Route path="/:slug/admin/horarios" element={<RequireBusinessAuth><BusinessSchedule /></RequireBusinessAuth>} />
            <Route path="/:slug/admin/solicitacoes" element={<RequireBusinessAuth><BusinessSolicitacoes /></RequireBusinessAuth>} />
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
