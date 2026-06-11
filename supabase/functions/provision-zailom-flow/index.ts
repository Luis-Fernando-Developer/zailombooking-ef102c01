import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { email, password, slug, display_name, company_id, plan_id } = await req.json();

    if (!email || !password || !slug || !company_id) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Define limits based on plan
    let limits = {
      max_chatbots: 1,
      max_messages: 700,
      max_integrations: 1,
    };

    if (plan_id === "professional") {
      limits = {
        max_chatbots: 3,
        max_messages: 5000,
        max_integrations: 3,
      };
    } else if (plan_id === "enterprise") {
      limits = {
        max_chatbots: 999999,
        max_messages: 999999,
        max_integrations: 999999,
      };
    }

    const EMBED_SHARED_SECRET = Deno.env.get("EMBED_SHARED_SECRET") || "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    const FLOW_BASE_URL = "https://flow-builder.zailom.com";

    console.log(`Provisioning Zailom Flow for ${email} (${slug}) with plan ${plan_id}`);

    const response = await fetch(`${FLOW_BASE_URL}/functions/v1/provision-account`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${EMBED_SHARED_SECRET}`,
      },
      body: JSON.stringify({
        email,
        password,
        slug,
        display_name,
        company_id,
        embed_source: "booking",
        embed_plan_tier: plan_id,
        limits,
      }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      console.error("Zailom Flow provisioning failed:", result);
      return new Response(JSON.stringify({ success: false, error: result.error || "Flow provision error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Save provision data in Booking DB
    const { error: dbError } = await supabaseClient
      .from("chatbot_integration")
      .upsert({
        company_id,
        api_key_prefix: result.api_key.substring(0, 8),
        builder_workspace_slug: slug,
        builder_base_url: FLOW_BASE_URL,
        is_active: true,
        talkmap_provisioned: true,
        talkmap_provisioned_at: new Date().toISOString(),
        flow_workspace_id: result.workspace_id,
        flow_api_key: result.api_key,
        flow_user_id: result.user_id,
      }, { onConflict: 'company_id' });

    if (dbError) {
      console.error("Error saving integration data:", dbError);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      workspace_id: result.workspace_id,
      api_key: result.api_key,
      user_id: result.user_id 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Provisioning error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
