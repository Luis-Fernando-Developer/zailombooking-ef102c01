import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import CustomLandingPage from "./CustomLandingPage";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BookingLogo } from "@/components/BookingLogo";
import { Calendar, Clock, Star, MapPin, Phone, Mail, User, Lock, ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";

export default function CompanyLandingPage() {
  const { slug } = useParams();
  const [company, setCompany] = useState<any>(null);
  const [services, setServices] = useState<any[]>([]);
  const [showLogin, setShowLogin] = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const [loginData, setLoginData] = useState({ email: "", password: "" });
  const [signupData, setSignupData] = useState({ name: "", email: "", password: "", phone: "" });

  useEffect(() => {
    if (slug) {
      fetchCompanyData();
    }
  }, [slug]);

  const fetchCompanyData = async () => {
    try {
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .select('*')
        .eq('slug', slug)
        .eq('status', 'active')
        .single();

      if (companyError) {
        toast({
          title: "Empresa não encontrada",
          description: "A empresa não existe ou está inativa.",
          variant: "destructive",
        });
        return;
      }

      setCompany(companyData);

      // Buscar serviços da empresa
      const { data: servicesData } = await supabase
        .from('services')
        .select('*')
        .eq('company_id', companyData.id)
        .eq('is_active', true);

      setServices(servicesData || []);
    } catch (error) {
      console.error('Error fetching company data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    // Implementar login de cliente
    toast({
      title: "Login realizado",
      description: "Redirecionando para agendamentos...",
    });
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    // Implementar cadastro de cliente
    toast({
      title: "Cadastro realizado",
      description: "Bem-vindo! Agora você pode fazer agendamentos.",
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-hero flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="min-h-screen bg-gradient-hero flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gradient mb-4">Empresa não encontrada</h1>
          <p className="text-muted-foreground mb-8">A empresa que você procura não existe ou está inativa.</p>
          <Link to="/">
            <Button variant="neon">Voltar ao Início</Button>
          </Link>
        </div>
      </div>
    );
  }

  return <CustomLandingPage />;
}