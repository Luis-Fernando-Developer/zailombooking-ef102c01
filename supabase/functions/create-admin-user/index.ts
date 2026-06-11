import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { 
      headers: {
        ...corsHeaders,
        "Access-Control-Max-Age": "86400",
      } 
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    const internalProvisionSecret = Deno.env.get("INTERNAL_PROVISION_SECRET") ?? "";
    console.log("[AdminCreateUser] Iniciando validação...");

    // 1. Validar Autenticação
    const authHeader = req.headers.get("Authorization");
    let isAuthorized = false;
    let requesterId = null;

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);

      // Verificar se é a chave de provisionamento interno
      if (internalProvisionSecret !== "" && token === internalProvisionSecret) {
        isAuthorized = true;
        console.log("[AdminCreateUser] Autorizado via INTERNAL_PROVISION_SECRET (global)");
      } else {
        // Verificar se é um JWT de usuário (SuperAdmin)
        try {
          const { data: { user: requester }, error: authError } = await supabaseClient.auth.getUser(token);
          
          if (!authError && requester) {
            requesterId = requester.id;
            // Consultar a tabela super_admins
            const { data: superAdmin, error: dbError } = await supabaseClient
              .from("super_admins")
              .select("*")
              .eq("user_id", requester.id)
              .maybeSingle();

            // Verificar se o registro existe. O campo de ativação pode ser 'active' ou 'is_active'
            const isActive = superAdmin?.active ?? superAdmin?.is_active;

            if (!dbError && superAdmin && isActive !== false) {
              isAuthorized = true;
              console.log(`[AdminCreateUser] Autorizado via SuperAdmin: ${requester.email}`);
            } else {
              console.error(`[AdminCreateUser] Falha na autorização: userFound=${!!superAdmin}, active=${isActive}, dbError=${dbError?.message}`);
            }
          } else if (authError) {
            console.error("[AdminCreateUser] Erro ao validar JWT:", authError.message);
          }
        } catch (e) {
          console.error("[AdminCreateUser] Erro inesperado na validação do token:", e);
        }
      }
    }

    if (!isAuthorized) {
      console.error("[AdminCreateUser] Acesso NEGADO.");
      return new Response(JSON.stringify({ error: "Only active SuperAdmins or valid secret can call this function" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Pegar dados para criação do novo usuário
    const { email, password, metadata } = await req.json();

    if (!email || !password) {
      return new Response(JSON.stringify({ error: "Email and password are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[AdminCreateUser] Criando usuário: ${email}`);

    // 3. Tentar criar o usuário primeiro
    console.log(`[AdminCreateUser] Tentando criar usuário: ${email}`);
    const { data: createData, error: createError } = await supabaseClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata
    });

    if (createError) {
      // Se o erro for que o usuário já existe, vamos buscá-lo para retornar o ID
      if (createError.message.toLowerCase().includes("already") || createError.status === 422) {
        console.log(`[AdminCreateUser] Usuário já existe, buscando ID...`);
        
        // Listar usuários para encontrar o ID do existente
        // Paginamos se necessário, mas geralmente o usuário estará nas primeiras páginas
        const { data: { users }, error: listError } = await supabaseClient.auth.admin.listUsers();
        
        if (listError) {
          console.error("[AdminCreateUser] Erro ao listar usuários:", listError);
          throw createError; // Lança o erro original de criação se não conseguir listar
        }

        const existingUser = users?.find(u => u.email?.toLowerCase() === email.toLowerCase());

        if (existingUser) {
          console.log(`[AdminCreateUser] Usuário encontrado: ${existingUser.id}. Atualizando metadata...`);
          
          // Opcional: Atualizar metadata do usuário existente para garantir que ele tenha o company_id correto
          await supabaseClient.auth.admin.updateUserById(existingUser.id, {
            user_metadata: { ...existingUser.user_metadata, ...metadata }
          });

          return new Response(JSON.stringify({ user: existingUser, existing: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      console.error("[AdminCreateUser] Erro ao criar usuário:", createError);
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ user: createData.user, existing: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[AdminCreateUser] Erro fatal:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
