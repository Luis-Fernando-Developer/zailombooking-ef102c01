import { useState, useEffect } from "react";
import { useSearchParams, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

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
    // Supabase Auth redireciona com o token no fragmento (#access_token=...) ou query (?token=...)
    // Se vier do fragmento (signup global), o Supabase injeta o token lá.
    const hashParams = new URLSearchParams(window.location.hash.replace('#', '?'));
    
    // Prioridade: token da query > access_token do hash (padrão Supabase) > token do hash
    const finalToken = token || hashParams.get('access_token') || hashParams.get('token');

    console.log("ConfirmLink: Debug URL", { 
      fullUrl: window.location.href,
      queryToken: token, 
      hash: window.location.hash,
      extractedToken: finalToken 
    });

    if (!finalToken) {
      // Pequeno delay para garantir que o hash foi processado (alguns navegadores/SPAs demoram ms)
      if (window.location.hash) {
        return; 
      }
      setStatus('error');
      setMessage("Token de confirmação ausente.");
      return;
    }

    const confirm = async () => {
      try {
        console.log("Iniciando confirmação com token:", finalToken);
        const { data, error } = await supabase.rpc('confirm_client_company_link', {
          p_token: finalToken
        });

        console.log("Resultado RPC confirm_client_company_link:", { data, error });

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
            // Se for o primeiro cadastro (signup), redirecionamos para criar a senha
            navigate(`/${redirectSlug}/criar-senha?token=${finalToken}`);
          }, 2000);
        }
      } catch (err) {
        console.error("Erro inesperado:", err);
        setStatus('error');
        setMessage("Erro inesperado ao processar a confirmação.");
      }
    };

    confirm();
  }, [token, window.location.hash]);

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
