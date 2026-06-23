import { supabase } from "@/lib/supabaseClient";

export type MaterialType = 'banner' | 'imagem' | 'video' | 'gif' | 'documento' | 'outro';
export type MaterialStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected';
export type CampaignStatus =
  | 'draft' | 'pending_approval' | 'approved' | 'scheduled'
  | 'active' | 'ended' | 'cancelled' | 'rejected';

export interface MarketingMaterial {
  id: string;
  company_id: string;
  title: string;
  description: string | null;
  category: string | null;
  tags: string[];
  material_type: MaterialType;
  file_url: string | null;
  file_path: string | null;
  file_mime: string | null;
  file_size: number | null;
  status: MaterialStatus;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  approver_targets: string[];
  created_at: string;
  updated_at: string;
}

export interface MarketingCampaign {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  objective: string | null;
  status: CampaignStatus;
  start_at: string | null;
  end_at: string | null;
  placements: string[];
  audience_type: string;
  audience_filters: Record<string, unknown>;
  approver_targets: string[];
  approved_by: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  cancelled_reason: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MarketingApproval {
  id: string;
  company_id: string;
  target_type: 'material' | 'campaign';
  target_id: string;
  decision: 'approved' | 'rejected' | 'revision_requested';
  decided_by: string | null;
  decided_by_role: string | null;
  observation: string;
  created_at: string;
}

export interface MarketingHistoryRow {
  id: string;
  company_id: string;
  entity_type: string;
  entity_id: string | null;
  event: string;
  actor_id: string | null;
  actor_role: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

// ---------- MATERIAIS ----------
export async function listMaterials(companyId: string) {
  const { data, error } = await supabase
    .from('marketing_materials')
    .select('*')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as MarketingMaterial[];
}

export async function uploadMaterialFile(companyId: string, file: File) {
  const ext = file.name.split('.').pop() || 'bin';
  const path = `${companyId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from('marketing-assets')
    .upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw error;
  const { data } = supabase.storage.from('marketing-assets').getPublicUrl(path);
  return { path, url: data.publicUrl };
}

export async function createMaterial(
  input: Omit<Partial<MarketingMaterial>, 'id'> & { company_id: string; title: string; material_type: MaterialType }
) {
  const { data: userRes } = await supabase.auth.getUser();
  const payload = { ...input, created_by: userRes.user?.id ?? null };
  const { data, error } = await supabase
    .from('marketing_materials')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data as MarketingMaterial;
}

export async function updateMaterial(id: string, patch: Partial<MarketingMaterial>) {
  const { data, error } = await supabase
    .from('marketing_materials')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as MarketingMaterial;
}

export async function deleteMaterial(id: string) {
  const { error } = await supabase
    .from('marketing_materials')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function submitMaterialForApproval(id: string, approverTargets: string[]) {
  return updateMaterial(id, { status: 'pending_approval', approver_targets: approverTargets });
}

// ---------- CAMPANHAS ----------
export async function listCampaigns(companyId: string) {
  const { data, error } = await supabase
    .from('marketing_campaigns')
    .select('*')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as MarketingCampaign[];
}

export async function listPublishableCampaigns(companyId: string) {
  const { data, error } = await supabase
    .from('marketing_campaigns')
    .select('*')
    .eq('company_id', companyId)
    .in('status', ['approved', 'scheduled', 'active'])
    .is('deleted_at', null)
    .order('start_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as MarketingCampaign[];
}

export async function createCampaign(
  input: Omit<Partial<MarketingCampaign>, 'id'> & { company_id: string; name: string }
) {
  const { data: userRes } = await supabase.auth.getUser();
  const payload = { ...input, created_by: userRes.user?.id ?? null };
  const { data, error } = await supabase
    .from('marketing_campaigns')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data as MarketingCampaign;
}

export async function updateCampaign(id: string, patch: Partial<MarketingCampaign>) {
  const { data, error } = await supabase
    .from('marketing_campaigns')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as MarketingCampaign;
}

export async function setCampaignMaterials(
  campaignId: string,
  items: { material_id: string; role?: string; ordering?: number }[]
) {
  await supabase.from('marketing_campaign_materials').delete().eq('campaign_id', campaignId);
  if (items.length === 0) return;
  const rows = items.map((m) => ({ campaign_id: campaignId, ...m, role: m.role ?? '' }));
  const { error } = await supabase.from('marketing_campaign_materials').insert(rows);
  if (error) throw error;
}

export async function getCampaignMaterials(campaignId: string) {
  const { data, error } = await supabase
    .from('marketing_campaign_materials')
    .select('material_id, role, ordering, marketing_materials(*)')
    .eq('campaign_id', campaignId)
    .order('ordering');
  if (error) throw error;
  return data ?? [];
}

export async function submitCampaignForApproval(id: string, approverTargets: string[]) {
  return updateCampaign(id, { status: 'pending_approval', approver_targets: approverTargets });
}

export async function revokeCampaign(id: string, reason: string, userId: string) {
  return updateCampaign(id, {
    status: 'cancelled',
    cancelled_reason: reason,
    cancelled_by: userId,
    cancelled_at: new Date().toISOString(),
  });
}

// ---------- APROVAÇÕES ----------
export async function listPendingApprovals(companyId: string) {
  const [mat, camp] = await Promise.all([
    supabase.from('marketing_materials')
      .select('*').eq('company_id', companyId).eq('status', 'pending_approval'),
    supabase.from('marketing_campaigns')
      .select('*').eq('company_id', companyId).eq('status', 'pending_approval'),
  ]);
  if (mat.error) throw mat.error;
  if (camp.error) throw camp.error;
  return { materials: (mat.data ?? []) as MarketingMaterial[], campaigns: (camp.data ?? []) as MarketingCampaign[] };
}

export async function decideApproval(params: {
  companyId: string;
  targetType: 'material' | 'campaign';
  targetId: string;
  decision: 'approved' | 'rejected' | 'revision_requested';
  observation: string;
  role: string;
}) {
  const { data: userRes } = await supabase.auth.getUser();
  const userId = userRes.user?.id ?? null;

  const { error: errApp } = await supabase.from('marketing_approvals').insert({
    company_id: params.companyId,
    target_type: params.targetType,
    target_id: params.targetId,
    decision: params.decision,
    decided_by: userId,
    decided_by_role: params.role,
    observation: params.observation,
  });
  if (errApp) throw errApp;

  // Atualiza status da entidade
  const table = params.targetType === 'material' ? 'marketing_materials' : 'marketing_campaigns';
  let newStatus: string | null = null;
  if (params.decision === 'approved') newStatus = 'approved';
  else if (params.decision === 'rejected') newStatus = 'rejected';
  else newStatus = 'draft'; // revisão -> volta para rascunho

  const patch: Record<string, unknown> = { status: newStatus };
  if (params.decision === 'approved') {
    patch.approved_by = userId;
    patch.approved_at = new Date().toISOString();
  } else if (params.decision === 'rejected') {
    patch.rejected_reason = params.observation;
  }
  const { error: errUpd } = await supabase.from(table).update(patch).eq('id', params.targetId);
  if (errUpd) throw errUpd;
}

// ---------- HISTÓRICO ----------
export async function listHistory(companyId: string, limit = 200) {
  const { data, error } = await supabase
    .from('marketing_history')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as MarketingHistoryRow[];
}
