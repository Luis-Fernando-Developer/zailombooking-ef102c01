import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookingLogo } from "@/components/BookingLogo";
import { supabase } from "@/lib/supabaseClient";

export default function ConfirmOwnerCompany() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [state,setState]=useState<"loading"|"ok"|"error">("loading");
  const [message,setMessage]=useState("Confirmando seu acesso...");

  useEffect(()=>{
    const run=async()=>{
      const token=params.get("token");
      if(!token){setState("error");setMessage("Link de confirmação inválido.");return;}
      const {data,error}=await supabase.functions.invoke("confirm-owner-company",{body:{token}});
      if(error||!data?.success){setState("error");setMessage(data?.error||error?.message||"Não foi possível confirmar o acesso.");return;}
      setState("ok");setMessage("Acesso empresarial confirmado com sucesso.");
      if(data.company_slug) setTimeout(()=>navigate("/"+data.company_slug+"/admin/login"),1200);
    };
    run();
  },[params,navigate]);

  return <div className="min-h-screen flex items-center justify-center bg-gradient-hero p-4"><Card className="w-full max-w-md"><CardHeader className="text-center"><BookingLogo className="justify-center mb-4"/><CardTitle>{state==="loading"?"Confirmando acesso":state==="ok"?"Acesso confirmado":"Não foi possível confirmar"}</CardTitle></CardHeader><CardContent className="text-center space-y-4"><p className="text-muted-foreground">{message}</p>{state!=="loading"&&<Button onClick={()=>navigate("/login")}>{state==="ok"?"Ir para o login":"Voltar"}</Button>}</CardContent></Card></div>;
}