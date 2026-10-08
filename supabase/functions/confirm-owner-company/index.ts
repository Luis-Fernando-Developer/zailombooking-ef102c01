import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders});
 try{
  const admin=createClient(Deno.env.get("SUPABASE_URL")??"",Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"");
  const token=String((await req.json())?.token??"").trim();
  if(!token) return new Response(JSON.stringify({success:false,error:"Token ausente."}),{status:400,headers:{...corsHeaders,"Content-Type":"application/json"}});
  const {data,error}=await admin.rpc("confirm_owner_company_link",{p_token:token});
  if(error||!data?.success) return new Response(JSON.stringify(data??{success:false,error:error?.message}),{status:400,headers:{...corsHeaders,"Content-Type":"application/json"}});
  const {data:company}=await admin.from("companies").select("slug").eq("id",data.company_id).maybeSingle();
  return new Response(JSON.stringify({success:true,company_slug:company?.slug??null}),{status:200,headers:{...corsHeaders,"Content-Type":"application/json"}});
 }catch(e){return new Response(JSON.stringify({success:false,error:e instanceof Error?e.message:"Erro interno."}),{status:500,headers:{...corsHeaders,"Content-Type":"application/json"}});}
});