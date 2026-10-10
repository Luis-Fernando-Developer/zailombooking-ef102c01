import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BookingLogo } from "@/components/BookingLogo";
import { supabase } from "@/lib/supabaseClient";

export default function CompanyLoginEntry() {
  const [slug, setSlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const navigate = useNavigate();

  const handleContinue = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedSlug = slug.trim().toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split(/[/?#]/)[0]
      .replace(/\.booking\.zailom\.com$/, "")
      .replace(/\.zailom\.com$/, "");

    if (!normalizedSlug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedSlug)) {
      setErrorMessage("Digite um identificador de empresa válido.");
      return;
    }

    setLoading(true);
    setErrorMessage("");
    try {
      const { data, error } = await supabase.functions.invoke("validate-company-login-slug", {
        body: { slug: normalizedSlug },
      });
      if (error || !data?.success || !data?.exists) {
        setErrorMessage("Empresa não encontrada. Confira o slug e tente novamente.");
        return;
      }
      navigate("/" + encodeURIComponent(normalizedSlug) + "/login");
    } catch {
      setErrorMessage("Não foi possível validar a empresa agora. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-hero p-4">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-20 left-20 w-72 h-72 bg-neon-violet/10 rounded-full blur-3xl animate-pulse-glow" />
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-neon-pink/10 rounded-full blur-3xl animate-float" />
      </div>
      <Card className="w-full max-w-md card-glow bg-card/50 backdrop-blur-sm border-primary/30 relative z-10">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-6"><BookingLogo /></div>
          <div className="mx-auto mb-2 rounded-full bg-primary/10 p-3"><Building2 className="h-6 w-6 text-primary" /></div>
          <CardTitle className="text-2xl text-gradient">Acessar minha empresa</CardTitle>
          <CardDescription>Informe o identificador (slug) da empresa para continuar para o login correto.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleContinue} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="company-slug">Slug da empresa</Label>
              <Input id="company-slug" value={slug} onChange={(event) => { setSlug(event.target.value); setErrorMessage(""); }} placeholder="ex.: minha-empresa" autoComplete="organization" autoCapitalize="none" spellCheck={false} required />
              <p className="text-xs text-muted-foreground">É o identificador que aparece no endereço público da empresa. Por exemplo: booking.zailom.com/minha-empresa</p>
            </div>
            {errorMessage && <p role="alert" className="text-sm text-destructive">{errorMessage}</p>}
            <Button type="submit" className="w-full" variant="neon" size="lg" disabled={loading || !slug.trim()}>
              {loading ? "Verificando empresa..." : "Continuar"}
              {!loading && <ArrowRight className="ml-2 h-4 w-4" />}
            </Button>
          </form>
          <div className="mt-6 pt-6 border-t border-primary/20 text-center">
            <p className="text-sm text-muted-foreground">Ainda não tem uma empresa?</p>
            <a href="/signup" className="text-sm text-primary hover:text-primary-glow transition-colors">Cadastrar empresa</a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
