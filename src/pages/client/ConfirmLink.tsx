import { useState, useEffect } from "react";
import { useSearchParams, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthSession } from "@supabase/supabase-js";

export default function ConfirmLink() {
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState("Confirmando seu vínculo...");

  const token = searchParams.get('token');
  const slug = searchParams.get('slug');
  const type = searchParams.get('type'); // 'signup' ou 'link'

  useEffect(() => {
    const handleAuth = async () => {
      // 1. Verificar se o Supabase Auth já processou o link (primeiro cadastro)
      const { data: { session }, error: authError } = await supabase.auth.getSession();
      
      if (session) {
        console.log("ConfirmLink: Sessão ativa detectada via hash do Supabase.");
        setStatus('success');
        setMessage("Identidade confirmada com sucesso! Redirecionando...");
        
        // Se temos uma sessão, precisamos saber para qual empresa o usuário deve ir.
        // O slug geralmente vem da URL query parameter que injetamos no redirectTo.
        const currentSlug = searchParams.get('slug');
        
        setTimeout(() => {
          navigate(`/${currentSlug || 'client'}/agendamentos`);
        }, 1500);
        return;
      }

      // 2. Se não há sessão automática, processamos o token manual (vinda de e-mail/WhatsApp personalizado)
      const hashParams = new URLSearchParams(window.location.hash.replace('#', '?'));
      const finalToken = token || hashParams.get('access_token') || hashParams.get('token') || hashParams.get('confirmation_token');

      console.log("ConfirmLink: Debug URL", { 
        fullUrl: window.location.href,
        queryToken: token, 
        hash: window.location.hash,
        extractedToken: finalToken 
      });

      if (!finalToken) {
        // Se não tem token mas tem slug, talvez o login contextual tenha acabado de redirecionar
        // e o hash esteja prestes a ser consumido pelo Supabase.
        if (window.location.hash.includes('access_token')) {
            return; // Espera o getSession() acima capturar na próxima renderização ou efeito do Supabase
        }
        
        setStatus('error');
        setMessage("Token de confirmação ausente.");
        return;
      }

      // Validação de UUID para evitar erro 22P02 no Postgres
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      
      if (!uuidRegex.test(finalToken)) {
        console.error("Token extraído não é um UUID válido:", finalToken);
        setStatus('error');
        setMessage("O token de confirmação é inválido ou malformatado.");
        return;
      }

      try {
        console.log("Iniciando confirmação manual com token:", finalToken);
        const { data, error } = await supabase.rpc('confirm_client_company_link', {
          p_token: finalToken,
          p_password: null
        });

        if (error) {
          setStatus('error');
          setMessage(error.message || "Erro ao processar requisição no servidor.");
          return;
        }

        if (!data || !data.success) {
          setStatus('error');
          setMessage(data?.error || "Link de confirmação inválido ou já utilizado.");
        } else {
          setStatus('success');
          setMessage("Identidade confirmada com sucesso! Redirecionando para definir sua senha...");
          toast({
            title: "Sucesso",
            description: "Identidade confirmada! Agora crie sua senha.",
          });
          
          setTimeout(() => {
            const redirectSlug = data.company_slug || slug;
            navigate(`/${redirectSlug}/criar-senha?token=${finalToken}`);
          }, 2000);
        }
      } catch (err) {
        console.error("Erro inesperado:", err);
        setStatus('error');
        setMessage("Erro inesperado ao processar a confirmação.");
      }
    };

    handleAuth();

    // Listener para mudanças de auth (caso o Supabase demore a injetar a sessão no hash)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        handleAuth();
      }
    });

    return () => subscription.unsubscribe();
  }, [token, window.location.hash, navigate, slug, searchParams, toast]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-hero p-4">
      <Card className="w-full max-w-md card-glow bg-card/50 backdrop-blur-sm border-primary/30">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl text-gradient">Confirmação</CardTitle>
          <CardDescription>Vínculo de conta multi-empresa</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center py-6 space-y-4">
          {status === 'loading' && <Loader2 className="w-12 h-12 text-primary animate-spin" />}
          {status === 'success' && <CheckCircle className="w-12 h-12 text-green-500" />}
          {status === 'error' && <XCircle className="w-12 h-12 text-destructive" />}
          
          <p className="text-center text-foreground">{message}</p>
          
          {(status === 'success' || status === 'error') && (
            <Button 
              className="w-full mt-4" 
              onClick={() => navigate(`/${slug}/entrar`)}
            >
              Ir para o Login
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
