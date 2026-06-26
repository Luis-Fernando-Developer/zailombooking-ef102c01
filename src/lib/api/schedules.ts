import { supabase } from "@/lib/supabaseClient";

export type ScheduleStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "partially_approved"
  | "rejected"
  | "revision_requested";

export type EntryType = "T" | "F" | "A" | "FA" | "D";
export type EntryDecision = "pending" | "approved" | "rejected" | "revise";

export const ENTRY_TYPE_LABEL: Record<EntryType, string> = {
  T: "Trabalho",
  F: "Folga",
  A: "Ausência",
  FA: "Férias",
  D: "Desligado",
};

export const ENTRY_TYPE_COLOR: Record<EntryType, string> = {
  T: "bg-primary/15 text-primary border-primary/30",
  F: "bg-muted text-muted-foreground border-border",
  A: "bg-amber-500/15 text-amber-600 border-amber-500/30 dark:text-amber-400",
  FA: "bg-blue-500/15 text-blue-600 border-blue-500/30 dark:text-blue-400",
  D: "bg-destructive/15 text-destructive border-destructive/30",
};

export interface ScheduleTemplate {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  pattern_days: Array<{
    work: boolean;
    start?: string;
    end?: string;
    break_start?: string | null;
    break_end?: string | null;
  }>;
  cycle_length_days: number;
  created_at: string;
}

export interface ScheduleRow {
  id: string;
  tenant_id: string;
  name: string;
  period_start: string;
  period_end: string;
  status: ScheduleStatus;
  template_id: string | null;
  request_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ScheduleEntry {
  id: string;
  schedule_id: string;
  employee_id: string;
  entry_date: string;
  entry_type: EntryType;
  start_time: string | null;
  end_time: string | null;
  break_start: string | null;
  break_end: string | null;
  decision_status: EntryDecision;
  decided_by: string | null;
  decided_at: string | null;
  notes: string | null;
}

export interface CycleConfig {
  tenant_id: string;
  cycle_start_day: number;
  cycle_end_day: number;
}

// ---------- Templates ----------
export async function fetchTemplates(tenantId: string) {
  const { data, error } = await supabase
    .from("schedule_templates")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ScheduleTemplate[];
}

export async function saveTemplate(t: Partial<ScheduleTemplate> & { tenant_id: string; name: string }) {
  if (t.id) {
    const { error } = await supabase.from("schedule_templates").update({
      name: t.name,
      description: t.description ?? null,
      pattern_days: t.pattern_days ?? [],
      cycle_length_days: t.cycle_length_days ?? 7,
    }).eq("id", t.id);
    if (error) throw error;
    return t.id;
  }
  const { data, error } = await supabase.from("schedule_templates").insert({
    tenant_id: t.tenant_id,
    name: t.name,
    description: t.description ?? null,
    pattern_days: t.pattern_days ?? [],
    cycle_length_days: t.cycle_length_days ?? 7,
  }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

export async function deleteTemplate(id: string) {
  const { error } = await supabase.from("schedule_templates").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Cycle config ----------
export async function fetchCycleConfig(tenantId: string): Promise<CycleConfig> {
  const { data } = await supabase
    .from("schedule_cycles_config")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return (data as CycleConfig) ?? { tenant_id: tenantId, cycle_start_day: 1, cycle_end_day: 31 };
}

export async function saveCycleConfig(c: CycleConfig) {
  const { error } = await supabase.from("schedule_cycles_config").upsert(c, { onConflict: "tenant_id" });
  if (error) throw error;
}

// ---------- Schedules ----------
export async function fetchSchedules(tenantId: string) {
  const { data, error } = await supabase
    .from("schedules")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("period_start", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ScheduleRow[];
}

export async function fetchScheduleById(scheduleId: string, tenantId?: string) {
  let q = supabase
    .from("schedules")
    .select("*")
    .eq("id", scheduleId);

  if (tenantId) q = q.eq("tenant_id", tenantId);

  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return (data ?? null) as ScheduleRow | null;
}

export async function ensureScheduleRevisionRequested(scheduleId: string, tenantId: string) {
  const { data, error } = await supabase
    .from("schedules")
    .update({ status: "revision_requested" })
    .eq("id", scheduleId)
    .eq("tenant_id", tenantId)
    .eq("status", "pending_approval")
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as ScheduleRow | null;
}

export async function createSchedule(input: {
  tenant_id: string;
  name: string;
  period_start: string;
  period_end: string;
  template_id?: string | null;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.from("schedules").insert({
    tenant_id: input.tenant_id,
    name: input.name,
    period_start: input.period_start,
    period_end: input.period_end,
    template_id: input.template_id ?? null,
    status: "draft",
    created_by: user?.id ?? null,
  }).select("*").single();
  if (error) throw error;
  return data as ScheduleRow;
}

export async function deleteSchedule(id: string) {
  const { error } = await supabase.from("schedules").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Revoga uma escala publicada/aprovada, retornando-a ao estado de rascunho
 * para edição. Reseta a decisão das entradas para pending.
 */
export async function revokeSchedule(scheduleId: string, tenantId: string) {
  const { error: e1 } = await supabase
    .from("schedules")
    .update({ status: "draft" })
    .eq("id", scheduleId)
    .eq("tenant_id", tenantId);
  if (e1) throw e1;

  const { error: e2 } = await supabase
    .from("schedule_entries")
    .update({ decision_status: "pending", decided_by: null, decided_at: null })
    .eq("schedule_id", scheduleId);
  if (e2) throw e2;
}

export async function fetchScheduleEntries(scheduleId: string) {
  const { data, error } = await supabase
    .from("schedule_entries")
    .select("*")
    .eq("schedule_id", scheduleId)
    .order("entry_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ScheduleEntry[];
}

export async function upsertScheduleEntry(entry: Partial<ScheduleEntry> & { id: string }) {
  const { id, ...patch } = entry;
  const { error } = await supabase.from("schedule_entries").update(patch).eq("id", id);
  if (error) throw error;
}

export async function bulkUpdateEntries(ids: string[], patch: Partial<ScheduleEntry>) {
  if (!ids.length) return;
  const { error } = await supabase.from("schedule_entries").update(patch).in("id", ids);
  if (error) throw error;
}

// ---------- Edge functions ----------
export async function generateSchedule(input: {
  tenant_id: string; schedule_id: string; template_id?: string | null; employee_ids: string[]; append?: boolean;
}) {
  const { data, error } = await supabase.functions.invoke("schedule-generate", { body: input });
  if (error) throw error;
  return data;
}

export async function addEmployeesToSchedule(input: {
  tenant_id: string; schedule_id: string; template_id?: string | null; employee_ids: string[];
}) {
  return generateSchedule({ ...input, append: true });
}

export async function removeEmployeesFromSchedule(scheduleId: string, employeeIds: string[]) {
  if (!employeeIds.length) return;
  const { error } = await supabase
    .from("schedule_entries")
    .delete()
    .eq("schedule_id", scheduleId)
    .in("employee_id", employeeIds);
  if (error) throw error;
}

export async function submitSchedule(input: {
  tenant_id: string;
  schedule_id: string;
  target_mode: "levels_above" | "specific_users";
  target_user_ids?: string[];
  title?: string;
  description?: string;
}) {
  const { data, error } = await supabase.functions.invoke("schedule-submit", { body: input });
  if (error) {
    // supabase-js engole o body — tenta extrair a mensagem real
    let detail = "";
    try {
      const ctx = (error as any).context;
      if (ctx instanceof Response) {
        const body = await ctx.clone().json().catch(() => null);
        if (body) {
          detail = body.detail || body.error || JSON.stringify(body);
          if (body.status) detail += ` (status atual: ${body.status})`;
        }
      }
    } catch { /* noop */ }
    throw new Error(detail || (error as Error).message || "Erro desconhecido");
  }
  return data;
}

export async function approveSchedule(input: { tenant_id: string; schedule_id: string; reason?: string }) {
  const { data, error } = await supabase.functions.invoke("schedule-approve", { body: input });
  if (error) throw error;
  return data;
}

export async function rejectSchedule(input: { tenant_id: string; schedule_id: string; reason: string }) {
  const { data, error } = await supabase.functions.invoke("schedule-reject", { body: input });
  if (error) throw error;
  return data;
}

export async function requestScheduleRevision(input: { tenant_id: string; schedule_id: string; reason: string }) {
  const { data, error } = await supabase.functions.invoke("schedule-request-revision", { body: input });
  if (error) throw error;
  return data;
}

export async function listApproversAbove(companyId: string) {
  const { data, error } = await supabase.rpc("list_approvers_above", { _company_id: companyId });
  if (error) throw error;
  return (data ?? []) as Array<{
    user_id: string; employee_id: string; name: string;
    profile_code: string; profile_name: string; level: number;
  }>;
}

export async function listSchedulableEmployees(companyId: string) {
  const { data, error } = await supabase.rpc("list_schedulable_employees", { _company_id: companyId });
  if (error) throw error;
  return (data ?? []) as Array<{
    id: string; name: string; profile_code: string | null; profile_name: string | null; level: number;
  }>;
}

export const SCHEDULE_STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  pending_approval: "Aguardando aprovação",
  approved: "Aprovada",
  partially_approved: "Parcialmente aprovada",
  rejected: "Rejeitada",
  revision_requested: "Revisão solicitada",
};
