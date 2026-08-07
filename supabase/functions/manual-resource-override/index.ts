import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-core@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Edge Function: manual-resource-override
 * Verify JWT: ON (Requer autenticação de Super Admin)
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Validar se o usuário é super admin
    const authHeader = req.headers.get("Authorization")!;
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(authHeader.replace("Bearer ", ""));
    
    if (authError || !user) throw new Error("Não autorizado");

    // Verificar role de super admin (assumindo tabela user_roles ou similar)
    const { data: roleData } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single();

    if (!roleData) throw new Error("Acesso negado: Requer privilégios de administrador");

    const { companyId, days, forceEarlyRenewal } = await req.json();

    if (!companyId) throw new Error("ID da empresa é obrigatório");

    const updates: any = {};
    
    if (days !== undefined) {
      updates.manual_resource_release_until = days > 0 
        ? new Date(Date.now() + days * 86400000).toISOString() 
        : null;
    }

    if (forceEarlyRenewal !== undefined) {
      updates.force_early_renewal_once = !!forceEarlyRenewal;
    }

    const { error: updateError } = await supabaseClient
      .from("companies")
      .update(updates)
      .eq("id", companyId);

    if (updateError) throw updateError;

    return new Response(JSON.stringify({ success: true, message: "Configurações atualizadas" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
