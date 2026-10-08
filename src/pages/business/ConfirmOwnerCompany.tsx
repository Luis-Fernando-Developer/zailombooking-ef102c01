import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { BookingLogo } from "@/components/BookingLogo";
import { supabase } from "@/lib/supabaseClient";

export default function ConfirmOwnerCompany() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [state,setState]=useState<"ready"|"saving"|"ok"|"error">("ready");
  const [message,setMessage]=useState("");
  const [password,setPassword]=useState("");
  const [confirmPassword,setConfirmPassword]=useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage("");
    const token = params.get("token");
    if (!token) { setState("error"); setMessage("Link inválido."); return; }
    if (password.length < 8) { setState("error"); setMessage("A senha deve ter pelo menos 8 caracteres."); return; }
    if (new TextEncoder().encode(password).length > 72) { setState("error"); setMessage("A senha deve ter no máximo 72 bytes."); return; }
    if (password !== confirmPassword) { setState("error"); setMessage("As senhas não coincidem."); return; }
    setState("saving");
    const {data,error}=await supabase.functions.invoke("set-owner-company-password",{body:{token,password}});
    if(error||!data?.success){setState("error");setMessage(data?.error||error?.message||"Não foi possível definir a senha. Confirme se o pagamento já foi aprovado.");return;}
    setState("ok");
    setMessage(data.welcome_email_sent ? "Pagamento confirmado, senha criada e empresa ativada. Enviamos seu e-mail de boas-vindas." : "Pagamento confirmado, senha criada e empresa ativada. O envio do e-mail de boas-vindas não foi confirmado; entre pelo login para acessar o painel.");
  };

  return <div className="min-h-screen flex items-center justify-center bg-gradient-hero p-4"><Card className="w-full max-w-md"><CardHeader className="text-center"><BookingLogo className="justify-center mb-4"/><CardTitle>{state==="ok"?"Empresa ativada!":"Crie sua senha empresarial"}</CardTitle><CardDescription>{state==="ok"?"Seu acesso está pronto.":"Esta etapa só fica disponível depois da confirmação do pagamento."}</CardDescription></CardHeader><CardContent className="space-y-4"><form onSubmit={submit} className="space-y-4"><div className="space-y-2"><Label htmlFor="owner-password">Nova senha</Label><PasswordInput id="owner-password" value={password} onChange={(e)=>setPassword(e.target.value)} minLength={8} maxLength={72} required showLeftIcon={false}/></div><div className="space-y-2"><Label htmlFor="owner-password-confirm">Confirmar senha</Label><PasswordInput id="owner-password-confirm" value={confirmPassword} onChange={(e)=>setConfirmPassword(e.target.value)} minLength={8} maxLength={72} required showLeftIcon={false}/></div>{message&&<p role="alert" className={state==="ok"?"text-sm text-green-600":"text-sm text-destructive"}>{message}</p>}{state==="ok"?<Button type="button" className="w-full" onClick={()=>navigate("/")}>Ir para o login</Button>:<Button type="submit" className="w-full" disabled={state==="saving"}>{state==="saving"?"Validando e ativando...":"Definir senha e ativar empresa"}</Button>}</form></CardContent></Card></div>;
}
