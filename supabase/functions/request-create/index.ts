// Deploy: supabase functions deploy request-create --no-verify-jwt
// Cria uma solicitação genérica (qualquer request_type) e registra audit log.
// Body: { tenant_id, request_type, request_payload, title, description?, priority?, due_date?, assigned_to? }

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace('Bearer ', '');
    if (!jwt) {
      return new Response(JSON.stringify({ error: 'missing_authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'invalid_token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const {
      tenant_id, request_type, request_payload = {}, title,
      description, priority = 'normal', due_date, assigned_to = [],
    } = body ?? {};

    if (!tenant_id || !request_type || !title) {
      return new Response(JSON.stringify({ error: 'tenant_id, request_type, title obrigatórios' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verifica vínculo do usuário ao tenant
    const { data: belongs } = await supabase.rpc('user_belongs_to_company', {
      _user_id: user.id, _company_id: tenant_id,
    });
    if (!belongs) {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: emp } = await supabase
      .from('employees').select('role').eq('user_id', user.id).eq('company_id', tenant_id).maybeSingle();
    const actor_role = emp?.role ?? 'owner';

    const { data: inserted, error: insErr } = await supabase
      .from('requests')
      .insert({
        tenant_id, request_type, request_payload, title, description,
        priority, due_date, assigned_to,
        created_by: user.id,
        status: 'pending',
        audit_metadata: { ip: req.headers.get('x-forwarded-for') ?? null },
      })
      .select('*').single();
    if (insErr) throw insErr;

    await supabase.from('request_audit_log').insert({
      request_id: inserted.id, tenant_id, actor_id: user.id, actor_role,
      action: 'created', new_values: inserted,
      ip: req.headers.get('x-forwarded-for') ?? null,
    });

    return new Response(JSON.stringify({ request: inserted }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('request-create error', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
