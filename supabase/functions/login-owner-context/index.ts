import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders});
 try{
  const admin=createClient(Deno.env.get("SUPABASE_URL")??"",Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"");
  const body=await req.json();
  const email=String(body?.email??"").trim();
  const password=String(body?.password??"");
  const company_slug=String(body?.company_slug??"").trim();
  if(!email||!password||!company_slug) return new Response(JSON.stringify({success:false,error:"E-mail, senha e empresa são obrigatórios."}),{status:400,headers:{...corsHeaders,"Content-Type":"application/json"}});
  const {data:valid,error:validError}=await admin.rpc("validate_owner_password",{p_email:email,p_company_slug:company_slug,p_password:password});
  if(validError||!valid?.success) return new Response(JSON.stringify(valid??{success:false,error:validError?.message||"Credenciais inválidas."}),{status:401,headers:{...corsHeaders,"Content-Type":"application/json"}});
  const site=(Deno.env.get("SITE_URL")||"https://booking.zailom.com").replace(/\/$/,"");
  const redirectTo=String(body?.returnTo)==="agendar"?`${site}/${company_slug}/agendar?restore=true`:`${site}/${company_slug}/admin/dashboard`;
  const {data:link,error}=await admin.auth.admin.generateLink({type:"magiclink",email,options:{redirectTo}});
  if(error||!link?.properties?.action_link) throw new Error(error?.message||"Não foi possível gerar a sessão.");
  return new Response(JSON.stringify({success:true,action_link:link.properties.action_link,company_id:valid.company_id,user_id:valid.user_id}),{status:200,headers:{...corsHeaders,"Content-Type":"application/json"}});
 }catch(e){return new Response(JSON.stringify({success:false,error:e instanceof Error?e.message:"Erro interno."}),{status:500,headers:{...corsHeaders,"Content-Type":"application/json"}});}
});