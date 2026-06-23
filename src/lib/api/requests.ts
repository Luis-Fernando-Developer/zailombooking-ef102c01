import { supabase } from "@/lib/supabaseClient";

export type RequestStatus =
  | "pending"
  | "in_review"
  | "approved"
  | "partially_approved"
  | "rejected"
  | "cancelled";

export type RequestType =
  | "schedule_change"
  | "absence_request"
  | "overtime_request"
  | "marketing_campaign"
  | string;

export interface SolicitacaoRow {
  id: string;
  tenant_id: string;
  request_type: RequestType;
  request_payload: any;
  title: string;
  description: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  due_date: string | null;
  status: RequestStatus;
  created_by: string;
  assigned_to: string[] | null;
  approved_by: string | null;
  rejected_by: string | null;
  revision_requested_by: string | null;
  approval_flow: any;
  audit_metadata: any;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface RequestComment {
  id: string;
  request_id: string;
  author_id: string;
  author_role: string | null;
  author_name?: string | null;
  author_profile?: string | null;
  message: string;
  created_at: string;
}

export interface RequestAudit {
  id: string;
  request_id: string;
  actor_id: string;
  actor_role: string | null;
  actor_name?: string | null;
  actor_profile?: string | null;
  action: string;
  old_values: any;
  new_values: any;
  created_at: string;
}

export interface ApprovalRule {
  id: string;
  tenant_id: string;
  request_type: string;
  approver_roles: string[];
  auto_apply: boolean;
}

const FINAL_STATUSES: RequestStatus[] = [
  "approved",
  "partially_approved",
  "rejected",
  "cancelled",
];

export const isFinal = (s: RequestStatus) => FINAL_STATUSES.includes(s);

export async function fetchRequests(
  tenantId: string,
  opts: { onlyOpen?: boolean } = {}
): Promise<SolicitacaoRow[]> {
  let q = supabase
    .from("requests")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (opts.onlyOpen) {
    q = q.in("status", ["pending", "in_review"]);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as SolicitacaoRow[];
}

export async function fetchComments(requestId: string): Promise<RequestComment[]> {
  const { data, error } = await supabase
    .from("request_comments")
    .select("*")
    .eq("request_id", requestId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as RequestComment[];
}

export async function fetchAudit(requestId: string): Promise<RequestAudit[]> {
  const { data, error } = await supabase
    .from("request_audit_log")
    .select("*")
    .eq("request_id", requestId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as RequestAudit[];
}

export async function fetchApprovalRules(tenantId: string): Promise<ApprovalRule[]> {
  const { data, error } = await supabase
    .from("request_approval_rules")
    .select("*")
    .eq("tenant_id", tenantId);
  if (error) throw error;
  return (data ?? []) as ApprovalRule[];
}

export async function upsertApprovalRule(rule: Partial<ApprovalRule> & { tenant_id: string; request_type: string }) {
  const { error } = await supabase
    .from("request_approval_rules")
    .upsert(rule, { onConflict: "tenant_id,request_type" });
  if (error) throw error;
}

// Edge function helpers
type CreateInput = {
  tenant_id: string;
  request_type: RequestType;
  title: string;
  description?: string;
  priority?: "low" | "normal" | "high" | "urgent";
  due_date?: string;
  assigned_to?: string[];
  request_payload?: any;
};

export async function createRequest(input: CreateInput) {
  const { data, error } = await supabase.functions.invoke("request-create", { body: input });
  if (error) throw error;
  return data;
}

type Decision = "approve" | "partial_approve" | "reject" | "request_revision" | "cancel";

export async function decideRequest(input: {
  request_id: string;
  decision: Decision;
  comment?: string;
  partial_decisions?: any;
}) {
  const { data, error } = await supabase.functions.invoke("request-decide", { body: input });
  if (error) throw error;
  return data;
}

export async function applyRequest(request_id: string) {
  const { data, error } = await supabase.functions.invoke("request-apply", { body: { request_id } });
  if (error) throw error;
  return data;
}

export async function addComment(request_id: string, message: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");
  const { error } = await supabase.from("request_comments").insert({
    request_id,
    author_id: user.id,
    message,
  });
  if (error) throw error;
}

export const REQUEST_TYPE_LABELS: Record<string, string> = {
  schedule_change: "Alteração de escala",
  absence_request: "Solicitação de ausência",
  overtime_request: "Hora extra",
  marketing_campaign: "Campanha de marketing",
};

export const STATUS_LABELS: Record<RequestStatus, string> = {
  pending: "Pendente",
  in_review: "Em revisão",
  approved: "Aprovada",
  partially_approved: "Parcialmente aprovada",
  rejected: "Rejeitada",
  cancelled: "Cancelada",
};

export const PRIORITY_LABELS: Record<string, string> = {
  low: "Baixa",
  normal: "Normal",
  high: "Alta",
  urgent: "Urgente",
};
